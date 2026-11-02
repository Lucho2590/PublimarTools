// Helpers server-side (firebase-admin) para las credenciales de la integración
// y el alta de canales. El token se guarda CIFRADO y se descifra solo acá.

import { FieldValue } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { decryptToken, encryptToken } from "./crypto";
import { listPhoneNumbers, subscribeApps } from "./cloudApi";
import { COEXISTENCE_FEATURE_TYPE } from "./constants";

export const INTEGRATION_DOC_ID = "default";

export async function getIntegration(): Promise<Record<string, any> | null> {
  const db = getFirestoreAdmin();
  const snap = await db
    .collection(collections.WHATSAPP_INTEGRATION)
    .doc(INTEGRATION_DOC_ID)
    .get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/** Descifra el access token de la integración. Lanza si no está configurada. */
export async function resolveAccessToken(): Promise<string> {
  const integ = await getIntegration();
  if (!integ?.accessTokenEnc) {
    throw new Error("Integración de WhatsApp no configurada");
  }
  return decryptToken(integ.accessTokenEnc);
}

export async function getChannelByPhoneNumberId(
  phoneNumberId: string
): Promise<Record<string, any> | null> {
  const db = getFirestoreAdmin();
  const snap = await db
    .collection(collections.WHATSAPP_CHANNELS)
    .doc(phoneNumberId)
    .get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Alta MANUAL con token de System User: valida el número contra Meta, suscribe
 * la app a los webhooks de la WABA, y hace upsert de la integración (token
 * cifrado) y del canal. Idempotente (reconectar no duplica).
 */
export async function connectManual(args: {
  wabaId: string;
  phoneNumberId: string;
  token: string;
  createdBy?: string;
}): Promise<{ wabaId: string; phoneNumberId: string; displayPhoneNumber?: string }> {
  const { wabaId, phoneNumberId, token, createdBy } = args;

  // 1. Validar que el número pertenece a la WABA (y que el token sirve).
  const numbers = await listPhoneNumbers(wabaId, token);
  const match = numbers.find((n) => n.id === phoneNumberId);
  if (!match) {
    throw new Error(
      `El phoneNumberId ${phoneNumberId} no pertenece a la WABA ${wabaId} (o el token no tiene acceso)`
    );
  }

  // 2. Suscribir la app a los webhooks de la WABA (gotcha: sin esto, 0 webhooks).
  await subscribeApps(wabaId, token);

  const db = getFirestoreAdmin();

  // 3. Upsert de la integración (token cifrado). Preservar createdAt si existe.
  const integRef = db
    .collection(collections.WHATSAPP_INTEGRATION)
    .doc(INTEGRATION_DOC_ID);
  const integSnap = await integRef.get();
  await integRef.set(
    {
      provider: "meta_whatsapp",
      wabaId,
      accessTokenEnc: encryptToken(token),
      status: "connected",
      coexistenceEnabled: false,
      featureType: COEXISTENCE_FEATURE_TYPE,
      error: null,
      updatedAt: FieldValue.serverTimestamp(),
      ...(integSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      ...(createdBy ? { createdBy } : {}),
    },
    { merge: true }
  );

  // 4. Upsert del canal (restaurar si estaba soft-deleted).
  const channelRef = db
    .collection(collections.WHATSAPP_CHANNELS)
    .doc(phoneNumberId);
  const channelSnap = await channelRef.get();
  await channelRef.set(
    {
      integrationId: INTEGRATION_DOC_ID,
      phoneNumberId,
      wabaId,
      displayPhoneNumber: match.display_phone_number || null,
      verifiedName: match.verified_name || null,
      qualityRating: match.quality_rating || null,
      registered: match.code_verification_status === "VERIFIED",
      status: "active",
      defaultForSending: true,
      deletedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      ...(channelSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );

  return {
    wabaId,
    phoneNumberId,
    displayPhoneNumber: match.display_phone_number,
  };
}
