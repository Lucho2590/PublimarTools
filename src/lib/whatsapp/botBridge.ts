// Puente WhatsApp ⇄ bot: cada mensaje entrante NUEVO pasa por el mismo motor
// que el simulador (src/lib/bot/engine.ts) y las respuestas salen por la Cloud
// API. La sesión del bot usa el wa_id del contacto como id ("5492235551234").

import { Timestamp } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { handleIncoming } from "@/lib/bot/engine";
import { getBotConfig } from "@/lib/bot/store";
import { TBotReply } from "@/types/bot";
import { NormalizedInbound } from "./inboundNormalize";
import { sendText } from "./outbound";

const TEXT_TYPES = new Set(["text", "button", "interactive"]);

/**
 * Las respuestas con botones/lista se mandan como texto con opciones numeradas
 * (mismo formato que el modo sin botones). Los mensajes interactivos nativos de
 * WhatsApp quedan para más adelante.
 */
function replyAsText(reply: TBotReply): string {
  if (reply.type === "text") return reply.text;
  if (reply.type === "buttons") return reply.text;
  const lines = reply.rows.map(
    (r, i) => `${i + 1}. ${r.title}${r.description ? ` — ${r.description}` : ""}`
  );
  return `${reply.text}\n\n${lines.join("\n")}\n\n_Escribime el número o lo que buscás._`;
}

/** Un mensaje entrante → bot → respuestas por WhatsApp (marcadas como del agente). */
export async function runBotForInbound(msg: NormalizedInbound): Promise<void> {
  const isText = TEXT_TYPES.has(msg.type) && !!msg.content;
  const result = await handleIncoming({
    sessionId: msg.waId,
    channel: "whatsapp",
    phone: msg.waId,
    text: isText ? msg.content : null,
    mediaType: isText ? null : msg.type,
  });

  for (const reply of result.replies) {
    const body = replyAsText(reply);
    const sent = await sendText({
      contactId: msg.waId,
      body,
      senderName: "Agente",
      metadata: { bot: true },
    });
    if (!sent.ok) {
      console.error(`[whatsapp bot] no se pudo enviar a ${msg.waId}: ${sent.error}`);
      break;
    }
  }
}

/**
 * Respondió una persona (desde el celular con coexistencia, o desde la app):
 * el bot se calla con ese cliente por unas horas. No la marca "por atender":
 * ya la está atendiendo alguien.
 */
export async function pauseBotForHuman(waId: string, reason: string): Promise<void> {
  const config = await getBotConfig();
  const hours = config.handoffPauseHours || 12;
  await getFirestoreAdmin()
    .collection(collections.BOT_SESSIONS)
    .doc(waId)
    .set(
      {
        channel: "whatsapp",
        phone: waId,
        status: "handoff",
        pausedUntil: Timestamp.fromDate(new Date(Date.now() + hours * 3600 * 1000)),
        needsAttention: false,
        handoffReason: reason,
        handoffAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
}
