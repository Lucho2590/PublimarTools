'use client';


import { useState, useEffect } from "react";
import { redirect, useRouter } from "next/navigation";
import { useFirestore, useFirestoreDocData, useSigninCheck } from "reactfire";
import { doc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {  Plus, Trash2 } from "lucide-react";
import collections from "@/lib/collections";
import { EOrderStatus, TOrder, TOrderItem } from "@/types/order";
import { EPaymentMethod } from "@/types/sale";
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
} from "@/components/ui/dialog";
import { TQuoteItem } from "@/types/quote";



export default function EditarOrdenPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TOrderItem[]>([]);
  const router = useRouter();
  const firestore = useFirestore();
  const { status: authStatus, data: signInCheckResult } = useSigninCheck();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // // Verificar autenticación
  // if (authStatus === "loading") {
  //   return (
  //     <div className="flex justify-center items-center h-96">
  //       <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
  //     </div>
  //   );
  // }

  if (!signInCheckResult.signedIn) {
    redirect("/login");
  }

  // Obtener la orden
  const ref = doc(firestore, collections.ORDERS, params.id);
  const { status, data } = useFirestoreDocData(ref, { idField: "id" });

  // Convertir el data a TOrder
  const order = data as TOrder | null;

  // Inicializar items cuando se carga la orden
  useEffect(() => {
    if (order?.items) {
      setItems(order.items as unknown as TOrderItem[]);
    }
  }, [order]);

  // Manejar el guardado de cambios
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
      redirect(`/publimar/banderas/ordenes/${order.id}`);
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
          className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
          variant="outline"
          onClick={() => router.push("/publimar/banderas/ordenes")}
        >
          Volver a órdenes
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="max-w-xs p-4">
          <div className="text-center text-sm text-slate-700 mb-4">
            ¿Cancelar edición? Se perderán los cambios no guardados.
          </div>
          <div className="flex justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
            >
              No, volver
            </Button>
            <Button
              size="sm"
              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
              onClick={() => {
                setShowCancelDialog(false);
                router.push("/publimar/banderas/ordenes");
              }}
            >
              Sí, cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Editar orden</h1>
        <Button
          variant="outline"
          onClick={() => setShowCancelDialog(true)}
          disabled={loading}
          type="button"
          className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
        >
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSave}>
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
                  <Label htmlFor="clientName">Persona de contacto</Label>
                  <Input
                    id="clientName"
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
                {order.client.cuit && (
                  <div>
                    <Label htmlFor="clientCuit">CUIT/CUIL</Label>
                    <Input
                      id="clientCuit"
                      defaultValue={order.client.cuit}
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
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(EOrderStatus).map((status) => (
                        <SelectItem key={status} value={status}>
                          {status === EOrderStatus.IN_PROCESS
                            ? "En Proceso"
                            : status === EOrderStatus.COMPLETED
                            ? "Entregada"
                            : "Cancelada"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="paymentMethod">Forma de pago</Label>
                  <Select
                    name="paymentMethod"
                    defaultValue={order.paymentMethod}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar forma de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(EPaymentMethod).map((method) => (
                        <SelectItem key={method} value={method}>
                          {method === EPaymentMethod.CASH
                            ? "Efectivo"
                            : method === EPaymentMethod.CREDIT_CARD
                            ? "Tarjeta de crédito"
                            : method === EPaymentMethod.DEBIT_CARD
                            ? "Tarjeta de débito"
                            : method === EPaymentMethod.TRANSFER
                            ? "Transferencia"
                            : method === EPaymentMethod.MERCADOPAGO
                            ? "Mercado Pago"
                            : method === EPaymentMethod.CHECK
                            ? "Cheque"
                            : "No especificada"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="notes">Notas</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    defaultValue={order.notes}
                    placeholder="Agregar notas sobre la orden..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sección de Items */}
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Items</CardTitle>
            <Button
              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white mr-4"
              type="button"
              onClick={handleAddItem}
            >
              <Plus className="h-4 w-4 mr-2" /> Agregar Item
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-4 items-end"
                >
                  <div className="col-span-4">
                    <Label>Producto</Label>
                    <Input
                      value={item.product.name}
                      onChange={(e) =>
                        handleItemChange(index, "product", {
                          ...item.product,
                          name: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Precio Unit.</Label>
                    <Input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) =>
                        handleItemChange(
                          index,
                          "unitPrice",
                          Number(e.target.value)
                        )
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Cantidad</Label>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(
                          index,
                          "quantity",
                          Number(e.target.value)
                        )
                      }
                    />
                  </div>
                  <div className="col-span-3">
                    <Label>Subtotal</Label>
                    <Input
                      type="number"
                      value={item.subtotal}
                      onChange={(e) =>
                        handleItemChange(
                          index,
                          "subtotal",
                          Number(e.target.value)
                        )
                      }
                    />
                  </div>  
                  <div className="col-span-1">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => handleRemoveItem(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sección de Pagos */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Pagos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="downPayment">Seña</Label>
                <Input
                  disabled
                  id="downPayment"
                  name="downPayment"
                  type="number"
                  defaultValue={order.downPayment || 0}
                />
              </div>
              <div>
                <Label htmlFor="balance">Saldo</Label>
                <Input
                  disabled
                  id="balance"
                  name="balance"
                  type="number"
                  defaultValue={order.balance || 0}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex justify-end">
          <Button
            className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
            type="submit"
            disabled={loading}
          >
            {loading ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}
