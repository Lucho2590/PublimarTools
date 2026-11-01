// Funciones puras del webhook de Meta (sin DB ni Next), para poder testearlas.
// La firma se calcula sobre el cuerpo CRUDO (bytes exactos) con el App Secret.

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifica el header `x-hub-signature-256` (`sha256=<hex>`) contra el HMAC-SHA256
 * del cuerpo crudo con el App Secret, en tiempo constante.
 */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !header) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Clasifica el tipo de evento a partir del payload de Meta (para la bandeja cruda). */
export function classifyEventType(payload: any): string {
  const change = payload?.entry?.[0]?.changes?.[0];
  const field = change?.field;
  if (field === "messages") {
    const value = change?.value || {};
    if (Array.isArray(value.statuses) && value.statuses.length) return "statuses";
    if (Array.isArray(value.errors) && value.errors.length) return "errors";
    return "messages";
  }
  if (field === "smb_message_echoes") return "message_echoes";
  if (typeof field === "string" && field) return field;
  return "unknown";
}
