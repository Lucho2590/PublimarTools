'use client';

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useUser, useFirestoreCollectionData } from "reactfire";
import { doc, getDoc, updateDoc, collection, query, where, serverTimestamp, Timestamp, Query, CollectionReference, orderBy, addDoc, getDocs } from "firebase/firestore";
import { softDelete } from '@/lib/softDelete';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  Edit,
  X,
  Calendar as CalendarIcon,
  History,
  Eye,
  Link2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn, extractIdFromSlug } from "@/lib/utils";
import collections from "@/lib/collections";
import { EQuoteStatus } from "@/types/quote";
import { TClient, EClientSection } from "@/types/client";
import { TDeviceType } from "@/types/device";
import { EUserRole } from "@/types/user";
import { useAuth } from "@/contexts/AuthContext";
import { DeviceAutocomplete } from "@/components/ui/device-autocomplete";

// Item plano con fecha individual
interface QuoteItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  fechaSalida?: any;
  dias?: number;
  periodoGroupId?: string;
  selected?: boolean;
}

// Datos del presupuesto
interface ViaPublicaQuote {
  id: string;
  number: string;
  client: TClient;
  items: QuoteItem[];
  fecha: any;
  formasPago: Array<{
    tipo: string;
    monto: number;
    cuenta?: string;
    factura: boolean;
    tipoFactura?: string;
  }>;
  conImpresiones: boolean;
  impresiones?: {
    costo: number;
    venta: number;
    flete: number;
  };
  notes?: string;
  subtotalDispositivos: number;
  ventaImpresiones: number;
  totalVenta: number;
  status: EQuoteStatus;
  version: number;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
}

// Colores para grupos
const GROUP_COLORS = [
  { bg: "bg-blue-50", border: "border-blue-300", badge: "bg-blue-100 text-blue-800", label: "Grupo A" },
  { bg: "bg-green-50", border: "border-green-300", badge: "bg-green-100 text-green-800", label: "Grupo B" },
  { bg: "bg-purple-50", border: "border-purple-300", badge: "bg-purple-100 text-purple-800", label: "Grupo C" },
  { bg: "bg-orange-50", border: "border-orange-300", badge: "bg-orange-100 text-orange-800", label: "Grupo D" },
  { bg: "bg-pink-50", border: "border-pink-300", badge: "bg-pink-100 text-pink-800", label: "Grupo E" },
];

export default function PresupuestoDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const firestore = useFirestore();
  const { data: firebaseUser } = useUser();
  const { userRole } = useAuth();

  const quoteId = extractIdFromSlug(params.id);

  const [quote, setQuote] = useState<ViaPublicaQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [editData, setEditData] = useState<ViaPublicaQuote | null>(null);
  const [showVersionsDialog, setShowVersionsDialog] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<any | null>(null);

  // Cargar clientes
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

  // Helper para obtener fecha
  const getDate = (dateField: any): Date | undefined => {
    if (!dateField) return undefined;
    let date: Date;
    if (dateField.toDate && typeof dateField.toDate === 'function') {
      date = dateField.toDate();
    } else if (dateField instanceof Date) {
      date = dateField;
    } else if (typeof dateField === 'object' && dateField.seconds !== undefined) {
      date = new Date(dateField.seconds * 1000);
    } else if (typeof dateField === 'string' || typeof dateField === 'number') {
      date = new Date(dateField);
    } else {
      return undefined;
    }
    return isNaN(date.getTime()) ? undefined : date;
  };

  // Migrar estructura vieja a nueva (items planos con fechaSalida individual)
  const migrateToNewStructure = (data: any): ViaPublicaQuote => {
    // Check if items already have fechaSalida (new structure)
    const hasNewFlatStructure = data.items?.length > 0 && (data.items[0]?.fechaSalida !== undefined || data.items[0]?.dias !== undefined || data.items[0]?.periodoGroupId !== undefined);

    if (hasNewFlatStructure) {
      return {
        ...data,
        items: data.items.map((i: any) => ({
          id: i.id,
          productName: i.productName,
          quantity: i.quantity || 0,
          unitPrice: i.unitPrice || 0,
          subtotal: (i.quantity || 0) * (i.unitPrice || 0),
          fechaSalida: i.fechaSalida,
          dias: i.dias,
          periodoGroupId: i.periodoGroupId || undefined,
        })),
      } as ViaPublicaQuote;
    }

    // Old structure: periodos with nested items → flatten
    const oldPeriodos = data.periodos || [];
    const hasOldNestedStructure = oldPeriodos.length > 0 && oldPeriodos[0]?.items?.length > 0;

    if (hasOldNestedStructure) {
      const flatItems: QuoteItem[] = [];
      oldPeriodos.forEach((periodo: any) => {
        const groupId = periodo.items.length > 1 ? `migrated-${periodo.id}` : undefined;
        periodo.items.forEach((item: any) => {
          flatItems.push({
            id: item.id,
            productName: item.productName,
            quantity: item.quantity || 0,
            unitPrice: item.unitPrice || 0,
            subtotal: (item.quantity || 0) * (item.unitPrice || 0),
            fechaSalida: periodo.fechaInicio,
            dias: periodo.dias,
            periodoGroupId: groupId,
          });
        });
      });
      return { ...data, items: flatItems } as ViaPublicaQuote;
    }

    // Very old structure: flat items without any periods
    const items = data.items || [];
    return {
      ...data,
      items: items.map((i: any) => ({
        id: i.id,
        productName: i.productName,
        quantity: i.quantity || 0,
        unitPrice: i.unitPrice || 0,
        subtotal: (i.quantity || 0) * (i.unitPrice || 0),
        fechaSalida: i.fechaSalida || undefined,
        dias: i.dias || undefined,
        periodoGroupId: i.periodoGroupId || undefined,
      })),
    } as ViaPublicaQuote;
  };

  // Cargar presupuesto
  useEffect(() => {
    const loadQuote = async () => {
      try {
        const quoteRef = doc(firestore, collections.QUOTES, quoteId);
        const quoteSnap = await getDoc(quoteRef);

        if (quoteSnap.exists()) {
          const data = quoteSnap.data();
          const migrated = migrateToNewStructure({ ...data, id: quoteSnap.id });
          setQuote(migrated);
        } else {
          toast.error("Presupuesto no encontrado");
          router.push("/publimar/viaPublica/presupuestos");
        }
      } catch (error) {
        console.error("Error cargando presupuesto:", error);
        toast.error("Error al cargar el presupuesto");
      } finally {
        setLoading(false);
      }
    };

    loadQuote();
  }, [firestore, quoteId, router]);

  // Sincronizar editData
  useEffect(() => {
    if (isEditing && quote) {
      setEditData(JSON.parse(JSON.stringify(quote)));
    }
  }, [isEditing, quote]);

  const hasChanges = useMemo(() => {
    if (!quote || !editData) return false;
    return JSON.stringify(quote) !== JSON.stringify(editData);
  }, [quote, editData]);

  // Versiones
  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const versionsRef = collection(firestore, collections.QUOTES, quoteId, "versions");
      const versionsQuery = query(versionsRef, orderBy("version", "desc"));
      const snapshot = await getDocs(versionsQuery);
      setVersions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error cargando versiones:", error);
      toast.error("Error al cargar el historial");
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleOpenVersions = () => {
    setShowVersionsDialog(true);
    loadVersions();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
  };

  const calcularFechaFin = (fechaInicio: Date | undefined, dias: number | undefined): Date | null => {
    if (!fechaInicio || !dias || dias <= 0) return null;
    return addDays(fechaInicio, dias - 1);
  };

  // Calcular totales
  const calculateTotals = (data: ViaPublicaQuote | null) => {
    if (!data) return { subtotalDispositivos: 0, ventaImpresiones: 0, fleteImpresiones: 0, totalVenta: 0 };

    let subtotalDispositivos = 0;
    data.items?.forEach((item) => {
      subtotalDispositivos += (item.quantity || 0) * (item.unitPrice || 0);
    });

    const ventaImpresiones = data.conImpresiones ? (data.impresiones?.venta || 0) : 0;
    const fleteImpresiones = data.conImpresiones ? (data.impresiones?.flete || 0) : 0;
    const totalVenta = subtotalDispositivos + ventaImpresiones + fleteImpresiones;

    return { subtotalDispositivos, ventaImpresiones, fleteImpresiones, totalVenta };
  };

  // --- Group helpers ---
  const getUniqueGroupIds = (itemsArr: QuoteItem[]): string[] => {
    const ids = new Set<string>();
    itemsArr.forEach((item) => {
      if (item.periodoGroupId) ids.add(item.periodoGroupId);
    });
    return Array.from(ids);
  };

  const getGroupColor = (groupId: string, itemsArr: QuoteItem[]) => {
    const groups = getUniqueGroupIds(itemsArr);
    const idx = groups.indexOf(groupId);
    return GROUP_COLORS[idx % GROUP_COLORS.length];
  };

  const getGroupLabel = (groupId: string, itemsArr: QuoteItem[]) => {
    const groups = getUniqueGroupIds(itemsArr);
    const idx = groups.indexOf(groupId);
    return GROUP_COLORS[idx % GROUP_COLORS.length]?.label || `Grupo ${idx + 1}`;
  };

  // --- Item handlers ---
  const handleItemChange = (idx: number, field: string, value: any) => {
    if (!editData) return;
    const newItems = [...editData.items];
    newItems[idx] = { ...newItems[idx], [field]: value };

    if ((field === "fechaSalida" || field === "dias") && newItems[idx].periodoGroupId) {
      const groupId = newItems[idx].periodoGroupId;
      newItems.forEach((item, i) => {
        if (item.periodoGroupId === groupId) {
          newItems[i] = { ...newItems[i], [field]: value };
        }
      });
    }

    if (field === "quantity" || field === "unitPrice") {
      newItems[idx].subtotal = (newItems[idx].quantity || 0) * (newItems[idx].unitPrice || 0);
    }

    setEditData({ ...editData, items: newItems });
  };

  const addItem = () => {
    if (!editData) return;
    setEditData({
      ...editData,
      items: [...editData.items, {
        id: `item-${Date.now()}`,
        productName: "",
        quantity: 1,
        unitPrice: 0,
        subtotal: 0,
      }],
    });
  };

  const removeItem = (idx: number) => {
    if (!editData || editData.items.length <= 1) return;
    setEditData({ ...editData, items: editData.items.filter((_, i) => i !== idx) });
  };

  const toggleItemSelection = (idx: number) => {
    if (!editData) return;
    const newItems = [...editData.items];
    newItems[idx] = { ...newItems[idx], selected: !newItems[idx].selected };
    setEditData({ ...editData, items: newItems });
  };

  const groupSelected = () => {
    if (!editData) return;
    const selectedItems = editData.items.filter((i) => i.selected);
    if (selectedItems.length < 2) {
      toast.error("Seleccioná al menos 2 dispositivos para agrupar");
      return;
    }
    const groupId = `group-${Date.now()}`;
    const refItem = selectedItems.find((i) => i.fechaSalida) || selectedItems[0];
    const newItems = editData.items.map((item) => {
      if (item.selected) {
        return { ...item, periodoGroupId: groupId, fechaSalida: refItem.fechaSalida, dias: refItem.dias, selected: false };
      }
      return { ...item, selected: false };
    });
    setEditData({ ...editData, items: newItems });
    toast.success("Dispositivos agrupados");
  };

  const ungroupItem = (idx: number) => {
    if (!editData) return;
    const newItems = [...editData.items];
    const groupId = newItems[idx].periodoGroupId;
    newItems[idx] = { ...newItems[idx], periodoGroupId: undefined };
    if (groupId) {
      const remaining = newItems.filter((i) => i.periodoGroupId === groupId);
      if (remaining.length < 2) {
        newItems.forEach((item, i) => {
          if (item.periodoGroupId === groupId) newItems[i] = { ...newItems[i], periodoGroupId: undefined };
        });
      }
    }
    setEditData({ ...editData, items: newItems });
  };

  // --- Formas de pago handlers ---
  const handleFormaPagoChange = (index: number, field: string, value: any) => {
    if (!editData) return;
    const newFormasPago = [...editData.formasPago];
    newFormasPago[index] = { ...newFormasPago[index], [field]: value };
    if (field === "tipo" && value !== "transferencia") newFormasPago[index].cuenta = "";
    if (field === "factura" && value === false) newFormasPago[index].tipoFactura = "";
    setEditData({ ...editData, formasPago: newFormasPago });
  };

  const addFormaPago = () => {
    if (!editData) return;
    setEditData({
      ...editData,
      formasPago: [...editData.formasPago, { tipo: "", monto: 0, cuenta: "", factura: false, tipoFactura: "" }],
    });
  };

  const removeFormaPago = (index: number) => {
    if (!editData || editData.formasPago.length <= 1) return;
    setEditData({ ...editData, formasPago: editData.formasPago.filter((_, i) => i !== index) });
  };

  const toTimestamp = (dateField: any): Timestamp | null => {
    const date = getDate(dateField);
    return date ? Timestamp.fromDate(date) : null;
  };

  // Guardar cambios
  const handleSave = async () => {
    if (!editData || !hasChanges || !quote) return;

    setSaving(true);
    try {
      const totals = calculateTotals(editData);
      const quoteRef = doc(firestore, collections.QUOTES, quoteId);
      const versionsCollection = collection(firestore, collections.QUOTES, quoteId, "versions");

      const currentVersion = quote.version || 1;

      // Archivar versión anterior
      const versionSnapshot = {
        number: quote.number,
        client: { id: quote.client.id, name: quote.client.name, section: quote.client.section },
        items: quote.items.map(i => ({
          id: i.id,
          productName: i.productName,
          quantity: i.quantity || 0,
          unitPrice: i.unitPrice || 0,
          subtotal: (i.quantity || 0) * (i.unitPrice || 0),
          fechaSalida: toTimestamp(i.fechaSalida),
          dias: i.dias || null,
          periodoGroupId: i.periodoGroupId || null,
        })),
        fecha: toTimestamp(quote.fecha),
        formasPago: quote.formasPago,
        conImpresiones: quote.conImpresiones,
        impresiones: quote.impresiones,
        notes: quote.notes,
        subtotalDispositivos: quote.subtotalDispositivos,
        ventaImpresiones: quote.ventaImpresiones,
        totalVenta: quote.totalVenta,
        status: quote.status,
        version: currentVersion,
        archivedAt: serverTimestamp(),
        archivedBy: firebaseUser?.uid,
      };

      await addDoc(versionsCollection, versionSnapshot);

      // Preparar items con Timestamps
      const preparedItems = editData.items.map(i => ({
        id: i.id,
        productName: i.productName,
        description: "",
        quantity: i.quantity || 0,
        unitPrice: i.unitPrice || 0,
        subtotal: (i.quantity || 0) * (i.unitPrice || 0),
        tax: 0,
        taxAmount: 0,
        isManual: true,
        fechaSalida: toTimestamp(i.fechaSalida),
        dias: i.dias || null,
        periodoGroupId: i.periodoGroupId || null,
      }));

      const updateData = {
        client: { id: editData.client.id, name: editData.client.name, section: editData.client.section },
        items: preparedItems,
        fecha: toTimestamp(editData.fecha),
        formasPago: editData.formasPago,
        conImpresiones: editData.conImpresiones,
        impresiones: editData.impresiones,
        notes: editData.notes,
        subtotalDispositivos: totals.subtotalDispositivos,
        ventaImpresiones: totals.ventaImpresiones,
        fleteImpresiones: totals.fleteImpresiones,
        totalVenta: totals.totalVenta,
        total: totals.totalVenta,
        version: currentVersion + 1,
        updatedAt: serverTimestamp(),
        updatedBy: firebaseUser?.uid,
      };

      await updateDoc(quoteRef, updateData);

      setQuote({
        ...editData,
        subtotalDispositivos: totals.subtotalDispositivos,
        ventaImpresiones: totals.ventaImpresiones,
        totalVenta: totals.totalVenta,
        version: currentVersion + 1,
      });

      setIsEditing(false);
      toast.success(`Presupuesto actualizado (v${currentVersion + 1})`);
    } catch (error) {
      console.error("Error guardando:", error);
      toast.error("Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== "ELIMINAR") {
      toast.error("Escribe ELIMINAR para confirmar");
      return;
    }
    try {
      await softDelete(firestore, collections.QUOTES, quoteId);
      toast.success("Presupuesto eliminado");
      router.push("/publimar/viaPublica/presupuestos");
    } catch (error) {
      console.error("Error eliminando:", error);
      toast.error("Error al eliminar el presupuesto");
    }
  };

  const handleCancelEdit = () => {
    setEditData(null);
    setIsEditing(false);
  };

  const getTipoPagoLabel = (tipo: string) => {
    switch (tipo) {
      case "efectivo": return "Efectivo";
      case "transferencia": return "Transferencia";
      case "cheque": return "Cheque";
      case "cuenta_corriente": return "Cuenta Corriente";
      case "canje": return "Canje";
      default: return tipo;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!quote) {
    return <div>Presupuesto no encontrado</div>;
  }

  const displayData = isEditing ? editData : quote;
  const totals = calculateTotals(displayData);
  const isAdmin = userRole === EUserRole.ADMIN;
  const hasSelectedItems = isEditing && editData?.items.some((i) => i.selected);

  // --- Render items with grouping ---
  const renderItemsSection = () => {
    if (!displayData) return null;
    const itemsArr = displayData.items;
    const renderedGroupIds = new Set<string>();
    const elements: React.ReactNode[] = [];

    itemsArr.forEach((item, idx) => {
      if (item.periodoGroupId) {
        if (renderedGroupIds.has(item.periodoGroupId)) return;
        renderedGroupIds.add(item.periodoGroupId);

        const groupId = item.periodoGroupId;
        const groupItems = itemsArr
          .map((i, originalIdx) => ({ item: i, idx: originalIdx }))
          .filter((entry) => entry.item.periodoGroupId === groupId);
        const color = getGroupColor(groupId, itemsArr);
        const groupLabel = getGroupLabel(groupId, itemsArr);
        const groupFechaSalida = getDate(groupItems[0].item.fechaSalida);
        const groupDias = groupItems[0].item.dias;
        const fechaFin = calcularFechaFin(groupFechaSalida, groupDias);

        elements.push(
          <div key={`group-${groupId}`} className={`border-2 ${color.border} ${color.bg} rounded-lg p-4 space-y-3`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${color.badge}`}>{groupLabel}</span>

              <div className="w-[80px]">
                {isEditing ? (
                  <Input
                    type="number" min="1"
                    value={groupDias ?? ""}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : undefined;
                      const newItems = [...editData!.items];
                      newItems.forEach((it, i) => {
                        if (it.periodoGroupId === groupId) newItems[i] = { ...newItems[i], dias: val as any };
                      });
                      setEditData({ ...editData!, items: newItems });
                    }}
                    placeholder="Días"
                  />
                ) : (
                  <span className="font-medium">{groupDias} días</span>
                )}
              </div>

              <div className="w-[170px]">
                {isEditing ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className={cn("w-full justify-start text-left font-normal", !groupFechaSalida && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {groupFechaSalida ? format(groupFechaSalida, "dd/MM/yyyy", { locale: es }) : "Fecha salida"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={groupFechaSalida}
                        onSelect={(date) => {
                          const newItems = [...editData!.items];
                          newItems.forEach((it, i) => {
                            if (it.periodoGroupId === groupId) newItems[i] = { ...newItems[i], fechaSalida: date };
                          });
                          setEditData({ ...editData!, items: newItems });
                        }}
                        locale={es}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <span>{groupFechaSalida && format(groupFechaSalida, "dd/MM/yyyy", { locale: es })}</span>
                )}
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px]">Dispositivo</TableHead>
                    <TableHead className="w-[100px]">Cantidad</TableHead>
                    <TableHead className="w-[140px]">Precio Unit.</TableHead>
                    <TableHead className="w-[120px] text-right">Subtotal</TableHead>
                    {isEditing && <TableHead className="w-[80px]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupItems.map(({ item: gi, idx: giIdx }) => (
                    <TableRow key={gi.id || giIdx}>
                      <TableCell>
                        {isEditing ? (
                          <DeviceAutocomplete devices={devices || []} value={gi.productName || ""} onChange={(value) => handleItemChange(giIdx, "productName", value)} placeholder="Seleccionar..." />
                        ) : (
                          <span className="font-medium">{gi.productName}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input type="number" min="1" value={gi.quantity ?? ""} onChange={(e) => handleItemChange(giIdx, "quantity", Number(e.target.value))} />
                        ) : gi.quantity}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input type="number" min="0" step="0.01" value={gi.unitPrice ?? ""} onChange={(e) => handleItemChange(giIdx, "unitPrice", Number(e.target.value))} />
                        ) : formatCurrency(gi.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency((gi.quantity || 0) * (gi.unitPrice || 0))}
                      </TableCell>
                      {isEditing && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button type="button" onClick={() => ungroupItem(giIdx)} variant="ghost" size="sm" className="text-slate-500 hover:text-slate-700" title="Desagrupar">
                              <Unlink className="h-4 w-4" />
                            </Button>
                            {editData!.items.length > 1 && (
                              <Button type="button" onClick={() => removeItem(giIdx)} variant="ghost" size="sm" className="text-red-500 hover:text-red-700">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      } else {
        // Individual item
        const fechaInicio = getDate(item.fechaSalida);
        const fechaFin = calcularFechaFin(fechaInicio, item.dias);

        elements.push(
          <div key={item.id || idx} className="border rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {isEditing && (
                <Checkbox
                  checked={item.selected || false}
                  onCheckedChange={() => toggleItemSelection(idx)}
                />
              )}
              <div className="w-[80px]">
                {isEditing ? (
                  <Input type="number" min="1" value={item.dias ?? ""} onChange={(e) => handleItemChange(idx, "dias", e.target.value ? Number(e.target.value) : undefined)} placeholder="Días" />
                ) : (
                  item.dias ? <span className="font-medium">{item.dias} días</span> : null
                )}
              </div>
              <div className="w-[170px]">
                {isEditing ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className={cn("w-full justify-start text-left font-normal", !fechaInicio && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {fechaInicio ? format(fechaInicio, "dd/MM/yyyy", { locale: es }) : "Fecha salida"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={fechaInicio} onSelect={(date) => handleItemChange(idx, "fechaSalida", date)} locale={es} initialFocus />
                    </PopoverContent>
                  </Popover>
                ) : (
                  fechaInicio ? <span>{format(fechaInicio, "dd/MM/yyyy", { locale: es })}</span> : null
                )}
              </div>
              {(fechaInicio || fechaFin) && (
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
              )}
              {isEditing && editData!.items.length > 1 && (
                <Button type="button" onClick={() => removeItem(idx)} variant="ghost" size="sm" className="text-red-500 hover:text-red-700 ml-auto">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px]">Dispositivo</TableHead>
                    <TableHead className="w-[100px]">Cantidad</TableHead>
                    <TableHead className="w-[140px]">Precio Unit.</TableHead>
                    <TableHead className="w-[120px] text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      {isEditing ? (
                        <DeviceAutocomplete devices={devices || []} value={item.productName || ""} onChange={(value) => handleItemChange(idx, "productName", value)} placeholder="Seleccionar..." />
                      ) : (
                        <span className="font-medium">{item.productName}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input type="number" min="1" value={item.quantity ?? ""} onChange={(e) => handleItemChange(idx, "quantity", Number(e.target.value))} />
                      ) : item.quantity}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input type="number" min="0" step="0.01" value={item.unitPrice ?? ""} onChange={(e) => handleItemChange(idx, "unitPrice", Number(e.target.value))} />
                      ) : formatCurrency(item.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency((item.quantity || 0) * (item.unitPrice || 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        );
      }
    });

    return elements;
  };

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/publimar/viaPublica/presupuestos")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {quote.number}
              <Badge
                variant="outline"
                className="text-xs cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={handleOpenVersions}
                title="Ver historial de versiones"
              >
                <History className="h-3 w-3 mr-1" />
                v{quote.version || 1}
              </Badge>
            </h1>
            <p className="text-sm text-slate-500">
              {quote.client?.name} | Creado: {quote.createdAt && format(getDate(quote.createdAt)!, "dd/MM/yyyy", { locale: es })}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
              {isAdmin && (
                <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleCancelEdit}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!hasChanges || saving} className="bg-green-600 hover:bg-green-700 text-white">
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Información General */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle>Información General</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Fecha</Label>
              {isEditing ? (
                <Input type="date" value={editData?.fecha ? format(getDate(editData.fecha)!, "yyyy-MM-dd") : ""} onChange={(e) => setEditData({ ...editData!, fecha: new Date(e.target.value) })} />
              ) : (
                <p className="text-sm py-2">{quote.fecha && format(getDate(quote.fecha)!, "dd/MM/yyyy", { locale: es })}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Cliente</Label>
              {isEditing ? (
                <Select value={editData?.client?.id || ""} onValueChange={(value) => {
                  const selectedClient = clients?.find(c => c.id === value);
                  if (selectedClient) setEditData({ ...editData!, client: selectedClient });
                }}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                  <SelectContent>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm py-2 font-medium">{quote.client?.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Badge variant={quote.status === EQuoteStatus.CONFIRMED ? "default" : "secondary"} className="mt-1">
                {quote.status === EQuoteStatus.DRAFT && "Borrador"}
                {quote.status === EQuoteStatus.SENT && "Enviado"}
                {quote.status === EQuoteStatus.CONFIRMED && "Confirmado"}
                {quote.status === EQuoteStatus.REJECTED && "Rechazado"}
              </Badge>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Label>Observaciones</Label>
            {isEditing ? (
              <Textarea value={editData?.notes || ""} onChange={(e) => setEditData({ ...editData!, notes: e.target.value })} rows={2} placeholder="Observaciones del presupuesto..." />
            ) : (
              <p className="text-sm py-2 text-slate-600">{quote.notes || "Sin observaciones"}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dispositivos */}
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>Dispositivos</CardTitle>
          {isEditing && (
            <div className="flex gap-2">
              {hasSelectedItems && (
                <Button type="button" onClick={groupSelected} variant="outline" size="sm" className="text-blue-900 border-blue-900 hover:bg-blue-50">
                  <Link2 className="h-4 w-4 mr-2" />
                  Agrupar
                </Button>
              )}
              <Button type="button" onClick={addItem} variant="outline" size="sm" className="bg-blue-900 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                Agregar
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {renderItemsSection()}
          </div>
          <div className="mt-4 text-right text-sm text-slate-600">
            Total Dispositivos: <span className="font-semibold">{formatCurrency(totals.subtotalDispositivos)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Impresiones */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-3">
            {isEditing ? (
              <>
                <Checkbox id="conImpresiones" checked={editData?.conImpresiones || false} onCheckedChange={(checked) => setEditData({ ...editData!, conImpresiones: checked === true })} />
                <label htmlFor="conImpresiones" className="text-lg font-semibold cursor-pointer">Impresiones / Afiches</label>
              </>
            ) : (
              <CardTitle>Impresiones / Afiches</CardTitle>
            )}
            {!isEditing && !displayData?.conImpresiones && <Badge variant="secondary">No incluye</Badge>}
          </div>
        </CardHeader>
        {displayData?.conImpresiones && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Costo</Label>
                {isEditing ? (
                  <Input type="number" min="0" step="0.01" value={editData?.impresiones?.costo ?? ""} onChange={(e) => setEditData({ ...editData!, impresiones: { ...editData!.impresiones!, costo: Number(e.target.value) } })} placeholder="$" />
                ) : (
                  <p className="text-sm py-2">{formatCurrency(displayData?.impresiones?.costo || 0)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Venta</Label>
                {isEditing ? (
                  <Input type="number" min="0" step="0.01" value={editData?.impresiones?.venta ?? ""} onChange={(e) => setEditData({ ...editData!, impresiones: { ...editData!.impresiones!, venta: Number(e.target.value) } })} placeholder="$" />
                ) : (
                  <p className="text-sm py-2">{formatCurrency(displayData?.impresiones?.venta || 0)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Flete</Label>
                {isEditing ? (
                  <Input type="number" min="0" step="0.01" value={editData?.impresiones?.flete ?? ""} onChange={(e) => setEditData({ ...editData!, impresiones: { ...editData!.impresiones!, flete: Number(e.target.value) } })} placeholder="$" />
                ) : (
                  <p className="text-sm py-2">{formatCurrency(displayData?.impresiones?.flete || 0)}</p>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Formas de Pago */}
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>Formas de Pago</CardTitle>
          {isEditing && (
            <Button type="button" onClick={addFormaPago} variant="outline" size="sm" className="bg-blue-900 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Agregar
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {displayData?.formasPago?.map((fp, index) => (
              <div key={index} className="flex flex-wrap items-center gap-3 p-3 border rounded-lg bg-slate-50">
                <div className="w-[160px]">
                  {isEditing ? (
                    <Select value={fp.tipo} onValueChange={(value) => handleFormaPagoChange(index, "tipo", value)}>
                      <SelectTrigger><SelectValue placeholder="Tipo..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                        <SelectItem value="canje">Canje</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="font-medium">{getTipoPagoLabel(fp.tipo)}</span>
                  )}
                </div>
                <div className="w-[120px]">
                  {isEditing ? (
                    <Input type="number" min="0" step="0.01" value={fp.monto ?? ""} onChange={(e) => handleFormaPagoChange(index, "monto", Number(e.target.value))} placeholder="Monto $" />
                  ) : (
                    <span>{formatCurrency(fp.monto)}</span>
                  )}
                </div>
                {fp.tipo === "transferencia" && (
                  <div className="w-[160px]">
                    {isEditing ? (
                      <Input value={fp.cuenta || ""} onChange={(e) => handleFormaPagoChange(index, "cuenta", e.target.value)} placeholder="Cuenta destino..." />
                    ) : (
                      <span className="text-slate-500">{fp.cuenta}</span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Checkbox id={`factura-${index}`} checked={fp.factura} onCheckedChange={(checked) => handleFormaPagoChange(index, "factura", checked === true)} />
                      <label htmlFor={`factura-${index}`} className="text-sm">Factura</label>
                      {fp.factura && (
                        <Select value={fp.tipoFactura || ""} onValueChange={(value) => handleFormaPagoChange(index, "tipoFactura", value)}>
                          <SelectTrigger className="w-[70px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A">A</SelectItem>
                            <SelectItem value="C">C</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </>
                  ) : (
                    fp.factura && <Badge variant="outline">Factura {fp.tipoFactura}</Badge>
                  )}
                </div>
                {isEditing && displayData!.formasPago.length > 1 && (
                  <Button type="button" onClick={() => removeFormaPago(index)} variant="ghost" size="sm" className="text-red-500 hover:text-red-700 ml-auto">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Resumen */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Resumen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-md">
            <div className="flex justify-between text-sm">
              <span>Dispositivos:</span>
              <span className="font-medium">{formatCurrency(totals.subtotalDispositivos)}</span>
            </div>
            {displayData?.conImpresiones && (
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

      {/* Modal de eliminación */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => { setShowDeleteDialog(open); if (!open) setDeleteConfirmText(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Presupuesto</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el presupuesto <strong>{quote.number}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <Label>Escribe ELIMINAR para confirmar:</Label>
            <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="ELIMINAR" className="mt-2" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(""); }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteConfirmText !== "ELIMINAR"}>Eliminar Presupuesto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de versiones */}
      <Dialog open={showVersionsDialog} onOpenChange={(open) => { setShowVersionsDialog(open); if (!open) setSelectedVersion(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historial de Versiones
            </DialogTitle>
            <DialogDescription>Versiones anteriores del presupuesto {quote.number}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {loadingVersions ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-slate-900"></div>
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No hay versiones anteriores</p>
                <p className="text-sm">El historial se creará cuando edites el presupuesto</p>
              </div>
            ) : selectedVersion ? (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setSelectedVersion(null)} className="mb-2">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Volver al listado
                </Button>
                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="font-semibold">Versión {selectedVersion.version}</span>
                    <span className="text-sm text-slate-500">
                      {selectedVersion.archivedAt && format(getDate(selectedVersion.archivedAt)!, "dd/MM/yyyy HH:mm", { locale: es })}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Cliente:</span>
                      <p className="font-medium">{selectedVersion.client?.name}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Total:</span>
                      <p className="font-medium text-green-600">{formatCurrency(selectedVersion.totalVenta || 0)}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-sm">Dispositivos:</span>
                    <ul className="mt-1 space-y-1">
                      {selectedVersion.items?.map((item: any, idx: number) => (
                        <li key={idx} className="text-sm flex justify-between bg-white p-2 rounded">
                          <span>{item.productName} x{item.quantity}</span>
                          <span className="font-medium">{formatCurrency((item.quantity || 0) * (item.unitPrice || 0))}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {selectedVersion.conImpresiones && selectedVersion.impresiones && (
                    <div className="bg-white p-2 rounded">
                      <span className="text-slate-500 text-sm">Impresiones:</span>
                      <div className="grid grid-cols-3 gap-2 mt-1 text-sm">
                        <div>Costo: {formatCurrency(selectedVersion.impresiones.costo || 0)}</div>
                        <div>Venta: {formatCurrency(selectedVersion.impresiones.venta || 0)}</div>
                        <div>Flete: {formatCurrency(selectedVersion.impresiones.flete || 0)}</div>
                      </div>
                    </div>
                  )}
                  {selectedVersion.notes && (
                    <div>
                      <span className="text-slate-500 text-sm">Notas:</span>
                      <p className="text-sm mt-1">{selectedVersion.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedVersion(version)}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">v{version.version}</Badge>
                      <div>
                        <p className="font-medium text-sm">
                          {version.archivedAt && format(getDate(version.archivedAt)!, "dd/MM/yyyy HH:mm", { locale: es })}
                        </p>
                        <p className="text-xs text-slate-500">
                          {version.items?.length || 0} dispositivos | Total: {formatCurrency(version.totalVenta || 0)}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVersionsDialog(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
