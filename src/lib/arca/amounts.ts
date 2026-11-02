// Cálculos puros de facturación ARCA, compartidos por el diálogo (preview) y
// el servidor (validación al emitir). Sin dependencias de Node ni Firestore.

import type { TArcaItem } from "@/types/arca";
import type { TFactura, TPaymentHistory } from "@/types/order";
import { EPaymentMethod } from "@/types/sale";
import { calcItemNet } from "@/lib/totals";
import { IVA_21 } from "./constants";

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Separa neto e IVA de un monto final (IVA incluido). El IVA sale por
 * diferencia para que ImpTotal = ImpNeto + ImpIVA sea exacto: ARCA rechaza
 * el comprobante si no cierra al centavo.
 */
export function splitIva(total: number, rate: number = IVA_21.rate) {
  const t = round2(total);
  const neto = round2(t / (1 + rate / 100));
  return { neto, iva: round2(t - neto), total: t };
}

// --------------------------------------------------------------------------
// Pagos de la orden
// --------------------------------------------------------------------------

/** Clave de la seña legacy (`order.downPayment`), que no vive en paymentHistory. */
export const DOWN_PAYMENT_KEY = "downPayment";

/**
 * Clave estable de un pago. Los pagos nuevos tienen `id`; la seña cargada al
 * crear la orden no, así que se identifica por su posición (el servidor le
 * asigna un id al facturarla).
 */
export function paymentKey(payment: TPaymentHistory, index: number): string {
  return payment.id || `idx:${index}`;
}

export type TInvoiceablePayment = {
  key: string;
  amount: number;
  date?: unknown;
  type: string;
  method: EPaymentMethod | string;
  notes?: string;
  arcaInvoiceId?: string | null;
};

/** Pagos de una orden que se pueden facturar (sin las notas de crédito internas). */
type TPaymentsSource = {
  downPayment?: number;
  downPaymentArcaInvoiceId?: string | null;
  paymentMethod?: EPaymentMethod | string;
  createdAt?: unknown;
  paymentHistory?: TPaymentHistory[];
};

export function listInvoiceablePayments(doc: Record<string, unknown>): TInvoiceablePayment[] {
  const order = doc as TPaymentsSource;
  const list: TInvoiceablePayment[] = [];
  if (order.downPayment && Number(order.downPayment) > 0) {
    list.push({
      key: DOWN_PAYMENT_KEY,
      amount: Number(order.downPayment),
      date: order.createdAt,
      type: "seña",
      method: order.paymentMethod || EPaymentMethod.CASH,
      notes: "Seña/Anticipo",
      arcaInvoiceId: order.downPaymentArcaInvoiceId ?? null,
    });
  }
  (order.paymentHistory || []).forEach((p, index) => {
    if (p.type === "credit_note" || p.method === EPaymentMethod.CREDIT_NOTE) return;
    list.push({
      key: paymentKey(p, index),
      amount: Number(p.amount) || 0,
      date: p.date,
      type: p.type,
      method: p.method,
      notes: p.notes,
      arcaInvoiceId: p.arcaInvoiceId ?? null,
    });
  });
  return list;
}

// --------------------------------------------------------------------------
// Lo facturado de un documento
// --------------------------------------------------------------------------

/**
 * Neto facturado: facturas (ARCA o cargadas a mano con monto) menos notas de
 * crédito. Las facturas manuales sin monto no se pueden contar.
 */
export function invoicedNet(facturas: TFactura[] | undefined | null): number {
  return round2(
    (facturas || []).reduce((sum, f) => {
      const monto = Number(f.monto) || 0;
      return f.kind === "nc" ? sum - monto : sum + monto;
    }, 0),
  );
}

export function pendingToInvoice(total: number, facturas: TFactura[] | undefined | null): number {
  return Math.max(0, round2(Number(total || 0) - invoicedNet(facturas)));
}

// --------------------------------------------------------------------------
// Ítems del comprobante
// --------------------------------------------------------------------------

type TSourceLine = {
  productName?: string;
  variantName?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  discount?: number;
  discountType?: "percent" | "amount";
};

function lineDescription(line: TSourceLine): string {
  const name = [line.productName, line.variantName].filter(Boolean).join(" - ");
  return (name || line.description || "Ítem").trim();
}

/**
 * Detalle de ítems para facturar el total del documento. WSFEv1 no recibe
 * ítems (solo totales): el detalle es para el PDF, así que se agrega una
 * línea de bonificación si los descuentos generales hacen que no cierre.
 */
export function buildTotalItems(lines: TSourceLine[], total: number): TArcaItem[] {
  const items: TArcaItem[] = (lines || [])
    .filter((l) => Number(l.quantity) > 0)
    .map((l) => {
      const subtotal = round2(calcItemNet({
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
        discount: l.discount,
        discountType: l.discountType,
      }));
      const cantidad = Number(l.quantity) || 0;
      return {
        descripcion: lineDescription(l),
        cantidad,
        precioUnitario: cantidad ? round2(subtotal / cantidad) : subtotal,
        subtotal,
      };
    });
  const diff = round2(total - items.reduce((s, i) => s + i.subtotal, 0));
  if (Math.abs(diff) >= 0.01) {
    items.push({
      descripcion: diff < 0 ? "Bonificación" : "Ajuste",
      cantidad: 1,
      precioUnitario: diff,
      subtotal: diff,
    });
  }
  return items;
}

/** Una sola línea (pagos, saldo o monto libre). */
export function buildSingleItem(descripcion: string, monto: number): TArcaItem[] {
  const m = round2(monto);
  return [{ descripcion: descripcion.trim() || "Pago a cuenta", cantidad: 1, precioUnitario: m, subtotal: m }];
}

/** Resumen corto de los ítems de una orden para la línea "Pago a cuenta". */
export function summarizeLines(lines: TSourceLine[], max = 3): string {
  const names = (lines || []).map(lineDescription).filter(Boolean);
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} y ${names.length - max} más`;
}
