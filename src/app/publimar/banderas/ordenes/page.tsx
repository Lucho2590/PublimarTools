'use client';

import { useState } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import collections from "@/lib/collections";
import { EOrderStatus, TOrder } from "@/types/order";
import { useSales } from "@/hooks/useSales";
import { EPaymentMethod } from "@/types/sale";
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Edit, Eye, CheckCircle2, Coins, Circle, Receipt } from "lucide-react";
// import OrderDetailsModal from "./modalOrdenes/orderDetailsModal"; // Comentado temporalmente
import { toast } from "sonner";

export default function PedidosPage() {
  const [searchTerm, setSearchTerm] = useState("");
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
  
  // Hook para manejar ventas
  const { createSale, generateSaleNumber } = useSales();

  // Función para manejar la vista de orden en modal
  const handleViewOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    setShowModal(true);
  };

  // Función para convertir orden a venta
  const convertOrderToSale = async (order: TOrder) => {
    try {
      // Transformar items de orden a items de venta
      const saleItems = order.items.map(item => ({
        isManual: item.isManual || false,
        description: item.description || undefined,
        productId: item.productId || undefined,
        variantId: item.variantId || undefined,
        productName: item.productName || undefined,
        variantName: item.variantName || undefined,
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
        clientName: order.clientName || undefined,
        client: order.clientId || undefined,
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
        paymentMethod: (order.paymentMethod as EPaymentMethod) || EPaymentMethod.CASH,
        isInvoiced: order.isInvoiced || false,
        invoiceNumber: order.invoiceNumber || "",
        bank: order.bank || undefined,
        facturas: order.facturas || [],
        // Referencia a la orden original
        orderId: order.id,
      };

      // console.log('🔧 Datos de venta a crear:', saleData);

      // Crear la venta usando el hook (que ya limpia los undefined)
      const saleId = await createSale(saleData as any);
      
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

  // Consulta a Firestore
  const ordersCollection = collection(firestore, collections.ORDERS);
  const ordersQuery = query(ordersCollection, orderBy("createdAt", "desc"));

  const { status, data: orders } = useFirestoreCollectionData(ordersQuery, {
    idField: "id",
  });

  
  // Filtrar pedidos según la búsqueda y estado
  const filteredOrders = orders?.filter((order) => {
    const matchesSearch =
      order.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.client?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.client?.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.reference?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calcular índices para la paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredOrders?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredOrders?.length || 0) / itemsPerPage);

  // Generar números de página para mostrar
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;
    
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pageNumbers.push(i);
        }
        pageNumbers.push(-1); // -1 representa elipsis
        pageNumbers.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pageNumbers.push(1);
        pageNumbers.push(-1);
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pageNumbers.push(i);
        }
      } else {
        pageNumbers.push(1);
        pageNumbers.push(-1);
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pageNumbers.push(i);
        }
        pageNumbers.push(-1);
        pageNumbers.push(totalPages);
      }
    }
    
    return pageNumbers;
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Ordenes de trabajo</h1>
        <Button
          asChild
          className="bg-blue-900 hover:bg-blue-900 hover:text-white"
        >
          <Link href="/publimar/banderas/ordenes/nuevas">Nueva Orden</Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar por número o cliente..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1); // Reset a la primera página cuando se busca
                }}
              />
            </div>
            <div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as EOrderStatus | "all");
                  setCurrentPage(1); // Reset a la primera página cuando se filtra
                }}
              >
                <SelectTrigger className="w-full">
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
        <Card>
          <CardContent className="p-0">
            <div className="p-4 overflow-x-auto">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Mostrar</span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={(value) => {
                      setItemsPerPage(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="10" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-gray-500">por página</span>
                </div>
                <div className="text-sm text-gray-500">
                  Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredOrders?.length || 0)} de {filteredOrders?.length || 0} órdenes
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead> 
                    <TableHead>Referencia</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Pagos</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentItems && currentItems.length > 0 ? (
                    currentItems.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          {order.number}
                        </TableCell>
                        <TableCell>{order.clientName || order.client.name || order.client?.name || "-"}</TableCell>
                        <TableCell>
                         {order.clientReference || order.client?.reference || order.reference || "-"}
                        </TableCell>
                        <TableCell>{formatDate(order.createdAt)}</TableCell>
                        <TableCell>{formatearPrecio(order.total)}</TableCell>
                        <TableCell>
                          {order.status === EOrderStatus.COMPLETED ? (
                            // Badge estático para órdenes entregadas
                            <span
                              className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 min-w-[80px] h-6 w-24"
                            >
                              Entregada
                            </span>
                          ) : (
                            // Select editable para órdenes no entregadas
                            <Select
                              value={order.status}
                              onValueChange={(newStatus: EOrderStatus) => 
                                handleStatusChange(order.id, newStatus)
                              }
                            >
                              <SelectTrigger 
                                className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium border-none shadow-none cursor-pointer transition-colors min-w-[80px] h-6 ${
                                  order.status === EOrderStatus.IN_PROCESS
                                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200 w-24"
                                    : order.status === EOrderStatus.DRAFT
                                    ? "bg-gray-100 text-gray-800 hover:bg-gray-200 w-24"
                                    : "bg-red-100 text-red-800 hover:bg-red-200 w-24"
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
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            if (order.paymentHistory?.reduce((sum: number, payment: any) => sum + payment.amount, 0) === order.total || order.balance === 0) {
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
                                      <p className="text-xs font-medium text-gray-600">Sin Pagos</p>
                                      <p className="text-sm">
                                        <span className="text-gray-600">Saldo pendiente:</span>
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
                                      <p className="text-xs font-medium text-amber-600">Pago Parcial</p>
                                      <p className="text-sm">
                                        <span className="text-gray-600">Saldo pendiente:</span>
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
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-2 ">
                              {/* <Button
                                variant="ghost"
                                size="icon"
                                title="Ver orden (Modal)"
                                className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                                onClick={() => handleViewOrder(order.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button> */}
                              <Button
                                asChild
                                variant="ghost"
                                size="icon"
                                title="Editar orden (Página)"
                                className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                              >
                                <Link
                                  href={`/publimar/banderas/ordenes/${generateSlug(order.number, order.id)}`}
                                  prefetch={true}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Edit className="h-4 w-4" />
                                </Link>
                              </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-slate-500"
                      >
                        {searchTerm || statusFilter !== "all"
                          ? "No se encontraron pedidos con los filtros aplicados."
                          : "No hay pedidos disponibles."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                      
                      {getPageNumbers().map((pageNumber, index) => (
                        <PaginationItem key={index}>
                          {pageNumber === -1 ? (
                            <PaginationEllipsis />
                          ) : (
                            <PaginationLink
                              onClick={() => setCurrentPage(pageNumber)}
                              isActive={currentPage === pageNumber}
                              className={currentPage === pageNumber ? "bg-blue-900 text-white" : ""}
                            >
                              {pageNumber}
                            </PaginationLink>
                          )}
                        </PaginationItem>
                      ))}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </div>
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
            <Button onClick={handleConfirmConvert} className="bg-green-600 hover:bg-green-700">
              Sí, convertir a Venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

