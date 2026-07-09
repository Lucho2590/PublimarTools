import {
  Firestore,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import collections from "@/lib/collections";
import { generateCorrelationId } from "@/lib/auditLog";
import type { TAuditActor } from "@/lib/auditLog";
import {
  EPriceChangeSource,
  TPriceChangeInput,
  TPriceHistoryEntry,
} from "@/types/priceHistory";

// Firestore permite hasta 500 operaciones por batch; dejamos margen.
const BATCH_SIZE = 450;

const pct = (oldPrice: number, newPrice: number): number =>
  oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;

/**
 * Registra cambios de precio en la colección `priceHistory` (un doc por cambio).
 * Ignora los que no cambian el precio (salvo `creacion`, que es baseline).
 * Devuelve el `batchId` usado (para agrupar la operación).
 */
export async function recordPriceChanges(
  firestore: Firestore,
  actor: TAuditActor,
  changes: TPriceChangeInput[],
  source: EPriceChangeSource,
  batchId: string = generateCorrelationId()
): Promise<string> {
  const relevant = changes.filter(
    (c) =>
      source === EPriceChangeSource.CREACION || c.oldPrice !== c.newPrice
  );
  if (relevant.length === 0) return batchId;

  // No romper la operación principal (crear/editar/aumentar) si falla el log.
  try {
    for (let i = 0; i < relevant.length; i += BATCH_SIZE) {
      const chunk = relevant.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(firestore);
      for (const c of chunk) {
        const ref = doc(collection(firestore, collections.PRICE_HISTORY));
        batch.set(ref, {
          productId: c.productId,
          productName: c.productName,
          variantId: c.variantId ?? null,
          variantSize: c.variantSize ?? null,
          oldPrice: c.oldPrice,
          newPrice: c.newPrice,
          changePct: pct(c.oldPrice, c.newPrice),
          source,
          batchId,
          reverted: false,
          userId: actor.userId ?? null,
          userEmail: actor.userEmail ?? null,
          userName: actor.userName ?? null,
          userRole: actor.userRole ?? null,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (err) {
    console.error("[priceHistory] recordPriceChanges failed", err);
  }
  return batchId;
}

/**
 * Revierte una lista de cambios de precio: para cada entry, vuelve a poner
 * `oldPrice` en la variante/precio base del producto. Marca cada entry como
 * `reverted: true` y registra nuevos eventos `source: REVERT` (oldPrice = precio
 * actual, newPrice = valor restaurado) para trazabilidad.
 *
 * ⚠️ Pisa el precio actual con el anterior. Si un precio cambió después del
 * evento, se sobrescribe.
 */
export async function revertPriceChanges(
  firestore: Firestore,
  actor: TAuditActor,
  entries: TPriceHistoryEntry[]
): Promise<{ productsUpdated: number; pricesReverted: number }> {
  if (entries.length === 0) return { productsUpdated: 0, pricesReverted: 0 };

  // Agrupar por producto.
  const byProduct = new Map<string, TPriceHistoryEntry[]>();
  for (const e of entries) {
    const list = byProduct.get(e.productId) ?? [];
    list.push(e);
    byProduct.set(e.productId, list);
  }

  const revertInputs: TPriceChangeInput[] = [];
  const productWrites: { productId: string; data: Record<string, any> }[] = [];

  for (const [productId, list] of Array.from(byProduct.entries())) {
    const snap = await getDoc(doc(firestore, collections.PRODUCTS, productId));
    if (!snap.exists()) continue;
    const data = snap.data() as any;
    const variants = Array.isArray(data.variants) ? data.variants : [];

    // Mapa variantId -> oldPrice a restaurar.
    const targetByVariant = new Map<string, number>();
    let baseTarget: number | null = null;
    for (const e of list) {
      if (e.variantId) targetByVariant.set(e.variantId, e.oldPrice);
      else baseTarget = e.oldPrice;
    }

    if (variants.length > 0 && targetByVariant.size > 0) {
      const newVariants = variants.map((v: any) => {
        if (targetByVariant.has(v.id)) {
          const restored = targetByVariant.get(v.id)!;
          revertInputs.push({
            productId,
            productName: data.name ?? "",
            variantId: v.id,
            variantSize: v.size ?? null,
            oldPrice: Number(v.price),
            newPrice: restored,
          });
          return { ...v, price: restored };
        }
        return v;
      });
      productWrites.push({ productId, data: { variants: newVariants } });
    } else if (baseTarget !== null) {
      revertInputs.push({
        productId,
        productName: data.name ?? "",
        variantId: null,
        variantSize: null,
        oldPrice: Number(data.price),
        newPrice: baseTarget,
      });
      productWrites.push({ productId, data: { price: baseTarget } });
    }
  }

  // Escribir productos + marcar entries revertidas, en batches.
  let batch = writeBatch(firestore);
  let ops = 0;
  const flush = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = writeBatch(firestore);
      ops = 0;
    }
  };
  const push = async (fn: (b: ReturnType<typeof writeBatch>) => void) => {
    fn(batch);
    ops++;
    if (ops >= BATCH_SIZE) await flush();
  };

  for (const w of productWrites) {
    await push((b) =>
      b.update(doc(firestore, collections.PRODUCTS, w.productId), {
        ...w.data,
        updatedAt: serverTimestamp(),
      })
    );
  }
  for (const e of entries) {
    await push((b) =>
      b.update(doc(firestore, collections.PRICE_HISTORY, e.id), {
        reverted: true,
      })
    );
  }
  await flush();

  // Registrar los eventos de reversión.
  await recordPriceChanges(
    firestore,
    actor,
    revertInputs,
    EPriceChangeSource.REVERT
  );

  return {
    productsUpdated: productWrites.length,
    pricesReverted: revertInputs.length,
  };
}
