import {
  Firestore,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import collections from "@/lib/collections";
import { EUserRole } from "@/types/user";
import {
  EAuditAction,
  EAuditEntityType,
  EAuditSection,
  TAuditChanges,
  TAuditLogEntry,
} from "@/types/auditLog";

export type TAuditActor = {
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userRole: EUserRole | null;
};

export type TAuditInput = Omit<
  TAuditLogEntry,
  "id" | "timestamp" | "userId" | "userEmail" | "userName" | "userRole"
>;

const MAX_FIELD_BYTES = 1024;

function sanitizeValue(v: any): any {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === "function") return null;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v.toDate === "function") {
    try {
      return v.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) {
    const arr = v.map(sanitizeValue);
    const json = JSON.stringify(arr);
    if (json.length > MAX_FIELD_BYTES) {
      return { _truncated: true, length: arr.length, preview: arr.slice(0, 3) };
    }
    return arr;
  }
  if (typeof v === "object") {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith("_")) continue;
      out[k] = sanitizeValue(val);
    }
    const json = JSON.stringify(out);
    if (json.length > MAX_FIELD_BYTES) {
      return { _truncated: true };
    }
    return out;
  }
  if (typeof v === "string" && v.length > MAX_FIELD_BYTES) {
    return v.slice(0, MAX_FIELD_BYTES) + "…";
  }
  return v;
}

function valuesEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  const ta = a?.toDate?.();
  const tb = b?.toDate?.();
  if (ta && tb) return ta.getTime() === tb.getTime();
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

export function buildChanges(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
  watchedFields?: string[]
): TAuditChanges {
  const changes: TAuditChanges = {};

  if (!before && after) {
    const src = watchedFields ?? Object.keys(after);
    const out: Record<string, any> = {};
    for (const k of src) {
      if (after[k] === undefined) continue;
      out[k] = sanitizeValue(after[k]);
    }
    if (Object.keys(out).length) changes.after = out;
    return changes;
  }

  if (before && !after) {
    const src = watchedFields ?? Object.keys(before);
    const out: Record<string, any> = {};
    for (const k of src) {
      if (before[k] === undefined) continue;
      out[k] = sanitizeValue(before[k]);
    }
    if (Object.keys(out).length) changes.before = out;
    return changes;
  }

  if (before && after) {
    const keys = watchedFields ?? Array.from(
      new Set([...Object.keys(before), ...Object.keys(after)])
    );
    const bOut: Record<string, any> = {};
    const aOut: Record<string, any> = {};
    for (const k of keys) {
      const bv = before[k];
      const av = after[k];
      if (valuesEqual(bv, av)) continue;
      bOut[k] = sanitizeValue(bv);
      aOut[k] = sanitizeValue(av);
    }
    if (Object.keys(bOut).length) changes.before = bOut;
    if (Object.keys(aOut).length) changes.after = aOut;
  }

  return changes;
}

export type TVariantDiff = {
  variantId: string;
  productId: string;
  productName?: string;
  variantName?: string;
  stockBefore: number | null;
  stockAfter: number | null;
  delta: number;
};

export function diffVariants(
  productId: string,
  productName: string | undefined,
  before: Array<{ id: string; size?: string; stock?: number }> | undefined,
  after: Array<{ id: string; size?: string; stock?: number }> | undefined
): TVariantDiff[] {
  const result: TVariantDiff[] = [];
  const beforeMap = new Map<string, { size?: string; stock?: number }>();
  (before ?? []).forEach((v) => beforeMap.set(v.id, v));
  const afterMap = new Map<string, { size?: string; stock?: number }>();
  (after ?? []).forEach((v) => afterMap.set(v.id, v));
  const idSet = new Set<string>();
  beforeMap.forEach((_, id) => idSet.add(id));
  afterMap.forEach((_, id) => idSet.add(id));
  const allIds = Array.from(idSet);
  for (const id of allIds) {
    const b = beforeMap.get(id);
    const a = afterMap.get(id);
    const bStock = Number(b?.stock ?? 0);
    const aStock = Number(a?.stock ?? 0);
    if (bStock === aStock) continue;
    result.push({
      variantId: id,
      productId,
      productName,
      variantName: a?.size ?? b?.size,
      stockBefore: b ? bStock : null,
      stockAfter: a ? aStock : null,
      delta: aStock - bStock,
    });
  }
  return result;
}

export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function writeAuditLog(
  firestore: Firestore,
  actor: TAuditActor,
  entry: TAuditInput
): Promise<void> {
  try {
    const payload: any = {
      userId: actor.userId ?? null,
      userEmail: actor.userEmail ?? null,
      userName: actor.userName ?? null,
      userRole: actor.userRole ?? null,
      timestamp: serverTimestamp(),
      section: entry.section,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityLabel: entry.entityLabel ?? null,
      action: entry.action,
      description: entry.description,
    };
    if (entry.changes) payload.changes = entry.changes;
    if (entry.metadata) payload.metadata = sanitizeValue(entry.metadata);
    if (entry.correlationId) payload.correlationId = entry.correlationId;

    await addDoc(collection(firestore, collections.AUDIT_LOG), payload);
  } catch (err) {
    console.error("[auditLog] write failed", err, {
      section: entry.section,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
    });
  }
}

export function describeSaleCreate(saleNumber: string, total: number): string {
  return `Creó la venta ${saleNumber} por $${formatAmount(total)}`;
}
export function describeSaleUpdate(saleNumber: string, fields: string[]): string {
  if (!fields.length) return `Editó la venta ${saleNumber}`;
  return `Editó la venta ${saleNumber} (${fields.join(", ")})`;
}
export function describeSaleDelete(saleNumber: string): string {
  return `Eliminó la venta ${saleNumber}`;
}
export function describeStockChange(
  productName: string,
  variantName: string | undefined,
  delta: number,
  reason: string
): string {
  const sign = delta >= 0 ? "+" : "";
  const variant = variantName ? ` (${variantName})` : "";
  const reasonLabel: Record<string, string> = {
    sale: "por venta",
    sale_edit: "por edición de venta",
    sale_delete: "por eliminación de venta",
    manual_edit: "manualmente",
    product_edit: "al editar producto",
    ecommerce: "por tienda",
    return: "por devolución",
  };
  return `${sign}${delta} en stock de ${productName}${variant} ${reasonLabel[reason] ?? ""}`.trim();
}
export function describeProductUpdate(productName: string, fields: string[]): string {
  if (!fields.length) return `Editó el producto ${productName}`;
  return `Editó el producto ${productName} (${fields.join(", ")})`;
}

function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export {
  EAuditAction,
  EAuditEntityType,
  EAuditSection,
};
