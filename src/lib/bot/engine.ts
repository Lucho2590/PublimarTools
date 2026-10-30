// Motor del bot: cascada de capas, de la más barata a la más cara.
//   0 guardas → 1 botones/listas → 2 paso esperado → 3 reglas entrenadas →
//   4 IA (solo si nada de lo anterior resolvió) → 5 no entendió / derivar.
// No depende del canal: lo usan el simulador y (Fase 2) el webhook de WhatsApp.

import {
  EBotAction,
  EBotIntentKind,
  EBotLayer,
  EBotStep,
  TBotChannel,
  TBotConfig,
  TBotReply,
  TBotSession,
  TBotTrace,
} from "@/types/bot";
import { aiIntentToAction, classifyWithAi, isAiConfigured } from "./ai";
import { catalogSummary, findFamily, getCatalog } from "./catalog";
import { parseExplicitQuantity, parseSize, parseYesNo } from "./entities";
import { tokenize } from "./normalize";
import {
  TFlowCtx,
  answerFaq,
  fallback,
  handleReplyId,
  handleStep,
  matchGroupByText,
  REPROMPT_STEPS,
  repromptStep,
  runAction,
  showGroup,
  showMenu,
} from "./flow";
import { DEFAULT_BOT_CONFIG, fillTemplate, resolveSegments } from "./defaults";
import { TIntentMatch, matchIntent } from "./matcher";
import { detectSegment } from "./segments";
import { normalizeText } from "./normalize";
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

/** Señales inequívocas de bandera personalizada. */
const CUSTOM_HINT =
  /\b(personalizad\w*|logo|logos|diseno|disenio|disenos|a medida|con foto|con nombre|mi marca|escudo (del|de mi|de nuestro|de la)|con el escudo de|hacer (una |unas |un par de )?banderas?|mandar a hacer)\b/;

/** Señal débil: solo cuenta si no nombró un producto del catálogo ("argentina para el club" no es personalizada). */
const CUSTOM_HINT_WEAK = /\bpara (un|el|mi|nuestro|nuestra) (club|equipo|agrupacion|evento|comparsa|banda)\b/;

const GREETING_START = /^(hola|holis|buenas|buen dia|buenos dias|que tal)\b/;

/** Verbos de pedido: con cantidad + producto, se anota directo. */
const ORDER_HINT = /\b(quiero|necesito|busco|encargo|encargar|comprar|compro|mandame|pasame|anotame|dame)\b/;

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

/**
 * Capa 3: intención entrenada + producto del catálogo. Devuelve true si
 * respondió. Exportada para poder probarla sin Firestore.
 */
export function runRuleLayer(
  ctx: TFlowCtx,
  text: string,
  intentMatch: TIntentMatch | null,
  strongIntent: boolean,
  trace: TBotTrace
): boolean {
  const size = parseSize(text);
  const family = findFamily(ctx.catalog, text, ctx.config);

  // "quiero banderas con mi logo": personalizada aunque gane otra intención.
  const norm = normalizeText(text);
  const customHint = CUSTOM_HINT.test(norm) || (!family && CUSTOM_HINT_WEAK.test(norm));
  if (customHint && intentMatch?.intent.action !== EBotAction.HUMAN) {
    trace.intent = "custom";
    trace.score = null;
    runAction(ctx, EBotAction.CUSTOM, { rawText: text });
    return true;
  }

  // "no" / "sí" sueltos sin nada en curso (después de "¿Algo más?"): cierre amable.
  if (ctx.session.step === EBotStep.IDLE && tokenize(text).length <= 3) {
    const yn = parseYesNo(text);
    if (yn === false) {
      trace.intent = "close";
      ctx.replies.push({ type: "text", text: "¡Listo! Cualquier cosa me escribís 🙌" });
      return true;
    }
    if (yn === true) {
      trace.intent = "continue";
      ctx.replies.push({ type: "text", text: "¡Genial! Contame qué necesitás 🙂" });
      return true;
    }
  }

  // Sin botones: "extranjeras", "otras" eligen el grupo del catálogo.
  if (!family) {
    const groupId = matchGroupByText(ctx, text);
    if (groupId) {
      trace.intent = `grp:${groupId}`;
      trace.score = null;
      showGroup(ctx, groupId, 0);
      return true;
    }
  }

  if (strongIntent && intentMatch) {
    const intent = intentMatch.intent;
    trace.intent = intent.id;
    trace.score = Number(intentMatch.score.toFixed(2));
    if (intent.kind === EBotIntentKind.FAQ) {
      answerFaq(ctx, intent);
      // En pleno cierre del pedido: contesta y vuelve a la pregunta del paso.
      if (REPROMPT_STEPS.includes(ctx.session.step)) repromptStep(ctx);
      return true;
    }
    if (intent.action === EBotAction.HUMAN) {
      runAction(ctx, EBotAction.HUMAN, {});
      return true;
    }
    // "quiero 3 argentinas" / "precio argentina": la intención + el producto.
    const action =
      family &&
      intent.action !== EBotAction.ORDER &&
      intent.action !== EBotAction.PRICE &&
      intent.action !== EBotAction.CUSTOM
        ? EBotAction.PRICE
        : intent.action!;
    runAction(ctx, action, { productText: text, size, quantity: parseExplicitQuantity(text), rawText: text });
    return true;
  }

  // Sin intención clara pero nombra un producto del catálogo.
  if (family) {
    // "quiero 2 boca 60x90": pedido, no consulta → va directo al carrito.
    const quantity = parseExplicitQuantity(text);
    const wantsOrder =
      (intentMatch?.intent.action === EBotAction.ORDER && intentMatch.score >= 0.3) ||
      (!!quantity && ORDER_HINT.test(normalizeText(text)));
    trace.intent = wantsOrder ? "order" : "price";
    trace.score = null;
    trace.note = `Pidió: ${family.label} (${family.products.length} producto${family.products.length === 1 ? "" : "s"})`;
    runAction(ctx, wantsOrder ? EBotAction.ORDER : EBotAction.PRICE, {
      productText: text,
      size,
      quantity: wantsOrder ? quantity : null,
      rawText: text,
    });
    return true;
  }
  return false;
}

/** Sin botones: "2", "la 2", "opción 2" eligen de la última lista numerada. */
export function resolveNumberedReply(session: TBotSession, text: string): string | null {
  const options = session.lastOptions || [];
  if (!options.length) return null;
  const m = normalizeText(text).match(/^(?:la |el |opcion |numero |nro |n )?(\d{1,2})$/);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= options.length ? options[n - 1] : null;
}

export async function handleIncoming(input: TIncoming): Promise<TBotResponse> {
  const t0 = Date.now();
  const text = (input.text || "").trim();
  let replyId = input.replyId || null;

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
    pending: [],
  };
  const trace: TBotTrace = { layer: EBotLayer.GUARD, latencyMs: 0 };

  const finish = async (): Promise<TBotResponse> => {
    // Escrituras en segundo plano del flujo (consulta personalizada): antes de responder.
    const results = await Promise.allSettled(ctx.pending);
    for (const r of results) if (r.status === "rejected") console.error("[bot] pending:", r.reason);
    trace.latencyMs = Date.now() - t0;
    const first = ctx.replies[0];
    if (first && loaded.isNew) {
      // Primer mensaje de la charla: se presenta como agente digital. Se saca un
      // saludo/presentación que ya traiga el texto (bienvenidas viejas guardadas).
      const intro = fillTemplate(config.messages.intro || DEFAULT_BOT_CONFIG.messages.intro, config);
      const body = first.text
        .replace(/^¡?hola!?\s*👋?\s*/i, "")
        .replace(/^soy (el|la|tu) (asistente|agente)[^.!?]*[.!?]?\s*/i, "");
      first.text = `¡Hola! 👋 ${intro}${body ? `\n${body}` : ""}`;
    } else if (first && text && GREETING_START.test(normalizeText(text)) && !/^¡?hola/i.test(first.text)) {
      // "hola, cuánto sale…" más adelante: la respuesta también saluda.
      first.text = `¡Hola! 👋 ${first.text}`;
    }
    trace.segment = session.segmentId && session.segmentId !== "_skip" ? session.segmentId : null;
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
    // Pide algo nuevo que el bot resuelve solo (un producto o una pregunta
    // frecuente): vuelve a atender en vez de dejarlo esperando al equipo.
    const wantsNew =
      !!text &&
      (!!findFamily(catalog, text, config) ||
        (() => {
          const m = matchIntent(text, intents);
          return !!m && m.score >= 0.75 && m.intent.kind === EBotIntentKind.FAQ;
        })());
    if (wantsNew) {
      session.pausedUntil = null;
      trace.note = "Volvió a atender: pedido nuevo mientras esperaba al equipo";
    }
    if (session.pausedUntil && session.pausedUntil > new Date()) {
      trace.note = `Derivado a un humano: el bot no responde hasta ${session.pausedUntil.toLocaleString("es-AR", { timeZone: TZ })}`;
      pushHistory(session, "user", text || input.replyTitle || "");
      // Una sola vez: que no quede en el aire ("¿y me van a responder?").
      if (!session.handoffReassured) {
        session.handoffReassured = true;
        ctx.replies.push({
          type: "text",
          text: ctx.outOfHours
            ? fillTemplate("Ya le pasé tu consulta al equipo 🙌 Ahora estamos cerrados ({horarios}), te escriben apenas abramos.", config)
            : "Ya le pasé tu consulta al equipo 🙌 Te escriben en un ratito.",
        });
        trace.note += " · le confirmó que el equipo ya está avisado";
      }
      return finish();
    }
    session.status = "active";
    session.pausedUntil = null;
  }

  pushHistory(session, "user", text || input.replyTitle || (input.mediaType ? `[${input.mediaType}]` : ""));

  // Tipo de cliente: se deduce de cualquier mensaje ("es para el colegio").
  if (text && (!session.segmentId || session.segmentId === "_skip")) {
    const seg = detectSegment(text, resolveSegments(config));
    if (seg) session.segmentId = seg.id;
  }

  if (!text && !replyId) {
    ctx.replies.push({
      type: "text",
      text: config.messages.unsupportedMedia,
    });
    trace.note = input.mediaType ? `Mensaje no soportado: ${input.mediaType}` : "Mensaje vacío";
    return finish();
  }

  if (!replyId) replyId = resolveNumberedReply(session, text);
  session.lastOptions = [];

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
  // En pasos de texto libre (nombre, dirección) solo corta una intención MUY clara:
  // "Club Kimberley" se parece a "escudo del club" pero es un nombre.
  const veryStrongIntent = !!intentMatch && intentMatch.score >= 0.75;
  if (await handleStep(ctx, text, veryStrongIntent)) {
    session.failCount = 0;
    return finish();
  }

  // ---- Capa 3: reglas entrenadas + catálogo -------------------------------
  trace.layer = EBotLayer.RULE;
  const ruleResolved = runRuleLayer(ctx, text, intentMatch, strongIntent, trace);

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
      if (ai.segment && (!session.segmentId || session.segmentId === "_skip")) {
        session.segmentId = ai.segment;
      }
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
            rawText: [ai.product, ai.size].filter(Boolean).join(" "),
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
  // En pleno cierre del pedido: no se corta el flujo ni se deriva; se dice que
  // lo confirma el equipo y se vuelve a la pregunta del paso.
  if (REPROMPT_STEPS.includes(session.step) && session.cart.length) {
    ctx.replies.push({ type: "text", text: "Eso te lo confirma alguien del equipo 🙌" });
    repromptStep(ctx);
    trace.note = [trace.note, "No entendió en pleno pedido: siguió con el paso"].filter(Boolean).join(" · ");
    return finish();
  }
  fallback(ctx);
  if (isHandoff(session)) {
    trace.note = [trace.note, "2 mensajes sin entender: derivó a un humano"].filter(Boolean).join(" · ");
  }
  return finish();
}
