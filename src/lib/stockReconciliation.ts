import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import collections from "@/lib/collections";
import { variantDiscountsStock } from "@/lib/stock";
import {
  describeStockChange,
  generateCorrelationId,
  TAuditInput,
} from "@/lib/auditLog";
import {
  EAuditAction,
  EAuditEntityType,
  EAuditSection,
} from "@/types/auditLog";

/** Un descuento de stock que quedó pendiente por una venta que abortó a mitad. */
export interface PendingStockFix {
  saleId: string;
  saleNumber: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  quantity: number;
}

export interface StockFixResult {
  /** Renglones efectivamente descontados. */
  applied: number;
  /** Renglones que no se pudieron tocar, con el motivo. */
  skipped: string[];
}

type LogEventFn = (entry: TAuditInput) => Promise<unknown>;

/**
 * Aplica los descuentos de stock que una venta rota nunca llegó a hacer y deja
 * el `stock_change` correspondiente para que quede el rastro.
 *
 * Relee cada producto con `getDoc` en vez de confiar en el snapshot del
 * reporte: entre que se cargó la pantalla y se aprieta el botón el stock pudo
 * cambiar, y descontar sobre un valor viejo lo dejaría peor que antes.
 *
 * Antes de tocar nada revalida contra `auditLog` que el renglón siga sin
 * movimiento, así que apretar dos veces no descuenta dos veces.
 */
export async function applyStockFixes(
  firestore: Firestore,
  logEvent: LogEventFn,
  fixes: PendingStockFix[],
): Promise<StockFixResult> {
  const skipped: string[] = [];
  let applied = 0;

  const label = (f: PendingStockFix) =>
    `${f.productName}${f.variantName ? ` · ${f.variantName}` : ""}`;

  // Revalidación anti doble-descuento: si ya existe un stock_change de esa
  // venta para esa variante, el renglón ya se corrigió (o descontó bien).
  // Una sola consulta por venta — igualdad simple sobre un campo anidado, que
  // Firestore resuelve con el índice automático, sin necesitar uno compuesto.
  const yaMovidos = new Map<string, Set<string>>();
  for (const saleId of Array.from(new Set(fixes.map((f) => f.saleId)))) {
    const snap = await getDocs(
      query(
        collection(firestore, collections.AUDIT_LOG),
        where("metadata.saleId", "==", saleId),
      ),
    );
    const set = new Set<string>();
    snap.docs.forEach((d) => {
      const v = d.data() as any;
      if (v.action !== EAuditAction.STOCK_CHANGE) return;
      const m = v.metadata || {};
      set.add(`${m.productId}:${m.variantId}`);
    });
    yaMovidos.set(saleId, set);
  }

  const pendientes: PendingStockFix[] = [];
  for (const f of fixes) {
    if (yaMovidos.get(f.saleId)?.has(`${f.productId}:${f.variantId}`)) {
      skipped.push(`${label(f)}: ya tenía movimiento de stock`);
      continue;
    }
    pendientes.push(f);
  }

  // Un solo write por producto: dos renglones del mismo documento se pisarían.
  const byProduct = new Map<string, PendingStockFix[]>();
  for (const f of pendientes) {
    if (!byProduct.has(f.productId)) byProduct.set(f.productId, []);
    byProduct.get(f.productId)!.push(f);
  }

  for (const [productId, lines] of Array.from(byProduct.entries())) {
    const productRef = doc(firestore, collections.PRODUCTS, productId);
    const snap = await getDoc(productRef);

    if (!snap.exists()) {
      lines.forEach((l) => skipped.push(`${label(l)}: el producto ya no existe`));
      continue;
    }

    const variants = [...((snap.data().variants ?? []) as any[])];
    const eventos: TAuditInput[] = [];
    const correlationId = generateCorrelationId();

    for (const l of lines) {
      const idx = variants.findIndex((v) => v.id === l.variantId);
      if (idx === -1) {
        skipped.push(`${label(l)}: la variante ya no existe`);
        continue;
      }
      if (!variantDiscountsStock(variants[idx])) {
        skipped.push(`${label(l)}: la variante no descuenta stock`);
        continue;
      }

      const stockBefore = Number(variants[idx].stock) || 0;
      const stockAfter = stockBefore - l.quantity;
      variants[idx] = { ...variants[idx], stock: stockAfter };

      eventos.push({
        section: EAuditSection.BANDERAS_STOCK,
        entityType: EAuditEntityType.PRODUCT_VARIANT,
        entityId: `${productId}:${l.variantId}`,
        entityLabel: label(l),
        action: EAuditAction.STOCK_CHANGE,
        description: describeStockChange(
          l.productName,
          l.variantName,
          -l.quantity,
          "fix_missing_discount",
        ),
        metadata: {
          reason: "fix_missing_discount",
          saleId: l.saleId,
          saleNumber: l.saleNumber,
          productId,
          productName: l.productName,
          variantId: l.variantId,
          variantName: l.variantName,
          stockBefore,
          stockAfter,
          delta: -l.quantity,
        },
        correlationId,
      });
    }

    if (eventos.length === 0) continue;

    await updateDoc(productRef, { variants });
    await Promise.all(eventos.map((e) => logEvent(e)));
    applied += eventos.length;
  }

  return { applied, skipped };
}

/**
 * Escribe el evento `create` que el alta fallida de la venta nunca llegó a
 * dejar. Sin esto la venta seguiría figurando como "a medias" para siempre,
 * aunque el stock ya esté corregido.
 *
 * Queda marcado como reconstruido: el evento se escribe hoy, no en la fecha
 * original de la venta.
 */
export async function backfillSaleCreateEvent(
  logEvent: LogEventFn,
  sale: { id: string; number: string; total: number; clientName?: string },
): Promise<void> {
  await logEvent({
    section: EAuditSection.BANDERAS_VENTAS,
    entityType: EAuditEntityType.SALE,
    entityId: sale.id,
    entityLabel: sale.number,
    action: EAuditAction.CREATE,
    description: `Auditoría reconstruida de la venta ${sale.number} por $${Math.round(
      sale.total,
    ).toLocaleString("es-AR")}: el alta original falló y no dejó registro`,
    metadata: {
      reason: "audit_backfill",
      total: sale.total,
      clientName: sale.clientName ?? null,
    },
  });
}
