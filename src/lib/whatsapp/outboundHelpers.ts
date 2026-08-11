// Helpers PUROS del envío (sin Firestore ni Meta), testeables solos.

import { SERVICE_WINDOW_MS } from "./constants";

/**
 * ¿Estamos dentro de la ventana de servicio de 24 h? Se mide desde el ÚLTIMO
 * mensaje ENTRANTE del contacto. Sin entrante previo → ventana cerrada (solo
 * plantillas). Fuera de la ventana, Meta rechaza cualquier texto libre.
 */
export function isWithinServiceWindow(
  lastInboundMs: number | null | undefined,
  nowMs: number
): boolean {
  if (!lastInboundMs) return false;
  return nowMs - lastInboundMs < SERVICE_WINDOW_MS;
}

/** Milisegundos que faltan para que se cierre la ventana (0 si ya está cerrada). */
export function windowRemainingMs(
  lastInboundMs: number | null | undefined,
  nowMs: number
): number {
  if (!lastInboundMs) return 0;
  return Math.max(0, lastInboundMs + SERVICE_WINDOW_MS - nowMs);
}

/** Payload de un mensaje de texto para POST /{phoneNumberId}/messages. */
export function buildTextPayload(to: string, body: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body },
  };
}
