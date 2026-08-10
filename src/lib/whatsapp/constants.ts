// Constantes de la integración con WhatsApp Cloud API (Meta Graph API).
// La versión del Graph vive SOLO acá; no dispersarla por el código.

export const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";
export const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Coexistencia: se envía en el Embedded Signup para NO tomar el número en
// exclusiva (el dueño sigue usando la app WhatsApp Business en el celular).
export const COEXISTENCE_FEATURE_TYPE = "whatsapp_business_app_onboarding";
export const COEXISTENCE_SESSION_INFO_VERSION = "3";

// Límites de tamaño de media de Meta (en bytes). Validar ANTES de subir.
export const MEDIA_LIMITS = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
  sticker: 100 * 1024,
  stickerAnimated: 500 * 1024,
} as const;

// Ventana de servicio de atención al cliente (24 h desde el último ENTRANTE).
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
