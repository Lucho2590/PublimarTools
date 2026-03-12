// Ecommerce Order Types
// Colección en Firestore: "ecommerceOrders"
// IMPORTANTE: Este tipo es diferente a TOrder del CRM (que son órdenes de trabajo)
import { Timestamp } from "firebase/firestore";

export type EcommerceOrderStatus =
  | "pending"      // Recién creado desde la web, esperando confirmación por WhatsApp
  | "confirmed"    // Cliente confirmó por WhatsApp
  | "preparing"    // En producción
  | "shipped"      // Enviado
  | "delivered"    // Entregado
  | "cancelled";   // Cancelado

export type EcommerceOrderSource = "web" | "whatsapp_direct" | "phone" | "presencial";

export type DeviceType = "mobile" | "desktop" | "tablet";

// Item de un pedido de ecommerce (más simple que TOrderItem del CRM)
export interface EcommerceOrderItem {
  productId: string;
  productName: string;
  productSku: string;
  variant?: {
    id: string;
    name: string;
    size?: string;
  };
  quantity: number;
  unitPrice: number;
  subtotal: number;
  imageUrl?: string;
}

// Datos del cliente (mucho más simple que TClient del CRM)
export interface EcommerceCustomer {
  // Datos básicos (solo phone al principio)
  phone?: string;

  // Datos opcionales (se pueden agregar después desde el CRM)
  name?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  notes?: string;
}

// Metadata de tracking (específico de ecommerce)
export interface EcommerceOrderMetadata {
  // Device & Browser
  deviceType: DeviceType;
  browser?: string;
  userAgent?: string;

  // Session tracking para analytics
  sessionId?: string;

  // Marketing (UTM params si los hay)
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;

  // Referrer
  referrer?: string;
}

// Orden de ecommerce (DIFERENTE a TOrder del CRM)
export interface TEcommerceOrder {
  // Identificadores
  id: string;
  orderNumber: string; // "ECOM-20250101-001" (diferente formato que TOrder.number)

  // Cliente (simple, sin facturación)
  customer: EcommerceCustomer;

  // Items del pedido
  items: EcommerceOrderItem[];

  // Montos (SIN IVA, SIN facturación por ahora)
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;

  // Estado del pedido
  status: EcommerceOrderStatus;

  // Origen (siempre "web" al principio)
  source: EcommerceOrderSource;

  // Metadata de tracking (específico de ecommerce)
  metadata: EcommerceOrderMetadata;

  // Notas internas (para el admin)
  internalNotes?: string;

  // WhatsApp conversation
  whatsappMessageSent: boolean;
  whatsappConversationUrl?: string;

  // Relación con CRM (opcional)
  // Si después se convierte en una orden del CRM, guardamos la referencia
  crmOrderId?: string; // ID de la TOrder en la colección "orders"

  // Relación con Venta (se crea cuando se envía/entrega)
  saleId?: string; // ID de la venta en la colección "sales"
  saleNumber?: string; // Número de venta (V-YYYYMMDD-...)
  saleProcessedAt?: Timestamp; // Cuando se procesó la venta y descontó el stock

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  confirmedAt?: Timestamp;
  shippedAt?: Timestamp;
  deliveredAt?: Timestamp;
  cancelledAt?: Timestamp;

  // Visto por admin (para notificaciones)
  viewed?: boolean;
  viewedAt?: Timestamp;

  // Tracking de envío (opcional)
  trackingNumber?: string;
  shippingCarrier?: string;
}

// Tipo para crear una nueva orden de ecommerce (sin campos auto-generados)
export type CreateEcommerceOrderInput = Omit<
  TEcommerceOrder,
  "id" | "createdAt" | "updatedAt" | "orderNumber"
>;
