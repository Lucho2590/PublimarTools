// Matcher de intenciones entrenadas: compara el mensaje contra las frases de
// ejemplo de cada intención. Puro y barato: es la capa que evita llamar a la IA.

import { EBotAction, TBotIntent } from "@/types/bot";
import { diceSimilarity, normalizeText, tokenize } from "./normalize";

export type TIntentMatch = { intent: TBotIntent; score: number; example: string };

/** Mejor intención para el texto (o null si no hay ninguna con score > 0). */
export function matchIntent(text: string, intents: TBotIntent[]): TIntentMatch | null {
  const norm = normalizeText(text);
  const tokens = tokenize(text);
  if (!norm) return null;

  const scored: TIntentMatch[] = [];
  for (const intent of intents) {
    if (!intent.enabled) continue;
    let best: TIntentMatch | null = null;
    for (const example of intent.examples || []) {
      const exNorm = normalizeText(example);
      if (!exNorm) continue;
      const score = exNorm === norm ? 1 : diceSimilarity(tokens, tokenize(example));
      if (!best || score > best.score) best = { intent, score, example };
    }
    if (best && best.score > 0) scored.push(best);
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);

  // "hola, cuánto sale la argentina": el saludo no debe tapar la consulta real.
  const [first, second] = scored;
  if (first.intent.action === EBotAction.GREETING && second && second.score >= 0.3) {
    return second;
  }
  return first;
}
