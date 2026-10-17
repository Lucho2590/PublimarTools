import { Firestore, doc, getDoc } from "firebase/firestore";
import collections from "@/lib/collections";
import { EClientSection, TClient } from "@/types/client";
import { isDeleted } from "@/lib/softDelete";
import { buildChanges, generateCorrelationId } from "@/lib/auditLog";
import {
  EAuditAction,
  EAuditEntityType,
  EAuditSection,
} from "@/types/auditLog";
import {
  buildOrderClientUpdate,
  buildQuoteClientSnapshot,
  buildSaleClientUpdate,
  createBatcher,
  findCreditNotesAppliedTo,
  findQuoteClientImpact,
  findSalesForOrders,
  reassignQuoteClient,
  type LogEventFn,
  type TImpactCreditNote,
  type TImpactSale,
  type TQuoteClientImpact,
  type TQuoteClientSnapshot,
} from "@/lib/quoteClient";

/** Lo mínimo que hace falta saber de la orden para reasignarle el cliente. */
export type TOrderClientRef = {
  id: string;
  number: string;
  quoteId?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  /** `order.client` en formato viejo (objeto embebido). */
  hasClientObject: boolean;
};

export type TQuoteForOrder = {
  id: string;
  number: string;
  client: TQuoteClientSnapshot | null;
};

/**
 * Impacto de cambiar el cliente de una orden.
 *
 * Si la orden viene de un presupuesto vivo, el cambio se hace sobre el
 * presupuesto (y de ahí baja a todas sus órdenes, ventas y facturaciones), así
 * que el impacto es el del presupuesto. Si no, sólo la orden y sus ventas.
 */
export type TOrderClientImpact =
  | {
      kind: "quote";
      quote: TQuoteForOrder;
      impact: TQuoteClientImpact;
      creditNotes: TImpactCreditNote[];
    }
  | {
      kind: "order";
      sales: TImpactSale[];
      creditNotes: TImpactCreditNote[];
    };

export const EMPTY_ORDER_IMPACT: TOrderClientImpact = {
  kind: "order",
  sales: [],
  creditNotes: [],
};

/** Presupuesto de origen de la orden, o `null` si no existe o está borrado. */
export async function fetchQuoteForOrder(
  firestore: Firestore,
  quoteId: string,
): Promise<TQuoteForOrder | null> {
  const snap = await getDoc(doc(firestore, collections.QUOTES, quoteId));
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  if (isDeleted(data)) return null;
  return {
    id: snap.id,
    number: data.number ?? "S/N",
    client: (data.client as TQuoteClientSnapshot) ?? null,
  };
}

/**
 * Descubre qué documentos se verán afectados. Sólo lee; el resultado se muestra
 * al usuario y después se pasa tal cual a `reassignOrderClient`.
 */
export async function findOrderClientImpact(
  firestore: Firestore,
  order: Pick<TOrderClientRef, "id" | "quoteId" | "number" | "hasClientObject">,
): Promise<TOrderClientImpact> {
  const ownCreditNotes = await findCreditNotesAppliedTo(firestore, order.id);

  const quote = order.quoteId
    ? await fetchQuoteForOrder(firestore, order.quoteId)
    : null;

  if (!quote) {
    const sales = await findSalesForOrders(firestore, [order.id]);
    return { kind: "order", sales, creditNotes: ownCreditNotes };
  }

  const impact = await findQuoteClientImpact(firestore, quote.id);

  // Merge defensivo: la orden actual debería estar en `impact.orders` (se
  // busca por `quoteId`), pero si no está por datos inconsistentes se agrega
  // igual, con sus ventas, para que el cambio no la saltee.
  if (!impact.orders.some((o) => o.id === order.id)) {
    const sales = await findSalesForOrders(firestore, [order.id]);
    impact.orders.push({
      id: order.id,
      number: order.number,
      hasClientObject: order.hasClientObject,
    });
    impact.sales.push(...sales);
  }

  const seen = new Set(impact.creditNotes.map((n) => n.id));
  const creditNotes = [
    ...impact.creditNotes,
    ...ownCreditNotes.filter((n) => !seen.has(n.id)),
  ];

  return { kind: "quote", quote, impact, creditNotes };
}

export type ReassignOrderClientInput = {
  order: TOrderClientRef;
  newClient: TClient;
  /** El mismo impacto que se le mostró al usuario en el diálogo. */
  impact: TOrderClientImpact;
};

/**
 * Reasigna el cliente de una orden.
 *
 * Con presupuesto de origen delega en `reassignQuoteClient` (que ya escribe el
 * presupuesto, todas sus órdenes, ventas y facturaciones, y audita todo con un
 * correlationId). Sin presupuesto escribe la orden y sus ventas con el mismo
 * `writeBatch` y el mismo criterio: no se pisan `cuit`/`direccion`/`telefono`/
 * `email`/`reference` ni `tempClientData`, que son datos cargados a mano.
 */
export async function reassignOrderClient(
  firestore: Firestore,
  logEvent: LogEventFn,
  input: ReassignOrderClientInput,
): Promise<void> {
  const { order, newClient, impact } = input;

  if (impact.kind === "quote") {
    await reassignQuoteClient(firestore, logEvent, {
      quoteId: impact.quote.id,
      quoteNumber: impact.quote.number,
      previousClient: impact.quote.client,
      newClient,
      impact: impact.impact,
      origin: { orderId: order.id, orderNumber: order.number },
    });
    return;
  }

  const snapshot = buildQuoteClientSnapshot(newClient, EClientSection.BANDERAS);
  const { push, flush } = createBatcher(firestore);

  await push((b) =>
    b.update(
      doc(firestore, collections.ORDERS, order.id),
      buildOrderClientUpdate(snapshot, order.hasClientObject),
    ),
  );

  for (const sale of impact.sales) {
    await push((b) =>
      b.update(
        doc(firestore, collections.SALES, sale.id),
        buildSaleClientUpdate(snapshot, sale.clientFieldShape),
      ),
    );
  }

  await flush();

  const correlationId = generateCorrelationId();
  const previousName = order.clientName || "sin cliente";

  await logEvent({
    section: EAuditSection.BANDERAS_CLIENTES,
    entityType: EAuditEntityType.ORDER,
    entityId: order.id,
    entityLabel: order.number,
    action: EAuditAction.UPDATE,
    description: `Cambió el cliente de la orden ${order.number} de "${previousName}" a "${snapshot.name}"`,
    changes: buildChanges(
      { clientId: order.clientId ?? null, clientName: order.clientName ?? null },
      { clientId: snapshot.id, clientName: snapshot.name },
      ["clientId", "clientName"],
    ),
    correlationId,
    metadata: {
      saleIds: impact.sales.map((s) => s.id),
      saleNumbers: impact.sales.map((s) => s.number),
    },
  });

  for (const sale of impact.sales) {
    await logEvent({
      section: EAuditSection.BANDERAS_VENTAS,
      entityType: EAuditEntityType.SALE,
      entityId: sale.id,
      entityLabel: sale.number,
      action: EAuditAction.UPDATE,
      description: `Reasignó la venta ${sale.number} a "${snapshot.name}" por cambio de cliente de la orden ${order.number}`,
      correlationId,
    });
  }
}
