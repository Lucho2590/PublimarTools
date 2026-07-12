'use client';
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, where, limit } from "firebase/firestore";
import { LIST_FETCH_CAP } from "@/lib/queryLimits";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { TablePagination } from "@/components/admin/TablePagination";
import collections from "@/lib/collections";
import { EPaymentMethod, TSale } from "@/types/sale";
import { formatearPrecio, redondearADecena } from "@/lib/utils";
// import { NuevaVentaModal } from "./modalVentas/newSaleModal";
import { SaleDetailsModal } from "./modalVentas/saleDetailsModal";
import { Eye, Trophy, ShoppingCart, Plus, Coins, Receipt, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
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
  const debouncedSearchProductTerm = useDebouncedValue(searchProductTerm);
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
    // Con rango de fechas la query ya queda acotada, así que traemos TODO el
    // período (KPIs y lista exactos). Solo aplicamos un tope de respaldo si no
    // hay rango, para no descargar la colección entera por accidente.
    if (!dateRange?.from && !dateRange?.to) {
      constraints.push(limit(LIST_FETCH_CAP));
    }

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
      if (debouncedSearchProductTerm.trim() !== "") {
        const searchNormalized = normalizeText(debouncedSearchProductTerm);
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
  }, [sales, selectedPaymentMethod, selectedInvoiced, selectedBank, debouncedSearchProductTerm, selectedProduct, selectedVariant, selectedReturns]);

  // Calcular total de ventas filtradas (memoizado)
  const totalVentas = useMemo(() => {
    return filteredSales?.reduce((sum, sale) => {
      const typedSale = sale as unknown as TSale;
      return sum + (typedSale.finalTotal ?? typedSale.total);
    }, 0) || 0;
  }, [filteredSales]);

  // KPIs de resumen sobre las ventas de la vista actual (respeta filtros/fechas).
  const stats = useMemo(() => {
    const list = (filteredSales ?? []) as unknown as TSale[];
    let facturado = 0;
    let sinFacturar = 0;
    for (const s of list) {
      const amount = Number(s.finalTotal ?? s.total) || 0;
      const invoiced = s.isInvoiced || (s.facturas && s.facturas.length > 0);
      if (invoiced) facturado += amount;
      else sinFacturar += amount;
    }
    return { count: list.length, facturado, sinFacturar };
  }, [filteredSales]);

  // Paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredSales?.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil((filteredSales?.length || 0) / itemsPerPage);

  // Si el set filtrado se achica y la página queda fuera de rango, corregirla
  // (evita listas vacías por página fuera de rango).
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ventas</h1>
          <p className="text-slate-600 text-sm mt-1">
            Historial de ventas por período, con montos y facturación
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <a href="/pos" target="_blank" rel="noopener noreferrer">
              <ShoppingCart className="w-4 h-4 mr-2" />
              Punto de Venta
            </a>
          </Button>
          <Button asChild className="bg-blue-900 hover:bg-blue-800 text-white">
            <Link href="/publimar/banderas/ventas/nueva">
              <Plus className="w-4 h-4 mr-2" />
              Nueva Venta
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Ventas"
          value={stats.count}
          icon={ShoppingCart}
          variant="blue"
        />
        <SummaryCard
          title="Monto total"
          value={formatearPrecio(totalVentas)}
          icon={Coins}
          variant="slate"
        />
        <SummaryCard
          title="Facturado"
          value={formatearPrecio(stats.facturado)}
          icon={Receipt}
          variant="green"
        />
        <SummaryCard
          title="Sin facturar"
          value={formatearPrecio(stats.sinFacturar)}
          icon={FileText}
          variant="amber"
        />
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
                  onValueChange={(value) => {
                    setSelectedBank(value);
                    setCurrentPage(1);
                  }}
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
                onValueChange={(value) => {
                  setSelectedInvoiced(value);
                  setCurrentPage(1);
                }}
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
                onValueChange={(value) => {
                  setSelectedReturns(value);
                  setCurrentPage(1);
                }}
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
                onChange={(range) => {
                  setDateRange(range);
                  setCurrentPage(1);
                }}
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
          </div>
        </CardContent>
      </Card>


      {status === "loading" ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Ventas</CardTitle>
              <span className="text-sm text-muted-foreground">
                {filteredSales?.length || 0} resultados
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {currentItems && currentItems.length > 0 ? (
              <TooltipProvider delayDuration={200}>
              <div className="space-y-1">
                {currentItems.map((sale) => {
                  const typedSale = sale as unknown as TSale;
                  const saleItems = typedSale.items ?? [];
                  const invoiced =
                    typedSale.isInvoiced ||
                    (typedSale.facturas && typedSale.facturas.length > 0);
                  const returnBadge = (() => {
                    if (!typedSale.returns || typedSale.returns.length === 0)
                      return null;
                    const hasExchanges = typedSale.returns?.some((r) => r.isExchange);
                    const hasReturnsOnly = typedSale.returns?.some(
                      (r) => !r.isExchange
                    );
                    if (hasExchanges && hasReturnsOnly)
                      return (
                        <span
                          className="text-xs text-purple-600 ml-1"
                          title="Tiene devoluciones y cambios"
                        >
                          ◆
                        </span>
                      );
                    if (hasExchanges)
                      return (
                        <span
                          className="text-xs text-purple-600 ml-1"
                          title="Tiene cambios"
                        >
                          ↔
                        </span>
                      );
                    return (
                      <span
                        className="text-xs text-orange-600 ml-1"
                        title="Tiene devoluciones"
                      >
                        ↩
                      </span>
                    );
                  })();
                  return (
                    <Tooltip key={typedSale.id}>
                    <TooltipTrigger asChild>
                    <div
                      onClick={() => typedSale.id && handleViewSale(typedSale.id)}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors duration-150 group cursor-pointer"
                    >
                      {/* Icono */}
                      <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <Receipt className="h-4 w-4 text-blue-600" />
                      </div>

                      {/* Número + meta */}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          #{typedSale.number}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDate(typedSale.createdAt)} ·{" "}
                          {formatPaymentMethod(typedSale.paymentMethod)}
                        </p>
                      </div>

                      {/* Facturación */}
                      <span
                        className={`hidden sm:inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${
                          invoiced
                            ? "bg-green-100 text-green-800"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {invoiced ? "Facturada" : "Sin factura"}
                      </span>

                      {/* Total */}
                      <div className="text-right shrink-0 w-32">
                        <p className="text-sm font-medium">
                          {formatearPrecio(
                            redondearADecena(
                              typedSale.finalTotal ?? typedSale.total
                            )
                          )}
                          {returnBadge}
                        </p>
                      </div>

                      {/* Ver */}
                      <Eye className="h-4 w-4 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity shrink-0" />
                    </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      align="start"
                      className="max-w-sm border bg-white p-3 text-slate-700 shadow-md"
                    >
                      {saleItems.length > 0 ? (
                        <>
                          <p className="mb-1.5 font-medium text-slate-900">
                            Items vendidos
                          </p>
                          <ul className="space-y-1">
                            {saleItems.slice(0, 12).map((item, i) => (
                              <li
                                key={i}
                                className="flex items-baseline justify-between gap-3"
                              >
                                <span className="truncate">
                                  <span className="font-medium">
                                    {item.quantity}×
                                  </span>{" "}
                                  {item.productName || item.description || "Item"}
                                  {item.variantName ? (
                                    <span className="text-slate-400">
                                      {" "}
                                      · {item.variantName}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="shrink-0 tabular-nums text-slate-500">
                                  {formatearPrecio(
                                    item.total ?? item.unitPrice * item.quantity
                                  )}
                                </span>
                              </li>
                            ))}
                            {saleItems.length > 12 && (
                              <li className="text-slate-400">
                                +{saleItems.length - 12} más…
                              </li>
                            )}
                          </ul>
                        </>
                      ) : (
                        <p className="text-slate-500">Sin items</p>
                      )}
                    </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              </TooltipProvider>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No hay ventas registradas
              </div>
            )}

            {filteredSales && filteredSales.length > 0 && (
              <div className="border-t">
                <TablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredSales?.length ?? 0}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(n) => {
                    setItemsPerPage(n);
                    setCurrentPage(1);
                  }}
                  pageSizeOptions={[10, 25, 50]}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

