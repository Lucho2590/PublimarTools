import { TClient } from "./client";
import { TProduct, TProductVariant } from "./product";

export enum EQuoteStatus {
  DRAFT = "draft",
  SENT = "sent",
  CONFIRMED = "confirmed",
  REJECTED = "rejected",
}

export type TQuoteItem = {
  id: string;
  product: TProduct;
  variant?: TProductVariant;
  quantity: number;
  unitPrice: number;
  discount?: number;
  subtotal: number;
  notes?: string;
};

export type TQuoteComment = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: Date;
  isInternal: boolean; // Si es solo visible para usuarios internos
};

export type TQuote = {
  id: string;
  number: string; // Número de presupuesto para mostrar al cliente
  client: TClient;
  status: EQuoteStatus;
  items: TQuoteItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount?: number;
  total: number;
  validUntil: Date;
  notes?: string;
  comments: TQuoteComment[];
  publicUrl: string; // URL única para compartir con el cliente
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
  confirmedAt?: Date;
  rejectedAt?: Date;
};
