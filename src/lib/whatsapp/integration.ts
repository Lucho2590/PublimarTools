// Helpers server-side (firebase-admin) para las credenciales de la integración
// y el alta/baja de canales. El token se guarda CIFRADO y se descifra solo acá.
//
// Hay un solo número activo a la vez: conectar uno nuevo desactiva los demás, y
// un canal inactivo se ignora en el webhook y en los envíos.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { decryptToken, encryptToken } from "./crypto";
import {
  CloudApiError,
  MetaPhoneNumber,
  exchangeCodeForToken,
  getPhoneCoexistence,
  getTokenExpiry,
  getTokenWabaIds,
  listPhoneNumbers,
  requestSmbSync,
  subscribeApps,
  unsubscribeApps,
} from "./cloudApi";
import { COEXISTENCE_FEATURE_TYPE } from "./constants";
import { HISTORY_DECLINED_CODE, NormalizedPhonebookEntry } from "./inboundNormalize";
import { TWhatsappOnboardingMethod } from "@/types/whatsapp";

export const INTEGRATION_DOC_ID = "default";

function integrationRef() {
  return getFirestoreAdmin().collection(collections.WHATSAPP_INTEGRATION).doc(INTEGRATION_DOC_ID);
}

export async function getIntegration(): Promise<Record<string, any> | null> {
  const snap = await integrationRef().get();
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

/** Un canal desvinculado (o borrado) no recibe ni manda mensajes. */
export function isChannelActive(channel: Record<string, any> | null | undefined): boolean {
  return !!channel && channel.status !== "inactive" && !channel.deletedAt && !channel.deleted;
}

/** Canal ACTIVO por phone_number_id (null si no existe o fue desvinculado). */
export async function getChannelByPhoneNumberId(
  phoneNumberId: string
): Promise<Record<string, any> | null> {
  const snap = await getFirestoreAdmin()
    .collection(collections.WHATSAPP_CHANNELS)
    .doc(phoneNumberId)
    .get();
  const channel = snap.exists ? { id: snap.id, ...snap.data() } : null;
  return isChannelActive(channel) ? channel : null;
}

/** El número con el que se manda por defecto (el único activo). */
export async function getDefaultChannel(): Promise<Record<string, any> | null> {
  const snap = await getFirestoreAdmin()
    .collection(collections.WHATSAPP_CHANNELS)
    .where("defaultForSending", "==", true)
    .get();
  const active = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isChannelActive);
  return active[0] ?? null;
}

/** Desactiva todos los canales activos salvo `keepId`. */
async function deactivateChannels(keepId?: string): Promise<void> {
  const db = getFirestoreAdmin();
  const snap = await db.collection(collections.WHATSAPP_CHANNELS).get();
  await Promise.all(
    snap.docs
      .filter((d) => d.id !== keepId && (isChannelActive(d.data()) || d.data().defaultForSending))
      .map((d) =>
        d.ref.update({
          status: "inactive",
          defaultForSending: false,
          updatedAt: FieldValue.serverTimestamp(),
        })
      )
  );
}

/** Campos del vencimiento del token para la integración (`undefined` = no se pudo saber). */
function tokenExpiryFields(expiry: Date | null | undefined): Record<string, unknown> {
  if (expiry === undefined) return { tokenExpiresAt: null, tokenExpiryKnown: false };
  return { tokenExpiresAt: expiry ? Timestamp.fromDate(expiry) : null, tokenExpiryKnown: true };
}

/**
 * Guarda la integración (token cifrado) y el canal, y deja ese número como el
 * único activo. Idempotente: reconectar el mismo número no duplica nada.
 */
async function saveConnection(args: {
  wabaId: string;
  token: string;
  phone: MetaPhoneNumber;
  method: TWhatsappOnboardingMethod;
  coexistence: boolean;
  createdBy?: string;
}): Promise<void> {
  const { wabaId, token, phone, method, coexistence, createdBy } = args;
  const db = getFirestoreAdmin();

  const integRef = integrationRef();
  const integSnap = await integRef.get();
  const expiry = await getTokenExpiry(token);
  await integRef.set(
    {
      provider: "meta_whatsapp",
      wabaId,
      phoneNumberId: phone.id,
      accessTokenEnc: encryptToken(token),
      ...tokenExpiryFields(expiry),
      status: "connected",
      coexistenceEnabled: coexistence,
      featureType: COEXISTENCE_FEATURE_TYPE,
      onboardingMethod: method,
      onboardedAt: FieldValue.serverTimestamp(),
      // Un alta nueva arranca de cero: sin sync previo, sin desvinculación pendiente.
      contactsSync: null,
      historySyncRequest: null,
      historySync: null,
      disconnect: null,
      error: null,
      updatedAt: FieldValue.serverTimestamp(),
      ...(integSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      ...(createdBy ? { createdBy } : {}),
    },
    { merge: true }
  );

  const channelRef = db.collection(collections.WHATSAPP_CHANNELS).doc(phone.id);
  const channelSnap = await channelRef.get();
  await channelRef.set(
    {
      integrationId: INTEGRATION_DOC_ID,
      phoneNumberId: phone.id,
      wabaId,
      displayPhoneNumber: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
      qualityRating: phone.quality_rating || null,
      registered: coexistence || phone.code_verification_status === "VERIFIED",
      coexistence,
      status: "active",
      defaultForSending: true,
      deleted: false,
      deletedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      ...(channelSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );

  await deactivateChannels(phone.id);
}

/**
 * Alta MANUAL con token de System User (número de prueba de Meta o números
 * dados de alta solo en la API, sin coexistencia).
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

  // 3. Guardar integración + canal.
  await saveConnection({ wabaId, token, phone: match, method: "manual", coexistence: false, createdBy });

  return { wabaId, phoneNumberId, displayPhoneNumber: match.display_phone_number };
}

/** Elige el número de la WABA: el pedido, el único, o el que está en la app del celular. */
async function pickPhoneNumber(
  numbers: MetaPhoneNumber[],
  token: string,
  phoneNumberId?: string | null
): Promise<MetaPhoneNumber> {
  if (phoneNumberId) {
    const match = numbers.find((n) => n.id === phoneNumberId);
    if (match) return match;
  }
  if (numbers.length === 1) return numbers[0];
  if (!numbers.length) throw new Error("La cuenta de WhatsApp que elegiste en Meta no tiene ningún número");
  for (const n of numbers) {
    const coex = await getPhoneCoexistence(n.id, token);
    if (coex?.isOnBizApp) return n;
  }
  throw new Error(
    `La cuenta de WhatsApp tiene varios números (${numbers
      .map((n) => n.display_phone_number)
      .join(", ")}) y no pudimos saber cuál conectaste. Avisale al administrador.`
  );
}

/** Mensaje cuando Meta reusó un permiso anterior en vez de hacer el alta nueva. */
const REUSED_GRANT_ERROR =
  "Meta usó la configuración anterior en vez de conectar tu número. Volvé a tocar \"Abrir Meta\" y, si aparece \"¿Quieres continuar con tu configuración anterior?\", tocá \"Editar configuración\" (no \"Continuar\") y elegí \"Conectar tu app de WhatsApp Business existente\".";

/**
 * Cuenta + número del alta. Con el waba_id del popup, se busca el número ahí.
 * Sin él (Meta no mandó los datos de la sesión), se buscan en las cuentas que
 * habilita el permiso, pero SOLO se acepta un número que esté en la app del
 * celular (coexistencia): si no, el permiso es uno viejo reutilizado (por
 * ejemplo el del número de prueba de Meta) y conectarlo sería un error.
 */
async function resolveAccountAndPhone(
  token: string,
  wabaId?: string | null,
  phoneNumberId?: string | null
): Promise<{ wabaId: string; phone: MetaPhoneNumber }> {
  if (wabaId) {
    const numbers = await listPhoneNumbers(wabaId, token);
    return { wabaId, phone: await pickPhoneNumber(numbers, token, phoneNumberId) };
  }
  const candidates = await getTokenWabaIds(token);
  if (!candidates.length) throw new Error(REUSED_GRANT_ERROR);
  for (const id of candidates) {
    const numbers = await listPhoneNumbers(id, token).catch(() => [] as MetaPhoneNumber[]);
    for (const n of numbers) {
      if ((await getPhoneCoexistence(n.id, token))?.isOnBizApp) return { wabaId: id, phone: n };
    }
  }
  throw new Error(REUSED_GRANT_ERROR);
}

export type EmbeddedConnectResult = {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  coexistence: boolean;
  contactsSyncError?: string | null;
  historySyncError?: string | null;
};

/**
 * Alta por Embedded Signup (el popup de Meta). Con coexistencia el número sigue
 * en la app WhatsApp Business del celular: NO se llama a /register (ya está
 * registrado) y se pide UNA vez la sincronización de contactos e historial
 * (Meta solo la acepta dentro de las 24 h del alta).
 */
export async function connectEmbedded(args: {
  code: string;
  /** Lo manda el popup de Meta; si no llegó, se averigua con el token. */
  wabaId?: string | null;
  phoneNumberId?: string | null;
  /** El popup terminó por el camino "conectar la app WhatsApp Business existente". */
  businessAppOnboarding?: boolean;
  createdBy?: string;
}): Promise<EmbeddedConnectResult> {
  const { code, createdBy } = args;

  // 1. Canjear el code (vence a los ~30 s) por el token del negocio.
  const token = await exchangeCodeForToken(code);

  // 2. Cuenta de WhatsApp: la que mandó el popup o, si no llegó, la que el
  //    permiso dice que se compartió. Después, el número dentro de la cuenta
  //    (en coexistencia Meta solo devuelve el waba_id).
  const { wabaId, phone } = await resolveAccountAndPhone(token, args.wabaId, args.phoneNumberId);

  // 3. ¿Quedó en coexistencia? Lo dice Meta; si no expone el dato, vale cómo terminó el popup.
  const coex = await getPhoneCoexistence(phone.id, token);
  const coexistence = coex ? coex.isOnBizApp : !!args.businessAppOnboarding;

  // 4. Webhooks de la WABA (sin esto no llega nada).
  await subscribeApps(wabaId, token);

  // 5. Guardar integración + canal (único activo).
  await saveConnection({ wabaId, token, phone, method: "embedded_signup", coexistence, createdBy });

  // 6. Coexistencia: pedir contactos e historial del celular (una sola vez).
  let contactsSyncError: string | null = null;
  let historySyncError: string | null = null;
  if (coexistence) {
    const ref = integrationRef();
    try {
      const { requestId } = await requestSmbSync(phone.id, token, "smb_app_state_sync");
      await ref.set(
        { contactsSync: { requestId, requestedAt: FieldValue.serverTimestamp(), error: null } },
        { merge: true }
      );
    } catch (error) {
      contactsSyncError = error instanceof Error ? error.message : String(error);
      console.error("[whatsapp] sync de contactos:", error);
      await ref.set({ contactsSync: { requestedAt: FieldValue.serverTimestamp(), error: contactsSyncError } }, { merge: true });
    }
    try {
      const { requestId } = await requestSmbSync(phone.id, token, "history");
      await ref.set(
        {
          historySyncRequest: { requestId, requestedAt: FieldValue.serverTimestamp(), error: null },
          historySync: { status: "requested", progress: 0, phase: null, messagesImported: 0, updatedAt: FieldValue.serverTimestamp() },
        },
        { merge: true }
      );
    } catch (error) {
      historySyncError = error instanceof Error ? error.message : String(error);
      console.error("[whatsapp] sync de historial:", error);
      await ref.set(
        {
          historySyncRequest: { requestedAt: FieldValue.serverTimestamp(), error: historySyncError },
          historySync: { status: "error", error: historySyncError, updatedAt: FieldValue.serverTimestamp() },
        },
        { merge: true }
      );
    }
  }

  return {
    wabaId,
    phoneNumberId: phone.id,
    displayPhoneNumber: phone.display_phone_number,
    verifiedName: phone.verified_name,
    coexistence,
    contactsSyncError,
    historySyncError,
  };
}

/**
 * Cambia SOLO el token del número conectado (ej. el de 60 días del Embedded
 * Signup por uno permanente de usuario del sistema). No toca la coexistencia,
 * el canal ni la sincronización: el número sigue igual.
 */
export async function replaceToken(args: {
  token: string;
  updatedBy?: string;
}): Promise<{ expiresAt: Date | null | undefined }> {
  const integ = await getIntegration();
  if (!integ?.wabaId || !integ?.phoneNumberId || integ.status === "disconnected") {
    throw new Error("No hay ningún número conectado para renovarle el token");
  }
  const token = args.token.trim();

  // El token nuevo tiene que poder ver ESTE número.
  let numbers: MetaPhoneNumber[];
  try {
    numbers = await listPhoneNumbers(integ.wabaId, token);
  } catch (error) {
    if (error instanceof CloudApiError && (error.code === 190 || error.httpStatus === 401)) {
      throw new Error("Meta dice que ese token no es válido. Copialo de nuevo, completo.");
    }
    throw new Error(
      "Ese token no tiene acceso a la cuenta de WhatsApp del número. Revisá que el usuario del sistema tenga asignada la cuenta de WhatsApp con control total."
    );
  }
  if (!numbers.some((n) => n.id === integ.phoneNumberId)) {
    throw new Error("Ese token no ve el número conectado. Revisá los activos asignados al usuario del sistema.");
  }

  await subscribeApps(integ.wabaId, token);
  const expiry = await getTokenExpiry(token);
  await integrationRef().set(
    {
      accessTokenEnc: encryptToken(token),
      ...tokenExpiryFields(expiry),
      status: "connected",
      error: null,
      tokenUpdatedAt: FieldValue.serverTimestamp(),
      ...(args.updatedBy ? { tokenUpdatedBy: args.updatedBy } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { expiresAt: expiry };
}

// ---------------------------------------------------------------------------
// Desvinculación
// ---------------------------------------------------------------------------

/**
 * Paso 1 de la desvinculación (desde la app). El número deja de recibir y
 * mandar YA (canal inactivo → el bot se calla). Con coexistencia queda
 * "disconnecting": la baja real del lado de Meta la hace el dueño desde el
 * celular (Meta no permite hacerlo por API), y Meta la confirma con el webhook
 * `account_update` (PARTNER_REMOVED). Sin coexistencia se termina en el acto.
 */
export async function startDisconnect(
  requestedBy: string
): Promise<{ needsPhoneStep: boolean }> {
  const integ = await getIntegration();
  if (!integ || integ.status === "disconnected") {
    throw new Error("No hay ningún número conectado");
  }
  const db = getFirestoreAdmin();
  const channelSnap = integ.phoneNumberId
    ? await db.collection(collections.WHATSAPP_CHANNELS).doc(integ.phoneNumberId).get()
    : null;
  const displayPhoneNumber = channelSnap?.data()?.displayPhoneNumber ?? null;

  await deactivateChannels();

  if (!integ.coexistenceEnabled) {
    await finishDisconnect({ confirmed: true, requestedBy, displayPhoneNumber });
    return { needsPhoneStep: false };
  }

  await integrationRef().set(
    {
      status: "disconnecting",
      disconnect: {
        requestedAt: FieldValue.serverTimestamp(),
        requestedBy,
        confirmedAt: null,
        forced: false,
        reason: null,
        initiatedBy: null,
        displayPhoneNumber,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { needsPhoneStep: true };
}

/** Errores de Meta que significan "ya no tenés acceso a esta cuenta". */
function isAccessRevoked(error: unknown): boolean {
  if (!(error instanceof CloudApiError)) return false;
  return [10, 100, 190, 200].includes(Number(error.code)) || error.httpStatus === 403;
}

/**
 * "Ya lo desconecté desde el celular": le pregunta a Meta. Si perdimos el
 * acceso a la cuenta, o el número ya no está en la app del celular, la baja
 * está confirmada y se termina la desvinculación.
 */
export async function checkDisconnect(): Promise<{ confirmed: boolean }> {
  const integ = await getIntegration();
  if (!integ) return { confirmed: true };
  if (integ.status === "disconnected") return { confirmed: !!integ.disconnect?.confirmedAt };
  if (!integ.accessTokenEnc || !integ.wabaId) {
    await finishDisconnect({ confirmed: true });
    return { confirmed: true };
  }
  const token = decryptToken(integ.accessTokenEnc);
  try {
    const numbers = await listPhoneNumbers(integ.wabaId, token);
    const phone = numbers.find((n) => n.id === integ.phoneNumberId);
    const coex = phone ? await getPhoneCoexistence(phone.id, token) : null;
    const stillLinked = !!phone && coex?.isOnBizApp !== false;
    if (stillLinked) return { confirmed: false };
  } catch (error) {
    if (!isAccessRevoked(error)) throw error;
  }
  await finishDisconnect({ confirmed: true });
  return { confirmed: true };
}

/**
 * Cierra la desvinculación: desuscribe la app de la WABA (si ningún otro
 * número activo la usa), borra el token y deja todo en "disconnected".
 * `confirmed` = Meta confirmó la baja; `forced` = se cerró sin esperar a Meta.
 */
export async function finishDisconnect(args: {
  confirmed: boolean;
  forced?: boolean;
  requestedBy?: string;
  reason?: string | null;
  initiatedBy?: string | null;
  displayPhoneNumber?: string | null;
}): Promise<void> {
  const integ = await getIntegration();
  if (!integ) return;

  if (integ.accessTokenEnc && integ.wabaId) {
    const other = await getDefaultChannel();
    if (!other || other.wabaId !== integ.wabaId) {
      try {
        await unsubscribeApps(integ.wabaId, decryptToken(integ.accessTokenEnc));
      } catch (error) {
        // Si Meta ya nos sacó el acceso (PARTNER_REMOVED) esto falla: no importa.
        console.warn("[whatsapp] unsubscribe al desvincular:", error instanceof Error ? error.message : error);
      }
    }
  }

  await deactivateChannels();
  const prev = integ.disconnect || {};
  await integrationRef().set(
    {
      status: "disconnected",
      accessTokenEnc: FieldValue.delete(),
      coexistenceEnabled: false,
      phoneNumberId: null,
      error: null,
      disconnect: {
        requestedAt: prev.requestedAt ?? (args.requestedBy ? FieldValue.serverTimestamp() : null),
        requestedBy: prev.requestedBy ?? args.requestedBy ?? null,
        confirmedAt: args.confirmed ? FieldValue.serverTimestamp() : null,
        forced: !!args.forced,
        reason: args.reason ?? prev.reason ?? null,
        initiatedBy: args.initiatedBy ?? prev.initiatedBy ?? null,
        displayPhoneNumber: prev.displayPhoneNumber ?? args.displayPhoneNumber ?? null,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Webhook `account_update`: PARTNER_REMOVED / ACCOUNT_OFFBOARDED = el número
 * salió de la coexistencia (lo desconectó el dueño desde el celular, o Meta por
 * inactividad). Se marca desvinculado y confirmado, se haya pedido o no desde la app.
 */
export async function handleAccountUpdate(entryId: string | undefined, value: any): Promise<void> {
  const event = value?.event;
  if (event !== "PARTNER_REMOVED" && event !== "ACCOUNT_OFFBOARDED") return;
  const integ = await getIntegration();
  if (!integ || integ.status === "disconnected") return;
  const wabaId = value?.waba_info?.waba_id || entryId;
  if (wabaId && integ.wabaId && String(wabaId) !== String(integ.wabaId)) return;

  const db = getFirestoreAdmin();
  const channelSnap = integ.phoneNumberId
    ? await db.collection(collections.WHATSAPP_CHANNELS).doc(integ.phoneNumberId).get()
    : null;
  await finishDisconnect({
    confirmed: true,
    reason: value?.disconnection_info?.reason ?? event,
    initiatedBy: value?.disconnection_info?.initiated_by ?? null,
    displayPhoneNumber: channelSnap?.data()?.displayPhoneNumber ?? null,
  });
}

// ---------------------------------------------------------------------------
// Sincronización de coexistencia (historial y agenda del celular)
// ---------------------------------------------------------------------------

/** Actualiza el progreso del historial (los lotes pueden llegar desordenados: el progreso nunca baja). */
export async function applyHistoryProgress(args: {
  progress: number | null;
  phase: number | null;
  imported: number;
  error: { code: number | null; message: string } | null;
}): Promise<void> {
  const ref = integrationRef();
  await getFirestoreAdmin().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.data()?.historySync || {};
    if (args.error) {
      const declined = args.error.code === HISTORY_DECLINED_CODE;
      tx.set(
        ref,
        {
          historySync: {
            ...prev,
            status: declined ? "declined" : "error",
            error: args.error.message,
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
      return;
    }
    const progress = Math.max(Number(prev.progress) || 0, args.progress ?? 0);
    tx.set(
      ref,
      {
        historySync: {
          ...prev,
          status: progress >= 100 ? "done" : "in_progress",
          progress,
          phase: Math.max(Number(prev.phase) || 0, args.phase ?? 0),
          messagesImported: (Number(prev.messagesImported) || 0) + args.imported,
          error: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
  });
}

/**
 * Agenda del celular (webhook `smb_app_state_sync`): se guarda en
 * `whatsappPhonebook` y se usa como nombre del contacto (es más útil que el
 * nombre de perfil de WhatsApp, que suele ser un apodo o un emoji).
 */
export async function applyPhonebook(entries: NormalizedPhonebookEntry[]): Promise<void> {
  const db = getFirestoreAdmin();
  for (const e of entries) {
    const bookRef = db.collection(collections.WHATSAPP_PHONEBOOK).doc(e.waId);
    const contactRef = db.collection(collections.WHATSAPP_CONTACTS).doc(e.waId);
    if (e.action === "remove") {
      await bookRef.delete().catch(() => {});
      await contactRef
        .update({ phonebookName: null, updatedAt: FieldValue.serverTimestamp() })
        .catch(() => {}); // no existe el contacto: nada que hacer
      continue;
    }
    if (!e.name) continue;
    await bookRef.set({ name: e.name, updatedAt: FieldValue.serverTimestamp() });
    await contactRef
      .update({
        name: e.name,
        nameSource: "phonebook",
        phonebookName: e.name,
        updatedAt: FieldValue.serverTimestamp(),
      })
      .catch(() => {}); // todavía no escribió: el nombre se toma de la agenda al crearse
  }
}
