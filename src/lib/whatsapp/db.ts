import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { EClientType, EClientStatus, EClientSection } from "@/types/client";
import { EQuoteStatus } from "@/types/quote";
import { EWhatsappConversationStatus, EWhatsappOrderStatus } from "@/types/whatsapp";

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Normaliza un teléfono dejando solo dígitos (sirve como id de conversación). */
export function normalizePhone(phone: string): string {
  return String(phone || "").replace(/\D/g, "");
}

function coerceNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const n = parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function mapProduct(id: string, data: any) {
  const variants = (data.variants || []).map((v: any) => ({
    id: v.id,
    size: v.size,
    price: coerceNumber(v.price),
    stock: coerceNumber(v.stock),
    sku: v.sku ?? null,
  }));
  return {
    id,
    name: data.name,
    description: data.description ?? null,
    categories: data.categories || [],
    price: coerceNumber(data.price),
    variants,
  };
}

type ItemInput = { productId: string; variantId?: string; quantity?: number };

/** Acepta items como array o como string JSON (n8n a veces lo manda stringificado). */
function parseItems(raw: any): ItemInput[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

type ResolvedItem = {
  productId: string;
  variantId?: string;
  productName: string;
  variantName?: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
};

/**
 * Resuelve los items contra el catálogo: el precio y el subtotal SIEMPRE se
 * calculan del lado del servidor con el dato real de Firestore — el modelo
 * solo aporta productId/variantId/quantity.
 */
async function resolveItems(db: Firestore, items: ItemInput[]): Promise<ResolvedItem[]> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Se requiere al menos un item");
  }
  const resolved: ResolvedItem[] = [];
  for (const it of items) {
    if (!it?.productId) throw new Error("Item sin productId");
    const snap = await db.collection(collections.PRODUCTS).doc(it.productId).get();
    if (!snap.exists) throw new Error(`Producto no encontrado: ${it.productId}`);
    const p = snap.data() as any;
    const variants = p.variants || [];
    const variant = it.variantId ? variants.find((v: any) => v.id === it.variantId) : null;
    const unitPrice = coerceNumber(variant ? variant.price : p.price);
    const quantity = coerceNumber(it.quantity) || 1;
    const item: ResolvedItem = {
      productId: it.productId,
      productName: p.name,
      unitPrice,
      quantity,
      subtotal: unitPrice * quantity,
    };
    if (it.variantId) item.variantId = it.variantId;
    if (variant?.size) item.variantName = variant.size;
    resolved.push(item);
  }
  return resolved;
}

function generateQuoteNumber(): string {
  return `P-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function generateOrderNumber(): string {
  return `W-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

// Tope de seguridad para no volcar un catálogo gigante al modelo de una.
// Para un catálogo de banderas, 200 es prácticamente "todos".
const MAX_RESULTS = 200;

export async function searchProducts(args: { query?: string; category?: string }) {
  const db = getFirestoreAdmin();
  const snap = await db.collection(collections.PRODUCTS).get();
  const q = (args.query || "").toLowerCase().trim();
  const cat = (args.category || "").toLowerCase().trim();

  // Todos los matches (sin tope de 10). query vacío => catálogo completo.
  const matches = snap.docs
    .filter((doc) => !(doc.data() as any).deleted)
    .map((doc) => ({ doc, data: doc.data() as any }))
    .filter(({ data }) => {
      const name = (data.name || "").toLowerCase();
      const sku = (data.sku || "").toLowerCase();
      const cats = (data.categories || []).map((c: any) => String(c).toLowerCase());
      // medidas de las variantes (ej. "90x140")
      const sizes = (data.variants || []).map((v: any) => String(v.size || "").toLowerCase());
      const matchesQuery =
        !q ||
        name.includes(q) ||
        sku.includes(q) ||
        cats.some((c: string) => c.includes(q)) ||
        sizes.some((s: string) => s.includes(q));
      const matchesCat = !cat || cats.some((c: string) => c.includes(cat));
      return matchesQuery && matchesCat;
    });

  const total = matches.length;
  const products = matches.slice(0, MAX_RESULTS).map(({ doc, data }) => mapProduct(doc.id, data));
  return { products, total, truncated: total > MAX_RESULTS };
}

export async function getProductDetails(args: { productId: string }) {
  const db = getFirestoreAdmin();
  if (!args?.productId) throw new Error("Se requiere productId");
  const snap = await db.collection(collections.PRODUCTS).doc(args.productId).get();
  if (!snap.exists) return null;
  return mapProduct(snap.id, snap.data());
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export async function lookupOrCreateClient(args: { phone: string; name?: string }) {
  const db = getFirestoreAdmin();
  if (!args?.phone) throw new Error("Se requiere phone");
  const norm = normalizePhone(args.phone);

  for (const candidate of [norm, args.phone]) {
    const q = await db
      .collection(collections.CLIENTS)
      .where("phone", "==", candidate)
      .limit(1)
      .get();
    if (!q.empty) {
      const d = q.docs[0];
      return { clientId: d.id, name: (d.data() as any).name ?? null, created: false };
    }
  }

  const name = args.name?.trim() || norm;
  const ref = await db.collection(collections.CLIENTS).add({
    name,
    type: EClientType.INDIVIDUAL,
    status: EClientStatus.ACTIVE,
    section: EClientSection.BANDERAS,
    phone: norm,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { clientId: ref.id, name, created: true };
}

// ---------------------------------------------------------------------------
// Cotizaciones (quotes) y pedidos (whatsappOrders)
// ---------------------------------------------------------------------------

export async function createQuote(args: {
  clientId: string;
  items: ItemInput[];
  notes?: string;
}) {
  const db = getFirestoreAdmin();
  if (!args?.clientId) throw new Error("Se requiere clientId");

  const clientSnap = await db.collection(collections.CLIENTS).doc(args.clientId).get();
  if (!clientSnap.exists) throw new Error("Cliente no encontrado");
  const c = clientSnap.data() as any;

  const resolved = await resolveItems(db, parseItems(args.items));
  const quoteItems = resolved.map((r, idx) => {
    const item: any = {
      id: `${Date.now()}-${idx}`,
      productId: r.productId,
      productName: r.productName,
      description: r.variantName ? `${r.productName} - ${r.variantName}` : r.productName,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      subtotal: r.subtotal,
      tax: 0,
      taxAmount: 0,
    };
    if (r.variantId) item.variantId = r.variantId;
    if (r.variantName) item.variantName = r.variantName;
    return item;
  });

  const subtotal = quoteItems.reduce((s, i) => s + i.subtotal, 0);
  const number = generateQuoteNumber();
  const validUntil = Timestamp.fromDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000));

  const data: any = {
    number,
    // snapshot plano del cliente (sin DocumentReference)
    client: { id: args.clientId, name: c.name ?? null, phone: c.phone ?? null },
    items: quoteItems,
    subtotal,
    taxRate: 0,
    tax: 0,
    taxAmount: 0,
    total: subtotal,
    status: EQuoteStatus.DRAFT,
    validUntil,
    source: "whatsapp_bot",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (args.notes) data.notes = args.notes;

  const ref = await db.collection(collections.QUOTES).add(data);
  return { id: ref.id, number, total: subtotal };
}

export async function createWhatsappOrder(args: {
  clientId: string;
  items: ItemInput[];
  phone?: string;
  quoteId?: string;
}) {
  const db = getFirestoreAdmin();
  if (!args?.clientId) throw new Error("Se requiere clientId");

  const clientSnap = await db.collection(collections.CLIENTS).doc(args.clientId).get();
  if (!clientSnap.exists) throw new Error("Cliente no encontrado");
  const c = clientSnap.data() as any;

  const resolved = await resolveItems(db, parseItems(args.items));
  const orderItems = resolved.map((r) => {
    const item: any = {
      productId: r.productId,
      productName: r.productName,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      subtotal: r.subtotal,
    };
    if (r.variantId) item.variantId = r.variantId;
    if (r.variantName) item.variantName = r.variantName;
    return item;
  });

  const total = orderItems.reduce((s, i) => s + i.subtotal, 0);
  const orderNumber = generateOrderNumber();

  const data: any = {
    orderNumber,
    phone: args.phone ? normalizePhone(args.phone) : (c.phone ?? null),
    clientId: args.clientId,
    clientName: c.name ?? null,
    items: orderItems,
    total,
    status: EWhatsappOrderStatus.PENDING,
    source: "whatsapp_bot",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (args.quoteId) data.quoteId = args.quoteId;

  const ref = await db.collection(collections.WHATSAPP_ORDERS).add(data);
  return { id: ref.id, orderNumber, total };
}

// ---------------------------------------------------------------------------
// Conversaciones
// ---------------------------------------------------------------------------

export async function logConversationTurn(args: {
  phone: string;
  role: "user" | "assistant" | "system";
  content: string;
  name?: string;
}) {
  const db = getFirestoreAdmin();
  if (!args?.phone) throw new Error("Se requiere phone");
  const id = normalizePhone(args.phone);
  const ref = db.collection(collections.WHATSAPP_CONVERSATIONS).doc(id);
  const snap = await ref.get();
  const newMsg = { role: args.role, content: args.content, at: Timestamp.now() };

  if (!snap.exists) {
    const data: any = {
      phone: id,
      status: EWhatsappConversationStatus.ACTIVE,
      messages: [newMsg],
      lastMessage: args.content,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (args.name) data.clientName = args.name;
    await ref.set(data);
  } else {
    const existing = snap.data() as any;
    const messages = [...(existing.messages || []), newMsg].slice(-50);
    const update: any = {
      messages,
      lastMessage: args.content,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (args.name && !existing.clientName) update.clientName = args.name;
    await ref.set(update, { merge: true });
  }
  return { ok: true };
}

export async function setConversationHandoff(args: { phone: string; reason?: string }) {
  const db = getFirestoreAdmin();
  if (!args?.phone) throw new Error("Se requiere phone");
  const id = normalizePhone(args.phone);
  const ref = db.collection(collections.WHATSAPP_CONVERSATIONS).doc(id);
  const snap = await ref.get();

  const update: any = {
    phone: id,
    status: EWhatsappConversationStatus.HANDOFF,
    handoffReason: args.reason ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!snap.exists) update.createdAt = FieldValue.serverTimestamp();
  await ref.set(update, { merge: true });
  return { ok: true, status: EWhatsappConversationStatus.HANDOFF };
}
