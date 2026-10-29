// Motor del bot: cascada de capas, de la más barata a la más cara.
//   0 guardas → 1 botones/listas → 2 paso esperado → 3 reglas entrenadas →
//   4 IA (solo si nada de lo anterior resolvió) → 5 no entendió / derivar.
// No depende del canal: lo usan el simulador y (Fase 2) el webhook de WhatsApp.

import {
  EBotAction,
  EBotIntentKind,
  EBotLayer,
  TBotChannel,
  TBotConfig,
  TBotReply,
  TBotSession,
  TBotTrace,
} from "@/types/bot";
import { aiIntentToAction, classifyWithAi, isAiConfigured } from "./ai";
import { catalogSummary, findProducts, getCatalog } from "./catalog";
import { parseSize, parseQuantity } from "./entities";
import {
  TFlowCtx,
  answerFaq,
  fallback,
  handleReplyId,
  handleStep,
  runAction,
  showMenu,
} from "./flow";
import { matchIntent } from "./matcher";
import {
  getBotConfig,
  getIntents,
  getMonthAiCost,
  incrementIntentHits,
  loadSession,
  logTurn,
  pushHistory,
  saveSession,
} from "./store";

export type TIncoming = {
  sessionId: string;
  channel: TBotChannel;
  /** Texto libre del cliente. */
  text?: string | null;
  /** Id del botón/fila de lista tocado. */
  replyId?: string | null;
  /** Título visible del botón tocado (para el historial). */
  replyTitle?: string | null;
  /** Mensaje no-texto (audio, imagen…) sin texto. */
  mediaType?: string | null;
  /** Teléfono del cliente (WhatsApp) o de prueba (simulador). */
  phone?: string | null;
  /** Simulador: si es false, el pedido confirmado no se guarda. */
  persistOrders?: boolean;
};

export type TBotResponse = { replies: TBotReply[]; trace: TBotTrace };

/** AI mínima confianza para actuar sobre lo que entendió. */
const AI_MIN_CONFIDENCE = 0.5;

const TZ = "America/Argentina/Buenos_Aires";

export function isOutOfHours(config: TBotConfig, now = new Date()): boolean {
  const bh = config.businessHours;
  if (!bh?.enabled) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hhmm = `${get("hour").replace("24", "00")}:${get("minute")}`;
  if (!bh.days.includes(day)) return true;
  return hhmm < bh.open || hhmm >= bh.close;
}

// Función (no comparación inline) para que TS no "estreche" el estado: las
// acciones del flujo lo cambian a "handoff" por referencia.
const isHandoff = (s: TBotSession) => s.status === "handoff";

function previewOf(replies: TBotReply[]): string {
  return replies.map((r) => r.text).join(" | ");
}

export async function handleIncoming(input: TIncoming): Promise<TBotResponse> {
  const t0 = Date.now();
  const text = (input.text || "").trim();
  const replyId = input.replyId || null;

  const [config, intents, catalog, loaded] = await Promise.all([
    getBotConfig(),
    getIntents(),
    getCatalog(),
    loadSession(input.sessionId, input.channel),
  ]);
  const { session } = loaded;
  if (input.phone) session.phone = input.phone;

  const ctx: TFlowCtx = {
    config,
    catalog,
    intents,
    session,
    replies: [],
    persistOrders: input.channel === "whatsapp" ? true : !!input.persistOrders,
    outOfHours: isOutOfHours(config),
    orderCreated: false,
  };
  const trace: TBotTrace = { layer: EBotLayer.GUARD, latencyMs: 0 };

  const finish = async (): Promise<TBotResponse> => {
    trace.latencyMs = Date.now() - t0;
    for (const r of ctx.replies) pushHistory(session, "bot", r.text);
    await saveSession(session);
    await logTurn({
      session,
      text: text || null,
      replyId,
      replyPreview: previewOf(ctx.replies),
      trace,
      orderCreated: ctx.orderCreated,
    }).catch((e) => console.error("[bot] logTurn:", e));
    return { replies: ctx.replies, trace };
  };

  // ---- Capa 0: guardas ----------------------------------------------------
  if (!config.enabled && input.channel === "whatsapp") {
    trace.note = "Bot apagado";
    trace.latencyMs = Date.now() - t0;
    return { replies: [], trace };
  }
  if (session.status === "handoff") {
    if (session.pausedUntil && session.pausedUntil > new Date()) {
      trace.note = `Derivado a un humano: el bot no responde hasta ${session.pausedUntil.toLocaleString("es-AR", { timeZone: TZ })}`;
      pushHistory(session, "user", text || input.replyTitle || "");
      return finish();
    }
    session.status = "active";
    session.pausedUntil = null;
  }

  pushHistory(session, "user", text || input.replyTitle || (input.mediaType ? `[${input.mediaType}]` : ""));

  if (!text && !replyId) {
    ctx.replies.push({
      type: "text",
      text: config.messages.unsupportedMedia,
    });
    trace.note = input.mediaType ? `Mensaje no soportado: ${input.mediaType}` : "Mensaje vacío";
    return finish();
  }

  // ---- Capa 1: botón / lista ----------------------------------------------
  if (replyId) {
    trace.layer = EBotLayer.FLOW;
    trace.intent = replyId;
    if (await handleReplyId(ctx, replyId)) {
      session.failCount = 0;
      if (isHandoff(session)) trace.layer = EBotLayer.HANDOFF;
      return finish();
    }
    // Botón viejo (de otra sesión o producto borrado): se muestra el menú.
    showMenu(ctx, false);
    trace.note = "Botón desconocido o vencido";
    return finish();
  }

  // ---- Capa 2: paso esperado ----------------------------------------------
  const intentMatch = matchIntent(text, intents);
  const threshold = config.matchThreshold || 0.5;
  const strongIntent = !!intentMatch && intentMatch.score >= threshold;

  trace.layer = EBotLayer.STEP;
  trace.intent = session.step;
  if (await handleStep(ctx, text, strongIntent)) {
    session.failCount = 0;
    return finish();
  }

  // ---- Capa 3: reglas entrenadas + catálogo -------------------------------
  trace.layer = EBotLayer.RULE;
  const size = parseSize(text);
  const productMatches = findProducts(catalog, text, config.productAliases);
  const ruleResolved = (() => {
    if (strongIntent && intentMatch) {
      const intent = intentMatch.intent;
      trace.intent = intent.id;
      trace.score = Number(intentMatch.score.toFixed(2));
      if (intent.kind === EBotIntentKind.FAQ) {
        answerFaq(ctx, intent);
        return true;
      }
      if (intent.action === EBotAction.HUMAN) {
        runAction(ctx, EBotAction.HUMAN, {});
        return true;
      }
      // "quiero 3 argentinas" / "precio argentina": la intención + el producto.
      const action =
        productMatches.length &&
        intent.action !== EBotAction.ORDER &&
        intent.action !== EBotAction.PRICE
          ? EBotAction.PRICE
          : intent.action!;
      runAction(ctx, action, { productText: text, size, quantity: parseQuantity(text) });
      return true;
    }
    // Sin intención clara pero nombra un producto del catálogo → cotiza.
    if (productMatches.length) {
      trace.intent = "price";
      trace.score = Number(productMatches[0].score.toFixed(2));
      runAction(ctx, EBotAction.PRICE, { productText: text, size });
      return true;
    }
    return false;
  })();

  if (ruleResolved) {
    session.failCount = 0;
    if (trace.intent && intents.some((i) => i.id === trace.intent)) {
      await incrementIntentHits(trace.intent);
    }
    if (isHandoff(session)) trace.layer = EBotLayer.HANDOFF;
    return finish();
  }

  // ---- Capa 4: IA ---------------------------------------------------------
  trace.intent = intentMatch?.intent.id ?? null;
  trace.score = intentMatch ? Number(intentMatch.score.toFixed(2)) : null;

  const aiAllowed =
    config.aiEnabled &&
    isAiConfigured() &&
    (await getMonthAiCost()) < (config.aiMonthlyBudgetUsd ?? 0);

  if (aiAllowed) {
    const outcome = await classifyWithAi({
      config,
      intents,
      catalogText: catalogSummary(catalog),
      history: session.history.slice(0, -1),
      text,
    });
    trace.aiUsage = outcome.usage;
    if (outcome.ok) {
      const ai = outcome.result;
      trace.ai = ai;
      trace.layer = EBotLayer.AI;
      trace.intent = ai.intent === "faq" ? ai.faqId : ai.intent;
      trace.score = ai.confidence;

      if (ai.confidence >= AI_MIN_CONFIDENCE) {
        const faqIntent = ai.faqId ? intents.find((i) => i.id === ai.faqId) : null;
        const action = aiIntentToAction(ai.intent);
        if (ai.intent === "faq" && faqIntent) {
          answerFaq(ctx, faqIntent);
        } else if (action) {
          runAction(ctx, action, {
            productText: ai.product,
            size: ai.size ? parseSize(ai.size) || ai.size : null,
            quantity: ai.quantity,
          });
        } else if (ai.reply) {
          ctx.replies.push({
            type: "buttons",
            text: ai.reply,
            buttons: [
              { id: "menu:catalog", title: "Ver banderas" },
              { id: "menu:human", title: "Hablar con alguien" },
            ],
          });
        }
      }
      if (ctx.replies.length) {
        session.failCount = 0;
        if (isHandoff(session)) trace.note = "La IA derivó a un humano";
        return finish();
      }
    } else {
      trace.note = outcome.error;
    }
  } else {
    trace.note = !config.aiEnabled
      ? "IA desactivada"
      : !isAiConfigured()
        ? "Falta ANTHROPIC_API_KEY"
        : "Tope mensual de IA alcanzado";
  }

  // ---- Capa 5: no entendió (2 seguidas → derivar) ------------------------
  // Queda como FALLBACK aunque derive: así aparece en "Por aprender".
  trace.layer = EBotLayer.FALLBACK;
  fallback(ctx);
  if (isHandoff(session)) {
    trace.note = [trace.note, "2 mensajes sin entender: derivó a un humano"].filter(Boolean).join(" · ");
  }
  return finish();
}
