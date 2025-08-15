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
import { formatDate, formatearPrecio } from "@/lib/utils";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import collections from "@/lib/collections";
// import { Label } from "@/components/ui/label";
// import { Input } from "@/components/ui/input";
import { toast } from "sonner";
// import { Textarea } from "@/components/ui/textarea";
import QuoteDetailsModal from "./presupuestos/modalPresupuestos/quoteDetailsModal";
import OrderDetailsModal from "./ordenes/modalOrdenes/orderDetailsModal";

export default function DashboardPage() {
  const firestore = useFirestore();
  const user = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );
  const [monthlySales, setMonthlySales] = useState<number>(0);
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
    where("validUntil", ">=", Timestamp.now()),
    where(
      "validUntil",
      "<=",
      Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
    ),
    where("status", "==", EQuoteStatus.SENT),
    orderBy("validUntil", "asc")
  );
  const { data: expiringQuotes } = useFirestoreCollectionData(
    expiringQuotesQuery,
    { idField: "id" }
  );

  // Consulta últimos clientes
  const clientsCollection = collection(firestore, collections.CLIENTS);
  const recentClientsQuery = query(
    clientsCollection,
    orderBy("createdAt", "desc"),
    limit(5)
  );
  const { data: recentClients } = useFirestoreCollectionData(
    recentClientsQuery,
    { idField: "id" }
  );

  // Consulta productos con bajo stock
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { data: allProducts } = useFirestoreCollectionData(productsCollection, {
    idField: "id",
  });

  // Filtrar productos con bajo stock en el cliente
  const lowStockProducts = allProducts?.filter((product) =>
    product.variants?.some((variant: { stock: number }) => variant.stock <= 5)
  );

  // Consulta últimas órdenes de trabajo
  const ordersCollection = collection(firestore, collections.ORDERS);
  const recentOrdersQuery = query(
    ordersCollection,
    orderBy("createdAt", "desc"),
    limit(5)
  );
  const { data: recentOrders } = useFirestoreCollectionData(recentOrdersQuery, {
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

  const salesCollection = collection(firestore, collections.SALES);
  const monthlySalesQuery = query(
    salesCollection,
    where("createdAt", ">=", Timestamp.fromDate(startOfMonth))
  );
  const { data: monthlySalesData } =
    useFirestoreCollectionData(monthlySalesQuery);

  useEffect(() => {
    if (monthlySalesData) {
      const total = monthlySalesData.reduce(
        (sum, sale) => sum + (sale.total || 0),
        0
      );
      setMonthlySales(total);
    }
  }, [monthlySalesData]);

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
        <Dialog>
          <DialogTrigger asChild>
            <Card className="cursor-pointer hover:bg-slate-50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ventas del Mes</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatearPrecio(monthlySales)}</div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Detalle de Ventas del Mes</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlySalesData?.map((sale: any) => (
                    <TableRow key={sale.id}>
                      <TableCell>{sale.number}</TableCell>
                      <TableCell>{formatDate(sale.createdAt)}</TableCell>
                      <TableCell>{formatearPrecio(sale.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Card className="cursor-pointer hover:bg-slate-50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Presupuestos por Vencer</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{expiringQuotes?.length || 0}</div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Presupuestos por Vencer</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiringQuotes?.map((quote: any) => (
                    <TableRow key={quote.id}>
                      <TableCell>{quote.number}</TableCell>
                      <TableCell>{quote.client.name}</TableCell>
                      <TableCell>{formatDate(quote.validUntil)}</TableCell>
                      <TableCell>{formatearPrecio(quote.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Card className="cursor-pointer hover:bg-slate-50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Productos con Bajo Stock</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {lowStockProducts?.reduce((count, product) => 
                    count + (product.variants?.filter((variant: any) => variant.stock <= 3).length || 0), 0
                  ) || 0}
                </div>
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
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts?.map((product: any) =>
                    product.variants?.filter((variant: any) => variant.stock <= 5).map(
                      (variant: any) => (
                        <TableRow key={`${product.id}-${variant.id}`}>
                          <TableCell>{product.name}</TableCell>
                          <TableCell>{variant.size}</TableCell>
                          <TableCell>{variant.stock}</TableCell>
                          <TableCell className="text-right">
                            <Link href={`/publimar/banderas/productos/${product.id}/editar`}>
                              <Button variant="outline" size="sm">
                                Reponer
                              </Button>
                            </Link>
                          </TableCell>
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
                <div className="text-2xl font-bold">{recentClients?.length || 0}</div>
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
                    <TableHead>Email</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentClients?.map((client: any) => (
                    <TableRow key={client.id}>
                      <TableCell>{client.name}</TableCell>
                      <TableCell>{client.email}</TableCell>
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
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders?.map((order: any) => (
                    <TableRow key={order.id}>
                      <TableCell>{order.number}</TableCell>
                      <TableCell>{order.client.name}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            order.status === EOrderStatus.IN_PROCESS
                              ? "bg-amber-100 text-amber-800"
                              : order.status === EOrderStatus.COMPLETED
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {order.status === EOrderStatus.IN_PROCESS
                            ? "En proceso"
                            : order.status === EOrderStatus.COMPLETED
                            ? "Entregada"
                            : "Cancelada"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleViewOrder(order.id)}
                          className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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
                  {expiringQuotes?.map((quote: any) => (
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
                  ))}
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
      <OrderDetailsModal
        isOpen={showOrderModal}
        onClose={handleCloseOrderModal}
        orderId={selectedOrderId}
      />
    </div>
  );
}
