// Normalización de texto en castellano para el matcher (puro, sin deps).

const STOPWORDS = new Set([
  "a", "al", "algo", "con", "de", "del", "el", "en", "es", "esa", "ese", "eso",
  "esta", "este", "esto", "la", "las", "le", "lo", "los", "me", "mi", "o", "para",
  "por", "que", "se", "si", "su", "te", "tu", "un", "una", "uno", "unos", "unas",
  "y", "ya", "yo", "che", "porfa", "favor", "pf", "pls", "q", "x",
  "puedo", "puede", "podes", "podria", "podrias", "saber", "decime", "dime",
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
  salen: "sale", cuestan: "sale", valen: "sale", tenes: "tienen", tiene: "tienen",
  tenen: "tienen", haces: "hacen", hace: "hacen", envian: "envio",
  mandan: "envio", queres: "quiero", necesito: "quiero", busco: "quiero",
  queria: "quiero", quisiera: "quiero", quiere: "quiero", quieren: "quiero",
  necesitaria: "quiero", necesitamos: "quiero", buscamos: "quiero", queremos: "quiero",
  cuesta: "sale", vale: "sale", valor: "precio", precios: "precio",
  pasas: "pasa", pasarme: "pasa", mandas: "pasa", tenemos: "tienen",
  encontrar: "encuentro", encuentran: "encuentro", encuentra: "encuentro", ubicado: "encuentro",
  ubicados: "encuentro", ubican: "encuentro", ubicacion: "direccion", queda: "quedan",
  pagar: "pago", pagarlo: "pago", pagarla: "pago", abonar: "pago", abono: "pago", paga: "pago",
  holaa: "hola", holaaa: "hola", hla: "hola", bnas: "buenas", graciass: "gracias", grax: "gracias",
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

/**
 * ¿Difieren en a lo sumo una letra (agregada, faltante, cambiada o dos
 * vecinas invertidas)? "enviso" ≈ "envio", "presio" ≈ "precio".
 */
export function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  // Solo palabras largas: en cortas un error cambia el sentido ("hola" ≠ "hora").
  if (Math.min(a.length, b.length) < 5 || Math.max(a.length, b.length) < 6) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // una cambiada
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // invertidas
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i); // una de más / de menos
}

/** Similitud de Dice entre dos listas de tokens (0–1), tolerante a un error de tipeo. */
export function diceSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const uniqB = Array.from(new Set(b));
  const uniqA = Array.from(new Set(a));
  const inter = uniqA.filter((t) => uniqB.some((u) => nearlyEqual(t, u))).length;
  return (2 * Math.min(inter, uniqB.length)) / (uniqA.length + uniqB.length);
}
