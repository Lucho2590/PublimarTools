"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useUser, useFirestoreCollectionData } from "reactfire";
import { collection, addDoc, serverTimestamp, doc, query, where, orderBy } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import collections from "@/lib/collections";
import { EQuoteStatus, TQuoteItem } from "@/types/quote";
import { EClientSection, TClient } from "@/types/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2, Plus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function NuevoPresupuestoPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const firestore = useFirestore();
  const { data: user } = useUser();

  const [formData, setFormData] = useState({
    clientId: "",
    validUntil: "",
    notes: "",
    taxRate: 21, // IVA 21% por defecto
  });

  const [items, setItems] = useState<Partial<TQuoteItem>[]>([
    {
      productName: "",
      description: "",
      quantity: 1,
      unitPrice: 0,
      discount: 0,
      tax: 21,
      isManual: true,
    },
  ]);

  // Cargar clientes de vía pública
  const clientsCollection = collection(firestore, collections.CLIENTS);
  const clientsQuery = query(
    clientsCollection,
    where("section", "==", EClientSection.VIA_PUBLICA),
    orderBy("name")
  );
  const { data: clients } = useFirestoreCollectionData(clientsQuery, {
    idField: "id",
  }) as { data: TClient[] };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleItemChange = (
    index: number,
    field: keyof TQuoteItem,
    value: string | number
  ) => {
    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
    };

    // Recalcular subtotal del item
    if (field === "quantity" || field === "unitPrice" || field === "discount") {
      const item = updatedItems[index];
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const discount = Number(item.discount) || 0;
      const tax = Number(item.tax) || 0;

      const subtotalBeforeDiscount = quantity * unitPrice;
      const discountAmount = (subtotalBeforeDiscount * discount) / 100;
      const subtotal = subtotalBeforeDiscount - discountAmount;
      const taxAmount = (subtotal * tax) / 100;

      updatedItems[index] = {
        ...updatedItems[index],
        subtotal,
        taxAmount,
      };
    }

    setItems(updatedItems);
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        productName: "",
        description: "",
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        tax: formData.taxRate,
        isManual: true,
      },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      const updatedItems = items.filter((_, i) => i !== index);
      setItems(updatedItems);
    }
  };

  // Calcular totales
  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    items.forEach((item) => {
      subtotal += Number(item.subtotal) || 0;
      taxAmount += Number(item.taxAmount) || 0;
    });

    const total = subtotal + taxAmount;

    return {
      subtotal,
      taxAmount,
      total,
    };
  };

  const totals = calculateTotals();

  // Generar número de presupuesto
  const generateQuoteNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    return `VP-${year}${month}${day}-${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!formData.clientId) {
      toast.error("Debes seleccionar un cliente");
      return;
    }

    if (!formData.validUntil) {
      toast.error("Debes establecer una fecha de validez");
      return;
    }

    // Validar que haya al menos un item completo
    const validItems = items.filter(
      (item) => item.productName && item.quantity && item.unitPrice
    );

    if (validItems.length === 0) {
      toast.error("Debes agregar al menos un item al presupuesto");
      return;
    }

    if (!user) {
      toast.error("Debes estar logueado para crear un presupuesto");
      return;
    }

    setLoading(true);

    try {
      // Obtener el cliente seleccionado
      const selectedClient = clients?.find((c) => c.id === formData.clientId);

      if (!selectedClient) {
        toast.error("Cliente no encontrado");
        return;
      }

      // Preparar items con IDs
      const preparedItems = validItems.map((item) => ({
        id: Math.random().toString(36).substring(7),
        productName: item.productName || "",
        description: item.description || "",
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        discount: Number(item.discount) || 0,
        subtotal: Number(item.subtotal) || 0,
        tax: Number(item.tax) || 0,
        taxAmount: Number(item.taxAmount) || 0,
        isManual: true,
      }));

      // Crear el presupuesto
      const quoteData: Record<string, any> = {
        number: generateQuoteNumber(),
        client: selectedClient,
        items: preparedItems,
        subtotal: totals.subtotal,
        taxRate: formData.taxRate,
        tax: formData.taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        status: EQuoteStatus.DRAFT,
        validUntil: new Date(formData.validUntil),
        notes: formData.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: doc(firestore, `users/${user.uid}`),
        updatedBy: doc(firestore, `users/${user.uid}`),
      };

      const quotesCollection = collection(firestore, collections.QUOTES);
      await addDoc(quotesCollection, quoteData);

      toast.success("Presupuesto creado con éxito");
      router.push("/publimar/viaPublica/presupuestos");
    } catch (error) {
      console.error("Error al crear el presupuesto:", error);
      toast.error("Error al crear el presupuesto");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Crear nuevo presupuesto</h1>
        <Button
          variant="outline"
          onClick={() => router.push("/publimar/viaPublica/presupuestos")}
          className="bg-red-500 hover:bg-red-600 text-white"
        >
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Información del presupuesto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clientId">Cliente</Label>
                <Select
                  value={formData.clientId}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, clientId: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="validUntil">Válido hasta</Label>
                <Input
                  id="validUntil"
                  name="validUntil"
                  type="date"
                  value={formData.validUntil}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                placeholder="Notas adicionales del presupuesto..."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Items del presupuesto</CardTitle>
            <Button
              type="button"
              onClick={addItem}
              variant="outline"
              size="sm"
              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar item
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Producto</TableHead>
                    <TableHead className="w-[250px]">Descripción</TableHead>
                    <TableHead className="w-[100px]">Cantidad</TableHead>
                    <TableHead className="w-[120px]">P. Unitario</TableHead>
                    <TableHead className="w-[100px]">Desc. %</TableHead>
                    <TableHead className="w-[100px]">IVA %</TableHead>
                    <TableHead className="w-[120px]">Subtotal</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          value={item.productName}
                          onChange={(e) =>
                            handleItemChange(index, "productName", e.target.value)
                          }
                          placeholder="Nombre del producto"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.description}
                          onChange={(e) =>
                            handleItemChange(index, "description", e.target.value)
                          }
                          placeholder="Descripción"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              "quantity",
                              Number(e.target.value)
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              "unitPrice",
                              Number(e.target.value)
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={item.discount}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              "discount",
                              Number(e.target.value)
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={item.tax}
                          onChange={(e) =>
                            handleItemChange(index, "tax", Number(e.target.value))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(Number(item.subtotal) || 0)}
                      </TableCell>
                      <TableCell>
                        {items.length > 1 && (
                          <Button
                            type="button"
                            onClick={() => removeItem(index)}
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span className="font-medium">
                    {formatCurrency(totals.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>IVA:</span>
                  <span className="font-medium">
                    {formatCurrency(totals.taxAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total:</span>
                  <span>{formatCurrency(totals.total)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardFooter className="flex justify-between pt-6">
            <Button
              variant="outline"
              onClick={() => router.push("/publimar/viaPublica/presupuestos")}
              disabled={loading}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 hover:text-white text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? "Guardando..." : "Guardar presupuesto"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
