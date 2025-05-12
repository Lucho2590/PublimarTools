import { TClient } from "./client";
import { TQuoteItem } from "./quote";
import { EPaymentMethod } from "./sale";

export enum EOrderStatus {
  IN_PROCESS = "in_process",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export type TOrderItem = TQuoteItem;

export type TPaymentHistory = {
  amount: number;
  date: Date;
  method: EPaymentMethod;
  notes?: string;
};

export type TOrder = {
  id: string;
  number: string; // Número de orden para mostrar al cliente
  quoteId: string;
  client: TClient;
  status: EOrderStatus;
  items: TOrderItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount?: number;
  total: number;
  notes?: string;
  estimatedDeliveryDate?: Date;
  actualDeliveryDate?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date; // Cuando pasa a 'in_process'
  completedAt?: Date; // Cuando pasa a 'completed'
  deliveredAt?: Date; // Cuando pasa a 'delivered'
  cancelledAt?: Date; // Cuando pasa a 'cancelled'
  paymentMethod?: EPaymentMethod;
  isInvoiced?: boolean;
  invoiceNumber?: string;
  downPayment?: number;
  balance?: number;
  publicUrl?: string;
  paymentHistory?: TPaymentHistory[];
};
