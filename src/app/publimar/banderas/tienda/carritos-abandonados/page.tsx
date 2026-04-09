'use client';
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useFirestore } from "reactfire";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
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
  Search,
  Download,
  AlertTriangle,
  TrendingDown,
  Smartphone,
  Monitor,
  MessageCircle,
  Trash2,
  Loader2,
  LayoutDashboard,
  Package,
  BarChart3,
  ShoppingCart,
} from "lucide-react";
import { TAbandonedCart } from "@/types/abandonedCart";
import { updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { softDelete } from '@/lib/softDelete';
import { toast } from "sonner";

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

// Helper para generar link de recuperación
const generateRecoveryLink = (sessionId: string): string => {
  return `https://banderasmdp.com/tienda/recuperar-carrito/${sessionId}`;
};

// Helper para generar mensaje de WhatsApp
const generateRecoveryWhatsAppMessage = (cart: TAbandonedCart, recoveryLink: string): string => {
  const itemsList = cart.items
    .map((item) => `• ${item.quantity}x ${item.productName}${item.variant ? ` (${item.variant.name})` : ""}`)
    .join("\n");

  const greeting = cart.customer?.name ? `¡Hola ${cart.customer.name.split(" ")[0]}! 👋` : "¡Hola! 👋";

  const message = `${greeting}

Notamos que dejaste algunos productos en tu carrito:

${itemsList}

Total: $${cart.total.toFixed(2)}

¿Querés completar tu compra? Hacé click acá para recuperar tu carrito:
${recoveryLink}

Si tenés alguna duda, estamos para ayudarte! 😊`;

  return encodeURIComponent(message);
};

const tiendaNav = [
  { name: "Dashboard", href: "/publimar/banderas/tienda", icon: LayoutDashboard },
  { name: "Pedidos", href: "/publimar/banderas/tienda/pedidos", icon: Package, badge: true },
  { name: "Carritos", href: "/publimar/banderas/tienda/carritos-abandonados", icon: ShoppingCart, badge: true },
  { name: "Analytics", href: "/publimar/banderas/tienda/analytics", icon: BarChart3 },
];

export default function CarritosAbandonadosPage() {
  const firestore = useFirestore();
  const pathname = usePathname();

  const [carts, setCarts] = useState<TAbandonedCart[]>([]);
  const [filteredCarts, setFilteredCarts] = useState<TAbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  // Estadísticas
  const [totalValue, setTotalValue] = useState(0);
  const [mobilePercent, setMobilePercent] = useState(0);

  useEffect(() => {
    loadCarts();
  }, [firestore]);

  useEffect(() => {
    filterCarts();
  }, [carts, searchTerm, deviceFilter, dateFilter]);

  const loadCarts = async () => {
    try {
      setLoading(true);
      // Mostrar todos los carritos NO convertidos (abandonados o activos)
      // Sin orderBy para evitar necesitar índice compuesto
      const cartsQuery = query(
        collection(firestore, "abandonedCarts"),
        where("converted", "==", false)
      );
      const cartsSnap = await getDocs(cartsQuery);
      let cartsData = cartsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as TAbandonedCart));

      // Ordenar en memoria por updatedAt
      cartsData = cartsData.sort((a, b) => {
        const timeA = a.updatedAt?.seconds || 0;
        const timeB = b.updatedAt?.seconds || 0;
        return timeB - timeA; // desc
      });

      setCarts(cartsData);
      setFilteredCarts(cartsData);

      // Calcular estadísticas
      const total = cartsData.reduce((sum, cart) => sum + cart.total, 0);
      setTotalValue(total);

      const mobileCount = cartsData.filter(cart => cart.metadata.deviceType === "mobile").length;
      setMobilePercent(cartsData.length > 0 ? (mobileCount / cartsData.length) * 100 : 0);

      // Marcar como vistos los que no lo están
      const unviewedCarts = cartsData.filter(cart => !cart.viewed);
      if (unviewedCarts.length > 0) {
        const markAsViewedPromises = unviewedCarts.map(cart =>
          updateDoc(doc(firestore, "abandonedCarts", cart.id), {
            viewed: true,
            viewedAt: serverTimestamp(),
          })
        );
        await Promise.all(markAsViewedPromises);
        console.log(`✅ Marcados ${unviewedCarts.length} carritos como vistos`);
      }
    } catch (error) {
      console.error("Error cargando carritos abandonados:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterCarts = () => {
    let filtered = [...carts];

    // Filtro por búsqueda
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(cart =>
        cart.items.some(item => item.productName.toLowerCase().includes(search)) ||
        cart.sessionId.toLowerCase().includes(search)
      );
    }

    // Filtro por dispositivo
    if (deviceFilter !== "all") {
      filtered = filtered.filter(cart => cart.metadata.deviceType === deviceFilter);
    }

    // Filtro por fecha
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

      filtered = filtered.filter(cart => {
        // Usar abandonedAt si existe, sino lastActivityAt o updatedAt
        const dateToUse = cart.abandonedAt || cart.lastActivityAt || cart.updatedAt;
        if (!dateToUse) return false;
        const cartDate = timestampToDate(dateToUse);
        return cartDate && cartDate >= startDate;
      });
    }

    setFilteredCarts(filtered);
  };

  const exportToCSV = () => {
    const headers = ["Fecha", "Items", "Total", "Dispositivo", "Navegador", "Session ID"];
    const rows = filteredCarts.map(cart => {
      const dateToUse = cart.abandonedAt || cart.lastActivityAt || cart.updatedAt;
      return [
        dateToUse ? formatDate(timestampToDate(dateToUse)!) : "",
        cart.itemsCount,
        cart.total,
        cart.metadata.deviceType,
        cart.metadata.browser || "",
        cart.sessionId,
      ];
    });

    const csv = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carritos-abandonados-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleDeleteCart = async (cart: TAbandonedCart) => {
    if (!confirm(`¿Estás seguro de eliminar este carrito abandonado?\n\nCliente: ${cart.customer?.name || "Sin datos"}\nTotal: $${cart.total.toFixed(2)}\n\nEsta acción no se puede deshacer.`)) {
      return;
    }

    try {
      await softDelete(firestore, "abandonedCarts", cart.id);
      console.log("✅ Carrito abandonado eliminado:", cart.id);

      toast.success("Carrito eliminado correctamente");

      // Recargar carritos
      await loadCarts();
    } catch (error) {
      console.error("❌ Error eliminando carrito:", error);
      toast.error("Error al eliminar el carrito");
    }
  };

  const handleSendRecoveryMessage = async (cart: TAbandonedCart) => {
    try {
      // Generar el link de recuperación
      const recoveryLink = generateRecoveryLink(cart.sessionId);

      // Generar el mensaje de WhatsApp
      const whatsappMessage = generateRecoveryWhatsAppMessage(cart, recoveryLink);

      // Registrar el envío en Firestore
      const cartRef = doc(firestore, "abandonedCarts", cart.id);
      const currentCount = cart.recoveryMessagesSent || 0;

      await updateDoc(cartRef, {
        recoveryMessagesSent: currentCount + 1,
        lastRecoveryMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Usar el teléfono del cliente si está disponible, sino el número por defecto
      const phoneNumber = cart.customer?.phone || "2235416600";

      // Abrir WhatsApp
      window.open(`https://wa.me/549${phoneNumber}?text=${whatsappMessage}`, "_blank");

      toast.success("Mensaje de recuperación enviado");

      // Recargar datos
      await loadCarts();
    } catch (error) {
      console.error("Error enviando mensaje de recuperación:", error);
      toast.error("Error al enviar el mensaje");
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
          <h1 className="text-2xl font-bold tracking-tight">Carritos Abandonados</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filteredCarts.length} de {carts.length} carritos abandonados
          </p>
        </div>
        <Button onClick={exportToCSV} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Valor Total Perdido</span>
              <div className="h-9 w-9 rounded-lg bg-orange-50 flex items-center justify-center">
                <TrendingDown className="h-4.5 w-4.5 text-orange-500" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-orange-600">
              {formatearPrecio(totalValue)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              En {filteredCarts.length} carritos abandonados
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">% Mobile</span>
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Smartphone className="h-4.5 w-4.5 text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">{mobilePercent.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              Abandonan más desde móvil
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">Promedio por Carrito</span>
              <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center">
                <AlertTriangle className="h-4.5 w-4.5 text-violet-600" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {filteredCarts.length > 0
                ? formatearPrecio(totalValue / filteredCarts.length)
                : formatearPrecio(0)
              }
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Valor promedio abandonado
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por producto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={deviceFilter} onValueChange={setDeviceFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos los dispositivos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los dispositivos</SelectItem>
            <SelectItem value="mobile">Mobile</SelectItem>
            <SelectItem value="desktop">Desktop</SelectItem>
            <SelectItem value="tablet">Tablet</SelectItem>
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

      {/* Tabla de Carritos */}
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4">
          {filteredCarts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {carts.length === 0
                ? "¡Excelente! No hay carritos abandonados"
                : "No se encontraron carritos con los filtros seleccionados"
              }
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Productos</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Mensajes</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCarts.map((cart) => {
                  const dateToDisplay = cart.abandonedAt || cart.lastActivityAt || cart.updatedAt;
                  return (
                  <TableRow key={cart.id}>
                    <TableCell>
                      <div>
                        {dateToDisplay && formatDate(timestampToDate(dateToDisplay)!)}
                      </div>
                      {!cart.abandoned && (
                        <div className="text-xs text-orange-600 font-medium">Activo</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {cart.customer ? (
                        <div className="text-sm">
                          <div className="font-medium">{cart.customer.name}</div>
                          {cart.customer.email && (
                            <div className="text-xs text-muted-foreground">{cart.customer.email}</div>
                          )}
                          {cart.customer.phone && (
                            <div className="text-xs text-muted-foreground">{cart.customer.phone}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin datos</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs">
                        {cart.items.slice(0, 2).map((item, idx) => (
                          <div key={idx} className="text-sm">
                            {item.productName}
                            {item.variant && ` (${item.variant.name})`}
                          </div>
                        ))}
                        {cart.items.length > 2 && (
                          <div className="text-xs text-muted-foreground">
                            +{cart.items.length - 2} más
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-orange-600">
                      {formatearPrecio(cart.total)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {cart.metadata.deviceType === "mobile" ? (
                          <Smartphone className="h-4 w-4" />
                        ) : (
                          <Monitor className="h-4 w-4" />
                        )}
                        <span className="text-sm">{cart.metadata.deviceType}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {cart.recoveryMessagesSent ? (
                          <div>
                            <div className="font-medium">{cart.recoveryMessagesSent} enviado{cart.recoveryMessagesSent > 1 ? "s" : ""}</div>
                            {cart.lastRecoveryMessageAt && (
                              <div className="text-xs text-muted-foreground">
                                Último: {formatDate(timestampToDate(cart.lastRecoveryMessageAt)!)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Sin envíos</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() => handleSendRecoveryMessage(cart)}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          disabled={!cart.customer?.phone}
                          title={!cart.customer?.phone ? "No hay teléfono del cliente" : ""}
                        >
                          <MessageCircle className="h-4 w-4" />
                          Enviar WhatsApp
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCart(cart)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Eliminar carrito"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
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
