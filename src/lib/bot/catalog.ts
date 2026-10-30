// Catálogo de Banderas para el bot: carga cacheada + búsqueda difusa de
// producto y medida. Los precios salen SIEMPRE de acá (Firestore), nunca de la IA.

import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { isDeleted } from "@/lib/softDelete";
import { TBotCatalogGroup, TBotConfig, TBotProductType } from "@/types/bot";
import { SUGGESTED_CATALOG_GROUPS, SUGGESTED_PRODUCT_TYPES } from "./defaults";
import { parseSize } from "./entities";
import { normalizeText, tokenize } from "./normalize";

export type TBotVariant = {
  id: string;
  size: string;
  /** Medida normalizada "90x150" (cm, menor primero) o null si no es AxB. */
  sizeKey: string | null;
  price: number;
};

export type TBotProduct = {
  id: string;
  name: string;
  categoryIds: string[];
  categoryNames: string[];
  price: number;
  variants: TBotVariant[];
  /** Ventas históricas: ordena "las más pedidas" en listas largas. */
  salesCount: number;
  /** Tokens distintivos del nombre (sin "bandera" y otras genéricas). */
  keyTokens: string[];
};

export type TBotCatalog = {
  products: TBotProduct[];
  categories: { id: string; name: string }[];
  byId: Map<string, TBotProduct>;
  /** Todas las palabras distintivas de los nombres de productos. */
  vocab: Set<string>;
};

// Palabras que aparecen en casi todos los productos: no sirven para distinguir.
const GENERIC = new Set(["bandera", "banderin", "flag", "medida", "tela"]);

const CACHE_MS = 60_000;
let cache: { at: number; catalog: TBotCatalog } | null = null;

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export async function getCatalog(force = false): Promise<TBotCatalog> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.catalog;

  const db = getFirestoreAdmin();
  const [prodSnap, catSnap] = await Promise.all([
    db.collection(collections.PRODUCTS).get(),
    db.collection(collections.products.CATEGORIES).get(),
  ]);

  const categories = catSnap.docs
    .filter((d) => !isDeleted(d.data()))
    .map((d) => ({ id: d.id, name: String(d.data().name || "") }))
    .filter((c) => c.name);
  const catName = new Map(categories.map((c) => [c.id, c.name] as [string, string]));

  const products: TBotProduct[] = prodSnap.docs
    .filter((d) => !isDeleted(d.data()))
    .map((d) => {
      const data = d.data() as any;
      const name = String(data.name || "").trim();
      const categoryIds: string[] = Array.isArray(data.categories) ? data.categories : [];
      const variants: TBotVariant[] = (Array.isArray(data.variants) ? data.variants : [])
        .filter((v: any) => v && v.id)
        .map((v: any) => ({
          id: String(v.id),
          size: String(v.size || "").trim(),
          sizeKey: parseSize(String(v.size || "")),
          price: toNumber(v.price),
        }));
      return {
        id: d.id,
        name,
        categoryIds,
        categoryNames: categoryIds.map((id) => catName.get(id)).filter(Boolean) as string[],
        price: toNumber(data.price),
        variants,
        salesCount: toNumber(data.salesCount),
        keyTokens: tokenize(name).filter((t) => !GENERIC.has(t)),
      };
    })
    .filter((p) => p.name)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const catalog: TBotCatalog = {
    products,
    categories,
    byId: new Map(products.map((p) => [p.id, p] as [string, TBotProduct])),
    vocab: new Set(products.reduce<string[]>((acc, p) => acc.concat(p.keyTokens), [])),
  };
  cache = { at: Date.now(), catalog };
  return catalog;
}

/** Variante por medida ("90x150"); también acepta texto libre igual al size. */
export function findVariant(product: TBotProduct, sizeOrText: string): TBotVariant | null {
  const key = parseSize(sizeOrText);
  if (key) {
    const v = product.variants.find((x) => x.sizeKey === key);
    if (v) return v;
  }
  // Medidas con nombre ("1,40 m Jardín", "Grande"): igual, contenida en el
  // texto, o con todas sus palabras presentes.
  const norm = ` ${normalizeText(sizeOrText)} `;
  const tokens = new Set(tokenize(sizeOrText));
  const named = product.variants.filter((x) => {
    const vn = normalizeText(x.size);
    if (!vn) return false;
    if (norm.includes(` ${vn} `)) return true;
    const words = tokenize(x.size).filter((t) => !/^\d/.test(t) && t.length > 1 && t !== "m" && t !== "cm");
    return words.length > 0 && words.every((t) => tokens.has(t));
  });
  return named.length === 1 ? named[0] : null;
}

/** Productos de una categoría (o sin categoría si catId = "_none"). */
export function productsInCategory(catalog: TBotCatalog, catId: string): TBotProduct[] {
  if (catId === "_none") {
    const known = new Set(catalog.categories.map((c) => c.id));
    return catalog.products.filter((p) => !p.categoryIds.some((id) => known.has(id)));
  }
  return catalog.products.filter((p) => p.categoryIds.includes(catId));
}

/** Resumen compacto (sin precios) para el prompt de la IA. */
export function catalogSummary(catalog: TBotCatalog): string {
  return catalog.products
    .map((p) => {
      const sizes = p.variants.map((v) => v.size).filter(Boolean);
      return `- ${p.name}${sizes.length ? ` (medidas: ${sizes.join(", ")})` : ""}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Familias y tipos: "argentina" → todas las argentinas, agrupadas por tipo
// ---------------------------------------------------------------------------

/** Tipos de bandera: los de la config o, si no hay, los sugeridos por nombre de categoría. */
export function resolveTypes(catalog: TBotCatalog, config: TBotConfig): TBotProductType[] {
  const configured = (config.productTypes || []).filter((t) =>
    catalog.categories.some((c) => c.id === t.categoryId)
  );
  if (configured.length) return configured;
  return SUGGESTED_PRODUCT_TYPES.map((s) => {
    const cat = catalog.categories.find((c) => normalizeText(c.name) === s.categoryName);
    return cat
      ? { categoryId: cat.id, label: s.label, description: s.description, keywords: s.keywords }
      : null;
  }).filter(Boolean) as TBotProductType[];
}

function typeTokens(type: TBotProductType): string[] {
  return tokenize([type.label, ...(type.keywords || [])].join(" "));
}

/** Tipo mencionado en el texto ("argentina de ceremonia" → Ceremonia). */
export function detectType(text: string, types: TBotProductType[]): TBotProductType | null {
  const tokens = new Set(tokenize(text));
  return types.find((t) => typeTokens(t).some((k) => tokens.has(k))) || null;
}

export type TFamily = {
  /** Productos que cumplen lo pedido, el más "clásico" (nombre más corto) primero. */
  products: TBotProduct[];
  /** Lo que pidió, para repetirlo: "bandera argentina". */
  label: string;
  /** Tipo que nombró el cliente (ya aplicado como filtro). */
  type: TBotProductType | null;
  /** Solo nombró un tipo, ningún producto ("banderas de flameo"). */
  generic: boolean;
};

/**
 * Productos que el cliente está pidiendo. Usa las palabras del mensaje que
 * aparecen en nombres de productos ("argentina", "reforzada"…), sin las que
 * nombran un tipo; esas filtran por categoría. Alias exacto → ese producto.
 */
/**
 * Nombres comunes que no coinciden con cómo está cargado el producto
 * ("estados unidos" → "EE.UU."). Los propios del negocio van como alias en el panel.
 */
const BUILTIN_SYNONYMS: [RegExp, string][] = [
  [/\b(estados unidos|eeuu|ee uu|e e u u|usa|yanqui|yankee|norteamericana)\b/g, "ee uu"],
];

export function findFamily(
  catalog: TBotCatalog,
  rawText: string,
  config: TBotConfig
): TFamily | null {
  let text = normalizeText(rawText);
  for (const [re, to] of BUILTIN_SYNONYMS) text = text.replace(re, to);
  const types = resolveTypes(catalog, config);
  const type = detectType(text, types);
  const typeWords = new Set(type ? typeTokens(type) : []);
  const norm = ` ${normalizeText(text)} `;

  for (const product of catalog.products) {
    for (const alias of config.productAliases[product.id] || []) {
      const a = normalizeText(alias);
      if (a && norm.includes(` ${a} `)) return { products: [product], label: product.name, type: null, generic: false };
    }
  }

  const tokens = tokenize(text);
  // Sin números/medidas ("90x1,50" aparece en algunos nombres, pero es una medida).
  const keys = Array.from(
    new Set(tokens.filter((t) => catalog.vocab.has(t) && !typeWords.has(t) && !/^\d/.test(t)))
  );

  let products: TBotProduct[] = [];
  if (keys.length) {
    products = catalog.products.filter((p) => keys.every((k) => p.keyTokens.includes(k)));
    if (!products.length) {
      // Ninguno tiene todas las palabras: los que tienen más.
      const hits = (p: TBotProduct) => keys.filter((k) => p.keyTokens.includes(k)).length;
      const max = Math.max(...catalog.products.map(hits));
      if (max > 0) products = catalog.products.filter((p) => hits(p) === max);
    }
  } else if (type) {
    // "banderas de ceremonia": todas las de ese tipo.
    products = catalog.products.filter((p) => p.categoryIds.includes(type.categoryId));
  }
  if (!products.length) return null;

  if (type) {
    const ofType = products.filter((p) => p.categoryIds.includes(type.categoryId));
    if (ofType.length) products = ofType;
  }
  products = products
    .slice()
    .sort((a, b) => a.keyTokens.length - b.keyTokens.length || a.name.localeCompare(b.name, "es"));

  const label = keys.length
    ? `${familyName(products, keys)}${type ? ` de ${type.label.toLowerCase()}` : ""}`
    : `banderas de ${type!.label.toLowerCase()}`;
  return { products, label, type, generic: !keys.length };
}

/**
 * Nombre de lo pedido con las palabras tal cual están en el catálogo:
 * ["malvina"] → "Bandera Malvinas"; ["argentina","reforzada"] → "Bandera Argentina reforzada".
 */
function familyName(products: TBotProduct[], keys: string[]): string {
  const ref = products.find((p) => keys.every((k) => p.keyTokens.includes(k))) || products[0];
  const words = ref.name
    .split(/\s+/)
    .filter((w) => tokenize(w).some((t) => keys.includes(t)));
  const name = words.join(" ") || keys.join(" ");
  const flags = products.filter((p) => /^bandera\b/i.test(p.name)).length;
  return flags * 2 >= products.length ? `Bandera ${name}` : name.charAt(0).toUpperCase() + name.slice(1);
}

/** Nombre corto para listas: sin el "Bandera" inicial. */
export function shortName(product: TBotProduct): string {
  const s = product.name.replace(/^bandera\s+/i, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Grupos del menú del catálogo (Argentinas / Extranjeras / Personalizadas / Otras)
// ---------------------------------------------------------------------------

export type TResolvedGroup = TBotCatalogGroup & { products: TBotProduct[] };

/**
 * Grupos con sus productos. Cada producto va al PRIMER grupo que lo incluye
 * (una argentina que también es "Flameo" queda en Argentinas); el grupo `rest`
 * se queda con lo que sobra. Grupos vacíos se omiten.
 */
export function resolveGroups(catalog: TBotCatalog, config: TBotConfig): TResolvedGroup[] {
  const groups: TBotCatalogGroup[] = config.catalogGroups?.length
    ? config.catalogGroups
    : SUGGESTED_CATALOG_GROUPS.map((g) => ({
        id: g.id,
        label: g.label,
        rest: g.rest,
        categoryIds: catalog.categories
          .filter((c) => g.categoryNames.includes(normalizeText(c.name)))
          .map((c) => c.id),
      }));

  const taken = new Set<string>();
  const out: TResolvedGroup[] = [];
  for (const g of groups) {
    const products = g.rest
      ? []
      : catalog.products.filter(
          (p) => !taken.has(p.id) && p.categoryIds.some((id) => g.categoryIds.includes(id))
        );
    products.forEach((p) => taken.add(p.id));
    out.push({ ...g, products });
  }
  const rest = out.find((g) => g.rest);
  if (rest) rest.products = catalog.products.filter((p) => !taken.has(p.id));
  return out.filter((g) => g.products.length > 0);
}
