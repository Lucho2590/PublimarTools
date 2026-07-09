'use client';
export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EQuoteStatus } from "@/types/quote";
import { EOrderStatus } from "@/types/order";
import { EPurchaseDepartment } from "@/types/purchase";
import { ESaleDepartment } from "@/types/sale";
import { formatDate, formatearPrecio, generateSlug } from "@/lib/utils";
import { useAuth as useFirebaseAuth } from "reactfire";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import {
  Eye,
  TrendingUp,
  ShoppingCart,
  Package,
  ClipboardList,
  Receipt,
  ArrowRight,
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
import { isDeleted } from "@/lib/softDelete";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { TablePagination } from "@/components/admin/TablePagination";
import QuoteDetailsModal from "./presupuestos/modalPresupuestos/quoteDetailsModal";
import CalendarAgenda from "@/components/calendar/CalendarAgenda";
import UserNotes from "@/components/notes/UserNotes";
import { ENoteSection } from "@/types/note";
import { EEventSection } from "@/types/event";
import type { DateRange } from "react-day-picker";

function toDate(d: any): Date | null {
  if (!d) return null;
  if (typeof d.toDate === "function") return d.toDate();
  if (d?.seconds) return new Date(d.seconds * 1000);
  if (d instanceof Date) return d;
  if (typeof d === "string") return new Date(d);
  return null;
}

export default function DashboardPage() {
  const firestore = useFirestore();
  const firebaseUser = useFirebaseAuth();
  const { userData } = useAuth();

  // --- Métricas (ventas/compras)
  const [monthlySales, setMonthlySales] = useState<number>(0);
  const [yearlySales, setYearlySales] = useState<number>(0);
  const [showYearlySales, setShowYearlySales] = useState<boolean>(false);
  const [monthlyPurchases, setMonthlyPurchases] = useState<number>(0);
  const [yearlyPurchases, setYearlyPurchases] = useState<number>(0);
  const [showYearlyPurchases, setShowYearlyPurchases] = useState<boolean>(false);

  // --- Modales de detalle
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  // --- Filtros tabla OT
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersDateRange, setOrdersDateRange] = useState<DateRange | undefined>(undefined);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPerPage, setOrdersPerPage] = useState(5);

  // --- Filtros tabla Presupuestos
  const [quotesExpiringOnly, setQuotesExpiringOnly] = useState<string>("expiring");
  const [quotesDateRange, setQuotesDateRange] = useState<DateRange | undefined>(undefined);
  const [quotesSearch, setQuotesSearch] = useState("");
  const [quotesPage, setQuotesPage] = useState(1);
  const [quotesPerPage, setQuotesPerPage] = useState(5);

  // Consulta presupuestos (status SENT)
  const quotesCollection = collection(firestore, collections.QUOTES);
  const quotesQuery = query(
    quotesCollection,
    where("status", "==", EQuoteStatus.SENT)
  );
  const { data: allQuotesData, status: quotesStatus } = useFirestoreCollectionData(
    quotesQuery,
    { idField: "id" }
  );

  // Consulta productos (bajo stock)
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { data: allProducts, status: allProductsStatus } = useFirestoreCollectionData(productsCollection, {
    idField: "id",
  });

  const lowStockProducts = allProducts?.filter((product) =>
    !isDeleted(product) &&
    product.lowStock === true &&
    product.variants?.some((variant: { stock: number }) => variant.stock <= 3)
  );

  const lowStockCount = lowStockProducts?.reduce(
    (count, product) =>
      count + (product.variants?.filter((variant: any) => variant.stock <= 3).length || 0),
    0,
  ) || 0;

  // Consulta órdenes IN_PROCESS (sin limit — se filtra/paginación en cliente)
  const ordersCollection = collection(firestore, collections.ORDERS);
  const inProcessOrdersQuery = query(
    ordersCollection,
    where("status", "==", EOrderStatus.IN_PROCESS),
    orderBy("createdAt", "desc")
  );
  const { data: inProcessOrders, status: inProcessOrdersStatus } = useFirestoreCollectionData(inProcessOrdersQuery, {
    idField: "id",
  });

  // Consulta eventos del calendario (Banderas o legacy sin sección)
  const eventsCollection = collection(firestore, collections.EVENTS);
  const { data: allEvents } = useFirestoreCollectionData(
    query(eventsCollection),
    { idField: "id" }
  );
  const events = allEvents?.filter((event: any) =>
    !event.deleted && (!event.section || event.section === EEventSection.BANDERAS)
  );

  // --- Ventas
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

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

  // --- Compras
  const purchasesCollection = collection(firestore, collections.PURCHASES);
  const purchasesQuery = query(
    purchasesCollection,
    where("department", "==", EPurchaseDepartment.BANDERAS)
  );
  const { data: allPurchasesData, status: purchasesStatus } =
    useFirestoreCollectionData(purchasesQuery);

  const monthlyPurchasesData = allPurchasesData?.filter((purchase: any) => {
    if (purchase.deleted) return false;
    if (!purchase.date) return false;
    const purchaseDate = new Date(purchase.date);
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    return purchaseDate.getMonth() === currentMonth && purchaseDate.getFullYear() === currentYear;
  });

  const yearlyPurchasesData = allPurchasesData?.filter((purchase: any) => {
    if (purchase.deleted) return false;
    if (!purchase.date) return false;
    const purchaseDate = new Date(purchase.date);
    const currentYear = new Date().getFullYear();
    return purchaseDate.getFullYear() === currentYear;
  });

  useEffect(() => {
    if (monthlySalesData) {
      const total = monthlySalesData
        .filter((sale) => !(sale as any).deleted)
        .reduce((sum, sale) => sum + (sale.finalTotal ?? sale.total ?? 0), 0);
      setMonthlySales(total);
    }
  }, [monthlySalesData]);

  useEffect(() => {
    if (yearlySalesData) {
      const total = yearlySalesData
        .filter((sale) => !(sale as any).deleted)
        .reduce((sum, sale) => sum + (sale.finalTotal ?? sale.total ?? 0), 0);
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

  // --- OT filtradas + paginadas
  const filteredOrders = useMemo(() => {
    const list = inProcessOrders || [];
    const search = ordersSearch.trim().toLowerCase();
    const from = ordersDateRange?.from ?? null;
    const to = ordersDateRange?.to ?? ordersDateRange?.from ?? null;
    return list.filter((order: any) => {
      if (search) {
        const number = String(order.number ?? "").toLowerCase();
        const clientName = (order.clientName || order.client?.name || "").toLowerCase();
        if (!number.includes(search) && !clientName.includes(search)) return false;
      }
      if (from && to) {
        const d = toDate(order.createdAt);
        if (!d) return false;
        const toEnd = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);
        if (d < from || d > toEnd) return false;
      }
      return true;
    });
  }, [inProcessOrders, ordersSearch, ordersDateRange]);

  useEffect(() => {
    setOrdersPage(1);
  }, [ordersSearch, ordersDateRange, ordersPerPage]);

  const ordersTotalPages = Math.max(1, Math.ceil(filteredOrders.length / ordersPerPage));
  const ordersPageItems = filteredOrders.slice(
    (ordersPage - 1) * ordersPerPage,
    ordersPage * ordersPerPage,
  );

  // --- Presupuestos filtrados + paginados
  const filteredQuotes = useMemo(() => {
    const list = allQuotesData || [];
    const search = quotesSearch.trim().toLowerCase();
    const from = quotesDateRange?.from ?? null;
    const to = quotesDateRange?.to ?? quotesDateRange?.from ?? null;
    const now = new Date();
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    return list
      .filter((quote: any) => {
        const validUntilDate = toDate(quote.validUntil);
        if (quotesExpiringOnly === "expiring") {
          if (!validUntilDate) return false;
          if (validUntilDate < now || validUntilDate > sevenDaysFromNow) return false;
        }
        if (from && to) {
          if (!validUntilDate) return false;
          const toEnd = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);
          if (validUntilDate < from || validUntilDate > toEnd) return false;
        }
        if (search) {
          const number = String(quote.number ?? "").toLowerCase();
          const clientName = (quote.client?.name || "").toLowerCase();
          if (!number.includes(search) && !clientName.includes(search)) return false;
        }
        return true;
      })
      .sort((a: any, b: any) => {
        const dateA = toDate(a.validUntil)?.getTime() ?? 0;
        const dateB = toDate(b.validUntil)?.getTime() ?? 0;
        return dateA - dateB;
      });
  }, [allQuotesData, quotesExpiringOnly, quotesDateRange, quotesSearch]);

  useEffect(() => {
    setQuotesPage(1);
  }, [quotesExpiringOnly, quotesDateRange, quotesSearch, quotesPerPage]);

  const quotesTotalPages = Math.max(1, Math.ceil(filteredQuotes.length / quotesPerPage));
  const quotesPageItems = filteredQuotes.slice(
    (quotesPage - 1) * quotesPerPage,
    quotesPage * quotesPerPage,
  );

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

  const salesLoading = monthlySalesStatus === 'loading' || yearlySalesStatus === 'loading';
  const purchasesLoading = purchasesStatus === 'loading';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Banderas</h1>
        {firebaseUser.currentUser?.uid && userData && (
          <UserNotes
            userId={firebaseUser.currentUser.uid}
            userName={userData.displayName || firebaseUser.currentUser.email || "Usuario"}
            section={ENoteSection.BANDERAS}
          />
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title={showYearlySales ? "Ventas del Año" : "Ventas del Mes"}
          variant="green"
          icon={TrendingUp}
          onClick={() => setShowYearlySales(!showYearlySales)}
          value={
            salesLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <span
                key={showYearlySales ? "yearly-sales" : "monthly-sales"}
                className="inline-block animate-flip"
              >
                {formatearPrecio(showYearlySales ? yearlySales : monthlySales)}
              </span>
            )
          }
        />

        <SummaryCard
          title={showYearlyPurchases ? "Compras del Año" : "Compras del Mes"}
          variant="red"
          icon={ShoppingCart}
          onClick={() => setShowYearlyPurchases(!showYearlyPurchases)}
          value={
            purchasesLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <span
                key={showYearlyPurchases ? "yearly-purchases" : "monthly-purchases"}
                className="inline-block animate-flip"
              >
                {formatearPrecio(showYearlyPurchases ? yearlyPurchases : monthlyPurchases)}
              </span>
            )
          }
        />

        <SummaryCard
          title="Órdenes en Proceso"
          variant="blue"
          icon={ClipboardList}
          href="/publimar/banderas/ordenes"
          value={
            inProcessOrdersStatus === 'loading' ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              inProcessOrders?.length || 0
            )
          }
        />

        <Dialog>
          <DialogTrigger asChild>
            <SummaryCard
              title="Bajo Stock"
              variant="amber"
              icon={Package}
              value={
                allProductsStatus === 'loading' ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  lowStockCount
                )
              }
            />
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
          animation: flipIn 0.8s ease-in-out;
          transform-origin: center;
        }
      `}</style>

      {/* Contenido principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Órdenes de Trabajo */}
          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle>Órdenes de Trabajo en Proceso</CardTitle>
              <Button asChild variant="outline" size="sm">
                <Link href="/publimar/banderas/ordenes">
                  Ver todas <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <div className="md:col-span-1">
                  <Label className="text-xs">Buscar</Label>
                  <Input
                    placeholder="Número o cliente"
                    value={ordersSearch}
                    onChange={(e) => setOrdersSearch(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Fecha de creación</Label>
                  <DateRangePicker
                    value={ordersDateRange}
                    onChange={setOrdersDateRange}
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-center">Pagos</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inProcessOrdersStatus === 'loading' ? (
                      Array.from({ length: 3 }).map((_, index) => (
                        <TableRow key={index}>
                          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                          <TableCell className="text-center"><Skeleton className="h-5 w-5 mx-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : ordersPageItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-slate-500">
                          No hay órdenes que coincidan con los filtros
                        </TableCell>
                      </TableRow>
                    ) : (
                      ordersPageItems.map((order: any) => {
                        const totalPaid = order.paymentHistory?.reduce(
                          (sum: number, payment: any) => sum + payment.amount,
                          0,
                        );
                        const isPaid = totalPaid === order.total || order.balance === 0;
                        const isPending = order.balance === order.total;
                        return (
                          <TableRow key={order.id}>
                            <TableCell>{order.number}</TableCell>
                            <TableCell>{order.clientName || order.client?.name}</TableCell>
                            <TableCell className="text-center">
                              {isPaid ? (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="flex justify-center cursor-pointer hover:scale-110 transition-transform mx-auto">
                                      <Receipt className="h-5 w-5 text-green-600" />
                                    </button>
                                  </PopoverTrigger>
                                </Popover>
                              ) : isPending ? (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="flex justify-center cursor-pointer hover:scale-110 transition-transform mx-auto">
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
                              ) : (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="flex justify-center cursor-pointer hover:scale-110 transition-transform mx-auto">
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
                              )}
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
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              <TablePagination
                currentPage={ordersPage}
                totalPages={ordersTotalPages}
                totalItems={filteredOrders.length}
                itemsPerPage={ordersPerPage}
                onPageChange={setOrdersPage}
                onItemsPerPageChange={setOrdersPerPage}
                pageSizeOptions={[5, 10, 25, 50]}
              />
            </CardContent>
          </Card>

          {/* Presupuestos */}
          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle>Presupuestos Enviados</CardTitle>
              <Button asChild variant="outline" size="sm">
                <Link href="/publimar/banderas/presupuestos">
                  Ver todos <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div>
                  <Label className="text-xs">Mostrar</Label>
                  <Select value={quotesExpiringOnly} onValueChange={setQuotesExpiringOnly}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expiring">Por vencer en 7 días</SelectItem>
                      <SelectItem value="all">Todos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Buscar</Label>
                  <Input
                    placeholder="Número o cliente"
                    value={quotesSearch}
                    onChange={(e) => setQuotesSearch(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Vence entre</Label>
                  <DateRangePicker
                    value={quotesDateRange}
                    onChange={setQuotesDateRange}
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
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
                    {quotesStatus === 'loading' ? (
                      Array.from({ length: 3 }).map((_, index) => (
                        <TableRow key={index}>
                          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : quotesPageItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                          No hay presupuestos que coincidan con los filtros
                        </TableCell>
                      </TableRow>
                    ) : (
                      quotesPageItems.map((quote: any) => (
                        <TableRow key={quote.id}>
                          <TableCell>{quote.number}</TableCell>
                          <TableCell>{quote.client?.name}</TableCell>
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
                    )}
                  </TableBody>
                </Table>
              </div>

              <TablePagination
                currentPage={quotesPage}
                totalPages={quotesTotalPages}
                totalItems={filteredQuotes.length}
                itemsPerPage={quotesPerPage}
                onPageChange={setQuotesPage}
                onItemsPerPageChange={setQuotesPerPage}
                pageSizeOptions={[5, 10, 25, 50]}
              />
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

      <QuoteDetailsModal
        isOpen={showQuoteModal}
        onClose={handleCloseQuoteModal}
        quoteId={selectedQuoteId}
      />
    </div>
  );
}
