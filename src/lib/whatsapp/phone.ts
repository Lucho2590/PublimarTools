// Canonicalización de números de WhatsApp (wa_id) a E.164 sin "+".
// ÚNICO lugar donde se normaliza el teléfono en el borde de entrada del webhook.
//
// Trampa argentina (gotcha del brief): los móviles AR necesitan el "9" tras el
// 54 (549 11 xxxx xxxx), pero el wa_id que Meta entrega en los ENTRANTES a veces
// viene SIN el 9. Comparación naive → contactos duplicados. Canonicalizamos
// SIEMPRE con el 9 para que matchee contra lo que guarda src/lib/phone.ts
// (que también produce "549…" para Argentina).

import { onlyDigits } from "../phone";

export function canonicalizeWaId(waId: string | undefined | null): string {
  let d = onlyDigits(waId);
  if (!d) return "";
  // Argentina (código 54): asegurar el 9 de móvil. Ningún código de área AR
  // empieza en 9, así que detectar "549" no es ambiguo.
  if (d.startsWith("54") && !d.startsWith("549")) {
    d = "549" + d.slice(2);
  }
  return d;
}

/** Versión mostrable con "+" (para UI/logs). */
export function toDisplayE164(waId: string | undefined | null): string {
  const d = canonicalizeWaId(waId);
  return d ? `+${d}` : "";
}
