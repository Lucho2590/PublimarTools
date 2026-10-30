// Tipo de cliente (escuela, municipio, revendedor, particular…): se deduce por
// palabras del mensaje; si no aparece, el flujo lo pregunta antes del resumen.

import { TBotCustomerSegment } from "@/types/bot";
import { normalizeText, tokenize } from "./normalize";

/** Primer tipo cuya palabra/frase aparece en el texto, o null. */
export function detectSegment(
  text: string,
  segments: TBotCustomerSegment[]
): TBotCustomerSegment | null {
  const norm = ` ${normalizeText(text)} `;
  const tokens = new Set(tokenize(text));
  for (const segment of segments) {
    for (const kw of segment.keywords || []) {
      const k = normalizeText(kw);
      if (!k) continue;
      if (k.includes(" ")) {
        if (norm.includes(` ${k} `)) return segment;
      } else if (tokenize(k).some((t) => tokens.has(t))) {
        return segment;
      }
    }
  }
  return null;
}
