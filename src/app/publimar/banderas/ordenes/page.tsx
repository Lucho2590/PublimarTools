'use client';

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import collections from "@/lib/collections";
import { EOrderStatus, TOrder } from "@/types/order";
import { useSales } from "@/hooks/useSales";
import { EPaymentMethod, ESaleDepartment } from "@/types/sale";
import { redirect } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatearPrecio, generateSlug } from "@/lib/utils";
import { createSale as createSaleWithStock, hydrateLineFromCatalog } from "@/lib/sales";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useAuth } from "@/contexts/AuthContext";
import { TProduct } from "@/types/product";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { TablePagination } from "@/components/admin/TablePagination";
import { Eye, Receipt, ClipboardList, Coins, CheckCircle2, Wallet, Plus, Search } from "lucide-react";
// import OrderDetailsModal from "./modalOrdenes/orderDetailsModal"; // Comentado temporalmente
import { toast } from "sonner";

export default function PedidosPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebouncedValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState<EOrderStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Estados para conversión a venta
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [orderToConvert, setOrderToConvert] = useState<TOrder | null>(null);
  const [newStatusToSet, setNewStatusToSet] = useState<EOrderStatus | null>(null);
  const firestore = useFirestore();
  const [clicked, setClicked] = useState(false);
  // Hook para manejar ventas
  const { generateSaleNumber } = useSales();
  const { logEvent } = useAuditLog();
  const { userRole } = useAuth();

  // Catálogo, para rehidratar los renglones de la orden antes de descontar stock.
  const { data: products } = useFirestoreCollectionData(
    collection(firestore, collections.PRODUCTS),
    { idField: "id" }
  );

  // Función para convertir orden a venta
  const convertOrderToSale = async (order: TOrder) => {

    try {
      // Transformar items de orden a items de venta
      const saleItems = order.items.map(item => ({
        isManual: item.isManual || false,
        description: item.description || "",
        productId: item.productId || null,
        variantId: item.variantId || null,
        productName: item.productName || "",
        variantName: item.variantName || "",
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        total: Number(item.subtotal) || 0,
      }));

      // Recalcular totales para asegurar valores numéricos correctos
      const subtotal = order.subtotal;
      const taxAmount = order.applyIVA ? subtotal * 0.21 : 0;
      const total = order.total;

      // Crear la venta basada en la orden usando el hook
      const saleData = {
        clientName: order.clientName || null,
        client: order.clientId || null,
        number: order.number, // Prefijo para distinguir de la orden
        items: saleItems,
        subtotal: order.subtotal,
        total: order.total,
        applyIVA: order.applyIVA || false,
        taxRate: order.applyIVA ? 0.21 : 0,
        taxAmount: taxAmount,
        discountPercentage: order.discountPercentage || 0,
        discountAmount: order.discountAmount || 0,
        manualDiscount: order.manualDiscount || 0,
        paymentMethod: (order.paymentMethod as EPaymentMethod)
          || (order.paymentHistory?.length > 0
            ? order.paymentHistory[order.paymentHistory.length - 1].method
            : EPaymentMethod.CASH),
        department: ESaleDepartment.BANDERAS,
        isInvoiced: order.isInvoiced || false,
        invoiceNumber: order.invoiceNumber || "",
        bank: order.bank || null,
        facturas: order.facturas || [],
        // Referencia a la orden original
        orderId: order.id,
      };

      // Renglones con producto/variante del catálogo: la orden guarda sólo ids,
      // y createSale necesita el producto completo para recalcular el stock.
      const catalog = (products ?? []) as unknown as TProduct[];
      const lineItems = order.items.map((item: any) => {
        const { product, variant } = hydrateLineFromCatalog(catalog, {
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          variantName: item.variantName,
          description: item.description,
          unitPrice: item.unitPrice,
          isManual: item.isManual,
        });
        return {
          product,
          variant,
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          discount: Number(item.discount) || 0,
          discountType: item.discountType || "percent",
          total: Number(item.subtotal) || 0,
        };
      });

      // formasPagoValidas vacío a propósito: los cobros de la orden ya
      // impactaron en las cuentas al registrarse cada pago. Registrarlos acá
      // duplicaría el ingreso.
      const { saleId, stockWarning } = await createSaleWithStock(
        firestore,
        logEvent,
        userRole || "",
        {
          saleData,
          items: lineItems,
          formasPagoValidas: [],
          allAccounts: [],
          clienteInput: order.clientName,
          total: Number(order.total) || 0,
        },
      );

      if (stockWarning) toast.warning(stockWarning);
      setClicked(false);

      // Actualizar la orden para marcarla como convertida
      const orderRef = doc(firestore, collections.ORDERS, order.id);
      await updateDoc(orderRef, {
        status: EOrderStatus.COMPLETED,
        convertedToSale: true,
        convertedAt: serverTimestamp(),
        saleId: saleId, // Guardar referencia a la venta creada
        updatedAt: serverTimestamp(),
      });

      toast.success(`Orden convertida a venta exitosamente (ID: ${saleId})`);
      setShowConvertDialog(false);
      setOrderToConvert(null);
      setNewStatusToSet(null);
    } catch (error) {
      console.error("Error al convertir orden a venta:", error);
      toast.error("Error al convertir la orden a venta");
    }
  };

  // Función para confirmar la conversión a venta
  const handleConfirmConvert = () => {
    if (orderToConvert) {
      setClicked(true);
      convertOrderToSale(orderToConvert);
    }
  };

  // Función para cancelar la conversión y solo cambiar el estado
  const handleCancelConvert = async () => {
    if (orderToConvert && newStatusToSet) {
      try {
        const orderRef = doc(firestore, collections.ORDERS, orderToConvert.id);
        await updateDoc(orderRef, {
          status: newStatusToSet,
          updatedAt: new Date(),
        });
        toast.success("Estado actualizado correctamente");
      } catch (error) {
        console.error("Error al actualizar estado:", error);
        toast.error("Error al actualizar el estado");
      }
    }
    setShowConvertDialog(false);
    setOrderToConvert(null);
    setNewStatusToSet(null);
  };

  // Función para actualizar el estado de la orden
  const handleStatusChange = async (orderId: string, newStatus: EOrderStatus) => {
    // Si cambia a "Entregada", verificar si puede convertirse a venta
    if (newStatus === EOrderStatus.COMPLETED) {
      const order = orders?.find(o => o.id === orderId) as TOrder;
      if (order && (order.balance === 0 || order.balance === undefined)) {
        // Mostrar diálogo de confirmación para convertir a venta
        setOrderToConvert(order);
        setNewStatusToSet(newStatus);
        setShowConvertDialog(true);
        return; // No actualizar el estado todavía
      }
    }

    // Actualizar estado normalmente
    try {
      const orderRef = doc(firestore, collections.ORDERS, orderId);
      await updateDoc(orderRef, {
        status: newStatus,
        updatedAt: new Date(),
      });
      toast.success("Estado actualizado correctamente");
    } catch (error) {
      console.error("Error al actualizar estado:", error);
      toast.error("Error al actualizar el estado");
    }
  };

  // Memoizar collection
  const ordersCollection = useMemo(
    () => collection(firestore, collections.ORDERS),
    [firestore]
  );

  // Query con filtro de estado en Firestore (en vez de traer TODOS y filtrar en JS)
  const ordersQuery = useMemo(() => {
    const constraints: any[] = [];

    if (statusFilter !== "all") {
      constraints.push(where("status", "==", statusFilter));
    }

    constraints.push(orderBy("createdAt", "desc"));

    return query(ordersCollection, ...constraints);
  }, [ordersCollection, statusFilter]);

  const { status, data: orders } = useFirestoreCollectionData(ordersQuery, {
    idField: "id",
  });

  // Filtrar solo por búsqueda de texto (estado ya filtrado en Firestore)
  const filteredOrders = useMemo(() => {
    if (!debouncedSearchTerm) return orders;
    const search = debouncedSearchTerm.toLowerCase();
    return orders?.filter((order) => {
      return (
        order.number?.toLowerCase().includes(search) ||
        order.clientName?.toLowerCase().includes(search) ||
        order.client?.name?.toLowerCase().includes(search) ||
        order.client?.reference?.toLowerCase().includes(search) ||
        order.reference?.toLowerCase().includes(search)
      );
    });
  }, [orders, debouncedSearchTerm]);

  // Calcular índices para la paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredOrders?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredOrders?.length || 0) / itemsPerPage);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // KPIs de resumen sobre las órdenes de la vista actual (respeta búsqueda y
  // filtro de estado). "Cobrado" = total − saldo pendiente.
  const stats = useMemo(() => {
    const list = (filteredOrders ?? []) as TOrder[];
    const facturado = list.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const pendiente = list.reduce(
      (sum, o) => sum + (Number(o.balance) || 0),
      0
    );
    return {
      total: list.length,
      facturado,
      pendiente,
      cobrado: facturado - pendiente,
    };
  }, [filteredOrders]);

  // Abrir el detalle de la orden (nueva pestaña, igual que el flujo anterior)
  const handleOpenOrder = (order: TOrder) => {
    window.open(
      `/publimar/banderas/ordenes/${generateSlug(order.number, order.id)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // Formatear fecha
  const formatDate = (timestamp: any) => {
    if (!timestamp) return "-";
    if (typeof timestamp.toDate === "function") {
      return timestamp.toDate().toLocaleDateString("es-AR");
    }
    if (timestamp instanceof Date) {
      return timestamp.toLocaleDateString("es-AR");
    }
    return new Date(timestamp).toLocaleDateString("es-AR");
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Órdenes de trabajo</h1>
          <p className="text-slate-600 text-sm mt-1">
            Seguí el estado, los pagos y los totales de tus órdenes
          </p>
        </div>
        <Button asChild className="bg-blue-900 hover:bg-blue-800 text-white">
          <Link href="/publimar/banderas/ordenes/nuevas">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Orden
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Órdenes"
          value={stats.total}
          icon={ClipboardList}
          variant="blue"
        />
        <SummaryCard
          title="Facturado"
          value={formatearPrecio(stats.facturado)}
          icon={Coins}
          variant="slate"
        />
        <SummaryCard
          title="Cobrado"
          value={formatearPrecio(stats.cobrado)}
          icon={CheckCircle2}
          variant="green"
        />
        <SummaryCard
          title="Saldo pendiente"
          value={formatearPrecio(stats.pendiente)}
          icon={Wallet}
          variant="amber"
        />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Label className="mb-2 block">Buscar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por número o cliente..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Estado</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as EOrderStatus | "all");
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value={EOrderStatus.IN_PROCESS}>En proceso</SelectItem>
                  <SelectItem value={EOrderStatus.COMPLETED}>Entregada</SelectItem>
                  <SelectItem value={EOrderStatus.CANCELLED}>Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {status === "loading" ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Órdenes</CardTitle>
              <span className="text-sm text-muted-foreground">
                {filteredOrders?.length || 0} resultados
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {currentItems && currentItems.length > 0 ? (
              <div className="space-y-1">
                {currentItems.map((order) => {
                  const clientName =
                    order.clientName || order.client?.name || "-";
                  const referencia =
                    order.clientReference ||
                    order.client?.reference ||
                    order.reference ||
                    "";
                  const meta = [
                    order.number,
                    referencia,
                    formatDate(order.createdAt),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div
                      key={order.id}
                      onClick={() => handleOpenOrder(order as unknown as TOrder)}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors duration-150 group cursor-pointer"
                    >
                      {/* Icono */}
                      <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <ClipboardList className="h-4 w-4 text-blue-600" />
                      </div>

                      {/* Cliente + meta */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {clientName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {meta}
                        </p>
                      </div>

                      {/* Total */}
                      <div className="hidden sm:block text-right shrink-0 w-28">
                        <p className="text-sm font-medium">
                          {formatearPrecio(order.total)}
                        </p>
                      </div>

                      {/* Estado */}
                      <div
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {order.status === EOrderStatus.COMPLETED ? (
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 h-6 w-24">
                            Entregada
                          </span>
                        ) : (
                          <Select
                            value={order.status}
                            onValueChange={(newStatus: EOrderStatus) =>
                              handleStatusChange(order.id, newStatus)
                            }
                          >
                            <SelectTrigger
                              className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium border-none shadow-none cursor-pointer transition-colors h-6 w-24 ${
                                order.status === EOrderStatus.IN_PROCESS
                                  ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                  : order.status === EOrderStatus.DRAFT
                                  ? "bg-gray-100 text-gray-800 hover:bg-gray-200"
                                  : "bg-red-100 text-red-800 hover:bg-red-200"
                              } [&>svg]:hidden`}
                            >
                              <SelectValue>
                                {order.status === EOrderStatus.IN_PROCESS
                                  ? "En proceso"
                                  : order.status === EOrderStatus.DRAFT
                                  ? "Borrador"
                                  : "Cancelada"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EOrderStatus.DRAFT}>
                                Borrador
                              </SelectItem>
                              <SelectItem value={EOrderStatus.IN_PROCESS}>
                                En proceso
                              </SelectItem>
                              <SelectItem value={EOrderStatus.COMPLETED}>
                                Entregada
                              </SelectItem>
                              <SelectItem value={EOrderStatus.CANCELLED}>
                                Cancelada
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      {/* Pagos */}
                      <div
                        className="shrink-0 w-8 flex justify-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          if (
                            order.paymentHistory?.reduce(
                              (sum: number, payment: any) => sum + payment.amount,
                              0
                            ) === order.total ||
                            order.balance === 0
                          ) {
                            // Pagado - Verde
                            return (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="flex justify-center cursor-pointer hover:scale-110 transition-transform">
                                    <Receipt className="h-5 w-5 text-green-600" />
                                  </button>
                                </PopoverTrigger>
                              </Popover>
                            );
                          } else if (order.balance === order.total) {
                            // Pendiente - Gris
                            return (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="flex justify-center cursor-pointer hover:scale-110 transition-transform">
                                    <Receipt className="h-5 w-5 text-gray-400" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-3">
                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-gray-600">
                                      Sin Pagos
                                    </p>
                                    <p className="text-sm">
                                      <span className="text-gray-600">
                                        Saldo pendiente:
                                      </span>
                                    </p>
                                    <p className="text-lg font-bold text-red-600">
                                      {formatearPrecio(order.balance)}
                                    </p>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          } else {
                            // Parcial - Ámbar
                            return (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="flex justify-center cursor-pointer hover:scale-110 transition-transform">
                                    <Receipt className="h-5 w-5 text-amber-500" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-3">
                                  <div className="space-y-1">
                                    <p className="text-xs font-medium text-amber-600">
                                      Pago Parcial
                                    </p>
                                    <p className="text-sm">
                                      <span className="text-gray-600">
                                        Saldo pendiente:
                                      </span>
                                    </p>
                                    <p className="text-lg font-bold text-amber-600">
                                      {formatearPrecio(order.balance)}
                                    </p>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            );
                          }
                        })()}
                      </div>

                      {/* Abrir */}
                      <Eye className="h-4 w-4 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity shrink-0" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {searchTerm || statusFilter !== "all"
                  ? "No se encontraron pedidos con los filtros aplicados."
                  : "No hay pedidos disponibles."}
              </div>
            )}

            {filteredOrders && filteredOrders.length > 0 && (
              <div className="border-t">
                <TablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredOrders?.length ?? 0}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(n) => {
                    setItemsPerPage(n);
                    setCurrentPage(1);
                  }}
                  pageSizeOptions={[10, 15, 25]}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal de detalles de orden */}
      {/* <OrderDetailsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        orderId={selectedOrderId}
      /> */}

      {/* Dialog de confirmación para convertir a venta */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convertir a Venta</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Esta orden está <strong>Entregada</strong> y tiene <strong>saldo $0</strong>.
            </p>
            <p className="text-sm text-gray-600 mt-2">
              ¿Deseas convertirla automáticamente a una <strong>Venta</strong>?
            </p>
            {orderToConvert && (
              <div className="mt-3 p-3 bg-gray-50 rounded-md">
                <p className="text-sm font-medium">Orden #{orderToConvert.number}</p>
                <p className="text-sm text-gray-600">
                  Cliente: {orderToConvert.client?.name}
                </p>
                <p className="text-sm text-gray-600">
                  Total: ${orderToConvert.total?.toFixed(2)}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelConvert}>
              No, solo cambiar estado
            </Button>
            <Button onClick={handleConfirmConvert} className="bg-green-600 hover:bg-green-700" disabled={clicked}>
              Sí, convertir a Venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

