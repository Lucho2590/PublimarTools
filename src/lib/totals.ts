import { redondearTotal } from "@/lib/utils";

/**
 * Tipo de descuento: porcentaje o monto fijo en pesos.
 * Los documentos viejos no tienen este campo: `undefined` se interpreta
 * siempre como "percent", que es como se guardaban antes.
 */
export type TDiscountType = "percent" | "amount";

/** Forma mínima que necesita una línea para calcular su importe. */
export interface TDiscountableItem {
  quantity: number;
  unitPrice: number;
  /** Descuento de la línea: % si discountType es "percent", $ si es "amount". */
  discount?: number;
  discountType?: TDiscountType;
}

export const DEFAULT_TAX_RATE = 21;

/** Importe de la línea sin descuento: cantidad × precio unitario. */
export const calcItemGross = (item: TDiscountableItem): number =>
  redondearTotal(Number(item.quantity || 0) * Number(item.unitPrice || 0));

/**
 * Descuento de la línea en $. El monto fijo se aplica sobre el total de la
 * línea (no por unidad) y nunca puede superar el bruto.
 */
export const calcItemDiscountAmount = (item: TDiscountableItem): number => {
  const gross = calcItemGross(item);
  const value = Number(item.discount || 0);
  if (!value || value <= 0 || gross <= 0) return 0;
  const raw =
    item.discountType === "amount" ? value : gross * (value / 100);
  return redondearTotal(Math.min(Math.max(raw, 0), gross));
};

/** Importe neto de la línea: bruto − descuento de la línea. */
export const calcItemNet = (item: TDiscountableItem): number =>
  redondearTotal(calcItemGross(item) - calcItemDiscountAmount(item));

/**
 * Reconstruye el descuento de una línea vieja a partir del importe guardado.
 *
 * Antes del descuento por ítem, algunas líneas (los ítems manuales de ventas)
 * guardaban el neto en `total`/`subtotal` y descartaban el %. Si al abrir el
 * documento recalculáramos desde cantidad × precio, el total subiría solo.
 * Se rearma como monto fijo para que quede visible y editable sin cambiar nada.
 */
export const normalizeItemDiscount = <T extends TDiscountableItem>(
  item: T,
  storedNet: number | null | undefined,
): T => {
  if (Number(item.discount || 0) > 0) return item;
  if (typeof storedNet !== "number" || isNaN(storedNet)) return item;
  const gross = calcItemGross(item);
  const diff = redondearTotal(gross - storedNet);
  // Sólo descuentos: si el guardado es mayor al bruto, no es expresable.
  if (diff <= 0.01) return item;
  return { ...item, discount: diff, discountType: "amount" as TDiscountType };
};

/**
 * Igual que {@link normalizeItemDiscount} pero devuelve sólo el par de campos
 * del descuento, para no pisar el resto de la línea con un spread.
 */
export const resolveItemDiscount = (
  item: TDiscountableItem,
  storedNet: number | null | undefined,
): { discount: number; discountType: TDiscountType } => {
  const normalized = normalizeItemDiscount(item, storedNet);
  return {
    discount: Number(normalized.discount || 0),
    discountType: normalized.discountType || "percent",
  };
};

/** Texto corto del descuento de línea, para badges y celdas de PDF. */
export const formatItemDiscount = (item: TDiscountableItem): string => {
  const value = Number(item.discount || 0);
  if (!value || value <= 0) return "";
  return item.discountType === "amount"
    ? `$${new Intl.NumberFormat("es-AR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value)}`
    : `${value}%`;
};

export interface TDocumentTotalsInput {
  items: TDiscountableItem[];
  /** Si los precios son finales y hay que desglosar el IVA hacia atrás. */
  applyIVA?: boolean;
  taxRate?: number;
  /** Descuento general de cabecera en %. */
  discountPercentage?: number;
  /** Descuento general de cabecera en $. */
  manualDiscount?: number;
}

export interface TDocumentTotals {
  /** Suma de las líneas sin descuento de ítem. */
  grossSubtotal: number;
  /** Suma de los descuentos por ítem. */
  itemsDiscountAmount: number;
  /** Suma de las líneas ya descontadas. Es el `subtotal` que se persiste. */
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  /** Subtotal neto de IVA (igual al subtotal cuando no se desglosa). */
  subtotalSinIVA: number;
  /** Importe del descuento general en % (base: subtotal neto de IVA). */
  generalDiscountAmount: number;
  manualDiscount: number;
  total: number;
}

/**
 * Cálculo canónico de totales de un presupuesto / orden / venta.
 *
 * Los descuentos se aplican **en cascada**: primero el de cada ítem (queda
 * dentro del `subtotal`), y después el general sobre ese subtotal ya
 * descontado. El % general se calcula sobre el neto sin IVA, igual que en
 * el alta de presupuestos/órdenes/ventas.
 */
export const calcDocumentTotals = ({
  items,
  applyIVA = false,
  taxRate = DEFAULT_TAX_RATE,
  discountPercentage = 0,
  manualDiscount = 0,
}: TDocumentTotalsInput): TDocumentTotals => {
  const list = items || [];
  const grossSubtotal = redondearTotal(
    list.reduce((sum, item) => sum + calcItemGross(item), 0),
  );
  const itemsDiscountAmount = redondearTotal(
    list.reduce((sum, item) => sum + calcItemDiscountAmount(item), 0),
  );
  const subtotal = redondearTotal(grossSubtotal - itemsDiscountAmount);

  let taxAmount = 0;
  let subtotalSinIVA = subtotal;
  if (applyIVA) {
    // Los precios son finales: el IVA ya está incluido y se desglosa hacia atrás.
    taxAmount = redondearTotal(subtotal * (taxRate / (100 + taxRate)));
    subtotalSinIVA = redondearTotal(subtotal - taxAmount);
  }

  const generalDiscountAmount = redondearTotal(
    subtotalSinIVA * (Number(discountPercentage || 0) / 100),
  );
  const fixedDiscount = Number(manualDiscount || 0);
  const total = Math.max(
    0,
    redondearTotal(subtotal - generalDiscountAmount - fixedDiscount),
  );

  return {
    grossSubtotal,
    itemsDiscountAmount,
    subtotal,
    taxRate,
    taxAmount,
    subtotalSinIVA,
    generalDiscountAmount,
    manualDiscount: fixedDiscount,
    total,
  };
};
