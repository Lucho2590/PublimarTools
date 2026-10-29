// Catálogo de Banderas para el bot: carga cacheada + búsqueda difusa de
// producto y medida. Los precios salen SIEMPRE de acá (Firestore), nunca de la IA.

import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { isDeleted } from "@/lib/softDelete";
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
  /** Tokens distintivos del nombre (sin "bandera" y otras genéricas). */
  keyTokens: string[];
};

export type TBotCatalog = {
  products: TBotProduct[];
  categories: { id: string; name: string }[];
  byId: Map<string, TBotProduct>;
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
        keyTokens: tokenize(name).filter((t) => !GENERIC.has(t)),
      };
    })
    .filter((p) => p.name)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const catalog: TBotCatalog = {
    products,
    categories,
    byId: new Map(products.map((p) => [p.id, p] as [string, TBotProduct])),
  };
  cache = { at: Date.now(), catalog };
  return catalog;
}

export type TProductMatch = { product: TBotProduct; score: number };

/**
 * Busca productos mencionados en el texto. Puntaje 1 = alias exacto o todos los
 * tokens distintivos presentes; parcial = proporción de tokens presentes.
 */
export function findProducts(
  catalog: TBotCatalog,
  text: string,
  aliases: Record<string, string[]>
): TProductMatch[] {
  const norm = ` ${normalizeText(text)} `;
  const tokens = new Set(tokenize(text));
  const matches: TProductMatch[] = [];

  for (const product of catalog.products) {
    let score = 0;
    for (const alias of aliases[product.id] || []) {
      const a = normalizeText(alias);
      if (a && norm.includes(` ${a} `)) score = 1;
    }
    if (score < 1 && product.keyTokens.length) {
      const hit = product.keyTokens.filter((t) => tokens.has(t)).length;
      score = Math.max(score, hit / product.keyTokens.length);
    }
    if (score >= 0.5) matches.push({ product, score });
  }

  matches.sort((a, b) => b.score - a.score || a.product.keyTokens.length - b.product.keyTokens.length);
  return matches;
}

/**
 * Elige el producto si hay un único mejor puntaje; si empatan varios, los
 * devuelve como candidatos para que el cliente elija ("la argentina" con
 * "Argentina" 1.0 y "Argentina con sol" 0.5 → elige "Argentina").
 */
export function pickProduct(matches: TProductMatch[]): {
  product: TBotProduct | null;
  candidates: TBotProduct[];
} {
  if (!matches.length) return { product: null, candidates: [] };
  const top = matches[0].score;
  const best = matches.filter((m) => m.score === top);
  if (best.length === 1) return { product: best[0].product, candidates: [] };
  return { product: null, candidates: best.map((m) => m.product) };
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
