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

type LogEventFn = (entry: TAuditInput) => Promise<unknown>;

/**
 * Persiste una venta replicando exactamente el flujo de "nueva venta":
 *  1. Crea el documento en `sales`.
 *  2. Registra un movimiento de ingreso por cada forma de pago con cuenta.
 *  3. Descuenta el stock de cada item no manual.
 *  4. Registra los eventos de auditoría de stock y de la venta.
 *
 * Devuelve el id del documento de venta creado.
 */
export async function createSale(
  firestore: Firestore,
  logEvent: LogEventFn,
  userRole: string,
  input: CreateSaleInput,
): Promise<string> {
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

  // Agrupamos los renglones por producto para hacer UN solo updateDoc por
  // documento. Si no, dos variantes del mismo producto (o la misma variante
  // repetida) generarían writes concurrentes que reescriben el array `variants`
  // completo desde el snapshot original y se pisan entre sí (last-write-wins),
  // perdiendo uno de los descuentos.
  const byProduct = new Map<string, { product: TProduct; lines: SaleLineItem[] }>();
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

      const newVariants = product.variants.map((v) =>
        qtyByVariant.has(v.id) && variantDiscountsStock(v)
          ? { ...v, stock: Number(v.stock) - (qtyByVariant.get(v.id) ?? 0) }
          : v,
      );

      await updateDoc(productRef, {
        variants: newVariants,
        salesCount: increment(lines.length),
        lastSaleDate: new Date(),
      });

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

  return saleDocRef.id;
}
