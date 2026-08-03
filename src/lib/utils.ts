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

/** Abrevia montos grandes para ejes y celdas chicas: 1,2M / 350k / 900. */
export const formatearPrecioCompacto = (valor: number): string => {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000)
    return `${(valor / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${Math.round(valor / 1_000)}k`;
  return String(Math.round(valor));
};

export const formatDate = (timestamp: any) => {
  if (!timestamp) return "-";
  // Manejar Firebase Timestamp como objeto {seconds, nanoseconds} (para Firebase 9+)
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toLocaleDateString("es-AR");
  }
  // Manejar Firebase Timestamp como objeto {seconds, nanoseconds} (para Firebase 9+)
  if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
    return new Date(timestamp.seconds * 1000).toLocaleDateString("es-AR");
  }
  // Manejar Date como objeto
  if (timestamp instanceof Date) {
    return timestamp.toLocaleDateString("es-AR");
  }
  return new Date(timestamp).toLocaleDateString("es-AR");
};

/**
 * Formatea una fecha en formato string (YYYY-MM-DD) sin problemas de zona horaria
 * @param dateString - La fecha en formato string (ej: "2025-10-18")
 * @returns La fecha formateada en formato argentino (ej: "18/10/2025")
 * @example
 * formatDateString("2025-10-18") // "18/10/2025"
 */
export const formatDateString = (dateString: string): string => {
  if (!dateString) return "-";
  // Agregar 'T12:00:00' para interpretar la fecha en hora local (mediodía)
  // Esto evita problemas de zona horaria cuando la fecha viene sin hora
  const dateWithTime = `${dateString}T12:00:00`;
  return new Date(dateWithTime).toLocaleDateString("es-AR");
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
 * Configuración global de redondeo de precios (editable desde /sudo).
 * - multiplo: paso base de redondeo (a 10, 50 o 100).
 * - direccion: "cercano" (al más cercano) o "arriba" (siempre hacia arriba).
 * - terminacion: terminación psicológica del precio. Cuando es distinta de
 *   "ninguna" el precio termina en …90 / …99 / …00 (paso de 100) y el `multiplo`
 *   se ignora.
 */
export type TRoundingConfig = {
  multiplo: 10 | 50 | 100;
  direccion: "cercano" | "arriba";
  terminacion: "ninguna" | "90" | "99" | "00";
};

/** Config por defecto: replica el comportamiento histórico (redondearADecena). */
export const DEFAULT_ROUNDING: TRoundingConfig = {
  multiplo: 10,
  direccion: "cercano",
  terminacion: "ninguna",
};

/**
 * Redondea un precio según una configuración de redondeo.
 * Con DEFAULT_ROUNDING es equivalente a `redondearADecena`.
 * @example
 * redondearPrecio(1150, { multiplo: 100, direccion: "arriba", terminacion: "ninguna" })   // 1200
 * redondearPrecio(1150, { multiplo: 10, direccion: "cercano", terminacion: "99" })         // 1199
 * redondearPrecio(1150, { multiplo: 10, direccion: "cercano", terminacion: "ninguna" })    // 1150
 */
export const redondearPrecio = (
  num: number,
  config: TRoundingConfig = DEFAULT_ROUNDING
): number => {
  if (!num || isNaN(num) || num <= 0) return 0;

  const { multiplo, direccion, terminacion } = config;
  // Redondear centavos primero (igual que redondearADecena).
  const base = Math.round(num);

  // Sin terminación psicológica: redondear al múltiplo elegido.
  if (terminacion === "ninguna") {
    const fn = direccion === "arriba" ? Math.ceil : Math.round;
    return fn(base / multiplo) * multiplo;
  }

  // Terminación psicológica: precios que terminan en …90 / …99 / …00 (paso de 100).
  const offset = terminacion === "00" ? 0 : Number(terminacion); // 90 | 99 | 0
  const step = 100;

  if (direccion === "arriba") {
    // Menor valor k*100 + offset que sea >= base.
    const k = Math.ceil((base - offset) / step);
    return k * step + offset;
  }

  // Al más cercano entre la terminación de abajo y la de arriba.
  const kFloor = Math.floor((base - offset) / step);
  const lower = kFloor * step + offset;
  const upper = lower + step;
  return Math.abs(base - lower) <= Math.abs(upper - base) ? lower : upper;
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

/**
 * Genera un slug amigable para URLs combinando el nombre y el ID
 * @param name - El nombre a convertir en slug
 * @param id - El ID único del documento
 * @returns El slug en formato "nombre-formateado-id"
 * @example
 * generateSlug("Juan Pérez", "abc123") // "juan-perez-abc123"
 * generateSlug("Empresa S.A.", "xyz789") // "empresa-sa-xyz789"
 */
export const generateSlug = (name: string, id: string): string => {
  const slug = name
    .toLowerCase()
    .normalize('NFD') // Normalizar caracteres Unicode
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^\w\s-]/g, '') // Quitar caracteres especiales
    .replace(/\s+/g, '-') // Convertir espacios a guiones
    .replace(/-+/g, '-') // Eliminar guiones múltiples
    .substring(0, 50); // Limitar longitud

  return `${slug}-${id}`;
};

/**
 * Extrae el ID de un slug generado con generateSlug
 * @param slug - El slug en formato "nombre-formateado-id"
 * @returns El ID extraído del slug
 * @example
 * extractIdFromSlug("juan-perez-abc123") // "abc123"
 * extractIdFromSlug("empresa-sa-xyz789") // "xyz789"
 */
export const extractIdFromSlug = (slug: string): string => {
  const parts = slug.split('-');
  return parts[parts.length - 1];
};
