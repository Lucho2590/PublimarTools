import type { TProductVariant } from "@/types/product";

/**
 * Indica si una variante descuenta stock al venderse.
 * true salvo que la variante tenga `discountStock === false` explícito
 * (las variantes viejas sin el campo descuentan por default).
 */
export function variantDiscountsStock(
  variant: Pick<TProductVariant, "discountStock"> | null | undefined,
): boolean {
  return variant?.discountStock !== false;
}
