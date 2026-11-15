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
  /** Importado del historial del celular (coexistencia): no se contesta ni cuenta como no leído. */
  fromHistory?: boolean;
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

// ---------------------------------------------------------------------------
// Coexistencia: historial y contactos del celular
// ---------------------------------------------------------------------------

/** Código de Meta cuando el dueño eligió NO compartir el historial. */
export const HISTORY_DECLINED_CODE = 2593109;

export type NormalizedHistory = {
  messages: NormalizedInbound[];
  /** Mayor `progress` (0–100) visto en este webhook; null si no vino. */
  progress: number | null;
  phase: number | null;
  /** El dueño no compartió el historial (o Meta mandó un error). */
  error: { code: number | null; message: string } | null;
};

/**
 * Convierte el `value` de un webhook `history` en mensajes normalizados. Cada
 * thread es una charla con un cliente; un mensaje es entrante si `from` es el
 * cliente y saliente si lo mandó el negocio.
 */
export function normalizeHistoryValue(value: any): NormalizedHistory {
  const out: NormalizedHistory = { messages: [], progress: null, phase: null, error: null };
  for (const batch of value?.history || []) {
    const err = Array.isArray(batch?.errors) ? batch.errors[0] : null;
    if (err) {
      out.error = {
        code: err.code != null ? Number(err.code) : null,
        message: err?.error_data?.details || err?.message || err?.title || "Error de historial",
      };
      continue;
    }
    const progress = Number(batch?.metadata?.progress);
    if (Number.isFinite(progress)) out.progress = Math.max(out.progress ?? 0, progress);
    const phase = Number(batch?.metadata?.phase);
    if (Number.isFinite(phase)) out.phase = Math.max(out.phase ?? 0, phase);

    for (const thread of batch?.threads || []) {
      const contactWaId = canonicalizeWaId(thread?.context?.wa_id || thread?.id);
      if (!contactWaId) continue;
      for (const m of thread?.messages || []) {
        const type = m?.type || "unsupported";
        const inbound = canonicalizeWaId(m?.from) === contactWaId;
        out.messages.push({
          wamid: m?.id,
          waId: contactWaId,
          direction: inbound ? "inbound" : "outbound",
          isEcho: false,
          type,
          content:
            type === "media_placeholder" ? "📎 Archivo (del historial)" : extractContent(m, type),
          replyToWamid: m?.context?.id ?? null,
          timestampMs: m?.timestamp ? Number(m.timestamp) * 1000 : null,
          contactName: null,
          fromHistory: true,
        });
      }
    }
  }
  out.messages = out.messages.filter((m) => m.wamid && m.waId);
  return out;
}

export type NormalizedPhonebookEntry = {
  waId: string;
  /** null en `remove`. */
  name: string | null;
  action: "add" | "remove";
};

/** Contactos agendados en el celular del negocio (webhook `smb_app_state_sync`). */
export function normalizeStateSyncValue(value: any): NormalizedPhonebookEntry[] {
  return ((value?.state_sync || []) as any[])
    .filter((s) => s?.type === "contact" && s?.contact?.phone_number)
    .map((s) => ({
      waId: canonicalizeWaId(s.contact.phone_number),
      name: s.action === "remove" ? null : s.contact.full_name || s.contact.first_name || null,
      action: (s.action === "remove" ? "remove" : "add") as "add" | "remove",
    }))
    .filter((e) => e.waId);
}
