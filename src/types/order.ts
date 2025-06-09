
import { TQuoteItem } from "./quote";
import { EPaymentMethod } from "./sale";

export enum EOrderStatus {
  PENDING = "pending",
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
  client: {
    contacts: boolean;
    id: string;
    name: string;
  };
  status: EOrderStatus;
  items: Array<{
    product: {
      id: string;
      name: string;
    };
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
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
