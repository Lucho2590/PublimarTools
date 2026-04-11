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
import { EPurchaseDepartment } from "@/types/purchase";
import { ESaleDepartment } from "@/types/sale";
// import { TEvent } from "@/types/event";
import { formatDate, formatearPrecio, generateSlug } from "@/lib/utils";
import { useAuth as useFirebaseAuth } from "reactfire";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import {
  Eye,
  AlertTriangle,
  TrendingUp,
  ShoppingCart,
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
import CalendarAgenda from "@/components/calendar/CalendarAgenda";
import { EUserRole } from "@/types/user";
import UserNotes from "@/components/notes/UserNotes";
import { ENoteSection } from "@/types/note";
import { EEventSection } from "@/types/event";
// import OrderDetailsModal from "./ordenes/modalOrdenes/orderDetailsModal"; // Comentado temporalmente

export default function DashboardPage() {
  const firestore = useFirestore();
  const firebaseUser = useFirebaseAuth();
  const { userData, userRole } = useAuth();
  const [monthlySales, setMonthlySales] = useState<number>(0);
  const [yearlySales, setYearlySales] = useState<number>(0);
  const [showYearlySales, setShowYearlySales] = useState<boolean>(false);
  const [monthlyPurchases, setMonthlyPurchases] = useState<number>(0);
  const [yearlyPurchases, setYearlyPurchases] = useState<number>(0);
  const [showYearlyPurchases, setShowYearlyPurchases] = useState<boolean>(false);
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

  // Consulta productos con bajo stock
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { data: allProducts, status: allProductsStatus } = useFirestoreCollectionData(productsCollection, {
    idField: "id",
  });

  // Filtrar productos con bajo stock en el cliente
  // Solo mostramos productos que tengan lowStock: true Y que tengan variantes con stock <= 3
  const lowStockProducts = allProducts?.filter((product) =>
    product.lowStock === true &&
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

  // Consulta eventos del calendario - Traer eventos de Banderas o sin sección (legacy)
  const eventsCollection = collection(firestore, collections.EVENTS);
  const { data: allEvents } = useFirestoreCollectionData(
    query(eventsCollection),
    { idField: "id" }
  );

  // Filtrar eventos de Banderas del lado del cliente
  const events = allEvents?.filter((event: any) =>
    !event.section || event.section === EEventSection.BANDERAS
  );

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
    where("createdAt", ">=", Timestamp.fromDate(startOfMonth)),
    where("department", "==", ESaleDepartment.BANDERAS)
  );
  const { data: monthlySalesData, status: monthlySalesStatus } =
    useFirestoreCollectionData(monthlySalesQuery);

  const yearlySalesQuery = query(
    salesCollection,
    where("createdAt", ">=", Timestamp.fromDate(startOfYear)),
    where("department", "==", ESaleDepartment.BANDERAS)
  );
  const { data: yearlySalesData, status: yearlySalesStatus } =
    useFirestoreCollectionData(yearlySalesQuery);

  // Consulta compras (solo departamento Banderas)
  // Traemos todas las compras de Banderas y filtramos por fecha del lado del cliente
  const purchasesCollection = collection(firestore, collections.PURCHASES);
  const purchasesQuery = query(
    purchasesCollection,
    where("department", "==", EPurchaseDepartment.BANDERAS)
  );
  const { data: allPurchasesData, status: purchasesStatus } =
    useFirestoreCollectionData(purchasesQuery);

  // Filtrar compras del mes y año del lado del cliente usando el campo 'date'
  const monthlyPurchasesData = allPurchasesData?.filter((purchase: any) => {
    if (!purchase.date) return false;
    const purchaseDate = new Date(purchase.date);
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    return purchaseDate.getMonth() === currentMonth && purchaseDate.getFullYear() === currentYear;
  });

  const yearlyPurchasesData = allPurchasesData?.filter((purchase: any) => {
    if (!purchase.date) return false;
    const purchaseDate = new Date(purchase.date);
    const currentYear = new Date().getFullYear();
    return purchaseDate.getFullYear() === currentYear;
  });

  useEffect(() => {
    if (monthlySalesData) {
      const total = monthlySalesData
        .filter((sale) => !(sale as any).deleted)
        .reduce(
          (sum, sale) => sum + (sale.finalTotal ?? sale.total ?? 0),
          0
        );
      setMonthlySales(total);
    }
  }, [monthlySalesData]);

  useEffect(() => {
    if (yearlySalesData) {
      const total = yearlySalesData
        .filter((sale) => !(sale as any).deleted)
        .reduce(
          (sum, sale) => sum + (sale.finalTotal ?? sale.total ?? 0),
          0
        );
      setYearlySales(total);
    }
  }, [yearlySalesData]);

  useEffect(() => {
    if (monthlyPurchasesData) {
      const total = monthlyPurchasesData.reduce(
        (sum, purchase) => sum + (purchase.amount || 0),
        0
      );
      setMonthlyPurchases(total);
    }
  }, [monthlyPurchasesData]);

  useEffect(() => {
    if (yearlyPurchasesData) {
      const total = yearlyPurchasesData.reduce(
        (sum, purchase) => sum + (purchase.amount || 0),
        0
      );
      setYearlyPurchases(total);
    }
  }, [yearlyPurchasesData]);

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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Banderas</h1>
        {firebaseUser.currentUser?.uid && userData && (
          <UserNotes
            userId={firebaseUser.currentUser.uid}
            userName={userData.displayName || firebaseUser.currentUser.email || "Usuario"}
            section={ENoteSection.BANDERAS}
          />
        )}
      </div>

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
 <Card
          className="cursor-pointer hover:bg-slate-50 transition-all hover:shadow-md"
          onClick={() => setShowYearlyPurchases(!showYearlyPurchases)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex flex-col">
              <CardTitle className="text-sm font-medium">
                {showYearlyPurchases ? "Compras del Año" : "Compras del Mes"}
              </CardTitle>
            </div>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {purchasesStatus === 'loading' ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div
                key={showYearlyPurchases ? 'yearly-purchases' : 'monthly-purchases'}
                className="text-2xl font-bold animate-flip"
                style={{
                  animation: 'flipIn 0.8s ease-in-out'
                }}
              >
                {formatearPrecio(showYearlyPurchases ? yearlyPurchases : monthlyPurchases)}
              </div>
            )}
          </CardContent>
        </Card>

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

      </div>

      {/* Contenido principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

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
              <CardTitle>Últimos Presupuestos</CardTitle>
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

        {/* Columna derecha: Calendario/Agenda */}
        <div className="lg:col-span-1">
          <CalendarAgenda
            events={events || []}
            currentUserId={firebaseUser.currentUser?.uid || ""}
            currentUserName={userData?.displayName || firebaseUser.currentUser?.email || "Usuario"}
            section={EEventSection.BANDERAS}
          />
        </div>
      </div>

      {/* Modal de detalles de presupuesto */}
      <QuoteDetailsModal
        isOpen={showQuoteModal}
        onClose={handleCloseQuoteModal}
        quoteId={selectedQuoteId}
      />
    </div>
  );
}
