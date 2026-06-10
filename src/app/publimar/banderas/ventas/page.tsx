'use client';
import { useState, useMemo } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, where } from "firebase/firestore";
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
import { formatearPrecio, redondearADecena } from "@/lib/utils";
// import { NuevaVentaModal } from "./modalVentas/newSaleModal";
import { SaleDetailsModal } from "./modalVentas/saleDetailsModal";
import { Eye, Trophy, ShoppingCart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TProduct } from "@/types/product";

const BANCOS = ["Galicia", "Frances"];

export default function VentasPage() {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("all");
  const [selectedInvoiced, setSelectedInvoiced] = useState<string>("all");
  const [selectedReturns, setSelectedReturns] = useState<string>("all");
  const today = new Date();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: today,
    to: today,
  });
  const [selectedBank, setSelectedBank] = useState<string>("all");
  const [searchProductTerm, setSearchProductTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  const [selectedVariant, setSelectedVariant] = useState<string>("all");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  // const [showNewSaleModal, setShowNewSaleModal] = useState(false);
  const [showSaleDetailsModal, setShowSaleDetailsModal] = useState(false);
  const [selectedVentaId, setSelectedVentaId] = useState<string | null>(null);
  const firestore = useFirestore();

  // Función para normalizar texto (quitar acentos y convertir a minúsculas)
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remover acentos
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Memoizar collection para evitar recrearla en cada render
  const salesCollection = useMemo(
    () => collection(firestore, collections.SALES),
    [firestore]
  );

  // Query con filtro de fechas en Firestore (en vez de traer TODOS y filtrar en JS)
  const salesQuery = useMemo(() => {
    const constraints: any[] = [];

    if (dateRange?.from) {
      const startOfDay = new Date(dateRange.from);
      startOfDay.setHours(0, 0, 0, 0);
      constraints.push(where("createdAt", ">=", startOfDay));
    }

    if (dateRange?.to) {
      const endOfDay = new Date(dateRange.to);
      endOfDay.setHours(23, 59, 59, 999);
      constraints.push(where("createdAt", "<=", endOfDay));
    }

    constraints.push(orderBy("createdAt", "desc"));

    return query(salesCollection, ...constraints);
  }, [salesCollection, dateRange]);

  const { status, data: sales } = useFirestoreCollectionData(salesQuery, {
    idField: "id",
  });

  // Extraer productos y variantes únicos de las ventas cargadas
  const uniqueProducts = useMemo(() => {
    if (!sales) return [];
    const map = new Map<string, string>();
    sales.forEach((sale) => {
      const typedSale = sale as unknown as TSale;
      typedSale.items?.forEach((item) => {
        if (item.productId && item.productName) {
          map.set(item.productId, item.productName);
        }
      });
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sales]);

  const uniqueVariants = useMemo(() => {
    if (!sales || selectedProduct === "all") return [];
    const map = new Map<string, string>();
    sales.forEach((sale) => {
      const typedSale = sale as unknown as TSale;
      typedSale.items?.forEach((item) => {
        if (item.productId === selectedProduct && item.variantId && item.variantName) {
          map.set(item.variantId, item.variantName);
        }
      });
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sales, selectedProduct]);

  // Filtrar ventas según los filtros restantes (fecha ya filtrada en Firestore)
  const filteredSales = useMemo(() => {
    return sales?.filter((sale) => {
      if ((sale as any).deleted) return false;
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

      // Filtrar por texto libre de producto
      let matchesProductSearch = true;
      if (searchProductTerm.trim() !== "") {
        const searchNormalized = normalizeText(searchProductTerm);
        matchesProductSearch = typedSale.items?.some((item) =>
          normalizeText(item.productName || '').includes(searchNormalized)
        ) || false;
      }

      // Filtrar por producto seleccionado (select)
      const matchesProductSelect =
        selectedProduct === "all" ||
        typedSale.items?.some((item) => item.productId === selectedProduct);

      // Filtrar por variante seleccionada
      const matchesVariantSelect =
        selectedVariant === "all" ||
        typedSale.items?.some(
          (item) => item.productId === selectedProduct && item.variantId === selectedVariant
        );

      // Filtrar por devoluciones y cambios
      const hasReturns = typedSale.returns && typedSale.returns.length > 0;
      const hasOnlyReturns = hasReturns && typedSale.returns?.some(r => !r.isExchange);
      const hasExchanges = hasReturns && typedSale.returns?.some(r => r.isExchange);

      const matchesReturns =
        selectedReturns === "all" ||
        (selectedReturns === "with" && hasReturns) ||
        (selectedReturns === "returns-only" && hasOnlyReturns && !hasExchanges) ||
        (selectedReturns === "exchanges-only" && hasExchanges) ||
        (selectedReturns === "without" && !hasReturns);

      return matchesPaymentMethod && matchesInvoiced && matchesBank && matchesProductSearch && matchesProductSelect && matchesVariantSelect && matchesReturns;
    });
  }, [sales, selectedPaymentMethod, selectedInvoiced, selectedBank, searchProductTerm, selectedProduct, selectedVariant, selectedReturns]);

  // Calcular total de ventas filtradas (memoizado)
  const totalVentas = useMemo(() => {
    return filteredSales?.reduce((sum, sale) => {
      const typedSale = sale as unknown as TSale;
      return sum + (typedSale.finalTotal ?? typedSale.total);
    }, 0) || 0;
  }, [filteredSales]);

  // Paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredSales?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredSales?.length || 0) / itemsPerPage);

  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
    } else if (currentPage <= 3) {
      for (let i = 1; i <= 4; i++) pageNumbers.push(i);
      pageNumbers.push(-1, totalPages);
    } else if (currentPage >= totalPages - 2) {
      pageNumbers.push(1, -1);
      for (let i = totalPages - 3; i <= totalPages; i++) pageNumbers.push(i);
    } else {
      pageNumbers.push(1, -1);
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pageNumbers.push(i);
      pageNumbers.push(-1, totalPages);
    }
    return pageNumbers;
  };

  // Limpiar todos los filtros y volver al día actual
  const limpiarFiltros = () => {
    const hoy = new Date();
    setSelectedPaymentMethod("all");
    setSelectedInvoiced("all");
    setSelectedReturns("all");
    setDateRange({ from: hoy, to: hoy });
    setSelectedBank("all");
    setSearchProductTerm("");
    setSelectedProduct("all");
    setSelectedVariant("all");
    setCurrentPage(1);
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
    if (!sales) return [];

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

    // Filtrar ventas del período (excluyendo eliminadas)
    const filteredSales = sales.filter((sale) => {
      if ((sale as any).deleted) return false;
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

    sales.filter((sale) => !(sale as any).deleted).forEach((sale) => {
      const typedSale = sale as unknown as TSale;
      const method = formatPaymentMethod(typedSale.paymentMethod);
      const currentTotal = paymentMethodSales.get(method) || 0;
      // Usar finalTotal si existe (con devoluciones), sino usar total
      paymentMethodSales.set(method, currentTotal + (typedSale.finalTotal ?? typedSale.total));
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
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <a href="/pos" target="_blank" rel="noopener noreferrer">
              <ShoppingCart className="w-4 h-4 mr-2" />
              Punto de Venta
            </a>
          </Button>
          <Button
            asChild
            className="bg-blue-900 hover:bg-blue-900 hover:text-white"
          >
            <Link href="/publimar/banderas/ventas/nueva">Nueva Venta</Link>
          </Button>
        </div>
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
              <div className="relative w-[250px]">
                <Input
                  placeholder="Filtrar por producto..."
                  value={searchProductTerm}
                  onChange={(e) => {
                    setSearchProductTerm(e.target.value);
                    setSelectedProduct("all");
                    setSelectedVariant("all");
                    setCurrentPage(1);
                  }}
                  onFocus={() => setShowProductDropdown(true)}
                  onBlur={() => setShowProductDropdown(false)}
                />
                {showProductDropdown && searchProductTerm.trim() === "" && selectedProduct === "all" && (
                  <div className="absolute z-50 mt-1 w-full max-h-[250px] overflow-y-auto bg-white border rounded-md shadow-lg">
                    {uniqueProducts.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 truncate"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedProduct(p.id);
                          setSearchProductTerm(p.name);
                          setSelectedVariant("all");
                          setShowProductDropdown(false);
                          setCurrentPage(1);
                        }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
                {searchProductTerm.trim() !== "" && selectedProduct === "all" && showProductDropdown && (
                  <div className="absolute z-50 mt-1 w-full max-h-[250px] overflow-y-auto bg-white border rounded-md shadow-lg">
                    {uniqueProducts
                      .filter((p) => normalizeText(p.name).includes(normalizeText(searchProductTerm)))
                      .map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 truncate"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSelectedProduct(p.id);
                            setSearchProductTerm(p.name);
                            setSelectedVariant("all");
                            setShowProductDropdown(false);
                            setCurrentPage(1);
                          }}
                        >
                          {p.name}
                        </button>
                      ))}
                  </div>
                )}
                {selectedProduct !== "all" && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSelectedProduct("all");
                      setSelectedVariant("all");
                      setSearchProductTerm("");
                      setCurrentPage(1);
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                )}
              </div>

              {selectedProduct !== "all" && uniqueVariants.length > 0 && (
                <Select
                  value={selectedVariant}
                  onValueChange={(value) => {
                    setSelectedVariant(value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Variante" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las variantes</SelectItem>
                    {uniqueVariants.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select
                value={selectedPaymentMethod}
                onValueChange={(value) => {
                  setSelectedPaymentMethod(value);
                  if (value !== "transfer") setSelectedBank("all");
                  setCurrentPage(1);
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

              <Select
                value={selectedReturns}
                onValueChange={setSelectedReturns}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Dev/Cambios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="with">Con dev/cambios</SelectItem>
                  <SelectItem value="returns-only">Solo devoluciones</SelectItem>
                  <SelectItem value="exchanges-only">Solo cambios</SelectItem>
                  <SelectItem value="without">Sin dev/cambios</SelectItem>
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
                      <SelectValue placeholder="25" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-gray-500">por página</span>
                </div>
                <div className="text-sm text-gray-500">
                  Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredSales?.length || 0)} de {filteredSales?.length || 0} ventas
                </div>
              </div>
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
                  {currentItems && currentItems.length > 0 ? (
                    currentItems.map((sale) => {
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
                            {typedSale.isInvoiced ||(typedSale.facturas && typedSale.facturas.length > 0) ? (
                              <span className="text-green-600">Sí</span>
                            ) : (
                              <span className="text-red-600">No</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatearPrecio(redondearADecena(typedSale.finalTotal ?? typedSale.total))}
                            {typedSale.returns && typedSale.returns.length > 0 && (
                              (() => {
                                const hasExchanges = typedSale.returns?.some(r => r.isExchange);
                                const hasReturnsOnly = typedSale.returns?.some(r => !r.isExchange);
                                if (hasExchanges && hasReturnsOnly) {
                                  return <span className="text-xs text-purple-600 ml-1" title="Tiene devoluciones y cambios">◆</span>;
                                } else if (hasExchanges) {
                                  return <span className="text-xs text-purple-600 ml-1" title="Tiene cambios">↔</span>;
                                } else {
                                  return <span className="text-xs text-orange-600 ml-1" title="Tiene devoluciones">↩</span>;
                                }
                              })()
                            )}
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
    </div>
  );
}

