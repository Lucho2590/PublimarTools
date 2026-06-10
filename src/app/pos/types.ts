import { SaleLineItem } from "@/lib/sales";

/** Renglón del carrito del punto de venta. */
export type CartItem = SaleLineItem;

/** Cliente elegido en el POS. `id: null` = venta sin cliente. */
export interface PosClient {
  id: string | null;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  cuit?: string;
  contactName?: string;
}

export const cartKey = (productId: string, variantId: string) =>
  `${productId}:${variantId}`;
