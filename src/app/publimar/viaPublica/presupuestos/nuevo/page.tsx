"use client";
export const dynamic = "force-dynamic";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useUser, useFirestoreCollectionData } from "reactfire";
import { collection, addDoc, serverTimestamp, Timestamp, query, where, orderBy, Query, CollectionReference } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
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
import { EQuoteStatus } from "@/types/quote";
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
import { MoneyInput } from "@/components/ui/money-input";
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
  fechaSalida: Date | undefined;
  dias: number | undefined;
  diasBonificados: number | undefined;
  items: FormItem[];
};

const newId = () => Math.random().toString(36).substring(7);

const createEmptyItem = (): FormItem => ({
  id: newId(),
  productName: "",
  quantity: undefined,
  unitPrice: undefined,
});

const createEmptyPeriodo = (): FormPeriodo => ({
  id: newId(),
  fechaSalida: undefined,
  dias: undefined,
  diasBonificados: undefined,
  items: [createEmptyItem()],
});

export default function NuevoPresupuestoPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const firestore = useFirestore();
  const { data: user } = useUser();
  const isMobile = useIsMobile();

  const allSections = ["info-general", "dispositivos", "impresiones", "formas-pago"];
  const [openSection, setOpenSection] = useState<string>("");

  const [formData, setFormData] = useState({
    clientId: "",
    fecha: new Date().toISOString().split("T")[0],
    notes: "",
  });

  // Períodos con dispositivos anidados
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

  // --- Handlers de períodos ---
  const handlePeriodoChange = (pIdx: number, field: keyof FormPeriodo, value: any) => {
    const updated = [...periodos];
    updated[pIdx] = { ...updated[pIdx], [field]: value };
    setPeriodos(updated);
  };

  const addPeriodo = () => {
    setPeriodos([...periodos, createEmptyPeriodo()]);
  };

  const removePeriodo = (pIdx: number) => {
    if (periodos.length > 1) {
      setPeriodos(periodos.filter((_, i) => i !== pIdx));
    }
  };

  // --- Handlers de items dentro de un período ---
  const handleItemChange = (pIdx: number, iIdx: number, field: keyof FormItem, value: any) => {
    const updated = [...periodos];
    const items = [...updated[pIdx].items];
    items[iIdx] = { ...items[iIdx], [field]: value };
    updated[pIdx] = { ...updated[pIdx], items };
    setPeriodos(updated);
  };

  const addItem = (pIdx: number) => {
    const updated = [...periodos];
    updated[pIdx] = { ...updated[pIdx], items: [...updated[pIdx].items, createEmptyItem()] };
    setPeriodos(updated);
  };

  const removeItem = (pIdx: number, iIdx: number) => {
    const updated = [...periodos];
    if (updated[pIdx].items.length <= 1) return;
    updated[pIdx] = { ...updated[pIdx], items: updated[pIdx].items.filter((_, i) => i !== iIdx) };
    setPeriodos(updated);
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

  // Calcular fecha fin (incluye días bonificados)
  const calcularFechaFin = (
    fechaInicio: Date | undefined,
    dias: number | undefined,
    diasBonificados: number | undefined,
  ): Date | null => {
    if (!fechaInicio) return null;
    const totalDias = (Number(dias) || 0) + (Number(diasBonificados) || 0);
    if (totalDias <= 0) return null;
    return addDays(fechaInicio, totalDias - 1);
  };

  // Cargar clientes de vía pública y banderas
  const clientsCollection = collection(firestore, collections.CLIENTS);
  const viaPublicaQuery = query(
    clientsCollection,
    where("section", "==", EClientSection.VIA_PUBLICA),
    orderBy("name")
  );
  const { data: viaPublicaClients } = useFirestoreCollectionData<TClient>(
    viaPublicaQuery as Query<TClient>,
    { idField: "id" }
  );
  const banderasQuery = query(
    clientsCollection,
    where("section", "==", EClientSection.BANDERAS),
    orderBy("name")
  );
  const { data: banderasClients } = useFirestoreCollectionData<TClient>(
    banderasQuery as Query<TClient>,
    { idField: "id" }
  );

  const [includeBanderas, setIncludeBanderas] = useState(false);
  const [clienteInput, setClienteInput] = useState("");
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [highlightedClientIndex, setHighlightedClientIndex] = useState(-1);
  const clienteInputRef = useRef<HTMLInputElement>(null);

  const clients = includeBanderas
    ? [...(viaPublicaClients ?? []), ...(banderasClients ?? [])]
    : viaPublicaClients ?? [];

  const filteredClients = clienteInput.trim()
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(clienteInput.toLowerCase())
      )
    : clients;

  const handleClienteInputChange = (value: string) => {
    setClienteInput(value);
    setShowClienteDropdown(true);
    setHighlightedClientIndex(-1);
    if (formData.clientId) {
      const current = clients.find((c) => c.id === formData.clientId);
      if (!current || current.name !== value) {
        setFormData((prev) => ({ ...prev, clientId: "" }));
      }
    }
  };

  const handleSelectClient = (client: TClient) => {
    setFormData((prev) => ({ ...prev, clientId: client.id }));
    setClienteInput(client.name);
    setShowClienteDropdown(false);
    setHighlightedClientIndex(-1);
    clienteInputRef.current?.blur();
  };

  const handleClienteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setShowClienteDropdown(true);
      setHighlightedClientIndex((prev) =>
        Math.min(prev + 1, filteredClients.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedClientIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      if (highlightedClientIndex >= 0 && filteredClients[highlightedClientIndex]) {
        e.preventDefault();
        handleSelectClient(filteredClients[highlightedClientIndex]);
      }
    } else if (e.key === "Escape") {
      setShowClienteDropdown(false);
      setHighlightedClientIndex(-1);
    }
  };

  // Cargar dispositivos
  const devicesCollection = collection(firestore, "devices");
  const { data: devices } = useFirestoreCollectionData<TDeviceType>(devicesCollection as CollectionReference<TDeviceType>, {
    idField: "id",
  }) as { data: TDeviceType[] };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Subtotal del período = suma de cantidad × precioUnit de sus dispositivos
  const periodoSubtotal = (p: FormPeriodo) =>
    p.items.reduce(
      (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
      0,
    );

  // Calcular totales
  const calculateTotals = () => {
    const subtotalDispositivos = periodos.reduce((sum, p) => sum + periodoSubtotal(p), 0);

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

    const hasAnyDevice = periodos.some((p) => p.items.some((it) => it.productName));
    if (!hasAnyDevice) {
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

      // Preparar períodos con dispositivos anidados
      const preparedPeriodos = periodos
        .map((p) => {
          const validPeriodoItems = p.items.filter((it) => it.productName);
          if (validPeriodoItems.length === 0) return null;
          return {
            id: p.id,
            fechaSalida: p.fechaSalida ? Timestamp.fromDate(p.fechaSalida) : null,
            dias: Number(p.dias) || 0,
            diasBonificados: Number(p.diasBonificados) || 0,
            items: validPeriodoItems.map((it) => ({
              id: it.id,
              productName: it.productName || "",
              description: "",
              quantity: Number(it.quantity) || 0,
              unitPrice: Number(it.unitPrice) || 0,
              subtotal: (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
              tax: 0,
              taxAmount: 0,
              isManual: true,
            })),
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

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
        items: [],
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

  const getDispositivosPreview = () => {
    const totalItems = periodos.reduce(
      (sum, p) => sum + p.items.filter((it) => it.productName).length,
      0,
    );
    if (totalItems === 0) return "Sin dispositivos";
    const periodCount = periodos.filter((p) => p.items.some((it) => it.productName)).length;
    const periodText = periodCount > 0 ? ` en ${periodCount} período${periodCount > 1 ? "s" : ""}` : "";
    return `${totalItems} dispositivo${totalItems > 1 ? "s" : ""}${periodText} - ${formatCurrency(totals.subtotalDispositivos)}`;
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

  // Render: una card por período con dispositivos anidados
  const renderPeriodos = () => {
    return periodos.map((p, pIdx) => {
      const fechaFin = calcularFechaFin(p.fechaSalida, p.dias, p.diasBonificados);
      const subPeriodo = periodoSubtotal(p);
      return (
        <div key={p.id} className="border-2 border-slate-300 bg-slate-50 rounded-lg p-4 space-y-3">
          {/* Cabecera del período */}
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div className="flex items-center gap-2 font-semibold text-slate-700">
              <span>Período {pIdx + 1}</span>
            </div>
            {periodos.length > 1 && (
              <Button
                type="button"
                onClick={() => removePeriodo(pIdx)}
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                title="Eliminar período"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Fecha salida</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !p.fechaSalida && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {p.fechaSalida ? format(p.fechaSalida, "dd/MM/yyyy", { locale: es }) : <span>Fecha</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={p.fechaSalida}
                    onSelect={(date) => handlePeriodoChange(pIdx, "fechaSalida", date)}
                    locale={es}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Días</Label>
              <Input
                type="number"
                min="1"
                value={p.dias ?? ""}
                onChange={(e) => handlePeriodoChange(pIdx, "dias", e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Días"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Días bonif.</Label>
              <Input
                type="number"
                min="0"
                value={p.diasBonificados ?? ""}
                onChange={(e) => handlePeriodoChange(pIdx, "diasBonificados", e.target.value ? Number(e.target.value) : undefined)}
                placeholder="0"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Hasta</Label>
              {fechaFin ? (
                <span className="block px-3 py-2 bg-green-100 text-green-800 rounded-md text-sm font-medium">
                  {format(fechaFin, "dd/MM/yyyy", { locale: es })}
                </span>
              ) : (
                <span className="block px-3 py-2 bg-slate-100 text-slate-500 rounded-md text-sm">--/--/----</span>
              )}
            </div>
          </div>

          {/* Dispositivos del período */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Dispositivos</Label>
            {p.items.map((it, iIdx) => {
              const itemSubtotal = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
              return (
              <div key={it.id} className="flex gap-3 items-start bg-white rounded-lg p-3 border">
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                  <div className="col-span-2 sm:col-span-2">
                    <Label className="text-xs text-slate-500">Dispositivo</Label>
                    <DeviceAutocomplete
                      devices={devices || []}
                      value={it.productName || ""}
                      onChange={(value) => handleItemChange(pIdx, iIdx, "productName", value)}
                      placeholder="Seleccionar..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Cantidad</Label>
                    <Input
                      type="number"
                      min="1"
                      value={it.quantity ?? ""}
                      onChange={(e) => handleItemChange(pIdx, iIdx, "quantity", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="Cant."
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Precio Unit.</Label>
                    <MoneyInput
                      value={Number(it.unitPrice) || 0}
                      onValueChange={(n) => handleItemChange(pIdx, iIdx, "unitPrice", n || undefined)}
                      placeholder="$"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Subtotal</Label>
                    <span className="block px-3 py-2 bg-slate-50 text-slate-800 rounded-md text-sm font-semibold text-right">
                      {formatCurrency(itemSubtotal)}
                    </span>
                  </div>
                </div>
                {p.items.length > 1 && (
                  <Button
                    type="button"
                    onClick={() => removeItem(pIdx, iIdx)}
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 mt-5"
                    title="Eliminar dispositivo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              );
            })}
            <Button
              type="button"
              onClick={() => addItem(pIdx)}
              variant="ghost"
              size="sm"
              className="text-blue-900 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4 mr-1" />
              Agregar dispositivo
            </Button>
          </div>

          <div className="text-right text-sm text-slate-700 pt-2 border-t">
            Subtotal del período:{" "}
            <span className="font-semibold text-slate-900">{formatCurrency(subPeriodo)}</span>
          </div>
        </div>
      );
    });
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
                <MoneyInput
                  value={fp.monto || 0}
                  onValueChange={(n) => handleFormaPagoChange(index, "monto", n)}
                  placeholder="0"
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
            <MoneyInput
              id="costoImpresiones"
              value={impresiones.costo || 0}
              onValueChange={(n) =>
                setImpresiones((prev) => ({ ...prev, costo: n }))
              }
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ventaImpresiones">Venta impresiones</Label>
            <MoneyInput
              id="ventaImpresiones"
              value={impresiones.venta || 0}
              onValueChange={(n) =>
                setImpresiones((prev) => ({ ...prev, venta: n }))
              }
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fleteImpresiones">Flete</Label>
            <MoneyInput
              id="fleteImpresiones"
              value={impresiones.flete || 0}
              onValueChange={(n) =>
                setImpresiones((prev) => ({ ...prev, flete: n }))
              }
              placeholder="0"
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
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="clientId">Cliente</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Incluir Banderas</span>
              <button
                type="button"
                role="switch"
                aria-checked={includeBanderas}
                onClick={() => setIncludeBanderas((v) => !v)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  includeBanderas ? "bg-blue-900" : "bg-slate-300"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    includeBanderas ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <Input
              id="clientId"
              ref={clienteInputRef}
              placeholder="Buscar o escribir cliente..."
              value={clienteInput}
              onChange={(e) => handleClienteInputChange(e.target.value)}
              onKeyDown={handleClienteKeyDown}
              onFocus={() => {
                setShowClienteDropdown(true);
                setHighlightedClientIndex(-1);
              }}
              onBlur={() =>
                setTimeout(() => {
                  setShowClienteDropdown(false);
                  setHighlightedClientIndex(-1);
                }, 150)
              }
              autoComplete="off"
            />
            {showClienteDropdown && filteredClients.length > 0 && (
              <ul
                style={{
                  position: "absolute",
                  zIndex: 10,
                  background: "white",
                  border: "1px solid #e5e7eb",
                  padding: 6,
                  borderRadius: 6,
                  width: "100%",
                  maxHeight: 220,
                  overflowY: "auto",
                  marginTop: 2,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
              >
                {filteredClients.map((c, index) => (
                  <li
                    key={c.id}
                    style={{
                      padding: 8,
                      borderRadius: 6,
                      cursor: "pointer",
                      backgroundColor:
                        index === highlightedClientIndex
                          ? "#f1f5f9"
                          : "transparent",
                      transition: "background-color 0.15s ease",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                    onMouseEnter={() => setHighlightedClientIndex(index)}
                    onMouseDown={() => handleSelectClient(c)}
                  >
                    <span>{c.name}</span>
                    {includeBanderas && (
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full shrink-0",
                          c.section === EClientSection.BANDERAS
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-800"
                        )}
                      >
                        {c.section === EClientSection.BANDERAS
                          ? "Banderas"
                          : "Vía Pública"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
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

  // --- Contenido de dispositivos ---
  const renderDispositivosContent = () => (
    <>
      <div className="flex justify-end gap-2 mb-3">
        <Button
          type="button"
          onClick={addPeriodo}
          variant="outline"
          size="sm"
          className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Agregar período
        </Button>
      </div>
      <div className="space-y-4">
        {renderPeriodos()}
      </div>
      <div className="mt-4 text-right text-sm text-slate-600">
        Total Dispositivos: <span className="font-semibold">{formatCurrency(totals.subtotalDispositivos)}</span>
      </div>
    </>
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

            {/* Dispositivos */}
            <AccordionItem value="dispositivos" className="border rounded-lg bg-white">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-left">
                  <span className="font-semibold">Dispositivos</span>
                  <span className="text-sm text-slate-500 font-normal md:hidden">{getDispositivosPreview()}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {renderDispositivosContent()}
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

            {/* Dispositivos */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle>Dispositivos</CardTitle>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={addPeriodo}
                    variant="outline"
                    size="sm"
                    className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar período
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {renderPeriodos()}
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
                      <MoneyInput
                        id="costoImpresiones-desktop"
                        value={impresiones.costo || 0}
                        onValueChange={(n) =>
                          setImpresiones((prev) => ({ ...prev, costo: n }))
                        }
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ventaImpresiones-desktop">Venta impresiones</Label>
                      <MoneyInput
                        id="ventaImpresiones-desktop"
                        value={impresiones.venta || 0}
                        onValueChange={(n) =>
                          setImpresiones((prev) => ({ ...prev, venta: n }))
                        }
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fleteImpresiones-desktop">Flete</Label>
                      <MoneyInput
                        id="fleteImpresiones-desktop"
                        value={impresiones.flete || 0}
                        onValueChange={(n) =>
                          setImpresiones((prev) => ({ ...prev, flete: n }))
                        }
                        placeholder="0"
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
