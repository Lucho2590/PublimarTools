// Envío saliente de texto libre. Crea el mensaje `pending` ANTES de llamar a Meta
// (UI optimista + un fallo queda visible), respeta la ventana de 24 h y NUNCA
// lanza excepción hacia la UI: devuelve un Result.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { getChannelByPhoneNumberId, resolveAccessToken } from "./integration";
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

export async function sendText(args: {
  contactId: string;
  body: string;
  senderUid?: string;
  senderName?: string;
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
    metadata: {},
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
    const { wamid } = await sendTextMessage(
      channel.phoneNumberId,
      contact.waId,
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
