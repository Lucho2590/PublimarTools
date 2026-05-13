"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useFirestore,
  useFirestoreCollectionData,
  useFirestoreDocData,
} from "reactfire";
import {
  doc,
  collection,
  query,
  where,
} from "firebase/firestore";
import { softDelete } from "@/lib/softDelete";
import { formatCuit } from "@/lib/cuit";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import collections from "@/lib/collections";
import {
  EClientType,
  EClientSection,
  EClientTaxCondition,
  TClient,
  TClientContact,
} from "@/types/client";
import { useAuditLog } from "@/hooks/useAuditLog";
import { EAuditAction, EAuditEntityType, EAuditSection } from "@/types/auditLog";
import {
  formatDate,
  formatearPrecio,
  extractIdFromSlug,
  generateSlug,
  cn,
} from "@/lib/utils";
import { EOrderStatus } from "@/types/order";
import { EPaymentMethod } from "@/types/sale";
import {
  EyeIcon,
  Trash2,
  Pencil,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  StickyNote,
  Users,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { SaleDetailsModal } from "../../ventas/modalVentas/saleDetailsModal";
import { useClientAvailableCredit } from "@/hooks/useCreditNotes";
import { Wallet } from "lucide-react";

const taxConditionInfo: Record<
  EClientTaxCondition,
  { label: string; invoice: string; className: string }
> = {
  [EClientTaxCondition.IVA_INSCRIPTO]: {
    label: "IVA Inscripto",
    invoice: "Factura A",
    className: "bg-blue-50 text-blue-700 border border-blue-200",
  },
  [EClientTaxCondition.IVA_EXENTO]: {
    label: "IVA Exento",
    invoice: "Factura B",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  [EClientTaxCondition.IVA_NO_ALCANZADO]: {
    label: "IVA No Alcanzado",
    invoice: "Factura B",
    className: "bg-slate-50 text-slate-700 border border-slate-200",
  },
  [EClientTaxCondition.CONSUMIDOR_FINAL]: {
    label: "Consumidor Final",
    invoice: "Factura B",
    className: "bg-violet-50 text-violet-700 border border-violet-200",
  },
};

export default function ClienteDetallePage({
  params,
}: {
  params: { id: string };
}) {
  const firestore = useFirestore();
  const router = useRouter();
  const { logEvent } = useAuditLog();

  const clientId = extractIdFromSlug(params.id);

  const clientRef = doc(firestore, collections.CLIENTS, clientId);
  const { status, data: client } = useFirestoreDocData(clientRef, {
    idField: "id",
  });

  const { status: quotesStatus, data: quotes } = useFirestoreCollectionData(
    query(
      collection(firestore, collections.QUOTES),
      where("client.id", "==", clientId)
    ),
    { idField: "id" }
  );

  const { status: ordersStatus, data: orders } = useFirestoreCollectionData(
    query(
      collection(firestore, collections.ORDERS),
      where("clientId", "==", clientId)
    ),
    { idField: "id" }
  );

  const { status: salesStatus, data: sales } = useFirestoreCollectionData(
    query(
      collection(firestore, collections.SALES),
      where("clientId", "==", clientId)
    ),
    { idField: "id" }
  );

  const { status: salesStatus2, data: sales2 } = useFirestoreCollectionData(
    query(
      collection(firestore, collections.SALES),
      where("client", "==", clientId)
    ),
    { idField: "id" }
  );

  const activeSales = sales?.filter((s: any) => !s.deleted);
  const activeSales2 = sales2?.filter((s: any) => !s.deleted);

  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { total: availableCredit, notes: availableCreditNotes } =
    useClientAvailableCredit(clientId);

  const handleViewSale = (saleId: string) => {
    setSelectedSaleId(saleId);
    setIsSaleModalOpen(true);
  };

  const handleCloseSaleModal = () => {
    setIsSaleModalOpen(false);
    setSelectedSaleId(null);
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-2xl font-bold tracking-tight">
          Cliente no encontrado
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          El cliente que buscas no existe o ha sido eliminado.
        </p>
        <Button asChild className="mt-6">
          <Link href="/publimar/banderas/clientes">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Volver a clientes
          </Link>
        </Button>
      </div>
    );
  }

  const typedClient = client as TClient;
  const isCompany = typedClient.type === EClientType.COMPANY;
  const TypeIcon = isCompany ? Building2 : User;
  const typeLabel = isCompany ? "Empresa" : "Persona física";
  const tax = typedClient.taxCondition
    ? taxConditionInfo[typedClient.taxCondition]
    : null;

  const handleDeleteClient = async () => {
    setIsDeleting(true);
    try {
      await softDelete(firestore, collections.CLIENTS, clientId);
      await logEvent({
        section:
          typedClient.section === EClientSection.VIA_PUBLICA
            ? EAuditSection.VIA_PUBLICA
            : EAuditSection.BANDERAS_CLIENTES,
        entityType: EAuditEntityType.CLIENT,
        entityId: clientId,
        entityLabel: typedClient.name ?? null,
        action: EAuditAction.DELETE,
        description: `Eliminó el cliente ${typedClient.name ?? ""}`.trim(),
      });
      toast.success("Cliente eliminado correctamente");
      router.push("/publimar/banderas/clientes");
    } catch (error) {
      console.error("Error al eliminar cliente:", error);
      toast.error("Error al eliminar el cliente");
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const infoItem = (
    icon: React.ComponentType<{ className?: string }>,
    label: string,
    value?: React.ReactNode
  ) => {
    if (!value) return null;
    const Icon = icon;
    return (
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-slate-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium break-words">{value}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <TypeIcon className="h-5 w-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight truncate">
              {typedClient.name}
            </h1>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <span className="text-sm text-muted-foreground">{typeLabel}</span>
              {tax && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap",
                      tax.className
                    )}
                  >
                    {tax.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tax.invoice}
                  </span>
                </>
              )}
              {!tax && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap bg-slate-50 text-slate-400 border border-dashed border-slate-200">
                    Sin condición fiscal
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            title="Eliminar cliente"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button asChild size="sm">
            <Link href={`/publimar/banderas/clientes/${clientId}/editar`}>
              <Pencil className="h-4 w-4 mr-1.5" />
              Editar
            </Link>
          </Button>
        </div>
      </div>

      {availableCredit > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-amber-800" />
                <div>
                  <p className="text-sm text-amber-900">Saldo a favor en notas de crédito</p>
                  <p className="text-xl font-bold text-amber-900">
                    {formatearPrecio(availableCredit)}
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/publimar/administracion/notas-credito?clientId=${clientId}`}
                >
                  Ver {availableCreditNotes.length} nota
                  {availableCreditNotes.length === 1 ? "" : "s"}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="presupuestos">Presupuestos</TabsTrigger>
          <TabsTrigger value="ordenes">Órdenes</TabsTrigger>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Información general
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isCompany &&
                  infoItem(FileText, "Razón Social", typedClient.businessName)}
                {isCompany &&
                  infoItem(
                    FileText,
                    "Nombre de Fantasía",
                    typedClient.fantasyName
                  )}
                {infoItem(
                  FileText,
                  isCompany ? "CUIT" : "CUIT / CUIL",
                  formatCuit(typedClient.cuit) || undefined
                )}
                {infoItem(
                  FileText,
                  "Condición fiscal",
                  tax ? `${tax.label} · ${tax.invoice}` : undefined
                )}
                {infoItem(Mail, "Email", typedClient.email)}
                {infoItem(Phone, "Teléfono", typedClient.phone)}
                {infoItem(MapPin, "Dirección", typedClient.address)}
                {infoItem(FileText, "Referencia", typedClient.reference)}
                {typedClient.notes && (
                  <div className="md:col-span-2">
                    {infoItem(StickyNote, "Notas", typedClient.notes)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {typedClient.contacts && typedClient.contacts.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-500" />
                  Personas de contacto
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {typedClient.contacts.map(
                    (contact: TClientContact, index: number) => (
                      <div
                        key={index}
                        className="p-4 rounded-lg bg-slate-50 space-y-2"
                      >
                        <div>
                          <p className="text-sm font-semibold">
                            {contact.name || "-"}
                          </p>
                          {contact.position && (
                            <p className="text-xs text-muted-foreground">
                              {contact.position}
                            </p>
                          )}
                        </div>
                        {(contact.email || contact.phone) && (
                          <div className="space-y-1 pt-1 border-t border-slate-200">
                            {contact.email && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Mail className="h-3 w-3" />
                                {contact.email}
                              </p>
                            )}
                            {contact.phone && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Phone className="h-3 w-3" />
                                {contact.phone}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="presupuestos">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Presupuestos
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {quotesStatus === "loading" ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : quotes && quotes.length > 0 ? (
                <div className="space-y-2">
                  {quotes.map((quote) => {
                    const statusMap: Record<
                      string,
                      { label: string; className: string }
                    > = {
                      draft: {
                        label: "Borrador",
                        className:
                          "bg-slate-50 text-slate-700 border border-slate-200",
                      },
                      sent: {
                        label: "Enviado",
                        className:
                          "bg-blue-50 text-blue-700 border border-blue-200",
                      },
                      confirmed: {
                        label: "Confirmado",
                        className:
                          "bg-emerald-50 text-emerald-700 border border-emerald-200",
                      },
                      rejected: {
                        label: "Rechazado",
                        className:
                          "bg-red-50 text-red-700 border border-red-200",
                      },
                    };
                    const s = statusMap[quote.status] || {
                      label: quote.status,
                      className:
                        "bg-slate-50 text-slate-700 border border-slate-200",
                    };
                    return (
                      <Link
                        key={quote.id}
                        href={`/publimar/banderas/presupuestos/${generateSlug(
                          quote.number,
                          quote.id
                        )}`}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors duration-150 group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              Presupuesto #{quote.number}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(quote.createdAt)}
                              {quote.validUntil &&
                                ` · válido hasta ${formatDate(quote.validUntil)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-md text-xs font-medium",
                              s.className
                            )}
                          >
                            {s.label}
                          </span>
                          <EyeIcon className="h-4 w-4 text-muted-foreground opacity-0 md:group-hover:opacity-100 md:transition-opacity" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No hay presupuestos asociados a este cliente.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Órdenes de trabajo
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {ordersStatus === "loading" ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : orders && orders.length > 0 ? (
                <div className="space-y-2">
                  {orders.map((order: any) => {
                    const statusMap: Record<
                      string,
                      { label: string; className: string }
                    > = {
                      [EOrderStatus.IN_PROCESS]: {
                        label: "En proceso",
                        className:
                          "bg-blue-50 text-blue-700 border border-blue-200",
                      },
                      [EOrderStatus.COMPLETED]: {
                        label: "Finalizado",
                        className:
                          "bg-emerald-50 text-emerald-700 border border-emerald-200",
                      },
                      [EOrderStatus.CANCELLED]: {
                        label: "Cancelado",
                        className:
                          "bg-red-50 text-red-700 border border-red-200",
                      },
                    };
                    const s = statusMap[order.status] || {
                      label: order.status || "-",
                      className:
                        "bg-slate-50 text-slate-700 border border-slate-200",
                    };
                    return (
                      <Link
                        key={order.id}
                        href={`/publimar/banderas/ordenes/${generateSlug(
                          order.number,
                          order.id
                        )}`}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors duration-150 group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              Orden #{order.number}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(order.createdAt)}
                              {order.deliveryDate &&
                                ` · entrega ${formatDate(order.deliveryDate)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-md text-xs font-medium",
                              s.className
                            )}
                          >
                            {s.label}
                          </span>
                          <span className="text-sm font-semibold hidden sm:inline">
                            {formatearPrecio(order.total || 0)}
                          </span>
                          <EyeIcon className="h-4 w-4 text-muted-foreground opacity-0 md:group-hover:opacity-100 md:transition-opacity" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No hay órdenes asociadas a este cliente.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ventas">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Ventas</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {salesStatus === "loading" || salesStatus2 === "loading" ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : (activeSales && activeSales.length > 0) ||
                (activeSales2 && activeSales2.length > 0) ? (
                <div className="space-y-2">
                  {(activeSales && activeSales.length > 0
                    ? activeSales
                    : activeSales2
                  )?.map((sale: any) => {
                    const isFacturado =
                      sale.facturas && sale.facturas.length > 0;
                    const paymentLabel =
                      sale.paymentMethod === EPaymentMethod.CASH
                        ? "Efectivo"
                        : sale.paymentMethod === EPaymentMethod.TRANSFER
                          ? "Transferencia"
                          : sale.paymentMethod === EPaymentMethod.CREDIT_CARD
                            ? "Tarjeta"
                            : sale.paymentMethod === EPaymentMethod.CHECK
                              ? "Cheque"
                              : sale.paymentMethod === EPaymentMethod.MERCADOPAGO
                                ? "MercadoPago"
                                : "-";
                    return (
                      <button
                        type="button"
                        key={sale.id}
                        onClick={() => handleViewSale(sale.id)}
                        className="w-full text-left flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors duration-150 group cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              Venta #{sale.number || sale.id.substring(0, 8)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(sale.saleDate || sale.createdAt)} ·{" "}
                              {paymentLabel}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-md text-xs font-medium",
                              isFacturado
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-50 text-slate-700 border border-slate-200"
                            )}
                          >
                            {isFacturado ? "Facturado" : "Sin facturar"}
                          </span>
                          <span className="text-sm font-semibold hidden sm:inline">
                            {formatearPrecio(sale.total || 0)}
                          </span>
                          <EyeIcon className="h-4 w-4 text-muted-foreground opacity-0 md:group-hover:opacity-100 md:transition-opacity" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No hay ventas asociadas a este cliente.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SaleDetailsModal
        open={isSaleModalOpen}
        onOpenChange={setIsSaleModalOpen}
        saleId={selectedSaleId}
        onSuccess={handleCloseSaleModal}
      />

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>¿Eliminar cliente?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el
              cliente <strong>{typedClient.name}</strong> del sistema.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDeleteClient}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
