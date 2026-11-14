"use client";

// Pedidos que cerró el agente de WhatsApp. El agente NO crea órdenes ni ventas:
// le pasa el pedido al equipo, que lo toma y lo procesa como siempre.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, doc, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { CheckCircle2, ClipboardCheck, Inbox, MessageSquare, Palette, ShoppingBag, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { TablePagination } from "@/components/admin/TablePagination";
import collections from "@/lib/collections";
import { cn, formatearPrecio } from "@/lib/utils";
import { ClientTagBadge, useClientTagOptions } from "@/components/client/ClientTags";
import { EWhatsappOrderStatus, TWhatsappOrder } from "@/types/whatsapp";

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Etiquetas del equipo; los valores guardados no cambian.
const STATUS: Record<string, { label: string; className: string }> = {
  [EWhatsappOrderStatus.PENDING]: { label: "Nuevo", className: "bg-amber-100 text-amber-800 border-amber-200" },
  [EWhatsappOrderStatus.CONFIRMED]: { label: "Tomado", className: "bg-green-100 text-green-800 border-green-200" },
  [EWhatsappOrderStatus.CANCELLED]: { label: "Cancelado", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

const FILTERS = [
  { id: "pending", label: "Nuevos" },
  { id: "confirmed", label: "Tomados" },
  { id: "cancelled", label: "Cancelados" },
  { id: "all", label: "Todos" },
];

function deliveryLabel(o: TWhatsappOrder): string | null {
  if (!o.delivery) return null;
  if (o.delivery.method === "pickup") return "Retira en el local";
  if (o.delivery.method === "courier") return `Mensajero${o.delivery.place ? ` (${o.delivery.place})` : ""}`;
  return `Envío${[o.delivery.address, o.delivery.place].filter(Boolean).length ? `: ${[o.delivery.address, o.delivery.place].filter(Boolean).join(", ")}` : ""}`;
}

const who = (o: TWhatsappOrder) => o.customerName || o.clientName || (o.phone ? `+${o.phone}` : "Cliente");

export default function WhatsappPedidosPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const params = useSearchParams();
  const tagOptions = useClientTagOptions();
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("pending");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const ordersQuery = useMemo(
    () => query(collection(firestore, collections.WHATSAPP_ORDERS), orderBy("createdAt", "desc")),
    [firestore]
  );
  const { status, data } = useFirestoreCollectionData(ordersQuery, { idField: "id" });
  const orders = useMemo(() => (data as TWhatsappOrder[] | undefined) || [], [data]);

  const counts = useMemo(() => {
    const c = { pending: 0, confirmed: 0, cancelled: 0 } as Record<string, number>;
    for (const o of orders) c[o.status] = (c[o.status] || 0) + 1;
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return orders.filter(
      (o) =>
        (filter === "all" || o.status === filter) &&
        (!q ||
          o.orderNumber?.toLowerCase().includes(q) ||
          who(o).toLowerCase().includes(q) ||
          o.phone?.includes(q))
    );
  }, [orders, searchTerm, filter]);

  useEffect(() => setCurrentPage(1), [searchTerm, filter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // ?p=<id>: lo abre el cartel "Ver pedido".
  const openId = params.get("p");
  const selected = openId ? orders.find((o) => o.id === openId) || null : null;
  const open = (id: string | null) =>
    router.replace(id ? `/publimar/whatsapp/pedidos?p=${encodeURIComponent(id)}` : "/publimar/whatsapp/pedidos", {
      scroll: false,
    } as any);

  const setStatus = async (o: TWhatsappOrder, value: EWhatsappOrderStatus) => {
    await updateDoc(doc(firestore, collections.WHATSAPP_ORDERS, o.id), { status: value, updatedAt: serverTimestamp() });
    toast.success(value === EWhatsappOrderStatus.CONFIRMED ? `Tomaste el pedido ${o.orderNumber}` : `Pedido ${o.orderNumber}: ${STATUS[value].label}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pedidos de WhatsApp</h1>
        <p className="text-sm text-slate-600">
          Lo que vendió el agente. Tomá el pedido, coordiná con el cliente y armá la orden o la venta como siempre.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          title="Nuevos (sin tomar)"
          variant="amber"
          icon={Inbox}
          value={status === "loading" ? <Skeleton className="h-8 w-12" /> : counts.pending}
          onClick={() => setFilter("pending")}
          className="cursor-pointer"
        />
        <SummaryCard
          title="Tomados"
          variant="green"
          icon={ClipboardCheck}
          value={status === "loading" ? <Skeleton className="h-8 w-12" /> : counts.confirmed}
          onClick={() => setFilter("confirmed")}
          className="cursor-pointer"
        />
        <SummaryCard
          title="Cancelados"
          variant="slate"
          icon={XCircle}
          value={status === "loading" ? <Skeleton className="h-8 w-12" /> : counts.cancelled}
          onClick={() => setFilter("cancelled")}
          className="cursor-pointer"
        />
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input
              placeholder="Buscar por número, cliente o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="md:max-w-sm"
            />
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "px-3 py-1 rounded-full text-sm border transition-colors",
                    filter === f.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  {f.label}
                  {f.id !== "all" ? ` ${counts[f.id] || 0}` : ""}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            {status === "loading" ? (
              [...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : pageItems.length === 0 ? (
              <p className="text-center py-10 text-sm text-slate-500">
                {filter === "pending" ? "No hay pedidos nuevos 🎉" : "No hay pedidos para mostrar"}
              </p>
            ) : (
              pageItems.map((o) => {
                const custom = o.kind === "custom_quote";
                const st = STATUS[o.status] || { label: o.status, className: "" };
                const date = toDate(o.createdAt);
                const Icon = custom ? Palette : ShoppingBag;
                const meta = [
                  o.orderNumber,
                  custom
                    ? [o.customDetails?.technique, o.customDetails?.quantity && `${o.customDetails.quantity} u.`].filter(Boolean).join(" · ")
                    : `${o.items?.reduce((n, i) => n + (i.quantity || 0), 0) || 0} u.`,
                  deliveryLabel(o),
                  date?.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
                ].filter(Boolean);
                return (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => open(o.id)}
                    className="w-full text-left flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", custom ? "bg-purple-50" : "bg-blue-50")}>
                      <Icon className={cn("h-4 w-4", custom ? "text-purple-600" : "text-blue-600")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {who(o)}
                        {custom && <span className="ml-2 text-xs font-normal text-purple-700">Personalizada a cotizar</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{meta.join(" · ")}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-medium tabular-nums">
                        {o.total > 0 ? `${custom ? "≈ " : ""}${formatearPrecio(o.total)}` : "A cotizar"}
                      </span>
                      <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium border", st.className)}>{st.label}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {filtered.length > itemsPerPage && (
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filtered.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(n) => {
                setItemsPerPage(n);
                setCurrentPage(1);
              }}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(v) => !v && open(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <OrderDetail order={selected} tagOptions={tagOptions} onStatus={(v) => setStatus(selected, v)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderDetail({
  order: o,
  tagOptions,
  onStatus,
}: {
  order: TWhatsappOrder;
  tagOptions: ReturnType<typeof useClientTagOptions>;
  onStatus: (v: EWhatsappOrderStatus) => void;
}) {
  const custom = o.kind === "custom_quote";
  const st = STATUS[o.status] || { label: o.status, className: "" };
  const date = toDate(o.createdAt);
  const d = o.customDetails;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {custom ? "🎨 Personalizada a cotizar" : "🛒 Pedido"} {o.orderNumber}
          <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium border", st.className)}>{st.label}</span>
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 text-sm">
        <div className="space-y-1">
          <p className="font-medium">{who(o)}</p>
          <p className="text-slate-600">{o.phone ? `+${o.phone}` : "Sin teléfono"}</p>
          {o.customerSegment && <ClientTagBadge id={o.customerSegment} options={tagOptions} />}
          {deliveryLabel(o) && <p className="text-slate-600">Entrega: {deliveryLabel(o)}</p>}
          {date && <p className="text-xs text-slate-500">{date.toLocaleString("es-AR")}</p>}
        </div>

        {custom && d ? (
          <div className="rounded-lg border bg-purple-50/50 p-3 space-y-1">
            <p>
              <span className="text-slate-500">Técnica:</span> {d.technique}
            </p>
            {d.quantity != null && (
              <p>
                <span className="text-slate-500">Cantidad:</span> {d.quantity}
              </p>
            )}
            {d.size && (
              <p>
                <span className="text-slate-500">Medida:</span> {d.size}
              </p>
            )}
            <p>
              <span className="text-slate-500">Para:</span> {d.whenText || "sin apuro"}
              {d.tight ? " ⚠️ justo" : ""}
              {d.leadTime ? ` (${d.leadTime})` : ""}
            </p>
            {d.design && (
              <p>
                <span className="text-slate-500">Diseño:</span> {d.design}
              </p>
            )}
            <p className="font-medium pt-1">
              {o.total > 0 ? `Estimado: ${formatearPrecio(o.total)}` : "El equipo tiene que cotizarla"}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border divide-y">
            {(o.items || []).map((i, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 p-2">
                <span className="min-w-0">
                  {i.quantity} × {i.productName}
                  {i.variantName ? <span className="text-slate-500"> · {i.variantName}</span> : null}
                </span>
                <span className="tabular-nums shrink-0">{formatearPrecio(i.subtotal ?? i.unitPrice * i.quantity)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between p-2 font-medium">
              <span>Total</span>
              <span className="tabular-nums">{formatearPrecio(o.total || 0)}</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {o.phone && (
            <Button variant="outline" asChild>
              <Link href={`/publimar/whatsapp/chat?c=${encodeURIComponent(o.phone)}`}>
                <MessageSquare className="h-4 w-4 mr-1" /> Abrir charla
              </Link>
            </Button>
          )}
          {o.status === EWhatsappOrderStatus.PENDING && (
            <Button onClick={() => onStatus(EWhatsappOrderStatus.CONFIRMED)}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Marcar como tomado
            </Button>
          )}
          {o.status !== EWhatsappOrderStatus.PENDING && (
            <Button variant="outline" onClick={() => onStatus(EWhatsappOrderStatus.PENDING)}>
              Volver a nuevo
            </Button>
          )}
          {o.status !== EWhatsappOrderStatus.CANCELLED && (
            <Button variant="ghost" className="text-red-600" onClick={() => onStatus(EWhatsappOrderStatus.CANCELLED)}>
              Cancelar pedido
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
