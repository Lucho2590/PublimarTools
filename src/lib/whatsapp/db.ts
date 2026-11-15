import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { EClientType, EClientStatus, EClientSection } from "@/types/client";
import { EQuoteStatus } from "@/types/quote";
import { EWhatsappConversationStatus, EWhatsappOrderStatus } from "@/types/whatsapp";
import { phoneMatchKey } from "@/lib/phone";

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
    if (p.deleted) throw new Error(`Producto no disponible: ${it.productId}`);
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
  if ((snap.data() as any)?.deleted) return null;
  return mapProduct(snap.id, snap.data());
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

type TClientPhoneEntry = { id: string; name: string | null; keys: string[]; fromBot: boolean };
const CLIENT_INDEX_MS = 5 * 60_000;
let clientIndex: { at: number; list: TClientPhoneEntry[] } | null = null;

/** Clientes (no borrados) con las claves de todos sus teléfonos (el suyo y los de sus contactos). Cacheado 5 min. */
async function getClientPhoneIndex(force = false): Promise<TClientPhoneEntry[]> {
  if (!force && clientIndex && Date.now() - clientIndex.at < CLIENT_INDEX_MS) return clientIndex.list;
  const snap = await getFirestoreAdmin().collection(collections.CLIENTS).get();
  const list = snap.docs
    // Solo clientes de Banderas (los de Vía Pública son otro negocio).
    .filter((d) => !(d.data() as any).deleted && [undefined, null, "", EClientSection.BANDERAS].includes((d.data() as any).section))
    .map((d) => {
      const x = d.data() as any;
      const phones = [x.phone, ...((x.contacts || []) as any[]).map((c) => c?.phone)];
      const keys = Array.from(new Set(phones.map((p) => phoneMatchKey(p)).filter(Boolean)));
      return { id: d.id, name: x.name ?? null, keys, fromBot: x.source === "whatsapp_bot" };
    })
    .filter((c) => c.keys.length);
  clientIndex = { at: Date.now(), list };
  return list;
}

/**
 * Clientes cuyo teléfono coincide (aunque esté cargado distinto: "2235053759" vs
 * "5492235053759"). Si hay clientes cargados por el equipo, los creados por el bot
 * no cuentan (son duplicados a unir).
 */
export async function findClientsByPhone(phone: string): Promise<{ id: string; name: string | null }[]> {
  const key = phoneMatchKey(phone);
  if (!key) return [];
  const matches = (await getClientPhoneIndex()).filter((c) => c.keys.includes(key));
  const real = matches.filter((c) => !c.fromBot);
  return (real.length ? real : matches).map(({ id, name }) => ({ id, name }));
}

/**
 * Cliente del que escribe por WhatsApp:
 * 1. el que el equipo vinculó a esa conversación (whatsappContacts.clientId);
 * 2. si no, por teléfono: si hay UNO solo, se vincula solo;
 * 3. si no hay (o hay varios y no se puede elegir), se crea uno nuevo marcado
 *    como del bot, y si había varios quedan como sugerencias para el equipo.
 */
export async function lookupOrCreateClient(args: { phone: string; name?: string }) {
  const db = getFirestoreAdmin();
  if (!args?.phone) throw new Error("Se requiere phone");
  const norm = normalizePhone(args.phone);
  const contactRef = db.collection(collections.WHATSAPP_CONTACTS).doc(norm);
  const contactSnap = await contactRef.get();

  const linkedId: string | undefined = contactSnap.data()?.clientId;
  if (linkedId) {
    const c = await db.collection(collections.CLIENTS).doc(linkedId).get();
    if (c.exists && !(c.data() as any)?.deleted) {
      return { clientId: c.id, name: (c.data() as any).name ?? null, created: false };
    }
  }

  const matches = await findClientsByPhone(norm);
  if (matches.length === 1) {
    if (contactSnap.exists) {
      await contactRef.set({ clientId: matches[0].id, clientCandidates: [], clientLinkedBy: "auto" }, { merge: true });
    }
    return { clientId: matches[0].id, name: matches[0].name, created: false };
  }

  const name = args.name?.trim() || norm;
  const ref = await db.collection(collections.CLIENTS).add({
    name,
    type: EClientType.INDIVIDUAL,
    status: EClientStatus.ACTIVE,
    section: EClientSection.BANDERAS,
    phone: norm,
    source: "whatsapp_bot",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  clientIndex = null;
  if (contactSnap.exists) {
    await contactRef.set(
      { clientId: ref.id, clientCandidates: matches.map((m) => m.id), clientLinkedBy: "bot_new" },
      { merge: true }
    );
  }
  return { clientId: ref.id, name, created: true };
}

// ---------------------------------------------------------------------------
// Cotizaciones (quotes) y pedidos (whatsappOrders)
// ---------------------------------------------------------------------------

/** Ítems de presupuesto con la forma que usa la UI (anidado `product`/`variant` + campos planos). */
async function quoteItemsFromCatalog(db: Firestore, items: ItemInput[]) {
  if (!Array.isArray(items) || !items.length) throw new Error("Se requiere al menos un item");
  const out: any[] = [];
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const snap = await db.collection(collections.PRODUCTS).doc(it.productId).get();
    const p = snap.data() as any;
    if (!snap.exists || p?.deleted) throw new Error(`Producto no disponible: ${it.productId}`);
    const v = it.variantId ? (p.variants || []).find((x: any) => x.id === it.variantId) : null;
    const unitPrice = coerceNumber(v ? v.price : p.price);
    const quantity = coerceNumber(it.quantity) || 1;
    out.push({
      id: `${Date.now()}-${idx}`,
      product: {
        id: snap.id,
        name: p.name ?? "",
        description: p.description ?? "",
        categories: p.categories ?? [],
        imageUrls: p.imageUrls ?? [],
        hasVariants: !!p.hasVariants,
        price: coerceNumber(p.price),
        taxRate: p.taxRate ?? 0,
      },
      variant: v ? { id: v.id, size: v.size ?? "", price: unitPrice } : null,
      productId: snap.id,
      productName: p.name ?? "",
      variantId: v?.id ?? null,
      variantName: v?.size ?? null,
      description: p.description ?? "",
      quantity,
      unitPrice,
      discount: 0,
      discountType: "percent",
      subtotal: unitPrice * quantity,
      tax: 0,
      taxAmount: 0,
      notes: "",
    });
  }
  return out;
}

/** Cliente embebido en el presupuesto, como lo guarda presupuestos/nuevo (con section: banderas). */
function quoteClientSnapshot(id: string, c: any) {
  return {
    id,
    section: EClientSection.BANDERAS,
    name: c.name || "Sin nombre",
    type: c.type ?? EClientType.INDIVIDUAL,
    status: c.status ?? EClientStatus.ACTIVE,
    email: c.email ?? "",
    phone: c.phone ?? "",
    address: c.address ?? "",
    cuit: c.cuit ?? "",
    dni: c.dni ?? "",
    taxCondition: c.taxCondition ?? null,
    notes: c.notes ?? "",
    contacts: c.contacts ?? [],
  };
}

async function writeDraftQuote(db: Firestore, clientId: string, client: any, items: any[], notes: string) {
  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const number = generateQuoteNumber();
  const ref = await db.collection(collections.QUOTES).add({
    number,
    client: quoteClientSnapshot(clientId, client),
    section: EClientSection.BANDERAS,
    items,
    subtotal: total,
    applyIVA: false,
    taxRate: 0,
    tax: 0,
    taxAmount: 0,
    discountPercentage: 0,
    manualDiscount: 0,
    total,
    status: EQuoteStatus.DRAFT,
    validUntil: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    notes,
    comments: [],
    source: "whatsapp_bot",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, number, total };
}

/** Presupuesto en borrador para un cliente ya conocido (endpoint viejo de n8n). */
export async function createQuote(args: { clientId: string; items: ItemInput[]; notes?: string }) {
  const db = getFirestoreAdmin();
  if (!args?.clientId) throw new Error("Se requiere clientId");
  const clientSnap = await db.collection(collections.CLIENTS).doc(args.clientId).get();
  if (!clientSnap.exists) throw new Error("Cliente no encontrado");
  const items = await quoteItemsFromCatalog(db, parseItems(args.items));
  return writeDraftQuote(db, args.clientId, clientSnap.data(), items, args.notes || "");
}

const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/**
 * El agente arma un presupuesto en BORRADOR para que el equipo lo revise y lo
 * mande. Cliente: 1) por CUIT/CUIL/DNI, 2) el vinculado a la conversación,
 * 3) el único con ese teléfono; si no, lo crea (con datos del padrón de ARCA si
 * se puede). Completa CUIT/DNI/teléfono que le falten, sin pisar lo cargado.
 */
export async function createBotDraftQuote(args: {
  phone: string;
  nombre: string;
  documento: string;
  items: ItemInput[];
}) {
  const db = getFirestoreAdmin();
  const norm = normalizePhone(args.phone);
  const docDigits = onlyDigits(args.documento);
  const isCuit = docDigits.length === 11;

  // 1) Por documento (solo clientes de Banderas).
  const all = await db.collection(collections.CLIENTS).get();
  const banderas = all.docs.filter((d) => {
    const x = d.data() as any;
    return !x.deleted && [undefined, null, "", EClientSection.BANDERAS].includes(x.section);
  });
  let match = banderas.find((d) => {
    const x = d.data() as any;
    return (
      (isCuit &&
        (onlyDigits(x.cuit) === docDigits ||
          ((x.razonesSociales || []) as any[]).some((r) => onlyDigits(r?.cuit) === docDigits))) ||
      (!isCuit && onlyDigits(x.dni) === docDigits)
    );
  });
  // 2) El vinculado a la conversación / 3) el único con ese teléfono.
  const contactRef = db.collection(collections.WHATSAPP_CONTACTS).doc(norm);
  const contactSnap = await contactRef.get();
  if (!match) {
    const linked = contactSnap.data()?.clientId;
    const linkedDoc = linked ? banderas.find((d) => d.id === linked) : undefined;
    // Un cliente creado por el bot sin documento se completa; uno con OTRO documento no se usa.
    const linkedData = linkedDoc?.data() as any;
    const otherDoc = linkedData && (isCuit ? linkedData.cuit && onlyDigits(linkedData.cuit) !== docDigits : linkedData.dni && onlyDigits(linkedData.dni) !== docDigits);
    if (linkedDoc && !otherDoc) match = linkedDoc;
  }
  if (!match) {
    const byPhone = await findClientsByPhone(norm);
    if (byPhone.length === 1) match = banderas.find((d) => d.id === byPhone[0].id);
  }

  let clientId: string;
  let client: any;
  let existing = false;
  if (match) {
    existing = !(match.data() as any).source;
    clientId = match.id;
    client = match.data();
    const fill: Record<string, any> = {};
    if (isCuit && !client.cuit) fill.cuit = docDigits;
    if (!isCuit && !client.dni) fill.dni = docDigits;
    if (!client.phone) fill.phone = norm;
    if (Object.keys(fill).length) {
      await match.ref.set({ ...fill, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      client = { ...client, ...fill };
    }
  } else {
    let padron: any = null;
    if (isCuit) {
      try {
        const { consultarCuit } = await import("@/lib/arca/server/padron");
        padron = await consultarCuit(docDigits);
      } catch {
        padron = null; // ARCA sin configurar o CUIT sin constancia: seguimos con lo que dijo el cliente
      }
    }
    client = {
      name: padron?.razonSocial || args.nombre.trim() || norm,
      type: isCuit && /^3[034]/.test(docDigits) ? EClientType.COMPANY : EClientType.INDIVIDUAL,
      status: EClientStatus.ACTIVE,
      section: EClientSection.BANDERAS,
      phone: norm,
      ...(isCuit ? { cuit: docDigits } : { dni: docDigits }),
      ...(padron?.condicion ? { taxCondition: padron.condicion } : {}),
      ...(padron?.domicilio ? { address: padron.domicilio } : {}),
      source: "whatsapp_bot",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const ref = await db.collection(collections.CLIENTS).add(client);
    clientId = ref.id;
  }
  clientIndex = null;
  if (contactSnap.exists) {
    await contactRef.set({ clientId, clientName: client.name ?? null, clientLinkedBy: existing ? "auto" : "bot_new" }, { merge: true });
  }

  const items = await quoteItemsFromCatalog(db, args.items);
  const notes = `Armado por el agente de WhatsApp (+${norm}). A nombre de: ${args.nombre.trim()} · ${isCuit ? "CUIT/CUIL" : "DNI"} ${docDigits}. Revisar y enviar.`;
  const q = await writeDraftQuote(db, clientId, client, items, notes);
  return { ...q, clientId, clientName: client.name as string, existingClient: existing };
}

export async function createWhatsappOrder(args: {
  clientId: string;
  items: ItemInput[];
  phone?: string;
  quoteId?: string;
  /** Tipo de cliente (bot): también se agrega como etiqueta del cliente. */
  customerSegment?: string | null;
  delivery?: { method: "pickup" | "shipping" | "courier"; place: string | null; address?: string | null } | null;
  customerName?: string | null;
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
  if (args.customerSegment) data.customerSegment = args.customerSegment;
  if (args.delivery) data.delivery = args.delivery;
  if (args.customerName) data.customerName = args.customerName;

  const ref = await db.collection(collections.WHATSAPP_ORDERS).add(data);
  if (args.customerSegment) {
    await db
      .collection(collections.CLIENTS)
      .doc(args.clientId)
      .set({ tags: FieldValue.arrayUnion(args.customerSegment) }, { merge: true });
  }
  return { id: ref.id, orderNumber, total };
}

/**
 * Bandera personalizada a cotizar (estampada, bordada…): no tiene precio en el
 * catálogo, el equipo la cotiza con su tabla. Queda en whatsappOrders con
 * kind "custom_quote" y total 0 para que aparezca en Pedidos como "A cotizar".
 */
export async function createCustomQuoteRequest(args: {
  clientId: string;
  phone?: string;
  customerName?: string | null;
  customerSegment?: string | null;
  delivery?: { method: "pickup" | "shipping" | "courier"; place: string | null; address?: string | null } | null;
  details: {
    technique: string;
    quantity: number | null;
    size: string | null;
    neededBy: string | null;
    whenText: string | null;
    design: string | null;
    leadTime?: string;
    tight?: boolean;
    unitPrice?: number | null;
    estimatedTotal?: number | null;
  };
}) {
  const db = getFirestoreAdmin();
  if (!args?.clientId) throw new Error("Se requiere clientId");
  const clientSnap = await db.collection(collections.CLIENTS).doc(args.clientId).get();
  if (!clientSnap.exists) throw new Error("Cliente no encontrado");
  const c = clientSnap.data() as any;

  const d = args.details;
  const description = [
    `Bandera personalizada ${d.technique.toLowerCase()}`,
    d.size ? d.size : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const orderNumber = generateOrderNumber();
  const data: any = {
    orderNumber,
    kind: "custom_quote",
    phone: args.phone ? normalizePhone(args.phone) : (c.phone ?? null),
    clientId: args.clientId,
    clientName: c.name ?? null,
    items: [
      {
        productName: description,
        quantity: d.quantity ?? 1,
        unitPrice: d.unitPrice ?? 0,
        subtotal: d.estimatedTotal ?? 0,
      },
    ],
    // Estimado si la técnica tiene precio (sublimada); 0 = a cotizar por el equipo.
    total: d.estimatedTotal ?? 0,
    customDetails: d,
    status: EWhatsappOrderStatus.PENDING,
    source: "whatsapp_bot",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (args.customerSegment) data.customerSegment = args.customerSegment;
  if (args.delivery) data.delivery = args.delivery;
  if (args.customerName) data.customerName = args.customerName;

  const ref = await db.collection(collections.WHATSAPP_ORDERS).add(data);
  if (args.customerSegment) {
    await db
      .collection(collections.CLIENTS)
      .doc(args.clientId)
      .set({ tags: FieldValue.arrayUnion(args.customerSegment) }, { merge: true });
  }
  return { id: ref.id, orderNumber };
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

// ---------------------------------------------------------------------------
// Historial del cliente (para que el agente responda por compras anteriores)
// ---------------------------------------------------------------------------

const ORDER_STATUS_FOR_CLIENT: Record<string, string> = {
  draft: "a confirmar",
  pending: "a confirmar",
  in_process: "en preparación",
  completed: "entregada",
  cancelled: "cancelada",
};
const WA_ORDER_STATUS_FOR_CLIENT: Record<string, string> = {
  pending: "recibido, el equipo lo tiene que confirmar",
  confirmed: "confirmado por el equipo",
  processed: "pasado a venta u orden",
  cancelled: "cancelado",
};

function dateAR(v: any): string | null {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  return d && !isNaN(d.getTime())
    ? d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "numeric", year: "numeric" })
    : null;
}

/**
 * Compras del cliente que escribe desde ese número: SOLO el cliente vinculado a
 * esa conversación (o el único con ese teléfono). Nunca crea clientes y nunca
 * devuelve datos de otro.
 */
export async function getClientHistory(args: { phone: string; clientId?: string | null }) {
  const db = getFirestoreAdmin();
  const norm = normalizePhone(args.phone);
  let clientId = args.clientId || null;
  if (!clientId) {
    const contact = await db.collection(collections.WHATSAPP_CONTACTS).doc(norm).get();
    clientId = contact.data()?.clientId || null;
  }
  if (!clientId) {
    const matches = await findClientsByPhone(norm);
    if (matches.length === 1) clientId = matches[0].id;
  }
  if (!clientId) return { cliente: null };

  const client = (await db.collection(collections.CLIENTS).doc(clientId).get()).data() as any;
  const byClient = async (col: string) =>
    (await db.collection(col).where("clientId", "==", clientId).get()).docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((x) => !x.deleted)
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .slice(0, 5);
  const items = (list: any[] = []) =>
    list
      .slice(0, 6)
      .map((i) => `${i.quantity ?? 1} × ${i.productName || i.product?.name || "ítem"}${i.variantName ? ` ${i.variantName}` : ""}`)
      .join(", ");

  const [orders, sales, waOrders] = await Promise.all([
    byClient(collections.ORDERS),
    byClient(collections.SALES),
    byClient(collections.WHATSAPP_ORDERS),
  ]);
  return {
    cliente: client?.name ?? null,
    ordenes_de_trabajo: orders.map((o) => ({
      numero: o.number ?? null,
      fecha: dateAR(o.createdAt),
      estado: ORDER_STATUS_FOR_CLIENT[o.status] || o.status,
      entrega_estimada: dateAR(o.estimatedDeliveryDate),
      items: items(o.items),
      total: coerceNumber(o.total),
      saldo_pendiente: o.balance != null ? coerceNumber(o.balance) : null,
    })),
    // Las ventas que salieron de una orden ya están en ordenes_de_trabajo.
    compras: sales.filter((s) => !s.orderId).map((s) => ({ fecha: dateAR(s.createdAt), items: items(s.items), total: coerceNumber(s.total) })),
    pedidos_por_whatsapp: waOrders.map((w) => ({
      numero: w.orderNumber ?? null,
      fecha: dateAR(w.createdAt),
      estado: WA_ORDER_STATUS_FOR_CLIENT[w.status] || w.status,
      items: items(w.items),
      total: coerceNumber(w.total),
    })),
  };
}
