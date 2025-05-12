"use client";

import { useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy } from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import collections from "~/lib/collections";
import { EPaymentMethod, TSale } from "~/types/sale";
import { useRouter } from "next/navigation";
import { formatearPrecio } from "~/lib/utils";
import { NuevaVentaModal } from "./modalVentas/nueva-venta-modal";
import { ViewSaleModal } from "./modalVentas/view-sale-modal";
import { EditSaleModal } from "./modalVentas/edit-sale-modal";
import { Edit, Eye, X } from "lucide-react";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, Sector } from "recharts";
import { TProduct, TProductCategory } from "~/types/product";

const BANCOS = ["Galicia", "Frances"];

export default function VentasPage() {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("all");
  const [selectedInvoiced, setSelectedInvoiced] = useState<string>("all");
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);
  const [selectedBank, setSelectedBank] = useState<string>("all");
  const [showNewSaleModal, setShowNewSaleModal] = useState(false);
  const [showViewSaleModal, setShowViewSaleModal] = useState(false);
  const [showEditSaleModal, setShowEditSaleModal] = useState(false);
  const [selectedVentaId, setSelectedVentaId] = useState<string | null>(null);
  const router = useRouter();
  const firestore = useFirestore();
  const [timeFilter, setTimeFilter] = useState<"week" | "month" | "year">("week");

  // Consulta a Firestore
  const salesCollection = collection(firestore, collections.SALES);
  const salesQuery = query(salesCollection, orderBy("createdAt", "desc"));

  const { status, data: sales } = useFirestoreCollectionData(salesQuery, {
    idField: "id",
  });

  // Obtener productos para acceder a sus categorías
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { data: products } = useFirestoreCollectionData(productsCollection, {
    idField: "id",
  });

  // Obtener categorías
  const categoriesCollection = collection(firestore, collections.products.CATEGORIES);
  const { data: categories } = useFirestoreCollectionData(categoriesCollection, {
    idField: "id",
  });

  // Función para obtener el nombre de la categoría
  const getCategoryName = (categoryId: string) => {
    const category = categories?.find(c => c.id === categoryId);
    return category ? (category as unknown as TProductCategory).name : "Sin categoría";
  };

  // Filtrar ventas según los filtros seleccionados
  const filteredSales = sales?.filter((sale) => {
    const typedSale = sale as unknown as TSale;
    const matchesPaymentMethod =
      selectedPaymentMethod === "all" ||
      typedSale.paymentMethod === selectedPaymentMethod;
    const matchesInvoiced =
      selectedInvoiced === "all" ||
      (selectedInvoiced === "yes" && typedSale.isInvoiced) ||
      (selectedInvoiced === "no" && !typedSale.isInvoiced);

    // Filtro de banco solo si es transferencia
    const matchesBank =
      selectedPaymentMethod !== EPaymentMethod.TRANSFER
      || selectedBank === "all"
      || (typedSale.bank && typedSale.bank === selectedBank);

    // Filtrar por fecha
    let saleDate: Date | null = null;
    if (typedSale.createdAt instanceof Date) {
      saleDate = typedSale.createdAt;
    } else if (typedSale.createdAt && typeof typedSale.createdAt === 'object' && 'seconds' in typedSale.createdAt) {
      saleDate = new Date((typedSale.createdAt as { seconds: number }).seconds * 1000);
    }
    if (!saleDate) return false;

    const matchesStartDate = !startDate || saleDate >= new Date(startDate);
    const matchesEndDate = !endDate || saleDate <= new Date(endDate + 'T23:59:59');

    return matchesPaymentMethod && matchesInvoiced && matchesBank && matchesStartDate && matchesEndDate;
  });

  // Calcular total de ventas filtradas
  const totalVentas = filteredSales?.reduce((sum, sale) => {
    const typedSale = sale as unknown as TSale;
    return sum + typedSale.total;
  }, 0) || 0;

  // Limpiar todos los filtros
  const limpiarFiltros = () => {
    setSelectedPaymentMethod("all");
    setSelectedInvoiced("all");
    setStartDate(today);
    setEndDate(today);
    setSelectedBank("all");
  };

  // Formatear fecha
  const formatDate = (date: any) => {
    if (!date) return "-";
    try {
      if (typeof date === 'object' && 'seconds' in date) {
        return new Date(date.seconds * 1000).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return new Date(date).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      console.error("Error al formatear fecha:", error);
      return "-";
    }
  };

  // Formatear método de pago
  const formatPaymentMethod = (method: EPaymentMethod) => {
    switch (method) {
      case EPaymentMethod.CASH:
        return "Efectivo";
      case EPaymentMethod.CREDIT_CARD:
        return "Tarjeta de Crédito";
      case EPaymentMethod.DEBIT_CARD:
        return "Tarjeta de Débito";
      case EPaymentMethod.TRANSFER:
        return "Transferencia";
      case EPaymentMethod.MERCADOPAGO:
        return "MercadoPago";
      default:
        return method;
    }
  };

  // Función para obtener las ventas por categoría según el filtro temporal
  const getSalesByCategory = (period: "month" | "year") => {
    if (!sales || !products || !categories) return [];

    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const filteredSales = sales.filter((sale) => {
      const saleDate = sale.createdAt instanceof Date 
        ? sale.createdAt 
        : new Date(sale.createdAt.seconds * 1000);
      return saleDate >= startDate;
    });

    // Agrupar ventas por categoría
    const categorySales = new Map<string, number>();
    
    filteredSales.forEach((sale) => {
      const typedSale = sale as unknown as TSale;
      typedSale.items?.forEach((item) => {
        const product = products.find(p => p.id === item.productId) as unknown as TProduct;
        const categoryId = product?.categories?.[0];
        const categoryName = categoryId ? getCategoryName(categoryId) : "Sin categoría";
        const currentTotal = categorySales.get(categoryName) || 0;
        categorySales.set(categoryName, currentTotal + (item.total || 0));
      });
    });

    return Array.from(categorySales.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  };

  // Función para obtener las ventas por método de pago
  const getSalesByPaymentMethod = () => {
    if (!sales) return [];

    const paymentMethodSales = new Map<string, number>();
    
    sales.forEach((sale) => {
      const typedSale = sale as unknown as TSale;
      const method = formatPaymentMethod(typedSale.paymentMethod);
      const currentTotal = paymentMethodSales.get(method) || 0;
      paymentMethodSales.set(method, currentTotal + typedSale.total);
    });

    return Array.from(paymentMethodSales.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Ventas</h1>
        <Button
          onClick={() => setShowNewSaleModal(true)}
          className="bg-blue-900 hover:bg-blue-900 hover:text-white"
        >
          Nueva Venta
        </Button>
      </div>

      {/* Modal de nueva venta */}
      <NuevaVentaModal
        open={showNewSaleModal}
        onOpenChange={setShowNewSaleModal}
        onSuccess={() => {
          window.location.reload();
        }}
      />

      {/* Modal de ver venta */}
      <ViewSaleModal
        open={showViewSaleModal}
        onOpenChange={setShowViewSaleModal}
        saleId={selectedVentaId}
      />

      {/* Modal de editar venta */}
      <EditSaleModal
        open={showEditSaleModal}
        onOpenChange={setShowEditSaleModal}
        saleId={selectedVentaId}
        onSuccess={() => {
          window.location.reload();
        }}
      />

      {/* Gráficos de ventas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Gráfico de categorías mensual */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="text-sm font-medium mb-2">Ventas por Categoría (Mes)</h3>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={getSalesByCategory("month")}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {getSalesByCategory("month").map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatearPrecio(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico de categorías anual */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="text-sm font-medium mb-2">Ventas por Categoría (Año)</h3>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={getSalesByCategory("year")}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {getSalesByCategory("year").map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatearPrecio(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico de métodos de pago */}
        <Card>
          <CardContent className="pt-4">
            <h3 className="text-sm font-medium mb-2">Ventas por Método de Pago</h3>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={getSalesByPaymentMethod()}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {getSalesByPaymentMethod().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatearPrecio(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <Select
              value={selectedPaymentMethod}
              onValueChange={(value) => {
                setSelectedPaymentMethod(value);
                if (value !== "transfer") setSelectedBank("all");
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Método de pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los métodos</SelectItem>
                <SelectItem value={EPaymentMethod.CASH}>Efectivo</SelectItem>
                <SelectItem value={EPaymentMethod.CREDIT_CARD}>Tarjeta de Crédito</SelectItem>
                <SelectItem value={EPaymentMethod.DEBIT_CARD}>Tarjeta de Débito</SelectItem>
                <SelectItem value={EPaymentMethod.TRANSFER}>Transferencia</SelectItem>
                <SelectItem value={EPaymentMethod.MERCADOPAGO}>MercadoPago</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtro de banco solo si es transferencia */}
            {selectedPaymentMethod === "transfer" && (
              <Select
                value={selectedBank}
                onValueChange={setSelectedBank}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Banco" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los bancos</SelectItem>
                  {BANCOS.map((banco) => (
                    <SelectItem key={banco} value={banco}>{banco}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select
              value={selectedInvoiced}
              onValueChange={setSelectedInvoiced}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Facturación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="yes">Facturadas</SelectItem>
                <SelectItem value="no">No facturadas</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[200px]"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[200px]"
              />
            </div>

            <Button
              variant="outline"
              onClick={limpiarFiltros}
              className="flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </Button>
          </div>

          <div className="mt-4 p-4 bg-slate-50 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-slate-500">Total de ventas filtradas</p>
                <p className="text-2xl font-bold">{formatearPrecio(totalVentas)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Cantidad de ventas</p>
                <p className="text-2xl font-bold">{filteredSales?.length || 0}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {status === "loading" ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Método de Pago</TableHead>
                    <TableHead>Facturado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-8 w-20" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Método de Pago</TableHead>
                    <TableHead>Facturado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales && filteredSales.length > 0 ? (
                    filteredSales.map((sale) => {
                      const typedSale = sale as unknown as TSale;
                      return (
                        <TableRow key={typedSale.id}>
                          <TableCell className="font-medium">
                            #{typedSale.number}
                          </TableCell>
                          <TableCell>{formatDate(typedSale.createdAt)}</TableCell>
                          <TableCell>
                            {formatPaymentMethod(typedSale.paymentMethod)}
                          </TableCell>
                          <TableCell>
                            {typedSale.isInvoiced ? (
                              <span className={typedSale.invoiceNumber ? "text-green-600" : "text-red-600"}>
                                Sí
                              </span>
                            ) : (
                              <span className="text-slate-500">No</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatearPrecio(typedSale.total)}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                title="Ver"
                                className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                                onClick={() => {
                                  setSelectedVentaId(typedSale.id ?? null);
                                  setShowViewSaleModal(true);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Editar"
                                className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                                onClick={() => {
                                  setSelectedVentaId(typedSale.id ?? null);
                                  setShowEditSaleModal(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-slate-500"
                      >
                        No hay ventas registradas
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
