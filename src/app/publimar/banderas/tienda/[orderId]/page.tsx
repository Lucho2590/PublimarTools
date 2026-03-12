'use client';
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useFirestore } from "reactfire";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { formatDate, formatearPrecio } from "@/lib/utils";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  Calendar,
  Smartphone,
  Globe,
  MessageSquare,
} from "lucide-react";
import { TEcommerceOrder, EcommerceOrderStatus } from "@/types/ecommerceOrder";
import { toast } from "sonner";
import { processOrderSale, isOrderAlreadyProcessed, cancelOrderSale } from "@/lib/ecommerceHelpers";

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

export default function OrderDetailPage({ params }: { params: { orderId: string } }) {
  const firestore = useFirestore();
  const [order, setOrder] = useState<TEcommerceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadOrder();
  }, [params.orderId, firestore]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const orderRef = doc(firestore, "ecommerceOrders", params.orderId);
      const orderSnap = await getDoc(orderRef);

      if (orderSnap.exists()) {
        setOrder({ ...orderSnap.data(), id: orderSnap.id } as TEcommerceOrder);
      }
    } catch (error) {
      console.error("Error cargando pedido:", error);
      toast.error("Error cargando el pedido");
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (newStatus: EcommerceOrderStatus) => {
    if (!order) return;

    try {
      setUpdating(true);
      const orderRef = doc(firestore, "ecommerceOrders", order.id);

      // Primero obtener el pedido actualizado de Firestore (puede tener saleId que el estado local no tiene)
      const freshOrderSnap = await getDoc(orderRef);
      const freshOrder = freshOrderSnap.exists()
        ? { ...freshOrderSnap.data(), id: freshOrderSnap.id } as TEcommerceOrder
        : order;

      const updates: any = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      };

      // Agregar timestamp específico según el estado
      if (newStatus === "confirmed") {
        updates.confirmedAt = serverTimestamp();
      } else if (newStatus === "shipped") {
        updates.shippedAt = serverTimestamp();
      } else if (newStatus === "delivered") {
        updates.deliveredAt = serverTimestamp();
      } else if (newStatus === "cancelled") {
        updates.cancelledAt = serverTimestamp();
      }

      await updateDoc(orderRef, updates);

      // Procesar venta y descontar stock cuando se envía o entrega (solo la primera vez)
      if ((newStatus === "shipped" || newStatus === "delivered") && !isOrderAlreadyProcessed(freshOrder)) {
        try {
          const { saleNumber } = await processOrderSale(firestore, freshOrder);
          toast.success(`Venta ${saleNumber} creada y stock descontado`);
        } catch (saleError) {
          console.error("Error procesando venta:", saleError);
          toast.error("Estado actualizado pero hubo un error al procesar la venta");
        }
      }
      // Cancelar venta y devolver stock cuando se cancela (si tenía venta)
      else if (newStatus === "cancelled" && isOrderAlreadyProcessed(freshOrder)) {
        try {
          await cancelOrderSale(firestore, freshOrder);
          toast.success("Venta anulada y stock devuelto");
        } catch (cancelError) {
          console.error("Error cancelando venta:", cancelError);
          toast.error("Estado actualizado pero hubo un error al cancelar la venta");
        }
      } else {
        toast.success("Estado actualizado correctamente");
      }

      await loadOrder(); // Recargar el pedido
    } catch (error) {
      console.error("Error actualizando estado:", error);
      toast.error("Error actualizando el estado");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/publimar/banderas/tienda/pedidos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Cargando pedido...</h1>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/publimar/banderas/tienda/pedidos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Pedido no encontrado</h1>
            <p className="text-muted-foreground">El pedido que buscás no existe</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/publimar/banderas/tienda/pedidos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{order.orderNumber}</h1>
            <p className="text-muted-foreground">
              Pedido de tienda online
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <a
            href={`https://wa.me/5492235416600?text=${encodeURIComponent(`Consulta sobre pedido ${order.orderNumber}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Contactar Cliente
          </a>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Columna Principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Productos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Productos del Pedido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Variante</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Precio Unit.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        <div>
                          <div>{item.productName}</div>
                          <div className="text-xs text-muted-foreground">
                            SKU: {item.productSku}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.variant ? (
                          <span className="text-sm">{item.variant.name}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatearPrecio(item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatearPrecio(item.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-semibold">
                      Total:
                    </TableCell>
                    <TableCell className="text-right text-lg font-bold">
                      {formatearPrecio(order.total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Metadata del Pedido */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Información de Navegación
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Dispositivo:</dt>
                  <dd className="font-medium">{order.metadata.deviceType}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Navegador:</dt>
                  <dd className="font-medium">{order.metadata.browser || "Desconocido"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Session ID:</dt>
                  <dd className="font-mono text-xs">{order.metadata.sessionId || "-"}</dd>
                </div>
                {order.metadata.utmSource && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">UTM Source:</dt>
                      <dd className="font-medium">{order.metadata.utmSource}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">UTM Medium:</dt>
                      <dd className="font-medium">{order.metadata.utmMedium || "-"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">UTM Campaign:</dt>
                      <dd className="font-medium">{order.metadata.utmCampaign || "-"}</dd>
                    </div>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Estado del Pedido */}
          <Card>
            <CardHeader>
              <CardTitle>Estado del Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                value={order.status}
                onValueChange={(value) => updateOrderStatus(value as EcommerceOrderStatus)}
                disabled={updating}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="preparing">En Preparación</SelectItem>
                  <SelectItem value="shipped">Enviado</SelectItem>
                  <SelectItem value="delivered">Entregado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>

              <div className="pt-4 border-t space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Creado:</span>
                  <span className="font-medium">
                    {order.createdAt && formatDate(timestampToDate(order.createdAt)!)}
                  </span>
                </div>
                {order.confirmedAt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Confirmado:</span>
                    <span className="font-medium">
                      {formatDate(timestampToDate(order.confirmedAt)!)}
                    </span>
                  </div>
                )}
                {order.shippedAt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Enviado:</span>
                    <span className="font-medium">
                      {formatDate(timestampToDate(order.shippedAt)!)}
                    </span>
                  </div>
                )}
                {order.deliveredAt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Entregado:</span>
                    <span className="font-medium">
                      {formatDate(timestampToDate(order.deliveredAt)!)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Resumen */}
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">{formatearPrecio(order.subtotal)}</span>
              </div>
              {order.shippingCost > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Envío:</span>
                  <span className="font-medium">{formatearPrecio(order.shippingCost)}</span>
                </div>
              )}
              {order.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Descuento:</span>
                  <span className="font-medium text-green-600">
                    -{formatearPrecio(order.discount)}
                  </span>
                </div>
              )}
              <div className="pt-3 border-t flex justify-between">
                <span className="font-semibold">Total:</span>
                <span className="text-lg font-bold">{formatearPrecio(order.total)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Venta Asociada */}
          {order.saleId && (
            <Card className={order.status === "cancelled"
              ? "border-red-200 bg-red-50"
              : "border-green-200 bg-green-50"
            }>
              <CardHeader className="pb-2">
                <CardTitle className={`flex items-center gap-2 ${
                  order.status === "cancelled" ? "text-red-800" : "text-green-800"
                }`}>
                  <Package className="h-5 w-5" />
                  {order.status === "cancelled" ? "Venta Anulada" : "Venta Procesada"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className={order.status === "cancelled" ? "text-red-700" : "text-green-700"}>
                    Número de venta:
                  </span>
                  <span className={`font-mono font-semibold ${
                    order.status === "cancelled" ? "text-red-800 line-through" : "text-green-800"
                  }`}>
                    {order.saleNumber}
                  </span>
                </div>
                <div className={`text-xs ${order.status === "cancelled" ? "text-red-600" : "text-green-600"}`}>
                  {order.status === "cancelled"
                    ? "Stock devuelto automáticamente"
                    : "Stock descontado automáticamente"
                  }
                </div>
              </CardContent>
            </Card>
          )}

          {/* Información Adicional */}
          <Card>
            <CardHeader>
              <CardTitle>Información Adicional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Origen:</span>
                <span className="ml-2 font-medium">{order.source}</span>
              </div>
              <div>
                <span className="text-muted-foreground">WhatsApp enviado:</span>
                <span className="ml-2 font-medium">
                  {order.whatsappMessageSent ? "Sí" : "No"}
                </span>
              </div>
              {order.crmOrderId && (
                <div>
                  <span className="text-muted-foreground">Orden del CRM:</span>
                  <span className="ml-2 font-mono text-xs">{order.crmOrderId}</span>
                </div>
              )}
              {order.internalNotes && (
                <div className="pt-3 border-t">
                  <p className="text-muted-foreground mb-1">Notas internas:</p>
                  <p className="text-xs">{order.internalNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
