"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useFirestore,
  useFirestoreCollectionData,
  useFirestoreDocData,
  useSigninCheck,
} from "reactfire";
import { doc, updateDoc, collection, query, where } from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { toast } from "sonner";
import { Share2, Printer, ArrowLeft, Check, Trash2 } from "lucide-react";
import collections from "~/lib/collections";
import { EOrderStatus, TOrder, TPaymentHistory } from "~/types/order";
import { EPaymentMethod } from "~/types/sale";
import { formatearPrecio } from "~/lib/utils";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";

export default function OrdenPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(false);
  const [pagoParcial, setPagoParcial] = useState("");
  const [loadingPago, setLoadingPago] = useState(false);
  const [metodoPago, setMetodoPago] = useState<EPaymentMethod>(EPaymentMethod.CASH);
  const [banco, setBanco] = useState<string>("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDownload = searchParams.get("download") === "true";
  const firestore = useFirestore();
  const { status: authStatus, data: signInCheckResult } = useSigninCheck();

  // Verificar autenticación
  if (authStatus === "loading") {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!signInCheckResult.signedIn) {
    router.push("/login");
    return null;
  }

  // Obtener la orden
  const ref = doc(firestore, collections.ORDERS, params.id);
  const { status, data } = useFirestoreDocData(ref, { idField: "id" });

  console.log("ID buscado:", params.id);
  console.log("Datos de la orden:", data);

  // Convertir el data a TOrder
  const order = data as TOrder | null;

  // Formatear fecha
  const formatDate = (date: any) => {
    if (!date) return "-";
    try {
      // Si es un timestamp de Firestore
      if (typeof date === "object" && "seconds" in date) {
        return new Date(date.seconds * 1000).toLocaleDateString("es-AR");
      }
      // Si es una fecha normal
      return new Date(date).toLocaleDateString("es-AR");
    } catch (error) {
      console.error("Error al formatear fecha:", error);
      return "-";
    }
  };

  // Manejar compartir enlace
  const handleShareLink = () => {
    if (!order) return;
    const publicUrl = `${window.location.origin}/publimar/banderas/ordenes/${order.number}`;
    navigator.clipboard.writeText(publicUrl);
    toast.success("Enlace copiado al portapapeles");
  };

  // Manejar impresión
  const handlePrint = () => {
    window.print();
  };

  // Cambiar estado de la orden
  const handleStatusChange = async (newStatus: EOrderStatus) => {
    if (!order) return;

    setLoading(true);
    try {
      const updateData: Partial<TOrder> = {
        status: newStatus,
        updatedAt: new Date(),
      };

      // Actualizar campos específicos según el estado
      if (newStatus === EOrderStatus.IN_PROCESS) {
        updateData.startedAt = new Date();
      } else if (newStatus === EOrderStatus.COMPLETED) {
        updateData.deliveredAt = new Date();
      }

      await updateDoc(doc(firestore, collections.ORDERS, order.id), updateData);
      toast.success(`Estado actualizado a ${newStatus}`);
    } catch (error) {
      console.error("Error al actualizar estado:", error);
      toast.error("Error al actualizar el estado");
    } finally {
      setLoading(false);
    }
  };

  // Manejar pago parcial
  const handlePagoParcial = async () => {
    if (!order || !pagoParcial || isNaN(Number(pagoParcial))) return;
    
    const montoPago = Number(pagoParcial);
    const saldoActual = order.balance || 0;
    
    if (montoPago > saldoActual) {
      toast.error("El monto del pago no puede ser mayor al saldo");
      return;
    }

    if (metodoPago === EPaymentMethod.TRANSFER && !banco) {
      toast.error("Debes seleccionar un banco");
      return;
    }

    setLoadingPago(true);
    try {
      const nuevoSaldo = saldoActual - montoPago;
      const nuevoPago: TPaymentHistory = {
        amount: montoPago,
        date: new Date(),
        method: metodoPago,
        notes: metodoPago === EPaymentMethod.TRANSFER ? `Transferencia - ${banco}` : "Pago parcial"
      };

      const historialActual = order.paymentHistory || [];
      
      await updateDoc(doc(firestore, collections.ORDERS, order.id), {
        balance: nuevoSaldo,
        updatedAt: new Date(),
        paymentHistory: [...historialActual, nuevoPago]
      });
      
      toast.success("Pago registrado correctamente");
      setPagoParcial("");
      setBanco("");
    } catch (error) {
      console.error("Error al registrar pago:", error);
      toast.error("Error al registrar el pago");
    } finally {
      setLoadingPago(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!order || !order.client) {
    return (
      <div className="text-center my-12">
        <h2 className="text-xl font-semibold mb-4">
          No se encontró la orden o datos incompletos
        </h2>
        <Button
          variant="outline"
          onClick={() => router.push("/publimar/banderas/ordenes")}
        >
          Volver a órdenes
        </Button>
      </div>
    );
  }

  // Calcular montos
  const subtotal = order.subtotal || 0;
  const taxAmount = order.taxAmount || 0;
  const total = order.total || 0;

  return (
    <div
      className={`${
        isDownload ? "print:bg-white print:p-0 print:max-w-full" : ""
      }`}
    >
      <div
        className={`flex justify-between items-center mb-6 ${
          isDownload ? "print:hidden" : ""
        }`}
      >
        <div className="flex items-center">
          <Button
            variant="outline"
            onClick={() => router.push("/publimar/banderas/ordenes")}
            className="mr-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Volver
          </Button>
          <h1 className="text-2xl font-bold">Orden #{order.number}</h1>
        </div>
        <div className="flex gap-2">
          {!isDownload && (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/publimar/banderas/ordenes/${params.id}/editar`)
                }
              >
                Editar
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="print:mt-10 print:text-black">
        <div className="text-center mb-8 hidden print:block">
          <h1 className="text-2xl font-bold mb-1">ORDEN DE TRABAJO</h1>
          <p className="text-lg">#{order.number}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Información del Cliente</CardTitle>
            </CardHeader>
            <CardContent>
              <h3 className="font-medium text-lg">{order.client.name}</h3>
              {order.client.contacts && order.client.contacts.length > 0 && (
                <>
                  <p className="text-slate-600">Contacto: {order.client.contacts[0].name}</p>
                 
                  {order.client.contacts[0].email && (
                    <p className="text-slate-600">Email: {order.client.contacts[0].email}</p>
                  )}
                  {order.client.contacts[0].phone && (
                    <p className="text-slate-600">Teléfono: {order.client.contacts[0].phone}</p>
                  )}
                </>
              )}
              {order.client.email && !order.client.contacts?.[0]?.email && (
                <p className="text-slate-600">Email: {order.client.email}</p>
              )}
              {order.client.phone && !order.client.contacts?.[0]?.phone && (
                <p className="text-slate-600">Teléfono: {order.client.phone}</p>
              )}
              {order.client.address && (
                <p className="text-slate-600">
                  Dirección: {order.client.address}
                </p>
              )}
              {order.client.cuit && (
                <p className="text-slate-600">CUIT/CUIL: {order.client.cuit}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalles de la Orden</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Fecha:</span>
                  <span>{formatDate(order.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">
                    Fecha estimada de entrega:
                  </span>
                  <span>{formatDate(order.estimatedDeliveryDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Estado:</span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      order.status === EOrderStatus.IN_PROCESS
                        ? "bg-amber-100 text-amber-800"
                        : order.status === EOrderStatus.COMPLETED
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {order.status === EOrderStatus.IN_PROCESS
                      ? "En Proceso"
                      : order.status === EOrderStatus.COMPLETED
                      ? "Entregada"
                      : "Cancelada"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Forma de pago:</span>
                  <span>
                    {order.paymentMethod === EPaymentMethod.CASH
                      ? "Efectivo"
                      : order.paymentMethod === EPaymentMethod.CREDIT_CARD
                      ? "Tarjeta de crédito"
                      : order.paymentMethod === EPaymentMethod.DEBIT_CARD
                      ? "Tarjeta de débito"
                      : order.paymentMethod === EPaymentMethod.TRANSFER
                      ? "Transferencia"
                      : order.paymentMethod === EPaymentMethod.MERCADOPAGO
                      ? "Mercado Pago"
                      : "No especificada"}
                  </span>
                </div>
                {order.isInvoiced && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Factura:</span>
                    <span>{order.invoiceNumber || "-"}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Cant.</TableHead>
                  <TableHead>Desc.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.product.name}</p>
                        {item.variant && (
                          <p className="text-sm text-slate-500">
                            Medida: {item.variant.size}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-slate-500 mt-1">
                            Nota: {item.notes}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatearPrecio(item.unitPrice)}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>
                      {item.discount && item.discount > 0
                        ? `${item.discount}%`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatearPrecio(item.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 mb-6">
          {order.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{order.notes}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Pagos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Resumen de pagos */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-4 rounded-lg">
                    <p className="text-sm text-slate-600 mb-1">Total</p>
                    <p className="text-xl font-semibold">{formatearPrecio(order.total || 0)}</p>
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Subtotal:</span>
                        <span>{formatearPrecio(order.subtotal || 0)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>IVA ({order.taxRate}%):</span>
                        <span>{formatearPrecio(order.taxAmount || 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-green-600 mb-1">Pagado</p>
                    <p className="text-xl font-semibold text-green-700">
                      {formatearPrecio((order.total || 0) - (order.balance || 0))}
                    </p>
                    <div className="mt-2 pt-2 border-t border-green-100">
                      <div className="flex justify-between text-xs text-green-600">
                        <span>Seña:</span>
                        <span>{formatearPrecio(order.downPayment || 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-amber-50 p-4 rounded-lg">
                    <p className="text-sm text-amber-600 mb-1">Saldo</p>
                    <p className="text-xl font-semibold text-amber-700">
                      {formatearPrecio(order.balance || 0)}
                    </p>
                  </div>
                </div>

                {/* Formulario de pago parcial */}
                {(order.balance || 0) > 0 && (
                  <div className="bg-white border rounded-lg p-4">
                    <h4 className="font-medium mb-4">Registrar nuevo pago</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="pagoParcial" className="pb-1">Monto</Label>
                        <Input
                          id="pagoParcial"
                          type="number"
                          value={pagoParcial}
                          onChange={(e) => setPagoParcial(e.target.value)}
                          placeholder="Ingrese el monto"
                          className="mt-1"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <Label htmlFor="metodoPago" className="p-1">Método de pago</Label>
                        <Select
                          value={metodoPago}
                          onValueChange={(value) => {
                            setMetodoPago(value as EPaymentMethod);
                            if (value !== EPaymentMethod.TRANSFER) {
                              setBanco("");
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccionar método de pago" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EPaymentMethod.CASH}>Efectivo</SelectItem>
                            <SelectItem value={EPaymentMethod.CREDIT_CARD}>Tarjeta de crédito</SelectItem>
                            <SelectItem value={EPaymentMethod.DEBIT_CARD}>Tarjeta de débito</SelectItem>
                            <SelectItem value={EPaymentMethod.TRANSFER}>Transferencia</SelectItem>
                            <SelectItem value={EPaymentMethod.MERCADOPAGO}>Mercado Pago</SelectItem>
                          </SelectContent>
                        </Select>
                        {metodoPago === EPaymentMethod.TRANSFER && (
                          <div className="mt-2">
                            <Label htmlFor="banco" className="pb-1">Banco</Label>
                            <Select
                              value={banco}
                              onValueChange={setBanco}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Seleccionar banco" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Galicia">Banco Galicia</SelectItem>
                                <SelectItem value="Frances">Banco Francés</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      <div className="flex items-end">
                        <Button 
                          onClick={handlePagoParcial}
                          disabled={loadingPago || !pagoParcial || (metodoPago === EPaymentMethod.TRANSFER && !banco)}
                          className="w-full bg-green-600 hover:bg-green-700"
                        >
                          {loadingPago ? (
                            <>
                              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Registrando...
                            </>
                          ) : (
                            "Registrar pago"
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Historial de pagos */}
                {order.paymentHistory && order.paymentHistory.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-4">Historial de pagos</h4>
                    <div className="space-y-2">
                      {order.paymentHistory.map((pago, index) => (
                        <div 
                          key={index} 
                          className="flex justify-between items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-blue-600 text-sm font-medium">
                                {index + 1}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {formatDate(pago.date)}
                              </p>
                              <p className="text-xs text-slate-500">
                                {pago.method === EPaymentMethod.CASH ? "Efectivo" : 
                                 pago.method === EPaymentMethod.CREDIT_CARD ? "Tarjeta de crédito" :
                                 pago.method === EPaymentMethod.DEBIT_CARD ? "Tarjeta de débito" :
                                 pago.method === EPaymentMethod.TRANSFER ? "Transferencia" :
                                 pago.method === EPaymentMethod.MERCADOPAGO ? "Mercado Pago" : "Otro"}
                                {pago.notes && ` - ${pago.notes}`}
                              </p>
                            </div>
                          </div>
                          <span className="font-medium text-green-600">
                            {formatearPrecio(pago.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Acciones de acuerdo al estado actual - solo visible en panel administrativo */}
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>Acciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {/* {order.status === EOrderStatus.PENDING && (
                <Button
                  onClick={() => handleStatusChange(EOrderStatus.IN_PROCESS)}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Iniciar producción
                </Button>
              )} */}

              {order.status === EOrderStatus.IN_PROCESS && (
                <Button
                  onClick={() => handleStatusChange(EOrderStatus.COMPLETED)}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-2" /> Entregada
                </Button>
              )}

              {/* {order.status === EOrderStatus.COMPLETED && (
                <Button
                  onClick={() => handleStatusChange(EOrderStatus.DELIVERED)}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Marcar como entregada
                </Button>
              )} */}

              {/* Siempre permitir cancelar la orden */}
              {order.status !== EOrderStatus.CANCELLED && (
                <Button
                  onClick={() => handleStatusChange(EOrderStatus.CANCELLED)}
                  disabled={loading}
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Cancelar orden
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* {isDownload && (
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.onload = function() {
                window.print();
                setTimeout(function() {
                  window.close();
                }, 1000);
              }
            `,
          }}
        />
      )} */}
    </div>
  );
}
