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
  /** El equipo lo pasó a una venta o a una orden de trabajo. */
  PROCESSED = "processed",
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
  /** Tipo de cliente (id de settings/whatsappBot.customerSegments). */
  customerSegment?: string;
  delivery?: { method: "pickup" | "shipping" | "courier"; place: string | null; address?: string | null };
  customerName?: string;
  /** "custom_quote" = personalizada a cotizar por el equipo (total 0). */
  kind?: "order" | "custom_quote";
  customDetails?: {
    technique: string;
    quantity: number | null;
    size: string | null;
    neededBy: string | null;
    whenText: string | null;
    design: string | null;
    /** Plazo de la técnica para esa medida, ej. "10 a 15 días hábiles". */
    leadTime?: string;
    tight?: boolean;
    unitPrice?: number | null;
    estimatedTotal?: number | null;
  };
  source: "whatsapp_bot";
  /** A qué se pasó (venta u orden de trabajo) cuando quedó "processed". */
  convertedTo?: { type: "sale" | "order"; id: string; number?: string | null; at?: any; by?: string | null };
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
  /** Desvinculación pedida desde la app: falta que el dueño desconecte desde el celular. */
  DISCONNECTING = "disconnecting",
  ERROR = "error",
}

/** Cómo se dio de alta el número. */
export type TWhatsappOnboardingMethod = "embedded_signup" | "manual";

/** Pedido de sincronización a Meta (`smb_app_data`): se puede pedir una sola vez por alta. */
export type TWhatsappSyncRequest = {
  requestId?: string | null;
  requestedAt?: Date | null;
  error?: string | null;
};

/** Progreso del historial que Meta manda por el webhook `history`. */
export type TWhatsappHistorySync = {
  status: "requested" | "in_progress" | "done" | "declined" | "error";
  /** 0–100 (100 = terminó). */
  progress?: number | null;
  phase?: number | null;
  messagesImported?: number;
  error?: string | null;
  updatedAt?: Date | null;
};

/** Datos de la última desvinculación (pedida desde la app o avisada por Meta). */
export type TWhatsappDisconnectInfo = {
  requestedAt?: Date | null;
  requestedBy?: string | null;
  /** Meta confirmó que el número salió (webhook `account_update` o chequeo). */
  confirmedAt?: Date | null;
  /** true si se terminó sin confirmación de Meta (botón "forzar"). */
  forced?: boolean;
  /** `disconnection_info.reason` de Meta (ej. PRIMARY_INACTIVITY). */
  reason?: string | null;
  /** USER (desde el celular) o SYSTEM (Meta). */
  initiatedBy?: string | null;
  /** Número que se desvinculó (para mostrarlo después). */
  displayPhoneNumber?: string | null;
};

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
  onboardingMethod?: TWhatsappOnboardingMethod;
  onboardedAt?: Date | null;
  /** Número activo (doc id del canal). */
  phoneNumberId?: string | null;
  contactsSync?: TWhatsappSyncRequest | null;
  historySyncRequest?: TWhatsappSyncRequest | null;
  historySync?: TWhatsappHistorySync | null;
  disconnect?: TWhatsappDisconnectInfo | null;
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
  /** El número está en la app WhatsApp Business del celular además de la API. */
  coexistence?: boolean;
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
  /** De dónde salió `name`: perfil de WhatsApp o agenda del celular (coexistencia). */
  nameSource?: "profile" | "phonebook";
  /** Nombre agendado en el celular del negocio (webhook `smb_app_state_sync`). */
  phonebookName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  /** Clientes cargados con el mismo teléfono (el bot no pudo elegir): el equipo elige. */
  clientCandidates?: string[];
  /** Cómo quedó vinculado: "auto" (teléfono único), "bot_new" (lo creó el bot), "manual" (el equipo). */
  clientLinkedBy?: "auto" | "bot_new" | "manual";
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
  /** Importado del historial del celular al conectar (coexistencia): el bot no lo contesta. */
  fromHistory?: boolean;
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
