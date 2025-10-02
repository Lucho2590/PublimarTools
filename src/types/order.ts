
import { TProduct,  TProductCategory, TProductVariant } from "./product";
import { TQuoteItem } from "./quote";
import { EPaymentMethod } from "./sale";
import { TClient } from "./client";

export enum EOrderStatus {
  // PENDING = "pending",
  DRAFT = "draft",
  IN_PROCESS = "in_process",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

// Heredar de TQuoteItem para mantener consistencia
export type TOrderItem = TQuoteItem;

export type TInvoiceType = {
  type: string;
  number: string;
  date: Date;
}

export type TFactura = {
  id: string;
  tipo: string;
  numero: string;
  fecha: string;
  monto?: number;
}


export type TPaymentHistory = {
  amount: number;
  date: Date;
  type: string;
  method: EPaymentMethod;
  notes?: string;
};

export type TOrder = {
  bank: string | number | readonly string[] | undefined;
  invoiceType: string;
  id: string;
  number: string; // Número de orden para mostrar al cliente
  quoteId: string;
  // Cliente: estructura normalizada (solo referencias)
  client?: TClient; // Estructura antigua (objeto completo) - mantener para compatibilidad
  clientId?: string | null; // ID del cliente en la DB (referencia)
  clientName?: string; // Nombre del cliente (para mostrar rápido)
  reference?: string; // Referencia del cliente
  tempClientData?: TClient; // Datos temporales del cliente
  // Campos adicionales opcionales (para compatibilidad)
  contact?: any;
  cuit?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  status: EOrderStatus;
  items: TOrderItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  applyIVA:boolean;
  discount?: number;
  discountAmount?: number;
  manualDiscount?: number;
  discountPercentage?: number;
  total: number;
  notes?: string;
  estimatedDeliveryDate?: Date | number;
  actualDeliveryDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date; // Cuando pasa a 'in_process'
  completedAt?: Date; // Cuando pasa a 'completed'
  deliveredAt?: Date; // Fecha de entrega de la orden
  cancelledAt?: Date; // Cuando pasa a 'cancelled'
  paymentMethod?: EPaymentMethod;
  isInvoiced?: boolean;
  invoiceNumber?: string | [];
  invoiceDate?: Date;
  facturas?: TFactura[];
  downPayment?: number | undefined ;
  balance?: number;
  publicUrl?: string;
  paymentHistory?: TPaymentHistory[];
};
