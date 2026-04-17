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
import { Save, Trash2, Plus, Calendar as CalendarIcon, Link2, Unlink } from "lucide-react";
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
  fechaSalida: Date | undefined;
  dias: number | undefined;
  periodoGroupId?: string;
  selected?: boolean; // para selección de agrupamiento
};

const createEmptyItem = (): FormItem => ({
  id: Math.random().toString(36).substring(7),
  productName: "",
  quantity: undefined,
  unitPrice: undefined,
  fechaSalida: undefined,
  dias: undefined,
  selected: false,
});

// Colores para grupos
const GROUP_COLORS = [
  { bg: "bg-blue-50", border: "border-blue-300", badge: "bg-blue-100 text-blue-800", label: "Grupo A" },
  { bg: "bg-green-50", border: "border-green-300", badge: "bg-green-100 text-green-800", label: "Grupo B" },
  { bg: "bg-purple-50", border: "border-purple-300", badge: "bg-purple-100 text-purple-800", label: "Grupo C" },
  { bg: "bg-orange-50", border: "border-orange-300", badge: "bg-orange-100 text-orange-800", label: "Grupo D" },
  { bg: "bg-pink-50", border: "border-pink-300", badge: "bg-pink-100 text-pink-800", label: "Grupo E" },
];

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

  // Items planos con fecha individual
  const [items, setItems] = useState<FormItem[]>([createEmptyItem()]);

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

  // --- Handlers de items ---
  const handleItemChange = (idx: number, field: keyof FormItem, value: any) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };

    // Si cambia fecha o días y el item pertenece a un grupo, actualizar todos los del grupo
    if ((field === "fechaSalida" || field === "dias") && updated[idx].periodoGroupId) {
      const groupId = updated[idx].periodoGroupId;
      updated.forEach((item, i) => {
        if (item.periodoGroupId === groupId) {
          updated[i] = { ...updated[i], [field]: value };
        }
      });
    }

    setItems(updated);
  };

  const addItem = () => {
    setItems([...items, createEmptyItem()]);
  };

  const removeItem = (idx: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== idx));
    }
  };

  // --- Agrupación ---
  const toggleItemSelection = (idx: number) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], selected: !updated[idx].selected };
    setItems(updated);
  };

  const getUniqueGroupIds = (): string[] => {
    const ids = new Set<string>();
    items.forEach((item) => {
      if (item.periodoGroupId) ids.add(item.periodoGroupId);
    });
    return Array.from(ids);
  };

  const getGroupColor = (groupId: string) => {
    const groups = getUniqueGroupIds();
    const idx = groups.indexOf(groupId);
    return GROUP_COLORS[idx % GROUP_COLORS.length];
  };

  const getGroupLabel = (groupId: string) => {
    const groups = getUniqueGroupIds();
    const idx = groups.indexOf(groupId);
    return GROUP_COLORS[idx % GROUP_COLORS.length]?.label || `Grupo ${idx + 1}`;
  };

  const groupSelected = () => {
    const selectedItems = items.filter((i) => i.selected);
    if (selectedItems.length < 2) {
      toast.error("Seleccioná al menos 2 dispositivos para agrupar");
      return;
    }
    const groupId = `group-${Date.now()}`;
    // Tomar fecha y días del primer seleccionado que los tenga
    const refItem = selectedItems.find((i) => i.fechaSalida) || selectedItems[0];
    const updated = items.map((item) => {
      if (item.selected) {
        return {
          ...item,
          periodoGroupId: groupId,
          fechaSalida: refItem.fechaSalida,
          dias: refItem.dias,
          selected: false,
        };
      }
      return { ...item, selected: false };
    });
    setItems(updated);
    toast.success("Dispositivos agrupados");
  };

  const ungroupItem = (idx: number) => {
    const updated = [...items];
    const groupId = updated[idx].periodoGroupId;
    updated[idx] = { ...updated[idx], periodoGroupId: undefined };

    // Si el grupo queda con menos de 2 items, desagrupar todos
    if (groupId) {
      const remaining = updated.filter((i) => i.periodoGroupId === groupId);
      if (remaining.length < 2) {
        updated.forEach((item, i) => {
          if (item.periodoGroupId === groupId) {
            updated[i] = { ...updated[i], periodoGroupId: undefined };
          }
        });
      }
    }

    setItems(updated);
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

  // Calcular fecha fin
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
    items.forEach((item) => {
      const cantidad = Number(item.quantity) || 0;
      const precio = Number(item.unitPrice) || 0;
      subtotalDispositivos += cantidad * precio;
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
      const selectedClient = clients?.find((c) => c.id === formData.clientId);
      if (!selectedClient) {
        toast.error("Cliente no encontrado");
        return;
      }

      // Preparar items con fechas
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
        fechaSalida: item.fechaSalida ? Timestamp.fromDate(item.fechaSalida) : null,
        dias: item.dias || null,
        periodoGroupId: item.periodoGroupId || null,
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
    const totalItems = items.filter((i) => i.productName).length;
    if (totalItems === 0) return "Sin dispositivos";
    const groups = getUniqueGroupIds().length;
    const groupText = groups > 0 ? `, ${groups} grupo${groups > 1 ? "s" : ""}` : "";
    return `${totalItems} dispositivo${totalItems > 1 ? "s" : ""}${groupText} - ${formatCurrency(totals.subtotalDispositivos)}`;
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

  const hasSelectedItems = items.some((i) => i.selected);

  // Organizar items para renderizado: agrupar los que tienen periodoGroupId
  const renderItems = () => {
    const renderedGroupIds = new Set<string>();
    const elements: React.ReactNode[] = [];

    items.forEach((item, idx) => {
      if (item.periodoGroupId) {
        if (renderedGroupIds.has(item.periodoGroupId)) return;
        renderedGroupIds.add(item.periodoGroupId);

        // Renderizar grupo completo
        const groupId = item.periodoGroupId;
        const groupItems = items
          .map((i, originalIdx) => ({ item: i, idx: originalIdx }))
          .filter((entry) => entry.item.periodoGroupId === groupId);
        const color = getGroupColor(groupId);
        const groupLabel = getGroupLabel(groupId);

        // Fecha y días del grupo (todos comparten)
        const groupFechaSalida = groupItems[0].item.fechaSalida;
        const groupDias = groupItems[0].item.dias;
        const fechaFin = calcularFechaFin(groupFechaSalida, groupDias);

        elements.push(
          <div key={`group-${groupId}`} className={`border-2 ${color.border} ${color.bg} rounded-lg p-4 space-y-3`}>
            {/* Header del grupo */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${color.badge}`}>{groupLabel}</span>

              <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-3">
                <div className="sm:w-[80px]">
                  <Label className="text-xs text-slate-500 sm:hidden">Días</Label>
                  <Input
                    type="number"
                    min="1"
                    value={groupDias ?? ""}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : undefined;
                      const updated = [...items];
                      updated.forEach((it, i) => {
                        if (it.periodoGroupId === groupId) updated[i] = { ...updated[i], dias: val };
                      });
                      setItems(updated);
                    }}
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
                          !groupFechaSalida && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {groupFechaSalida ? format(groupFechaSalida, "dd/MM/yyyy", { locale: es }) : <span>Fecha salida</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={groupFechaSalida}
                        onSelect={(date) => {
                          const updated = [...items];
                          updated.forEach((it, i) => {
                            if (it.periodoGroupId === groupId) updated[i] = { ...updated[i], fechaSalida: date };
                          });
                          setItems(updated);
                        }}
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
                  <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-md text-sm">--/--/----</span>
                )}
              </div>
            </div>

            {/* Items del grupo */}
            <div className="space-y-2">
              {groupItems.map(({ item: gi, idx: giIdx }) => (
                <div key={gi.id} className="flex gap-3 items-start bg-white rounded-lg p-3 border">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <Label className="text-xs text-slate-500">Dispositivo</Label>
                      <DeviceAutocomplete
                        devices={devices || []}
                        value={gi.productName || ""}
                        onChange={(value) => handleItemChange(giIdx, "productName", value)}
                        placeholder="Seleccionar..."
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Cantidad</Label>
                      <Input
                        type="number"
                        min="1"
                        value={gi.quantity ?? ""}
                        onChange={(e) => handleItemChange(giIdx, "quantity", e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="Cant."
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Precio Unit.</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={gi.unitPrice ?? ""}
                        onChange={(e) => handleItemChange(giIdx, "unitPrice", e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="$"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 pt-5">
                    <Button
                      type="button"
                      onClick={() => ungroupItem(giIdx)}
                      variant="ghost"
                      size="sm"
                      className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                      title="Desagrupar"
                    >
                      <Unlink className="h-4 w-4" />
                    </Button>
                    {items.length > 1 && (
                      <Button
                        type="button"
                        onClick={() => removeItem(giIdx)}
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      } else {
        // Item individual (sin grupo)
        const fechaFin = calcularFechaFin(item.fechaSalida, item.dias);

        elements.push(
          <div key={item.id} className="p-4 border rounded-lg bg-white space-y-3">
            <div className="flex items-start gap-3">
              <div className="pt-5">
                <Checkbox
                  checked={item.selected || false}
                  onCheckedChange={() => toggleItemSelection(idx)}
                />
              </div>
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500">Dispositivo</Label>
                    <DeviceAutocomplete
                      devices={devices || []}
                      value={item.productName || ""}
                      onChange={(value) => handleItemChange(idx, "productName", value)}
                      placeholder="Seleccionar..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Cantidad</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity ?? ""}
                      onChange={(e) => handleItemChange(idx, "quantity", e.target.value ? Number(e.target.value) : undefined)}
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
                      onChange={(e) => handleItemChange(idx, "unitPrice", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="$"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="sm:w-[80px]">
                    <Label className="text-xs text-slate-500">Días</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.dias ?? ""}
                      onChange={(e) => handleItemChange(idx, "dias", e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="Días"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Fecha salida</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !item.fechaSalida && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {item.fechaSalida ? format(item.fechaSalida, "dd/MM/yyyy", { locale: es }) : <span>Fecha</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={item.fechaSalida}
                          onSelect={(date) => handleItemChange(idx, "fechaSalida", date)}
                          locale={es}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex items-end gap-2 col-span-2 sm:col-span-2">
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
                </div>
              </div>
              <div className="pt-5">
                {items.length > 1 && (
                  <Button
                    type="button"
                    onClick={() => removeItem(idx)}
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      }
    });

    return elements;
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

  // --- Contenido de dispositivos ---
  const renderDispositivosContent = () => (
    <>
      <div className="flex justify-end gap-2 mb-3">
        {hasSelectedItems && (
          <Button
            type="button"
            onClick={groupSelected}
            variant="outline"
            size="sm"
            className="text-blue-900 border-blue-900 hover:bg-blue-50"
          >
            <Link2 className="h-4 w-4 mr-2" />
            Agrupar seleccionados
          </Button>
        )}
        <Button
          type="button"
          onClick={addItem}
          variant="outline"
          size="sm"
          className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Agregar Dispositivo
        </Button>
      </div>
      <div className="space-y-4">
        {renderItems()}
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
                  {hasSelectedItems && (
                    <Button
                      type="button"
                      onClick={groupSelected}
                      variant="outline"
                      size="sm"
                      className="text-blue-900 border-blue-900 hover:bg-blue-50"
                    >
                      <Link2 className="h-4 w-4 mr-2" />
                      Agrupar seleccionados
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={addItem}
                    variant="outline"
                    size="sm"
                    className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Dispositivo
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {renderItems()}
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
