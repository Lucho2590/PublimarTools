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
  /** Tipo de cliente que se deduce del mensaje (id) o null. */
  segment: string | null;
};

export type TBotTrace = {
  layer: EBotLayer;
  intent?: string | null;
  score?: number | null;
  aiUsage?: TBotAiUsage | null;
  ai?: TBotAiResult | null;
  latencyMs: number;
  note?: string | null;
  /** Tipo de cliente de la sesión (detectado en este mensaje o antes). */
  segment?: string | null;
};

// ---------------------------------------------------------------------------
// Sesión (estado de la conversación)
// ---------------------------------------------------------------------------

export type TBotChannel = "simulator" | "whatsapp";

export enum EBotStep {
  IDLE = "idle",
  CHOOSE_TYPE = "choose_type",
  CHOOSE_PRODUCT = "choose_product",
  CHOOSE_VARIANT = "choose_variant",
  /** Varios modelos del mismo tipo: primero la medida aproximada. */
  CHOOSE_SIZE = "choose_size",
  QUANTITY = "quantity",
  MORE = "more",
  NAME = "name",
  SEGMENT = "segment",
  DELIVERY = "delivery",
  DELIVERY_PLACE = "delivery_place",
  DELIVERY_ADDRESS = "delivery_address",
  CONFIRM = "confirm",
  // Bandera personalizada: fecha → cantidad → medida → técnica → diseño → confirmar.
  CUSTOM_DATE = "custom_date",
  CUSTOM_QTY = "custom_qty",
  CUSTOM_SIZE = "custom_size",
  CUSTOM_TECHNIQUE = "custom_technique",
  CUSTOM_LOGO = "custom_logo",
  CUSTOM_PRICE = "custom_price",
}

export type TBotCartItem = {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
};

export type TBotDelivery = {
  /** courier = en la ciudad del local, con el mensajero (lo coordina el cliente). */
  method: "pickup" | "shipping" | "courier";
  /** Localidad ("Mar del Plata"). */
  place: string | null;
  /** Calle y número; null si dijo "después te la paso" o no la dio. */
  address?: string | null;
};

export type TBotCustomRequest = {
  /** Fecha pedida (ISO yyyy-mm-dd) o null si "sin apuro". */
  neededBy: string | null;
  /** Días hasta esa fecha (null = sin apuro / sin límite). */
  days: number | null;
  /** Texto tal cual lo dijo ("para el acto del 20"). */
  whenText: string | null;
  quantity: number | null;
  /** Cómo mostrar la cantidad ("entre 2 y 9", "10 o más", "30"). */
  quantityText: string | null;
  size: string | null;
  /** ¿Ya tiene logo/diseño? (null = no se preguntó todavía). */
  hasLogo: boolean | null;
  techniqueId: string | null;
  /** La técnica elegida llega justo (entre el mínimo y el máximo del plazo). */
  tight: boolean;
  /** Precio unitario mostrado (técnicas con producto) y la medida cotizada. */
  unitPrice: number | null;
  priceSize: string | null;
};

export type TBotHistoryEntry = { role: "user" | "bot"; text: string };

export type TBotSession = {
  id: string;
  channel: TBotChannel;
  step: EBotStep;
  cart: TBotCartItem[];
  pendingProductId: string | null;
  pendingVariantId: string | null;
  /** Cantidad que ya dijo ("necesito 10…") mientras elige modelo/medida. */
  pendingQuantity: number | null;
  candidateProductIds: string[];
  /** Lo que pidió el cliente, para repetirlo ("Bandera Argentina"). */
  familyLabel: string | null;
  /** Todos los productos de lo que pidió (no cambia al elegir tipo/página). */
  familyProductIds: string[];
  /** Tipo de cliente (id de TBotCustomerSegment) detectado o respondido. */
  segmentId: string | null;
  delivery: TBotDelivery | null;
  /** Datos de una bandera personalizada en curso. */
  custom: TBotCustomRequest | null;
  customerName: string | null;
  phone: string | null;
  clientId: string | null;
  status: "active" | "handoff";
  pausedUntil: Date | null;
  /** Ya se le contestó una vez "ya le avisé al equipo" mientras espera. */
  handoffReassured: boolean;
  /** Derivada y todavía sin atender: aparece en WhatsApp > Atender y avisa. */
  needsAttention: boolean;
  handoffReason: string | null;
  handoffAt: Date | null;
  /** Resumen para el equipo al derivar (carrito, personalizada, entrega). */
  handoffSummary: string | null;
  attendedAt: Date | null;
  attendedBy: string | null;
  /** Mensajes seguidos sin entender (2 → deriva a humano). */
  failCount: number;
  lastOrderNumber: string | null;
  history: TBotHistoryEntry[];
  /** Ids de la última lista numerada: "2" o "la 2" eligen esa opción. */
  lastOptions: string[];
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
  /** Bandera personalizada (logo, diseño propio). */
  CUSTOM = "custom",
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

/**
 * Tipo de bandera (por uso): una categoría del catálogo que el bot ofrece como
 * pregunta cuando el pedido es genérico ("argentina" → Flameo / Ceremonia / …).
 */
export type TBotProductType = {
  categoryId: string;
  label: string;
  description: string;
  /** Palabras con las que el cliente nombra este tipo ("mastil", "acto"…). */
  keywords: string[];
};

/**
 * Grupo del menú del catálogo ("Argentinas", "Extranjeras"…): junta varias
 * categorías. `rest` = todo lo que no entró en los grupos anteriores.
 */
export type TBotCatalogGroup = {
  id: string;
  label: string;
  categoryIds: string[];
  rest?: boolean;
};

export type TBotSizeRule = { upTo: string; minDays: number; maxDays: number };

/**
 * Técnica de bandera personalizada. Se ofrece si llega a la fecha (`minDays`)
 * y aplica a la cantidad (`minQty`). Con `productId` sigue el flujo normal con
 * precio del catálogo; sin producto queda "a cotizar" por el equipo.
 */
export type TBotCustomTechnique = {
  id: string;
  label: string;
  description: string;
  /** Plazo en días hábiles: de `minDays` a `maxDays` (rango, ej. 10 a 15). */
  minDays: number;
  maxDays?: number;
  /**
   * Plazos según la medida (opcional): la primera regla cuya medida "hasta"
   * cubre la pedida. Medidas más grandes o desconocidas usan minDays/maxDays.
   */
  sizeRules?: TBotSizeRule[];
  minQty: number;
  productId: string | null;
  enabled: boolean;
};

/** Tipo de cliente: se deduce por palabras o se pregunta, y etiqueta al cliente. */
export type TBotCustomerSegment = {
  id: string;
  label: string;
  /** Palabras o frases que lo delatan ("colegio", "por mayor"…). */
  keywords: string[];
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
    /** Presentación en el primer mensaje de cada conversación. */
    intro: string;
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
    /** Ciudad del local: ahí no se envía, se coordina con el mensajero. */
    localCity: string;
    /** Qué decir cuando piden envío dentro de la ciudad del local. */
    localDelivery: string;
  };
  /** productId → otros nombres con los que lo piden los clientes. */
  productAliases: Record<string, string[]>;
  /** Vacío = se detectan solos por nombre de categoría (Flameo, Ceremonia, Escritorio). */
  productTypes: TBotProductType[];
  customerSegments: TBotCustomerSegment[];
  /** Vacío = Argentinas / Extranjeras / Personalizadas / Otras por nombre de categoría. */
  catalogGroups: TBotCatalogGroup[];
  /** Vacío = Sublimada / Estampada / Bordada sugeridas. */
  customTechniques: TBotCustomTechnique[];
  /** Preguntar retiro / envío antes del resumen. */
  askDelivery: boolean;
  /**
   * Botones y listas interactivas. Apagado (default): todo en texto, las
   * opciones van numeradas y el cliente escribe libre (o el número).
   */
  useButtons: boolean;
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
