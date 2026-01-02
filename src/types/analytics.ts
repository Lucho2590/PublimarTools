import { Timestamp } from "firebase/firestore";

/**
 * Analytics de producto
 * Almacena estadísticas agregadas por producto
 */
export interface TProductAnalytics {
  productId: string;
  productName: string;
  productSku?: string;

  // Métricas de visualización
  viewsCount: number;
  uniqueViewsCount: number;
  lastViewedAt?: Timestamp;

  // Métricas de carrito
  addToCartCount: number;
  removeFromCartCount: number;

  // Métricas de conversión
  purchasedCount: number;
  totalRevenue: number;

  // Tasa de conversión (calculada)
  conversionRate: number; // purchasedCount / viewsCount
  cartConversionRate: number; // purchasedCount / addToCartCount

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Evento de vista de producto
 * Cada vista se guarda individualmente para análisis detallado
 */
export interface TProductViewEvent {
  productId: string;
  productName: string;
  sessionId: string;
  timestamp: Timestamp;

  // Contexto
  source?: "tienda" | "busqueda" | "destacados" | "categorias";
  searchTerm?: string;
  category?: string;

  // Metadata del usuario
  metadata?: {
    userAgent?: string;
    referrer?: string;
    deviceType?: "mobile" | "tablet" | "desktop";
  };
}

/**
 * Búsqueda realizada por usuarios
 */
export interface TSearchQuery {
  searchTerm: string;
  resultsCount: number;
  sessionId: string;
  timestamp: Timestamp;

  // Si hubo click en algún resultado
  clickedProductId?: string;
  clickedPosition?: number;

  // Metadata
  source?: "tienda" | "home";
}

/**
 * Embudo de conversión
 * Representa el recorrido del usuario
 */
export interface TConversionFunnel {
  sessionId: string;

  // Etapas del embudo
  viewedProducts: string[]; // IDs de productos vistos
  addedToCart: string[]; // IDs de productos agregados al carrito
  purchasedProducts: string[]; // IDs de productos comprados

  // Timestamps de cada etapa
  firstViewAt: Timestamp;
  firstAddToCartAt?: Timestamp;
  checkoutAt?: Timestamp;
  purchaseAt?: Timestamp;

  // Estado del embudo
  stage: "viewed" | "added_to_cart" | "checkout" | "purchased" | "abandoned";

  // Totales
  totalProductsViewed: number;
  totalProductsInCart: number;
  totalProductsPurchased: number;
  totalRevenue: number;

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Agregado diario de métricas generales
 */
export interface TDailyMetrics {
  date: string; // YYYY-MM-DD

  // Tráfico
  totalPageViews: number;
  uniqueSessions: number;

  // Productos
  totalProductViews: number;
  uniqueProductsViewed: number;

  // Búsquedas
  totalSearches: number;
  searchesWithNoResults: number;
  topSearchTerms: { term: string; count: number }[];

  // Carrito
  totalAddToCart: number;
  totalRemoveFromCart: number;
  totalCartAbandoned: number;

  // Conversiones
  totalCheckouts: number;
  totalPurchases: number;
  totalRevenue: number;

  // Tasas
  overallConversionRate: number; // purchases / sessions
  cartAbandonmentRate: number; // abandoned / (abandoned + purchased)

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Input para crear/actualizar analytics de producto
 */
export interface UpdateProductAnalyticsInput {
  productId: string;
  productName: string;
  productSku?: string;

  // Incrementos
  incrementViews?: number;
  incrementUniqueViews?: number;
  incrementAddToCart?: number;
  incrementRemoveFromCart?: number;
  incrementPurchased?: number;
  addRevenue?: number;
}
