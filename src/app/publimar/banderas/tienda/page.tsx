'use client';
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useFirestore } from "reactfire";
import { usePathname } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  getCountFromServer,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatearPrecio } from "@/lib/utils";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ShoppingCart,
  Package,
  TrendingUp,
  AlertTriangle,
  Eye,
  Calendar,
  ShoppingBag,
  BarChart3,
  LayoutDashboard,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { TEcommerceOrder } from "@/types/ecommerceOrder";
import { TAbandonedCart } from "@/types/abandonedCart";

// Helper para convertir Timestamp a Date
const timestampToDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000);
  }
  return null;
};

// Navegación interna de la tienda
const tiendaNav = [
  { name: "Dashboard", href: "/publimar/banderas/tienda", icon: LayoutDashboard },
  { name: "Pedidos", href: "/publimar/banderas/tienda/pedidos", icon: Package, badge: true },
  { name: "Carritos", href: "/publimar/banderas/tienda/carritos-abandonados", icon: ShoppingCart, badge: true },
  { name: "Analytics", href: "/publimar/banderas/tienda/analytics", icon: BarChart3 },
];

const statusLabels: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-amber-50 text-amber-700 border border-amber-200" },
  confirmed: { label: "Confirmado", className: "bg-blue-50 text-blue-700 border border-blue-200" },
  delivered: { label: "Entregado", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
};

export default function TiendaDashboardPage() {
  const firestore = useFirestore();
  const pathname = usePathname();

  // Estados para KPIs
  const [loading, setLoading] = useState(true);
  const [todayOrders, setTodayOrders] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [monthOrders, setMonthOrders] = useState(0);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [abandonedCartsCount, setAbandonedCartsCount] = useState(0);
  const [abandonedCartsValue, setAbandonedCartsValue] = useState(0);
  const [conversionRate, setConversionRate] = useState(0);

  // Contadores de no vistos
  const [unviewedOrdersCount, setUnviewedOrdersCount] = useState(0);
  const [unviewedCartsCount, setUnviewedCartsCount] = useState(0);

  // Estados para tablas
  const [recentOrders, setRecentOrders] = useState<TEcommerceOrder[]>([]);
  const [recentAbandoned, setRecentAbandoned] = useState<TAbandonedCart[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, [firestore]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const todayOrdersQuery = query(
        collection(firestore, "ecommerceOrders"),
        where("createdAt", ">=", Timestamp.fromDate(startOfToday)),
        orderBy("createdAt", "desc")
      );
      const todayOrdersSnap = await getDocs(todayOrdersQuery);
      const todayOrdersData = todayOrdersSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as TEcommerceOrder));
      setTodayOrders(todayOrdersData.length);
      setTodayRevenue(todayOrdersData.reduce((sum, order) => sum + order.total, 0));

      const monthOrdersQuery = query(
        collection(firestore, "ecommerceOrders"),
        where("createdAt", ">=", Timestamp.fromDate(startOfMonth)),
        orderBy("createdAt", "desc")
      );
      const monthOrdersSnap = await getDocs(monthOrdersQuery);
      const monthOrdersData = monthOrdersSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as TEcommerceOrder));
      setMonthOrders(monthOrdersData.length);
      setMonthRevenue(monthOrdersData.reduce((sum, order) => sum + order.total, 0));

      const recentOrdersQuery = query(
        collection(firestore, "ecommerceOrders"),
        orderBy("createdAt", "desc"),
        limit(5)
      );
      const recentOrdersSnap = await getDocs(recentOrdersQuery);
      setRecentOrders(recentOrdersSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as TEcommerceOrder)));

      const abandonedQuery = query(
        collection(firestore, "abandonedCarts"),
        where("abandoned", "==", true),
        where("converted", "==", false),
        orderBy("abandonedAt", "desc")
      );
      const abandonedSnap = await getDocs(abandonedQuery);
      const abandonedData = abandonedSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as TAbandonedCart));
      setAbandonedCartsCount(abandonedData.length);
      setAbandonedCartsValue(abandonedData.reduce((sum, cart) => sum + cart.total, 0));
      setRecentAbandoned(abandonedData.slice(0, 5));

      const unviewedOrdersSnap = await getCountFromServer(
        query(collection(firestore, "ecommerceOrders"), where("viewed", "==", false))
      );
      setUnviewedOrdersCount(unviewedOrdersSnap.data().count);

      const unviewedCarts = abandonedData.filter(cart => !cart.viewed);
      setUnviewedCartsCount(unviewedCarts.length);

      const totalCartsSnap = await getCountFromServer(collection(firestore, "abandonedCarts"));
      const convertedCartsSnap = await getCountFromServer(
        query(collection(firestore, "abandonedCarts"), where("converted", "==", true))
      );
      const totalCarts = totalCartsSnap.data().count;
      const convertedCarts = convertedCartsSnap.data().count;
      setConversionRate(totalCarts > 0 ? (convertedCarts / totalCarts) * 100 : 0);

    } catch (error) {
      console.error("Error cargando datos del dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  // Skeleton loading
  if (loading) {
    return (
      <div className="space-y-6">
        {/* Nav skeleton */}
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-10 w-28 bg-gray-200 animate-pulse rounded-lg" />
          ))}
        </div>
        {/* KPI skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 bg-gray-200 animate-pulse rounded-xl" />
          ))}
        </div>
        {/* Table skeleton */}
        <div className="h-64 bg-gray-200 animate-pulse rounded-xl" />
      </div>
    );
  }

  const getBadgeCount = (href: string) => {
    if (href.includes("pedidos")) return unviewedOrdersCount;
    if (href.includes("carritos")) return unviewedCartsCount;
    return 0;
  };

  return (
    <div className="space-y-6">
      {/* Navegacion interna */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {tiendaNav.map((nav) => {
          const Icon = nav.icon;
          const isActive = pathname === nav.href;
          const badgeCount = nav.badge ? getBadgeCount(nav.href) : 0;
          return (
            <Link
              key={nav.href}
              href={nav.href}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative",
                isActive
                  ? "bg-white text-blue-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
              )}
            >
              <Icon className="h-4 w-4" />
              {nav.name}
              {badgeCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Resumen de la tienda online
        </p>
      </div>

      {/* KPIs Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Pedidos Hoy */}
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Pedidos Hoy</span>
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Calendar className="h-4.5 w-4.5 text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">{todayOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatearPrecio(todayRevenue)} en ventas
            </p>
          </CardContent>
        </Card>

        {/* Pedidos del Mes */}
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Pedidos del Mes</span>
              <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="h-4.5 w-4.5 text-emerald-600" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">{monthOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatearPrecio(monthRevenue)} en ventas
            </p>
          </CardContent>
        </Card>

        {/* Carritos Abandonados */}
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Carritos Abandonados</span>
              <div className="h-9 w-9 rounded-lg bg-orange-50 flex items-center justify-center">
                <AlertTriangle className="h-4.5 w-4.5 text-orange-500" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">{abandonedCartsCount}</div>
            <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
              <ArrowDownRight className="h-3 w-3" />
              {formatearPrecio(abandonedCartsValue)} perdidos
            </p>
          </CardContent>
        </Card>

        {/* Tasa de Conversión */}
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Tasa de Conversion</span>
              <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center">
                <ShoppingBag className="h-4.5 w-4.5 text-violet-600" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">{conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3" />
              Carritos que compraron
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tablas */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Últimos Pedidos */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Ultimos Pedidos</CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                <Link href="/publimar/banderas/tienda/pedidos">
                  Ver todos
                  <ArrowUpRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {recentOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No hay pedidos todavia
              </div>
            ) : (
              <div className="space-y-2">
                {recentOrders.map((order) => {
                  const status = statusLabels[order.status] || { label: order.status, className: "bg-gray-50 text-gray-700 border border-gray-200" };
                  return (
                    <Link
                      key={order.id}
                      href={`/publimar/banderas/tienda/${order.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors duration-150 group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                          <Package className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{order.orderNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.createdAt && formatDate(timestampToDate(order.createdAt)!)}
                            {" · "}{order.itemsCount || order.items.length} items
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium", status.className)}>
                          {status.label}
                        </span>
                        <span className="text-sm font-semibold">{formatearPrecio(order.total)}</span>
                        <Eye className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Carritos Abandonados Recientes */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Carritos Abandonados</CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                <Link href="/publimar/banderas/tienda/carritos-abandonados">
                  Ver todos
                  <ArrowUpRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {recentAbandoned.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No hay carritos abandonados
              </div>
            ) : (
              <div className="space-y-2">
                {recentAbandoned.map((cart) => (
                  <div
                    key={cart.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors duration-150"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-orange-50 flex items-center justify-center">
                        <ShoppingCart className="h-4 w-4 text-orange-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{cart.itemsCount} items</p>
                        <p className="text-xs text-muted-foreground">
                          {cart.abandonedAt && formatDate(timestampToDate(cart.abandonedAt)!)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {cart.metadata.deviceType}
                      </span>
                      <span className="text-sm font-semibold text-orange-600">
                        {formatearPrecio(cart.total)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
