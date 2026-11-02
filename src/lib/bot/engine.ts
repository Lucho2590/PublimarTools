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
import { agentNote, runAgent } from "./agent";
import { catalogSummary, findFamily, getCatalog } from "./catalog";
import { parseExplicitQuantity, parseSize, parseYesNo } from "./entities";
import { tokenize } from "./normalize";
import {
  AI_REPROMPT_STEPS,
  TFlowCtx,
  aiFlowContext,
  answerFaq,
  extractSideQuestion,
  fallback,
  isQuestion,
  handleReplyId,
  handleStep,
  resetOrder,
  matchGroupByText,
  REPROMPT_STEPS,
  repromptStep,
  runAction,
  showGroup,
  showMenu,
} from "./flow";
import { DEFAULT_BOT_CONFIG, fillTemplate, hasMissingBusinessData, resolveSegments } from "./defaults";
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
  pushAgentHistory,
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
  /\b(personalizad\w*|egresad\w*|logo|logos|diseno|disenio|disenos|a medida|con foto|con nombre|mi marca|escudo (del|de mi|de nuestro|de la)|con el escudo de|hacer (una |unas |un par de )?banderas?|mandar a hacer|(agregar|agregarle|agregarles|poner|ponerle|ponerles|escribir|escribirle|escribirles|sumarle|bordarle|estamparle|imprimirle)( (un|una|el|la|unas|unos|mi|su))? (nombre|nombres|texto|leyenda|inscripcion|frase|escudo|logo|dibujo|imagen|foto|fecha|numero)|con (una |la |un |el )?(leyenda|inscripcion|frase|texto|nombres))\b/;

/** Señal débil: solo cuenta si no nombró un producto del catálogo ("argentina para el club" no es personalizada). */
const CUSTOM_HINT_WEAK = /\bpara (un|el|mi|nuestro|nuestra) (club|equipo|agrupacion|evento|comparsa|banda)\b/;

const RESTART = /\b(empezar|empecemos|arrancar|arranquemos|comenzar) (de nuevo|de cero|otra vez)\b|\breinicia(r)?\b|\bborra(r)? todo\b/;

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
  // Preguntas: si hay IA, contesta ella (entiende el contexto). Las reglas solo se
  // quedan con lo que entrenaste con mucha seguridad o con "cuánto sale la de X".
  const veryStrong = !!intentMatch && intentMatch.score >= 0.75;
  if (ctx.aiAvailable && isQuestion(text) && !veryStrong && !(family && !customHint)) return false;

  // Una FAQ entrenada sobre personalizadas ("¿hacen de egresados?"): se responde
  // con el texto del equipo y se sigue con el flujo de personalizada.
  const faq = strongIntent && intentMatch?.intent.kind === EBotIntentKind.FAQ ? intentMatch.intent : null;
  const faqIsCustom = !!faq && (customHint || /personalizad/i.test(faq.answer || ""));
  if (faqIsCustom && faq && !REPROMPT_STEPS.includes(ctx.session.step)) {
    trace.intent = faq.id;
    trace.score = Number(intentMatch!.score.toFixed(2));
    answerFaq(ctx, faq);
    runAction(ctx, EBotAction.CUSTOM, { rawText: text });
    return true;
  }
  // Personalizada ya en curso + pregunta ("¿te tengo que pasar el diseño?"): no se
  // reinicia; la contesta la IA (o el equipo) y se vuelve a la pregunta del paso.
  if (customHint && isQuestion(text) && ctx.session.step.startsWith("custom_")) return false;
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

/**
 * Pregunta que vino en el mismo mensaje que la respuesta a un paso. Orden de
 * costo: FAQ entrenada → IA (con el estado de la charla) → se la pasa al equipo
 * (queda "por atender" pero el bot sigue con el pedido).
 */
async function answerSideQuestion(ctx: TFlowCtx, question: string, trace: TBotTrace): Promise<string> {
  const { config, intents, session } = ctx;
  const m = matchIntent(question, intents);
  const answer = m?.intent.kind === EBotIntentKind.FAQ ? m.intent.answer || "" : "";
  if (m && m.score >= (config.matchThreshold || 0.5) && answer.trim() && !hasMissingBusinessData(answer, config)) {
    ctx.replies.push({ type: "text", text: fillTemplate(answer, config) });
    return `FAQ ${m.intent.id}`;
  }
  if (config.aiEnabled && isAiConfigured() && (await getMonthAiCost()) < (config.aiMonthlyBudgetUsd ?? 0)) {
    const outcome = await classifyWithAi({
      config,
      intents,
      catalogText: catalogSummary(ctx.catalog),
      history: session.history.slice(0, -1),
      text: question,
      flowContext: aiFlowContext(ctx),
    });
    trace.aiUsage = outcome.usage;
    if (outcome.ok && outcome.result.reply && outcome.result.confidence >= AI_MIN_CONFIDENCE) {
      ctx.replies.push({ type: "text", text: outcome.result.reply });
      return "IA";
    }
  }
  ctx.replies.push({
    type: "text",
    text: "Sobre tu consulta, te la confirma alguien del equipo por acá 🙌",
  });
  session.needsAttention = true;
  session.handoffReason = `Consulta: ${question}`;
  session.handoffAt = new Date();
  return "pasada al equipo";
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

  const aiAllowed =
    config.aiEnabled && isAiConfigured() && (await getMonthAiCost()) < (config.aiMonthlyBudgetUsd ?? 0);

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
    aiAvailable: aiAllowed,
  };
  const trace: TBotTrace = { layer: EBotLayer.GUARD, latencyMs: 0 };
  let agentAnswered = false;

  const finish = async (): Promise<TBotResponse> => {
    // Escrituras en segundo plano del flujo (consulta personalizada): antes de responder.
    const results = await Promise.allSettled(ctx.pending);
    for (const r of results) if (r.status === "rejected") console.error("[bot] pending:", r.reason);
    trace.latencyMs = Date.now() - t0;
    const first = ctx.replies[0];
    if (agentAnswered) {
      // El agente IA ya se presenta y saluda solo.
    } else if (first && loaded.isNew) {
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
    pushAgentHistory(session, text || input.replyTitle || "", ctx.replies.map((r) => r.text));
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

  // "Empezar de nuevo" / "reiniciar": se borra lo que había a medias.
  if (text && RESTART.test(normalizeText(text))) {
    resetOrder(session);
    session.agentHistory = [];
    ctx.replies.push({ type: "text", text: "¡Listo, arrancamos de cero! 🙌 Contame qué bandera buscás." });
    trace.intent = "restart";
    return finish();
  }

  // ---- Agente IA: lleva la charla con herramientas ------------------------
  // Si falla (sin clave, tope, error), siguen las reglas como siempre.
  if (config.agentMode && aiAllowed && text) {
    // "Hola" solo = charla nueva (lo que había a medias queda atrás).
    const pureGreeting = /^(hola+|holis|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal)$/.test(
      normalizeText(text).replace(/[^a-z ]/g, "").trim()
    );
    if (pureGreeting && (session.agentHistory || []).length) {
      resetOrder(session);
      session.agentHistory = [];
    }
    const isFirst = loaded.isNew || !(session.agentHistory || []).length;
    const outcome = await runAgent(ctx, text, isFirst);
    trace.aiUsage = outcome.usage;
    if (outcome.ok) {
      ctx.replies.push({ type: "text", text: outcome.reply });
      agentAnswered = true;
      session.failCount = 0;
      trace.layer = isHandoff(session) ? EBotLayer.HANDOFF : EBotLayer.AI;
      trace.intent = "agente";
      agentNote(outcome.actions, trace);
      return finish();
    }
    trace.note = `Agente IA no respondió (${outcome.error}): siguieron las reglas`;
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
    // "90x1,50… y le puedo agregar una inscripción?": el paso tomó la medida;
    // la pregunta colgada se contesta aparte (sin perder el pedido).
    const side = extractSideQuestion(text);
    if (side) trace.note = `Pregunta aparte: ${await answerSideQuestion(ctx, side, trace)}`;
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


  if (aiAllowed) {
    const outcome = await classifyWithAi({
      config,
      intents,
      catalogText: catalogSummary(catalog),
      history: session.history.slice(0, -1),
      text,
      flowContext: aiFlowContext(ctx),
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
        // "¿tenés de River?": "catalog" con producto es consultar ese producto.
        const action =
          (ai.intent === "catalog" || (ai.intent === "other" && !ai.reply)) && ai.product
            ? EBotAction.PRICE
            : aiIntentToAction(ai.intent);
        // Pregunta en medio de un paso: se contesta y se vuelve a la pregunta del paso.
        const inFlow = AI_REPROMPT_STEPS.includes(session.step);
        // "custom" en plena personalizada reiniciaría el flujo: mejor su respuesta.
        const sameFlow = action === EBotAction.CUSTOM && session.step.startsWith("custom_");
        // Quiere otra cosa (personalizarla, otra bandera): se contesta y se cambia de rumbo.
        const changesCourse =
          action === EBotAction.CUSTOM || ((action === EBotAction.ORDER || action === EBotAction.PRICE) && !!ai.product);
        if (ai.intent === "faq" && faqIntent) {
          answerFaq(ctx, faqIntent);
          if (inFlow) repromptStep(ctx);
        } else if (ai.reply && sameFlow) {
          ctx.replies.push({ type: "text", text: ai.reply });
          repromptStep(ctx);
        } else if (ai.reply && inFlow && !changesCourse) {
          ctx.replies.push({ type: "text", text: ai.reply });
          repromptStep(ctx);
        } else if (action && !sameFlow) {
          // "¿Le puedo escribir algo?": primero la respuesta, después el flujo (personalizada…).
          const flowActions = [EBotAction.CUSTOM, EBotAction.ORDER, EBotAction.PRICE, EBotAction.CATALOG];
          if (ai.reply && flowActions.includes(action)) ctx.replies.push({ type: "text", text: ai.reply });
          runAction(ctx, action, {
            productText: ai.product,
            size: ai.size ? parseSize(ai.size) || ai.size : null,
            quantity: ai.quantity,
            // Personalizada: el texto entero (trae fecha, cantidad, logo…).
            rawText:
              action === EBotAction.CUSTOM
                ? [text, ai.size].filter(Boolean).join(" ")
                : [ai.product, ai.size].filter(Boolean).join(" "),
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
  if ((REPROMPT_STEPS.includes(session.step) && session.cart.length) || session.step.startsWith("custom_")) {
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
