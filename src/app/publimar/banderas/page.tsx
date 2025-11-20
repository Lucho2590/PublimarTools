'use client';
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  addDoc,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
// import { Calendar } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EQuoteStatus, TQuote } from "@/types/quote";
// import { TClient } from "@/types/client";
// import { TProduct } from "@/types/product";
import { EOrderStatus } from "@/types/order";
// import { TEvent } from "@/types/event";
import { formatDate, formatearPrecio, generateSlug } from "@/lib/utils";
import { useAuth } from "reactfire";
import Link from "next/link";
import {
  Eye,
  AlertTriangle,
  TrendingUp,
  Users,
  Package,
  X,
  Plus,
  ClipboardList,
  Receipt,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import collections from "@/lib/collections";
// import { Label } from "@/components/ui/label";
// import { Input } from "@/components/ui/input";
import { toast } from "sonner";
// import { Textarea } from "@/components/ui/textarea";
import QuoteDetailsModal from "./presupuestos/modalPresupuestos/quoteDetailsModal";
// import OrderDetailsModal from "./ordenes/modalOrdenes/orderDetailsModal"; // Comentado temporalmente

export default function DashboardPage() {
  const firestore = useFirestore();
  const user = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );
  const [monthlySales, setMonthlySales] = useState<number>(0);
  const [yearlySales, setYearlySales] = useState<number>(0);
  const [showYearlySales, setShowYearlySales] = useState<boolean>(false);
//   const [loading, setLoading] = useState(true);
  const [sortedEvents, setSortedEvents] = useState<any[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    time: "",
  });
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Consulta presupuestos próximos a vencer (7 días)
  const quotesCollection = collection(firestore, collections.QUOTES);
  const expiringQuotesQuery = query(
    quotesCollection,
    where("status", "==", EQuoteStatus.SENT)
  );
  const { data: allQuotesData, status: expiringQuotesStatus } = useFirestoreCollectionData(
    expiringQuotesQuery,
    { idField: "id" }
  );

  // Filtrar y ordenar del lado del cliente
  const expiringQuotes = allQuotesData
    ?.filter((quote: any) => {
      if (!quote.validUntil) return false;
      const validUntilDate = quote.validUntil?.toDate?.() || new Date(quote.validUntil);
      const now = new Date();
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      return validUntilDate >= now && validUntilDate <= sevenDaysFromNow;
    })
    ?.sort((a: any, b: any) => {
      const dateA = a.validUntil?.toDate?.() || new Date(a.validUntil);
      const dateB = b.validUntil?.toDate?.() || new Date(b.validUntil);
      return dateA.getTime() - dateB.getTime();
    });

  // Consulta últimos clientes
  const clientsCollection = collection(firestore, collections.CLIENTS);
  const recentClientsQuery = query(
    clientsCollection,
    orderBy("createdAt", "desc"),
    limit(5)
  );
  const { data: recentClients, status: recentClientsStatus } = useFirestoreCollectionData(
    recentClientsQuery,
    { idField: "id" }
  );

  // Consulta productos con bajo stock
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { data: allProducts, status: allProductsStatus } = useFirestoreCollectionData(productsCollection, {
    idField: "id",
  });

  // Filtrar productos con bajo stock en el cliente
  const lowStockProducts = allProducts?.filter((product) =>
    product.variants?.some((variant: { stock: number }) => variant.stock <= 3)
  );

  // Consulta últimas órdenes de trabajo en proceso
  const ordersCollection = collection(firestore, collections.ORDERS);
  const recentOrdersQuery = query(
    ordersCollection,
    where("status", "==", EOrderStatus.IN_PROCESS),
    orderBy("createdAt", "desc"),
    limit(5)
  );
  const { data: recentOrders, status: recentOrdersStatus } = useFirestoreCollectionData(recentOrdersQuery, {
    idField: "id",
  });

  // Consulta órdenes en proceso
  const inProcessOrdersQuery = query(
    ordersCollection,
    where("status", "==", EOrderStatus.IN_PROCESS),
    orderBy("createdAt", "desc")
  );
  const { data: inProcessOrders, status: inProcessOrdersStatus } = useFirestoreCollectionData(inProcessOrdersQuery, {
    idField: "id",
  });

  // Consulta eventos del calendario
  const eventsCollection = collection(firestore, collections.EVENTS);
  const eventsQuery = query(
    eventsCollection,
    where("createdBy", "==", user.currentUser?.uid || "")
  );
  const { data: events } = useFirestoreCollectionData(eventsQuery, {
    idField: "id",
  });

  // Ordenamos los eventos en el cliente
  useEffect(() => {
    if (events) {
      const newSortedEvents = events.sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date);
        const dateB = b.date instanceof Date ? b.date : new Date(b.date);
        return dateA.getTime() - dateB.getTime();
      });
      setSortedEvents(newSortedEvents);
    }
  }, [events]);

  // Calcular ventas del mes
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Calcular ventas del año
  const startOfYear = new Date();
  startOfYear.setMonth(0, 1);
  startOfYear.setHours(0, 0, 0, 0);

  const salesCollection = collection(firestore, collections.SALES);
  const monthlySalesQuery = query(
    salesCollection,
    where("createdAt", ">=", Timestamp.fromDate(startOfMonth))
  );
  const { data: monthlySalesData, status: monthlySalesStatus } =
    useFirestoreCollectionData(monthlySalesQuery);

  const yearlySalesQuery = query(
    salesCollection,
    where("createdAt", ">=", Timestamp.fromDate(startOfYear))
  );
  const { data: yearlySalesData, status: yearlySalesStatus } =
    useFirestoreCollectionData(yearlySalesQuery);

  useEffect(() => {
    if (monthlySalesData) {
      const total = monthlySalesData.reduce(
        (sum, sale) => sum + (sale.total || 0),
        0
      );
      setMonthlySales(total);
    }
  }, [monthlySalesData]);

  useEffect(() => {
    if (yearlySalesData) {
      const total = yearlySalesData.reduce(
        (sum, sale) => sum + (sale.total || 0),
        0
      );
      setYearlySales(total);
    }
  }, [yearlySalesData]);

  const handleCreateEvent = async () => {
    if (!newEvent.title || !newEvent.time) return;

    try {
      const eventDate = new Date(selectedDate || new Date());
      const [hours, minutes] = newEvent.time.split(":");
      eventDate.setHours(parseInt(hours), parseInt(minutes));

      await addDoc(collection(firestore, collections.EVENTS), {
        title: newEvent.title,
        description: newEvent.description,
        date: eventDate,
        createdBy: user.currentUser?.uid,
        createdAt: new Date(),
      });

      setNewEvent({ title: "", description: "", time: "" });
      setShowEventModal(false);
      toast.success("Evento creado correctamente");
    } catch (error) {
      console.error("Error al crear evento:", error);
      toast.error("Error al crear el evento");
    }
  };

  const handleViewQuote = (quoteId: string) => {
    setSelectedQuoteId(quoteId);
    setShowQuoteModal(true);
  };

  const handleCloseQuoteModal = () => {
    setShowQuoteModal(false);
    setTimeout(() => {
      setSelectedQuoteId(null);
    }, 150);
  };

  const handleViewOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    setShowOrderModal(true);
  };

  const handleCloseOrderModal = () => {
    setShowOrderModal(false);
    setTimeout(() => {
      setSelectedOrderId(null);
    }, 150);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Banderas</h1>

      {/* Resumen de métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className="cursor-pointer hover:bg-slate-50 transition-all hover:shadow-md"
          onClick={() => setShowYearlySales(!showYearlySales)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex flex-col">
              <CardTitle className="text-sm font-medium">
                {showYearlySales ? "Ventas del Año" : "Ventas del Mes"}
              </CardTitle>
              {/* <span className="text-xs text-muted-foreground mt-1">
                Click para {showYearlySales ? "ver mes" : "ver año"}
              </span> */}
            </div>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {monthlySalesStatus === 'loading' || yearlySalesStatus === 'loading' ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div
                key={showYearlySales ? 'yearly' : 'monthly'}
                className="text-2xl font-bold animate-flip"
                style={{
                  animation: 'flipIn 0.8s ease-in-out'
                }}
              >
                {formatearPrecio(showYearlySales ? yearlySales : monthlySales)}
              </div>
            )}
          </CardContent>
        </Card>

        <style jsx>{`
          @keyframes flipIn {
            0% {
              transform: rotateX(90deg);
              opacity: 0;
            }
            50% {
              transform: rotateX(-10deg);
            }
            100% {
              transform: rotateX(0deg);
              opacity: 1;
            }
          }
          .animate-flip {
            transform-origin: center;
          }
        `}</style>

        <Link href="/publimar/banderas/ordenes">
          <Card className="cursor-pointer hover:bg-slate-50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Órdenes en Proceso</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {inProcessOrdersStatus === 'loading' ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold">{inProcessOrders?.length || 0}</div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Dialog>
          <DialogTrigger asChild>
            <Card className="cursor-pointer hover:bg-slate-50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Productos con Bajo Stock</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {allProductsStatus === 'loading' ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="text-2xl font-bold">
                    {lowStockProducts?.reduce((count, product) =>
                      count + (product.variants?.filter((variant: any) => variant.stock <= 3).length || 0), 0
                    ) || 0}
                  </div>
                )}
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Productos con Bajo Stock</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Variante</TableHead>
                    <TableHead>Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts?.map((product: any) =>
                    product.variants?.filter((variant: any) => variant.stock <= 3).map(
                      (variant: any) => (
                        <TableRow key={`${product.id}-${variant.id}`}>
                          <TableCell>{product.name}</TableCell>
                          <TableCell>{variant.size}</TableCell>
                          <TableCell>{variant.stock}</TableCell>
                        </TableRow>
                      )
                    )
                  )}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Card className="cursor-pointer hover:bg-slate-50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Nuevos Clientes</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {recentClientsStatus === 'loading' ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="text-2xl font-bold">{recentClients?.length || 0}</div>
                )}
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Últimos Clientes Registrados</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    {/* <TableHead>Email</TableHead> */}
                    <TableHead>Teléfono</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentClients?.map((client: any) => (
                    <TableRow key={client.id}>
                      <TableCell>{client.name}</TableCell>
                      {/* <TableCell>{client.email}</TableCell> */}
                      <TableCell>{client.phone}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/publimar/banderas/clientes/${client.id}`}>
                          <Button variant="outline" size="sm">
                            Ver
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Contenido principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendario */}
        {/* <Card >
          <CardHeader>
            <CardTitle>Calendario</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="rounded-md border"
            />
            <div className="mt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  Eventos del {formatDate(selectedDate)}
                </h3>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowEventModal(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {sortedEvents?.filter(
                  (event) => formatDate(event.date) === formatDate(selectedDate)
                ).map((event) => (
                  <div
                    key={event.id}
                    className="p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{event.title}</h4>
                        <p className="text-sm text-slate-500">
                          {new Date(event.date).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    {event.description && (
                      <p className="text-sm text-slate-600 mt-1">
                        {event.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card> */}

        {/* Presupuestos por vencer y últimas OT */}
        <div className="lg:col-span-2 space-y-6">
        <Card>
            <CardHeader>
              <CardTitle>Últimas Órdenes de Trabajo</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Pagos</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrdersStatus === 'loading' ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                        <TableCell className="text-center"><Skeleton className="h-5 w-5 mx-auto" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    recentOrders?.map((order: any) => (
                      <TableRow key={order.id}>
                        <TableCell>{order.number}</TableCell>
                        <TableCell>{order.clientName||order.client?.name}</TableCell>
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
                        <TableCell className="text-right">
                          <Link href={`/publimar/banderas/ordenes/${generateSlug(order.number, order.id)}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Presupuestos por Vencer</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiringQuotesStatus === 'loading' ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : expiringQuotes && expiringQuotes.length > 0 ? (
                    expiringQuotes.map((quote: any) => (
                      <TableRow key={quote.id}>
                        <TableCell>{quote.number}</TableCell>
                        <TableCell>{quote.client.name}</TableCell>
                        <TableCell>{formatDate(quote.validUntil)}</TableCell>
                        <TableCell>{formatearPrecio(quote.total)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewQuote(quote.id)}
                            className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                        No hay presupuestos próximos a vencer
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          
        </div>
      </div>

      {/* Modal de nuevo evento */}
      {/* <Dialog open={showEventModal} onOpenChange={setShowEventModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Nuevo Evento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={newEvent.title}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, title: e.target.value })
                }
                placeholder="Título del evento"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="time">Hora</Label>
              <Input
                id="time"
                type="time"
                value={newEvent.time}
                onChange={(e) =>
                  setNewEvent({ ...newEvent, time: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={newEvent.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setNewEvent({ ...newEvent, description: e.target.value })
                }
                placeholder="Descripción del evento (opcional)"
                className="h-20"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowEventModal(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateEvent}
              disabled={!newEvent.title || !newEvent.time}
            >
              Crear Evento
            </Button>
          </div>
        </DialogContent>
      </Dialog> */}

      {/* Modal de detalles de presupuesto */}
      <QuoteDetailsModal
        isOpen={showQuoteModal}
        onClose={handleCloseQuoteModal}
        quoteId={selectedQuoteId}
      />

      {/* Modal de detalles de orden */}
      {/* <OrderDetailsModal
        isOpen={showOrderModal}
        onClose={handleCloseOrderModal}
        orderId={selectedOrderId}
      /> */}
    </div>
  );
}
