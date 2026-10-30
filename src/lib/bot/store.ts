// Persistencia del bot (Admin SDK): config, intenciones, sesiones, turnos y
// estadísticas mensuales.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import {
  EBotLayer,
  EBotLearnStatus,
  EBotStep,
  TBotChannel,
  TBotConfig,
  TBotIntent,
  TBotSession,
  TBotTrace,
} from "@/types/bot";
import { BOT_CONFIG_DOC_ID, DEFAULT_BOT_INTENTS, mergeBotConfig } from "./defaults";

/** Sesión inactiva por más de esto → se reinicia el pedido en curso. */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const HISTORY_MAX = 8;

function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Config e intenciones
// ---------------------------------------------------------------------------

export async function getBotConfig(): Promise<TBotConfig> {
  const snap = await getFirestoreAdmin()
    .collection(collections.SETTINGS)
    .doc(BOT_CONFIG_DOC_ID)
    .get();
  return mergeBotConfig(snap.exists ? (snap.data() as Partial<TBotConfig>) : null);
}

/**
 * Intenciones entrenadas. Si la colección está vacía (primer uso) se siembra con
 * las intenciones iniciales para que el panel de entrenamiento las muestre.
 */
export async function getIntents(): Promise<TBotIntent[]> {
  const db = getFirestoreAdmin();
  const col = db.collection(collections.BOT_INTENTS);
  const snap = await col.get();
  if (!snap.empty) {
    return snap.docs.map((d) => ({ ...(d.data() as TBotIntent), id: d.id }));
  }
  const batch = db.batch();
  for (const intent of DEFAULT_BOT_INTENTS) {
    const { id, ...data } = intent;
    batch.set(col.doc(id), {
      ...data,
      hits: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return DEFAULT_BOT_INTENTS;
}

export async function incrementIntentHits(intentId: string): Promise<void> {
  await getFirestoreAdmin()
    .collection(collections.BOT_INTENTS)
    .doc(intentId)
    .set({ hits: FieldValue.increment(1) }, { merge: true })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

function emptySession(id: string, channel: TBotChannel): TBotSession {
  const now = new Date();
  return {
    id,
    channel,
    step: EBotStep.IDLE,
    cart: [],
    pendingProductId: null,
    pendingVariantId: null,
    pendingQuantity: null,
    candidateProductIds: [],
    familyLabel: null,
    familyProductIds: [],
    segmentId: null,
    delivery: null,
    custom: null,
    customerName: null,
    phone: null,
    clientId: null,
    status: "active",
    pausedUntil: null,
    handoffReassured: false,
    needsAttention: false,
    handoffReason: null,
    handoffAt: null,
    handoffSummary: null,
    attendedAt: null,
    attendedBy: null,
    failCount: 0,
    lastOrderNumber: null,
    history: [],
    lastOptions: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Carga la sesión; `isNew` = no existía o venció (para dar la bienvenida). */
export async function loadSession(
  id: string,
  channel: TBotChannel
): Promise<{ session: TBotSession; isNew: boolean }> {
  const snap = await getFirestoreAdmin().collection(collections.BOT_SESSIONS).doc(id).get();
  if (!snap.exists) return { session: emptySession(id, channel), isNew: true };

  const d = snap.data() as any;
  const session: TBotSession = {
    ...emptySession(id, channel),
    ...d,
    id,
    pausedUntil: toDate(d.pausedUntil),
    handoffAt: toDate(d.handoffAt),
    attendedAt: toDate(d.attendedAt),
    createdAt: toDate(d.createdAt) || new Date(),
    updatedAt: toDate(d.updatedAt) || new Date(),
  };

  const expired = Date.now() - session.updatedAt.getTime() > SESSION_TTL_MS;
  if (expired) {
    // Se conserva quién es (nombre/teléfono/cliente); se descarta el pedido a medias.
    const fresh = emptySession(id, channel);
    fresh.customerName = session.customerName;
    fresh.phone = session.phone;
    fresh.clientId = session.clientId;
    fresh.lastOrderNumber = session.lastOrderNumber;
    fresh.segmentId = session.segmentId;
    // Lo pendiente para el equipo no vence con la sesión.
    fresh.needsAttention = session.needsAttention;
    fresh.handoffReason = session.handoffReason;
    fresh.handoffAt = session.handoffAt;
    fresh.handoffSummary = session.handoffSummary;
    if (session.status === "handoff" && session.pausedUntil && session.pausedUntil > new Date()) {
      fresh.status = "handoff";
      fresh.pausedUntil = session.pausedUntil;
    }
    fresh.createdAt = session.createdAt;
    return { session: fresh, isNew: true };
  }
  return { session, isNew: false };
}

export function pushHistory(session: TBotSession, role: "user" | "bot", text: string) {
  if (!text) return;
  session.history = [...(session.history || []), { role, text: text.slice(0, 500) }].slice(
    -HISTORY_MAX
  );
}

export async function saveSession(session: TBotSession): Promise<void> {
  const { id, createdAt, ...rest } = session;
  await getFirestoreAdmin()
    .collection(collections.BOT_SESSIONS)
    .doc(id)
    .set({
      ...rest,
      pausedUntil: session.pausedUntil ? Timestamp.fromDate(session.pausedUntil) : null,
      handoffAt: session.handoffAt ? Timestamp.fromDate(session.handoffAt) : null,
      attendedAt: session.attendedAt ? Timestamp.fromDate(session.attendedAt) : null,
      createdAt: Timestamp.fromDate(createdAt),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function deleteSession(id: string): Promise<void> {
  await getFirestoreAdmin().collection(collections.BOT_SESSIONS).doc(id).delete();
}

// ---------------------------------------------------------------------------
// Turnos y estadísticas
// ---------------------------------------------------------------------------

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Costo de IA acumulado en el mes (para el tope mensual). */
export async function getMonthAiCost(): Promise<number> {
  const snap = await getFirestoreAdmin()
    .collection(collections.BOT_STATS)
    .doc(monthKey())
    .get();
  return snap.exists ? Number((snap.data() as any).aiCostUsd || 0) : 0;
}

export async function logTurn(args: {
  session: TBotSession;
  text: string | null;
  replyId: string | null;
  replyPreview: string;
  trace: TBotTrace;
  orderCreated: boolean;
}): Promise<void> {
  const { session, text, replyId, replyPreview, trace, orderCreated } = args;
  const db = getFirestoreAdmin();

  // Solo vale la pena "enseñar" lo que fue a IA o no se entendió (y era texto).
  const learnable =
    !!text && (trace.layer === EBotLayer.AI || trace.layer === EBotLayer.FALLBACK);

  const turn = {
    sessionId: session.id,
    channel: session.channel,
    text: text ?? null,
    replyId: replyId ?? null,
    replyPreview: replyPreview.slice(0, 1500),
    layer: trace.layer,
    intent: trace.intent ?? null,
    score: trace.score ?? null,
    ai: trace.ai ?? null,
    aiUsage: trace.aiUsage ?? null,
    latencyMs: trace.latencyMs,
    note: trace.note ?? null,
    segment: trace.segment ?? null,
    learnStatus: learnable ? EBotLearnStatus.PENDING : null,
    createdAt: FieldValue.serverTimestamp(),
  };

  const stats: Record<string, any> = {
    turns: FieldValue.increment(1),
    byLayer: { [trace.layer]: FieldValue.increment(1) },
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (trace.aiUsage) {
    stats.aiCalls = FieldValue.increment(1);
    stats.aiCostUsd = FieldValue.increment(trace.aiUsage.costUsd);
  }
  if (orderCreated) stats.orders = FieldValue.increment(1);

  await Promise.all([
    db.collection(collections.BOT_TURNS).add(turn),
    db.collection(collections.BOT_STATS).doc(monthKey()).set(stats, { merge: true }),
  ]);
}
