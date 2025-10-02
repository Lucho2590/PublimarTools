import { TClient } from "./client";
import { TProduct, TProductCategory, TProductVariant } from "./product";

export enum EQuoteStatus {
  DRAFT = "draft",
  SENT = "sent",
  CONFIRMED = "confirmed",
  REJECTED = "rejected",
}

export type TQuoteItem = {
  id: string;
  // Referencias (no duplicar objetos completos)
  productId?: string;        // ID del producto en la DB (null si es manual)
  variantId?: string;        // ID de la variante seleccionada
  
  // Datos para mostrar rápido (snapshot)
  productName: string;
  description: string;
  variantName?: string;      // ej: "Talle L", "Color Rojo", "2x1m"
  categories?: TProductCategory[]; // Para filtros/reportes
  
  // Datos de la cotización/orden
  quantity: number;
  unitPrice: number;
  discount?: number;
  subtotal: number;
  tax: number;
  taxAmount: number;
  notes?: string;
  isManual?: boolean;        // true si es un item creado manualmente
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
