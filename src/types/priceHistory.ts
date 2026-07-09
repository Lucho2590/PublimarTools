import { Timestamp } from "firebase/firestore";
import { EUserRole } from "@/types/user";

/** Origen de un cambio de precio. */
export enum EPriceChangeSource {
  AUMENTO = "aumento",
  REDONDEO_MASIVO = "redondeo_masivo",
  EDICION = "edicion",
  CREACION = "creacion",
  REVERT = "revert",
}

export const PRICE_SOURCE_LABELS: Record<EPriceChangeSource, string> = {
  [EPriceChangeSource.AUMENTO]: "Aumento",
  [EPriceChangeSource.REDONDEO_MASIVO]: "Redondeo masivo",
  [EPriceChangeSource.EDICION]: "Edición",
  [EPriceChangeSource.CREACION]: "Creación",
  [EPriceChangeSource.REVERT]: "Reversión",
};

/**
 * Un cambio de precio de un punto de precio concreto (variante o precio base
 * del producto). Se guarda un documento por cambio en la colección `priceHistory`.
 */
export type TPriceHistoryEntry = {
  id: string;
  productId: string;
  productName: string; // denormalizado para mostrar/filtrar
  variantId: string | null; // null = precio base (producto sin variantes)
  variantSize: string | null; // denormalizado
  oldPrice: number; // 0 en creación
  newPrice: number;
  changePct: number; // (new-old)/old*100; 0 si old = 0
  source: EPriceChangeSource;
  batchId: string; // agrupa los cambios de una misma operación (para revertir el lote)
  reverted: boolean; // si este cambio ya fue revertido
  // actor
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userRole: EUserRole | null;
  createdAt: Timestamp;
};

/** Datos mínimos para registrar un cambio de precio (el helper completa el resto). */
export type TPriceChangeInput = {
  productId: string;
  productName: string;
  variantId: string | null;
  variantSize: string | null;
  oldPrice: number;
  newPrice: number;
};
