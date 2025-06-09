import { TClient } from "./client";
import { TProduct, TProductCategory, TProductVariant } from "./product";

export enum EQuoteStatus {
  DRAFT = "draft",
  SENT = "sent",
  CONFIRMED = "confirmed",
  REJECTED = "rejected",
}

export type TQuoteItem = {
  tax: number;
  taxAmount: number;
  description: string;
  categories: TProductCategory[];
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
  isInternal: boolean;
};

export type TQuote = {
  id: string;
  number: string;
  client: TClient;
  items: TQuoteItem[];
  subtotal: number;
  taxRate: number;
  tax: number;
  taxAmount: number;
  total: number;
  status: EQuoteStatus;
  validUntil: Date;
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
  confirmedAt?: Date;
  rejectedAt?: Date;
  comments?: TQuoteComment[];
  notes?: string;
  publicUrl?: string;
};
