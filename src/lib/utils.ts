import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatearPrecio = (valor: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(valor);
};

export const formatDate = (timestamp: any) => {
  if (!timestamp) return "-";
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toLocaleDateString("es-AR");
  }
  if (timestamp instanceof Date) {
    return timestamp.toLocaleDateString("es-AR");
  }
  return new Date(timestamp).toLocaleDateString("es-AR");
};

/**
 * Redondea un número primero en centavos y luego a la decena más cercana
 * @param num - El número a redondear
 * @returns El número redondeado
 * @example
 * redondearADecena(23456.02) // 23460.00 (centavos < 50 → 23456.00, luego último dígito 6 → 23460.00)
 * redondearADecena(23456.51) // 23460.00 (centavos ≥ 50 → 23457.00, luego último dígito 7 → 23460.00)
 * redondearADecena(23454.00) // 23450.00 (ya sin centavos, último dígito 4 → 23450.00)
 * redondearADecena(23457.00) // 23460.00 (ya sin centavos, último dígito 7 → 23460.00)
 */
export const redondearADecena = (num: number): number => {
  // Paso 1: Redondear centavos normalmente (< 50 hacia abajo, ≥ 50 hacia arriba)
  const sinCentavos = Math.round(num);
  
  // Paso 2: Redondear a la decena más cercana
  // Si el último dígito es 0-4, redondear hacia abajo
  // Si el último dígito es 5-9, redondear hacia arriba
  return Math.round(sinCentavos / 10) * 10;
};

/**
 * Redondea un número hacia arriba a la decena más cercana y lo formatea como precio
 * @param num - El número a redondear y formatear
 * @returns El precio formateado redondeado hacia arriba
 * @example
 * redondearYFormatearPrecio(122968.15) // "$122.970,00"
 */
export const redondearYFormatearPrecio = (num: number): string => {
  const redondeado = redondearADecena(num);
  return formatearPrecio(redondeado);
};

/**
 * Redondea un valor monetario a 2 decimales para cálculos precisos de ventas
 * @param value - El número a redondear
 * @returns El número redondeado a 2 decimales
 * @example
 * redondearTotal(123.456) // 123.46
 * redondearTotal(45.999) // 46.00
 */
export const redondearTotal = (value: number): number => {
  return Math.round(value * 100) / 100;
};

/**
 * Calcula el precio sin IVA desde un precio final (que incluye IVA)
 * @param finalPrice - El precio final que incluye IVA
 * @param taxRate - La tasa de IVA en porcentaje (ej: 21 para 21%)
 * @returns El precio base sin IVA, redondeado a 2 decimales
 * @example
 * calculatePriceWithoutTax(121.00, 21) // 100.00
 * calculatePriceWithoutTax(12100.00, 21) // 10000.00
 */
export const calculatePriceWithoutTax = (finalPrice: number, taxRate: number): number => {
  const priceWithoutTax = finalPrice / (1 + taxRate / 100);
  return redondearTotal(priceWithoutTax);
};
