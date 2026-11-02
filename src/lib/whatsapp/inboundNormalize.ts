// Normalización PURA de mensajes entrantes de Meta (sin Firestore ni imports con
// alias, para poder testearla sola). La persistencia vive en inbound.ts.
//
// Coexistencia: en un `message_echoes[]` (lo que el dueño mandó desde el celular)
// el contacto es `echo.to`, no `echo.from` (que sería el propio número).

import { canonicalizeWaId } from "./phone";

export type NormalizedInbound = {
  wamid: string;
  waId: string; // canónico E.164 sin "+"
  direction: "inbound" | "outbound";
  isEcho: boolean;
  type: string;
  content: string | null;
  replyToWamid: string | null;
  timestampMs: number | null;
  contactName: string | null;
};

/** Extrae el texto mostrable según el tipo de mensaje. */
export function extractContent(m: any, type: string): string | null {
  switch (type) {
    case "text":
      return m?.text?.body ?? null;
    case "button":
      return m?.button?.text ?? null;
    case "interactive": {
      const it = m?.interactive?.type;
      const node = it ? m?.interactive?.[it] : null;
      return node?.title ?? node?.id ?? null;
    }
    case "reaction":
      return m?.reaction?.emoji ?? null;
    case "image":
    case "video":
    case "document":
    case "audio":
    case "sticker":
      return m?.[type]?.caption ?? null;
    default:
      return null;
  }
}

/**
 * Convierte un `change.value` (de `messages` o `smb_message_echoes`) en una lista
 * de mensajes normalizados. `isEcho` distingue el origen.
 */
export function normalizeChangeValue(value: any, isEcho: boolean): NormalizedInbound[] {
  const list = isEcho ? value?.message_echoes || [] : value?.messages || [];
  const nameByWaId = new Map<string, string | null>();
  for (const c of value?.contacts || []) {
    if (c?.wa_id) nameByWaId.set(String(c.wa_id), c?.profile?.name ?? null);
  }
  return (list as any[])
    .map((m) => {
      // En un echo el contacto es `to`; en un entrante, `from`.
      const rawWaId = isEcho ? m?.to : m?.from;
      const type = m?.type || "unsupported";
      return {
        wamid: m?.id,
        waId: canonicalizeWaId(rawWaId),
        direction: isEcho ? "outbound" : "inbound",
        isEcho,
        type,
        content: extractContent(m, type),
        replyToWamid: m?.context?.id ?? null,
        timestampMs: m?.timestamp ? Number(m.timestamp) * 1000 : null,
        contactName: nameByWaId.get(String(rawWaId)) ?? null,
      } as NormalizedInbound;
    })
    .filter((m) => m.wamid && m.waId);
}
