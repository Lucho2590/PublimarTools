
import { TProduct,  TProductCategory, TProductVariant } from "./product";
import { TQuoteItem } from "./quote";
import { EPaymentMethod } from "./sale";
import { TClient } from "./client";

export enum EOrderStatus {
  // PENDING = "pending",
  IN_PROCESS = "in_process",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

// Heredar de TQuoteItem para mantener consistencia
export type TOrderItem = TQuoteItem;



export type TPaymentHistory = {
  amount: number;
  date: Date;
  method: EPaymentMethod;
  notes?: string;
};

export type TOrder = {
  invoiceType: string;
  id: string;
  number: string; // Número de orden para mostrar al cliente
  quoteId: string;
  client: TClient;
  status: EOrderStatus;
  items: TOrderItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  applyIVA:boolean;
  discount?: number;
  total: number;
  notes?: string;
  estimatedDeliveryDate?: Date;
  actualDeliveryDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date; // Cuando pasa a 'in_process'
  completedAt?: Date; // Cuando pasa a 'completed'
  deliveredAt?: Date; // Fecha de entrega de la orden
  cancelledAt?: Date; // Cuando pasa a 'cancelled'
  paymentMethod?: EPaymentMethod;
  isInvoiced?: boolean;
  invoiceNumber?: string;
  downPayment?: number;
  balance?: number;
  publicUrl?: string;
  paymentHistory?: TPaymentHistory[];
};
