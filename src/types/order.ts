import { TClient } from "./client";
import { TQuoteItem } from "./quote";

export enum EOrderStatus {
  PENDING = "pending",
  IN_PROCESS = "in_process",
  COMPLETED = "completed",
  DELIVERED = "delivered",
}

export type TOrderItem = TQuoteItem;

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
};
