// Pipeline entrante del webhook de WhatsApp: normaliza los mensajes de Meta y
// los persiste como contactos + mensajes. La parte PURA (normalizeChangeValue,
// extractContent) no toca Firestore y es testeable sola.
//
// Coexistencia: los `message_echoes[]` son lo que el dueño mandó desde el celular
// → direction=outbound, isEcho=true, contacto = `echo.to` (no `from`, que es el
// propio número del negocio). Los echoes NO incrementan unread.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { getChannelByPhoneNumberId } from "./integration";
import { NormalizedInbound, normalizeChangeValue } from "./inboundNormalize";
import { pauseBotForHuman, runBotForInbound } from "./botBridge";
import {
  EWhatsappContactStatus,
  EWhatsappMessageDirection,
  EWhatsappMessageStatus,
  EWhatsappMessageType,
} from "@/types/whatsapp";

export { normalizeChangeValue, extractContent } from "./inboundNormalize";
export type { NormalizedInbound } from "./inboundNormalize";

/** Normaliza el `type` de Meta a nuestro enum (fallback a UNSUPPORTED). */
function toMessageType(type: string): EWhatsappMessageType {
  const known = Object.values(EWhatsappMessageType) as string[];
  return known.includes(type)
    ? (type as EWhatsappMessageType)
    : EWhatsappMessageType.UNSUPPORTED;
}

// ---------------------------------------------------------------------------
// Persistencia (Firestore)
// ---------------------------------------------------------------------------

/**
 * Persiste un mensaje normalizado: findOrCreate del contacto + insert idempotente
 * del mensaje (doc id = wamid → `.create()` falla si ya existe → skip). Actualiza
 * los agregados del contacto (lastMessageAt / lastInboundAt / unreadCount).
 */
async function persistMessage(channelId: string, msg: NormalizedInbound): Promise<boolean> {
  const db = getFirestoreAdmin();
  const contactRef = db.collection(collections.WHATSAPP_CONTACTS).doc(msg.waId);
  const messageRef = db.collection(collections.WHATSAPP_MESSAGES).doc(msg.wamid);
  const at = msg.timestampMs ? Timestamp.fromMillis(msg.timestampMs) : Timestamp.now();
  const isInbound = !msg.isEcho;
  const direction = msg.isEcho
    ? EWhatsappMessageDirection.OUTBOUND
    : EWhatsappMessageDirection.INBOUND;

  let created = false;
  try {
    await db.runTransaction(async (tx) => {
      created = false;
      const existing = await tx.get(messageRef);
      if (existing.exists) return; // idempotencia por wamid
      created = true;
      const contactSnap = await tx.get(contactRef);

      // Insert del mensaje.
      tx.set(messageRef, {
        wamid: msg.wamid,
        contactId: msg.waId,
        channelId,
        direction,
        type: toMessageType(msg.type),
        content: msg.content ?? null,
        metadata: msg.isEcho ? { isEcho: true } : {},
        replyToWamid: msg.replyToWamid ?? null,
        status: msg.isEcho
          ? EWhatsappMessageStatus.SENT
          : EWhatsappMessageStatus.DELIVERED,
        errorCode: null,
        errorMessage: null,
        sentAt: msg.isEcho ? at : null,
        deliveredAt: isInbound ? at : null,
        readAt: null,
        createdAt: at,
        updatedAt: FieldValue.serverTimestamp(),
        deletedAt: null,
      });

      // Agregados del contacto. Los echoes NO incrementan unread.
      const contactUpdate: Record<string, any> = {
        waId: msg.waId,
        phoneE164: `+${msg.waId}`,
        channelId,
        lastMessageAt: at,
        lastMessagePreview: msg.content ?? `[${msg.type}]`,
        lastMessageDirection: direction,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (isInbound) {
        contactUpdate.lastInboundAt = at;
        contactUpdate.unreadCount = FieldValue.increment(1);
      }
      if (!contactSnap.exists) {
        contactUpdate.status = EWhatsappContactStatus.OPEN;
        contactUpdate.unreadCount = isInbound ? 1 : 0;
        contactUpdate.createdAt = at;
        contactUpdate.deletedAt = null;
        if (msg.contactName) contactUpdate.name = msg.contactName;
        tx.set(contactRef, contactUpdate);
      } else {
        if (msg.contactName && !contactSnap.data()?.name) {
          contactUpdate.name = msg.contactName;
        }
        tx.set(contactRef, contactUpdate, { merge: true });
      }
    });
  } catch (error) {
    console.error(`[whatsapp inbound] error persistiendo wamid=${msg.wamid}:`, error);
    throw error;
  }
  return created;
}

const STATUS_RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/**
 * Estado de entrega de un saliente (sent → delivered → read, o failed). Nunca
 * baja de estado: Meta puede mandar "delivered" después de "read".
 */
async function applyStatus(st: any): Promise<void> {
  const wamid = st?.id;
  const status = st?.status;
  if (!wamid || !(status in STATUS_RANK)) return;
  try {
    const db = getFirestoreAdmin();
    const snap = await db
      .collection(collections.WHATSAPP_MESSAGES)
      .where("wamid", "==", wamid)
      .limit(1)
      .get();
    const ref = snap.docs[0]?.ref;
    if (!ref) return;
    const current = snap.docs[0].data()?.status as string;
    if (status !== "failed" && (STATUS_RANK[current] ?? 0) >= STATUS_RANK[status]) return;
    const at = st?.timestamp ? Timestamp.fromMillis(Number(st.timestamp) * 1000) : Timestamp.now();
    const err = Array.isArray(st?.errors) ? st.errors[0] : null;
    await ref.update({
      status,
      ...(status === "delivered" ? { deliveredAt: at } : {}),
      ...(status === "read" ? { readAt: at } : {}),
      ...(status === "failed"
        ? {
            errorCode: err?.code != null ? String(err.code) : null,
            errorMessage: err?.error_data?.details || err?.message || err?.title || "No se pudo entregar",
          }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error(`[whatsapp inbound] error aplicando estado ${status} a ${wamid}:`, error);
  }
}

/**
 * Procesa un payload completo del webhook: por cada change resuelve el canal por
 * phone_number_id (desconocido → warning + skip, no error), normaliza y persiste.
 * Reacciones/borrados y estados/errores se manejan en la fase siguiente.
 */
export async function processInboundPayload(payload: any): Promise<void> {
  // Mensajes nuevos (no reintentos de Meta) para pasarle al bot al final.
  const fresh: NormalizedInbound[] = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const field = change?.field;
      if (field === "messages" && Array.isArray(change?.value?.statuses)) {
        for (const st of change.value.statuses) await applyStatus(st);
      }
      const isEcho = field === "smb_message_echoes";
      if (field !== "messages" && !isEcho) continue; // statuses/errors → fase siguiente

      const value = change?.value || {};
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const channel = await getChannelByPhoneNumberId(phoneNumberId);
      if (!channel) {
        console.warn(
          `[whatsapp inbound] canal desconocido phone_number_id=${phoneNumberId}, se descarta`
        );
        continue;
      }

      for (const msg of normalizeChangeValue(value, isEcho)) {
        // Reacciones y borrados no son mensajes nuevos → se manejan en la fase
        // siguiente (actualizan el mensaje objetivo). Por ahora se omiten.
        if (msg.type === "reaction" || msg.type === "deleted") continue;
        if (await persistMessage(channel.id, msg)) fresh.push(msg);
      }
    }
  }

  // Bot: responde los entrantes nuevos; si el dueño contestó desde el celular
  // (echo de coexistencia), el bot se calla con ese cliente.
  for (const msg of fresh) {
    try {
      if (msg.isEcho) await pauseBotForHuman(msg.waId, "Respondió alguien del equipo desde el celular");
      else await runBotForInbound(msg);
    } catch (error) {
      // El bot nunca rompe el webhook (Meta reintentaría y duplicaría).
      console.error(`[whatsapp bot] error con wamid=${msg.wamid}:`, error);
    }
  }
}
