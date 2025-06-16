'use client';

import { useState, useEffect } from "react";
import { useFirestore, useFirestoreDocData } from "reactfire";
import { doc, updateDoc, collection, query, where, orderBy, limit, getDocs, addDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Edit, Save, X, Plus, Trash2 } from "lucide-react";
import collections from "@/lib/collections";
import { EOrderStatus, TOrder, TOrderItem, TPaymentHistory } from "@/types/order";
import { EPaymentMethod } from "@/types/sale";
import { formatDate, formatearPrecio } from "@/lib/utils";

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
}

export default function OrderDetailsModal({
  isOpen,
  onClose,
  orderId,
}: OrderDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPago, setLoadingPago] = useState(false);
  const [items, setItems] = useState<TOrderItem[]>([]);
  const [pagoParcial, setPagoParcial] = useState("");
  const [metodoPago, setMetodoPago] = useState<EPaymentMethod>(EPaymentMethod.CASH);
  const [banco, setBanco] = useState<string>("");
  const firestore = useFirestore();

  // Obtener la orden - crear un doc dummy si no hay orderId
  const orderDoc = orderId && firestore 
    ? doc(firestore, collections.ORDERS, orderId) 
    : firestore 
    ? doc(firestore, collections.ORDERS, "dummy") 
    : null;
    
  const { status, data } = useFirestoreDocData(
    orderDoc!, 
    { idField: "id" }
  );

  const order = data as TOrder | null;

  // Inicializar items cuando se carga la orden
  useEffect(() => {
    if (order?.items) {
      setItems(order.items as unknown as TOrderItem[]);
    }
  }, [order]);

  // Reset al cerrar modal
  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setItems([]);
      setPagoParcial("");
      setBanco("");
    }
  }, [isOpen]);

  // Si no tenemos firestore o orderId, mostrar loading
  if (!firestore || !orderId) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Cambiar estado de la orden
  const handleStatusChange = async (newStatus: EOrderStatus) => {
    if (!order || !orderId) return;

    try {
      const orderRef = doc(firestore, collections.ORDERS, orderId);

      // Si el estado es COMPLETED, crear una venta
      if (newStatus === EOrderStatus.COMPLETED) {
        const salesRef = collection(firestore, collections.SALES);
        const salesQuery = query(salesRef, orderBy("number", "desc"), limit(1));
        const salesSnapshot = await getDocs(salesQuery);
        const lastSale = salesSnapshot.docs[0];
        const lastNumber = lastSale ? parseInt(lastSale.data().number) : 0;

        // Obtener información completa de los productos
        const productsRef = collection(firestore, collections.PRODUCTS);
        const productsSnapshot = await getDocs(productsRef);
        const productsData = productsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Crear la venta con información completa de productos
        const saleData = {
          number: order.number,
          items: order.items.map((item: any) => {
            const productData = productsData.find(
              (p) => p.id === item.product.id
            );
            return {
              productId: item.product.id,
              variantId: item.variant,
              categoryId: item.categories,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.quantity * item.unitPrice,
              product: productData,
            };
          }),
          subtotal: order.subtotal,
          total: order.total,
          paymentMethod: metodoPago,
          isInvoiced: false,
          invoiceNumber: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          orderId: order.id,
        };

        await addDoc(salesRef, saleData);
      }

      // Actualizar el estado de la orden
      await updateDoc(orderRef, {
        status: newStatus,
        updatedAt: new Date(),
      });

      toast.success("Estado actualizado correctamente");
    } catch (error) {
      console.error("Error al actualizar el estado:", error);
      toast.error("Error al actualizar el estado");
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
        notes:
          metodoPago === EPaymentMethod.TRANSFER
            ? `Transferencia - ${banco}`
            : "Pago parcial",
      };

      const historialActual = order.paymentHistory || [];

      await updateDoc(doc(firestore, collections.ORDERS, order.id), {
        balance: nuevoSaldo,
        updatedAt: new Date(),
        paymentHistory: [...historialActual, nuevoPago],
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

  // Manejar el guardado de cambios en edición
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    setLoading(true);
    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const updateData: Partial<TOrder> = {
        status: formData.get("status") as EOrderStatus,
        paymentMethod: formData.get("paymentMethod") as EPaymentMethod,
        notes: formData.get("notes") as string,
        items: items as unknown as TOrderItem[],
        downPayment: Number(formData.get("downPayment")) || 0,
        balance: Number(formData.get("balance")) || 0,
        updatedAt: new Date(),
      };

      await updateDoc(doc(firestore, collections.ORDERS, order.id), updateData);
      toast.success("Orden actualizada correctamente");
      setIsEditing(false);
    } catch (error) {
      console.error("Error al actualizar orden:", error);
      toast.error("Error al actualizar la orden");
    } finally {
      setLoading(false);
    }
  };

  // Manejar cambios en items
  const handleItemChange = (
    index: number,
    field: keyof TOrderItem,
    value: any
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  // Agregar nuevo item
  const handleAddItem = () => {
    const newItem: TOrderItem = {
      id: crypto.randomUUID(),
      product: {
        id: "",
        name: "",
        price: 0,
        variants: [],
        categories: [],
        taxRate: 0,
        stock: 0,
        imageUrls: [],
        hasVariants: false,
        sku: "",
      },
      quantity: 1,
      unitPrice: 0,
      subtotal: 0,
      tax: 0,
      taxAmount: 0,
      description: "",
      categories: [],
    };
    setItems([...items, newItem]);
  };

  // Eliminar item
  const handleRemoveItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  if (status === "loading") {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!order || !order.client) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="text-center my-12">
            <h2 className="text-xl font-semibold mb-4">
              No se encontró la orden o datos incompletos
            </h2>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-2xl font-bold">
            Orden #{order.number}
          </DialogTitle>
          <div className="flex gap-2">
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                className="bg-blue-900 hover:bg-blue-600 text-white"
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="submit"
                  form="edit-order-form"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Guardar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  disabled={loading}
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  {/* <X className="h-4 w-4 mr-2 text-red-500" /> */}
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {isEditing ? (
          // Modo edición
          <form id="edit-order-form" onSubmit={handleSave}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Información del Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="clientName">Nombre</Label>
                      <Input
                        id="clientName"
                        defaultValue={order.client.name}
                        disabled
                      />
                    </div>
                    <div>
                      <Label htmlFor="clientContact">Persona de contacto</Label>
                      <Input
                        id="clientContact"
                        defaultValue={order.client.contacts?.[0]?.name || ""}
                        disabled
                      />
                    </div>
                    {order.client.email && (
                      <div>
                        <Label htmlFor="clientEmail">Email</Label>
                        <Input
                          id="clientEmail"
                          defaultValue={
                            order.client.contacts?.[0]?.email || order.client.email
                          }
                          disabled
                        />
                      </div>
                    )}
                    {order.client.phone && (
                      <div>
                        <Label htmlFor="clientPhone">Teléfono</Label>
                        <Input
                          id="clientPhone"
                          defaultValue={
                            order.client.contacts?.[0]?.phone || order.client.phone
                          }
                          disabled
                        />
                      </div>
                    )}
                    {order.client.address && (
                      <div>
                        <Label htmlFor="clientAddress">Dirección</Label>
                        <Input
                          id="clientAddress"
                          defaultValue={order.client.address}
                          disabled
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Detalles de la Orden</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="status">Estado</Label>
                      <Select name="status" defaultValue={order.status}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EOrderStatus.PENDING}>Pendiente</SelectItem>
                          <SelectItem value={EOrderStatus.IN_PROCESS}>En Proceso</SelectItem>
                          <SelectItem value={EOrderStatus.COMPLETED}>Entregada</SelectItem>
                          <SelectItem value={EOrderStatus.CANCELLED}>Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="paymentMethod">Método de pago</Label>
                      <Select name="paymentMethod" defaultValue={order.paymentMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EPaymentMethod.CASH}>Efectivo</SelectItem>
                          <SelectItem value={EPaymentMethod.CREDIT_CARD}>Tarjeta de crédito</SelectItem>
                          <SelectItem value={EPaymentMethod.DEBIT_CARD}>Tarjeta de débito</SelectItem>
                          <SelectItem value={EPaymentMethod.TRANSFER}>Transferencia</SelectItem>
                          <SelectItem value={EPaymentMethod.MERCADOPAGO}>Mercado Pago</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="downPayment">Seña</Label>
                      <Input
                        id="downPayment"
                        name="downPayment"
                        type="number"
                        step="0.01"
                        defaultValue={order.downPayment || 0}
                      />
                    </div>
                    <div>
                      <Label htmlFor="balance">Saldo</Label>
                      <Input
                        id="balance"
                        name="balance"
                        type="number"
                        step="0.01"
                        defaultValue={order.balance || 0}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  Items
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddItem}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Item
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Cant.</TableHead>
                      <TableHead>Desc.</TableHead>
                      <TableHead>Subtotal</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Input
                            value={item.product.name}
                            onChange={(e) =>
                              handleItemChange(index, "product", {
                                ...item.product,
                                name: e.target.value,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) =>
                              handleItemChange(index, "unitPrice", Number(e.target.value))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(index, "quantity", Number(e.target.value))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.discount || 0}
                            onChange={(e) =>
                              handleItemChange(index, "discount", Number(e.target.value))
                            }
                          />
                        </TableCell>
                        <TableCell>{formatearPrecio(item.subtotal)}</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  name="notes"
                  defaultValue={order.notes || ""}
                  placeholder="Notas adicionales..."
                />
              </CardContent>
            </Card>
          </form>
        ) : (
          // Modo vista
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle>Información del Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                  <h3 className="font-medium text-lg">{order.client.name}</h3>
                  {order.client.contacts && order.client.contacts.length > 0 && (
                    <>
                      <p className="text-slate-600">
                        Contacto: {order.client.contacts[0].name}
                      </p>
                      {order.client.contacts[0].email && (
                        <p className="text-slate-600">
                          Email: {order.client.contacts[0].email}
                        </p>
                      )}
                      {order.client.contacts[0].phone && (
                        <p className="text-slate-600">
                          Teléfono: {order.client.contacts[0].phone}
                        </p>
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
                    {order.items.map((item: any) => (
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

            {order.notes && (
              <Card className="mb-6">
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
                      <p className="text-xl font-semibold">
                        {formatearPrecio(order.total || 0)}
                      </p>
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
                        {formatearPrecio(
                          (order.total || 0) - (order.balance || 0)
                        )}
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

                  {/* Formulario de pago parcial - solo si hay saldo */}
                  {order.balance && order.balance > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Registrar pago</h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                          <Label htmlFor="pagoParcial">Monto</Label>
                          <Input
                            id="pagoParcial"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={pagoParcial}
                            onChange={(e) => setPagoParcial(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="metodoPago">Método</Label>
                          <Select value={metodoPago} onValueChange={(value) => setMetodoPago(value as EPaymentMethod)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EPaymentMethod.CASH}>Efectivo</SelectItem>
                              <SelectItem value={EPaymentMethod.CREDIT_CARD}>Tarjeta de crédito</SelectItem>
                              <SelectItem value={EPaymentMethod.DEBIT_CARD}>Tarjeta de débito</SelectItem>
                              <SelectItem value={EPaymentMethod.TRANSFER}>Transferencia</SelectItem>
                              <SelectItem value={EPaymentMethod.MERCADOPAGO}>Mercado Pago</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {metodoPago === EPaymentMethod.TRANSFER && (
                          <div>
                            <Label htmlFor="banco">Banco</Label>
                            <Input
                              id="banco"
                              placeholder="Nombre del banco"
                              value={banco}
                              onChange={(e) => setBanco(e.target.value)}
                            />
                          </div>
                        )}
                        <Button
                          onClick={handlePagoParcial}
                          disabled={loadingPago || !pagoParcial}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {loadingPago ? "Registrando..." : "Registrar pago"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Historial de pagos */}
                  {order.paymentHistory && order.paymentHistory.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Historial de pagos</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Monto</TableHead>
                            <TableHead>Método</TableHead>
                            <TableHead>Notas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {order.paymentHistory.map((payment, index) => (
                            <TableRow key={index}>
                              <TableCell>{formatDate(payment.date)}</TableCell>
                              <TableCell>{formatearPrecio(payment.amount)}</TableCell>
                              <TableCell>
                                {payment.method === EPaymentMethod.CASH
                                  ? "Efectivo"
                                  : payment.method === EPaymentMethod.CREDIT_CARD
                                  ? "Tarjeta de crédito"
                                  : payment.method === EPaymentMethod.DEBIT_CARD
                                  ? "Tarjeta de débito"
                                  : payment.method === EPaymentMethod.TRANSFER
                                  ? "Transferencia"
                                  : payment.method === EPaymentMethod.MERCADOPAGO
                                  ? "Mercado Pago"
                                  : "Otro"}
                              </TableCell>
                              <TableCell>{payment.notes || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
} 