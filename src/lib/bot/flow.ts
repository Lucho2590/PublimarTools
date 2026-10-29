// Acciones del bot y máquina de estados del pedido. Todo determinístico: los
// botones/listas llevan un id ("prod:<id>", "qty:2", …) que se resuelve acá sin IA.

import { formatearPrecio } from "@/lib/utils";
import { createWhatsappOrder, lookupOrCreateClient } from "@/lib/whatsapp/db";
import {
  EBotAction,
  EBotIntentKind,
  EBotStep,
  TBotButton,
  TBotConfig,
  TBotIntent,
  TBotListRow,
  TBotReply,
  TBotSession,
} from "@/types/bot";
import {
  TBotCatalog,
  TBotProduct,
  TBotVariant,
  findProducts,
  findVariant,
  pickProduct,
  productsInCategory,
} from "./catalog";
import { fillTemplate } from "./defaults";
import { isDoneAdding, parseName, parseQuantity, parseSize, parseYesNo } from "./entities";

export type TFlowCtx = {
  config: TBotConfig;
  catalog: TBotCatalog;
  intents: TBotIntent[];
  session: TBotSession;
  replies: TBotReply[];
  /** false en el simulador salvo que se pida "guardar pedido real". */
  persistOrders: boolean;
  outOfHours: boolean;
  orderCreated: boolean;
};

const PAGE_SIZE = 9; // 9 filas + "Ver más" = límite de 10 de WhatsApp
const BASE_VARIANT = "_base";

// ---------------------------------------------------------------------------
// Helpers de respuesta
// ---------------------------------------------------------------------------

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function say(ctx: TFlowCtx, text: string) {
  ctx.replies.push({ type: "text", text });
}

function buttons(ctx: TFlowCtx, text: string, btns: TBotButton[]) {
  ctx.replies.push({
    type: "buttons",
    text,
    buttons: btns.slice(0, 3).map((b) => ({ id: b.id, title: clip(b.title, 20) })),
  });
}

function list(ctx: TFlowCtx, text: string, buttonLabel: string, rows: TBotListRow[]) {
  ctx.replies.push({
    type: "list",
    text,
    buttonLabel: clip(buttonLabel, 20),
    rows: rows.slice(0, 10).map((r) => ({
      id: r.id,
      title: clip(r.title, 24),
      ...(r.description ? { description: clip(r.description, 72) } : {}),
    })),
  });
}

function paginate(rows: TBotListRow[], page: number, moreId: (next: number) => string): TBotListRow[] {
  const start = page * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  if (rows.length > start + PAGE_SIZE) {
    slice.push({ id: moreId(page + 1), title: "Ver más ▸", description: `Página ${page + 2}` });
  }
  return slice;
}

const money = (n: number) => formatearPrecio(n);

function variantPrice(product: TBotProduct, variant: TBotVariant | null): number {
  return variant ? variant.price : product.price;
}

function resetOrder(session: TBotSession) {
  session.step = EBotStep.IDLE;
  session.cart = [];
  session.pendingProductId = null;
  session.pendingVariantId = null;
  session.candidateProductIds = [];
}

const MENU_BUTTONS: TBotButton[] = [
  { id: "menu:catalog", title: "Ver banderas" },
  { id: "menu:faq", title: "Preguntas frecuentes" },
  { id: "menu:human", title: "Hablar con alguien" },
];

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

export function showMenu(ctx: TFlowCtx, withWelcome: boolean) {
  const text = withWelcome
    ? fillTemplate(ctx.config.messages.welcome, ctx.config)
    : "¿En qué te ayudo?";
  buttons(ctx, text, MENU_BUTTONS);
}

export function showCatalog(ctx: TFlowCtx, page = 0, intro?: string) {
  const { catalog } = ctx;
  if (!catalog.products.length) {
    say(ctx, "Ahora no tengo el catálogo cargado 😕. Te paso con alguien del equipo.");
    handoff(ctx);
    return;
  }

  // Con 2+ categorías con productos: primero se elige categoría.
  const cats = catalog.categories
    .map((c) => ({ ...c, count: productsInCategory(catalog, c.id).length }))
    .filter((c) => c.count > 0);
  const uncategorized = productsInCategory(catalog, "_none").length;
  if (uncategorized) cats.push({ id: "_none", name: "Otros", count: uncategorized });

  if (cats.length >= 2) {
    const rows = cats.map((c) => ({
      id: `cat:${c.id}:0`,
      title: c.name,
      description: `${c.count} producto${c.count === 1 ? "" : "s"}`,
    }));
    list(
      ctx,
      intro || "¿Qué tipo de bandera buscás? También podés escribirme el nombre directamente.",
      "Ver categorías",
      paginate(rows, page, (n) => `catalog:${n}`)
    );
    return;
  }
  showProductList(ctx, catalog.products, page, (n) => `catalog:${n}`, intro);
}

function showProductList(
  ctx: TFlowCtx,
  products: TBotProduct[],
  page: number,
  moreId: (n: number) => string,
  intro?: string
) {
  const rows = products.map((p) => {
    const prices = p.variants.length ? p.variants.map((v) => v.price) : [p.price];
    const min = Math.min(...prices);
    return {
      id: `prod:${p.id}`,
      title: p.name,
      description: p.variants.length > 1 ? `Desde ${money(min)}` : money(min),
    };
  });
  ctx.session.step = EBotStep.CHOOSE_PRODUCT;
  ctx.session.candidateProductIds = products.map((p) => p.id);
  list(ctx, intro || "Elegí la bandera:", "Ver banderas", paginate(rows, page, moreId));
}

export function showProduct(ctx: TFlowCtx, product: TBotProduct, page = 0, intro?: string) {
  ctx.session.pendingProductId = product.id;
  ctx.session.pendingVariantId = null;

  if (!product.variants.length) {
    selectVariant(ctx, product, null);
    return;
  }
  if (product.variants.length === 1) {
    selectVariant(ctx, product, product.variants[0]);
    return;
  }
  ctx.session.step = EBotStep.CHOOSE_VARIANT;
  const rows = product.variants.map((v) => ({
    id: `var:${product.id}:${v.id}`,
    title: v.size || "Única",
    description: money(v.price),
  }));
  list(
    ctx,
    intro || `*${product.name}*: ¿qué medida querés?`,
    "Ver medidas",
    paginate(rows, page, (n) => `prodpage:${product.id}:${n}`)
  );
}

/** Variante elegida → muestra precio y pide cantidad. */
export function selectVariant(ctx: TFlowCtx, product: TBotProduct, variant: TBotVariant | null) {
  ctx.session.pendingProductId = product.id;
  ctx.session.pendingVariantId = variant ? variant.id : BASE_VARIANT;
  ctx.session.step = EBotStep.QUANTITY;
  const label = variant?.size ? `${product.name} ${variant.size}` : product.name;
  buttons(
    ctx,
    `*${label}*: ${money(variantPrice(product, variant))} c/u.\n¿Cuántas querés? Elegí o escribime la cantidad.`,
    [
      { id: "qty:1", title: "1" },
      { id: "qty:2", title: "2" },
      { id: "qty:5", title: "5" },
    ]
  );
}

/** Respuesta a "cuánto sale X (de AxB)": precio directo o lista de medidas. */
export function quotePrice(ctx: TFlowCtx, product: TBotProduct, sizeText: string | null) {
  if (sizeText && product.variants.length) {
    const variant = findVariant(product, sizeText);
    if (!variant) {
      showProduct(ctx, product, 0, `No tengo *${product.name}* en ${sizeText}. Estas son las medidas disponibles:`);
      return;
    }
    ctx.session.pendingProductId = product.id;
    ctx.session.pendingVariantId = variant.id;
    ctx.session.step = EBotStep.IDLE;
    buttons(ctx, `*${product.name} ${variant.size}*: ${money(variant.price)} c/u.`, [
      { id: `var:${product.id}:${variant.id}`, title: "Pedir esta" },
      { id: `prod:${product.id}`, title: "Otras medidas" },
      { id: "menu:catalog", title: "Ver otras banderas" },
    ]);
    return;
  }
  showProduct(ctx, product, 0, `*${product.name}*, precios por medida:`);
}

function addToCart(ctx: TFlowCtx, quantity: number) {
  const { session, catalog } = ctx;
  const product = session.pendingProductId ? catalog.byId.get(session.pendingProductId) : null;
  if (!product) {
    showCatalog(ctx, 0, "Se me perdió el producto 🙈, elegilo de nuevo:");
    return;
  }
  const variant =
    session.pendingVariantId && session.pendingVariantId !== BASE_VARIANT
      ? product.variants.find((v) => v.id === session.pendingVariantId) || null
      : null;

  const existing = session.cart.find(
    (i) => i.productId === product.id && i.variantId === (variant?.id ?? null)
  );
  if (existing) existing.quantity += quantity;
  else
    session.cart.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      productName: product.name,
      variantName: variant?.size || null,
      quantity,
      unitPrice: variantPrice(product, variant),
    });

  session.pendingProductId = null;
  session.pendingVariantId = null;
  session.step = EBotStep.MORE;
  buttons(ctx, `Agregué ${quantity} × ${product.name}${variant?.size ? ` ${variant.size}` : ""} 👍 ¿Algo más?`, [
    { id: "more:add", title: "Agregar otra" },
    { id: "more:done", title: "Terminar pedido" },
  ]);
}

function finishAdding(ctx: TFlowCtx) {
  if (!ctx.session.cart.length) {
    showCatalog(ctx, 0, "Todavía no agregaste nada. Elegí la bandera:");
    return;
  }
  if (!ctx.session.customerName) {
    ctx.session.step = EBotStep.NAME;
    say(ctx, "¿A nombre de quién hago el pedido?");
    return;
  }
  showSummary(ctx);
}

function cartTotal(session: TBotSession): number {
  return session.cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}

function showSummary(ctx: TFlowCtx) {
  const { session } = ctx;
  session.step = EBotStep.CONFIRM;
  const lines = session.cart.map(
    (i) =>
      `• ${i.quantity} × ${i.productName}${i.variantName ? ` ${i.variantName}` : ""}: ${money(i.unitPrice * i.quantity)}`
  );
  buttons(
    ctx,
    `Resumen del pedido a nombre de *${session.customerName}*:\n${lines.join("\n")}\n\n*Total: ${money(cartTotal(session))}*\n\n¿Lo confirmo?`,
    [
      { id: "confirm:yes", title: "Confirmar" },
      { id: "confirm:restart", title: "Empezar de nuevo" },
      { id: "confirm:cancel", title: "Cancelar" },
    ]
  );
}

async function confirmOrder(ctx: TFlowCtx) {
  const { session, config } = ctx;
  if (!session.cart.length) {
    showCatalog(ctx, 0, "No hay nada en el pedido todavía. Elegí la bandera:");
    return;
  }

  let numero: string;
  let total = cartTotal(session);
  if (ctx.persistOrders) {
    if (!session.phone) {
      say(ctx, "No tengo tu teléfono para registrar el pedido 😕. Te paso con alguien del equipo.");
      handoff(ctx);
      return;
    }
    const client = await lookupOrCreateClient({
      phone: session.phone,
      name: session.customerName || undefined,
    });
    // El total se recalcula en el servidor contra el catálogo (resolveItems).
    const order = await createWhatsappOrder({
      clientId: client.clientId,
      phone: session.phone,
      items: session.cart.map((i) => ({
        productId: i.productId,
        ...(i.variantId ? { variantId: i.variantId } : {}),
        quantity: i.quantity,
      })),
    });
    session.clientId = client.clientId;
    numero = order.orderNumber;
    total = order.total;
    ctx.orderCreated = true;
  } else {
    numero = "SIM-0000 (simulado, no se guardó)";
  }

  session.lastOrderNumber = numero;
  resetOrder(session);
  say(ctx, fillTemplate(config.messages.orderConfirmed, config, { numero, total: money(total) }));
}

export function handoff(ctx: TFlowCtx) {
  const { session, config } = ctx;
  session.status = "handoff";
  session.pausedUntil = new Date(Date.now() + (config.handoffPauseHours || 12) * 3600 * 1000);
  session.failCount = 0;
  say(
    ctx,
    fillTemplate(ctx.outOfHours ? config.messages.handoffOutOfHours : config.messages.handoff, config)
  );
}

export function answerFaq(ctx: TFlowCtx, intent: TBotIntent) {
  buttons(ctx, fillTemplate(intent.answer || "", ctx.config) || "Consultanos y te respondemos 🙌", [
    { id: "menu:catalog", title: "Ver banderas" },
    { id: "menu:human", title: "Hablar con alguien" },
  ]);
}

function showFaqList(ctx: TFlowCtx) {
  const faqs = ctx.intents.filter((i) => i.enabled && i.kind === EBotIntentKind.FAQ && i.answer);
  if (!faqs.length) {
    say(ctx, "Escribime tu pregunta y te respondo 🙂");
    return;
  }
  list(
    ctx,
    "¿Sobre qué tenés dudas?",
    "Ver preguntas",
    faqs.slice(0, 10).map((f) => ({ id: `faq:${f.id}`, title: f.label }))
  );
}

export function fallback(ctx: TFlowCtx) {
  ctx.session.failCount = (ctx.session.failCount || 0) + 1;
  if (ctx.session.failCount >= 2) {
    handoff(ctx);
    return;
  }
  buttons(ctx, fillTemplate(ctx.config.messages.fallback, ctx.config), MENU_BUTTONS);
}

/**
 * Ejecuta una acción del sistema con lo que se extrajo del mensaje (por reglas
 * o por la IA). `productText` se busca en el catálogo real.
 */
export function runAction(
  ctx: TFlowCtx,
  action: EBotAction,
  extracted: { productText?: string | null; size?: string | null; quantity?: number | null }
) {
  const matches = extracted.productText
    ? findProducts(ctx.catalog, extracted.productText, ctx.config.productAliases)
    : [];
  const { product, candidates } = pickProduct(matches);

  switch (action) {
    case EBotAction.GREETING:
      showMenu(ctx, true);
      return;
    case EBotAction.MENU:
      showMenu(ctx, false);
      return;
    case EBotAction.THANKS:
      buttons(ctx, "¡De nada! 🙌 ¿Te ayudo con algo más?", MENU_BUTTONS);
      return;
    case EBotAction.HUMAN:
      handoff(ctx);
      return;
    case EBotAction.CATALOG:
      showCatalog(ctx);
      return;
    case EBotAction.PRICE:
    case EBotAction.ORDER: {
      if (candidates.length) {
        showProductList(ctx, candidates, 0, () => "catalog:0", "Tengo varias opciones, ¿cuál es?");
        return;
      }
      if (!product) {
        showCatalog(
          ctx,
          0,
          action === EBotAction.ORDER ? "¡Genial! ¿Qué bandera querés?" : "¿De qué bandera querés el precio?"
        );
        return;
      }
      const sizeText = extracted.size ?? null;
      const variant = sizeText ? findVariant(product, sizeText) : null;
      // Pedido con todo resuelto ("quiero 3 argentinas de 90x150") → directo al carrito.
      if (
        action === EBotAction.ORDER &&
        extracted.quantity &&
        (variant || !product.variants.length)
      ) {
        ctx.session.pendingProductId = product.id;
        ctx.session.pendingVariantId = variant ? variant.id : BASE_VARIANT;
        addToCart(ctx, extracted.quantity);
        return;
      }
      if (action === EBotAction.ORDER && (variant || !product.variants.length)) {
        selectVariant(ctx, product, variant);
        return;
      }
      quotePrice(ctx, product, sizeText);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Capa 1: respuestas de botones/listas
// ---------------------------------------------------------------------------

export async function handleReplyId(ctx: TFlowCtx, replyId: string): Promise<boolean> {
  const [kind, a, b] = replyId.split(":");
  const { catalog, session } = ctx;

  switch (kind) {
    case "menu":
      if (a === "catalog") showCatalog(ctx);
      else if (a === "faq") showFaqList(ctx);
      else if (a === "human") handoff(ctx);
      else showMenu(ctx, false);
      return true;
    case "catalog":
      showCatalog(ctx, Number(a) || 0);
      return true;
    case "cat": {
      const cat = catalog.categories.find((c) => c.id === a);
      showProductList(
        ctx,
        productsInCategory(catalog, a),
        Number(b) || 0,
        (n) => `cat:${a}:${n}`,
        cat ? `*${cat.name}*: elegí la bandera` : undefined
      );
      return true;
    }
    case "prod": {
      const product = catalog.byId.get(a);
      if (!product) return false;
      showProduct(ctx, product);
      return true;
    }
    case "prodpage": {
      const product = catalog.byId.get(a);
      if (!product) return false;
      showProduct(ctx, product, Number(b) || 0);
      return true;
    }
    case "var": {
      const product = catalog.byId.get(a);
      if (!product) return false;
      const variant = b === BASE_VARIANT ? null : product.variants.find((v) => v.id === b) || null;
      selectVariant(ctx, product, variant);
      return true;
    }
    case "qty": {
      const q = Number(a);
      if (!q || session.step !== EBotStep.QUANTITY) return false;
      addToCart(ctx, q);
      return true;
    }
    case "more":
      if (a === "done") finishAdding(ctx);
      else showCatalog(ctx, 0, "Dale, ¿qué más agregamos?");
      return true;
    case "confirm":
      if (a === "yes") await confirmOrder(ctx);
      else if (a === "restart") {
        resetOrder(session);
        showCatalog(ctx, 0, "Listo, arrancamos de nuevo. Elegí la bandera:");
      } else {
        resetOrder(session);
        buttons(ctx, "Listo, cancelé el pedido. ¿Te ayudo con algo más?", MENU_BUTTONS);
      }
      return true;
    case "faq": {
      const intent = ctx.intents.find((i) => i.id === a);
      if (!intent) return false;
      answerFaq(ctx, intent);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Capa 2: texto libre interpretado según el paso esperado
// ---------------------------------------------------------------------------

/**
 * `looksLikeIntent` = el matcher encontró una intención clara: en los pasos de
 * texto libre (nombre) no se toma la pregunta como si fuera el dato pedido.
 */
export async function handleStep(
  ctx: TFlowCtx,
  text: string,
  looksLikeIntent: boolean
): Promise<boolean> {
  const { session, catalog } = ctx;

  switch (session.step) {
    case EBotStep.QUANTITY: {
      if (parseSize(text)) return false; // menciona otra medida → que lo vea la capa de reglas
      const q = parseQuantity(text);
      if (!q) return false;
      addToCart(ctx, q);
      return true;
    }
    case EBotStep.CHOOSE_VARIANT: {
      const product = session.pendingProductId ? catalog.byId.get(session.pendingProductId) : null;
      if (!product) return false;
      const variant = findVariant(product, text);
      if (!variant) return false;
      const q = parseQuantity(text);
      if (q) {
        session.pendingVariantId = variant.id;
        addToCart(ctx, q);
      } else selectVariant(ctx, product, variant);
      return true;
    }
    case EBotStep.MORE: {
      if (isDoneAdding(text) || parseYesNo(text) === false) {
        finishAdding(ctx);
        return true;
      }
      if (parseYesNo(text) === true) {
        showCatalog(ctx, 0, "Dale, ¿qué más agregamos?");
        return true;
      }
      return false;
    }
    case EBotStep.NAME: {
      if (looksLikeIntent) return false;
      const name = parseName(text);
      if (!name) return false;
      session.customerName = name;
      showSummary(ctx);
      return true;
    }
    case EBotStep.CONFIRM: {
      const yn = parseYesNo(text);
      if (yn === true) await confirmOrder(ctx);
      else if (yn === false) {
        resetOrder(session);
        buttons(ctx, "Listo, cancelé el pedido. ¿Te ayudo con algo más?", MENU_BUTTONS);
      } else return false;
      return true;
    }
  }
  return false;
}
