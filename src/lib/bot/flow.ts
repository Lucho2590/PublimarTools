// Acciones del bot y máquina de estados del pedido. Todo determinístico: los
// botones/listas llevan un id ("prod:<id>", "qty:2", …) que se resuelve acá sin IA.
// Tono: cordial y rioplatense, sin formalidades.

import { formatearPrecio } from "@/lib/utils";
import {
  createCustomQuoteRequest,
  createWhatsappOrder,
  lookupOrCreateClient,
} from "@/lib/whatsapp/db";
import {
  EBotAction,
  EBotIntentKind,
  EBotStep,
  TBotButton,
  TBotConfig,
  TBotCustomRequest,
  TBotCustomTechnique,
  TBotDelivery,
  TBotIntent,
  TBotListRow,
  TBotReply,
  TBotSession,
} from "@/types/bot";
import {
  TBotCatalog,
  TBotProduct,
  TBotVariant,
  TFamily,
  detectType,
  findFamily,
  findVariant,
  productsInCategory,
  resolveGroups,
  resolveTypes,
  shortName,
} from "./catalog";
import {
  fillTemplate,
  hasMissingBusinessData,
  resolveSegments,
  resolveTechniques,
} from "./defaults";
import {
  businessDaysUntil,
  formatNeededBy,
  isDoneAdding,
  parseName,
  parseNeededBy,
  parseQuantity,
  parseSize,
  parseYesNo,
} from "./entities";
import { normalizeText, tokenize } from "./normalize";
import { detectSegment } from "./segments";

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
  /** Escrituras en segundo plano (registrar consulta): el motor las espera antes de responder. */
  pending: Promise<unknown>[];
};

const PAGE_SIZE = 9; // 9 filas + "Ver más" = límite de 10 de WhatsApp
const BASE_VARIANT = "_base";
const OTHER_TYPE = "_other";

// ---------------------------------------------------------------------------
// Helpers de respuesta
// ---------------------------------------------------------------------------

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function say(ctx: TFlowCtx, text: string) {
  ctx.replies.push({ type: "text", text });
}

/**
 * Botones de respuesta rápida. Sin botones (config): solo el texto; la
 * pregunta ya dice qué contestar y el cliente escribe libre.
 */
function buttons(ctx: TFlowCtx, text: string, btns: TBotButton[]) {
  ctx.session.lastOptions = [];
  if (!ctx.config.useButtons) {
    say(ctx, text);
    return;
  }
  ctx.replies.push({
    type: "buttons",
    text,
    buttons: btns.slice(0, 3).map((b) => ({ id: b.id, title: clip(b.title, 20) })),
  });
}

/**
 * Lista de opciones. Sin botones (config): texto numerado y se recuerdan los
 * ids para que "2" o "la 2" elijan esa opción (además de escribirla).
 */
function list(ctx: TFlowCtx, text: string, buttonLabel: string, rows: TBotListRow[]) {
  const shown = rows.slice(0, 10);
  ctx.session.lastOptions = shown.map((r) => r.id);
  if (!ctx.config.useButtons) {
    const lines = shown.map(
      (r, i) => `${i + 1}. ${r.title}${r.description ? ` — ${r.description}` : ""}`
    );
    say(ctx, `${text}\n\n${lines.join("\n")}\n\n_Escribime el número o lo que buscás._`);
    return;
  }
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
    slice.push({ id: moreId(page + 1), title: "Ver más", description: `más opciones` });
  }
  return slice;
}

const money = (n: number) => formatearPrecio(n);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function variantPrice(product: TBotProduct, variant: TBotVariant | null): number {
  return variant ? variant.price : product.price;
}

function minPrice(product: TBotProduct): number {
  const prices = product.variants.length ? product.variants.map((v) => v.price) : [product.price];
  return Math.min(...prices);
}

function resetOrder(session: TBotSession) {
  session.step = EBotStep.IDLE;
  session.cart = [];
  session.pendingProductId = null;
  session.pendingVariantId = null;
  session.pendingQuantity = null;
  session.candidateProductIds = [];
  session.familyLabel = null;
  session.familyProductIds = [];
  session.delivery = null;
  session.custom = null;
  // segmentId y customerName se conservan: son datos del cliente, no del pedido.
}

const MENU_BUTTONS: TBotButton[] = [
  { id: "menu:catalog", title: "Ver banderas" },
  { id: "menu:faq", title: "Preguntas frecuentes" },
  { id: "menu:human", title: "Hablar con alguien" },
];

// ---------------------------------------------------------------------------
// Menú y catálogo
// ---------------------------------------------------------------------------

export function showMenu(ctx: TFlowCtx, withWelcome: boolean) {
  const text = withWelcome
    ? fillTemplate(ctx.config.messages.welcome, ctx.config)
    : ctx.config.useButtons
      ? "¿En qué te ayudo? 🙂"
      : "¿En qué te ayudo? 🙂 Contame qué bandera buscás o preguntame por envíos, pagos u horarios.";
  buttons(ctx, text, MENU_BUTTONS);
}

export function showCatalog(ctx: TFlowCtx, page = 0, intro?: string) {
  const { catalog } = ctx;
  if (!catalog.products.length) {
    say(ctx, "Uy, justo ahora no tengo el catálogo a mano 😕 Le aviso a alguien del equipo.");
    handoff(ctx, false, "Sin catálogo disponible");
    return;
  }

  // Pocas opciones: Argentinas / Extranjeras / Personalizadas / Otras.
  const groups = resolveGroups(catalog, ctx.config);
  if (groups.length >= 2) {
    list(
      ctx,
      intro || "¿Qué bandera buscás? Elegí o escribime el nombre (ej: _argentina_, _italia_, _boca_) 👇",
      "Ver banderas",
      groups.map((g) => ({
        id: `grp:${g.id}:0`,
        title: g.label,
        description: plural(g.products.length, "producto", "productos"),
      }))
    );
    return;
  }

  // Sin grupos: categorías del catálogo.
  const cats = catalog.categories
    .map((c) => ({ ...c, count: productsInCategory(catalog, c.id).length }))
    .filter((c) => c.count > 0);
  if (cats.length >= 2) {
    const rows = cats.map((c) => ({
      id: `cat:${c.id}:0`,
      title: c.name,
      description: plural(c.count, "producto", "productos"),
    }));
    list(
      ctx,
      intro || "Elegí una categoría o escribime el nombre (ej: _argentina_, _boca_, _italia_) 👇",
      "Ver categorías",
      paginate(rows, page, (n) => `catalog:${n}`)
    );
    return;
  }
  showProductList(ctx, catalog.products, 0, intro);
}

/** Grupo del menú nombrado en un mensaje corto ("extranjeras", "las otras"). */
export function matchGroupByText(ctx: TFlowCtx, text: string): string | null {
  const tokens = tokenize(text);
  if (!tokens.length || tokens.length > 3) return null;
  const g = resolveGroups(ctx.catalog, ctx.config).find((x) =>
    tokenize(x.label).some((t) => tokens.includes(t))
  );
  return g ? g.id : null;
}

/** Un grupo del menú: si es grande, primero las más pedidas e invita a escribir. */
export function showGroup(ctx: TFlowCtx, groupId: string, page: number) {
  const group = resolveGroups(ctx.catalog, ctx.config).find((g) => g.id === groupId);
  if (!group) {
    showCatalog(ctx);
    return;
  }
  if (group.products.every((p) => isCustomProduct(ctx, p))) {
    startCustom(ctx);
    return;
  }
  if (group.products.length === 1) {
    showProduct(ctx, group.products[0]);
    return;
  }
  const big = group.products.length > PAGE_SIZE;
  const products = big
    ? group.products.slice().sort((a, b) => b.salesCount - a.salesCount || a.name.localeCompare(b.name, "es"))
    : group.products;
  showProductList(
    ctx,
    products,
    page,
    big
      ? `*${group.label}*: escribime cuál buscás (ej: _${shortName(products[0]).split(" ")[0].toLowerCase()}_) o elegí de las más pedidas 👇`
      : `*${group.label}* 👇`
  );
}

/**
 * Lista de productos para elegir. Los candidatos quedan en la sesión, así se
 * pagina con "cand:<n>" y el cliente puede responder escribiendo el nombre.
 */
function showProductList(ctx: TFlowCtx, products: TBotProduct[], page: number, intro?: string) {
  const rows = products.map((p) => ({
    id: `prod:${p.id}`,
    title: shortName(p),
    description:
      p.variants.length > 1
        ? `${plural(p.variants.length, "medida", "medidas")} · desde ${money(minPrice(p))}`
        : money(minPrice(p)),
  }));
  ctx.session.step = EBotStep.CHOOSE_PRODUCT;
  ctx.session.candidateProductIds = products.map((p) => p.id);
  list(ctx, intro || "Elegí la que te interesa 👇", "Ver opciones", paginate(rows, page, (n) => `cand:${n}`));
}

// ---------------------------------------------------------------------------
// Producto puntual: medidas, precio, cantidad
// ---------------------------------------------------------------------------

export function showProduct(ctx: TFlowCtx, product: TBotProduct, page = 0, intro?: string) {
  // Personalizada sin técnica elegida: primero fecha y cantidad.
  if (isCustomProduct(ctx, product) && !ctx.session.custom?.techniqueId) {
    startCustom(ctx);
    return;
  }
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
    intro || `*${product.name}*: ¿qué medida necesitás? 👇`,
    "Ver medidas",
    paginate(rows, page, (n) => `prodpage:${product.id}:${n}`)
  );
}

/** Variante elegida → muestra precio y pide cantidad. */
export function selectVariant(ctx: TFlowCtx, product: TBotProduct, variant: TBotVariant | null) {
  ctx.session.pendingProductId = product.id;
  ctx.session.pendingVariantId = variant ? variant.id : BASE_VARIANT;
  // Ya había dicho cuántas ("necesito 10 argentinas"): no se vuelve a preguntar.
  if (ctx.session.pendingQuantity) {
    addToCart(ctx, ctx.session.pendingQuantity);
    return;
  }
  ctx.session.step = EBotStep.QUANTITY;
  const label = variant?.size ? `${product.name} ${variant.size}` : product.name;
  buttons(
    ctx,
    `*${label}*: ${money(variantPrice(product, variant))} c/u 👌\n¿Cuántas te preparo?`,
    [
      { id: "qty:1", title: "1" },
      { id: "qty:2", title: "2" },
      { id: "qty:5", title: "5" },
    ]
  );
}

/** "Cuánto sale X (de AxB)": precio directo o lista de medidas. */
export function quotePrice(ctx: TFlowCtx, product: TBotProduct, sizeText: string | null) {
  if (sizeText && product.variants.length) {
    const variant = findVariant(product, sizeText);
    if (!variant) {
      showProduct(
        ctx,
        product,
        0,
        `En ${sizeText} no tengo *${product.name}* 🤔 Estas son las medidas que hay:`
      );
      return;
    }
    // Queda esperando cantidad: "sí", "dale" o "2" siguen el pedido.
    ctx.session.pendingProductId = product.id;
    ctx.session.pendingVariantId = variant.id;
    ctx.session.step = EBotStep.QUANTITY;
    buttons(ctx, `*${product.name} ${variant.size}*: ${money(variant.price)} c/u 👌 ¿Te la anoto?`, [
      { id: `var:${product.id}:${variant.id}`, title: "Sí, anotala" },
      { id: `prod:${product.id}`, title: "Ver otras medidas" },
      { id: "menu:catalog", title: "Ver otras banderas" },
    ]);
    return;
  }
  showProduct(ctx, product);
}

type TAsk = {
  action: EBotAction.PRICE | EBotAction.ORDER;
  /** Medida AxB normalizada ("90x150") o texto de la medida. */
  size: string | null;
  /** Mensaje original (para medidas con nombre: "jardín", "grande"). */
  rawText: string | null;
  quantity: number | null;
};

/** Un único producto: según lo que ya dijo, precio, medidas o directo al carrito. */
function presentSingle(ctx: TFlowCtx, product: TBotProduct, ask: TAsk) {
  const variant = ask.size
    ? findVariant(product, ask.size)
    : ask.rawText
      ? findVariant(product, ask.rawText)
      : null;
  const resolved = variant || !product.variants.length;

  if (ask.action === EBotAction.ORDER && resolved) {
    ctx.session.pendingProductId = product.id;
    ctx.session.pendingVariantId = variant ? variant.id : BASE_VARIANT;
    if (ask.quantity) addToCart(ctx, ask.quantity);
    else selectVariant(ctx, product, variant);
    return;
  }
  quotePrice(ctx, product, variant ? variant.size : ask.size);
}

/**
 * Lo que pidió el cliente puede ser varios productos ("argentina" = flameo,
 * ceremonia, escritorio, cintas…). Antes de elegir por él: filtra por medida,
 * y si quedan varios tipos, pregunta cuál.
 */
function presentFamily(ctx: TFlowCtx, family: TFamily, ask: TAsk) {
  const { session } = ctx;
  let products = family.products;
  if (products.every((p) => isCustomProduct(ctx, p)) && !session.custom?.techniqueId) {
    startCustom(ctx, ask.rawText);
    return;
  }
  session.familyLabel = family.label;
  session.familyProductIds = products.map((p) => p.id);

  if (products.length === 1) {
    presentSingle(ctx, products[0], ask);
    return;
  }

  // "banderas de flameo" (solo el tipo): son demasiadas, que diga de qué.
  if (family.generic && products.length > PAGE_SIZE) {
    session.familyLabel = null;
    showCatalog(
      ctx,
      0,
      `¡Dale! ¿De qué país, provincia o equipo? Escribime el nombre o elegí una categoría 👇`
    );
    return;
  }

  // Filtro por medida: "argentina 90x150" → solo las que vienen en esa medida.
  let intro: string | undefined;
  const sizeProbe = ask.size || ask.rawText;
  if (sizeProbe) {
    const withSize = products
      .map((p) => ({ p, v: findVariant(p, sizeProbe) }))
      .filter((x): x is { p: TBotProduct; v: TBotVariant } => !!x.v);
    if (withSize.length === 1) {
      presentSingle(ctx, withSize[0].p, { ...ask, size: withSize[0].v.size });
      return;
    }
    if (withSize.length > 1) {
      session.step = EBotStep.CHOOSE_PRODUCT;
      session.candidateProductIds = withSize.map((x) => x.p.id);
      list(
        ctx,
        ask.size
          ? `*${family.label}* en *${withSize[0].v.size}*, tengo estas 👇`
          : `*${family.label}*, tengo estas 👇`,
        "Ver opciones",
        withSize.slice(0, 10).map((x) => ({
          id: `var:${x.p.id}:${x.v.id}`,
          title: shortName(x.p),
          description: `${x.v.size} · ${money(x.v.price)}`,
        }))
      );
      return;
    }
    if (ask.size) intro = `En ${ask.size} no tengo *${family.label}* 🤔`;
  }

  // Varios tipos (flameo / ceremonia / escritorio…) → preguntar cuál.
  if (!family.type && askType(ctx, products, family.label, intro)) return;
  // Un solo tipo con varios modelos → la medida primero.
  if (!intro && askSize(ctx, products, family.label)) return;

  showProductList(
    ctx,
    products,
    0,
    `${intro ? `${intro} ` : ""}Opciones de *${family.label}* 👇`
  );
}

/** Pregunta el tipo si los productos se reparten en 2+ tipos. */
function askType(ctx: TFlowCtx, products: TBotProduct[], label: string, intro?: string): boolean {
  const types = resolveTypes(ctx.catalog, ctx.config);
  const groups = types
    .map((t) => ({ t, n: products.filter((p) => p.categoryIds.includes(t.categoryId)).length }))
    .filter((g) => g.n > 0);
  const typed = new Set(types.map((t) => t.categoryId));
  const others = products.filter((p) => !p.categoryIds.some((id) => typed.has(id)));
  const options = groups.length + (others.length ? 1 : 0);
  if (groups.length === 0 || options < 2) return false;

  ctx.session.step = EBotStep.CHOOSE_TYPE;
  ctx.session.candidateProductIds = products.map((p) => p.id);
  const head = `${intro ? `${intro} ` : ""}¿Qué tipo de *${label}* buscás?`;
  const othersDesc = others
    .slice(0, 3)
    .map((p) => shortName(p))
    .join(", ");

  // Pocas opciones: botones con viñetas. En modo texto, lista numerada ("1" elige).
  if (options <= 3 && ctx.config.useButtons) {
    const lines = groups.map((g) => `• *${g.t.label}*: ${g.t.description.toLowerCase()}`);
    if (others.length) lines.push(`• *Otros*: ${othersDesc}${others.length > 3 ? "…" : ""}`);
    buttons(ctx, `${head}\n${lines.join("\n")}`, [
      ...groups.map((g) => ({ id: `type:${g.t.categoryId}`, title: g.t.label })),
      ...(others.length ? [{ id: `type:${OTHER_TYPE}`, title: "Otros" }] : []),
    ]);
    return true;
  }
  list(ctx, head, "Ver tipos", [
    ...groups.map((g) => ({
      id: `type:${g.t.categoryId}`,
      title: g.t.label,
      description: `${g.t.description} · ${plural(g.n, "opción", "opciones")}`,
    })),
    ...(others.length
      ? [{ id: `type:${OTHER_TYPE}`, title: "Otros", description: othersDesc }]
      : []),
  ]);
  return true;
}

/**
 * Varios modelos del mismo tipo ("argentina de flameo" = 7): antes de listar
 * modelos, pregunta la medida aproximada. Devuelve false si no aplica (los
 * modelos no comparten medidas, o son demasiadas).
 */
function askSize(ctx: TFlowCtx, products: TBotProduct[], label: string, page = 0): boolean {
  const groups = new Map<string, { size: string; min: number; n: number }>();
  for (const p of products) {
    const seen = new Set<string>();
    for (const v of p.variants) {
      const key = v.sizeKey || normalizeText(v.size);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const g = groups.get(key);
      if (g) {
        g.min = Math.min(g.min, v.price);
        g.n += 1;
      } else groups.set(key, { size: v.size, min: v.price, n: 1 });
    }
  }
  const shared = Array.from(groups.values()).some((g) => g.n >= 2);
  if (!shared || groups.size < 2 || groups.size > 40) return false;

  ctx.session.step = EBotStep.CHOOSE_SIZE;
  ctx.session.candidateProductIds = products.map((p) => p.id);
  ctx.session.familyLabel = ctx.session.familyLabel || label;
  const rows = Array.from(groups.entries())
    .sort((a, b) => sizeArea(a[0]) - sizeArea(b[0]))
    .map(([key, g]) => ({
      id: `size:${key}`,
      title: g.size,
      description: `${g.n > 1 ? `${g.n} modelos · desde` : ""} ${money(g.min)}`.trim(),
    }));
  list(
    ctx,
    page ? "Más medidas 👇" : `*${label}*: ¿qué medida necesitás más o menos? También podés escribirla (ej: _90x150_) 👇`,
    "Ver medidas",
    paginate(rows, page, (n) => `sizes:${n}`)
  );
  return true;
}

/** Para ordenar medidas de chica a grande ("90x150" → 13500; con nombre al final). */
function sizeArea(key: string): number {
  const m = key.match(/^(\d+)x(\d+)$/);
  return m ? Number(m[1]) * Number(m[2]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Medida elegida (id de la lista o texto: "90x150", "jardín"): modelos de los
 * candidatos que vienen en esa medida. false si ninguno la tiene.
 */
function chooseSize(ctx: TFlowCtx, keyOrText: string, fromList = false): boolean {
  const { session, catalog } = ctx;
  const products = session.candidateProductIds
    .map((id) => catalog.byId.get(id))
    .filter(Boolean) as TBotProduct[];
  const matches = products
    .map((p) => ({
      p,
      v: fromList
        ? p.variants.find((v) => (v.sizeKey || normalizeText(v.size)) === keyOrText) || null
        : findVariant(p, keyOrText),
    }))
    .filter((x): x is { p: TBotProduct; v: TBotVariant } => !!x.v);

  if (!matches.length) return false;
  if (matches.length === 1) {
    quotePrice(ctx, matches[0].p, matches[0].v.size);
    return true;
  }
  session.step = EBotStep.CHOOSE_PRODUCT;
  session.candidateProductIds = matches.map((x) => x.p.id);
  const sameSize = matches.every((x) => x.v.size === matches[0].v.size);
  list(
    ctx,
    `En *${sameSize ? matches[0].v.size : keyOrText}* tengo estos modelos 👇`,
    "Ver modelos",
    matches.slice(0, 10).map((x) => ({
      id: `var:${x.p.id}:${x.v.id}`,
      title: shortName(x.p),
      description: sameSize ? money(x.v.price) : `${x.v.size} · ${money(x.v.price)}`,
    }))
  );
  return true;
}

/** El cliente eligió el tipo: filtra los candidatos de la sesión. */
function chooseType(ctx: TFlowCtx, typeId: string) {
  const { session, catalog } = ctx;
  // La familia completa, no los candidatos de la última lista: así un botón de
  // tipo de un mensaje anterior sigue funcionando ("Otros" y después "Flameo").
  const ids = session.familyProductIds?.length ? session.familyProductIds : session.candidateProductIds;
  const candidates = ids.map((id) => catalog.byId.get(id)).filter(Boolean) as TBotProduct[];
  const types = resolveTypes(catalog, ctx.config);
  const typed = new Set(types.map((t) => t.categoryId));
  const type = types.find((t) => t.categoryId === typeId);
  const products =
    typeId === OTHER_TYPE
      ? candidates.filter((p) => !p.categoryIds.some((id) => typed.has(id)))
      : candidates.filter((p) => p.categoryIds.includes(typeId));

  if (!products.length) {
    showCatalog(ctx, 0, "Perdón, me perdí 🙈 ¿Qué bandera buscabas?");
    return;
  }
  if (products.length === 1) {
    showProduct(ctx, products[0]);
    return;
  }
  const typeName = type ? type.label.toLowerCase() : "otros";
  const sizeLabel = session.familyLabel ? `${session.familyLabel} (${typeName})` : type?.label || "Otros";
  if (type && askSize(ctx, products, sizeLabel)) return;
  showProductList(
    ctx,
    products,
    0,
    session.familyLabel
      ? `Opciones de *${session.familyLabel}* (${typeName}) 👇`
      : `Opciones de ${typeName} 👇`
  );
}

/** Texto libre eligiendo entre los candidatos ("la reforzada"). */
function pickAmongCandidates(ctx: TFlowCtx, text: string): TBotProduct | null {
  const tokens = new Set(tokenize(text));
  const candidates = ctx.session.candidateProductIds
    .map((id) => ctx.catalog.byId.get(id))
    .filter(Boolean) as TBotProduct[];
  const scored = candidates
    // Nombre completo (incluye "bandera"): "la bandera" vs "banda"/"moño".
    .map((p) => ({ p, n: tokenize(p.name).filter((t) => tokens.has(t)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (!scored.length) return null;
  // Debe distinguir: si todos empatan (repitió "argentina"), no sirve.
  if (scored.length > 1 && scored[0].n === scored[1].n) return null;
  if (scored.length === candidates.length && scored.every((x) => x.n === scored[0].n)) return null;
  return scored[0].p;
}

// ---------------------------------------------------------------------------
// Carrito y confirmación
// ---------------------------------------------------------------------------

function addToCart(ctx: TFlowCtx, quantity: number) {
  const { session, catalog } = ctx;
  const product = session.pendingProductId ? catalog.byId.get(session.pendingProductId) : null;
  if (!product) {
    showCatalog(ctx, 0, "Perdón, me perdí 🙈 ¿Qué bandera era?");
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
  session.pendingQuantity = null;
  session.familyLabel = null;
  session.step = EBotStep.MORE;
  buttons(
    ctx,
    `Anotado: ${quantity} × *${product.name}${variant?.size ? ` ${variant.size}` : ""}* a ${money(variantPrice(product, variant))} c/u${quantity > 1 ? ` (${money(variantPrice(product, variant) * quantity)})` : ""} 👍 ¿Sumás algo más?`,
    [
      { id: "more:add", title: "Sumar otra" },
      { id: "more:done", title: "No, eso es todo" },
    ]
  );
}

function finishAdding(ctx: TFlowCtx) {
  if (!ctx.session.cart.length) {
    showCatalog(ctx, 0, "Todavía no anotamos nada 🙂 ¿Qué bandera querés?");
    return;
  }
  nextCheckoutStep(ctx);
}

/** Datos que faltan antes del resumen, en orden: nombre → tipo de cliente → entrega. */
function nextCheckoutStep(ctx: TFlowCtx) {
  const { session, config } = ctx;
  if (!session.customerName) {
    session.step = EBotStep.NAME;
    say(ctx, "¿A nombre de quién lo anoto? 😊");
    return;
  }
  if (!session.segmentId) {
    askSegment(ctx);
    return;
  }
  if (config.askDelivery && !session.delivery) {
    session.step = EBotStep.DELIVERY;
    buttons(ctx, "¿Lo retirás por el local o te lo enviamos?", [
      { id: "dlv:pickup", title: "Lo retiro" },
      { id: "dlv:shipping", title: "Envío" },
    ]);
    return;
  }
  showSummary(ctx);
}

function askSegment(ctx: TFlowCtx) {
  ctx.session.step = EBotStep.SEGMENT;
  const segments = resolveSegments(ctx.config);
  const rows = segments.map((sg) => ({ id: `seg:${sg.id}`, title: sg.label }));
  if (rows.length <= 3 && ctx.config.useButtons) {
    buttons(ctx, "¿Para quién es el pedido? Así te atendemos mejor 🙂", rows);
    return;
  }
  list(ctx, "¿Para quién es el pedido? Así te atendemos mejor 🙂", "Elegir", [
    ...rows,
    { id: "seg:_skip", title: "Prefiero no decir" },
  ]);
}

function setSegment(ctx: TFlowCtx, segmentId: string | null) {
  ctx.session.segmentId = segmentId && segmentId !== "_skip" ? segmentId : "_skip";
  nextCheckoutStep(ctx);
}

function setDelivery(ctx: TFlowCtx, method: "pickup" | "shipping") {
  const { session } = ctx;
  if (method === "pickup") {
    session.delivery = { method, place: null };
    nextCheckoutStep(ctx);
    return;
  }
  session.step = EBotStep.DELIVERY_PLACE;
  say(ctx, "¡Dale! ¿A qué localidad y dirección te lo mandamos?");
}

/** "Av. Colón 1234, Mar del Plata" / "Mar del Plata (dirección a confirmar)". */
/** ¿La localidad es la ciudad del local? ("mdp", "mardel" cuentan como Mar del Plata). */
function isLocalCity(ctx: TFlowCtx, text: string): boolean {
  const city = normalizeText(ctx.config.business.localCity || "");
  if (!city) return false;
  const t = ` ${normalizeText(text)} `;
  if (t.includes(` ${city} `)) return true;
  return city === "mar del plata" && /\b(mdp|mardel|mar del plata|mardelplata)\b/.test(t);
}

/** Envío pedido dentro de la ciudad del local → mensajero (no se pide dirección). */
function setCourier(ctx: TFlowCtx) {
  const city = ctx.config.business.localCity || "";
  ctx.session.delivery = { method: "courier", place: city || null, address: null };
  say(
    ctx,
    fillTemplate(ctx.config.business.localDelivery || DEFAULT_LOCAL_DELIVERY, ctx.config)
  );
  nextCheckoutStep(ctx);
}

const DEFAULT_LOCAL_DELIVERY =
  "En {ciudad} no hacemos envíos nosotros: trabajamos con un mensajero. Pedinos su contacto y lo coordinás directo con él 🛵";

function deliveryText(d: TBotDelivery): string {
  const where = [d.address, d.place].filter(Boolean).join(", ");
  if (!where) return "a confirmar";
  return d.address ? where : `${where} (dirección a confirmar)`;
}

/** "mar del plata" → "Mar del Plata" (sin tocar "de", "del", "la"). */
function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((w, i) =>
      i > 0 && /^(de|del|la|las|los|y|e)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}

function parseDelivery(text: string): "pickup" | "shipping" | null {
  const t = normalizeText(text);
  if (/\b(retir|paso a buscar|lo busco|voy a buscar|local|lo paso)/.test(t)) return "pickup";
  if (/\b(envi|mand|domicilio|correo|a mi casa)/.test(t)) return "shipping";
  return null;
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
  const firstName = (session.customerName || "").split(" ")[0];
  const delivery = session.delivery
    ? session.delivery.method === "pickup"
      ? "\nEntrega: retiro en el local"
      : session.delivery.method === "courier"
        ? `\nEntrega: por mensajero en ${session.delivery.place || "la ciudad"} (lo coordinás con él)`
        : `\nEntrega: envío a ${deliveryText(session.delivery)}`
    : "";
  buttons(
    ctx,
    `Perfecto${firstName ? `, ${firstName}` : ""} 🙌 Tu pedido:\n${lines.join("\n")}\n*Total: ${money(cartTotal(session))}*${delivery}\n\n¿Lo confirmamos?`,
    [
      { id: "confirm:yes", title: "Sí, confirmar" },
      { id: "confirm:restart", title: "Empezar de nuevo" },
      { id: "confirm:cancel", title: "Cancelar" },
    ]
  );
}

async function confirmOrder(ctx: TFlowCtx) {
  const { session, config } = ctx;
  if (!session.cart.length) {
    showCatalog(ctx, 0, "Todavía no anotamos nada 🙂 ¿Qué bandera querés?");
    return;
  }

  let numero: string;
  let total = cartTotal(session);
  if (ctx.persistOrders) {
    if (!session.phone) {
      say(ctx, "Uy, no tengo tu teléfono para anotar el pedido 😕 Le aviso a alguien del equipo.");
      handoff(ctx, false, "Pedido sin teléfono");
      return;
    }
    const client = await lookupOrCreateClient({
      phone: session.phone,
      name: session.customerName || undefined,
    });
    // El total se recalcula en el servidor contra el catálogo (resolveItems).
    const segment = session.segmentId && session.segmentId !== "_skip" ? session.segmentId : null;
    const order = await createWhatsappOrder({
      clientId: client.clientId,
      phone: session.phone,
      items: session.cart.map((i) => ({
        productId: i.productId,
        ...(i.variantId ? { variantId: i.variantId } : {}),
        quantity: i.quantity,
      })),
      customerSegment: segment,
      delivery: session.delivery,
      customerName: session.customerName,
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

const CANCELLED_TEXT = "Listo, lo cancelé 🙂 ¿Te ayudo con otra cosa?";

// ---------------------------------------------------------------------------
// Bandera personalizada: para cuándo → cuántas → medida → ¿tenés logo? →
// precio → si le parece bien, pasa al equipo para ver el diseño.
// ---------------------------------------------------------------------------

const emptyCustom = (): TBotCustomRequest => ({
  neededBy: null,
  days: null,
  whenText: null,
  quantity: null,
  quantityText: null,
  size: null,
  hasLogo: null,
  techniqueId: null,
  tight: false,
  unitPrice: null,
  priceSize: null,
});

/** Producto de la técnica (configurado o, para sublimada, el "personalizada … sublimada"). */
function techniqueProduct(ctx: TFlowCtx, t: TBotCustomTechnique): TBotProduct | null {
  if (t.productId) return ctx.catalog.byId.get(t.productId) || null;
  if (t.id !== "sublimada") return null;
  return (
    ctx.catalog.products.find((p) => {
      const n = normalizeText(p.name);
      return n.includes("personalizada") && n.includes("sublimada");
    }) || null
  );
}

/** Producto "personalizado": de la categoría Personalizadas o vinculado a una técnica. */
function isCustomProduct(ctx: TFlowCtx, product: TBotProduct): boolean {
  if (product.categoryNames.some((n) => normalizeText(n) === "personalizadas")) return true;
  return resolveTechniques(ctx.config).some((t) => techniqueProduct(ctx, t)?.id === product.id);
}

/** Cantidad sin confundir números de fechas ("20/11", "15 de noviembre", "en 10 días"). */
function customQuantity(text: string): number | null {
  const clean = String(text)
    .replace(/\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?/g, " ")
    .replace(/\b\d{1,2} de [a-záéíóúñ]+/gi, " ")
    .replace(/\ben \d+ (dias|días|semanas?|mes(es)?)\b/gi, " ")
    .replace(/\b(para el|el dia|el día|el) \d{1,2}\b/gi, " ");
  return parseQuantity(clean);
}

/**
 * Arranca (o retoma) la personalizada. Si el mensaje ya trae datos ("la
 * necesito el viernes, 1 sola, de 90x150") se usan y no se vuelven a preguntar.
 */
export function startCustom(ctx: TFlowCtx, text?: string | null) {
  const { session } = ctx;
  if (!session.custom) session.custom = emptyCustom();
  // Esperando que acepte el precio: se lo vuelve a mostrar en vez de reiniciar.
  if (session.custom.techniqueId && session.step === EBotStep.CUSTOM_PRICE) {
    chooseTechnique(ctx, session.custom.techniqueId);
    return;
  }
  // Personalizada nueva (la anterior ya se cerró): arranca de cero.
  if (session.custom.techniqueId) session.custom = emptyCustom();
  const c = session.custom;

  // Lo que ya dijo en el mismo mensaje se anota y se le repite ("Anoté: …").
  const noted: string[] = [];
  if (text) {
    const when = parseNeededBy(text);
    if (when && !c.whenText) {
      c.neededBy = when.date;
      c.days = when.days;
      c.whenText = when.date ? formatNeededBy(when.date) : "sin apuro";
      noted.push(when.date ? `para el *${c.whenText}*` : "*sin apuro*");
    }
    // "hacer una bandera" no dice cuántas: solo se toma si viene con número.
    const q = customQuantity(text);
    if (q && !c.quantity && (q > 1 || /\b1\b/.test(text))) {
      c.quantity = q;
      c.quantityText = String(q);
      noted.push(quantityLabel(c));
    }
    const size = parseSize(text);
    if (size && !c.size) {
      c.size = size;
      noted.push(displaySize(size));
    }
    const logo = parseHasLogo(text);
    if (logo != null && c.hasLogo == null) c.hasLogo = logo;
  }
  if (!c.whenText) {
    session.step = EBotStep.CUSTOM_DATE;
    const head = noted.length ? `¡Dale! Anoté: ${noted.join(", ")} 👌` : "¡Buenísimo, una personalizada! 🙌";
    buttons(ctx, `${head} ¿Para cuándo la necesitás? 📅`, [
      { id: "cdate:week", title: "Esta semana" },
      { id: "cdate:3w", title: "En 2-3 semanas" },
      { id: "cdate:none", title: "Sin apuro" },
    ]);
    return;
  }
  nextCustomStep(ctx, noted.length ? `¡Dale! Anoté: ${noted.join(", ")} 👌` : undefined);
}

/** `prefix`: confirmación de lo ya anotado, va delante de la próxima pregunta. */
function nextCustomStep(ctx: TFlowCtx, prefix?: string) {
  const { session } = ctx;
  const c = session.custom!;
  const lead = (q: string) => (prefix ? `${prefix} ${q}` : q);

  // Con la fecha ya alcanza para saber si NADA llega (ni la técnica más rápida
  // en la medida más chica): se avisa ya, sin preguntar medida ni logo.
  const days = availableBusinessDays(ctx);
  const fastest = Math.min(
    ...resolveTechniques(ctx.config).map((t) =>
      Math.min(t.minDays, ...(t.sizeRules || []).map((r) => r.minDays))
    )
  );
  if (days != null && Number.isFinite(fastest) && days < fastest) {
    const when = c.neededBy ? `para el *${formatNeededBy(c.neededBy)}*` : "para esa fecha";
    say(
      ctx,
      lead(
        `${when.charAt(0).toUpperCase()}${when.slice(1)} viene muy justo 😕 (${days === 0 ? "no quedan días hábiles" : days === 1 ? "queda 1 día hábil" : `quedan ${days} días hábiles`} y lo más rápido sale en ${fastest} días hábiles). Le paso tu consulta al equipo para ver si llegamos.`
      )
    );
    handoff(ctx, true, "Personalizada: no llega a la fecha");
    return;
  }
  if (!c.quantity) {
    session.step = EBotStep.CUSTOM_QTY;
    buttons(ctx, lead("¿Cuántas necesitás?"), [
      { id: "cqty:1", title: "1" },
      { id: "cqty:2-9", title: "Entre 2 y 9" },
      { id: "cqty:10+", title: "10 o más" },
    ]);
    return;
  }
  if (!c.size) {
    session.step = EBotStep.CUSTOM_SIZE;
    const ref = resolveTechniques(ctx.config)
      .map((t) => techniqueProduct(ctx, t))
      .find((p): p is TBotProduct => !!p && p.variants.length > 0);
    if (ref) {
      list(ctx, lead("¿Qué medida más o menos? 📏"), "Ver medidas", [
        ...ref.variants.slice(0, 9).map((v) => ({ id: `csize:${v.size}`, title: v.size })),
        { id: "csize:_other", title: "Otra medida", description: "La escribís vos" },
      ]);
    } else {
      say(ctx, lead("¿Qué medida más o menos? 📏 (ej: _90x150_)"));
    }
    return;
  }
  if (c.hasLogo == null) {
    session.step = EBotStep.CUSTOM_LOGO;
    buttons(ctx, lead("¿Ya tenés el logo o diseño que va en la bandera? 🎨"), [
      { id: "clogo:yes", title: "Sí, lo tengo" },
      { id: "clogo:no", title: "No, necesito diseño" },
    ]);
    return;
  }
  if (prefix) say(ctx, prefix);
  offerTechniques(ctx);
}

/** "sí, tengo el logo" → true; "no tengo diseño" / "necesito que lo diseñen" → false. */
function parseHasLogo(text: string): boolean | null {
  const t = normalizeText(text);
  if (/\b(no tengo|no lo tengo|sin logo|sin diseno|necesito (diseno|que lo disen)|me lo disenan|lo disenan ustedes|hay que disenarlo)\b/.test(t)) {
    return false;
  }
  if (/\b(tengo el logo|tengo logo|tengo el diseno|tengo diseno|ya lo tengo|lo tengo|con mi logo|mi logo|mi diseno)\b/.test(t)) {
    return true;
  }
  return null;
}

/** "1 unidad", "30 unidades", "entre 2 y 9 unidades". */
function quantityLabel(c: TBotCustomRequest): string {
  if (c.quantityText && !/^\d+$/.test(c.quantityText)) return `${c.quantityText} unidades`;
  return plural(c.quantity || 1, "unidad", "unidades");
}

/** Días hábiles disponibles hasta la fecha pedida (null = sin apuro). */
function availableBusinessDays(ctx: TFlowCtx): number | null {
  const c = ctx.session.custom!;
  if (c.neededBy) {
    const days = ctx.config.businessHours?.days?.length ? ctx.config.businessHours.days : [1, 2, 3, 4, 5];
    return businessDaysUntil(c.neededBy, days);
  }
  // Botones sin fecha exacta ("esta semana"): días corridos → hábiles aprox.
  return c.days == null ? null : Math.floor((c.days * 5) / 7);
}

/** "90x140" (cm) → "90x1,40", como se escriben en el catálogo; texto libre queda igual. */
function displaySize(size: string | null): string {
  const m = size?.match(/^(\d+)x(\d+)$/);
  if (!m) return size || "";
  const fmt = (cm: number) =>
    cm < 100 ? String(cm) : (cm / 100).toFixed(2).replace(/\.00$/, "").replace(".", ",");
  return `${fmt(Number(m[1]))}x${fmt(Number(m[2]))}`;
}

/** Área en cm² de una medida ("90x150" → 13500), o null si no es AxB. */
function sizeAreaOf(size: string | null): number | null {
  const key = size ? parseSize(size) : null;
  const m = key?.match(/^(\d+)x(\d+)$/);
  return m ? Number(m[1]) * Number(m[2]) : null;
}

/**
 * Plazo (días hábiles, de/a) de una técnica para la medida pedida: la primera
 * regla "hasta X" que la cubre; si no hay o la medida no se entiende, el general.
 */
export function leadTimeFor(t: TBotCustomTechnique, size: string | null): { min: number; max: number } {
  const area = sizeAreaOf(size);
  if (area != null && t.sizeRules?.length) {
    const rules = t.sizeRules
      .map((r) => ({ ...r, area: sizeAreaOf(r.upTo) }))
      .filter((r): r is typeof r & { area: number } => r.area != null)
      .sort((a, b) => a.area - b.area);
    const rule = rules.find((r) => area <= r.area);
    if (rule) return { min: rule.minDays, max: Math.max(rule.minDays, rule.maxDays) };
  }
  return { min: t.minDays, max: Math.max(t.minDays, t.maxDays ?? t.minDays) };
}

function leadTimeLabel(lt: { min: number; max: number }): string {
  return lt.min === lt.max ? `${lt.min} días hábiles` : `${lt.min} a ${lt.max} días hábiles`;
}

/**
 * Técnicas que llegan a la fecha (días hábiles ≥ mínimo del plazo) y aplican a
 * la cantidad. `tight` = llega solo si sale en el plazo corto (< máximo).
 */
function viableTechniques(ctx: TFlowCtx): { t: TBotCustomTechnique; tight: boolean; lt: { min: number; max: number } }[] {
  const c = ctx.session.custom!;
  const days = availableBusinessDays(ctx);
  return resolveTechniques(ctx.config)
    .map((t) => ({ t, lt: leadTimeFor(t, c.size) }))
    .filter(({ t, lt }) => (days == null || lt.min <= days) && (c.quantity == null || c.quantity >= t.minQty))
    .map(({ t, lt }) => ({ t, lt, tight: days != null && days < lt.max }));
}

/**
 * Variante para cotizar la medida pedida: la exacta, o la más chica que la
 * cubre (si pide 1x1,30 se cotiza la de 90x1,40… la siguiente que alcanza).
 */
function priceVariant(product: TBotProduct, size: string | null): TBotVariant | null {
  if (!product.variants.length) return null;
  if (size) {
    const exact = findVariant(product, size);
    if (exact) return exact;
    const area = sizeAreaOf(size);
    if (area != null) {
      const bigger = product.variants
        .map((v) => ({ v, area: sizeAreaOf(v.size) }))
        .filter((x): x is { v: TBotVariant; area: number } => x.area != null && x.area >= area)
        .sort((a, b) => a.area - b.area);
      if (bigger.length) return bigger[0].v;
    }
  }
  return null;
}

function offerTechniques(ctx: TFlowCtx) {
  const { session } = ctx;
  const c = session.custom!;
  const viable = viableTechniques(ctx);
  const when = c.neededBy ? `para el *${formatNeededBy(c.neededBy)}*` : "sin apuro";
  const qty = quantityLabel(c);

  if (!viable.length) {
    const days = availableBusinessDays(ctx);
    say(
      ctx,
      `Para *${qty}* ${when} viene muy justo 😕 (${days === 0 ? "no quedan días hábiles" : days === 1 ? "queda 1 día hábil" : `quedan ${days} días hábiles`}). Le paso tu consulta al equipo para ver si llegamos.`
    );
    handoff(ctx, true, "Personalizada: no llega a la fecha");
    return;
  }
  // Una sola opción: directo al precio.
  if (viable.length === 1) {
    chooseTechnique(ctx, viable[0].t.id);
    return;
  }
  session.step = EBotStep.CUSTOM_TECHNIQUE;
  const rows = viable.map(({ t, lt, tight }) => {
    const product = techniqueProduct(ctx, t);
    const v = product ? priceVariant(product, c.size) : null;
    const price = product ? (v ? `${money(v.price)} c/u` : `desde ${money(minPrice(product))}`) : "a cotizar con tu diseño";
    return {
      id: `ctech:${t.id}`,
      title: t.label,
      description: `${leadTimeLabel(lt)}${tight ? " ⚠️ justo" : ""} · ${price}`,
    };
  });
  const anyTight = viable.some((v) => v.tight);
  list(
    ctx,
    `Para *${qty}* (${displaySize(c.size)}) ${when} te puedo ofrecer 👇${anyTight ? "\n_⚠️ justo = llega solo si sale en el plazo más corto; te lo confirma el equipo._" : ""}`,
    "Ver opciones",
    rows
  );
}

/**
 * Técnica elegida. Con precio en el catálogo → muestra el precio y pregunta si
 * le parece bien. Sin precio (estampada, bordada…) → se cotiza con el diseño:
 * se anota y pasa al equipo.
 */
function chooseTechnique(ctx: TFlowCtx, techniqueId: string) {
  const { session } = ctx;
  const c = session.custom!;
  const viable = viableTechniques(ctx);
  const option = viable.find((v) => v.t.id === techniqueId);
  if (!option) {
    offerTechniques(ctx);
    return;
  }
  const { t, lt, tight } = option;
  c.techniqueId = t.id;
  c.tight = tight;
  const product = techniqueProduct(ctx, t);
  const v = product ? priceVariant(product, c.size) : null;
  const unit = v ? v.price : product && !product.variants.length ? product.price : null;

  if (!product || unit == null) {
    say(
      ctx,
      `La *${t.label.toLowerCase()}* se cotiza según tu diseño 🙌 Te paso con alguien del equipo para pasarte el precio.`
    );
    ctx.pending.push(registerCustom(ctx, t));
    handoff(ctx, true, "Personalizada a cotizar con el diseño");
    return;
  }

  c.unitPrice = unit;
  c.priceSize = v?.size || null;
  session.step = EBotStep.CUSTOM_PRICE;
  const exactQty = c.quantityText && /^\d+$/.test(c.quantityText) ? c.quantity : null;
  const sizeNote =
    v && c.size && parseSize(v.size) !== parseSize(c.size)
      ? ` (la medida más cercana a ${displaySize(c.size)})`
      : "";
  const lines = [
    `*Bandera ${t.label.toLowerCase()} ${v?.size || ""}*${sizeNote}`.trim(),
    exactQty && exactQty > 1
      ? `${exactQty} × ${money(unit)} = *${money(unit * exactQty)}*`
      : exactQty === 1
        ? `*${money(unit)}*`
        : `*${money(unit)} c/u* (el total depende de la cantidad final)`,
    `Plazo: ${leadTimeLabel(lt)}${tight ? " ⚠️ viene justo, lo confirma el equipo" : ""}`,
  ];
  buttons(
    ctx,
    `${lines.join("\n")}\n\nSi querés avanzar, escribime _dale_ y te paso con alguien del equipo para ver el diseño 🙌`,
    [
      { id: "cprice:yes", title: "Dale, avancemos" },
      { id: "cprice:other", title: "Ver otra opción" },
      { id: "menu:human", title: "Hablar con alguien" },
    ]
  );
}

/** Deja la consulta registrada en WhatsApp > Pedidos (solo canal real o "guardar pedido real"). */
async function registerCustom(ctx: TFlowCtx, t: TBotCustomTechnique): Promise<string | null> {
  const { session } = ctx;
  const c = session.custom!;
  if (!ctx.persistOrders) return null;
  if (!session.phone) return null;
  const client = await lookupOrCreateClient({
    phone: session.phone,
    name: session.customerName || undefined,
  });
  const segment = session.segmentId && session.segmentId !== "_skip" ? session.segmentId : null;
  const exactQty = c.quantityText && /^\d+$/.test(c.quantityText) ? c.quantity : null;
  const req = await createCustomQuoteRequest({
    clientId: client.clientId,
    phone: session.phone,
    customerName: session.customerName,
    customerSegment: segment,
    details: {
      technique: t.label,
      quantity: c.quantity,
      size: c.size ? displaySize(c.size) : null,
      neededBy: c.neededBy,
      whenText: c.whenText,
      design: c.hasLogo == null ? null : c.hasLogo ? "tiene logo/diseño" : "necesita diseño",
      leadTime: leadTimeLabel(leadTimeFor(t, c.size)),
      tight: c.tight,
      unitPrice: c.unitPrice,
      estimatedTotal: c.unitPrice != null && exactQty ? c.unitPrice * exactQty : null,
    },
  });
  session.clientId = client.clientId;
  session.lastOrderNumber = req.orderNumber;
  ctx.orderCreated = true;
  return req.orderNumber;
}

/** Aceptó el precio → se anota y pasa al equipo para ver el diseño. */
async function acceptCustomPrice(ctx: TFlowCtx) {
  const { session } = ctx;
  const c = session.custom;
  const t = c && resolveTechniques(ctx.config).find((x) => x.id === c.techniqueId);
  if (!c || !t) {
    startCustom(ctx);
    return;
  }
  const numero = await registerCustom(ctx, t);
  say(
    ctx,
    `¡Genial! 🙌${numero ? ` Anoté tu consulta *${numero}*.` : ""} Te paso con alguien del equipo para ${c.hasLogo === false ? "armar el diseño con vos" : "ver el diseño"} y coordinar el pedido.`
  );
  handoff(ctx, true, "Personalizada: aceptó el precio, ver diseño");
  resetOrder(session);
}

async function handleCustomReply(ctx: TFlowCtx, kind: string, value: string): Promise<boolean> {
  const { session } = ctx;
  if (!session.custom) session.custom = emptyCustom();
  const c = session.custom;
  switch (kind) {
    case "cdate": {
      const days = value === "week" ? 5 : value === "3w" ? 18 : null;
      const when = days == null ? null : parseNeededBy(`en ${days} dias`);
      c.neededBy = when?.date ?? null;
      c.days = days;
      c.whenText = value === "week" ? "esta semana" : value === "3w" ? "en 2-3 semanas" : "sin apuro";
      nextCustomStep(ctx);
      return true;
    }
    case "cqty": {
      if (value === "2-9") {
        c.quantity = 2;
        c.quantityText = "entre 2 y 9";
      } else if (value === "10+") {
        c.quantity = 10;
        c.quantityText = "10 o más";
      } else {
        c.quantity = Number(value) || 1;
        c.quantityText = String(c.quantity);
      }
      nextCustomStep(ctx);
      return true;
    }
    case "csize":
      if (value === "_other") {
        session.step = EBotStep.CUSTOM_SIZE;
        say(ctx, "Escribime la medida aproximada (ej: _1x1,5_ o _90x150_) 📏");
        return true;
      }
      c.size = value;
      nextCustomStep(ctx);
      return true;
    case "clogo":
      c.hasLogo = value === "yes";
      nextCustomStep(ctx);
      return true;
    case "ctech":
      chooseTechnique(ctx, value);
      return true;
    case "cprice":
      if (value === "yes") {
        await acceptCustomPrice(ctx);
        return true;
      }
      // Otra opción: vuelve a la lista (sin la elegida si hay más).
      c.techniqueId = null;
      if (viableTechniques(ctx).length > 1) {
        session.step = EBotStep.CUSTOM_TECHNIQUE;
        offerTechniques(ctx);
      } else {
        say(ctx, "Es la única opción que llega para esa fecha 😕 Te paso con alguien del equipo para ver alternativas.");
        handoff(ctx, true, "Personalizada: buscar alternativas");
      }
      return true;
  }
  return false;
}

async function handleCustomStep(
  ctx: TFlowCtx,
  text: string,
  looksLikeIntent: boolean
): Promise<boolean> {
  const { session } = ctx;
  if (!session.custom) session.custom = emptyCustom();
  const c = session.custom;

  switch (session.step) {
    case EBotStep.CUSTOM_DATE: {
      const when = parseNeededBy(text);
      if (!when) {
        if (looksLikeIntent) return false;
        say(ctx, "No te entendí la fecha 🙈 Escribila tipo _20/11_, _en 2 semanas_ o _sin apuro_.");
        return true;
      }
      c.neededBy = when.date;
      c.days = when.days;
      c.whenText = when.date ? formatNeededBy(when.date) : "sin apuro";
      // "para el 20/11, son 30" → aprovecha la cantidad si vino junta.
      const q = customQuantity(text);
      if (q && !c.quantity) {
        c.quantity = q;
        c.quantityText = String(q);
      }
      nextCustomStep(ctx);
      return true;
    }
    case EBotStep.CUSTOM_QTY: {
      const q = customQuantity(text);
      if (!q) return false;
      c.quantity = q;
      c.quantityText = String(q);
      nextCustomStep(ctx);
      return true;
    }
    case EBotStep.CUSTOM_SIZE: {
      if (looksLikeIntent) return false;
      const size = parseSize(text);
      const raw = text.trim();
      if (!size && raw.length < 2) return false;
      c.size = size || raw.slice(0, 40);
      nextCustomStep(ctx);
      return true;
    }
    case EBotStep.CUSTOM_LOGO: {
      const logo = parseHasLogo(text) ?? parseYesNo(text);
      if (logo == null) return false;
      c.hasLogo = logo;
      nextCustomStep(ctx);
      return true;
    }
    case EBotStep.CUSTOM_TECHNIQUE: {
      const tokens = new Set(tokenize(text));
      const t = viableTechniques(ctx)
        .map((v) => v.t)
        .find((x) => tokenize(`${x.id} ${x.label}`).some((k) => tokens.has(k)));
      if (!t) return false;
      chooseTechnique(ctx, t.id);
      return true;
    }
    case EBotStep.CUSTOM_PRICE: {
      const yn = parseYesNo(text);
      if (yn === true || /\b(me sirve|esta bien|de acuerdo|perfecto|me parece bien|avancemos|avanzar|sigamos|la quiero|quiero esa)\b/.test(normalizeText(text))) {
        await acceptCustomPrice(ctx);
        return true;
      }
      if (yn === false || /\b(caro|mucho|otra opcion|otra)\b/.test(normalizeText(text))) {
        return handleCustomReply(ctx, "cprice", "other");
      }
      return false;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Derivar, FAQ, no entendió
// ---------------------------------------------------------------------------

/**
 * Deriva a una persona del equipo: el bot hace silencio y la charla aparece en
 * WhatsApp > Atender (y avisa) hasta que alguien la marque como atendida.
 */
export function handoff(ctx: TFlowCtx, silent = false, reason = "Derivado al equipo") {
  const { session, config } = ctx;
  session.status = "handoff";
  session.pausedUntil = new Date(Date.now() + (config.handoffPauseHours || 12) * 3600 * 1000);
  session.failCount = 0;
  session.handoffReassured = false;
  session.needsAttention = true;
  session.handoffReason = reason;
  session.handoffAt = new Date();
  session.handoffSummary = handoffSummary(ctx);
  session.attendedAt = null;
  session.attendedBy = null;
  if (silent) return;
  say(
    ctx,
    fillTemplate(ctx.outOfHours ? config.messages.handoffOutOfHours : config.messages.handoff, config)
  );
}

/** Lo que el equipo necesita saber de un vistazo al tomar la charla. */
function handoffSummary(ctx: TFlowCtx): string | null {
  const { session, config } = ctx;
  const parts: string[] = [];
  if (session.customerName) parts.push(`Cliente: ${session.customerName}`);
  if (session.segmentId && session.segmentId !== "_skip") {
    const sg = resolveSegments(config).find((x) => x.id === session.segmentId);
    parts.push(`Tipo: ${sg?.label || session.segmentId}`);
  }
  if (session.cart.length) {
    parts.push(
      `Carrito: ${session.cart
        .map((i) => `${i.quantity} × ${i.productName}${i.variantName ? ` ${i.variantName}` : ""}`)
        .join(", ")} (total ${money(cartTotal(session))})`
    );
  }
  const c = session.custom;
  if (c && (c.whenText || c.quantity || c.size)) {
    const t = c.techniqueId ? resolveTechniques(config).find((x) => x.id === c.techniqueId) : null;
    parts.push(
      `Personalizada: ${[
        t?.label,
        c.quantity ? quantityLabel(c) : null,
        c.size ? displaySize(c.size) : null,
        c.neededBy ? `para el ${formatNeededBy(c.neededBy)}` : c.whenText,
        c.hasLogo == null ? null : c.hasLogo ? "tiene logo" : "necesita diseño",
        c.unitPrice != null ? `${money(c.unitPrice)} c/u` : null,
      ]
        .filter(Boolean)
        .join(" · ")}`
    );
  }
  if (session.delivery) {
    parts.push(
      `Entrega: ${
        session.delivery.method === "pickup"
          ? "retira en el local"
          : session.delivery.method === "courier"
            ? `mensajero en ${session.delivery.place}`
            : deliveryText(session.delivery)
      }`
    );
  }
  return parts.length ? parts.join("\n") : null;
}

export function answerFaq(ctx: TFlowCtx, intent: TBotIntent) {
  const answer = intent.answer || "";
  // Dato del negocio sin cargar en Configuración → no se inventa: lo responde el equipo.
  if (!answer.trim() || hasMissingBusinessData(answer, ctx.config)) {
    buttons(ctx, "¡Buena pregunta! Eso te lo confirma alguien del equipo 🙌", [
      { id: "menu:human", title: "Hablar con alguien" },
      { id: "menu:catalog", title: "Ver banderas" },
    ]);
    return;
  }
  buttons(
    ctx,
    fillTemplate(answer, ctx.config),
    [
      { id: "menu:catalog", title: "Ver banderas" },
      { id: "menu:human", title: "Hablar con alguien" },
    ]
  );
}

function showFaqList(ctx: TFlowCtx) {
  const faqs = ctx.intents.filter((i) => i.enabled && i.kind === EBotIntentKind.FAQ && i.answer);
  if (!faqs.length) {
    say(ctx, "Preguntame lo que quieras y te respondo 🙂");
    return;
  }
  list(
    ctx,
    "¿Sobre qué tenés dudas? 🤔",
    "Ver preguntas",
    faqs.slice(0, 10).map((f) => ({ id: `faq:${f.id}`, title: f.label }))
  );
}

export function fallback(ctx: TFlowCtx) {
  ctx.session.failCount = (ctx.session.failCount || 0) + 1;
  if (ctx.session.failCount >= 2) {
    handoff(ctx, false, "No entendió 2 mensajes seguidos");
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
  extracted: {
    productText?: string | null;
    size?: string | null;
    quantity?: number | null;
    rawText?: string | null;
  }
) {
  switch (action) {
    case EBotAction.GREETING:
      showMenu(ctx, true);
      return;
    case EBotAction.MENU:
      showMenu(ctx, false);
      return;
    case EBotAction.THANKS:
      buttons(ctx, "¡De nada! 🙌 ¿Algo más?", MENU_BUTTONS);
      return;
    case EBotAction.HUMAN:
      handoff(ctx, false, "Pidió hablar con una persona");
      return;
    case EBotAction.CATALOG:
      showCatalog(ctx);
      return;
    case EBotAction.CUSTOM:
      startCustom(ctx, extracted.rawText ?? extracted.productText ?? null);
      return;
    case EBotAction.PRICE:
    case EBotAction.ORDER: {
      const family = extracted.productText
        ? findFamily(ctx.catalog, extracted.productText, ctx.config)
        : null;
      if (!family) {
        showCatalog(
          ctx,
          0,
          action === EBotAction.ORDER
            ? "¡Buenísimo! ¿Qué bandera querés? Escribime el nombre o elegí una categoría 👇"
            : "¿De qué bandera querés el precio? Escribime el nombre o elegí una categoría 👇"
        );
        return;
      }
      ctx.session.pendingQuantity =
        action === EBotAction.ORDER && extracted.quantity ? extracted.quantity : null;
      presentFamily(ctx, family, {
        action,
        size: extracted.size ?? null,
        rawText: extracted.rawText ?? extracted.productText ?? null,
        quantity: extracted.quantity ?? null,
      });
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
      else if (a === "human") handoff(ctx, false, "Pidió hablar con una persona");
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
        cat ? `*${cat.name}* 👇` : undefined
      );
      return true;
    }
    case "cand": {
      const products = session.candidateProductIds
        .map((id) => catalog.byId.get(id))
        .filter(Boolean) as TBotProduct[];
      if (!products.length) return false;
      showProductList(ctx, products, Number(a) || 0, "Más opciones 👇");
      return true;
    }
    case "type":
      chooseType(ctx, a);
      return true;
    case "size":
      if (!chooseSize(ctx, replyId.slice("size:".length), true)) {
        showCatalog(ctx, 0, "Perdón, me perdí 🙈 ¿Qué bandera buscabas?");
      }
      return true;
    case "sizes": {
      const products = session.candidateProductIds
        .map((id) => catalog.byId.get(id))
        .filter(Boolean) as TBotProduct[];
      if (!askSize(ctx, products, session.familyLabel || "", Number(a) || 0)) return false;
      return true;
    }
    case "grp":
      showGroup(ctx, a, Number(b) || 0);
      return true;
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
      else showCatalog(ctx, 0, "¡Dale! ¿Qué más sumamos? 👇");
      return true;
    case "seg":
      setSegment(ctx, a);
      return true;
    case "cdate":
    case "cqty":
    case "csize":
    case "ctech":
    case "clogo":
    case "cprice":
      return handleCustomReply(ctx, kind, replyId.slice(kind.length + 1));
    case "dlv":
      if (a === "pickup" || a === "shipping") setDelivery(ctx, a);
      else return false;
      return true;
    case "confirm":
      if (a === "yes") await confirmOrder(ctx);
      else if (a === "restart") {
        resetOrder(session);
        showCatalog(ctx, 0, "Arrancamos de cero 🙂 ¿Qué bandera buscás? 👇");
      } else {
        resetOrder(session);
        buttons(ctx, CANCELLED_TEXT, MENU_BUTTONS);
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

const PRICE_QUESTION = /\b(que sale|cuanto sale|cuanto cuesta|cuanto es|cuanto seria|cuanto me sale|precio|cuanto vale|el total|cuanto queda)\b/;

/** Pasos en los que una pregunta de precio se refiere a lo que ya se eligió. */
const PRICE_CONTEXT_STEPS: EBotStep[] = [
  EBotStep.QUANTITY,
  EBotStep.MORE,
  EBotStep.NAME,
  EBotStep.SEGMENT,
  EBotStep.DELIVERY,
  EBotStep.DELIVERY_PLACE,
  EBotStep.DELIVERY_ADDRESS,
  EBotStep.CONFIRM,
];

function answerPriceInContext(ctx: TFlowCtx, text: string): boolean {
  const { session, catalog } = ctx;
  if (!PRICE_CONTEXT_STEPS.includes(session.step)) return false;
  if (!PRICE_QUESTION.test(normalizeText(text))) return false;
  // Si nombra otro producto ("cuánto sale la de boca"), que lo vea la capa de reglas.
  if (findFamily(catalog, text, ctx.config)) return false;

  const lines: string[] = session.cart.map(
    (i) =>
      `• ${i.quantity} × ${i.productName}${i.variantName ? ` ${i.variantName}` : ""}: ${money(i.unitPrice * i.quantity)}`
  );
  const pending = session.pendingProductId ? catalog.byId.get(session.pendingProductId) : null;
  if (session.step === EBotStep.QUANTITY && pending) {
    const variant =
      pending.variants.find((v) => v.id === session.pendingVariantId) || null;
    say(
      ctx,
      `*${pending.name}${variant?.size ? ` ${variant.size}` : ""}*: ${money(variantPrice(pending, variant))} c/u 👌 ¿Cuántas te preparo?`
    );
    return true;
  }
  if (!lines.length) return false;
  say(ctx, `Lo que tenés anotado:\n${lines.join("\n")}\n*Total: ${money(cartTotal(session))}*`);
  repromptStep(ctx);
  return true;
}

/** Pasos del cierre en los que, si pregunta otra cosa, se contesta y se vuelve a preguntar. */
export const REPROMPT_STEPS: EBotStep[] = [
  EBotStep.MORE,
  EBotStep.NAME,
  EBotStep.SEGMENT,
  EBotStep.DELIVERY,
  EBotStep.DELIVERY_PLACE,
  EBotStep.DELIVERY_ADDRESS,
  EBotStep.CONFIRM,
];

/** Vuelve a hacer la pregunta del paso actual (después de contestar otra cosa). */
export function repromptStep(ctx: TFlowCtx) {
  const { session } = ctx;
  switch (session.step) {
    case EBotStep.MORE:
      say(ctx, "¿Sumás algo más?");
      return;
    case EBotStep.CONFIRM:
      showSummary(ctx);
      return;
    case EBotStep.DELIVERY_PLACE:
      say(ctx, "¿A qué localidad te lo mandamos?");
      return;
    case EBotStep.DELIVERY_ADDRESS:
      say(ctx, "¿Y la dirección? (calle y número) 📍");
      return;
    default:
      // NAME / SEGMENT / DELIVERY: el siguiente dato que falta.
      nextCheckoutStep(ctx);
  }
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

  // "¿qué sale?" / "decime cuánto sale" en medio del pedido: se contesta con lo
  // que ya está anotado y se repite la pregunta del paso (no se pierde el contexto).
  if (answerPriceInContext(ctx, text)) return true;

  switch (session.step) {
    case EBotStep.CHOOSE_TYPE: {
      const type = detectType(text, resolveTypes(catalog, ctx.config));
      if (type) {
        chooseType(ctx, type.categoryId);
        return true;
      }
      if (/\botr[oa]s?\b/i.test(text)) {
        chooseType(ctx, OTHER_TYPE);
        return true;
      }
      const picked = pickAmongCandidates(ctx, text);
      if (!picked) return false;
      showProduct(ctx, picked);
      return true;
    }
    case EBotStep.CUSTOM_DATE:
    case EBotStep.CUSTOM_QTY:
    case EBotStep.CUSTOM_SIZE:
    case EBotStep.CUSTOM_TECHNIQUE:
    case EBotStep.CUSTOM_LOGO:
    case EBotStep.CUSTOM_PRICE:
      return handleCustomStep(ctx, text, looksLikeIntent);
    case EBotStep.CHOOSE_SIZE: {
      if (chooseSize(ctx, text)) return true;
      const picked = pickAmongCandidates(ctx, text);
      if (!picked) {
        if (parseSize(text)) {
          // Medida que ninguno tiene: se la decimos y repreguntamos.
          const products = session.candidateProductIds
            .map((id) => catalog.byId.get(id))
            .filter(Boolean) as TBotProduct[];
          say(ctx, `En ${text.trim()} no la tengo 🤔`);
          askSize(ctx, products, session.familyLabel || "");
          return true;
        }
        return false;
      }
      showProduct(ctx, picked);
      return true;
    }
    case EBotStep.CHOOSE_PRODUCT: {
      // "90x1,50" mientras elige modelo: filtra los modelos por esa medida.
      if (parseSize(text) && !pickAmongCandidates(ctx, text) && chooseSize(ctx, text)) return true;
      const picked = pickAmongCandidates(ctx, text);
      if (!picked) return false;
      const variant = findVariant(picked, text);
      if (variant) selectVariant(ctx, picked, variant);
      else showProduct(ctx, picked);
      return true;
    }
    case EBotStep.QUANTITY: {
      if (parseSize(text)) return false; // menciona otra medida → que lo vea la capa de reglas
      const q = parseQuantity(text);
      if (q) {
        addToCart(ctx, q);
        return true;
      }
      const yn = parseYesNo(text);
      const product = session.pendingProductId ? catalog.byId.get(session.pendingProductId) : null;
      if (product && /\botras? medidas?\b/.test(normalizeText(text))) {
        showProduct(ctx, product);
        return true;
      }
      if (yn === true && product) {
        // Ya le dijimos el precio: solo falta la cantidad.
        buttons(ctx, "¡Genial! ¿Cuántas te preparo?", [
          { id: "qty:1", title: "1" },
          { id: "qty:2", title: "2" },
          { id: "qty:5", title: "5" },
        ]);
        return true;
      }
      if (yn === false) {
        session.pendingProductId = null;
        session.pendingVariantId = null;
        session.step = EBotStep.IDLE;
        showCatalog(ctx, 0, "¡Dale, sin problema! ¿Buscás otra? 👇");
        return true;
      }
      return false;
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
        showCatalog(ctx, 0, "¡Dale! ¿Qué más sumamos? 👇");
        return true;
      }
      return false;
    }
    case EBotStep.NAME: {
      if (looksLikeIntent) return false;
      // "Luciano!! te tengo que pasar…" → el nombre es lo primero (si el resto es otra frase).
      const first = (text.split(/[!?,.;:\n]+/)[0] || "").trim();
      const name =
        parseName(text) || (first && first.length < text.trim().length ? parseName(first) : null);
      if (!name) return false;
      session.customerName = name;
      nextCheckoutStep(ctx);
      return true;
    }
    case EBotStep.SEGMENT: {
      const seg = detectSegment(text, resolveSegments(ctx.config));
      if (seg) {
        setSegment(ctx, seg.id);
        return true;
      }
      if (/\b(otro|ninguno|no se|prefiero no|paso)\b/.test(normalizeText(text))) {
        setSegment(ctx, "_skip");
        return true;
      }
      return false;
    }
    case EBotStep.DELIVERY: {
      const method = parseDelivery(text);
      // "mandámelo a Mar del Plata" / "soy de mdp": ya dijo la ciudad del local.
      if (method !== "pickup" && isLocalCity(ctx, text)) {
        setCourier(ctx);
        return true;
      }
      if (!method) return false;
      setDelivery(ctx, method);
      return true;
    }
    case EBotStep.DELIVERY_PLACE: {
      if (looksLikeIntent) return false;
      // "soy de Mar del Plata", "vivo en Batán", "es para Necochea" → solo el lugar.
      const place = text
        .trim()
        .replace(/^(soy de|vivo en|estoy en|es en|es para|seria a|sería a|a|en|para|en la|a la)\s+/i, "")
        .replace(/[.!?]+$/, "")
        .trim();
      if (place.length < 3) return false;
      // Ciudad del local: no se envía, se coordina con el mensajero.
      if (isLocalCity(ctx, place)) {
        setCourier(ctx);
        return true;
      }
      // Fuera de la ciudad: se cuenta cómo son los envíos (si está cargado).
      const shipping = ctx.config.business.shipping?.trim();
      if (shipping) say(ctx, fillTemplate(shipping, ctx.config));
      // Con número ("Colón 1234, Necochea") ya es la dirección completa.
      if (/\d/.test(place)) {
        const nice = place === place.toLowerCase() ? titleCase(place) : place;
        session.delivery = { method: "shipping", place: null, address: nice.slice(0, 200) };
        nextCheckoutStep(ctx);
        return true;
      }
      // Solo la localidad: falta calle y número.
      session.delivery = { method: "shipping", place: titleCase(place.slice(0, 80)), address: null };
      session.step = EBotStep.DELIVERY_ADDRESS;
      say(ctx, `¡Genial, ${session.delivery.place}! ¿Y la dirección? (calle y número) 📍`);
      return true;
    }
    case EBotStep.DELIVERY_ADDRESS: {
      if (looksLikeIntent) return false;
      const t = normalizeText(text);
      const d = session.delivery || { method: "shipping" as const, place: null };
      if (/\b(despues|luego|mas tarde|te la paso|no se|todavia no)\b/.test(t)) {
        session.delivery = { ...d, address: null };
      } else {
        const address = text.trim().replace(/[.!?]+$/, "");
        if (address.length < 3) return false;
        // Toda en minúscula ("av colon 1234") → con mayúsculas; si la escribió prolija, se respeta.
        const nice = address === address.toLowerCase() ? titleCase(address) : address;
        session.delivery = { ...d, address: nice.slice(0, 200) };
      }
      nextCheckoutStep(ctx);
      return true;
    }
    case EBotStep.CONFIRM: {
      const yn = parseYesNo(text);
      if (yn === true) await confirmOrder(ctx);
      else if (yn === false) {
        resetOrder(session);
        buttons(ctx, CANCELLED_TEXT, MENU_BUTTONS);
      } else return false;
      return true;
    }
  }
  return false;
}
