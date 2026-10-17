import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import collections from "@/lib/collections";
import { EClientSection, EClientStatus, EClientType, TClient } from "@/types/client";
import { TQuote } from "@/types/quote";
import { filterActive } from "@/lib/softDelete";
import {
  buildChanges,
  generateCorrelationId,
  TAuditInput,
} from "@/lib/auditLog";
import {
  EAuditAction,
  EAuditEntityType,
  EAuditSection,
} from "@/types/auditLog";

/**
 * Firestore permite hasta 500 operaciones por batch; dejamos margen igual que
 * `priceHistory.ts`.
 */
const BATCH_SIZE = 450;

export type LogEventFn = (entry: TAuditInput) => Promise<unknown>;

/** Snapshot plano del cliente tal como se guarda dentro de un presupuesto. */
export type TQuoteClientSnapshot = TQuote["client"];

export const SECTION_LABELS: Record<string, string> = {
  [EClientSection.BANDERAS]: "Banderas",
  [EClientSection.VIA_PUBLICA]: "Vía Pública",
};

export function sectionLabel(section: string | undefined | null): string {
  if (!section) return "Sin sección";
  return SECTION_LABELS[section] ?? section;
}

/**
 * Construye el snapshot canónico del cliente que se embebe en `quotes.client`.
 *
 * En la base conviven cuatro formas distintas de este objeto según qué pantalla
 * creó el presupuesto (el alta de Banderas guarda 14 campos, la de Vía Pública
 * 5, el bot de WhatsApp 3 y el modal guardaba el doc entero de Firestore).
 * Toda escritura nueva pasa por acá para que exista una sola forma.
 *
 * Nunca incluye `ref`: es un `DocumentReference` y Firestore lo guardaría como
 * referencia viva en vez de dato plano.
 */
export function buildQuoteClientSnapshot(
  client: TClient,
  /**
   * Sección a usar si el cliente no tiene una. Sin esto el presupuesto se
   * quedaría sin `client.section` y desaparecería de los dos listados, que es
   * justo lo que le pasa hoy a los presupuestos que crea el bot de WhatsApp.
   */
  fallbackSection?: EClientSection,
): TQuoteClientSnapshot {
  return {
    id: client.id ?? "",
    name: client.name ?? "",
    // Los clientes viejos pueden no tener estos campos, y Firestore rechaza
    // `undefined` en un update.
    type: client.type ?? EClientType.INDIVIDUAL,
    status: client.status ?? EClientStatus.ACTIVE,
    section: client.section ?? fallbackSection ?? null,
    email: client.email ?? "",
    phone: client.phone ?? "",
    address: client.address ?? "",
    cuit: client.cuit ?? "",
    taxCondition: client.taxCondition ?? null,
    reference: client.reference ?? "",
    notes: client.notes ?? "",
    contacts: client.contacts ?? [],
    createdAt: client.createdAt ?? null,
    updatedAt: client.updatedAt ?? null,
  } as TQuoteClientSnapshot;
}

export type TImpactOrder = { id: string; number: string; hasClientObject: boolean };
export type TImpactSale = {
  id: string;
  number: string;
  orderId: string;
  /** Forma en la que el doc guarda `client`: hay ventas con un string ahí. */
  clientFieldShape: "object" | "string" | "absent";
};
export type TImpactBilling = { id: string; number: string; totalPaid: number };
export type TImpactCreditNote = { id: string; number: string; clientName: string };

export type TQuoteClientImpact = {
  orders: TImpactOrder[];
  sales: TImpactSale[];
  billings: TImpactBilling[];
  /** Sólo informativo: las notas de crédito NO se reasignan. */
  creditNotes: TImpactCreditNote[];
};

export const EMPTY_IMPACT: TQuoteClientImpact = {
  orders: [],
  sales: [],
  billings: [],
  creditNotes: [],
};

export function impactIsEmpty(impact: TQuoteClientImpact): boolean {
  return (
    impact.orders.length === 0 &&
    impact.sales.length === 0 &&
    impact.billings.length === 0
  );
}

/**
 * Acumula escrituras y las commitea en batches de `BATCH_SIZE`. Compartido con
 * `orderClient.ts`.
 */
export function createBatcher(firestore: Firestore) {
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
  return { push, flush };
}

/**
 * Ventas generadas desde cada una de las órdenes dadas. Se consulta orden por
 * orden en vez de con un `where in`: no hay tope de 30 valores y son todas
 * consultas de índice simple.
 */
export async function findSalesForOrders(
  firestore: Firestore,
  orderIds: string[],
): Promise<TImpactSale[]> {
  const salesByOrder = await Promise.all(
    orderIds.map(async (orderId) => {
      const snap = await getDocs(
        query(collection(firestore, collections.SALES), where("orderId", "==", orderId)),
      );
      return filterActive(
        snap.docs.map((d) => ({ ...(d.data() as any), id: d.id })),
      ).map((data: any): TImpactSale => {
        const raw = data.client;
        return {
          id: data.id,
          number: data.number ?? "S/N",
          orderId,
          clientFieldShape:
            raw === undefined || raw === null
              ? "absent"
              : typeof raw === "string"
                ? "string"
                : "object",
        };
      });
    }),
  );
  return salesByOrder.flat();
}

/** Notas de crédito aplicadas a un documento (sólo informativo, no se reasignan). */
export async function findCreditNotesAppliedTo(
  firestore: Firestore,
  documentId: string,
): Promise<TImpactCreditNote[]> {
  const snap = await getDocs(
    query(
      collection(firestore, collections.CREDIT_NOTES),
      where("appliedToDocumentId", "==", documentId),
    ),
  );
  return filterActive(
    snap.docs.map((d) => ({ ...(d.data() as any), id: d.id })),
  ).map((data: any) => ({
    id: data.id,
    number: data.number ?? "S/N",
    clientName: data.clientName ?? "",
  }));
}

/**
 * Campos a actualizar en una orden al reasignarle el cliente. Sólo se toca
 * `client` si la orden ya lo tenía como objeto (formato viejo). No se pisan
 * `cuit`/`direccion`/`telefono`/`email`: son editables a mano desde la orden.
 */
export function buildOrderClientUpdate(
  snapshot: TQuoteClientSnapshot,
  hasClientObject: boolean,
): Record<string, any> {
  const data: Record<string, any> = {
    clientId: snapshot.id,
    clientName: snapshot.name,
    updatedAt: serverTimestamp(),
  };
  if (hasClientObject) data.client = snapshot;
  return data;
}

/**
 * Campos a actualizar en una venta al reasignarle el cliente.
 *
 * Al convertir orden→venta se guarda `client: order.clientId`, un string. La
 * ficha de cliente compensa ese bug con `where("client","==",clientId)`, así
 * que hay que conservar la forma del campo o esa query deja de matchear.
 */
export function buildSaleClientUpdate(
  snapshot: TQuoteClientSnapshot,
  clientFieldShape: TImpactSale["clientFieldShape"],
): Record<string, any> {
  const data: Record<string, any> = {
    clientId: snapshot.id,
    clientName: snapshot.name,
    updatedAt: serverTimestamp(),
  };
  if (clientFieldShape === "string") data.client = snapshot.id;
  else if (clientFieldShape === "object") data.client = snapshot;
  return data;
}

/**
 * Descubre todos los documentos que heredaron el cliente de este presupuesto.
 *
 * Sólo lee. El resultado se le muestra al usuario antes de confirmar y después
 * se le pasa tal cual a `reassignQuoteClient`, así lo que se escribe es
 * exactamente lo que se mostró.
 */
export async function findQuoteClientImpact(
  firestore: Firestore,
  quoteId: string,
): Promise<TQuoteClientImpact> {
  const ordersSnap = await getDocs(
    query(collection(firestore, collections.ORDERS), where("quoteId", "==", quoteId)),
  );
  const orders: TImpactOrder[] = filterActive(
    ordersSnap.docs.map((d) => ({ ...(d.data() as any), id: d.id })),
  ).map((data: any) => ({
    id: data.id,
    number: data.number ?? "S/N",
    hasClientObject: !!data.client && typeof data.client === "object",
  }));

  const sales = await findSalesForOrders(
    firestore,
    orders.map((o) => o.id),
  );

  const billingsSnap = await getDocs(
    query(collection(firestore, collections.BILLINGS), where("quoteId", "==", quoteId)),
  );
  const billings: TImpactBilling[] = filterActive(
    billingsSnap.docs.map((d) => ({ ...(d.data() as any), id: d.id })),
  ).map((data: any) => ({
    id: data.id,
    number: data.number ?? "S/N",
    totalPaid: Number(data.totalPaid) || 0,
  }));

  // Las notas de crédito no se reasignan: sólo se listan para que el usuario
  // sepa que quedaron apuntando al cliente anterior.
  const creditNotes = await findCreditNotesAppliedTo(firestore, quoteId);

  return { orders, sales, billings, creditNotes };
}

export type ReassignQuoteClientInput = {
  quoteId: string;
  quoteNumber: string;
  previousClient: TQuoteClientSnapshot | null | undefined;
  newClient: TClient;
  /** El mismo impacto que se le mostró al usuario en el diálogo. */
  impact: TQuoteClientImpact;
  /**
   * Orden desde la que se disparó el cambio, cuando viene de la pantalla de
   * una orden y no del presupuesto. Sólo afecta la auditoría.
   */
  origin?: { orderId: string; orderNumber: string };
};

export function auditSectionFor(section: string | undefined | null): EAuditSection {
  return section === EClientSection.VIA_PUBLICA
    ? EAuditSection.VIA_PUBLICA
    : EAuditSection.BANDERAS_CLIENTES;
}

/**
 * Reasigna el cliente de un presupuesto y propaga el cambio a los documentos
 * que copiaron ese cliente al crearse.
 *
 * Se usa `writeBatch` y no `runTransaction` porque hay que hacer queries para
 * descubrir los derivados y una transacción de Firestore no las admite. El
 * batch igual aplica todas las escrituras de una.
 *
 * No se pisan `cuit`/`direccion`/`telefono`/`email` de órdenes y ventas: esos
 * campos son editables a mano desde la orden y suelen tener datos de
 * facturación propios de ese documento.
 */
export async function reassignQuoteClient(
  firestore: Firestore,
  logEvent: LogEventFn,
  input: ReassignQuoteClientInput,
): Promise<void> {
  const { quoteId, quoteNumber, previousClient, newClient, impact, origin } = input;

  const snapshot = buildQuoteClientSnapshot(newClient, previousClient?.section);

  const { push, flush } = createBatcher(firestore);

  // 1. El presupuesto.
  await push((b) =>
    b.update(doc(firestore, collections.QUOTES, quoteId), {
      client: snapshot,
      updatedAt: serverTimestamp(),
    }),
  );

  // 2. Órdenes generadas desde este presupuesto.
  for (const order of impact.orders) {
    await push((b) =>
      b.update(
        doc(firestore, collections.ORDERS, order.id),
        buildOrderClientUpdate(snapshot, order.hasClientObject),
      ),
    );
  }

  // 3. Ventas de esas órdenes.
  for (const sale of impact.sales) {
    await push((b) =>
      b.update(
        doc(firestore, collections.SALES, sale.id),
        buildSaleClientUpdate(snapshot, sale.clientFieldShape),
      ),
    );
  }

  // 4. Facturaciones de Vía Pública. Sólo el snapshot del cliente: el saldo,
  //    los pagos y el estado no dependen de a quién se le factura.
  for (const billing of impact.billings) {
    await push((b) =>
      b.update(doc(firestore, collections.BILLINGS, billing.id), {
        client: {
          id: snapshot.id,
          name: snapshot.name,
          section: snapshot.section ?? "",
          cuit: snapshot.cuit || null,
          phone: snapshot.phone || null,
          email: snapshot.email || null,
          address: snapshot.address || null,
        },
        updatedAt: serverTimestamp(),
      }),
    );
  }

  await flush();

  // 5. Auditoría: una entrada por documento afectado, todas correlacionadas.
  const correlationId = generateCorrelationId();
  const section = auditSectionFor(previousClient?.section);
  const previousName = previousClient?.name || "sin cliente";
  const movedSection =
    !!previousClient?.section && previousClient.section !== newClient.section;
  const sectionNote = movedSection
    ? ` (movido de ${sectionLabel(previousClient?.section)} a ${sectionLabel(newClient.section)})`
    : "";
  const originNote = origin ? ` (desde la orden ${origin.orderNumber})` : "";

  await logEvent({
    section,
    entityType: EAuditEntityType.QUOTE,
    entityId: quoteId,
    entityLabel: quoteNumber,
    action: EAuditAction.UPDATE,
    description:
      `Cambió el cliente del presupuesto ${quoteNumber} de "${previousName}" a "${snapshot.name}"${sectionNote}${originNote}`,
    // Se auditan escalares y no el objeto `client` entero a propósito:
    // `sanitizeValue` reemplaza por `{_truncated: true}` cualquier objeto de más
    // de 1024 bytes, y un cliente con contactos lo supera — el diff quedaría
    // vacío justo en el dato que importa.
    changes: buildChanges(
      {
        clientId: previousClient?.id ?? null,
        clientName: previousClient?.name ?? null,
        clientSection: previousClient?.section ?? null,
        clientCuit: previousClient?.cuit ?? null,
      },
      {
        clientId: snapshot.id,
        clientName: snapshot.name,
        clientSection: snapshot.section ?? null,
        clientCuit: snapshot.cuit ?? null,
      },
      ["clientId", "clientName", "clientSection", "clientCuit"],
    ),
    correlationId,
    metadata: {
      orderIds: impact.orders.map((o) => o.id),
      orderNumbers: impact.orders.map((o) => o.number),
      saleIds: impact.sales.map((s) => s.id),
      saleNumbers: impact.sales.map((s) => s.number),
      billingIds: impact.billings.map((b) => b.id),
      billingNumbers: impact.billings.map((b) => b.number),
      ...(origin
        ? { originOrderId: origin.orderId, originOrderNumber: origin.orderNumber }
        : {}),
    },
  });

  for (const order of impact.orders) {
    await logEvent({
      section,
      entityType: EAuditEntityType.ORDER,
      entityId: order.id,
      entityLabel: order.number,
      action: EAuditAction.UPDATE,
      description:
        `Reasignó la orden ${order.number} a "${snapshot.name}" por cambio de cliente del presupuesto ${quoteNumber}`,
      correlationId,
    });
  }

  for (const sale of impact.sales) {
    await logEvent({
      section:
        section === EAuditSection.VIA_PUBLICA
          ? EAuditSection.VIA_PUBLICA
          : EAuditSection.BANDERAS_VENTAS,
      entityType: EAuditEntityType.SALE,
      entityId: sale.id,
      entityLabel: sale.number,
      action: EAuditAction.UPDATE,
      description:
        `Reasignó la venta ${sale.number} a "${snapshot.name}" por cambio de cliente del presupuesto ${quoteNumber}`,
      correlationId,
    });
  }
}

/** Trae el `TClient` vivo desde `clients` (el selector devuelve sólo el id). */
export async function fetchClientById(
  firestore: Firestore,
  clientId: string,
): Promise<TClient | null> {
  const snap = await getDoc(doc(firestore, collections.CLIENTS, clientId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) } as TClient;
}
