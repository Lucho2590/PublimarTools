// Tipos del bot de Banderas (motor híbrido: reglas primero, IA como fallback).
// El motor vive en src/lib/bot/* y no depende del canal: hoy lo usa el
// simulador del panel; en la Fase 2 lo usa el webhook de WhatsApp.

// ---------------------------------------------------------------------------
// Respuestas (mismo formato que los mensajes interactivos de WhatsApp)
// ---------------------------------------------------------------------------

/** Botón de respuesta rápida. WhatsApp: máx 3 por mensaje, título ≤ 20 chars. */
export type TBotButton = { id: string; title: string };

/** Fila de lista. WhatsApp: máx 10 filas, título ≤ 24, descripción ≤ 72. */
export type TBotListRow = { id: string; title: string; description?: string };

export type TBotReply =
  | { type: "text"; text: string }
  | { type: "buttons"; text: string; buttons: TBotButton[] }
  | { type: "list"; text: string; buttonLabel: string; rows: TBotListRow[] };

// ---------------------------------------------------------------------------
// Traza: qué capa resolvió cada mensaje y cuánto costó
// ---------------------------------------------------------------------------

export enum EBotLayer {
  GUARD = "guard",
  FLOW = "flow",
  STEP = "step",
  RULE = "rule",
  AI = "ai",
  FALLBACK = "fallback",
  HANDOFF = "handoff",
}

export const BOT_LAYER_LABELS: Record<EBotLayer, string> = {
  [EBotLayer.GUARD]: "Guarda",
  [EBotLayer.FLOW]: "Botón / lista",
  [EBotLayer.STEP]: "Paso del pedido",
  [EBotLayer.RULE]: "Regla entrenada",
  [EBotLayer.AI]: "IA",
  [EBotLayer.FALLBACK]: "No entendió",
  [EBotLayer.HANDOFF]: "Derivado a humano",
};

export type TBotAiUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
};

/** Lo que la IA entendió (se guarda para poder "enseñarlo" después). */
export type TBotAiResult = {
  intent: string;
  faqId: string | null;
  product: string | null;
  size: string | null;
  quantity: number | null;
  confidence: number;
  reply: string | null;
};

export type TBotTrace = {
  layer: EBotLayer;
  intent?: string | null;
  score?: number | null;
  aiUsage?: TBotAiUsage | null;
  ai?: TBotAiResult | null;
  latencyMs: number;
  note?: string | null;
};

// ---------------------------------------------------------------------------
// Sesión (estado de la conversación)
// ---------------------------------------------------------------------------

export type TBotChannel = "simulator" | "whatsapp";

export enum EBotStep {
  IDLE = "idle",
  CHOOSE_PRODUCT = "choose_product",
  CHOOSE_VARIANT = "choose_variant",
  QUANTITY = "quantity",
  MORE = "more",
  NAME = "name",
  CONFIRM = "confirm",
}

export type TBotCartItem = {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
};

export type TBotHistoryEntry = { role: "user" | "bot"; text: string };

export type TBotSession = {
  id: string;
  channel: TBotChannel;
  step: EBotStep;
  cart: TBotCartItem[];
  pendingProductId: string | null;
  pendingVariantId: string | null;
  candidateProductIds: string[];
  customerName: string | null;
  phone: string | null;
  clientId: string | null;
  status: "active" | "handoff";
  pausedUntil: Date | null;
  /** Mensajes seguidos sin entender (2 → deriva a humano). */
  failCount: number;
  lastOrderNumber: string | null;
  history: TBotHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
};

// ---------------------------------------------------------------------------
// Intenciones entrenables
// ---------------------------------------------------------------------------

export enum EBotIntentKind {
  /** Pregunta frecuente: responde el texto `answer`. */
  FAQ = "faq",
  /** Intención del sistema: dispara una acción fija del motor. */
  SYSTEM = "system",
}

/** Acciones fijas que puede disparar una intención del sistema. */
export enum EBotAction {
  GREETING = "greeting",
  MENU = "menu",
  CATALOG = "catalog",
  PRICE = "price",
  ORDER = "order",
  HUMAN = "human",
  THANKS = "thanks",
}

export type TBotIntent = {
  id: string;
  label: string;
  kind: EBotIntentKind;
  action?: EBotAction | null;
  /** Frases de ejemplo: el matcher compara contra estas. */
  examples: string[];
  /** Respuesta (solo FAQ). Admite variables {direccion}, {horarios}, etc. */
  answer?: string | null;
  enabled: boolean;
  hits?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

// ---------------------------------------------------------------------------
// Configuración (settings/whatsappBot)
// ---------------------------------------------------------------------------

export type TBotBusinessHours = {
  enabled: boolean;
  /** 0 = domingo … 6 = sábado. */
  days: number[];
  open: string; // "09:00"
  close: string; // "18:00"
};

export type TBotConfig = {
  enabled: boolean;
  aiEnabled: boolean;
  model: string;
  aiMonthlyBudgetUsd: number;
  /** Umbral 0–1 del matcher para aceptar una intención sin IA. */
  matchThreshold: number;
  /** Horas que el bot queda en silencio después de derivar a un humano. */
  handoffPauseHours: number;
  businessHours: TBotBusinessHours;
  messages: {
    welcome: string;
    fallback: string;
    handoff: string;
    handoffOutOfHours: string;
    orderConfirmed: string;
    unsupportedMedia: string;
  };
  business: {
    name: string;
    address: string;
    hours: string;
    shipping: string;
    payments: string;
    productionTime: string;
    extra: string;
  };
  /** productId → otros nombres con los que lo piden los clientes. */
  productAliases: Record<string, string[]>;
};

// ---------------------------------------------------------------------------
// Log de turnos y estadísticas
// ---------------------------------------------------------------------------

export enum EBotLearnStatus {
  PENDING = "pending",
  LEARNED = "learned",
  IGNORED = "ignored",
}

export type TBotTurn = {
  id: string;
  sessionId: string;
  channel: TBotChannel;
  text: string | null;
  replyId: string | null;
  replyPreview: string;
  layer: EBotLayer;
  intent: string | null;
  score: number | null;
  ai: TBotAiResult | null;
  aiUsage: TBotAiUsage | null;
  latencyMs: number;
  /** Solo los turnos que fueron a IA o no se entendieron quedan para enseñar. */
  learnStatus: EBotLearnStatus | null;
  createdAt: Date;
};

/** Agregado mensual: doc id = "YYYY-MM". */
export type TBotStats = {
  id: string;
  turns: number;
  byLayer: Partial<Record<EBotLayer, number>>;
  aiCalls: number;
  aiCostUsd: number;
  orders: number;
  updatedAt?: Date;
};
