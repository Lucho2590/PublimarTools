import { TClient } from "./client";
import { EAccountType } from "./account";

export enum EPaymentMethod {
  CASH = "cash",
  CREDIT_CARD = "credit_card",
  DEBIT_CARD = "debit_card",
  TRANSFER = "transfer",
  MERCADOPAGO = "mercadopago",
  CHECK = "cheque",
  CREDIT_NOTE = "credit_note",
}

/**
 * Tipos de cuenta permitidos como destino para cada forma de pago.
 * `[]` significa sin restricción.
 */
export const PAYMENT_METHOD_ACCOUNT_TYPES: Record<EPaymentMethod, EAccountType[]> = {
  [EPaymentMethod.CASH]: [EAccountType.CASH],
  [EPaymentMethod.CREDIT_CARD]: [EAccountType.BANK],
  [EPaymentMethod.DEBIT_CARD]: [EAccountType.BANK],
  [EPaymentMethod.TRANSFER]: [EAccountType.BANK],
  [EPaymentMethod.MERCADOPAGO]: [EAccountType.DIGITAL_WALLET],
  [EPaymentMethod.CHECK]: [EAccountType.BANK],
  [EPaymentMethod.CREDIT_NOTE]: [],
};

export const PAYMENT_METHOD_LABELS: Record<EPaymentMethod, string> = {
  [EPaymentMethod.CASH]: "Efectivo",
  [EPaymentMethod.CREDIT_CARD]: "Tarjeta crédito",
  [EPaymentMethod.DEBIT_CARD]: "Tarjeta débito",
  [EPaymentMethod.TRANSFER]: "Transferencia",
  [EPaymentMethod.MERCADOPAGO]: "MercadoPago",
  [EPaymentMethod.CHECK]: "Cheque",
  [EPaymentMethod.CREDIT_NOTE]: "Nota de crédito",
};

export enum ESaleDepartment {
  BANDERAS = "banderas",
  VIA_PUBLICA = "via_publica",
}

export type TFactura = {
  id: string;
  tipo: string;
  numero: string;
  fecha: string;
  monto?: number;
}

export type TSaleFormaPago = {
  id: string;
  method: EPaymentMethod;
  amount: number;
  accountId?: string | null;
  bank?: string | null;
}

export interface TSaleItem {
  isManual?: boolean;
  description: string;
  productName: string;
  variantName: any;
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface TReturnItem {
  saleItemId: string;         // ID del item original de la venta
  productId?: string;
  variantId?: string;
  productName: string;
  variantName?: string;
  quantityReturned: number;   // Cantidad devuelta
  refundAmount: number;       // Monto a reembolsar
}

// Items nuevos en un cambio
export interface TExchangeItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface TReturn {
  id: string;
  date: Date;
  items: TReturnItem[];
  reason: string;              // Motivo de la devolución
  refundAmount: number;        // Monto total devuelto
  stockReturned: boolean;      // Si se devolvió al inventario
  createdBy?: string;          // Usuario que registró la devolución
  notes?: string;              // Notas adicionales
  // Campos para cambios
  isExchange?: boolean;        // True si es un cambio (no solo devolución)
  exchangeItems?: TExchangeItem[];  // Items nuevos que se lleva el cliente
  exchangeTotal?: number;      // Total de los items nuevos
  priceDifference?: number;    // Diferencia: + cliente debe, - se le devuelve
}

export interface TSale {
  bank?: string | null;
  accountId?: string | null;
  id?: string;
  number: string;
  items: TSaleItem[];
  subtotal: number;
  total: number;
  // Información de IVA
  applyIVA?: boolean;
  taxRate?: number;
  taxAmount?: number;
  // Información de descuentos
  discountPercentage?: number;
  discountAmount?: number;
  manualDiscount?: number;
  paymentMethod: EPaymentMethod;
  // Sistema de múltiples formas de pago (nuevo)
  formasPago?: TSaleFormaPago[];
  department?: ESaleDepartment; // Departamento al que pertenece la venta
  // Sistema de facturación (antiguo - mantener para compatibilidad)
  isInvoiced: boolean;
  invoiceNumber: string | null;
  // Sistema de múltiples facturas (nuevo)
  facturas?: TFactura[];
  // Cliente: estructura normalizada (solo referencias)
  client?: TClient; // Estructura antigua (objeto completo) - mantener para compatibilidad
  clientId?: string | null; // ID del cliente en la DB (referencia)
  clientName?: string; // Nombre del cliente (para mostrar rápido)
  tempClientData?: TClient; // Datos temporales del cliente
  // Campos adicionales opcionales (para compatibilidad)
  contact?: any;
  cuit?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
  orderId?: string;
  // Sistema de devoluciones y cambios
  returns?: TReturn[];         // Historial de devoluciones y cambios
  totalReturned?: number;      // Total devuelto (suma de refundAmount)
  totalExchanged?: number;     // Total de items nuevos en cambios (suma de exchangeTotal)
  finalTotal?: number;         // Total final = total - totalReturned + totalExchanged
} 