"use client";

import { useState, useEffect } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, where, orderBy, limit, Timestamp } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { EQuoteStatus, TQuote } from "~/types/quote";
import { TClient } from "~/types/client";
import { TProduct } from "~/types/product";
import { TOrder, EOrderStatus } from "~/types/order";
import { TEvent } from "~/types/event";
import { formatDate, formatearPrecio } from "~/lib/utils";
import { useAuth } from "reactfire";
import Link from "next/link";
import { Eye, AlertTriangle, TrendingUp, Users, Package, X } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { Agenda } from "~/components/agenda";

export default function DashboardPage() {
  const firestore = useFirestore();
  const user = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [monthlySales, setMonthlySales] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [sortedEvents, setSortedEvents] = useState<any[]>([]);

  // Consulta presupuestos próximos a vencer (7 días)
  const quotesCollection = collection(firestore, "quotes");
  const expiringQuotesQuery = query(
    quotesCollection,
    where("validUntil", ">=", Timestamp.now()),
    where("validUntil", "<=", Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))),
    where("status", "==", EQuoteStatus.SENT),
    orderBy("validUntil", "asc")
  );
  const { data: expiringQuotes } = useFirestoreCollectionData(expiringQuotesQuery, { idField: "id" });

  // Consulta últimos clientes
  const clientsCollection = collection(firestore, "clients");
  const recentClientsQuery = query(clientsCollection, orderBy("createdAt", "desc"), limit(5));
  const { data: recentClients } = useFirestoreCollectionData(recentClientsQuery, { idField: "id" });

  // Consulta productos con bajo stock
  const productsCollection = collection(firestore, "products");
  const { data: allProducts } = useFirestoreCollectionData(productsCollection, { idField: "id" });


  // Filtrar productos con bajo stock en el cliente
  const lowStockProducts = allProducts?.filter(product => 
    product.variants?.some((variant: { stock: number }) => variant.stock <= 10)
  );

  // Consulta últimas órdenes de trabajo
  const ordersCollection = collection(firestore, "orders");
  const recentOrdersQuery = query(ordersCollection, orderBy("createdAt", "desc"), limit(5));
  const { data: recentOrders } = useFirestoreCollectionData(recentOrdersQuery, { idField: "id" });

  // Consulta eventos del calendario
  const eventsCollection = collection(firestore, "events");
  const eventsQuery = query(
    eventsCollection,
    where("createdBy", "==", user.currentUser?.uid || ""),
  );
  const { data: events } = useFirestoreCollectionData(eventsQuery, { idField: "id" });

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

  const monthlyOrdersQuery = query(
    ordersCollection,
    where("createdAt", ">=", Timestamp.fromDate(startOfMonth))
  );
  const { data: monthlyOrders } = useFirestoreCollectionData(monthlyOrdersQuery);

  useEffect(() => {
    if (monthlyOrders) {
      const completedOrders = monthlyOrders.filter(order => order.status === "completed");
      const total = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);
      setMonthlySales(total);
    }
  }, [monthlyOrders]);

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
                    <TableHead>Cliente</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyOrders?.filter(order => order.status === "completed").map((order: any) => (
                    <TableRow key={order.id}>
                      <TableCell>{order.number}</TableCell>
                      <TableCell>{order.client.name}</TableCell>
                      <TableCell>{formatDate(order.createdAt)}</TableCell>
                      <TableCell>{formatearPrecio(order.total)}</TableCell>
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
                <div className="text-2xl font-bold">{lowStockProducts?.length || 0}</div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Productos con Bajo Stock</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
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
                  {lowStockProducts?.map((product: any) => (
                    product.variants?.map((variant: any) => (
                      variant.stock <= 10 && (
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
                    ))
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
        {/* Presupuestos por vencer y últimas OT */}
        <div className="lg:col-span-2 space-y-6">
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
                        <Link href={`/publimar/banderas/presupuestos/${quote.number}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

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
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders?.map((order: any) => (
                    <TableRow key={order.id}>
                      <TableCell>{order.number}</TableCell>
                      <TableCell>{order.client.name}</TableCell>
                      <TableCell>{formatDate(order.createdAt)}</TableCell>
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
                        <Link href={`/publimar/banderas/ordenes/${order.number}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Calendario */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
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
                <Agenda 
                  selectedDate={selectedDate || new Date()} 
                  events={sortedEvents?.filter(event => 
                    formatDate(event.date) === formatDate(selectedDate)
                  ) || []}
                  onEventAdded={() => {
                    // La recarga se maneja automáticamente por el hook useFirestoreCollectionData
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}