'use client';
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useFirestore } from "reactfire";
import {
  collection,
  query,
  orderBy,
  getDocs,
  where,
  Timestamp,
  doc,
  updateDoc,
} from "firebase/firestore";
import { softDelete } from '@/lib/softDelete';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatDate, formatearPrecio, cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Eye,
  Search,
  Download,
  Trash2,
  Loader2,
  LayoutDashboard,
  ShoppingCart,
  Package,
  BarChart3,
} from "lucide-react";
import { TEcommerceOrder } from "@/types/ecommerceOrder";

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

const tiendaNav = [
  { name: "Dashboard", href: "/publimar/banderas/tienda", icon: LayoutDashboard },
  { name: "Pedidos", href: "/publimar/banderas/tienda/pedidos", icon: Package, badge: true },
  { name: "Carritos", href: "/publimar/banderas/tienda/carritos-abandonados", icon: ShoppingCart, badge: true },
  { name: "Analytics", href: "/publimar/banderas/tienda/analytics", icon: BarChart3 },
];

export default function PedidosPage() {
  const firestore = useFirestore();
  const pathname = usePathname();

  const [orders, setOrders] = useState<TEcommerceOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<TEcommerceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  useEffect(() => {
    loadOrders();
  }, [firestore, dateFilter, statusFilter]);

  useEffect(() => {
    filterOrders();
  }, [orders, searchTerm]);

  const loadOrders = async () => {
    try {
      setLoading(true);

      // Construir query con filtros de Firestore (en vez de traer TODO)
      const constraints: any[] = [];

      // Filtro de fecha en Firestore
      if (dateFilter !== "all") {
        const now = new Date();
        let startDate: Date;
        switch (dateFilter) {
          case "today":
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case "week":
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case "month":
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          default:
            startDate = new Date(0);
        }
        constraints.push(where("createdAt", ">=", Timestamp.fromDate(startDate)));
      }

      // Filtro de estado en Firestore
      if (statusFilter !== "all") {
        constraints.push(where("status", "==", statusFilter));
      }

      constraints.push(orderBy("createdAt", "desc"));

      const ordersQuery = query(
        collection(firestore, "ecommerceOrders"),
        ...constraints
      );
      const ordersSnap = await getDocs(ordersQuery);
      const ordersData = ordersSnap.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as TEcommerceOrder))
        .filter((o: any) => !o.deleted);
      setOrders(ordersData);
      setFilteredOrders(ordersData);

      // Marcar como vistos los que no lo están
      const unviewedOrders = ordersData.filter(order => !order.viewed);
      if (unviewedOrders.length > 0) {
        const markAsViewedPromises = unviewedOrders.map(order =>
          updateDoc(doc(firestore, "ecommerceOrders", order.id), {
            viewed: true,
            viewedAt: Timestamp.now(),
          })
        );
        await Promise.all(markAsViewedPromises);
        console.log(`✅ Marcados ${unviewedOrders.length} pedidos como vistos`);
      }
    } catch (error) {
      console.error("Error cargando pedidos:", error);
    } finally {
      setLoading(false);
    }
  };

  // Solo búsqueda de texto client-side (estado y fecha ya filtrados en Firestore)
  const filterOrders = () => {
    if (!searchTerm.trim()) {
      setFilteredOrders(orders);
      return;
    }

    const search = searchTerm.toLowerCase();
    const filtered = orders.filter(order =>
      order.orderNumber.toLowerCase().includes(search) ||
      order.items.some(item => item.productName.toLowerCase().includes(search))
    );
    setFilteredOrders(filtered);
  };

  const exportToCSV = () => {
    const headers = ["Número", "Fecha", "Items", "Total", "Estado", "Dispositivo"];
    const rows = filteredOrders.map(order => [
      order.orderNumber,
      order.createdAt ? formatDate(timestampToDate(order.createdAt)!) : "",
      order.items.length,
      order.total,
      order.status,
      order.metadata.deviceType,
    ]);

    const csv = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos-tienda-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleDeleteOrder = async (order: TEcommerceOrder) => {
    if (!confirm(`¿Estás seguro de eliminar el pedido ${order.orderNumber}?\n\nEsta acción no se puede deshacer.`)) {
      return;
    }

    try {
      await softDelete(firestore, "ecommerceOrders", order.id);
      console.log("✅ Pedido eliminado:", order.orderNumber);

      // Recargar pedidos
      await loadOrders();
    } catch (error) {
      console.error("❌ Error eliminando pedido:", error);
      alert("Hubo un error al eliminar el pedido. Por favor, intentá nuevamente.");
    }
  };

  const handleStatusChange = async (order: TEcommerceOrder, newStatus: string) => {
    try {
      const orderRef = doc(firestore, "ecommerceOrders", order.id);
      const updateData: any = {
        status: newStatus,
        updatedAt: Timestamp.now(),
      };

      // Agregar timestamp específico según el estado
      if (newStatus === "confirmed" && !order.confirmedAt) {
        updateData.confirmedAt = Timestamp.now();
      } else if (newStatus === "shipped" && !order.shippedAt) {
        updateData.shippedAt = Timestamp.now();
      } else if (newStatus === "delivered" && !order.deliveredAt) {
        updateData.deliveredAt = Timestamp.now();
      } else if (newStatus === "cancelled" && !order.cancelledAt) {
        updateData.cancelledAt = Timestamp.now();
      }

      await updateDoc(orderRef, updateData);
      console.log("✅ Estado actualizado:", order.orderNumber, "→", newStatus);

      // Recargar pedidos
      await loadOrders();
    } catch (error) {
      console.error("❌ Error actualizando estado:", error);
      alert("Hubo un error al actualizar el estado. Por favor, intentá nuevamente.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Navegacion interna */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {tiendaNav.map((nav) => {
          const Icon = nav.icon;
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
              <Icon className="h-4 w-4" />
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedidos de Tienda Online</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filteredOrders.length} de {orders.length} pedidos
          </p>
        </div>
        <Button onClick={exportToCSV} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número o producto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="confirmed">Confirmado</SelectItem>
            <SelectItem value="preparing">En preparación</SelectItem>
            <SelectItem value="shipped">Enviado</SelectItem>
            <SelectItem value="delivered">Entregado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Todas las fechas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las fechas</SelectItem>
            <SelectItem value="today">Hoy</SelectItem>
            <SelectItem value="week">Última semana</SelectItem>
            <SelectItem value="month">Este mes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla de Pedidos */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No se encontraron pedidos con los filtros seleccionados
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
                  <TableHead>Origen</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm font-medium">
                      {order.orderNumber}
                    </TableCell>
                    <TableCell>
                      {order.createdAt && formatDate(timestampToDate(order.createdAt)!)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {order.items.length} {order.items.length === 1 ? "item" : "items"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {order.items[0]?.productName}
                        {order.items.length > 1 && ` +${order.items.length - 1}`}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatearPrecio(order.total)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={order.status}
                        onValueChange={(newStatus) => handleStatusChange(order, newStatus)}
                      >
                        <SelectTrigger className={`w-[140px] text-xs font-medium ${
                          order.status === 'pending' ? 'bg-yellow-50 text-yellow-800 border-yellow-200' :
                          order.status === 'confirmed' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                          order.status === 'preparing' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                          order.status === 'shipped' ? 'bg-indigo-50 text-indigo-800 border-indigo-200' :
                          order.status === 'delivered' ? 'bg-green-50 text-green-800 border-green-200' :
                          order.status === 'cancelled' ? 'bg-red-50 text-red-800 border-red-200' :
                          'bg-gray-50 text-gray-800'
                        }`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendiente</SelectItem>
                          <SelectItem value="confirmed">Confirmado</SelectItem>
                          <SelectItem value="preparing">En preparación</SelectItem>
                          <SelectItem value="shipped">Enviado</SelectItem>
                          <SelectItem value="delivered">Entregado</SelectItem>
                          <SelectItem value="cancelled">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {order.source}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{order.metadata.deviceType}</div>
                      <div>{order.metadata.browser}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/publimar/banderas/tienda/${order.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteOrder(order)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
