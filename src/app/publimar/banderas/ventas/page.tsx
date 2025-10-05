'use client';
import { useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import collections from "@/lib/collections";
import { EPaymentMethod, TSale } from "@/types/sale";
import { useRouter } from "next/navigation";
import { formatearPrecio, redondearADecena } from "@/lib/utils";
// import { NuevaVentaModal } from "./modalVentas/newSaleModal";
import { SaleDetailsModal } from "./modalVentas/saleDetailsModal";
import { Eye, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TProduct } from "@/types/product";

const BANCOS = ["Galicia", "Frances"];

export default function VentasPage() {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("all");
  const [selectedInvoiced, setSelectedInvoiced] = useState<string>("all");
  const today = new Date();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: today,
    to: today,
  });
  const [selectedBank, setSelectedBank] = useState<string>("all");
  // const [showNewSaleModal, setShowNewSaleModal] = useState(false);
  const [showSaleDetailsModal, setShowSaleDetailsModal] = useState(false);
  const [selectedVentaId, setSelectedVentaId] = useState<string | null>(null);
  const router = useRouter();
  const firestore = useFirestore();

  // Consulta a Firestore
  const salesCollection = collection(firestore, collections.SALES);
  const salesQuery = query(salesCollection, orderBy("createdAt", "desc"));

  const { status, data: sales } = useFirestoreCollectionData(salesQuery, {
    idField: "id",
  });
//  console.log(sales)


  // Obtener productos para el Top 5
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { data: products } = useFirestoreCollectionData(productsCollection, {
    idField: "id",
  });

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

    // Filtrar por rango de fechas
    let matchesDateRange = true;
    if (dateRange?.from && dateRange?.to) {
      const startOfDay = new Date(dateRange.from);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(dateRange.to);
      endOfDay.setHours(23, 59, 59, 999);
      
      matchesDateRange = saleDate >= startOfDay && saleDate <= endOfDay;
    }

    return matchesPaymentMethod && matchesInvoiced && matchesBank && matchesDateRange;
  });

  // Calcular total de ventas filtradas
  const totalVentas = filteredSales?.reduce((sum, sale) => {
    const typedSale = sale as unknown as TSale;
    return sum + typedSale.total;
  }, 0) || 0;

  // Limpiar todos los filtros y volver al día actual
  const limpiarFiltros = () => {
    const hoy = new Date();
    setSelectedPaymentMethod("all");
    setSelectedInvoiced("all");
    setDateRange({ from: hoy, to: hoy });
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
  const formatPaymentMethod = (method: EPaymentMethod, orderId?: string) => {
    if (orderId) {
      return `OT-#${orderId}`;
    }
    
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
      case EPaymentMethod.CHECK:
        return "Cheque";
      default:
        return method;
    }
  };

  // Función para obtener el Top 5 de productos más vendidos según período
  const getTopProducts = (period: "month" | "year") => {
    if (!sales || !products) return [];

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

    // Filtrar ventas del período
    const filteredSales = sales.filter((sale) => {
      if (!sale.createdAt) return false;
      
      const saleDate = sale.createdAt instanceof Date 
        ? sale.createdAt 
        : new Date(sale.createdAt.seconds * 1000);
      return saleDate >= startDate;
    });

    // Contar productos vendidos en el período
    const productSales = new Map<string, { name: string, quantity: number, salesCount: number }>();
    
    filteredSales.forEach((sale) => {
      const typedSale = sale as unknown as TSale;
      typedSale.items?.forEach((item) => {
        const productId = item.productId;
        const productName = item.productName || "Producto desconocido";
        
        if (productId) {
          const current = productSales.get(productId) || { name: productName, quantity: 0, salesCount: 0 };
          productSales.set(productId, {
            name: productName,
            quantity: current.quantity + (item.quantity || 0),
            salesCount: current.salesCount + 1,
          });
        }
      });
    });

    return Array.from(productSales.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map((product, index) => ({
        name: product.name,
        totalSales: product.quantity,
        salesCount: product.salesCount,
        position: index + 1,
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

    return Array.from(paymentMethodSales.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value) // Ordenar de mayor a menor
      .slice(0, 5); // Tomar solo los Top 5
  };

  const handleViewSale = (saleId: string) => {
    setSelectedVentaId(saleId);
    setShowSaleDetailsModal(true);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Ventas</h1>
        <Button
          onClick={() => router.push("/publimar/banderas/ventas/nueva")}
          className="bg-blue-900 hover:bg-blue-900 hover:text-white"
        >
          Nueva Venta
        </Button>
      </div>


      <SaleDetailsModal
        open={showSaleDetailsModal}
        onOpenChange={setShowSaleDetailsModal}
        saleId={selectedVentaId}
        onSuccess={() => {
          setShowSaleDetailsModal(false);
          setSelectedVentaId(null);
        }}
      />
      

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Fila 1: Filtros principales */}
            <div className="flex flex-wrap gap-3">
              <Select
                value={selectedPaymentMethod}
                onValueChange={(value) => {
                  setSelectedPaymentMethod(value);
                  if (value !== "transfer") setSelectedBank("all");
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Método de pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los métodos</SelectItem>
                  <SelectItem value={EPaymentMethod.CASH}>Efectivo</SelectItem>
                  <SelectItem value={EPaymentMethod.CREDIT_CARD}>Tarjeta de Crédito</SelectItem>
                  <SelectItem value={EPaymentMethod.DEBIT_CARD}>Tarjeta de Débito</SelectItem>
                  <SelectItem value={EPaymentMethod.TRANSFER}>Transferencia</SelectItem>
                  <SelectItem value={EPaymentMethod.MERCADOPAGO}>MercadoPago</SelectItem>
                  <SelectItem value={EPaymentMethod.CHECK}>Cheque</SelectItem>
                </SelectContent>
              </Select>

              {selectedPaymentMethod === "transfer" && (
                <Select
                  value={selectedBank}
                  onValueChange={setSelectedBank}
                >
                  <SelectTrigger className="w-[150px]">
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
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Facturación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="yes">Facturadas</SelectItem>
                  <SelectItem value="no">No facturadas</SelectItem>
                </SelectContent>
              </Select>

              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
              />

              <Button
                variant="outline"
                onClick={limpiarFiltros}
                size="icon"
                title="Limpiar filtros"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </Button>
            </div>

            {/* Resumen de totales */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="text-sm text-slate-500">Total de ventas</p>
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
                            {formatearPrecio(redondearADecena(typedSale.total))}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Ver"
                                className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                                onClick={() => typedSale.id && handleViewSale(typedSale.id)}
                              >
                                <Eye className="h-4 w-4" />
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

