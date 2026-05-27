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

  // Campos específicos para Vía Pública
  periodo?: number;          // Período (meses) - legacy
  costo?: number;            // Costo del dispositivo
  precioVenta?: number;      // Precio de venta al cliente
  afiches?: number;          // Costo de afiches/impresión
  /** @deprecated En Vía Pública usar TQuote.periodos[].fechaSalida */
  fechaSalida?: any;
  /** @deprecated En Vía Pública usar TQuote.periodos[].dias */
  dias?: number;
  /** @deprecated agrupación reemplazada por TQuote.periodos[] */
  periodoGroupId?: string;
};

// Período de Vía Pública: agrupa los dispositivos que salen juntos en la misma fecha.
export type TQuotePeriodo = {
  id: string;
  fechaSalida?: any;          // Timestamp Firestore | Date
  dias?: number;              // días pagos
  diasBonificados?: number;   // días regalados (extienden "Hasta" pero no el precio)
  items: TQuoteItem[];        // dispositivos del período
  notas?: string;
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

  // Campos específicos para Vía Pública
  periodos?: TQuotePeriodo[];      // Períodos con dispositivos anidados (Vía Pública)
  fecha?: Date;                    // Fecha de inicio del servicio
  factura?: boolean;               // Si se emite factura
  tipoFactura?: 'A' | 'C';         // Tipo de factura
  formaPago?: string;              // Forma de pago
  totalCosto?: number;             // Total de costos
  totalVenta?: number;             // Total precio de venta
  ganancia?: number;               // Ganancia (venta - costo)
};
