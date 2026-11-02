// Emisión de Factura A/B y Nota de Crédito A/B contra WSFEv1.
//
// Flujo (el mismo para facturas y NCs):
//   1. Se valida monto y receptor contra el documento (no facturar de más,
//      no facturar dos veces el mismo pago).
//   2. Se crea `arcaInvoices/{requestId}` en "pending". El requestId lo genera
//      el diálogo al abrirse: un doble clic o un reintento devuelve el mismo
//      comprobante en vez de emitir otro.
//   3. Con un lock por ambiente + punto de venta + tipo: último número
//      autorizado + 1 → FECAESolicitar. Si ARCA no responde, se consulta el
//      número (FECompConsultar) antes de dar el comprobante por fallido.
//   4. Si sale autorizado, se agrega a `facturas[]` de la orden y de la venta
//      vinculada, y se marcan los pagos incluidos.

import { randomUUID } from "crypto";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
// IVoucher choca con otro tipo homónimo en el barrel del SDK: se importa directo.
import type { IVoucher } from "@arcasdk/core/lib/domain/types/voucher.types";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { cleanCuit, isValidCuitChecksum } from "@/lib/cuit";
import { EClientTaxCondition } from "@/types/client";
import type { TFactura, TPaymentHistory } from "@/types/order";
import type {
  TArcaAlcance,
  TArcaInvoice,
  TArcaItem,
  TArcaKind,
  TArcaLetra,
  TArcaMessage,
  TArcaReceptor,
  TArcaReceptorOrigen,
  TArcaSource,
} from "@/types/arca";
import {
  DOWN_PAYMENT_KEY,
  buildSingleItem,
  buildTotalItems,
  invoicedNet,
  listInvoiceablePayments,
  paymentKey,
  round2,
  splitIva,
  summarizeLines,
} from "../amounts";
import {
  CONCEPTO_PRODUCTOS,
  CONDICION_FISCAL,
  DOC_TIPO,
  IVA_21,
  cbteTipoFor,
  cbteTipoLabel,
  formatNumeroComprobante,
  leyendasFor,
} from "../constants";
import { ARCA_CONFIG_COLLECTION, ARCA_INVOICES_COLLECTION } from "./config";
import { describeArcaError, getArcaClient, type TArcaClient } from "./client";

export class ArcaEmitError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

const asArray = <T>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fecha de hoy en Argentina (el servidor puede correr en UTC). */
function todayAR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const yyyymmddToIso = (s?: string) =>
  s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s || undefined;

function assertRequestId(id: unknown): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    throw new ArcaEmitError("requestId inválido");
  }
  return id;
}

// --------------------------------------------------------------------------
// Documentos de origen (orden / venta) y su vinculado
// --------------------------------------------------------------------------

type TSourceDoc = Record<string, any> & { id: string };

type TLinkedDocs = {
  orderRef: DocumentReference | null;
  saleRef: DocumentReference | null;
  order: TSourceDoc | null;
  sale: TSourceDoc | null;
};

async function loadLinkedDocs(
  db: Firestore,
  ids: { orderId?: string | null; saleId?: string | null },
): Promise<TLinkedDocs> {
  let orderId = ids.orderId || null;
  let saleId = ids.saleId || null;
  let order: TSourceDoc | null = null;
  let sale: TSourceDoc | null = null;

  if (orderId) {
    const snap = await db.collection(collections.ORDERS).doc(orderId).get();
    if (snap.exists) {
      order = { id: snap.id, ...snap.data() };
      saleId = saleId || order.saleId || null;
    }
  }
  if (saleId) {
    const snap = await db.collection(collections.SALES).doc(saleId).get();
    if (snap.exists) {
      sale = { id: snap.id, ...snap.data() };
      if (!order && sale.orderId) {
        const o = await db.collection(collections.ORDERS).doc(sale.orderId).get();
        if (o.exists) order = { id: o.id, ...o.data() };
      }
    }
  }
  return {
    order,
    sale,
    orderRef: order ? db.collection(collections.ORDERS).doc(order.id) : null,
    saleRef: sale ? db.collection(collections.SALES).doc(sale.id) : null,
  };
}

function documentTotal(source: TArcaSource, doc: TSourceDoc): number {
  if (source === "sale") return round2(Number(doc.finalTotal ?? doc.total) || 0);
  return round2(Number(doc.total) || 0);
}

function clientIdOf(doc: TSourceDoc | null): string | null {
  if (!doc) return null;
  if (doc.clientId) return String(doc.clientId);
  if (typeof doc.client === "string") return doc.client;
  return doc.client?.id ? String(doc.client.id) : null;
}

// --------------------------------------------------------------------------
// Receptor
// --------------------------------------------------------------------------

export type TReceptorInput = {
  docTipo: number;
  docNro: string;
  razonSocial: string;
  condicion: EClientTaxCondition;
  domicilio?: string;
  origen: TArcaReceptorOrigen;
};

function normalizeReceptor(input: TReceptorInput, monto: number, umbralCF: number): TArcaReceptor {
  const fiscal = CONDICION_FISCAL[input?.condicion];
  if (!fiscal) throw new ArcaEmitError("Falta la condición frente al IVA del receptor");

  const docTipo = Number(input.docTipo);
  let docNro = String(input.docNro || "").replace(/\D/g, "");
  let razonSocial = String(input.razonSocial || "").trim();

  if (fiscal.requiresCuit && docTipo !== DOC_TIPO.CUIT) {
    throw new ArcaEmitError(`Para ${fiscal.label} la factura es A y requiere el CUIT del receptor`);
  }
  if (docTipo === DOC_TIPO.CUIT) {
    docNro = cleanCuit(docNro);
    if (!isValidCuitChecksum(docNro)) throw new ArcaEmitError("El CUIT del receptor no es válido");
  } else if (docTipo === DOC_TIPO.DNI) {
    if (!/^\d{7,8}$/.test(docNro)) throw new ArcaEmitError("El DNI del receptor no es válido (7 u 8 dígitos)");
  } else if (docTipo === DOC_TIPO.CONSUMIDOR_FINAL) {
    if (input.condicion !== EClientTaxCondition.CONSUMIDOR_FINAL) {
      throw new ArcaEmitError("Solo un consumidor final puede facturarse sin documento");
    }
    if (monto >= umbralCF) {
      throw new ArcaEmitError(
        `Desde ${umbralCF.toLocaleString("es-AR")} una factura a consumidor final exige identificar al comprador (DNI o CUIT)`,
      );
    }
    docNro = "0";
    razonSocial = razonSocial || "Consumidor Final";
  } else {
    throw new ArcaEmitError("Tipo de documento del receptor inválido");
  }
  if (!razonSocial) throw new ArcaEmitError("Falta la razón social / nombre del receptor");

  return {
    docTipo,
    docNro,
    razonSocial,
    condicion: input.condicion,
    condicionIvaReceptorId: fiscal.condicionIvaReceptorId,
    domicilio: String(input.domicilio || "").trim(),
    origen: input.origen || "manual",
  };
}

// --------------------------------------------------------------------------
// Lock de numeración
// --------------------------------------------------------------------------

async function withNumberingLock<T>(db: Firestore, key: string, fn: () => Promise<T>): Promise<T> {
  const ref = db.collection(ARCA_CONFIG_COLLECTION).doc(`lock_${key}`);
  const owner = randomUUID();
  const deadline = Date.now() + 20_000;
  for (;;) {
    const acquired = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const until = snap.exists ? Number(snap.data()?.lockedUntil) || 0 : 0;
      if (until > Date.now()) return false;
      // Vence solo por si la función muere a mitad de camino.
      tx.set(ref, { lockedUntil: Date.now() + 60_000, owner });
      return true;
    });
    if (acquired) break;
    if (Date.now() > deadline) {
      throw new ArcaEmitError("Hay otro comprobante emitiéndose en este momento. Reintentá en unos segundos.", 409);
    }
    await sleep(700);
  }
  try {
    return await fn();
  } finally {
    await db
      .runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.data()?.owner === owner) tx.delete(ref);
      })
      .catch(() => undefined);
  }
}

// --------------------------------------------------------------------------
// Llamada a ARCA
// --------------------------------------------------------------------------

type TAuthorizeInput = {
  cbteTipo: number;
  receptor: TArcaReceptor;
  impNeto: number;
  impIVA: number;
  impTotal: number;
  fecha: string;
  cbtesAsoc?: IVoucher["CbtesAsoc"];
};

type TAuthorizeResult =
  | { ok: true; numero: number; cae: string; caeVto?: string; observaciones: TArcaMessage[] }
  | { ok: false; numero?: number; errores: TArcaMessage[]; observaciones: TArcaMessage[]; transient?: boolean };

const toMessages = (list: unknown): TArcaMessage[] =>
  asArray(list as { Code?: number; Msg?: string } | { Code?: number; Msg?: string }[])
    .filter(Boolean)
    .map((m) => ({ code: m.Code != null ? Number(m.Code) : undefined, msg: String(m.Msg || "") }));

async function authorize(client: TArcaClient, input: TAuthorizeInput): Promise<TAuthorizeResult> {
  const { arca, ctx } = client;
  const service = arca.electronicBillingService;
  const last = await service.getLastVoucher(ctx.puntoVenta, input.cbteTipo);
  const lastErrors = asArray(last.errors?.err);
  if (lastErrors.length) {
    return {
      ok: false,
      errores: lastErrors.map((e: any) => ({ code: Number(e.code), msg: String(e.msg) })),
      observaciones: [],
    };
  }
  const numero = (Number(last.cbteNro) || 0) + 1;

  const voucher: IVoucher = {
    CantReg: 1,
    PtoVta: ctx.puntoVenta,
    CbteTipo: input.cbteTipo,
    Concepto: CONCEPTO_PRODUCTOS,
    DocTipo: input.receptor.docTipo,
    DocNro: Number(input.receptor.docNro),
    CbteDesde: numero,
    CbteHasta: numero,
    CbteFch: input.fecha.replace(/-/g, ""),
    ImpTotal: input.impTotal,
    ImpTotConc: 0,
    ImpNeto: input.impNeto,
    ImpOpEx: 0,
    ImpIVA: input.impIVA,
    ImpTrib: 0,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: input.receptor.condicionIvaReceptorId,
    Iva: [{ Id: IVA_21.id, BaseImp: input.impNeto, Importe: input.impIVA }],
    ...(input.cbtesAsoc?.length ? { CbtesAsoc: input.cbtesAsoc } : {}),
  };

  try {
    const result = await service.createVoucher(voucher);
    const resp = result.response || {};
    const det = asArray(resp.FeDetResp?.FECAEDetResponse)[0];
    const observaciones = toMessages(det?.Observaciones?.Obs);
    const errores = toMessages(resp.Errors?.Err);
    if (det?.Resultado === "A" && result.cae) {
      return { ok: true, numero, cae: result.cae, caeVto: yyyymmddToIso(result.caeFchVto), observaciones };
    }
    return {
      ok: false,
      numero,
      errores: errores.length ? errores : [{ msg: "ARCA rechazó el comprobante" }],
      observaciones,
    };
  } catch (error) {
    // Sin respuesta: puede haberse autorizado igual. Se consulta antes de fallar.
    try {
      const info = await service.getVoucherInfo(numero, ctx.puntoVenta, input.cbteTipo);
      if (
        info?.codAutorizacion &&
        Math.abs(Number(info.impTotal) - input.impTotal) < 0.01 &&
        String(info.docNro) === String(Number(input.receptor.docNro))
      ) {
        return {
          ok: true,
          numero,
          cae: String(info.codAutorizacion),
          caeVto: yyyymmddToIso(info.fchVto),
          observaciones: [],
        };
      }
    } catch {
      // seguimos con el error original
    }
    return { ok: false, numero, errores: [{ msg: describeArcaError(error) }], observaciones: [], transient: true };
  }
}

// --------------------------------------------------------------------------
// Persistencia
// --------------------------------------------------------------------------

function facturaEntry(inv: TArcaInvoice): TFactura {
  return {
    id: `arca-${inv.id}`,
    tipo: cbteTipoLabel(inv.cbteTipo),
    numero: inv.numeroFormateado || "",
    fecha: inv.fecha,
    monto: inv.impTotal,
    arcaInvoiceId: inv.id,
    cae: inv.cae,
    kind: inv.kind,
    ...(inv.pagoKeys?.length ? { pagoKeys: inv.pagoKeys } : {}),
  };
}

/** Datos de factura que se escriben en una orden o venta al autorizar. */
function invoicedFields(doc: TSourceDoc, entry: TFactura) {
  const prev: TFactura[] = Array.isArray(doc.facturas) ? doc.facturas : [];
  const facturas = [...prev.filter((f) => f.id !== entry.id), entry];
  const first = facturas[0];
  return {
    facturas,
    isInvoiced: true,
    invoiceNumber: first.numero,
    invoiceType: first.tipo,
    invoiceDate: first.fecha ? new Date(`${first.fecha}T00:00:00`) : null,
    updatedAt: new Date(),
  };
}

/** Marca (o libera, con invoiceId = null) los pagos de la orden. */
function markPayments(
  order: TSourceDoc,
  invoiceId: string | null,
  match: { keys?: string[]; releaseInvoiceId?: string },
): { paymentHistory?: TPaymentHistory[]; downPaymentArcaInvoiceId?: string | null } {
  const updates: { paymentHistory?: TPaymentHistory[]; downPaymentArcaInvoiceId?: string | null } = {};
  const keys = new Set(match.keys || []);
  const history: TPaymentHistory[] = Array.isArray(order.paymentHistory) ? order.paymentHistory : [];
  let changed = false;
  const next = history.map((p, index) => {
    const hit = match.releaseInvoiceId
      ? p.arcaInvoiceId === match.releaseInvoiceId
      : keys.has(paymentKey(p, index));
    if (!hit) return p;
    changed = true;
    return {
      ...p,
      // La seña cargada al crear la orden no tiene id: se le asigna uno estable.
      id: p.id || `pago-arca-${index}-${Date.now()}`,
      arcaInvoiceId: invoiceId,
    };
  });
  if (changed) updates.paymentHistory = next;
  if (match.releaseInvoiceId ? order.downPaymentArcaInvoiceId === match.releaseInvoiceId : keys.has(DOWN_PAYMENT_KEY)) {
    updates.downPaymentArcaInvoiceId = invoiceId;
  }
  return updates;
}

async function existingInvoice(ref: DocumentReference): Promise<TArcaInvoice | null> {
  const snap = await ref.get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as TArcaInvoice) : null;
}

type TEmitCommon = {
  db: Firestore;
  client: TArcaClient;
  ref: DocumentReference;
  base: Omit<TArcaInvoice, "status" | "createdAt" | "updatedAt">;
  cbtesAsoc?: IVoucher["CbtesAsoc"];
  onAuthorized: (inv: TArcaInvoice) => Promise<void>;
};

async function runEmission({ db, client, ref, base, cbtesAsoc, onAuthorized }: TEmitCommon): Promise<TArcaInvoice> {
  const now = new Date().toISOString();
  const pending: TArcaInvoice = { ...base, status: "pending", createdAt: now, updatedAt: now };
  try {
    await ref.create(JSON.parse(JSON.stringify(pending)));
  } catch (error: any) {
    // ALREADY_EXISTS: mismo requestId → devolver lo que ya se emitió.
    if (error?.code === 6) {
      const prev = await existingInvoice(ref);
      if (prev && prev.status !== "error") return prev;
      if (prev) await ref.set({ ...JSON.parse(JSON.stringify(pending)) });
    } else {
      throw error;
    }
  }

  const lockKey = `${base.environment}_${base.puntoVenta}_${base.cbteTipo}`;
  const result = await withNumberingLock(db, lockKey, () =>
    authorize(client, {
      cbteTipo: base.cbteTipo,
      receptor: base.receptor,
      impNeto: base.impNeto,
      impIVA: base.impIVA,
      impTotal: base.impTotal,
      fecha: base.fecha,
      cbtesAsoc,
    }),
  );

  const updatedAt = new Date().toISOString();
  if (result.ok) {
    const authorized: TArcaInvoice = {
      ...pending,
      status: "authorized",
      numero: result.numero,
      numeroFormateado: formatNumeroComprobante(base.puntoVenta, result.numero),
      cae: result.cae,
      caeVto: result.caeVto,
      observaciones: result.observaciones,
      errores: [],
      updatedAt,
    };
    await ref.set(JSON.parse(JSON.stringify(authorized)));
    await onAuthorized(authorized);
    return authorized;
  }

  const failed: TArcaInvoice = {
    ...pending,
    status: result.transient ? "error" : "rejected",
    ...(result.numero ? { numero: result.numero } : {}),
    observaciones: result.observaciones,
    errores: result.errores,
    updatedAt,
  };
  await ref.set(JSON.parse(JSON.stringify(failed)));
  return failed;
}

function rejectionMessage(inv: TArcaInvoice): string {
  const msgs = [...(inv.errores || []), ...(inv.observaciones || [])]
    .map((m) => (m.code ? `${m.code}: ${m.msg}` : m.msg))
    .filter(Boolean);
  return msgs.length ? msgs.join(" · ") : "ARCA rechazó el comprobante";
}

export function assertAuthorized(inv: TArcaInvoice): TArcaInvoice {
  if (inv.status === "authorized") return inv;
  if (inv.status === "pending") throw new ArcaEmitError("El comprobante se está emitiendo. Reintentá en unos segundos.", 409);
  throw new ArcaEmitError(rejectionMessage(inv), inv.status === "error" ? 502 : 422);
}

// --------------------------------------------------------------------------
// Factura A/B
// --------------------------------------------------------------------------

export type TEmitFacturaInput = {
  requestId: string;
  source: TArcaSource;
  sourceId: string;
  receptor: TReceptorInput;
  alcance: TArcaAlcance;
  pagoKeys?: string[];
  monto?: number;
  descripcion?: string;
};

export async function emitFactura(input: TEmitFacturaInput, uid: string): Promise<TArcaInvoice> {
  const db = getFirestoreAdmin();
  const requestId = assertRequestId(input.requestId);
  const ref = db.collection(ARCA_INVOICES_COLLECTION).doc(requestId);
  const prev = await existingInvoice(ref);
  if (prev && prev.status !== "error") return prev;

  if (input.source !== "order" && input.source !== "sale") throw new ArcaEmitError("Origen inválido");
  const linked = await loadLinkedDocs(db, input.source === "order" ? { orderId: input.sourceId } : { saleId: input.sourceId });
  const source = input.source === "order" ? linked.order : linked.sale;
  if (!source || source.deleted) throw new ArcaEmitError("No se encontró el documento a facturar", 404);

  const total = documentTotal(input.source, source);
  const facturas: TFactura[] = Array.isArray(source.facturas) ? source.facturas : [];
  const pending = Math.max(0, round2(total - invoicedNet(facturas)));
  const label = input.source === "order" ? "Orden" : "Venta";
  const docNumber = source.number ? String(source.number) : source.id;
  const lines: any[] = Array.isArray(source.items) ? source.items : [];

  let monto = 0;
  let items: TArcaItem[];
  let pagoKeys: string[] | undefined;
  const descripcion = String(input.descripcion || "").trim();
  const defaultDesc = `Pago a cuenta ${label} N° ${docNumber}${lines.length ? ` – ${summarizeLines(lines)}` : ""}`;

  switch (input.alcance) {
    case "total":
      if (invoicedNet(facturas) > 0.009) {
        throw new ArcaEmitError("El documento ya tiene facturas: facturá el saldo pendiente o un monto libre");
      }
      monto = total;
      items = buildTotalItems(lines, total);
      break;
    case "saldo":
      monto = pending;
      items = buildSingleItem(descripcion || `Saldo ${label} N° ${docNumber}`, monto);
      break;
    case "pago": {
      if (input.source !== "order") throw new ArcaEmitError("Solo se pueden facturar pagos de una orden");
      const keys = Array.from(new Set(input.pagoKeys || []));
      if (!keys.length) throw new ArcaEmitError("Elegí al menos un pago");
      const payments = listInvoiceablePayments(source);
      const selected = keys.map((k) => payments.find((p) => p.key === k));
      if (selected.some((p) => !p)) throw new ArcaEmitError("Uno de los pagos ya no existe: recargá la orden", 409);
      if (selected.some((p) => p!.arcaInvoiceId)) throw new ArcaEmitError("Uno de los pagos ya está facturado", 409);
      monto = round2(selected.reduce((s, p) => s + p!.amount, 0));
      items = buildSingleItem(descripcion || defaultDesc, monto);
      pagoKeys = keys;
      break;
    }
    case "libre":
      monto = round2(Number(input.monto) || 0);
      items = buildSingleItem(descripcion || defaultDesc, monto);
      break;
    default:
      throw new ArcaEmitError("Alcance inválido");
  }

  if (monto <= 0) throw new ArcaEmitError("El monto a facturar tiene que ser mayor a cero");
  if (monto > pending + 0.009) {
    throw new ArcaEmitError(
      `El monto (${monto.toLocaleString("es-AR")}) supera lo pendiente de facturar (${pending.toLocaleString("es-AR")})`,
    );
  }

  const client = await getArcaClient().catch((e) => {
    throw new ArcaEmitError(e instanceof Error ? e.message : String(e), 412);
  });
  if (!client.ctx.puntoVenta) throw new ArcaEmitError("Falta configurar el punto de venta en Administración → ARCA", 412);

  const receptor = normalizeReceptor(input.receptor, monto, client.ctx.umbralConsumidorFinal);
  const letra: TArcaLetra = CONDICION_FISCAL[receptor.condicion].letra;
  const kind: TArcaKind = "factura";
  const { neto, iva } = splitIva(monto);

  const base: TEmitCommon["base"] = {
    id: requestId,
    environment: client.ctx.environment,
    kind,
    letra,
    cbteTipo: cbteTipoFor(letra, kind),
    puntoVenta: client.ctx.puntoVenta,
    fecha: todayAR(),
    emisor: client.ctx.emisor,
    receptor,
    alcance: input.alcance,
    ...(pagoKeys ? { pagoKeys } : {}),
    items,
    impNeto: neto,
    impIVA: iva,
    impTotal: monto,
    iva: [{ id: IVA_21.id, baseImp: neto, importe: iva }],
    leyendas: leyendasFor(receptor.condicion),
    orderId: linked.order?.id ?? null,
    saleId: linked.sale?.id ?? null,
    clientId: clientIdOf(source),
    documentNumber: docNumber,
    ncIds: [],
    ncTotal: 0,
    createdBy: uid,
  };

  return runEmission({
    db,
    client,
    ref,
    base,
    onAuthorized: async (inv) => {
      const entry = facturaEntry(inv);
      await db.runTransaction(async (tx) => {
        const orderSnap = linked.orderRef ? await tx.get(linked.orderRef) : null;
        const saleSnap = linked.saleRef ? await tx.get(linked.saleRef) : null;
        if (orderSnap?.exists) {
          const order = { id: orderSnap.id, ...orderSnap.data() } as TSourceDoc;
          tx.update(orderSnap.ref, {
            ...invoicedFields(order, entry),
            ...(inv.pagoKeys?.length ? markPayments(order, inv.id, { keys: inv.pagoKeys }) : {}),
          });
        }
        if (saleSnap?.exists) {
          const sale = { id: saleSnap.id, ...saleSnap.data() } as TSourceDoc;
          tx.update(saleSnap.ref, invoicedFields(sale, entry));
        }
      });
    },
  });
}

// --------------------------------------------------------------------------
// Nota de crédito A/B
// --------------------------------------------------------------------------

export type TEmitNotaCreditoInput = {
  requestId: string;
  facturaId: string;
  monto?: number;
  motivo?: string;
};

export async function emitNotaCredito(input: TEmitNotaCreditoInput, uid: string): Promise<TArcaInvoice> {
  const db = getFirestoreAdmin();
  const requestId = assertRequestId(input.requestId);
  const ref = db.collection(ARCA_INVOICES_COLLECTION).doc(requestId);
  const prev = await existingInvoice(ref);
  if (prev && prev.status !== "error") return prev;

  const facturaRef = db.collection(ARCA_INVOICES_COLLECTION).doc(String(input.facturaId || ""));
  const factura = await existingInvoice(facturaRef);
  if (!factura || factura.kind !== "factura" || factura.status !== "authorized") {
    throw new ArcaEmitError("No se encontró la factura autorizada a anular", 404);
  }
  if (factura.anulada) throw new ArcaEmitError("La factura ya está anulada por notas de crédito");

  const restante = round2(factura.impTotal - (Number(factura.ncTotal) || 0));
  const monto = input.monto != null && Number(input.monto) > 0 ? round2(Number(input.monto)) : restante;
  if (monto <= 0) throw new ArcaEmitError("El monto de la nota de crédito tiene que ser mayor a cero");
  if (monto > restante + 0.009) {
    throw new ArcaEmitError(`El monto supera lo que queda de la factura (${restante.toLocaleString("es-AR")})`);
  }
  const total = Math.abs(monto - restante) < 0.01 && !(Number(factura.ncTotal) > 0);

  const client = await getArcaClient().catch((e) => {
    throw new ArcaEmitError(e instanceof Error ? e.message : String(e), 412);
  });
  if (client.ctx.environment !== factura.environment) {
    throw new ArcaEmitError("La factura se emitió en otro ambiente de ARCA (homologación/producción)");
  }

  const facturaLabel = `${cbteTipoLabel(factura.cbteTipo)} ${factura.numeroFormateado}`;
  const motivo = String(input.motivo || "").trim();
  const items = total
    ? factura.items
    : buildSingleItem(motivo || `Ajuste s/ ${facturaLabel}`, monto);
  const { neto, iva } = total ? { neto: factura.impNeto, iva: factura.impIVA } : splitIva(monto);
  const linked = await loadLinkedDocs(db, { orderId: factura.orderId, saleId: factura.saleId });

  const base: TEmitCommon["base"] = {
    id: requestId,
    environment: factura.environment,
    kind: "nc",
    letra: factura.letra,
    cbteTipo: cbteTipoFor(factura.letra, "nc"),
    puntoVenta: client.ctx.puntoVenta,
    fecha: todayAR(),
    emisor: client.ctx.emisor,
    receptor: factura.receptor,
    alcance: total ? "total" : "libre",
    items,
    impNeto: neto,
    impIVA: iva,
    impTotal: monto,
    iva: [{ id: IVA_21.id, baseImp: neto, importe: iva }],
    leyendas: factura.leyendas || [],
    orderId: linked.order?.id ?? factura.orderId ?? null,
    saleId: linked.sale?.id ?? factura.saleId ?? null,
    clientId: factura.clientId ?? null,
    documentNumber: factura.documentNumber ?? null,
    facturaAsociadaId: factura.id,
    facturaAsociadaNumero: factura.numeroFormateado ?? null,
    facturaAsociadaCbteTipo: factura.cbteTipo,
    createdBy: uid,
  };

  return runEmission({
    db,
    client,
    ref,
    base,
    cbtesAsoc: [
      {
        Tipo: factura.cbteTipo,
        PtoVta: factura.puntoVenta,
        Nro: Number(factura.numero),
        Cuit: client.ctx.cuit,
        CbteFch: factura.fecha.replace(/-/g, ""),
      },
    ],
    onAuthorized: async (nc) => {
      const entry = facturaEntry(nc);
      await db.runTransaction(async (tx) => {
        const fSnap = await tx.get(facturaRef);
        const orderSnap = linked.orderRef ? await tx.get(linked.orderRef) : null;
        const saleSnap = linked.saleRef ? await tx.get(linked.saleRef) : null;
        const ncTotal = round2((Number(fSnap.data()?.ncTotal) || 0) + nc.impTotal);
        const anulada = ncTotal >= factura.impTotal - 0.009;
        tx.update(facturaRef, {
          ncIds: FieldValue.arrayUnion(nc.id),
          ncTotal,
          anulada,
          updatedAt: new Date().toISOString(),
        });
        if (orderSnap?.exists) {
          const order = { id: orderSnap.id, ...orderSnap.data() } as TSourceDoc;
          tx.update(orderSnap.ref, {
            ...invoicedFields(order, entry),
            // Anulada del todo: sus pagos vuelven a quedar disponibles para facturar.
            ...(anulada ? markPayments(order, null, { releaseInvoiceId: factura.id }) : {}),
          });
        }
        if (saleSnap?.exists) {
          const sale = { id: saleSnap.id, ...saleSnap.data() } as TSourceDoc;
          tx.update(saleSnap.ref, invoicedFields(sale, entry));
        }
      });
    },
  });
}
