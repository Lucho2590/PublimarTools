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
 * Redondea un número hacia arriba a la decena más cercana
 * @param num - El número a redondear
 * @returns El número redondeado hacia arriba a la decena más cercana
 * @example
 * redondearADecena(122968.15) // 122970
 * redondearADecena(1205) // 1210
 * redondearADecena(100) // 100
 */
export const redondearADecena = (num: number): number => {
  return Math.ceil(num / 10) * 10;
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
