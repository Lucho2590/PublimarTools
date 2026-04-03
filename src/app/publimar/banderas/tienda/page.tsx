'use client';
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useFirestore } from "reactfire";
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
import {
  ShoppingCart,
  Package,
  TrendingUp,
  AlertTriangle,
  Eye,
  Calendar,
  DollarSign,
  ShoppingBag,
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

export default function TiendaDashboardPage() {
  const firestore = useFirestore();

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

      // ==========================================
      // PEDIDOS DEL DÍA
      // ==========================================
      const todayOrdersQuery = query(
        collection(firestore, "ecommerceOrders"),
        where("createdAt", ">=", Timestamp.fromDate(startOfToday)),
        orderBy("createdAt", "desc")
      );
      const todayOrdersSnap = await getDocs(todayOrdersQuery);
      const todayOrdersData = todayOrdersSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as TEcommerceOrder));

      setTodayOrders(todayOrdersData.length);
      setTodayRevenue(todayOrdersData.reduce((sum, order) => sum + order.total, 0));

      // ==========================================
      // PEDIDOS DEL MES
      // ==========================================
      const monthOrdersQuery = query(
        collection(firestore, "ecommerceOrders"),
        where("createdAt", ">=", Timestamp.fromDate(startOfMonth)),
        orderBy("createdAt", "desc")
      );
      const monthOrdersSnap = await getDocs(monthOrdersQuery);
      const monthOrdersData = monthOrdersSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as TEcommerceOrder));

      setMonthOrders(monthOrdersData.length);
      setMonthRevenue(monthOrdersData.reduce((sum, order) => sum + order.total, 0));

      // ==========================================
      // ÚLTIMOS 5 PEDIDOS
      // ==========================================
      const recentOrdersQuery = query(
        collection(firestore, "ecommerceOrders"),
        orderBy("createdAt", "desc"),
        limit(5)
      );
      const recentOrdersSnap = await getDocs(recentOrdersQuery);
      setRecentOrders(recentOrdersSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as TEcommerceOrder)));

      // ==========================================
      // CARRITOS ABANDONADOS (NO CONVERTIDOS)
      // ==========================================
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

      // ==========================================
      // CONTADORES DE NO VISTOS (usando getCountFromServer en vez de traer TODOS los docs)
      // ==========================================
      const unviewedOrdersSnap = await getCountFromServer(
        query(collection(firestore, "ecommerceOrders"), where("viewed", "==", false))
      );
      setUnviewedOrdersCount(unviewedOrdersSnap.data().count);

      const unviewedCarts = abandonedData.filter(cart => !cart.viewed);
      setUnviewedCartsCount(unviewedCarts.length);

      // ==========================================
      // TASA DE CONVERSIÓN
      // ==========================================
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Tienda Online - Dashboard</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 w-24 bg-gray-200 animate-pulse rounded"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 w-32 bg-gray-200 animate-pulse rounded mt-2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tienda Online - Dashboard</h1>
          <p className="text-muted-foreground">
            Gestión de pedidos y análisis de la tienda web
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="relative">
            <Link href="/publimar/banderas/tienda/pedidos">
              <Package className="mr-2 h-4 w-4" />
              Ver Todos los Pedidos
              {unviewedOrdersCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {unviewedOrdersCount}
                </span>
              )}
            </Link>
          </Button>
          <Button asChild variant="outline" className="relative">
            <Link href="/publimar/banderas/tienda/carritos-abandonados">
              <ShoppingCart className="mr-2 h-4 w-4" />
              Carritos Abandonados
              {unviewedCartsCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {unviewedCartsCount}
                </span>
              )}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/publimar/banderas/tienda/analytics">
              <TrendingUp className="mr-2 h-4 w-4" />
              Ver Analytics
            </Link>
          </Button>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Pedidos Hoy */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pedidos Hoy</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayOrders}</div>
            <p className="text-xs text-muted-foreground">
              {formatearPrecio(todayRevenue)} en ventas
            </p>
          </CardContent>
        </Card>

        {/* Pedidos del Mes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pedidos del Mes</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthOrders}</div>
            <p className="text-xs text-muted-foreground">
              {formatearPrecio(monthRevenue)} en ventas
            </p>
          </CardContent>
        </Card>

        {/* Carritos Abandonados */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Carritos Abandonados</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{abandonedCartsCount}</div>
            <p className="text-xs text-muted-foreground">
              {formatearPrecio(abandonedCartsValue)} perdidos
            </p>
          </CardContent>
        </Card>

        {/* Tasa de Conversión */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Conversión</CardTitle>
            <ShoppingBag className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              Carritos que compraron
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Últimos Pedidos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Últimos Pedidos</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/publimar/banderas/tienda/pedidos">
                Ver todos
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay pedidos todavía
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Pedido</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">
                      {order.orderNumber}
                    </TableCell>
                    <TableCell>
                      {order.createdAt && formatDate(timestampToDate(order.createdAt)!)}
                    </TableCell>
                    <TableCell>{order.itemsCount || order.items.length} items</TableCell>
                    <TableCell className="font-semibold">
                      {formatearPrecio(order.total)}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                        order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/publimar/banderas/tienda/${order.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Carritos Abandonados Recientes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Carritos Abandonados Recientes</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/publimar/banderas/tienda/carritos-abandonados">
                Ver todos
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentAbandoned.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              ¡Excelente! No hay carritos abandonados
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha Abandono</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Dispositivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAbandoned.map((cart) => (
                  <TableRow key={cart.id}>
                    <TableCell>
                      {cart.abandonedAt && formatDate(timestampToDate(cart.abandonedAt)!)}
                    </TableCell>
                    <TableCell>{cart.itemsCount} items</TableCell>
                    <TableCell className="font-semibold text-orange-600">
                      {formatearPrecio(cart.total)}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {cart.metadata.deviceType} - {cart.metadata.browser}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
