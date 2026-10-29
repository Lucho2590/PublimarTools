// Capa de IA (fallback): UNA llamada a Claude que clasifica el mensaje y extrae
// datos. La IA no pone precios ni ejecuta acciones: el motor decide qué hacer
// con lo que entendió, usando el catálogo real.

import Anthropic from "@anthropic-ai/sdk";
import { EBotAction, EBotIntentKind, TBotAiResult, TBotAiUsage, TBotConfig, TBotHistoryEntry, TBotIntent } from "@/types/bot";
import { fillTemplate } from "./defaults";

const AI_TIMEOUT_MS = 8000;

/** US$ por millón de tokens (input, output). Cache: lectura 0.1x, escritura 1.25x. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

const AI_INTENTS = [
  "greeting",
  "menu",
  "catalog",
  "price",
  "order",
  "human",
  "thanks",
  "faq",
  "other",
] as const;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: AI_INTENTS as unknown as string[] },
    faqId: { type: ["string", "null"] },
    product: { type: ["string", "null"] },
    size: { type: ["string", "null"] },
    quantity: { type: ["integer", "null"] },
    confidence: { type: "number" },
    reply: { type: ["string", "null"] },
  },
  required: ["intent", "faqId", "product", "size", "quantity", "confidence", "reply"],
  additionalProperties: false,
};

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ maxRetries: 1 });
  return client;
}

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function computeCost(model: string, u: Anthropic.Usage): TBotAiUsage {
  const p = PRICING[model] || PRICING["claude-haiku-5-5"];
  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  const cacheRead = u.cache_read_input_tokens || 0;
  const cacheWrite = u.cache_creation_input_tokens || 0;
  const costUsd =
    (input * p.input + cacheRead * p.input * 0.1 + cacheWrite * p.input * 1.25 + output * p.output) /
    1_000_000;
  return {
    model,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    costUsd,
  };
}

/**
 * Prompt de sistema ESTABLE (va cacheado): no incluye nada que cambie por
 * mensaje (hora, sesión). Cambia solo cuando cambian FAQs, config o catálogo.
 */
function buildSystemPrompt(config: TBotConfig, intents: TBotIntent[], catalogText: string): string {
  const faqs = intents
    .filter((i) => i.enabled && i.kind === EBotIntentKind.FAQ)
    .map(
      (i) =>
        `- id: ${i.id} | tema: ${i.label} | ejemplos: ${i.examples.slice(0, 5).join("; ")} | respuesta: ${fillTemplate(i.answer || "", config)}`
    )
    .join("\n");
  const b = config.business;

  return `Sos el clasificador de mensajes del WhatsApp de ${b.name || "Publimar"}, un negocio que vende banderas (Mar del Plata, Argentina). Los clientes escriben en castellano rioplatense, con errores de tipeo y abreviaturas.

Tu trabajo NO es conversar: es entender qué quiere el cliente y devolver JSON. El sistema ejecuta la acción con datos reales.

Intenciones posibles:
- greeting: solo saluda.
- menu: pide opciones/ayuda general.
- catalog: quiere ver qué banderas hay.
- price: pregunta el precio de algo. Completá "product" con el producto tal como lo nombra (y "size" si dice medida, ej "90x150").
- order: quiere comprar/encargar. Completá product/size/quantity si los dice.
- human: pide hablar con una persona, o está enojado, o pide algo que un bot no puede resolver (reclamos, diseños personalizados complejos, facturas).
- thanks: agradece o se despide.
- faq: su pregunta la responde una de las preguntas frecuentes de abajo. Poné el "faqId".
- other: nada de lo anterior.

Reglas:
- "reply" solo se completa con intent "other" o "faq" y SOLO con información que esté literalmente en "Datos del negocio" o "Preguntas frecuentes". Nunca inventes precios, plazos, stock, envíos ni promociones. Si no está la info, dejá reply en null.
- "reply" corto (máximo 2 oraciones), tono cordial rioplatense, sin markdown salvo *negrita*.
- "confidence" entre 0 y 1: qué tan seguro estás de la intención.
- Si el mensaje es ambiguo, confidence baja.

Datos del negocio:
- Dirección: ${b.address || "(sin cargar)"}
- Horarios: ${b.hours || "(sin cargar)"}
- Envíos: ${b.shipping || "(sin cargar)"}
- Formas de pago: ${b.payments || "(sin cargar)"}
- Tiempos de fabricación: ${b.productionTime || "(sin cargar)"}
- Otros: ${b.extra || "(nada)"}

Preguntas frecuentes:
${faqs || "(ninguna)"}

Productos (sin precios; los precios los pone el sistema):
${catalogText || "(catálogo vacío)"}`;
}

export type TAiOutcome =
  | { ok: true; result: TBotAiResult; usage: TBotAiUsage }
  | { ok: false; error: string; usage: TBotAiUsage | null };

export async function classifyWithAi(args: {
  config: TBotConfig;
  intents: TBotIntent[];
  catalogText: string;
  history: TBotHistoryEntry[];
  text: string;
}): Promise<TAiOutcome> {
  const anthropic = getClient();
  if (!anthropic) return { ok: false, error: "ANTHROPIC_API_KEY no configurada", usage: null };

  const { config, intents, catalogText, history, text } = args;
  const model = config.model || "claude-haiku-5-5";

  // Contexto reciente como texto dentro del turno del usuario: mantiene el
  // system cacheable y evita reconstruir turnos alternados.
  const recent = history
    .slice(-6)
    .map((h) => `${h.role === "user" ? "Cliente" : "Bot"}: ${h.text}`)
    .join("\n");
  const userContent = `${recent ? `Conversación reciente:\n${recent}\n\n` : ""}Mensaje nuevo del cliente:\n${text}`;

  try {
    const response = await anthropic.messages.create(
      {
        model,
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: buildSystemPrompt(config, intents, catalogText),
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userContent }],
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: OUTPUT_SCHEMA },
        },
      },
      { timeout: AI_TIMEOUT_MS }
    );

    const usage = computeCost(model, response.usage);
    if (response.stop_reason === "refusal") {
      return { ok: false, error: "La IA rechazó el mensaje", usage };
    }
    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    if (!textBlock) return { ok: false, error: "Respuesta vacía de la IA", usage };

    const parsed = JSON.parse(textBlock.text);
    const intent = AI_INTENTS.includes(parsed.intent) ? parsed.intent : "other";
    const faqId =
      typeof parsed.faqId === "string" && intents.some((i) => i.id === parsed.faqId)
        ? parsed.faqId
        : null;
    const result: TBotAiResult = {
      intent,
      faqId,
      product: typeof parsed.product === "string" && parsed.product.trim() ? parsed.product : null,
      size: typeof parsed.size === "string" && parsed.size.trim() ? parsed.size : null,
      quantity:
        Number.isInteger(parsed.quantity) && parsed.quantity > 0 ? parsed.quantity : null,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reply: typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : null,
    };
    return { ok: true, result, usage };
  } catch (error) {
    let message = "Error de la IA";
    if (error instanceof Anthropic.RateLimitError) message = "IA: límite de uso alcanzado";
    else if (error instanceof Anthropic.AuthenticationError) message = "IA: API key inválida";
    else if (error instanceof Anthropic.APIConnectionTimeoutError) message = "IA: tiempo de espera agotado";
    else if (error instanceof Anthropic.APIError) message = `IA: error ${error.status}`;
    else if (error instanceof SyntaxError) message = "IA: respuesta no es JSON válido";
    console.error("[bot ai]", error);
    return { ok: false, error: message, usage: null };
  }
}

/** Mapea la intención de la IA a una acción del motor (las FAQ van aparte). */
export function aiIntentToAction(intent: string): EBotAction | null {
  const values = Object.values(EBotAction) as string[];
  return values.includes(intent) ? (intent as EBotAction) : null;
}
