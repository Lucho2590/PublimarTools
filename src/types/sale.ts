import { TClient } from "./client";

export enum EPaymentMethod {
  CASH = "cash",
  CREDIT_CARD = "credit_card",
  DEBIT_CARD = "debit_card",
  TRANSFER = "transfer",
  MERCADOPAGO = "mercadopago",
  CHECK = "cheque",
}

export type TFactura = {
  id: string;
  tipo: string;
  numero: string;
  fecha: string;
  monto?: number;
}

export interface TSaleItem {
  description: string;
  productName: string;
  variantName: any;
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface TSale {
  bank?: string | null;
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
} 