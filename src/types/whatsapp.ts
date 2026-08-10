// Tipos para el chatbot de WhatsApp.
// El "cerebro" (AI Agent) vive en n8n; estos tipos modelan lo que la app
// persiste en Firestore: las conversaciones y los pedidos tomados por el bot.

export enum EWhatsappConversationStatus {
  ACTIVE = "active",
  HANDOFF = "handoff",
  CLOSED = "closed",
}

export type TWhatsappMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  at: Date; // Timestamp Firestore | Date
};

export type TWhatsappConversation = {
  id: string;
  phone: string;
  clientId?: string;
  clientName?: string;
  status: EWhatsappConversationStatus;
  messages: TWhatsappMessage[];
  lastMessage?: string;
  handoffReason?: string;
  createdAt: Date;
  updatedAt: Date;
};

export enum EWhatsappOrderStatus {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  CANCELLED = "cancelled",
}

export type TWhatsappOrderItem = {
  productId?: string;
  variantId?: string;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type TWhatsappOrder = {
  id: string;
  orderNumber: string;
  phone: string;
  clientId?: string;
  clientName?: string;
  items: TWhatsappOrderItem[];
  total: number;
  status: EWhatsappOrderStatus;
  quoteId?: string;
  source: "whatsapp_bot";
  createdAt: Date;
  updatedAt: Date;
};

// ===========================================================================
// WhatsApp Cloud API — bandeja humana con coexistencia (ver src/lib/whatsapp/*)
// Estos tipos son independientes de los de arriba (que modelan el bot de n8n).
// ===========================================================================

export enum EWhatsappIntegrationStatus {
  DISCONNECTED = "disconnected",
  CONNECTED = "connected",
  ERROR = "error",
}

/** Credenciales del WABA. Doc id fijo "default". El token va CIFRADO en reposo. */
export type TWhatsappIntegration = {
  id: string;
  provider: "meta_whatsapp";
  wabaId: string;
  /** AES-256-GCM (ver src/lib/whatsapp/crypto.ts). Nunca en claro. */
  accessTokenEnc: string;
  tokenExpiresAt?: Date | null;
  status: EWhatsappIntegrationStatus;
  coexistenceEnabled: boolean;
  /** Constante configurable del Embedded Signup de coexistencia. */
  featureType: string;
  error?: string | null;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
};

export enum EWhatsappChannelStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  PENDING = "pending",
}

/** Un número/canal. Doc id = phoneNumberId de Meta (lookup O(1) desde el webhook). */
export type TWhatsappChannel = {
  id: string;
  integrationId: string;
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  qualityRating?: string | null;
  registered: boolean;
  status: EWhatsappChannelStatus;
  defaultForSending: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export enum EWhatsappContactStatus {
  OPEN = "open",
  HANDOFF = "handoff",
  CLOSED = "closed",
}

/** Persona del otro lado del chat. Doc id = wa_id canónico E.164. */
export type TWhatsappContact = {
  id: string;
  waId: string;
  phoneE164: string;
  name?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  channelId: string;
  status: EWhatsappContactStatus;
  lastMessageAt?: Date | null;
  /** Último ENTRANTE: maneja la ventana de servicio de 24 h. */
  lastInboundAt?: Date | null;
  lastMessagePreview?: string | null;
  lastMessageDirection?: EWhatsappMessageDirection;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export enum EWhatsappMessageDirection {
  INBOUND = "inbound",
  OUTBOUND = "outbound",
}

export enum EWhatsappMessageType {
  TEXT = "text",
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  DOCUMENT = "document",
  STICKER = "sticker",
  LOCATION = "location",
  CONTACTS = "contacts",
  TEMPLATE = "template",
  INTERACTIVE = "interactive",
  REACTION = "reaction",
  DELETED = "deleted",
  UNSUPPORTED = "unsupported",
  SYSTEM = "system",
}

export enum EWhatsappMessageStatus {
  PENDING = "pending",
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
  FAILED = "failed",
}

/** Un mensaje. Doc id = wamid (idempotencia) para entrantes/echoes. */
export type TWhatsappMessageDoc = {
  id: string;
  wamid?: string | null;
  contactId: string;
  channelId: string;
  direction: EWhatsappMessageDirection;
  type: EWhatsappMessageType;
  content?: string | null;
  metadata?: Record<string, unknown>;
  replyToWamid?: string | null;
  /** uid del operador (solo salientes propios). */
  senderUid?: string | null;
  senderName?: string | null;
  status: EWhatsappMessageStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};

export enum EWhatsappWebhookEventStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  PROCESSED = "processed",
  FAILED = "failed",
  IGNORED = "ignored",
}

/** Bandeja cruda de todo evento recibido: idempotencia + reproceso + forense. */
export type TWhatsappWebhookEvent = {
  id: string;
  eventType: "messages" | "message_echoes" | "statuses" | "errors" | "unknown" | string;
  payload: unknown;
  signatureValid: boolean;
  status: EWhatsappWebhookEventStatus;
  error?: string | null;
  receivedAt: Date;
  processedAt?: Date | null;
};
