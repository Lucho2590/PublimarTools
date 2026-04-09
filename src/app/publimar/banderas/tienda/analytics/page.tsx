"use client";

import { useState, useEffect, useMemo } from "react";
import { useFirestore } from "reactfire";
import {
  collection,
  query,
  getDocs,
  orderBy,
  limit,
  where,
  Timestamp,
} from "firebase/firestore";
import {
  TProductAnalytics,
  TSearchQuery,
  TConversionFunnel,
} from "@/types/analytics";
import { TAbandonedCart } from "@/types/abandonedCart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Eye,
  Search,
  AlertCircle,
  DollarSign,
  Users,
  Package,
  Smartphone,
  Monitor,
  Tablet,
  RefreshCw,
  ShoppingBag,
  XCircle,
  Clock,
  Target,
  LayoutDashboard,
  Loader2,
} from "lucide-react";

// Formatear moneda
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// Formatear porcentaje
const formatPercent = (value: number) => {
  return `${(value * 100).toFixed(1)}%`;
};

// Navegación interna de la tienda
const tiendaNav = [
  { name: "Dashboard", href: "/publimar/banderas/tienda", icon: LayoutDashboard },
  { name: "Pedidos", href: "/publimar/banderas/tienda/pedidos", icon: Package, badge: true },
  { name: "Carritos", href: "/publimar/banderas/tienda/carritos-abandonados", icon: ShoppingCart, badge: true },
  { name: "Analytics", href: "/publimar/banderas/tienda/analytics", icon: BarChart3 },
];

// Componente de barra de progreso
const ProgressBar = ({ value, max, color = "bg-blue-600" }: { value: number; max: number; color?: string }) => {
  const percent = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="w-full bg-blue-100 rounded-full h-2.5">
      <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${Math.min(percent, 100)}%` }}></div>
    </div>
  );
};

// Componente KPI Card
const KPICard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  color = "text-primary",
  bgColor = "bg-blue-50",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color?: string;
  bgColor?: string;
}) => (
  <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
    <CardContent className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <div className={`h-9 w-9 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`h-4.5 w-4.5 ${color}`} />
        </div>
      </div>
      <div className={`text-2xl font-bold tracking-tight ${color}`}>{value}</div>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          {trend === "up" && <TrendingUp className="h-3 w-3 text-green-600" />}
          {trend === "down" && <TrendingDown className="h-3 w-3 text-red-600" />}
          {trendValue && <span className={trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : ""}>{trendValue}</span>}
          {subtitle}
        </p>
      )}
    </CardContent>
  </Card>
);

export default function AnalyticsPage() {
  const firestore = useFirestore();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState("30"); // días

  // Data states
  const [topProducts, setTopProducts] = useState<TProductAnalytics[]>([]);
  const [allSearches, setAllSearches] = useState<TSearchQuery[]>([]);
  const [funnelData, setFunnelData] = useState<TConversionFunnel[]>([]);
  const [abandonedCarts, setAbandonedCarts] = useState<TAbandonedCart[]>([]);

  // Calcular fecha límite basada en el rango seleccionado
  const dateLimit = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - parseInt(dateRange));
    return Timestamp.fromDate(date);
  }, [dateRange]);

  const loadAnalytics = async () => {
    try {
      setRefreshing(true);

      // 1. Cargar productos (top 20 por vistas)
      const productsQuery = query(
        collection(firestore, "productAnalytics"),
        orderBy("viewsCount", "desc"),
        limit(20)
      );
      const productsSnapshot = await getDocs(productsQuery);
      const productsData = productsSnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })) as TProductAnalytics[];
      setTopProducts(productsData);

      // 2. Cargar todas las búsquedas (últimas 200)
      const searchesQuery = query(
        collection(firestore, "searchQueries"),
        orderBy("timestamp", "desc"),
        limit(200)
      );
      const searchesSnapshot = await getDocs(searchesQuery);
      const searchesData = searchesSnapshot.docs.map((doc) => doc.data()) as TSearchQuery[];
      setAllSearches(searchesData);

      // 3. Cargar embudos de conversión
      const funnelQuery = query(collection(firestore, "conversionFunnels"));
      const funnelSnapshot = await getDocs(funnelQuery);
      const funnelDataResult = funnelSnapshot.docs.map((doc) => doc.data()) as TConversionFunnel[];
      setFunnelData(funnelDataResult);

      // 4. Cargar carritos abandonados
      const cartsQuery = query(
        collection(firestore, "abandonedCarts"),
        orderBy("lastActivityAt", "desc"),
        limit(100)
      );
      const cartsSnapshot = await getDocs(cartsQuery);
      const cartsData = cartsSnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })) as TAbandonedCart[];
      setAbandonedCarts(cartsData);

    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  // ==========================================
  // CÁLCULOS DE MÉTRICAS
  // ==========================================

  // KPIs principales
  const kpis = useMemo(() => {
    const totalRevenue = topProducts.reduce((sum, p) => sum + (p.totalRevenue || 0), 0);
    const totalViews = topProducts.reduce((sum, p) => sum + (p.viewsCount || 0), 0);
    const totalPurchases = topProducts.reduce((sum, p) => sum + (p.purchasedCount || 0), 0);
    const totalAddToCart = topProducts.reduce((sum, p) => sum + (p.addToCartCount || 0), 0);

    const totalSessions = funnelData.length;
    const purchasedSessions = funnelData.filter(f => f.stage === "purchased").length;
    const conversionRate = totalSessions > 0 ? purchasedSessions / totalSessions : 0;

    const activeAbandonedCarts = abandonedCarts.filter(c => !c.converted && c.abandoned);
    const abandonedValue = activeAbandonedCarts.reduce((sum, c) => sum + (c.total || 0), 0);
    const avgCartValue = totalPurchases > 0 ? totalRevenue / totalPurchases : 0;

    return {
      totalRevenue,
      totalViews,
      totalPurchases,
      totalAddToCart,
      totalSessions,
      conversionRate,
      abandonedCartsCount: activeAbandonedCarts.length,
      abandonedValue,
      avgCartValue,
    };
  }, [topProducts, funnelData, abandonedCarts]);

  // Estadísticas del embudo
  const funnelStats = useMemo(() => {
    const total = funnelData.length;
    const viewed = funnelData.filter(f => f.stage === "viewed").length;
    const addedToCart = funnelData.filter(f =>
      f.stage === "added_to_cart" || f.stage === "checkout" || f.stage === "purchased"
    ).length;
    const checkedOut = funnelData.filter(f =>
      f.stage === "checkout" || f.stage === "purchased"
    ).length;
    const purchased = funnelData.filter(f => f.stage === "purchased").length;

    return {
      total,
      viewed,
      addedToCart,
      checkedOut,
      purchased,
      viewToCartRate: total > 0 ? addedToCart / total : 0,
      cartToCheckoutRate: addedToCart > 0 ? checkedOut / addedToCart : 0,
      checkoutToPurchaseRate: checkedOut > 0 ? purchased / checkedOut : 0,
      overallRate: total > 0 ? purchased / total : 0,
    };
  }, [funnelData]);

  // Búsquedas agrupadas
  const searchStats = useMemo(() => {
    const withResults = allSearches.filter(s => s.resultsCount > 0);
    const withoutResults = allSearches.filter(s => s.resultsCount === 0);

    // Agrupar por término
    const groupByTerm = (searches: TSearchQuery[]) => {
      const grouped: Record<string, { term: string; count: number; lastSearched: Timestamp }> = {};
      searches.forEach(s => {
        const term = s.searchTerm.toLowerCase();
        if (!grouped[term]) {
          grouped[term] = { term, count: 0, lastSearched: s.timestamp };
        }
        grouped[term].count++;
        if (s.timestamp > grouped[term].lastSearched) {
          grouped[term].lastSearched = s.timestamp;
        }
      });
      return Object.values(grouped).sort((a, b) => b.count - a.count);
    };

    return {
      total: allSearches.length,
      withResults: withResults.length,
      withoutResults: withoutResults.length,
      topSuccessful: groupByTerm(withResults).slice(0, 10),
      topFailed: groupByTerm(withoutResults).slice(0, 10),
    };
  }, [allSearches]);

  // Dispositivos (de carritos abandonados que tienen metadata)
  const deviceStats = useMemo(() => {
    const devices = { mobile: 0, desktop: 0, tablet: 0 };
    abandonedCarts.forEach(cart => {
      const device = cart.metadata?.deviceType || "desktop";
      if (device in devices) {
        devices[device as keyof typeof devices]++;
      }
    });
    const total = devices.mobile + devices.desktop + devices.tablet;
    return {
      ...devices,
      total,
      mobilePercent: total > 0 ? devices.mobile / total : 0,
      desktopPercent: total > 0 ? devices.desktop / total : 0,
      tabletPercent: total > 0 ? devices.tablet / total : 0,
    };
  }, [abandonedCarts]);

  // Top productos por revenue
  const topByRevenue = useMemo(() => {
    return [...topProducts]
      .filter(p => p.totalRevenue > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);
  }, [topProducts]);

  // Top productos por conversión
  const topByConversion = useMemo(() => {
    return [...topProducts]
      .filter(p => p.viewsCount >= 5 && p.conversionRate > 0)
      .sort((a, b) => b.conversionRate - a.conversionRate)
      .slice(0, 10);
  }, [topProducts]);

  return (
    <div className="space-y-6">
      {/* Navegacion interna */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {tiendaNav.map((nav) => {
          const NavIcon = nav.icon;
          const isActive = pathname === nav.href;
          return (
            <Link
              key={nav.href}
              href={nav.href}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-white text-blue-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
              )}
            >
              <NavIcon className="h-4 w-4" />
              {nav.name}
            </Link>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
      <>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Métricas y análisis de la tienda BanderasMDP
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[
            { value: "7", label: "7 días" },
            { value: "30", label: "30 días" },
            { value: "90", label: "90 días" },
            { value: "365", label: "1 año" },
          ].map((option) => (
            <Button
              key={option.value}
              variant={dateRange === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => setDateRange(option.value)}
            >
              {option.label}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={loadAnalytics} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* KPIs Principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <KPICard
          title="Revenue Total"
          value={formatCurrency(kpis.totalRevenue)}
          icon={DollarSign}
          color="text-green-600"
          bgColor="bg-emerald-50"
          subtitle="de productos vendidos"
        />
        <KPICard
          title="Sesiones"
          value={kpis.totalSessions}
          icon={Users}
          bgColor="bg-blue-50"
          subtitle="visitantes únicos"
        />
        <KPICard
          title="Conversión"
          value={formatPercent(kpis.conversionRate)}
          icon={Target}
          color={kpis.conversionRate >= 0.02 ? "text-green-600" : "text-orange-600"}
          bgColor={kpis.conversionRate >= 0.02 ? "bg-emerald-50" : "bg-amber-50"}
          subtitle="de visita a compra"
        />
        <KPICard
          title="Carritos Abandonados"
          value={kpis.abandonedCartsCount}
          icon={ShoppingCart}
          color="text-red-600"
          bgColor="bg-red-50"
          subtitle={`${formatCurrency(kpis.abandonedValue)} perdidos`}
        />
        <KPICard
          title="Ticket Promedio"
          value={formatCurrency(kpis.avgCartValue)}
          icon={ShoppingBag}
          bgColor="bg-violet-50"
          subtitle="valor por compra"
        />
      </div>

      {/* Embudo de Conversión */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Embudo de Conversión
          </CardTitle>
          <CardDescription>
            Recorrido de los usuarios desde la visita hasta la compra
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Visualización del embudo */}
            <div className="grid grid-cols-4 gap-4 text-center">
              {[
                { label: "Visitaron", value: funnelStats.total, color: "bg-blue-600", icon: Eye },
                { label: "Agregaron al Carrito", value: funnelStats.addedToCart, color: "bg-green-600", icon: ShoppingCart },
                { label: "Checkout", value: funnelStats.checkedOut, color: "bg-orange-600", icon: Package },
                { label: "Compraron", value: funnelStats.purchased, color: "bg-purple-600", icon: DollarSign },
              ].map((step, idx) => (
                <div key={step.label} className="relative">
                  <div className={`${step.color} text-white rounded-lg p-4`}>
                    <step.icon className="h-6 w-6 mx-auto mb-2" />
                    <div className="text-2xl font-bold">{step.value}</div>
                    <div className="text-xs opacity-90">{step.label}</div>
                  </div>
                  {idx < 3 && (
                    <div className="absolute top-1/2 -right-2 transform -translate-y-1/2 text-gray-400 text-xl">
                      →
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Tasas de conversión entre etapas */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-lg font-semibold text-green-600">
                  {formatPercent(funnelStats.viewToCartRate)}
                </div>
                <div className="text-xs text-muted-foreground">Vista → Carrito</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-orange-600">
                  {formatPercent(funnelStats.cartToCheckoutRate)}
                </div>
                <div className="text-xs text-muted-foreground">Carrito → Checkout</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-purple-600">
                  {formatPercent(funnelStats.checkoutToPurchaseRate)}
                </div>
                <div className="text-xs text-muted-foreground">Checkout → Compra</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid de 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top Productos por Vistas */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Top Productos por Vistas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Vistas</TableHead>
                  <TableHead className="text-right">Carrito</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.slice(0, 10).map((product, idx) => (
                  <TableRow key={product.productId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">{idx + 1}.</span>
                        <span className="font-medium truncate max-w-[150px]">{product.productName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{product.viewsCount}</TableCell>
                    <TableCell className="text-right">{product.addToCartCount}</TableCell>
                    <TableCell className="text-right">
                      <span className={product.conversionRate >= 0.1 ? "text-green-600 font-semibold" : ""}>
                        {formatPercent(product.conversionRate)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top Productos por Revenue */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Top Productos por Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topByRevenue.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Vendidos</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topByRevenue.map((product, idx) => (
                    <TableRow key={product.productId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-sm">{idx + 1}.</span>
                          <span className="font-medium truncate max-w-[150px]">{product.productName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{product.purchasedCount}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatCurrency(product.totalRevenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>Aún no hay ventas registradas</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Búsquedas Exitosas */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Top Búsquedas
            </CardTitle>
            <CardDescription>
              {searchStats.total} búsquedas totales ({searchStats.withResults} con resultados)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {searchStats.topSuccessful.length > 0 ? (
              <div className="space-y-3">
                {searchStats.topSuccessful.slice(0, 8).map((search, idx) => (
                  <div key={search.term} className="flex items-center gap-3">
                    <span className="text-muted-foreground text-sm w-5">{idx + 1}.</span>
                    <span className="font-mono bg-blue-50 px-2 py-1 rounded text-sm flex-1 truncate">
                      {search.term}
                    </span>
                    <span className="text-sm font-medium">{search.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>Sin búsquedas registradas</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Búsquedas Sin Resultados */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Búsquedas Sin Resultados
            </CardTitle>
            <CardDescription>
              Oportunidades de mejora - productos que los usuarios buscan pero no encuentran
            </CardDescription>
          </CardHeader>
          <CardContent>
            {searchStats.topFailed.length > 0 ? (
              <div className="space-y-3">
                {searchStats.topFailed.slice(0, 8).map((search, idx) => (
                  <div key={search.term} className="flex items-center gap-3">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="font-mono bg-red-50 px-2 py-1 rounded text-sm flex-1 truncate text-red-700">
                      {search.term}
                    </span>
                    <span className="text-sm font-medium text-red-600">{search.count}x</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>¡Todas las búsquedas encontraron resultados!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fila inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Dispositivos */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Dispositivos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-blue-600" />
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Mobile</span>
                    <span className="font-medium">{deviceStats.mobile} ({formatPercent(deviceStats.mobilePercent)})</span>
                  </div>
                  <ProgressBar value={deviceStats.mobile} max={deviceStats.total} color="bg-blue-600" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Monitor className="h-5 w-5 text-green-600" />
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Desktop</span>
                    <span className="font-medium">{deviceStats.desktop} ({formatPercent(deviceStats.desktopPercent)})</span>
                  </div>
                  <ProgressBar value={deviceStats.desktop} max={deviceStats.total} color="bg-green-600" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Tablet className="h-5 w-5 text-purple-600" />
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Tablet</span>
                    <span className="font-medium">{deviceStats.tablet} ({formatPercent(deviceStats.tabletPercent)})</span>
                  </div>
                  <ProgressBar value={deviceStats.tablet} max={deviceStats.total} color="bg-purple-600" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Carritos Abandonados Resumen */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-red-600" />
              Carritos Abandonados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{kpis.abandonedCartsCount}</div>
                  <div className="text-xs text-muted-foreground">Abandonados</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{formatCurrency(kpis.abandonedValue)}</div>
                  <div className="text-xs text-muted-foreground">Valor perdido</div>
                </div>
              </div>
              <div className="pt-2 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Promedio por carrito</span>
                  <span className="font-medium">
                    {kpis.abandonedCartsCount > 0
                      ? formatCurrency(kpis.abandonedValue / kpis.abandonedCartsCount)
                      : formatCurrency(0)
                    }
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mejores Conversores */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-600" />
              Mejores Conversores
            </CardTitle>
            <CardDescription>
              Productos con mejor tasa de conversión (mín. 5 vistas)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topByConversion.length > 0 ? (
              <div className="space-y-3">
                {topByConversion.slice(0, 5).map((product, idx) => (
                  <div key={product.productId} className="flex items-center gap-3">
                    <span className="text-muted-foreground text-sm w-5">{idx + 1}.</span>
                    <span className="flex-1 truncate text-sm">{product.productName}</span>
                    <span className="text-green-600 font-semibold text-sm">
                      {formatPercent(product.conversionRate)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>Se necesitan más datos</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </>
      )}
    </div>
  );
}
