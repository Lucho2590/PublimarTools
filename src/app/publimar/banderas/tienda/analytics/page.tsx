"use client";

import { useState, useEffect } from "react";
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
import {
  BarChart3,
  TrendingUp,
  ShoppingCart,
  Eye,
  Search,
  AlertCircle,
  DollarSign,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Package,
} from "lucide-react";

export default function AnalyticsPage() {
  const firestore = useFirestore();

  const [loading, setLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<TProductAnalytics[]>([]);
  const [searchesWithNoResults, setSearchesWithNoResults] = useState<TSearchQuery[]>([]);
  const [funnelStats, setFunnelStats] = useState({
    totalSessions: 0,
    viewedOnly: 0,
    addedToCart: 0,
    checkedOut: 0,
    purchased: 0,
    viewToCartRate: 0,
    cartToCheckoutRate: 0,
    checkoutToPurchaseRate: 0,
    overallConversionRate: 0,
  });

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);

      // 1. Cargar productos más vistos (top 10)
      const productsQuery = query(
        collection(firestore, "productAnalytics"),
        orderBy("viewsCount", "desc"),
        limit(10)
      );
      const productsSnapshot = await getDocs(productsQuery);
      const productsData = productsSnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
      })) as TProductAnalytics[];
      setTopProducts(productsData);

      // 2. Cargar búsquedas sin resultados (últimas 50)
      const searchesQuery = query(
        collection(firestore, "searchQueries"),
        where("resultsCount", "==", 0),
        orderBy("timestamp", "desc"),
        limit(50)
      );
      const searchesSnapshot = await getDocs(searchesQuery);
      const searchesData = searchesSnapshot.docs.map((doc) =>
        doc.data()
      ) as TSearchQuery[];
      setSearchesWithNoResults(searchesData);

      // 3. Calcular estadísticas del embudo de conversión
      const funnelQuery = query(collection(firestore, "conversionFunnels"));
      const funnelSnapshot = await getDocs(funnelQuery);
      const funnelData = funnelSnapshot.docs.map((doc) =>
        doc.data()
      ) as TConversionFunnel[];

      const totalSessions = funnelData.length;
      const viewedOnly = funnelData.filter((f) => f.stage === "viewed").length;
      const addedToCart = funnelData.filter(
        (f) => f.stage === "added_to_cart" || f.stage === "checkout" || f.stage === "purchased"
      ).length;
      const checkedOut = funnelData.filter(
        (f) => f.stage === "checkout" || f.stage === "purchased"
      ).length;
      const purchased = funnelData.filter((f) => f.stage === "purchased").length;

      const viewToCartRate = totalSessions > 0 ? (addedToCart / totalSessions) * 100 : 0;
      const cartToCheckoutRate = addedToCart > 0 ? (checkedOut / addedToCart) * 100 : 0;
      const checkoutToPurchaseRate = checkedOut > 0 ? (purchased / checkedOut) * 100 : 0;
      const overallConversionRate = totalSessions > 0 ? (purchased / totalSessions) * 100 : 0;

      setFunnelStats({
        totalSessions,
        viewedOnly,
        addedToCart,
        checkedOut,
        purchased,
        viewToCartRate,
        cartToCheckoutRate,
        checkoutToPurchaseRate,
        overallConversionRate,
      });
    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  // Agrupar búsquedas sin resultados por término
  const groupedSearches = searchesWithNoResults.reduce((acc, search) => {
    const term = search.searchTerm.toLowerCase();
    if (!acc[term]) {
      acc[term] = { term, count: 0, lastSearched: search.timestamp };
    }
    acc[term].count++;
    if (search.timestamp > acc[term].lastSearched) {
      acc[term].lastSearched = search.timestamp;
    }
    return acc;
  }, {} as Record<string, { term: string; count: number; lastSearched: Timestamp }>);

  const topSearchesNoResults = Object.values(groupedSearches)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mb-4"></div>
            <p className="text-muted-foreground">Cargando analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Analytics Avanzado</h1>
        <p className="text-muted-foreground">
          Análisis detallado del comportamiento de usuarios en la tienda online
        </p>
      </div>

      {/* Embudo de Conversión */}
      <div>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="h-6 w-6" />
          Embudo de Conversión
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Sesiones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{funnelStats.totalSessions}</div>
              <p className="text-xs text-muted-foreground mt-1">
                <Users className="h-3 w-3 inline mr-1" />
                Visitantes únicos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Agregaron al Carrito
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{funnelStats.addedToCart}</div>
              <p className="text-xs text-green-600 mt-1">
                <ArrowUpRight className="h-3 w-3 inline mr-1" />
                {funnelStats.viewToCartRate.toFixed(1)}% conversión
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Iniciaron Checkout
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{funnelStats.checkedOut}</div>
              <p className="text-xs text-green-600 mt-1">
                <ArrowUpRight className="h-3 w-3 inline mr-1" />
                {funnelStats.cartToCheckoutRate.toFixed(1)}% del carrito
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Compraron
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{funnelStats.purchased}</div>
              <p className="text-xs text-green-600 mt-1">
                <ArrowUpRight className="h-3 w-3 inline mr-1" />
                {funnelStats.overallConversionRate.toFixed(1)}% conversión total
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Visualización del embudo */}
        <Card>
          <CardHeader>
            <CardTitle>Visualización del Embudo</CardTitle>
            <CardDescription>Etapas del proceso de compra</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Vistas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">Visualizaron Productos</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {funnelStats.totalSessions} sesiones (100%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className="bg-blue-600 h-3 rounded-full" style={{ width: "100%" }}></div>
                </div>
              </div>

              {/* Carrito */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-green-600" />
                    <span className="font-medium">Agregaron al Carrito</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {funnelStats.addedToCart} sesiones ({funnelStats.viewToCartRate.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-green-600 h-3 rounded-full"
                    style={{ width: `${funnelStats.viewToCartRate}%` }}
                  ></div>
                </div>
              </div>

              {/* Checkout */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-orange-600" />
                    <span className="font-medium">Iniciaron Checkout</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {funnelStats.checkedOut} sesiones (
                    {((funnelStats.checkedOut / funnelStats.totalSessions) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-orange-600 h-3 rounded-full"
                    style={{
                      width: `${(funnelStats.checkedOut / funnelStats.totalSessions) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>

              {/* Compra */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-purple-600" />
                    <span className="font-medium">Completaron Compra</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {funnelStats.purchased} sesiones ({funnelStats.overallConversionRate.toFixed(1)}
                    %)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-purple-600 h-3 rounded-full"
                    style={{ width: `${funnelStats.overallConversionRate}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Productos Más Vistos */}
      <div>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Productos Más Vistos
        </h2>

        <Card>
          <CardHeader>
            <CardTitle>Top 10 Productos por Vistas</CardTitle>
            <CardDescription>
              Productos con mayor cantidad de visualizaciones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Vistas</TableHead>
                  <TableHead className="text-right">En Carrito</TableHead>
                  <TableHead className="text-right">Comprados</TableHead>
                  <TableHead className="text-right">Tasa Conversión</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.length > 0 ? (
                  topProducts.map((product, index) => (
                    <TableRow key={product.productId}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{product.productName}</div>
                          {product.productSku && (
                            <div className="text-xs text-muted-foreground">
                              SKU: {product.productSku}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{product.viewsCount}</TableCell>
                      <TableCell className="text-right">{product.addToCartCount}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {product.purchasedCount}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            product.conversionRate >= 0.1
                              ? "text-green-600 font-semibold"
                              : product.conversionRate >= 0.05
                              ? "text-orange-600"
                              : "text-red-600"
                          }
                        >
                          {(product.conversionRate * 100).toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ${product.totalRevenue.toLocaleString("es-AR")}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No hay datos de productos aún
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Búsquedas Sin Resultados */}
      <div>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <Search className="h-6 w-6" />
          Búsquedas Sin Resultados
        </h2>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Top 10 Búsquedas Sin Resultados
            </CardTitle>
            <CardDescription>
              Términos que los usuarios buscan pero no encuentran productos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Término de Búsqueda</TableHead>
                  <TableHead className="text-right">Cantidad de Búsquedas</TableHead>
                  <TableHead className="text-right">Última Búsqueda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSearchesNoResults.length > 0 ? (
                  topSearchesNoResults.map((search, index) => (
                    <TableRow key={search.term}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
                          {search.term}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{search.count}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {search.lastSearched.toDate().toLocaleDateString("es-AR")}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No hay búsquedas sin resultados registradas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
