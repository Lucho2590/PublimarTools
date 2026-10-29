// Extracción determinística de datos sueltos: medidas, cantidades, sí/no.

import { normalizeText } from "./normalize";

/**
 * Medida normalizada a centímetros, menor primero: "90x140", "1,50 x 0,90" →
 * "90x150". Valores < 10 se asumen en metros. null si no hay medida.
 */
export function parseSize(input: string): string | null {
  const m = normalizeText(input).match(
    /(\d+(?:[.,]\d+)?)\s*(?:x|por|\*)\s*(\d+(?:[.,]\d+)?)/
  );
  if (!m) return null;
  const toCm = (s: string) => {
    const n = parseFloat(s.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n < 10 ? n * 100 : n);
  };
  const a = toCm(m[1]);
  const b = toCm(m[2]);
  if (a == null || b == null) return null;
  return `${Math.min(a, b)}x${Math.max(a, b)}`;
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, docena: 12,
  quince: 15, veinte: 20, treinta: 30, cincuenta: 50, cien: 100,
};

/** Cantidad (entero 1–9999) en dígitos o palabras. Ignora números de medidas. */
export function parseQuantity(input: string): number | null {
  const text = normalizeText(input).replace(
    /\d+(?:[.,]\d+)?\s*(?:x|por|\*)\s*\d+(?:[.,]\d+)?/g,
    " "
  );
  const digits = text.match(/\b(\d{1,4})\b/);
  if (digits) {
    const n = parseInt(digits[1], 10);
    return n > 0 ? n : null;
  }
  if (/\bdocenas?\b/.test(text)) return 12; // "una docena" → 12, no 1
  for (const w of text.split(" ")) {
    if (w in NUMBER_WORDS) return NUMBER_WORDS[w];
  }
  return null;
}

const YES = [
  "si", "sip", "dale", "ok", "oka", "okey", "confirmo", "confirmar", "de una",
  "perfecto", "listo", "va", "joya", "bueno", "correcto", "claro", "obvio",
];
const NO = ["no", "nop", "nah", "cancelar", "cancela", "cancelo", "para nada", "mejor no"];

/** true = sí, false = no, null = ni una ni otra. */
export function parseYesNo(input: string): boolean | null {
  const t = normalizeText(input);
  if (!t) return null;
  const has = (list: string[]) =>
    list.some((w) => t === w || t.startsWith(`${w} `) || t.endsWith(` ${w}`));
  if (has(NO)) return false;
  if (has(YES)) return true;
  return null;
}

/** "nada mas", "eso es todo" → el cliente terminó de agregar productos. */
export function isDoneAdding(input: string): boolean {
  const t = normalizeText(input);
  return /\b(nada mas|eso es todo|eso seria todo|seria todo|nada|terminar|termine|listo)\b/.test(t);
}

// Constructor (no literal) porque el flag `u` no compila con target es5.
const NAME_RE = new RegExp("^[\\p{L}\\s'.-]+$", "u");

/** Nombre plausible: solo letras/espacios, 2–40 chars, hasta 5 palabras. */
export function parseName(input: string): string | null {
  const raw = String(input || "").trim().replace(/^(soy|me llamo|a nombre de)\s+/i, "");
  if (raw.length < 2 || raw.length > 40) return null;
  if (!NAME_RE.test(raw)) return null;
  const words = raw.split(/\s+/);
  if (words.length > 5) return null;
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
