/**
 * Paleta de colores para los pines del mapa de Vía Pública.
 *
 * Los hex se usan SIEMPRE inline (`style={{ backgroundColor: hex }}`) y nunca
 * como clases Tailwind: `tailwind.config.ts` no escanea `src/lib`, así que una
 * clase armada acá se perdería en el purge.
 */

export type TPinColorKey =
  | "blue"
  | "red"
  | "green"
  | "amber"
  | "orange"
  | "purple"
  | "pink"
  | "teal"
  | "indigo"
  | "slate";

export interface TPinColor {
  key: TPinColorKey;
  label: string;
  /** Relleno del pin y de los swatches. */
  hex: string;
  /** Borde del pin. */
  hexDark: string;
}

/** Hex tomados de la paleta Tailwind 600/800 para que combinen con el resto de la app. */
export const PIN_COLORS: readonly TPinColor[] = [
  { key: "blue", label: "Azul", hex: "#2563eb", hexDark: "#1e40af" },
  { key: "red", label: "Rojo", hex: "#dc2626", hexDark: "#991b1b" },
  { key: "green", label: "Verde", hex: "#16a34a", hexDark: "#166534" },
  { key: "amber", label: "Ámbar", hex: "#d97706", hexDark: "#92400e" },
  { key: "orange", label: "Naranja", hex: "#ea580c", hexDark: "#9a3412" },
  { key: "purple", label: "Violeta", hex: "#9333ea", hexDark: "#6b21a8" },
  { key: "pink", label: "Rosa", hex: "#db2777", hexDark: "#9d174d" },
  { key: "teal", label: "Turquesa", hex: "#0d9488", hexDark: "#115e59" },
  { key: "indigo", label: "Índigo", hex: "#4f46e5", hexDark: "#3730a3" },
  { key: "slate", label: "Gris", hex: "#475569", hexDark: "#1e293b" },
] as const;

export const DEFAULT_PIN_COLOR_KEY: TPinColorKey = "blue";

const BY_KEY = new Map<string, TPinColor>(PIN_COLORS.map((c) => [c.key, c]));

export const DEFAULT_PIN_COLOR = BY_KEY.get(DEFAULT_PIN_COLOR_KEY)!;

export const isPinColorKey = (value: unknown): value is TPinColorKey =>
  typeof value === "string" && BY_KEY.has(value);

/** Los tipos viejos sin `pinColor` (o con un valor basura) caen al color por defecto. */
export function getPinColor(key?: string | null): TPinColor {
  return (key && BY_KEY.get(key)) || DEFAULT_PIN_COLOR;
}
