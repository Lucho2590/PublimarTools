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
import CalendarAgenda from "@/components/calendar/CalendarAgenda";
import { EUserRole } from "@/types/user";
// import QuoteDetailsModal from "./presupuestos/modalPresupuestos/quoteDetailsModal"; // No disponible para Vía Pública
// import OrderDetailsModal from "./ordenes/modalOrdenes/orderDetailsModal"; // No disponible para Vía Pública

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

  // Consulta eventos del calendario - Admin y Administración ven todos, otros solo los suyos
  const eventsCollection = collection(firestore, collections.EVENTS);
  const canViewAllEvents = userRole === EUserRole.ADMIN || userRole === EUserRole.ADMINISTRACION;

  const eventsQuery = canViewAllEvents
    ? query(eventsCollection)
    : query(
        eventsCollection,
        where("createdBy", "==", firebaseUser.currentUser?.uid || "")
      );

  const { data: events } = useFirestoreCollectionData(eventsQuery, {
    idField: "id",
  });

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

  // Consulta compras (solo departamento Vía Pública)
  // Traemos todas las compras de Vía Pública y filtramos por fecha del lado del cliente
  const purchasesCollection = collection(firestore, collections.PURCHASES);
  const purchasesQuery = query(
    purchasesCollection,
    where("department", "==", EPurchaseDepartment.VIA_PUBLICA)
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
      <h1 className="text-3xl font-bold">Vía Pública</h1>

      {/* Resumen de métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Compras */}
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

        {/* Card 2: Salidas Activas */}
        <Card className="cursor-default hover:bg-slate-50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Salidas Activas</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>

        {/* Card 3: Ubicaciones a Reparar */}
        <Card className="cursor-default hover:bg-slate-50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ubicaciones a Reparar</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
          </CardContent>
        </Card>

        {/* Card 4: En Blanco */}
        <Card className="cursor-default hover:bg-slate-50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">-</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
          </CardContent>
        </Card>
      </div>

      {/* Contenido principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Tablas placeholder */}
        <div className="lg:col-span-2 space-y-6">
        <Card>
            <CardHeader>
              <CardTitle>Tabla 1 (En desarrollo)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Columna 1</TableHead>
                    <TableHead>Columna 2</TableHead>
                    <TableHead>Columna 3</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                      Contenido en desarrollo
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tabla 2 (En desarrollo)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Columna 1</TableHead>
                    <TableHead>Columna 2</TableHead>
                    <TableHead>Columna 3</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                      Contenido en desarrollo
                    </TableCell>
                  </TableRow>
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
            canViewAllEvents={canViewAllEvents}
          />
        </div>
      </div>

      {/* Modal de detalles de presupuesto - No disponible para Vía Pública */}
      {/* <QuoteDetailsModal
        isOpen={showQuoteModal}
        onClose={handleCloseQuoteModal}
        quoteId={selectedQuoteId}
      /> */}
    </div>
  );
}
