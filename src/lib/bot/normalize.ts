// Normalización de texto en castellano para el matcher (puro, sin deps).

const STOPWORDS = new Set([
  "a", "al", "algo", "con", "de", "del", "el", "en", "es", "esa", "ese", "eso",
  "esta", "este", "esto", "la", "las", "le", "lo", "los", "me", "mi", "o", "para",
  "por", "que", "se", "si", "su", "te", "tu", "un", "una", "uno", "unos", "unas",
  "y", "ya", "yo", "che", "porfa", "favor", "pf", "pls", "q", "x",
]);

/** minúsculas, sin acentos, sin signos; conserva "90x140" y "1,50". */
export function normalizeText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ.,\s]/g, " ")
    // "." y "," solo se conservan entre dígitos (decimales de medidas).
    .replace(/[.,]/g, (m, off: number, str: string) =>
      /\d/.test(str[off - 1] || "") && /\d/.test(str[off + 1] || "") ? m : " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

// Formas verbales frecuentes llevadas a una sola ("salen" = "sale").
const CANON: Record<string, string> = {
  salen: "sale", cuestan: "cuesta", valen: "vale", tenes: "tienen", tiene: "tienen",
  tenen: "tienen", haces: "hacen", hace: "hacen", envian: "envio",
  mandan: "envio", queres: "quiero", necesito: "quiero", busco: "quiero",
};

/** Stemming mínimo: plural simple ("banderas" → "bandera") + formas canónicas. */
function stem(word: string): string {
  if (CANON[word]) return CANON[word];
  if (word.length > 3 && word.endsWith("s") && !/\d/.test(word)) return word.slice(0, -1);
  return word;
}

/** Tokens significativos (sin stopwords, con stemming). */
export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w))
    .map(stem);
}

/** Similitud de Dice entre dos listas de tokens (0–1). */
export function diceSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const uniqA = Array.from(new Set(a));
  const inter = uniqA.filter((t) => setB.has(t)).length;
  return (2 * inter) / (uniqA.length + setB.size);
}
