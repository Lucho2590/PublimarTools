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

export default function NuevoPresupuestoPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const firestore = useFirestore();
  const { data: user } = useUser();
  const isMobile = useIsMobile();

  // Todas las secciones del acordeón
  const allSections = ["info-general", "dispositivos", "periodos", "impresiones", "formas-pago"];

  // En mobile: estado controlado para una sola sección abierta
  // En desktop: todas abiertas siempre
  const [openSection, setOpenSection] = useState<string>("");

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
    flete: undefined as number | undefined,
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

  // Estado para períodos
  const [periodos, setPeriodos] = useState<{ fechaInicio: Date | undefined; dias: number | undefined; notas: string }[]>([
    { fechaInicio: undefined, dias: undefined, notas: "" },
  ]);

  const addPeriodo = () => {
    setPeriodos([...periodos, { fechaInicio: undefined, dias: undefined, notas: "" }]);
  };

  const removePeriodo = (index: number) => {
    if (periodos.length > 1) {
      setPeriodos(periodos.filter((_, i) => i !== index));
    }
  };

  const handlePeriodoChange = (index: number, field: "fechaInicio" | "dias" | "notas", value: Date | number | string | undefined) => {
    const updated = [...periodos];
    updated[index] = { ...updated[index], [field]: value };
    setPeriodos(updated);
  };

  // Calcular fecha fin de un período
  const calcularFechaFin = (fechaInicio: Date | undefined, dias: number | undefined): Date | null => {
    if (!fechaInicio || !dias || dias <= 0) return null;
    return addDays(fechaInicio, dias - 1); // -1 porque el día inicial cuenta
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
    const fleteImpresiones = conImpresiones ? Number(impresiones.flete) || 0 : 0;
    const totalVenta = subtotalDispositivos + ventaImpresiones + fleteImpresiones;

    return {
      subtotalDispositivos,
      ventaImpresiones,
      fleteImpresiones,
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

      // Preparar períodos (con Timestamps de Firebase)
      const preparedPeriodos = periodos
        .filter(p => p.fechaInicio && p.dias && p.dias > 0)
        .map(p => {
          const fechaFin = calcularFechaFin(p.fechaInicio, p.dias);
          return {
            fechaInicio: Timestamp.fromDate(p.fechaInicio!),
            dias: p.dias,
            fechaFin: fechaFin ? Timestamp.fromDate(fechaFin) : null,
            notas: p.notas || "",
          };
        });

      // Crear el presupuesto
      const quoteData: Record<string, unknown> = {
        number: generateQuoteNumber(),
        // Solo guardar id y name del cliente
        client: {
          id: selectedClient.id,
          name: selectedClient.name,
          section: selectedClient.section,
        },
        items: preparedItems,
        // Campos de vía pública
        fecha: Timestamp.fromDate(new Date(formData.fecha)),
        formasPago: preparedFormasPago,
        periodos: preparedPeriodos,
        // Impresiones
        conImpresiones,
        impresiones: conImpresiones ? {
          costo: Number(impresiones.costo) || 0,
          venta: Number(impresiones.venta) || 0,
          flete: Number(impresiones.flete) || 0,
        } : null,
        // Totales
        subtotalDispositivos: totals.subtotalDispositivos,
        ventaImpresiones: totals.ventaImpresiones,
        fleteImpresiones: totals.fleteImpresiones,
        totalVenta: totals.totalVenta,
        // Campos estándar
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
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  // Previews para acordeones colapsados
  const getInfoGeneralPreview = () => {
    const clientName = clients?.find(c => c.id === formData.clientId)?.name;
    if (!clientName) return "Sin cliente seleccionado";
    return clientName;
  };

  const getDispositivosPreview = () => {
    const count = items.filter(i => i.productName).length;
    if (count === 0) return "Sin dispositivos";
    return `${count} dispositivo${count > 1 ? "s" : ""} - ${formatCurrency(totals.subtotalDispositivos)}`;
  };

  const getPeriodosPreview = () => {
    const count = periodos.filter(p => p.fechaInicio && p.dias).length;
    if (count === 0) return "Sin períodos";
    return `${count} período${count > 1 ? "s" : ""}`;
  };

  const getFormasPagoPreview = () => {
    const valid = formasPago.filter(fp => fp.tipo && fp.monto && fp.monto > 0);
    if (valid.length === 0) return "Sin formas de pago";
    const tipos = valid.map(fp => {
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
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Dispositivos */}
          <AccordionItem value="dispositivos" className="border rounded-lg bg-white">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-left">
                <span className="font-semibold">Dispositivos</span>
                <span className="text-sm text-slate-500 font-normal md:hidden">{getDispositivosPreview()}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="flex justify-end mb-3">
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
              </div>

              {/* Vista mobile: cards apilados */}
              <div className="space-y-4 md:hidden">
                {items.map((item, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-3 bg-slate-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <Label className="text-xs text-slate-500">Dispositivo</Label>
                        <DeviceAutocomplete
                          devices={devices || []}
                          value={item.productName || ""}
                          onChange={(value) => handleItemChange(index, "productName", value)}
                          placeholder="Seleccionar..."
                        />
                      </div>
                      {items.length > 1 && (
                        <Button
                          type="button"
                          onClick={() => removeItem(index)}
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
                          onChange={(e) => handleItemChange(index, "quantity", e.target.value ? Number(e.target.value) : 0)}
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
                          onChange={(e) => handleItemChange(index, "unitPrice", e.target.value ? Number(e.target.value) : 0)}
                          placeholder="$"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Observaciones</Label>
                      <Input
                        value={item.description || ""}
                        onChange={(e) => handleItemChange(index, "description", e.target.value)}
                        placeholder="Observaciones..."
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Vista desktop: tabla */}
              <div className="hidden md:block overflow-x-auto">
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
                            onChange={(value) => handleItemChange(index, "productName", value)}
                            placeholder="Seleccionar dispositivo..."
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity ?? ""}
                            onChange={(e) => handleItemChange(index, "quantity", e.target.value ? Number(e.target.value) : 0)}
                            placeholder="Cant."
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice ?? ""}
                            onChange={(e) => handleItemChange(index, "unitPrice", e.target.value ? Number(e.target.value) : 0)}
                            placeholder="$"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.description || ""}
                            onChange={(e) => handleItemChange(index, "description", e.target.value)}
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

              <div className="mt-4 text-right text-sm text-slate-600">
                Subtotal: <span className="font-semibold">{formatCurrency(totals.subtotalDispositivos)}</span>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Períodos */}
          <AccordionItem value="periodos" className="border rounded-lg bg-white">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-left">
                <span className="font-semibold">Períodos</span>
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
                  Agregar
                </Button>
              </div>

              <div className="space-y-4">
                {periodos.map((periodo, index) => {
                  const fechaFin = calcularFechaFin(periodo.fechaInicio, periodo.dias);
                  return (
                    <div key={index} className="p-3 border rounded-lg bg-slate-50">
                      {/* Mobile: stack vertical */}
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:flex-wrap">
                        <div className="grid grid-cols-2 gap-3 md:flex md:gap-3">
                          <div className="md:w-[80px]">
                            <Label className="text-xs text-slate-500 md:hidden">Días</Label>
                            <Input
                              type="number"
                              min="1"
                              value={periodo.dias ?? ""}
                              onChange={(e) => handlePeriodoChange(index, "dias", e.target.value ? Number(e.target.value) : undefined)}
                              placeholder="Días"
                            />
                          </div>
                          <div className="md:w-[170px]">
                            <Label className="text-xs text-slate-500 md:hidden">Fecha inicio</Label>
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
                                    <span>Fecha inicio</span>
                                  )}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={periodo.fechaInicio}
                                  onSelect={(date) => handlePeriodoChange(index, "fechaInicio", date)}
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

                        <div className="flex-1 min-w-0">
                          <Label className="text-xs text-slate-500 md:hidden">Notas</Label>
                          <Input
                            value={periodo.notas}
                            onChange={(e) => handlePeriodoChange(index, "notas", e.target.value)}
                            placeholder="Notas..."
                          />
                        </div>

                        {periodos.length > 1 && (
                          <Button
                            type="button"
                            onClick={() => removePeriodo(index)}
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 self-end md:self-auto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fecha-desktop">Fecha</Label>
                    <Input
                      id="fecha-desktop"
                      name="fecha"
                      type="date"
                      value={formData.fecha}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clientId-desktop">Cliente</Label>
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
                  <Label htmlFor="notes-desktop">Observaciones Generales</Label>
                  <Textarea
                    id="notes-desktop"
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={2}
                    placeholder="Observaciones del presupuesto..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dispositivos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
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
              <div className="overflow-x-auto">
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
                            onChange={(value) => handleItemChange(index, "productName", value)}
                            placeholder="Seleccionar dispositivo..."
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity ?? ""}
                            onChange={(e) => handleItemChange(index, "quantity", e.target.value ? Number(e.target.value) : 0)}
                            placeholder="Cant."
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice ?? ""}
                            onChange={(e) => handleItemChange(index, "unitPrice", e.target.value ? Number(e.target.value) : 0)}
                            placeholder="$"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.description || ""}
                            onChange={(e) => handleItemChange(index, "description", e.target.value)}
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
              <div className="mt-4 text-right text-sm text-slate-600">
                Subtotal: <span className="font-semibold">{formatCurrency(totals.subtotalDispositivos)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Períodos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle>Períodos</CardTitle>
              <Button
                type="button"
                onClick={addPeriodo}
                variant="outline"
                size="sm"
                className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Agregar
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {periodos.map((periodo, index) => {
                  const fechaFin = calcularFechaFin(periodo.fechaInicio, periodo.dias);
                  return (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-slate-50">
                      <div className="w-[80px]">
                        <Input
                          type="number"
                          min="1"
                          value={periodo.dias ?? ""}
                          onChange={(e) => handlePeriodoChange(index, "dias", e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="Días"
                        />
                      </div>
                      <div className="w-[170px]">
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
                                <span>Fecha inicio</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={periodo.fechaInicio}
                              onSelect={(date) => handlePeriodoChange(index, "fechaInicio", date)}
                              locale={es}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
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
                      <div className="flex-1">
                        <Input
                          value={periodo.notas}
                          onChange={(e) => handlePeriodoChange(index, "notas", e.target.value)}
                          placeholder="Notas..."
                        />
                      </div>
                      {periodos.length > 1 && (
                        <Button
                          type="button"
                          onClick={() => removePeriodo(index)}
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
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
              <div className="space-y-4">
                {formasPago.map((fp, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-slate-50">
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
                        id={`factura-desktop-${index}`}
                        checked={fp.factura}
                        onCheckedChange={(checked) => handleFormaPagoChange(index, "factura", checked === true)}
                      />
                      <label htmlFor={`factura-desktop-${index}`} className="text-sm whitespace-nowrap">
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
        </div>
        )}

        {/* Resumen y Botones - Sticky en mobile */}
        <div className="md:static md:bg-transparent fixed bottom-0 left-0 right-0 bg-white border-t md:border-t-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] md:shadow-none z-10">
          <div className="p-4 md:p-0">
            {/* Resumen compacto en mobile, expandido en desktop */}
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

        {/* Spacer para mobile para que el contenido no quede tapado por el footer sticky */}
        <div className="h-32 md:h-0" />
      </form>
    </div>
  );
}
