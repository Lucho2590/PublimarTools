// Valores iniciales del bot. Puro (sin Firestore): lo usan tanto el motor del
// servidor como el panel del cliente para "cargar intenciones iniciales".

import {
  EBotAction,
  EBotIntentKind,
  TBotCatalogGroup,
  TBotConfig,
  TBotCustomTechnique,
  TBotCustomerSegment,
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
    intro: "Soy el agente digital de *{negocio}* 🤖",
    welcome:
      "Contame qué bandera buscás (ej: _argentina 90x150_, _personalizada con logo_) o preguntame por envíos, pagos u horarios.",
    fallback:
      "Perdón, no te entendí 😅 Probá con algo como _\"bandera argentina 90x150\"_, o escribí _hablar con alguien_ y te paso con el equipo.",
    handoff: "¡Dale! Le aviso a alguien del equipo y te escribe en un ratito 🙌",
    handoffOutOfHours:
      "¡Dale! Le paso tu consulta al equipo. Ahora estamos cerrados ({horarios}), te escriben apenas abramos 🙌",
    orderConfirmed:
      "¡Listo! Pedido *{numero}* anotado 🎉 Total: *{total}*. En breve te escribimos para coordinar el pago y la entrega.",
    unsupportedMedia:
      "Por ahora solo leo texto 🙈 Escribime qué necesitás o pedime hablar con alguien.",
  },
  business: {
    name: "Banderas Publimar",
    address: "",
    hours: "lunes a viernes de 9 a 18",
    shipping: "",
    payments: "",
    productionTime: "",
    extra: "",
    localCity: "Mar del Plata",
    localDelivery:
      "En {ciudad} no hacemos envíos nosotros: trabajamos con un mensajero. Pedinos su contacto y lo coordinás directo con él 🛵",
  },
  productAliases: {},
  productTypes: [],
  customerSegments: [],
  catalogGroups: [],
  customTechniques: [],
  askDelivery: true,
  useButtons: false,
};

/**
 * Técnicas sugeridas de bandera personalizada (plazos y mínimos PROVISORIOS:
 * se ajustan en Entrenamiento). La sublimada se vincula sola al producto cuyo
 * nombre contiene "personalizada" y "sublimada".
 */
export const DEFAULT_CUSTOM_TECHNIQUES: TBotCustomTechnique[] = [
  {
    id: "sublimada",
    label: "Sublimada",
    description: "Impresión full color, ideal para logos y fotos",
    minDays: 3,
    maxDays: 5,
    minQty: 1,
    productId: null,
    enabled: true,
  },
  {
    id: "estampada",
    label: "Estampada / serigrafía",
    description: "Conviene por cantidad, colores plenos",
    minDays: 10,
    maxDays: 15,
    minQty: 10,
    productId: null,
    enabled: true,
  },
  {
    id: "bordada",
    label: "Bordada",
    description: "Terminación premium, para ceremonia",
    minDays: 20,
    maxDays: 25,
    minQty: 1,
    productId: null,
    enabled: true,
  },
];

/** Técnicas vigentes: las de la config o, si no hay, las sugeridas. */
export function resolveTechniques(config: TBotConfig): TBotCustomTechnique[] {
  return (config.customTechniques?.length ? config.customTechniques : DEFAULT_CUSTOM_TECHNIQUES).filter(
    (t) => t.enabled
  );
}

/**
 * Grupos sugeridos del menú del catálogo, por nombre de categoría. El último
 * ("Otras") se queda con todo lo que no entró en los anteriores.
 */
export const SUGGESTED_CATALOG_GROUPS: { id: string; label: string; categoryNames: string[]; rest?: boolean }[] = [
  { id: "argentinas", label: "Argentinas", categoryNames: ["argentinas", "bonaerenses", "malvinas"] },
  { id: "extranjeras", label: "Extranjeras", categoryNames: ["extranjeras"] },
  { id: "personalizadas", label: "Personalizadas", categoryNames: ["personalizadas"] },
  { id: "otras", label: "Otras", categoryNames: [], rest: true },
];

/** Tipos de cliente iniciales (se editan en Entrenamiento). */
export const DEFAULT_CUSTOMER_SEGMENTS: TBotCustomerSegment[] = [
  {
    id: "escuela",
    label: "Escuela / institución",
    keywords: [
      "escuela", "colegio", "jardin de infantes", "jardin maternal", "instituto", "institucion", "abanderado", "abanderada",
      "docente", "directora", "director", "alumnos", "cooperadora", "club", "parroquia",
      "iglesia", "universidad", "facultad", "acto escolar",
    ],
  },
  {
    id: "municipio",
    label: "Municipio / organismo",
    keywords: [
      "municipalidad", "municipio", "muni", "delegacion", "secretaria", "ministerio",
      "gobierno", "organismo", "concejo", "policia", "comisaria", "bomberos", "hospital",
      "licitacion", "dependencia", "reparticion",
    ],
  },
  {
    id: "revendedor",
    label: "Revendedor / mayorista",
    keywords: [
      "revendedor", "reventa", "revender", "revendo", "mayorista", "por mayor", "al por mayor",
      "comercio", "negocio", "kiosco", "libreria", "cotillon", "bazar", "distribuidor",
      "para vender",
    ],
  },
  {
    id: "particular",
    label: "Particular / empresa",
    keywords: [
      "para mi", "para mi casa", "mi casa", "regalo", "personal", "particular", "empresa",
      "oficina", "fabrica", "familia", "cumpleanos", "hincha",
    ],
  },
];

/** Color de cada etiqueta de tipo de cliente (los nuevos van en gris). */
export const SEGMENT_STYLES: Record<string, string> = {
  escuela: "bg-blue-100 text-blue-800",
  municipio: "bg-purple-100 text-purple-800",
  revendedor: "bg-amber-100 text-amber-800",
  particular: "bg-green-100 text-green-800",
};
export const segmentStyle = (id: string) => SEGMENT_STYLES[id] || "bg-slate-100 text-slate-700";

/** Tipos de cliente vigentes: los de la config o, si no hay, los iniciales. */
export function resolveSegments(config: TBotConfig): TBotCustomerSegment[] {
  return config.customerSegments?.length ? config.customerSegments : DEFAULT_CUSTOMER_SEGMENTS;
}

/**
 * Tipos sugeridos: si la config no define `productTypes`, se usan las
 * categorías del catálogo cuyo nombre coincide con estos.
 */
export const SUGGESTED_PRODUCT_TYPES: {
  categoryName: string;
  label: string;
  description: string;
  keywords: string[];
}[] = [
  {
    categoryName: "flameo",
    label: "Flameo",
    description: "Para mástil o exterior",
    keywords: ["flameo", "mastil", "exterior", "afuera", "balcon", "colgar", "flamear"],
  },
  {
    categoryName: "ceremonia",
    label: "Ceremonia",
    description: "Para actos y abanderados",
    keywords: ["ceremonia", "acto", "abanderado", "desfile", "bordada"],
  },
  {
    categoryName: "escritorio",
    label: "Escritorio",
    description: "Chiquitas, de mesa",
    keywords: ["escritorio", "mesa", "chiquita", "mini"],
  },
];

/** Variables disponibles en respuestas de FAQ y mensajes fijos. */
export const BOT_TEMPLATE_VARS: { key: string; label: string }[] = [
  { key: "negocio", label: "Nombre del negocio" },
  { key: "direccion", label: "Dirección" },
  { key: "horarios", label: "Horarios" },
  { key: "envios", label: "Envíos" },
  { key: "pagos", label: "Formas de pago" },
  { key: "fabricacion", label: "Tiempos de fabricación" },
  { key: "ciudad", label: "Ciudad del local" },
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
    "hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches",
    "hola como estas", "hola como andas", "que tal", "holis", "hola buen dia",
    "hola buenas tardes", "buenas como va", "hola que tal",
  ]),
  sys("menu", "Menú", EBotAction.MENU, [
    "menu", "opciones", "ayuda", "volver al inicio", "inicio", "empezar", "volver",
  ]),
  sys("catalog", "Ver catálogo", EBotAction.CATALOG, [
    "que banderas tienen", "ver banderas", "catalogo", "lista de precios", "que productos venden",
    "que tienen", "mostrame las banderas", "me pasas el catalogo", "que modelos hay",
    "que venden", "tenes catalogo", "me mandas la lista", "quiero ver las banderas",
  ]),
  sys("price", "Consulta de precio", EBotAction.PRICE, [
    "cuanto sale", "cuanto cuesta", "precio", "que precio tiene", "cuanto vale",
    "me pasas precio", "valor de la bandera", "queria saber el precio", "a cuanto esta",
    "me podes pasar precio", "quisiera saber precios", "precio por favor", "que valor tiene",
    "consulta de precio", "queria consultar precio", "cuanto me sale",
  ]),
  sys("order", "Quiero hacer un pedido", EBotAction.ORDER, [
    "quiero comprar", "quiero hacer un pedido", "quiero encargar", "necesito banderas",
    "hacer pedido", "comprar bandera", "quisiera encargar", "queria hacer un pedido",
    "les quiero comprar", "me anotas", "quiero pedir", "necesito encargar", "me separas",
  ]),
  sys("custom", "Bandera personalizada", EBotAction.CUSTOM, [
    "personalizada", "bandera personalizada", "con mi logo", "con mi diseño", "con logo",
    "quiero hacer una bandera", "hacer una bandera", "con el escudo del club", "con nombre",
    "con mi marca", "con el logo de mi empresa", "bandera a medida", "bandera con foto",
    "diseño propio", "banderas personalizadas",
  ]),
  sys("human", "Hablar con una persona", EBotAction.HUMAN, [
    "hablar con una persona", "quiero hablar con alguien", "atencion humana",
    "me atiende alguien", "hablar con un asesor", "vendedor", "pasame con alguien",
    "hay alguien", "necesito hablar con alguien", "me llamas", "quiero que me llamen",
    "hablar con un humano", "atencion al cliente", "reclamo",
  ]),
  sys("thanks", "Agradecimiento", EBotAction.THANKS, [
    "gracias", "muchas gracias", "genial gracias", "perfecto gracias", "listo gracias",
    "mil gracias", "gracias por todo", "buenisimo gracias", "joya gracias", "chau", "hasta luego",
  ]),
  faq(
    "faq_horarios",
    "Horarios",
    [
      "horario", "a que hora abren", "hasta que hora atienden", "estan abiertos",
      "atienden los sabados", "que horarios tienen", "abren hoy", "a que hora cierran",
      "horario de atencion",
    ],
    "Atendemos {horarios} 🕘"
  ),
  faq(
    "faq_direccion",
    "Dirección",
    [
      "donde estan", "direccion", "donde queda el local", "ubicacion", "puedo pasar a retirar",
      "donde los encuentro", "tienen local", "donde quedan", "me pasas la direccion",
      "donde se encuentran", "donde estan ubicados", "donde queda", "como llego",
    ],
    "Estamos en {direccion} 📍"
  ),
  faq(
    "faq_envios",
    "Envíos",
    [
      "hacen envios", "envian al interior", "costo de envio", "mandan a domicilio",
      "como me llega", "envian a todo el pais", "hacen envio", "cuanto sale el envio",
      "me lo pueden mandar", "mandan por correo",
    ],
    "{envios}"
  ),
  faq(
    "faq_pagos",
    "Formas de pago",
    [
      "formas de pago", "aceptan tarjeta", "se puede pagar con transferencia", "mercado pago",
      "como pago", "medios de pago", "aceptan efectivo", "puedo pagar en cuotas", "tienen cuotas",
      "como lo puedo pagar", "como se paga", "como abono", "donde pago",
    ],
    "Podés pagar con: {pagos} 💳"
  ),
  faq(
    "faq_fabricacion",
    "Tiempos de fabricación",
    [
      "cuanto tarda", "en cuanto tiempo esta", "demora", "tiempo de entrega",
      "para cuando lo tienen", "cuando estaria", "tienen stock", "lo tienen para hoy",
      "cuantos dias tarda",
    ],
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
    ciudad: b.localCity || "la ciudad",
    ...extra,
  };
  return (
    text
      .replace(/\{(\w+)\}/g, (m, k, offset: number, whole: string) => {
        if (!(k in vars)) return m;
        const v = vars[k];
        // En medio de una frase ("Atendemos {horarios}") va en minúscula: "de lunes…".
        // Se respeta si es sigla o nombre propio de varias mayúsculas ("MDP").
        const before = whole.slice(0, offset).trimEnd();
        const midSentence = before.length > 0 && !/[.!?:\n]$/.test(before);
        return midSentence && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(v) && !["negocio", "ciudad", "direccion"].includes(k)
          ? v.charAt(0).toLowerCase() + v.slice(1)
          : v;
      })
      // "{Realizamos envíos…}": llaves alrededor de una frase (no una variable) → se sacan.
      .replace(/\{([^{}]*\s[^{}]*)\}/g, "$1")
  );
}

const BUSINESS_VAR: Record<string, keyof TBotConfig["business"]> = {
  negocio: "name",
  direccion: "address",
  horarios: "hours",
  envios: "shipping",
  pagos: "payments",
  fabricacion: "productionTime",
};

/** ¿La respuesta usa algún dato del negocio que todavía no está cargado? */
export function hasMissingBusinessData(text: string, config: TBotConfig): boolean {
  const used = Array.from(text.matchAll(/\{(\w+)\}/g)).map((m) => m[1]);
  return used.some((k) => k in BUSINESS_VAR && !config.business[BUSINESS_VAR[k]]?.trim());
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
    productTypes: Array.isArray(r.productTypes) ? r.productTypes : [],
    customerSegments: Array.isArray(r.customerSegments) ? r.customerSegments : [],
    catalogGroups: Array.isArray(r.catalogGroups) ? r.catalogGroups : [],
    customTechniques: Array.isArray(r.customTechniques) ? r.customTechniques : [],
    askDelivery: r.askDelivery ?? DEFAULT_BOT_CONFIG.askDelivery,
    useButtons: r.useButtons ?? DEFAULT_BOT_CONFIG.useButtons,
  };
}
