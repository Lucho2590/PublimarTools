"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useUser, useFirestoreCollectionData } from "reactfire";
import { collection, addDoc, serverTimestamp, doc, query, where, orderBy, Query, CollectionReference } from "firebase/firestore";
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
import { TDeviceType } from "@/types/device";
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
import { DeviceAutocomplete } from "@/components/ui/device-autocomplete";
import { Checkbox } from "@/components/ui/checkbox";

export default function NuevoPresupuestoPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const firestore = useFirestore();
  const { data: user } = useUser();

  const [formData, setFormData] = useState({
    clientId: "",
    fecha: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const [items, setItems] = useState<Partial<TQuoteItem>[]>([
    {
      productName: "",
      quantity: undefined,
      unitPrice: undefined,
      description: "",
      isManual: true,
    },
  ]);

  // Estado para impresiones/afiches
  const [conImpresiones, setConImpresiones] = useState(false);
  const [impresiones, setImpresiones] = useState({
    costo: undefined as number | undefined,
    venta: undefined as number | undefined,
  });

  // Estado para formas de pago
  const [formasPago, setFormasPago] = useState<{ tipo: string; monto: number | undefined; cuenta: string; factura: boolean; tipoFactura: "" | "A" | "C" }[]>([
    { tipo: "", monto: undefined, cuenta: "", factura: false, tipoFactura: "" },
  ]);

  const addFormaPago = () => {
    setFormasPago([...formasPago, { tipo: "", monto: undefined, cuenta: "", factura: false, tipoFactura: "" }]);
  };

  const removeFormaPago = (index: number) => {
    if (formasPago.length > 1) {
      setFormasPago(formasPago.filter((_, i) => i !== index));
    }
  };

  const handleFormaPagoChange = (index: number, field: string, value: string | number | boolean | undefined) => {
    const updated = [...formasPago];
    updated[index] = { ...updated[index], [field]: value };
    // Si cambia el tipo y no es transferencia, limpiar cuenta
    if (field === "tipo" && value !== "transferencia") {
      updated[index].cuenta = "";
    }
    // Si desactiva factura, limpiar tipoFactura
    if (field === "factura" && value === false) {
      updated[index].tipoFactura = "";
    }
    setFormasPago(updated);
  };

  // Cargar clientes de vía pública
  const clientsCollection = collection(firestore, collections.CLIENTS);
  const clientsQuery = query(
    clientsCollection,
    where("section", "==", EClientSection.VIA_PUBLICA),
    orderBy("name")
  );
  const { data: clients } = useFirestoreCollectionData<TClient>(clientsQuery as Query<TClient>, {
    idField: "id",
  });

  // Cargar dispositivos
  const devicesCollection = collection(firestore, "devices");
  const { data: devices } = useFirestoreCollectionData<TDeviceType>(devicesCollection as CollectionReference<TDeviceType>, {
    idField: "id",
  }) as { data: TDeviceType[] };

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
    setItems(updatedItems);
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        productName: "",
        quantity: undefined,
        unitPrice: undefined,
        description: "",
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
    let subtotalDispositivos = 0;

    items.forEach((item) => {
      const cantidad = Number(item.quantity) || 0;
      const precio = Number(item.unitPrice) || 0;
      subtotalDispositivos += cantidad * precio;
    });

    const ventaImpresiones = conImpresiones ? Number(impresiones.venta) || 0 : 0;
    const totalVenta = subtotalDispositivos + ventaImpresiones;

    return {
      subtotalDispositivos,
      ventaImpresiones,
      totalVenta,
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

    if (!formData.fecha) {
      toast.error("Debes establecer una fecha");
      return;
    }

    // Validar que haya al menos un item con dispositivo
    const validItems = items.filter((item) => item.productName);

    if (validItems.length === 0) {
      toast.error("Debes agregar al menos un dispositivo");
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

      // Preparar items
      const preparedItems = validItems.map((item) => ({
        id: Math.random().toString(36).substring(7),
        productName: item.productName || "",
        description: item.description || "",
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        subtotal: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
        tax: 0,
        taxAmount: 0,
        isManual: true,
      }));

      // Preparar formas de pago con facturación
      const preparedFormasPago = formasPago
        .filter(fp => fp.tipo && fp.monto && fp.monto > 0)
        .map(fp => ({
          tipo: fp.tipo,
          monto: fp.monto,
          cuenta: fp.cuenta || null,
          factura: fp.factura,
          tipoFactura: fp.factura ? fp.tipoFactura : null,
        }));

      // Crear el presupuesto
      const quoteData: Record<string, unknown> = {
        number: generateQuoteNumber(),
        client: selectedClient,
        items: preparedItems,
        // Campos de vía pública
        fecha: new Date(formData.fecha),
        formasPago: preparedFormasPago,
        // Impresiones
        conImpresiones,
        impresiones: conImpresiones ? {
          costo: Number(impresiones.costo) || 0,
          venta: Number(impresiones.venta) || 0,
        } : null,
        // Totales
        subtotalDispositivos: totals.subtotalDispositivos,
        ventaImpresiones: totals.ventaImpresiones,
        totalVenta: totals.totalVenta,
        // Campos estándar
        subtotal: totals.subtotalDispositivos,
        taxRate: 0,
        tax: 0,
        taxAmount: 0,
        total: totals.totalVenta,
        status: EQuoteStatus.DRAFT,
        validUntil: new Date(formData.fecha),
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
        <h1 className="text-2xl font-bold">Nuevo Presupuesto - Vía Pública</h1>
        <Button
          variant="outline"
          onClick={() => router.push("/publimar/viaPublica/presupuestos")}
          className="bg-red-500 hover:bg-red-600 text-white"
        >
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Información General */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Información General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha</Label>
                <Input
                  id="fecha"
                  name="fecha"
                  type="date"
                  value={formData.fecha}
                  onChange={handleChange}
                  required
                />
              </div>

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
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observaciones Generales</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={2}
                placeholder="Observaciones del presupuesto..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Items / Dispositivos */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Dispositivos</CardTitle>
            <Button
              type="button"
              onClick={addItem}
              variant="outline"
              size="sm"
              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[220px]">Dispositivo</TableHead>
                      <TableHead className="w-[100px]">Cantidad</TableHead>
                      <TableHead className="w-[140px]">Precio Unit.</TableHead>
                      <TableHead>Observaciones</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <DeviceAutocomplete
                            devices={devices || []}
                            value={item.productName || ""}
                            onChange={(value) =>
                              handleItemChange(index, "productName", value)
                            }
                            placeholder="Seleccionar dispositivo..."
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity ?? ""}
                            onChange={(e) =>
                              handleItemChange(index, "quantity", e.target.value ? Number(e.target.value) : 0)
                            }
                            placeholder="Cant."
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice ?? ""}
                            onChange={(e) =>
                              handleItemChange(index, "unitPrice", e.target.value ? Number(e.target.value) : 0)
                            }
                            placeholder="$"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.description || ""}
                            onChange={(e) =>
                              handleItemChange(index, "description", e.target.value)
                            }
                            placeholder="Observaciones..."
                          />
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

            {/* Subtotal dispositivos */}
            <div className="mt-4 text-right text-sm text-slate-600">
              Subtotal dispositivos: <span className="font-semibold">{formatCurrency(totals.subtotalDispositivos)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Impresiones / Afiches */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <Checkbox
                id="conImpresiones"
                checked={conImpresiones}
                onCheckedChange={(checked) => setConImpresiones(checked === true)}
              />
              <label htmlFor="conImpresiones" className="text-lg font-semibold cursor-pointer">
                ¿Agregar impresiones / afiches?
              </label>
            </div>
          </CardHeader>
          {conImpresiones && (
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="costoImpresiones">Costo impresiones</Label>
                  <Input
                    id="costoImpresiones"
                    type="number"
                    min="0"
                    step="0.01"
                    value={impresiones.costo ?? ""}
                    onChange={(e) =>
                      setImpresiones((prev) => ({ ...prev, costo: e.target.value ? Number(e.target.value) : undefined }))
                    }
                    placeholder="$"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ventaImpresiones">Venta impresiones</Label>
                  <Input
                    id="ventaImpresiones"
                    type="number"
                    min="0"
                    step="0.01"
                    value={impresiones.venta ?? ""}
                    onChange={(e) =>
                      setImpresiones((prev) => ({ ...prev, venta: e.target.value ? Number(e.target.value) : undefined }))
                    }
                    placeholder="$"
                  />
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Formas de Pago */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Formas de Pago</CardTitle>
            <Button
              type="button"
              onClick={addFormaPago}
              variant="outline"
              size="sm"
              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {formasPago.map((fp, index) => (
                <div key={index} className="flex flex-wrap items-center gap-3 pb-3 border-b last:border-b-0">
                  <div className="w-[160px]">
                    <Select
                      value={fp.tipo}
                      onValueChange={(value) => handleFormaPagoChange(index, "tipo", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                        <SelectItem value="canje">Canje</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[120px]">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={fp.monto ?? ""}
                      onChange={(e) => handleFormaPagoChange(index, "monto", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="Monto $"
                    />
                  </div>
                  {fp.tipo === "transferencia" && (
                    <div className="w-[160px]">
                      <Input
                        value={fp.cuenta}
                        onChange={(e) => handleFormaPagoChange(index, "cuenta", e.target.value)}
                        placeholder="Cuenta destino..."
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`factura-${index}`}
                      checked={fp.factura}
                      onCheckedChange={(checked) => handleFormaPagoChange(index, "factura", checked === true)}
                    />
                    <label htmlFor={`factura-${index}`} className="text-sm whitespace-nowrap">
                      Factura
                    </label>
                    {fp.factura && (
                      <Select
                        value={fp.tipoFactura}
                        onValueChange={(value) => handleFormaPagoChange(index, "tipoFactura", value)}
                      >
                        <SelectTrigger className="w-[70px]">
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {formasPago.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => removeFormaPago(index)}
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 ml-auto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Resumen / Totales */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-w-md">
              <div className="flex justify-between text-sm">
                <span>Dispositivos:</span>
                <span className="font-medium">{formatCurrency(totals.subtotalDispositivos)}</span>
              </div>
              {conImpresiones && (
                <div className="flex justify-between text-sm">
                  <span>Impresiones:</span>
                  <span className="font-medium">{formatCurrency(totals.ventaImpresiones)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
                <span>Total Venta:</span>
                <span className="text-green-600">{formatCurrency(totals.totalVenta)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botones */}
        <Card>
          <CardFooter className="flex justify-between pt-6">
            <Button
              type="button"
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
              {loading ? "Guardando..." : "Guardar Presupuesto"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
