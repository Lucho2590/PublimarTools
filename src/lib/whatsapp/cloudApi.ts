// Wrapper puro de la Meta Graph API (WhatsApp Cloud API).
// Sin DB, sin lógica de negocio: un método por endpoint. Recibe el token YA
// descifrado. Los errores de Meta se envuelven en CloudApiError para poder
// distinguirlos por código (no por substring del mensaje) — gotcha del brief.

import { GRAPH_BASE_URL } from "./constants";
import { buildTextPayload } from "./outboundHelpers";

export class CloudApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly subcode?: number,
    public readonly httpStatus?: number
  ) {
    super(message);
    this.name = "CloudApiError";
  }
}

async function graphFetch(
  path: string,
  token: string,
  init?: RequestInit
): Promise<any> {
  const res = await fetch(`${GRAPH_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const err = json?.error || {};
    throw new CloudApiError(
      err.message || text || res.statusText,
      err.code,
      err.error_subcode,
      res.status
    );
  }
  return json;
}

export type MetaPhoneNumber = {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
};

/** GET /{wabaId}/phone_numbers */
export async function listPhoneNumbers(
  wabaId: string,
  token: string
): Promise<MetaPhoneNumber[]> {
  const json = await graphFetch(`/${wabaId}/phone_numbers`, token, {
    method: "GET",
  });
  return (json.data || []) as MetaPhoneNumber[];
}

/**
 * POST /{wabaId}/subscribed_apps — OBLIGATORIO tras conectar, o no llega ningún
 * webhook. Es el error de onboarding más común (gotcha del brief).
 */
export async function subscribeApps(wabaId: string, token: string): Promise<any> {
  return graphFetch(`/${wabaId}/subscribed_apps`, token, { method: "POST" });
}

/**
 * Marca el mensaje del cliente como leído (tildes azules) y muestra
 * "escribiendo…" hasta que sale la respuesta o pasan 25 s.
 */
export async function markReadWithTyping(phoneNumberId: string, wamid: string, token: string): Promise<void> {
  await graphFetch(`/${phoneNumberId}/messages`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: wamid,
      typing_indicator: { type: "text" },
    }),
  });
}

/** POST /{phoneNumberId}/messages — envía un mensaje de texto. Devuelve el wamid. */
export async function sendTextMessage(
  phoneNumberId: string,
  to: string,
  body: string,
  token: string
): Promise<{ wamid: string | null }> {
  const json = await graphFetch(`/${phoneNumberId}/messages`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildTextPayload(to, body)),
  });
  return { wamid: json?.messages?.[0]?.id ?? null };
}

// ---------------------------------------------------------------------------
// Embedded Signup + coexistencia (número en la app WhatsApp Business del
// celular Y en la Cloud API a la vez).
// ---------------------------------------------------------------------------

/**
 * Canjea el `code` que devuelve FB.login (Embedded Signup) por el token de
 * negocio. El code vence a los ~30 s: llamarlo apenas llega. Server-side
 * (usa el App Secret).
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) {
    throw new CloudApiError("Faltan META_APP_ID o META_APP_SECRET en el servidor");
  }
  const qs = new URLSearchParams({ client_id: appId, client_secret: secret, code });
  const res = await fetch(`${GRAPH_BASE_URL}/oauth/access_token?${qs.toString()}`);
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    const err = json?.error || {};
    throw new CloudApiError(
      err.message || "Meta no devolvió el token",
      err.code,
      err.error_subcode,
      res.status
    );
  }
  return json.access_token as string;
}

/**
 * Estado de coexistencia de un número: `is_on_biz_app: true` + `platform_type:
 * "CLOUD_API"` = está en la app del celular y en la API. Devuelve null si Meta
 * no expone los campos (no rompe el alta).
 */
export async function getPhoneCoexistence(
  phoneNumberId: string,
  token: string
): Promise<{ isOnBizApp: boolean; platformType: string | null } | null> {
  try {
    const json = await graphFetch(`/${phoneNumberId}?fields=is_on_biz_app,platform_type`, token, {
      method: "GET",
    });
    return { isOnBizApp: json?.is_on_biz_app === true, platformType: json?.platform_type ?? null };
  } catch {
    return null;
  }
}

/**
 * POST /{phoneNumberId}/smb_app_data — pide a Meta que mande por webhook los
 * contactos (`smb_app_state_sync`) o el historial de chats (`history`) del
 * celular. Solo se puede pedir UNA vez por alta y dentro de las 24 h.
 */
export async function requestSmbSync(
  phoneNumberId: string,
  token: string,
  syncType: "smb_app_state_sync" | "history"
): Promise<{ requestId: string | null }> {
  const json = await graphFetch(`/${phoneNumberId}/smb_app_data`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
  });
  return { requestId: json?.request_id ?? null };
}

/** DELETE /{wabaId}/subscribed_apps — Meta deja de mandar webhooks de esa cuenta. */
export async function unsubscribeApps(wabaId: string, token: string): Promise<any> {
  return graphFetch(`/${wabaId}/subscribed_apps`, token, { method: "DELETE" });
}

export type MetaAppSubscription = {
  object: string;
  callback_url: string;
  active: boolean;
  fields: { name: string; version?: string }[];
};

/**
 * GET /{appId}/subscriptions con el app token (`appId|appSecret`): qué webhooks
 * tiene configurados la app en el panel de Meta (URL + campos).
 */
export async function getAppSubscriptions(): Promise<MetaAppSubscription[]> {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) throw new CloudApiError("Faltan META_APP_ID o META_APP_SECRET");
  const json = await graphFetch(`/${appId}/subscriptions`, `${appId}|${secret}`, { method: "GET" });
  return (json.data || []) as MetaAppSubscription[];
}

/** Datos de la app que Meta exige para publicarla (sin publicar no llegan mensajes reales). */
export async function getAppPublishInfo(): Promise<{ privacyPolicyUrl: string | null; category: string | null }> {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) throw new CloudApiError("Faltan META_APP_ID o META_APP_SECRET");
  const json = await graphFetch(`/${appId}?fields=privacy_policy_url,category`, `${appId}|${secret}`, {
    method: "GET",
  });
  return { privacyPolicyUrl: json?.privacy_policy_url ?? null, category: json?.category ?? null };
}
