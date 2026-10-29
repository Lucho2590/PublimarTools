// Valores iniciales del bot. Puro (sin Firestore): lo usan tanto el motor del
// servidor como el panel del cliente para "cargar intenciones iniciales".

import {
  EBotAction,
  EBotIntentKind,
  TBotConfig,
  TBotIntent,
} from "@/types/bot";

/** Doc de configuración: settings/whatsappBot. */
export const BOT_CONFIG_DOC_ID = "whatsappBot";

export const BOT_MODELS: { id: string; label: string }[] = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (más barato)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (más capaz)" },
];

export const DEFAULT_BOT_CONFIG: TBotConfig = {
  enabled: false,
  aiEnabled: true,
  model: "claude-haiku-5-5",
  aiMonthlyBudgetUsd: 5,
  matchThreshold: 0.5,
  handoffPauseHours: 12,
  businessHours: {
    enabled: true,
    days: [1, 2, 3, 4, 5],
    open: "09:00",
    close: "18:00",
  },
  messages: {
    welcome:
      "¡Hola! 👋 Soy el asistente de *{negocio}*. Te paso precios de banderas y te tomo el pedido. ¿Qué necesitás?",
    fallback:
      "Perdón, no te entendí bien 🙈. Podés elegir una opción o escribirme, por ejemplo: _\"precio bandera argentina 90x150\"_.",
    handoff:
      "Listo, te paso con una persona del equipo. En un ratito te responden 🙌",
    handoffOutOfHours:
      "Listo, le dejo tu consulta al equipo. Ahora estamos fuera de horario ({horarios}); te responden apenas abramos 🙌",
    orderConfirmed:
      "¡Pedido *{numero}* registrado! ✅ Total: *{total}*. Un asesor te va a escribir para coordinar el pago y la entrega.",
    unsupportedMedia:
      "Por ahora solo puedo leer mensajes de texto 🙏. Escribime lo que necesitás o pedí hablar con una persona.",
  },
  business: {
    name: "Banderas Publimar",
    address: "",
    hours: "lunes a viernes de 9 a 18",
    shipping: "",
    payments: "",
    productionTime: "",
    extra: "",
  },
  productAliases: {},
};

/** Variables disponibles en respuestas de FAQ y mensajes fijos. */
export const BOT_TEMPLATE_VARS: { key: string; label: string }[] = [
  { key: "negocio", label: "Nombre del negocio" },
  { key: "direccion", label: "Dirección" },
  { key: "horarios", label: "Horarios" },
  { key: "envios", label: "Envíos" },
  { key: "pagos", label: "Formas de pago" },
  { key: "fabricacion", label: "Tiempos de fabricación" },
];

const sys = (
  id: string,
  label: string,
  action: EBotAction,
  examples: string[]
): TBotIntent => ({
  id,
  label,
  kind: EBotIntentKind.SYSTEM,
  action,
  examples,
  answer: null,
  enabled: true,
});

const faq = (
  id: string,
  label: string,
  examples: string[],
  answer: string
): TBotIntent => ({
  id,
  label,
  kind: EBotIntentKind.FAQ,
  action: null,
  examples,
  answer,
  enabled: true,
});

export const DEFAULT_BOT_INTENTS: TBotIntent[] = [
  sys("greeting", "Saludo", EBotAction.GREETING, [
    "hola",
    "buenas",
    "buen dia",
    "buenas tardes",
    "buenas noches",
    "hola como estas",
    "que tal",
  ]),
  sys("menu", "Menú", EBotAction.MENU, ["menu", "opciones", "ayuda", "volver al inicio"]),
  sys("catalog", "Ver catálogo", EBotAction.CATALOG, [
    "que banderas tienen",
    "ver banderas",
    "catalogo",
    "lista de precios",
    "que productos venden",
    "que tienen",
    "mostrame las banderas",
  ]),
  sys("price", "Consulta de precio", EBotAction.PRICE, [
    "cuanto sale",
    "cuanto cuesta",
    "precio",
    "que precio tiene",
    "cuanto vale",
    "me pasas precio",
    "valor de la bandera",
  ]),
  sys("order", "Quiero hacer un pedido", EBotAction.ORDER, [
    "quiero comprar",
    "quiero hacer un pedido",
    "quiero encargar",
    "necesito banderas",
    "hacer pedido",
    "comprar bandera",
  ]),
  sys("human", "Hablar con una persona", EBotAction.HUMAN, [
    "hablar con una persona",
    "quiero hablar con alguien",
    "atencion humana",
    "me atiende alguien",
    "hablar con un asesor",
    "vendedor",
  ]),
  sys("thanks", "Agradecimiento", EBotAction.THANKS, [
    "gracias",
    "muchas gracias",
    "genial gracias",
    "perfecto gracias",
    "listo gracias",
  ]),
  faq(
    "faq_horarios",
    "Horarios",
    ["horario", "a que hora abren", "hasta que hora atienden", "estan abiertos", "atienden los sabados"],
    "Atendemos {horarios} 🕘"
  ),
  faq(
    "faq_direccion",
    "Dirección",
    ["donde estan", "direccion", "donde queda el local", "ubicacion", "puedo pasar a retirar"],
    "Estamos en {direccion} 📍"
  ),
  faq(
    "faq_envios",
    "Envíos",
    ["hacen envios", "envian al interior", "costo de envio", "mandan a domicilio", "como me llega"],
    "{envios}"
  ),
  faq(
    "faq_pagos",
    "Formas de pago",
    ["formas de pago", "aceptan tarjeta", "se puede pagar con transferencia", "mercado pago", "como pago"],
    "Podés pagar con: {pagos} 💳"
  ),
  faq(
    "faq_fabricacion",
    "Tiempos de fabricación",
    ["cuanto tarda", "en cuanto tiempo esta", "demora", "tiempo de entrega", "para cuando lo tienen"],
    "{fabricacion}"
  ),
];

/** Reemplaza {variables} con los datos del negocio. */
export function fillTemplate(
  text: string,
  config: TBotConfig,
  extra: Record<string, string> = {}
): string {
  const b = config.business;
  const vars: Record<string, string> = {
    negocio: b.name || "Publimar",
    direccion: b.address || "(consultanos la dirección)",
    horarios: b.hours || "(consultanos los horarios)",
    envios: b.shipping || "Consultanos por envíos y te pasamos el detalle.",
    pagos: b.payments || "consultanos las formas de pago",
    fabricacion: b.productionTime || "Consultanos los tiempos según la cantidad y la medida.",
    ...extra,
  };
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** Combina la config guardada con los defaults (campos nuevos/faltantes). */
export function mergeBotConfig(raw: Partial<TBotConfig> | null | undefined): TBotConfig {
  const r = raw || {};
  return {
    ...DEFAULT_BOT_CONFIG,
    ...r,
    businessHours: { ...DEFAULT_BOT_CONFIG.businessHours, ...(r.businessHours || {}) },
    messages: { ...DEFAULT_BOT_CONFIG.messages, ...(r.messages || {}) },
    business: { ...DEFAULT_BOT_CONFIG.business, ...(r.business || {}) },
    productAliases: { ...(r.productAliases || {}) },
  };
}
