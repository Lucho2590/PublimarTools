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

/**
 * Cantidad DICHA a propósito: "2", "tres", "una docena"; NO el artículo
 * ("quiero una bandera" no dice cuántas).
 */
export function parseExplicitQuantity(input: string): number | null {
  const q = parseQuantity(input);
  if (q == null) return null;
  if (q > 1) return q;
  // 1 solo cuenta con dígito o "una sola" / "solo una" / "1 sola".
  return /\b1\b|\b(una|uno|un) sol[oa]\b|\bsol[oa] (una|uno|un)\b/.test(normalizeText(input)) ? 1 : null;
}

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
const NO = [
  "no", "nop", "nah", "cancelar", "cancela", "cancelo", "para nada", "mejor no",
  "ninguna", "ninguno", "nada", "no gracias", "nono", "no no", "nopo", "naa", "na",
];

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

/** Palabras que nunca aparecen en un nombre: interrogativos, verbos comunes. */
const NAME_STOPWORDS = new Set([
  "como", "que", "cuanto", "cuanta", "cuando", "donde", "cual", "quien", "puedo", "puede",
  "pagar", "pago", "tienen", "tenes", "hacen", "hay", "quiero", "necesito", "envio", "envian",
  "sale", "cuesta", "precio", "bandera", "banderas", "lo", "la", "me", "se", "es", "son",
]);

/** Respuestas que no son un nombre ("después", "nada más", "no sé"…). */
const NOT_NAMES =
  /^(despues|luego|mas tarde|nada|nada mas|no se|ninguno|ninguna|hola|gracias|ok|listo|eso es todo|otro|otra)$/;

// Constructor (no literal) porque el flag `u` no compila con target es5.
const NAME_RE = new RegExp("^[\\p{L}\\s'.-]+$", "u");

/** Nombre plausible: solo letras/espacios, 2–40 chars, hasta 5 palabras. */
export function parseName(input: string): string | null {
  const raw = String(input || "").trim().replace(/^(soy|me llamo|a nombre de)\s+/i, "");
  if (raw.length < 2 || raw.length > 40) return null;
  if (!NAME_RE.test(raw)) return null;
  if (parseYesNo(raw) !== null) return null; // "sí", "dale", "no" no son nombres
  if (NOT_NAMES.test(normalizeText(raw))) return null;
  // Una pregunta o frase con verbos/interrogativos no es un nombre ("como lo puedo pagar").
  if (/\?/.test(raw)) return null;
  const words0 = normalizeText(raw).split(" ");
  if (words0.some((w) => NAME_STOPWORDS.has(w))) return null;
  const words = raw.split(/\s+/);
  if (words.length > 5) return null;
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ---------------------------------------------------------------------------
// Fecha "para cuándo": "20/11", "15 de noviembre", "en 2 semanas", "el viernes"…
// ---------------------------------------------------------------------------

const TZ = "America/Argentina/Buenos_Aires";
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

/** Fecha de hoy en Buenos Aires como {y, m, d, weekday} (sin hora). */
function todayAR(now: Date): { y: number; m: number; d: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  };
}

export type TNeededBy = {
  /** yyyy-mm-dd, o null si "sin apuro". */
  date: string | null;
  /** Días desde hoy (0 = hoy/urgente), o null si "sin apuro". */
  days: number | null;
};

/**
 * "Para cuándo": devuelve la fecha y los días que faltan, o null si el texto no
 * dice una fecha. "sin apuro" → {date: null, days: null}. Fechas pasadas del
 * año se toman como del año que viene ("20/1" en diciembre).
 */
export function parseNeededBy(input: string, now = new Date()): TNeededBy | null {
  const t = normalizeText(input);
  if (!t) return null;
  const today = todayAR(now);
  const base = Date.UTC(today.y, today.m - 1, today.d);
  const fromDays = (days: number): TNeededBy => {
    const d = new Date(base + days * DAY_MS);
    return { date: d.toISOString().slice(0, 10), days };
  };
  const fromDate = (y: number, m: number, d: number): TNeededBy | null => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    let ts = Date.UTC(y, m - 1, d);
    if (ts < base) ts = Date.UTC(y + 1, m - 1, d);
    return fromDays(Math.round((ts - base) / DAY_MS));
  };

  if (/\b(sin apuro|no tengo apuro|no hay apuro|cuando sea|cuando puedan|no corre)\b/.test(t)) {
    return { date: null, days: null };
  }
  if (/\b(urgente|hoy|ya mismo|cuanto antes|lo antes posible|para ya)\b/.test(t)) return fromDays(0);
  if (/\bpasado manana\b/.test(t)) return fromDays(2);
  if (/\bmanana\b/.test(t)) return fromDays(1);
  if (/\b(esta semana)\b/.test(t)) return fromDays(Math.max(0, 5 - today.weekday));
  if (/\b(semana que viene|proxima semana)\b/.test(t)) return fromDays(7);
  if (/\b(fin de mes|fines de mes)\b/.test(t)) {
    const last = new Date(Date.UTC(today.y, today.m, 0)).getUTCDate();
    return fromDays(last - today.d);
  }

  // "en 10 dias", "en 2 semanas", "en un mes"
  const rel = t.match(/\ben (\d+|un|una|dos|tres|cuatro) (dia|dias|semana|semanas|mes|meses)\b/);
  if (rel) {
    const n = /^\d+$/.test(rel[1]) ? Number(rel[1]) : NUMBER_WORDS[rel[1]] || 1;
    const unit = rel[2].startsWith("dia") ? 1 : rel[2].startsWith("semana") ? 7 : 30;
    return fromDays(n * unit);
  }

  // "20/11", "20-11-2026", "20/11/26" (sobre el texto crudo: normalizeText saca la "/")
  const num = String(input).match(/(?:^|[^\d])(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?(?!\d)/);
  if (num) {
    const y = num[3] ? (num[3].length === 2 ? 2000 + Number(num[3]) : Number(num[3])) : today.y;
    return fromDate(y, Number(num[2]), Number(num[1]));
  }

  // "15 de noviembre", "el 3 de diciembre"
  const named = t.match(/\b(\d{1,2}) de (\w+)\b/);
  if (named && MONTHS[named[2]]) return fromDate(today.y, MONTHS[named[2]], Number(named[1]));

  // "para el viernes" → el próximo viernes (si hoy es viernes, el de la semana que viene)
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      const diff = (wd - today.weekday + 7) % 7 || 7;
      return fromDays(diff);
    }
  }

  // "para el 20" (solo el día): este mes, o el que viene si ya pasó
  const dayOnly = t.match(/\b(?:para el|el dia|el) (\d{1,2})\b(?! de| x|x)/);
  if (dayOnly) {
    const d = Number(dayOnly[1]);
    return d >= today.d
      ? fromDate(today.y, today.m, d)
      : today.m === 12
        ? fromDate(today.y + 1, 1, d)
        : fromDate(today.y, today.m + 1, d);
  }

  return null;
}

/**
 * Días hábiles desde mañana hasta la fecha (inclusive): los plazos de
 * fabricación son hábiles. Jueves → domingo = 1 (solo el viernes) con L-V.
 */
export function businessDaysUntil(
  date: string,
  workingDays: number[] = [1, 2, 3, 4, 5],
  now = new Date()
): number {
  const today = todayAR(now);
  const base = Date.UTC(today.y, today.m - 1, today.d);
  const [y, m, d] = date.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  let count = 0;
  for (let ts = base + DAY_MS; ts <= target; ts += DAY_MS) {
    if (workingDays.includes(new Date(ts).getUTCDay())) count += 1;
  }
  return count;
}

/** "20 de noviembre" para mostrar una fecha yyyy-mm-dd. */
export function formatNeededBy(date: string | null): string {
  if (!date) return "sin apuro";
  const [y, m, d] = date.split("-").map(Number);
  const month = Object.keys(MONTHS).find((k) => MONTHS[k] === m && k !== "setiembre") || "";
  return `${d} de ${month}${y !== new Date().getFullYear() ? ` de ${y}` : ""}`;
}
