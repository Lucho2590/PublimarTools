"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useUser, useFirestoreCollectionData } from "reactfire";
import { collection, addDoc, serverTimestamp, Timestamp, query, where, orderBy, Query, CollectionReference } from "firebase/firestore";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import collections from "@/lib/collections";
import { EQuoteStatus, TQuoteItem } from "@/types/quote";
import { EClientSection, TClient } from "@/types/client";
import { TDeviceType } from "@/types/device";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2, Plus, Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
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
import { useIsMobile } from "@/hooks/useMediaQuery";

// Tipos para el estado del formulario
type FormItem = {
  id: string;
  productName: string;
  quantity: number | undefined;
  unitPrice: number | undefined;
};

type FormPeriodo = {
  id: string;
  fechaInicio: Date | undefined;
  dias: number | undefined;
  items: FormItem[];
};

const createEmptyItem = (): FormItem => ({
  id: Math.random().toString(36).substring(7),
  productName: "",
  quantity: undefined,
  unitPrice: undefined,
});

const createEmptyPeriodo = (): FormPeriodo => ({
  id: Math.random().toString(36).substring(7),
  fechaInicio: undefined,
  dias: undefined,
  items: [createEmptyItem()],
});

export default function NuevoPresupuestoPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const firestore = useFirestore();
  const { data: user } = useUser();
  const isMobile = useIsMobile();

  const allSections = ["info-general", "periodos", "impresiones", "formas-pago"];
  const [openSection, setOpenSection] = useState<string>("");

  const [formData, setFormData] = useState({
    clientId: "",
    fecha: new Date().toISOString().split("T")[0],
    notes: "",
  });

  // Periodos con dispositivos anidados
  const [periodos, setPeriodos] = useState<FormPeriodo[]>([createEmptyPeriodo()]);

  // Estado para impresiones/afiches
  const [conImpresiones, setConImpresiones] = useState(false);
  const [impresiones, setImpresiones] = useState({
    costo: undefined as number | undefined,
    venta: undefined as number | undefined,
    flete: undefined as number | undefined,
  });

  // Estado para formas de pago
  const [formasPago, setFormasPago] = useState<{ tipo: string; monto: number | undefined; cuenta: string; factura: boolean; tipoFactura: "" | "A" | "C" }[]>([
    { tipo: "", monto: undefined, cuenta: "", factura: false, tipoFactura: "" },
  ]);

  // --- Handlers de periodos ---
  const addPeriodo = () => {
    setPeriodos([...periodos, createEmptyPeriodo()]);
  };

  const removePeriodo = (index: number) => {
    if (periodos.length > 1) {
      setPeriodos(periodos.filter((_, i) => i !== index));
    }
  };

  const handlePeriodoChange = (index: number, field: "fechaInicio" | "dias", value: Date | number | undefined) => {
    const updated = [...periodos];
    updated[index] = { ...updated[index], [field]: value };
    setPeriodos(updated);
  };

  // --- Handlers de items dentro de periodos ---
  const handleItemChange = (periodoIdx: number, itemIdx: number, field: keyof FormItem, value: string | number) => {
    const updated = [...periodos];
    updated[periodoIdx] = {
      ...updated[periodoIdx],
      items: updated[periodoIdx].items.map((item, i) =>
        i === itemIdx ? { ...item, [field]: value } : item
      ),
    };
    setPeriodos(updated);
  };

  const addItem = (periodoIdx: number) => {
    const updated = [...periodos];
    updated[periodoIdx] = {
      ...updated[periodoIdx],
      items: [...updated[periodoIdx].items, createEmptyItem()],
    };
    setPeriodos(updated);
  };

  const removeItem = (periodoIdx: number, itemIdx: number) => {
    const periodo = periodos[periodoIdx];
    if (periodo.items.length > 1) {
      const updated = [...periodos];
      updated[periodoIdx] = {
        ...updated[periodoIdx],
        items: periodo.items.filter((_, i) => i !== itemIdx),
      };
      setPeriodos(updated);
    }
  };

  // --- Handlers de formas de pago ---
  const addFormaPago = () => {
    setFormasPago([...formasPago, { tipo: "", monto: undefined, cuenta: "", factura: false, tipoFactura: "" }]);
  };

  const removeFormaPago = (index: number) => {
    if (formasPago.length > 1) {
      setFormasPago(formasPago.filter((_, i) => i !== index));
    }
  };

  const handleFormaPagoChange = (index: number, field: string, value: any) => {
    const updated = [...formasPago];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "tipo" && value !== "transferencia") {
      updated[index].cuenta = "";
    }
    if (field === "factura" && !value) {
      updated[index].tipoFactura = "";
    }
    setFormasPago(updated);
  };

  // Calcular fecha fin de un período
  const calcularFechaFin = (fechaInicio: Date | undefined, dias: number | undefined): Date | null => {
    if (!fechaInicio || !dias || dias <= 0) return null;
    return addDays(fechaInicio, dias - 1);
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Calcular totales
  const calculateTotals = () => {
    let subtotalDispositivos = 0;
    periodos.forEach((periodo) => {
      periodo.items.forEach((item) => {
        const cantidad = Number(item.quantity) || 0;
        const precio = Number(item.unitPrice) || 0;
        subtotalDispositivos += cantidad * precio;
      });
    });

    const ventaImpresiones = conImpresiones ? Number(impresiones.venta) || 0 : 0;
    const fleteImpresiones = conImpresiones ? Number(impresiones.flete) || 0 : 0;
    const totalVenta = subtotalDispositivos + ventaImpresiones + fleteImpresiones;

    return { subtotalDispositivos, ventaImpresiones, fleteImpresiones, totalVenta };
  };

  const totals = calculateTotals();

  // Generar número de presupuesto
  const generateQuoteNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
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

    // Validar que haya al menos un item con dispositivo en algún periodo
    const allItems = periodos.flatMap((p) => p.items);
    const validItems = allItems.filter((item) => item.productName);

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
      const selectedClient = clients?.find((c) => c.id === formData.clientId);
      if (!selectedClient) {
        toast.error("Cliente no encontrado");
        return;
      }

      // Preparar periodos con items anidados
      const preparedPeriodos = periodos
        .filter((p) => p.items.some((i) => i.productName))
        .map((p) => {
          const fechaFin = calcularFechaFin(p.fechaInicio, p.dias);
          return {
            id: p.id,
            fechaInicio: p.fechaInicio ? Timestamp.fromDate(p.fechaInicio) : null,
            dias: p.dias || null,
            fechaFin: fechaFin ? Timestamp.fromDate(fechaFin) : null,
            items: p.items
              .filter((i) => i.productName)
              .map((i) => ({
                id: i.id,
                productName: i.productName,
                quantity: Number(i.quantity) || 0,
                unitPrice: Number(i.unitPrice) || 0,
                subtotal: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
              })),
          };
        });

      // Items flat para backward compat
      const preparedItems = validItems.map((item) => ({
        id: item.id,
        productName: item.productName || "",
        description: "",
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        subtotal: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
        tax: 0,
        taxAmount: 0,
        isManual: true,
      }));

      // Preparar formas de pago
      const preparedFormasPago = formasPago
        .filter((fp) => fp.tipo && fp.monto && fp.monto > 0)
        .map((fp) => ({
          tipo: fp.tipo,
          monto: fp.monto,
          cuenta: fp.cuenta || null,
          factura: fp.factura,
          tipoFactura: fp.factura ? fp.tipoFactura : null,
        }));

      const quoteData: Record<string, unknown> = {
        number: generateQuoteNumber(),
        client: {
          id: selectedClient.id,
          name: selectedClient.name,
          section: selectedClient.section,
        },
        items: preparedItems,
        periodos: preparedPeriodos,
        fecha: Timestamp.fromDate(new Date(formData.fecha)),
        formasPago: preparedFormasPago,
        conImpresiones,
        impresiones: conImpresiones
          ? {
              costo: Number(impresiones.costo) || 0,
              venta: Number(impresiones.venta) || 0,
              flete: Number(impresiones.flete) || 0,
            }
          : null,
        subtotalDispositivos: totals.subtotalDispositivos,
        ventaImpresiones: totals.ventaImpresiones,
        fleteImpresiones: totals.fleteImpresiones,
        totalVenta: totals.totalVenta,
        subtotal: totals.subtotalDispositivos,
        taxRate: 0,
        tax: 0,
        taxAmount: 0,
        total: totals.totalVenta,
        status: EQuoteStatus.DRAFT,
        validUntil: Timestamp.fromDate(new Date(formData.fecha)),
        notes: formData.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
        updatedBy: user.uid,
        version: 1,
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
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(amount);
  };

  // Previews para acordeones colapsados
  const getInfoGeneralPreview = () => {
    const clientName = clients?.find((c) => c.id === formData.clientId)?.name;
    if (!clientName) return "Sin cliente seleccionado";
    return clientName;
  };

  const getPeriodosPreview = () => {
    const totalItems = periodos.reduce((sum, p) => sum + p.items.filter((i) => i.productName).length, 0);
    if (totalItems === 0) return "Sin dispositivos";
    return `${periodos.length} período${periodos.length > 1 ? "s" : ""}, ${totalItems} dispositivo${totalItems > 1 ? "s" : ""} - ${formatCurrency(totals.subtotalDispositivos)}`;
  };

  const getFormasPagoPreview = () => {
    const valid = formasPago.filter((fp) => fp.tipo && fp.monto && fp.monto > 0);
    if (valid.length === 0) return "Sin formas de pago";
    const tipos = valid.map((fp) => {
      switch (fp.tipo) {
        case "efectivo": return "Efectivo";
        case "transferencia": return "Transferencia";
        case "cheque": return "Cheque";
        case "cuenta_corriente": return "Cta. Cte.";
        case "canje": return "Canje";
        default: return fp.tipo;
      }
    });
    const total = valid.reduce((sum, fp) => sum + (fp.monto || 0), 0);
    return `${tipos.join(" + ")} - ${formatCurrency(total)}`;
  };

  const getImpresionesPreview = () => {
    if (!conImpresiones) return "Sin impresiones";
    return `Venta: ${formatCurrency(impresiones.venta || 0)}`;
  };

  // --- Componente reutilizable: UI de un periodo con sus items ---
  const renderPeriodo = (periodo: FormPeriodo, periodoIdx: number, variant: "mobile" | "desktop") => {
    const fechaFin = calcularFechaFin(periodo.fechaInicio, periodo.dias);
    const periodoSubtotal = periodo.items.reduce((sum, item) => {
      return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    }, 0);

    return (
      <div key={periodo.id} className="border rounded-lg bg-slate-50 p-4 space-y-4">
        {/* Header del periodo: fecha, días, fecha fin, eliminar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Periodo {periodoIdx + 1}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-3">
            <div className="sm:w-[80px]">
              <Label className="text-xs text-slate-500 sm:hidden">Días</Label>
              <Input
                type="number"
                min="1"
                value={periodo.dias ?? ""}
                onChange={(e) => handlePeriodoChange(periodoIdx, "dias", e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Días"
              />
            </div>
            <div className="sm:w-[170px]">
              <Label className="text-xs text-slate-500 sm:hidden">Fecha salida</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !periodo.fechaInicio && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {periodo.fechaInicio ? (
                      format(periodo.fechaInicio, "dd/MM/yyyy", { locale: es })
                    ) : (
                      <span>Fecha salida</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={periodo.fechaInicio}
                    onSelect={(date) => handlePeriodoChange(periodoIdx, "fechaInicio", date)}
                    locale={es}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Hasta:</span>
            {fechaFin ? (
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-md text-sm font-medium">
                {format(fechaFin, "dd/MM/yyyy", { locale: es })}
              </span>
            ) : (
              <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-md text-sm">
                --/--/----
              </span>
            )}
          </div>

          {periodos.length > 1 && (
            <Button
              type="button"
              onClick={() => removePeriodo(periodoIdx)}
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700 hover:bg-red-50 self-end sm:self-auto sm:ml-auto"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Dispositivos del periodo */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-slate-600">Dispositivos</span>
            <Button
              type="button"
              onClick={() => addItem(periodoIdx)}
              variant="outline"
              size="sm"
              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white h-7 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Agregar
            </Button>
          </div>

          {/* Mobile: cards */}
          <div className="space-y-3 md:hidden">
            {periodo.items.map((item, itemIdx) => (
              <div key={item.id} className="p-3 border rounded-lg bg-white space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <Label className="text-xs text-slate-500">Dispositivo</Label>
                    <DeviceAutocomplete
                      devices={devices || []}
                      value={item.productName || ""}
                      onChange={(value) => handleItemChange(periodoIdx, itemIdx, "productName", value)}
                      placeholder="Seleccionar..."
                    />
                  </div>
                  {periodo.items.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => removeItem(periodoIdx, itemIdx)}
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 -mt-1 -mr-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500">Cantidad</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity ?? ""}
                      onChange={(e) => handleItemChange(periodoIdx, itemIdx, "quantity", e.target.value ? Number(e.target.value) : 0)}
                      placeholder="Cant."
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Precio Unit.</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice ?? ""}
                      onChange={(e) => handleItemChange(periodoIdx, itemIdx, "unitPrice", e.target.value ? Number(e.target.value) : 0)}
                      placeholder="$"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Dispositivo</TableHead>
                  <TableHead className="w-[100px]">Cantidad</TableHead>
                  <TableHead className="w-[140px]">Precio Unit.</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodo.items.map((item, itemIdx) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <DeviceAutocomplete
                        devices={devices || []}
                        value={item.productName || ""}
                        onChange={(value) => handleItemChange(periodoIdx, itemIdx, "productName", value)}
                        placeholder="Seleccionar dispositivo..."
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity ?? ""}
                        onChange={(e) => handleItemChange(periodoIdx, itemIdx, "quantity", e.target.value ? Number(e.target.value) : 0)}
                        placeholder="Cant."
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice ?? ""}
                        onChange={(e) => handleItemChange(periodoIdx, itemIdx, "unitPrice", e.target.value ? Number(e.target.value) : 0)}
                        placeholder="$"
                      />
                    </TableCell>
                    <TableCell>
                      {periodo.items.length > 1 && (
                        <Button
                          type="button"
                          onClick={() => removeItem(periodoIdx, itemIdx)}
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
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

          <div className="mt-2 text-right text-sm text-slate-600">
            Subtotal: <span className="font-semibold">{formatCurrency(periodoSubtotal)}</span>
          </div>
        </div>
      </div>
    );
  };

  // --- Componente reutilizable: Formas de pago ---
  const renderFormasPago = () => (
    <div className="space-y-4">
      {formasPago.map((fp, index) => (
        <div key={index} className="p-3 border rounded-lg bg-slate-50">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:flex-wrap">
            <div className="grid grid-cols-2 gap-3 md:flex md:gap-3">
              <div className="md:w-[160px]">
                <Label className="text-xs text-slate-500 md:hidden">Tipo</Label>
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
              <div className="md:w-[120px]">
                <Label className="text-xs text-slate-500 md:hidden">Monto</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fp.monto ?? ""}
                  onChange={(e) => handleFormaPagoChange(index, "monto", e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Monto $"
                />
              </div>
            </div>

            {fp.tipo === "transferencia" && (
              <div className="md:w-[160px]">
                <Label className="text-xs text-slate-500 md:hidden">Cuenta</Label>
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
                className="text-red-500 hover:text-red-700 hover:bg-red-50 self-end md:self-auto md:ml-auto"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  // --- Componente reutilizable: Impresiones ---
  const renderImpresiones = () => (
    <>
      <div className="flex items-center space-x-3 mb-4">
        <Checkbox
          id="conImpresiones"
          checked={conImpresiones}
          onCheckedChange={(checked) => setConImpresiones(checked === true)}
        />
        <label htmlFor="conImpresiones" className="text-sm cursor-pointer">
          ¿Agregar impresiones / afiches?
        </label>
      </div>
      {conImpresiones && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
          <div className="space-y-2">
            <Label htmlFor="fleteImpresiones">Flete</Label>
            <Input
              id="fleteImpresiones"
              type="number"
              min="0"
              step="0.01"
              value={impresiones.flete ?? ""}
              onChange={(e) =>
                setImpresiones((prev) => ({ ...prev, flete: e.target.value ? Number(e.target.value) : undefined }))
              }
              placeholder="$"
            />
          </div>
        </div>
      )}
    </>
  );

  // --- Componente reutilizable: Info general ---
  const renderInfoGeneral = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            onValueChange={(value) => setFormData((prev) => ({ ...prev, clientId: value }))}
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
        <Label htmlFor="notes">Observaciones</Label>
        <Textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={2}
          placeholder="Observaciones del presupuesto..."
        />
      </div>
    </div>
  );

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
        {/* Mobile: Accordion colapsable */}
        {isMobile ? (
          <Accordion
            type="single"
            collapsible
            value={openSection}
            onValueChange={setOpenSection}
            className="space-y-2 mb-4"
          >
            {/* Información General */}
            <AccordionItem value="info-general" className="border rounded-lg bg-white">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-left">
                  <span className="font-semibold">Información General</span>
                  <span className="text-sm text-slate-500 font-normal md:hidden">{getInfoGeneralPreview()}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {renderInfoGeneral()}
              </AccordionContent>
            </AccordionItem>

            {/* Períodos con Dispositivos */}
            <AccordionItem value="periodos" className="border rounded-lg bg-white">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-left">
                  <span className="font-semibold">Períodos y Dispositivos</span>
                  <span className="text-sm text-slate-500 font-normal md:hidden">{getPeriodosPreview()}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="flex justify-end mb-3">
                  <Button
                    type="button"
                    onClick={addPeriodo}
                    variant="outline"
                    size="sm"
                    className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Período
                  </Button>
                </div>
                <div className="space-y-4">
                  {periodos.map((periodo, idx) => renderPeriodo(periodo, idx, "mobile"))}
                </div>
                <div className="mt-4 text-right text-sm text-slate-600">
                  Total Dispositivos: <span className="font-semibold">{formatCurrency(totals.subtotalDispositivos)}</span>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Impresiones */}
            <AccordionItem value="impresiones" className="border rounded-lg bg-white">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-left">
                  <span className="font-semibold">Impresiones / Afiches</span>
                  <span className="text-sm text-slate-500 font-normal md:hidden">{getImpresionesPreview()}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {renderImpresiones()}
              </AccordionContent>
            </AccordionItem>

            {/* Formas de Pago */}
            <AccordionItem value="formas-pago" className="border rounded-lg bg-white">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-left">
                  <span className="font-semibold">Formas de Pago</span>
                  <span className="text-sm text-slate-500 font-normal md:hidden">{getFormasPagoPreview()}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="flex justify-end mb-3">
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
                </div>
                {renderFormasPago()}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : (
          /* Desktop: Cards siempre visibles */
          <div className="space-y-4 mb-4">
            {/* Información General */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Información General</CardTitle>
              </CardHeader>
              <CardContent>
                {renderInfoGeneral()}
              </CardContent>
            </Card>

            {/* Períodos con Dispositivos */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle>Períodos y Dispositivos</CardTitle>
                <Button
                  type="button"
                  onClick={addPeriodo}
                  variant="outline"
                  size="sm"
                  className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Período
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {periodos.map((periodo, idx) => renderPeriodo(periodo, idx, "desktop"))}
                </div>
                <div className="mt-4 text-right text-sm text-slate-600">
                  Total Dispositivos: <span className="font-semibold">{formatCurrency(totals.subtotalDispositivos)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Impresiones */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="conImpresiones-desktop"
                    checked={conImpresiones}
                    onCheckedChange={(checked) => setConImpresiones(checked === true)}
                  />
                  <label htmlFor="conImpresiones-desktop" className="text-lg font-semibold cursor-pointer">
                    Impresiones / Afiches
                  </label>
                </div>
              </CardHeader>
              {conImpresiones && (
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="costoImpresiones-desktop">Costo impresiones</Label>
                      <Input
                        id="costoImpresiones-desktop"
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
                      <Label htmlFor="ventaImpresiones-desktop">Venta impresiones</Label>
                      <Input
                        id="ventaImpresiones-desktop"
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
                    <div className="space-y-2">
                      <Label htmlFor="fleteImpresiones-desktop">Flete</Label>
                      <Input
                        id="fleteImpresiones-desktop"
                        type="number"
                        min="0"
                        step="0.01"
                        value={impresiones.flete ?? ""}
                        onChange={(e) =>
                          setImpresiones((prev) => ({ ...prev, flete: e.target.value ? Number(e.target.value) : undefined }))
                        }
                        placeholder="$"
                      />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Formas de Pago */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
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
                {renderFormasPago()}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Resumen y Botones - Sticky en mobile */}
        <div className="md:static md:bg-transparent fixed bottom-0 left-0 right-0 bg-white border-t md:border-t-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] md:shadow-none z-10">
          <div className="p-4 md:p-0">
            <div className="md:mb-4">
              {/* Mobile: solo total */}
              <div className="flex justify-between items-center md:hidden mb-3">
                <span className="font-semibold">Total:</span>
                <span className="text-xl font-bold text-green-600">{formatCurrency(totals.totalVenta)}</span>
              </div>

              {/* Desktop: card completo */}
              <Card className="hidden md:block mb-4">
                <CardHeader className="pb-2">
                  <CardTitle>Resumen</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-w-md">
                    <div className="flex justify-between text-sm">
                      <span>Dispositivos:</span>
                      <span className="font-medium">{formatCurrency(totals.subtotalDispositivos)}</span>
                    </div>
                    {conImpresiones && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span>Impresiones:</span>
                          <span className="font-medium">{formatCurrency(totals.ventaImpresiones)}</span>
                        </div>
                        {totals.fleteImpresiones > 0 && (
                          <div className="flex justify-between text-sm">
                            <span>Flete:</span>
                            <span className="font-medium">{formatCurrency(totals.fleteImpresiones)}</span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
                      <span>Total Venta:</span>
                      <span className="text-green-600">{formatCurrency(totals.totalVenta)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Botones */}
            <div className="flex justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/publimar/viaPublica/presupuestos")}
                disabled={loading}
                className="flex-1 md:flex-none bg-red-500 hover:bg-red-600 text-white"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 hover:text-white text-white"
              >
                <Save className="h-4 w-4 mr-2" />
                {loading ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </div>

        {/* Spacer para mobile */}
        <div className="h-32 md:h-0" />
      </form>
    </div>
  );
}
