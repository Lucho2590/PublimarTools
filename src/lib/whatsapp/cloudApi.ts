// Wrapper puro de la Meta Graph API (WhatsApp Cloud API).
// Sin DB, sin lógica de negocio: un método por endpoint. Recibe el token YA
// descifrado. Los errores de Meta se envuelven en CloudApiError para poder
// distinguirlos por código (no por substring del mensaje) — gotcha del brief.

import { GRAPH_BASE_URL } from "./constants";

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
