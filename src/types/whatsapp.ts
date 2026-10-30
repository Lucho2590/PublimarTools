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
  createdAt: Date;
  updatedAt: Date;
};
