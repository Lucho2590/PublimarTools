// Envío saliente de texto libre. Crea el mensaje `pending` ANTES de llamar a Meta
// (UI optimista + un fallo queda visible), respeta la ventana de 24 h y NUNCA
// lanza excepción hacia la UI: devuelve un Result.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { INTEGRATION_DOC_ID, getChannelByPhoneNumberId, resolveAccessToken } from "./integration";
import { sendTextMessage } from "./cloudApi";
import { isWithinServiceWindow } from "./outboundHelpers";
import {
  EWhatsappMessageDirection,
  EWhatsappMessageStatus,
  EWhatsappMessageType,
} from "@/types/whatsapp";

export type SendResult =
  | { ok: true; messageId: string; wamid: string | null }
  | { ok: false; error: string; code?: string };

/**
 * Argentina: los celulares llegan como 549XXXXXXXXXX, pero Meta a veces solo
 * acepta enviar al formato sin el 9 (54XXXXXXXXXX) — p. ej. la lista de
 * destinatarios del número de prueba (error 131030). Si pasa, se reintenta sin
 * el 9 y se recuerda en el contacto (`sendToWaId`) para los próximos envíos.
 */
async function sendWithArgentineFallback(
  phoneNumberId: string,
  contact: any,
  contactRef: FirebaseFirestore.DocumentReference,
  body: string,
  token: string
): Promise<{ wamid: string | null }> {
  const to: string = contact.sendToWaId || contact.waId;
  try {
    return await sendTextMessage(phoneNumberId, to, body, token);
  } catch (error: any) {
    const alt = to.startsWith("549") ? `54${to.slice(3)}` : null;
    if (!alt || Number(error?.code) !== 131030) throw error;
    const result = await sendTextMessage(phoneNumberId, alt, body, token);
    await contactRef.set({ sendToWaId: alt }, { merge: true }).catch(() => {});
    return result;
  }
}

export async function sendText(args: {
  contactId: string;
  body: string;
  senderUid?: string;
  senderName?: string;
  /** Ej. { bot: true } para los mensajes del agente. */
  metadata?: Record<string, unknown>;
}): Promise<SendResult> {
  const { contactId, senderUid, senderName } = args;
  const body = (args.body || "").trim();
  if (!body) return { ok: false, error: "Mensaje vacío" };

  const db = getFirestoreAdmin();
  const contactRef = db.collection(collections.WHATSAPP_CONTACTS).doc(contactId);
  const contactSnap = await contactRef.get();
  if (!contactSnap.exists) return { ok: false, error: "Contacto no encontrado" };
  const contact = contactSnap.data() as any;

  // Ventana de 24 h (server-authoritative, además del candado de la UI).
  const lastInboundMs = contact.lastInboundAt?.toMillis?.() ?? null;
  if (!isWithinServiceWindow(lastInboundMs, Date.now())) {
    return {
      ok: false,
      error:
        "Fuera de la ventana de 24 h: solo se puede enviar una plantilla aprobada",
      code: "outside_window",
    };
  }

  const channel = contact.channelId
    ? await getChannelByPhoneNumberId(contact.channelId)
    : null;
  if (!channel) return { ok: false, error: "Canal de WhatsApp no configurado" };

  let token: string;
  try {
    token = await resolveAccessToken();
  } catch {
    return { ok: false, error: "Integración de WhatsApp no configurada" };
  }

  // Mensaje pending ANTES de llamar a Meta.
  const now = Timestamp.now();
  const msgRef = db.collection(collections.WHATSAPP_MESSAGES).doc();
  await msgRef.set({
    wamid: null,
    contactId,
    channelId: channel.id,
    direction: EWhatsappMessageDirection.OUTBOUND,
    type: EWhatsappMessageType.TEXT,
    content: body,
    metadata: args.metadata ?? {},
    replyToWamid: null,
    senderUid: senderUid ?? null,
    senderName: senderName ?? null,
    status: EWhatsappMessageStatus.PENDING,
    errorCode: null,
    errorMessage: null,
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    createdAt: now,
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });

  try {
    const { wamid } = await sendWithArgentineFallback(
      channel.phoneNumberId,
      contact,
      contactRef,
      body,
      token
    );
    // Guardar el wamid ANTES de que pueda llegar el echo (dedup por wamid).
    await msgRef.update({
      wamid: wamid ?? null,
      status: EWhatsappMessageStatus.SENT,
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await contactRef.set(
      {
        lastMessageAt: now,
        lastMessagePreview: body,
        lastMessageDirection: EWhatsappMessageDirection.OUTBOUND,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true, messageId: msgRef.id, wamid };
  } catch (error: any) {
    const code = error?.code != null ? String(error.code) : undefined;
    // 190 = token vencido o inválido: se marca la conexión caída para que la
    // app lo avise (Chat, Atender y Configuración) hasta que carguen otro.
    if (code === "190") {
      await db
        .collection(collections.WHATSAPP_INTEGRATION)
        .doc(INTEGRATION_DOC_ID)
        .set(
          {
            status: "error",
            error: "El token de Meta venció o dejó de ser válido",
            errorAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => {});
    }
    await msgRef
      .update({
        status: EWhatsappMessageStatus.FAILED,
        errorCode: code ?? null,
        errorMessage: error?.message ?? "Error de envío",
        updatedAt: FieldValue.serverTimestamp(),
      })
      .catch(() => {});
    return { ok: false, error: error?.message ?? "Error de envío", code };
  }
}
