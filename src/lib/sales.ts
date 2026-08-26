import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import collections from "@/lib/collections";
import { TProduct, TProductVariant } from "@/types/product";
import { TSaleFormaPago } from "@/types/sale";
import { TAccount } from "@/types/account";
import { registerAccountMovement } from "@/lib/accountMovements";
import { EMovementType } from "@/types/accountMovement";
import { redondearTotal } from "@/lib/utils";
import type { TDiscountType } from "@/lib/totals";
import { variantDiscountsStock } from "@/lib/stock";
import {
  buildChanges,
  describeSaleCreate,
  describeStockChange,
  generateCorrelationId,
  TAuditInput,
} from "@/lib/auditLog";
import {
  EAuditAction,
  EAuditEntityType,
  EAuditSection,
} from "@/types/auditLog";

/**
 * Renglón de venta con la referencia completa al producto/variante, necesaria
 * para descontar stock al finalizar la venta.
 */
export interface SaleLineItem {
  product: TProduct;
  variant: TProductVariant;
  quantity: number;
  unitPrice: number;
  /** Descuento de la línea: % o $ según `discountType` (default: %). */
  discount?: number;
  discountType?: TDiscountType;
  /** Importe de la línea ya descontado. */
  total: number;
}

/** Renglón ya rehidratado contra el catálogo. */
export interface HydratedLine {
  product: TProduct;
  variant: TProductVariant;
  /** false si el renglón no mueve stock: es manual o salió del catálogo. */
  tracksStock: boolean;
}

/**
 * Presupuestos y órdenes guardan un snapshot recortado del producto — sin el
 * array `variants` — así que no alcanza para recalcular stock: usarlo tal cual
 * hace que `createSale` no pueda descontar nada. Esta función lo cambia por el
 * producto vivo del catálogo.
 *
 * Si el producto o la variante ya no existen (borrados, o la variante cambió de
 * id), devuelve una forma "manual" con el id prefijado `manual-` para que
 * `createSale` la saltee, en vez de romper la venta entera.
 */
export function hydrateLineFromCatalog(
  catalog: TProduct[],
  ref: {
    productId?: string | null;
    variantId?: string | null;
    productName?: string | null;
    variantName?: string | null;
    description?: string | null;
    unitPrice?: number;
    isManual?: boolean;
  },
): HydratedLine {
  const productId = ref.productId ?? "";
  const variantId = ref.variantId ?? "";
  const isManual = !!ref.isManual || !productId || productId.startsWith("manual-");

  if (!isManual) {
    const product = catalog.find((p) => p.id === productId);
    const variant = product?.variants?.find((v) => v.id === variantId);
    if (product && variant) return { product, variant, tracksStock: true };
  }

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    product: {
      id: productId.startsWith("manual-") ? productId : `manual-${productId || stamp}`,
      name: ref.productName ?? "",
      description: ref.description ?? "",
      variants: [],
      hasVariants: false,
      stock: 0,
      price: ref.unitPrice ?? 0,
    } as unknown as TProduct,
    variant: {
      id: variantId || `manual-variant-${stamp}`,
      size: ref.variantName ?? "N/A",
      price: ref.unitPrice ?? 0,
      stock: 0,
    } as unknown as TProductVariant,
    tracksStock: false,
  };
}

export interface CreateSaleInput {
  /** Payload de la venta ya armado (SIN createdAt/updatedAt). */
  saleData: Record<string, any>;
  /** Items con product+variant para descontar stock. */
  items: SaleLineItem[];
  /** Formas de pago normalizadas (sólo las que tienen monto > 0). */
  formasPagoValidas: TSaleFormaPago[];
  /** Todas las cuentas (para describir el movimiento con el nombre de la cuenta). */
  allAccounts: TAccount[];
  /** Nombre del cliente, para la descripción del movimiento. */
  clienteInput?: string;
  /** Total de la venta (para la descripción de auditoría). */
  total: number;
}

export interface CreateSaleResult {
  /** Id del documento creado en `sales`. */
  saleId: string;
  /**
   * Presente cuando la venta se guardó pero el stock no se pudo descontar.
   * El llamador debe avisarlo como advertencia: la venta YA existe, tratarlo
   * como un error a secas hace que se cargue dos veces.
   */
  stockWarning?: string;
}

type LogEventFn = (entry: TAuditInput) => Promise<unknown>;

/**
 * Persiste una venta replicando exactamente el flujo de "nueva venta":
 *  1. Crea el documento en `sales`.
 *  2. Registra un movimiento de ingreso por cada forma de pago con cuenta.
 *  3. Descuenta el stock de cada item no manual.
 *  4. Registra los eventos de auditoría de stock y de la venta.
 *
 * El paso 3 es best-effort a propósito: para cuando corre, la venta y los
 * movimientos de cuenta ya están escritos, así que abortar dejaría la venta
 * creada sin auditoría ni descuento (y sin que nadie se entere). Si algo falla
 * se devuelve `stockWarning` y la venta igual queda registrada y auditada.
 */
export async function createSale(
  firestore: Firestore,
  logEvent: LogEventFn,
  userRole: string,
  input: CreateSaleInput,
): Promise<CreateSaleResult> {
  const { saleData, items, formasPagoValidas, allAccounts, clienteInput, total } =
    input;

  const salesCollection = collection(firestore, collections.SALES);
  const saleDocRef = await addDoc(salesCollection, {
    ...saleData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const correlationId = generateCorrelationId();
  const saleNumber = saleData.number as string;

  // Registrar un movimiento de ingreso por cada forma de pago con cuenta
  await Promise.all(
    formasPagoValidas
      .filter((fp) => !!fp.accountId)
      .map(async (fp) => {
        try {
          const acc = allAccounts.find((a) => a.id === fp.accountId);
          await registerAccountMovement(firestore, {
            accountId: fp.accountId as string,
            type: EMovementType.INCOME,
            amount: redondearTotal(fp.amount),
            description: `Venta #${saleNumber}${
              clienteInput ? ` - ${clienteInput}` : ""
            } (${fp.method}${acc ? ` → ${acc.name}` : ""})`,
            date: new Date(),
            sourceType: "sale",
            sourceId: saleDocRef.id,
            createdBy: userRole || "",
          });
        } catch (err) {
          console.error("Error al registrar movimiento de cuenta:", err);
        }
      }),
  );

  const stockEventPayloads: Array<{
    productId: string;
    productName: string;
    variantId: string;
    variantName: string;
    stockBefore: number;
    stockAfter: number;
    delta: number;
  }> = [];
  /** Motivos por los que algún renglón no pudo descontar stock. */
  const stockIssues: string[] = [];

  try {
    // Agrupamos los renglones por producto para hacer UN solo updateDoc por
    // documento. Si no, dos variantes del mismo producto (o la misma variante
    // repetida) generarían writes concurrentes que reescriben el array `variants`
    // completo desde el snapshot original y se pisan entre sí (last-write-wins),
    // perdiendo uno de los descuentos.
    const byProduct = new Map<
      string,
      { product: TProduct; lines: SaleLineItem[] }
    >();
    for (const item of items) {
      if (item.product.id.startsWith("manual-")) continue;
      const entry = byProduct.get(item.product.id) ?? {
        product: item.product,
        lines: [],
      };
      entry.lines.push(item);
      byProduct.set(item.product.id, entry);
    }

    await Promise.all(
      Array.from(byProduct.values()).map(async ({ product, lines }) => {
        const productRef = doc(firestore, collections.PRODUCTS, product.id);

        // Cantidad total a descontar por variante (acumula variantes repetidas).
        const qtyByVariant = new Map<string, number>();
        for (const l of lines) {
          qtyByVariant.set(
            l.variant.id,
            (qtyByVariant.get(l.variant.id) ?? 0) + l.quantity,
          );
        }

        // Sin el array de variantes no hay forma de recalcular el stock, y
        // escribir `variants: []` borraría las variantes reales del producto.
        // Pasa cuando el renglón viene de un snapshot recortado (ej: un
        // presupuesto), así que se avisa en vez de romper la venta entera.
        const existingVariants = Array.isArray(product.variants)
          ? product.variants
          : null;

        const newVariants = existingVariants?.map((v) =>
          qtyByVariant.has(v.id) && variantDiscountsStock(v)
            ? { ...v, stock: Number(v.stock) - (qtyByVariant.get(v.id) ?? 0) }
            : v,
        );

        await updateDoc(productRef, {
          ...(newVariants ? { variants: newVariants } : {}),
          salesCount: increment(lines.length),
          lastSaleDate: new Date(),
        });

        if (!existingVariants) {
          stockIssues.push(product.name);
          return;
        }

        for (const l of lines) {
          // Sin descuento de stock no hay cambio que auditar.
          if (!variantDiscountsStock(l.variant)) continue;
          const stockBefore = Number(l.variant.stock ?? 0);
          stockEventPayloads.push({
            productId: product.id,
            productName: l.product.name,
            variantId: l.variant.id,
            variantName: l.variant.size,
            stockBefore,
            stockAfter: stockBefore - l.quantity,
            delta: -l.quantity,
          });
        }
      }),
    );

    await Promise.all(
      stockEventPayloads.map((p) =>
        logEvent({
          section: EAuditSection.BANDERAS_STOCK,
          entityType: EAuditEntityType.PRODUCT_VARIANT,
          entityId: `${p.productId}:${p.variantId}`,
          entityLabel: `${p.productName}${
            p.variantName ? ` · ${p.variantName}` : ""
          }`,
          action: EAuditAction.STOCK_CHANGE,
          description: describeStockChange(
            p.productName,
            p.variantName,
            p.delta,
            "sale",
          ),
          metadata: {
            reason: "sale",
            saleId: saleDocRef.id,
            saleNumber,
            productId: p.productId,
            productName: p.productName,
            variantId: p.variantId,
            variantName: p.variantName,
            stockBefore: p.stockBefore,
            stockAfter: p.stockAfter,
            delta: p.delta,
          },
          correlationId,
        }),
      ),
    );
  } catch (err) {
    console.error("Error al descontar stock de la venta:", err);
    stockIssues.push("error inesperado al actualizar el inventario");
  }

  const stockWarning = stockIssues.length
    ? `La venta se registró, pero el stock no se descontó (${stockIssues.join(
        ", ",
      )}). Ajustalo a mano desde Productos.`
    : undefined;

  await logEvent({
    section: EAuditSection.BANDERAS_VENTAS,
    entityType: EAuditEntityType.SALE,
    entityId: saleDocRef.id,
    entityLabel: saleNumber,
    action: EAuditAction.CREATE,
    description: describeSaleCreate(saleNumber, total),
    changes: buildChanges(null, saleData, [
      "number",
      "clientId",
      "clientName",
      "total",
      "subtotal",
      "paymentMethod",
      "bank",
      "isInvoiced",
      "invoiceNumber",
      "discountPercentage",
      "applyIVA",
    ]),
    metadata: {
      total,
      paymentMethod: saleData.paymentMethod,
      formasPago: formasPagoValidas,
      itemsCount: items.length,
      stockDeltas: stockEventPayloads.map((p) => ({
        productId: p.productId,
        variantId: p.variantId,
        productName: p.productName,
        variantName: p.variantName,
        delta: p.delta,
      })),
    },
    correlationId,
  });

  return { saleId: saleDocRef.id, stockWarning };
}
