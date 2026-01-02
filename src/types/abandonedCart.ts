// Abandoned Cart Types
// Colección en Firestore: "abandonedCarts"
import { Timestamp } from "firebase/firestore";
import { DeviceType } from "./ecommerceOrder";

export interface AbandonedCartItem {
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

export interface AbandonedCartCustomer {
  name?: string;
  email?: string;
  phone?: string;
}

export interface AbandonedCartMetadata {
  // Device & Browser
  deviceType: DeviceType;
  browser?: string;
  userAgent?: string;

  // Session tracking
  sessionId: string; // REQUERIDO para identificar el carrito

  // Marketing (UTM params si los hay)
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;

  // Referrer
  referrer?: string;

  // Página donde abandonó
  lastPage?: string;
}

export interface TAbandonedCart {
  // Identificadores
  id: string;
  sessionId: string; // Session del usuario (único por sesión del navegador)

  // Cliente (opcional - se agrega cuando completa el formulario)
  customer?: AbandonedCartCustomer;

  // Items del carrito
  items: AbandonedCartItem[];
  itemsCount: number; // Cantidad total de items

  // Montos
  subtotal: number;
  total: number;

  // Estado
  abandoned: boolean; // true = abandonado, false = aún activo
  converted: boolean; // true = completó la compra
  convertedOrderId?: string; // ID del ecommerceOrder si convirtió

  // Recovery tracking
  recoveryMessagesSent?: number; // Cantidad de mensajes de recuperación enviados
  lastRecoveryMessageAt?: Timestamp; // Última vez que se envió un mensaje de recuperación

  // Metadata
  metadata: AbandonedCartMetadata;

  // Tracking de actividad
  firstAddedAt: Timestamp; // Primera vez que agregó algo
  lastActivityAt: Timestamp; // Última actividad (agregar/remover items, ver carrito)
  abandonedAt?: Timestamp; // Cuando abandonó (cerró la página)
  convertedAt?: Timestamp; // Cuando convirtió (completó compra)

  // Tiempos útiles para análisis
  timeInCartMinutes?: number; // Cuánto tiempo tuvo items en el carrito
  timeSinceFirstAddMinutes?: number; // Tiempo desde que agregó el primer item

  // Visto por admin (para notificaciones)
  viewed?: boolean;
  viewedAt?: Timestamp;

  // Auto-generados
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Tipo para crear un carrito abandonado (sin campos auto-generados)
export type CreateAbandonedCartInput = Omit<
  TAbandonedCart,
  "id" | "createdAt" | "updatedAt"
>;

// Tipo para actualizar un carrito abandonado
export type UpdateAbandonedCartInput = Partial<
  Omit<TAbandonedCart, "id" | "sessionId" | "createdAt">
>;
