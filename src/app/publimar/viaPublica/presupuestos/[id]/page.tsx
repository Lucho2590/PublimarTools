'use client';

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useUser, useFirestoreCollectionData } from "reactfire";
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, Timestamp, Query, CollectionReference, orderBy, addDoc, getDocs } from "firebase/firestore";
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

// Tipos para los datos del presupuesto de vía pública
interface ViaPublicaQuote {
  id: string;
  number: string;
  client: TClient;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    description?: string;
    subtotal: number;
  }>;
  fecha: any;
  formasPago: Array<{
    tipo: string;
    monto: number;
    cuenta?: string;
    factura: boolean;
    tipoFactura?: string;
  }>;
  periodos: Array<{
    fechaInicio: any;
    dias: number;
    fechaFin: any;
    notas?: string;
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

  // Estados principales
  const [quote, setQuote] = useState<ViaPublicaQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Estados editables (copia del quote para edición)
  const [editData, setEditData] = useState<ViaPublicaQuote | null>(null);

  // Estados para historial de versiones
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

  // Cargar presupuesto
  useEffect(() => {
    const loadQuote = async () => {
      try {
        const quoteRef = doc(firestore, collections.QUOTES, quoteId);
        const quoteSnap = await getDoc(quoteRef);

        if (quoteSnap.exists()) {
          const data = quoteSnap.data() as ViaPublicaQuote;
          setQuote({ ...data, id: quoteSnap.id });
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

  // Sincronizar editData cuando entra en modo edición
  useEffect(() => {
    if (isEditing && quote) {
      setEditData(JSON.parse(JSON.stringify(quote)));
    }
  }, [isEditing, quote]);

  // Detectar cambios
  const hasChanges = useMemo(() => {
    if (!quote || !editData) return false;
    return JSON.stringify(quote) !== JSON.stringify(editData);
  }, [quote, editData]);

  // Cargar historial de versiones
  const loadVersions = async () => {
    setLoadingVersions(true);
    try {
      const versionsRef = collection(firestore, collections.QUOTES, quoteId, "versions");
      const versionsQuery = query(versionsRef, orderBy("version", "desc"));
      const snapshot = await getDocs(versionsQuery);

      const versionsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setVersions(versionsList);
    } catch (error) {
      console.error("Error cargando versiones:", error);
      toast.error("Error al cargar el historial");
    } finally {
      setLoadingVersions(false);
    }
  };

  // Abrir modal de versiones
  const handleOpenVersions = () => {
    setShowVersionsDialog(true);
    loadVersions();
  };

  // Formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  // Calcular fecha fin de período
  const calcularFechaFin = (fechaInicio: Date | undefined, dias: number | undefined): Date | null => {
    if (!fechaInicio || !dias || dias <= 0) return null;
    return addDays(fechaInicio, dias - 1);
  };

  // Calcular totales
  const calculateTotals = (data: ViaPublicaQuote | null) => {
    if (!data) return { subtotalDispositivos: 0, ventaImpresiones: 0, fleteImpresiones: 0, totalVenta: 0 };

    const subtotalDispositivos = data.items.reduce((sum, item) => {
      return sum + ((item.quantity || 0) * (item.unitPrice || 0));
    }, 0);

    const ventaImpresiones = data.conImpresiones ? (data.impresiones?.venta || 0) : 0;
    const fleteImpresiones = data.conImpresiones ? (data.impresiones?.flete || 0) : 0;
    const totalVenta = subtotalDispositivos + ventaImpresiones + fleteImpresiones;

    return { subtotalDispositivos, ventaImpresiones, fleteImpresiones, totalVenta };
  };

  // Handlers para edición de items
  const handleItemChange = (index: number, field: string, value: string | number) => {
    if (!editData) return;
    const newItems = [...editData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    // Recalcular subtotal
    newItems[index].subtotal = (newItems[index].quantity || 0) * (newItems[index].unitPrice || 0);
    setEditData({ ...editData, items: newItems });
  };

  const addItem = () => {
    if (!editData) return;
    const newItem = {
      id: `item-${Date.now()}`,
      productName: "",
      quantity: 1,
      unitPrice: 0,
      description: "",
      subtotal: 0,
    };
    setEditData({ ...editData, items: [...editData.items, newItem] });
  };

  const removeItem = (index: number) => {
    if (!editData || editData.items.length <= 1) return;
    const newItems = editData.items.filter((_, i) => i !== index);
    setEditData({ ...editData, items: newItems });
  };

  // Handlers para períodos
  const handlePeriodoChange = (index: number, field: string, value: any) => {
    if (!editData) return;
    const newPeriodos = [...editData.periodos];
    newPeriodos[index] = { ...newPeriodos[index], [field]: value };
    // Recalcular fecha fin
    if (field === "fechaInicio" || field === "dias") {
      const fechaFin = calcularFechaFin(
        field === "fechaInicio" ? value : newPeriodos[index].fechaInicio?.toDate?.() || newPeriodos[index].fechaInicio,
        field === "dias" ? value : newPeriodos[index].dias
      );
      newPeriodos[index].fechaFin = fechaFin;
    }
    setEditData({ ...editData, periodos: newPeriodos });
  };

  const addPeriodo = () => {
    if (!editData) return;
    const newPeriodo = {
      fechaInicio: undefined,
      dias: undefined as any,
      fechaFin: undefined as any,
      notas: "",
    };
    setEditData({ ...editData, periodos: [...editData.periodos, newPeriodo] });
  };

  const removePeriodo = (index: number) => {
    if (!editData || editData.periodos.length <= 1) return;
    const newPeriodos = editData.periodos.filter((_, i) => i !== index);
    setEditData({ ...editData, periodos: newPeriodos });
  };

  // Handlers para formas de pago
  const handleFormaPagoChange = (index: number, field: string, value: any) => {
    if (!editData) return;
    const newFormasPago = [...editData.formasPago];
    newFormasPago[index] = { ...newFormasPago[index], [field]: value };
    if (field === "tipo" && value !== "transferencia") {
      newFormasPago[index].cuenta = "";
    }
    if (field === "factura" && value === false) {
      newFormasPago[index].tipoFactura = "";
    }
    setEditData({ ...editData, formasPago: newFormasPago });
  };

  const addFormaPago = () => {
    if (!editData) return;
    const newFormaPago = {
      tipo: "",
      monto: 0,
      cuenta: "",
      factura: false,
      tipoFactura: "",
    };
    setEditData({ ...editData, formasPago: [...editData.formasPago, newFormaPago] });
  };

  const removeFormaPago = (index: number) => {
    if (!editData || editData.formasPago.length <= 1) return;
    const newFormasPago = editData.formasPago.filter((_, i) => i !== index);
    setEditData({ ...editData, formasPago: newFormasPago });
  };

  // Helper para convertir fecha a Timestamp de Firebase
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

      // 1. Guardar versión anterior en subcolección antes de actualizar
      const currentVersion = quote.version || 1;
      const versionSnapshot = {
        // Datos del presupuesto en el momento de la versión
        number: quote.number,
        client: {
          id: quote.client.id,
          name: quote.client.name,
          section: quote.client.section,
        },
        items: quote.items,
        fecha: toTimestamp(quote.fecha),
        formasPago: quote.formasPago,
        periodos: quote.periodos?.map(p => ({
          fechaInicio: toTimestamp(p.fechaInicio),
          dias: p.dias,
          fechaFin: toTimestamp(p.fechaFin),
          notas: p.notas || "",
        })) || [],
        conImpresiones: quote.conImpresiones,
        impresiones: quote.impresiones,
        notes: quote.notes,
        subtotalDispositivos: quote.subtotalDispositivos,
        ventaImpresiones: quote.ventaImpresiones,
        totalVenta: quote.totalVenta,
        status: quote.status,
        // Metadata de la versión
        version: currentVersion,
        archivedAt: serverTimestamp(),
        archivedBy: firebaseUser?.uid,
      };

      await addDoc(versionsCollection, versionSnapshot);

      // 2. Preparar períodos con Timestamps para la actualización
      const preparedPeriodos = editData.periodos?.map(p => ({
        fechaInicio: toTimestamp(p.fechaInicio),
        dias: p.dias,
        fechaFin: toTimestamp(p.fechaFin),
        notas: p.notas || "",
      })) || [];

      // 3. Preparar datos para guardar
      const updateData = {
        // Cliente solo con id, name, section
        client: {
          id: editData.client.id,
          name: editData.client.name,
          section: editData.client.section,
        },
        items: editData.items,
        fecha: toTimestamp(editData.fecha),
        formasPago: editData.formasPago,
        periodos: preparedPeriodos,
        conImpresiones: editData.conImpresiones,
        impresiones: editData.impresiones,
        notes: editData.notes,
        // Totales
        subtotalDispositivos: totals.subtotalDispositivos,
        ventaImpresiones: totals.ventaImpresiones,
        fleteImpresiones: totals.fleteImpresiones,
        totalVenta: totals.totalVenta,
        total: totals.totalVenta,
        // Metadata
        version: currentVersion + 1,
        updatedAt: serverTimestamp(),
        updatedBy: firebaseUser?.uid,
      };

      // 4. Actualizar documento principal
      await updateDoc(quoteRef, updateData);

      // 5. Actualizar estado local
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

  // Eliminar presupuesto
  const handleDelete = async () => {
    if (deleteConfirmText !== "ELIMINAR") {
      toast.error("Escribe ELIMINAR para confirmar");
      return;
    }

    try {
      const quoteRef = doc(firestore, collections.QUOTES, quoteId);
      await deleteDoc(quoteRef);
      toast.success("Presupuesto eliminado");
      router.push("/publimar/viaPublica/presupuestos");
    } catch (error) {
      console.error("Error eliminando:", error);
      toast.error("Error al eliminar el presupuesto");
    }
  };

  // Cancelar edición
  const handleCancelEdit = () => {
    setEditData(null);
    setIsEditing(false);
  };

  // Helper para obtener fecha de Firestore (maneja Timestamps, Dates, strings y objetos serializados)
  const getDate = (dateField: any): Date | undefined => {
    if (!dateField) return undefined;

    let date: Date;

    // Firestore Timestamp con método toDate()
    if (dateField.toDate && typeof dateField.toDate === 'function') {
      date = dateField.toDate();
    }
    // Ya es un Date
    else if (dateField instanceof Date) {
      date = dateField;
    }
    // Timestamp serializado con JSON.stringify (tiene seconds)
    else if (typeof dateField === 'object' && dateField.seconds !== undefined) {
      date = new Date(dateField.seconds * 1000);
    }
    // String ISO o timestamp number
    else if (typeof dateField === 'string' || typeof dateField === 'number') {
      date = new Date(dateField);
    }
    else {
      return undefined;
    }

    // Validar que la fecha sea válida
    return isNaN(date.getTime()) ? undefined : date;
  };

  // Renderizar tipo de forma de pago
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

  // Loading state
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

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/publimar/viaPublica/presupuestos")}
          >
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
              <Button
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
              {isAdmin && (
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleCancelEdit}
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
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
                <Input
                  type="date"
                  value={editData?.fecha ? format(getDate(editData.fecha)!, "yyyy-MM-dd") : ""}
                  onChange={(e) => setEditData({ ...editData!, fecha: new Date(e.target.value) })}
                />
              ) : (
                <p className="text-sm py-2">{quote.fecha && format(getDate(quote.fecha)!, "dd/MM/yyyy", { locale: es })}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Cliente</Label>
              {isEditing ? (
                <Select
                  value={editData?.client?.id || ""}
                  onValueChange={(value) => {
                    const selectedClient = clients?.find(c => c.id === value);
                    if (selectedClient) {
                      setEditData({ ...editData!, client: selectedClient });
                    }
                  }}
                >
                  <SelectTrigger>
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
              ) : (
                <p className="text-sm py-2 font-medium">{quote.client?.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Estado</Label>
              <Badge
                variant={quote.status === EQuoteStatus.CONFIRMED ? "default" : "secondary"}
                className="mt-1"
              >
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
              <Textarea
                value={editData?.notes || ""}
                onChange={(e) => setEditData({ ...editData!, notes: e.target.value })}
                rows={2}
                placeholder="Observaciones del presupuesto..."
              />
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
            <Button
              type="button"
              onClick={addItem}
              variant="outline"
              size="sm"
              className="bg-blue-900 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar
            </Button>
          )}
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
                  <TableHead className="w-[120px] text-right">Subtotal</TableHead>
                  {isEditing && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayData?.items.map((item, index) => (
                  <TableRow key={item.id || index}>
                    <TableCell>
                      {isEditing ? (
                        <DeviceAutocomplete
                          devices={devices || []}
                          value={item.productName || ""}
                          onChange={(value) => handleItemChange(index, "productName", value)}
                          placeholder="Seleccionar..."
                        />
                      ) : (
                        <span className="font-medium">{item.productName}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity ?? ""}
                          onChange={(e) => handleItemChange(index, "quantity", Number(e.target.value))}
                        />
                      ) : (
                        item.quantity
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice ?? ""}
                          onChange={(e) => handleItemChange(index, "unitPrice", Number(e.target.value))}
                        />
                      ) : (
                        formatCurrency(item.unitPrice)
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={item.description || ""}
                          onChange={(e) => handleItemChange(index, "description", e.target.value)}
                          placeholder="Observaciones..."
                        />
                      ) : (
                        <span className="text-slate-500">{item.description || "-"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency((item.quantity || 0) * (item.unitPrice || 0))}
                    </TableCell>
                    {isEditing && (
                      <TableCell>
                        {displayData.items.length > 1 && (
                          <Button
                            type="button"
                            onClick={() => removeItem(index)}
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
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
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>Períodos</CardTitle>
          {isEditing && (
            <Button
              type="button"
              onClick={addPeriodo}
              variant="outline"
              size="sm"
              className="bg-blue-900 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {displayData?.periodos?.map((periodo, index) => {
              const fechaInicio = getDate(periodo.fechaInicio);
              const fechaFin = periodo.dias && fechaInicio ? calcularFechaFin(fechaInicio, periodo.dias) : getDate(periodo.fechaFin);

              return (
                <div key={index} className="flex flex-wrap items-center gap-3 p-3 border rounded-lg bg-slate-50">
                  <div className="w-[80px]">
                    {isEditing ? (
                      <Input
                        type="number"
                        min="1"
                        value={periodo.dias ?? ""}
                        onChange={(e) => handlePeriodoChange(index, "dias", e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="Días"
                      />
                    ) : (
                      <span className="font-medium">{periodo.dias} días</span>
                    )}
                  </div>

                  <div className="w-[170px]">
                    {isEditing ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !fechaInicio && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {fechaInicio ? format(fechaInicio, "dd/MM/yyyy", { locale: es }) : "Fecha inicio"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={fechaInicio}
                            onSelect={(date) => handlePeriodoChange(index, "fechaInicio", date)}
                            locale={es}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span>{fechaInicio && format(fechaInicio, "dd/MM/yyyy", { locale: es })}</span>
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

                  <div className="flex-1 min-w-[150px]">
                    {isEditing ? (
                      <Input
                        value={periodo.notas || ""}
                        onChange={(e) => handlePeriodoChange(index, "notas", e.target.value)}
                        placeholder="Notas..."
                      />
                    ) : (
                      <span className="text-slate-500">{periodo.notas || "-"}</span>
                    )}
                  </div>

                  {isEditing && displayData.periodos.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => removePeriodo(index)}
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
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
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center space-x-3">
            {isEditing ? (
              <>
                <Checkbox
                  id="conImpresiones"
                  checked={editData?.conImpresiones || false}
                  onCheckedChange={(checked) => setEditData({ ...editData!, conImpresiones: checked === true })}
                />
                <label htmlFor="conImpresiones" className="text-lg font-semibold cursor-pointer">
                  Impresiones / Afiches
                </label>
              </>
            ) : (
              <CardTitle>Impresiones / Afiches</CardTitle>
            )}
            {!isEditing && !displayData?.conImpresiones && (
              <Badge variant="secondary">No incluye</Badge>
            )}
          </div>
        </CardHeader>
        {displayData?.conImpresiones && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Costo</Label>
                {isEditing ? (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editData?.impresiones?.costo ?? ""}
                    onChange={(e) => setEditData({
                      ...editData!,
                      impresiones: { ...editData!.impresiones!, costo: Number(e.target.value) }
                    })}
                    placeholder="$"
                  />
                ) : (
                  <p className="text-sm py-2">{formatCurrency(displayData?.impresiones?.costo || 0)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Venta</Label>
                {isEditing ? (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editData?.impresiones?.venta ?? ""}
                    onChange={(e) => setEditData({
                      ...editData!,
                      impresiones: { ...editData!.impresiones!, venta: Number(e.target.value) }
                    })}
                    placeholder="$"
                  />
                ) : (
                  <p className="text-sm py-2">{formatCurrency(displayData?.impresiones?.venta || 0)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Flete</Label>
                {isEditing ? (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editData?.impresiones?.flete ?? ""}
                    onChange={(e) => setEditData({
                      ...editData!,
                      impresiones: { ...editData!.impresiones!, flete: Number(e.target.value) }
                    })}
                    placeholder="$"
                  />
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
            <Button
              type="button"
              onClick={addFormaPago}
              variant="outline"
              size="sm"
              className="bg-blue-900 hover:bg-blue-700 text-white"
            >
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
                  ) : (
                    <span className="font-medium">{getTipoPagoLabel(fp.tipo)}</span>
                  )}
                </div>

                <div className="w-[120px]">
                  {isEditing ? (
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={fp.monto ?? ""}
                      onChange={(e) => handleFormaPagoChange(index, "monto", Number(e.target.value))}
                      placeholder="Monto $"
                    />
                  ) : (
                    <span>{formatCurrency(fp.monto)}</span>
                  )}
                </div>

                {fp.tipo === "transferencia" && (
                  <div className="w-[160px]">
                    {isEditing ? (
                      <Input
                        value={fp.cuenta || ""}
                        onChange={(e) => handleFormaPagoChange(index, "cuenta", e.target.value)}
                        placeholder="Cuenta destino..."
                      />
                    ) : (
                      <span className="text-slate-500">{fp.cuenta}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Checkbox
                        id={`factura-${index}`}
                        checked={fp.factura}
                        onCheckedChange={(checked) => handleFormaPagoChange(index, "factura", checked === true)}
                      />
                      <label htmlFor={`factura-${index}`} className="text-sm">Factura</label>
                      {fp.factura && (
                        <Select
                          value={fp.tipoFactura || ""}
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
                    </>
                  ) : (
                    fp.factura && (
                      <Badge variant="outline">Factura {fp.tipoFactura}</Badge>
                    )
                  )}
                </div>

                {isEditing && displayData.formasPago.length > 1 && (
                  <Button
                    type="button"
                    onClick={() => removeFormaPago(index)}
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 ml-auto"
                  >
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

      {/* Modal de confirmación de eliminación */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open);
        if (!open) setDeleteConfirmText("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Presupuesto</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el presupuesto{" "}
              <strong>{quote.number}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <Label>Escribe ELIMINAR para confirmar:</Label>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="ELIMINAR"
              className="mt-2"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setShowDeleteDialog(false);
              setDeleteConfirmText("");
            }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteConfirmText !== "ELIMINAR"}
            >
              Eliminar Presupuesto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de historial de versiones */}
      <Dialog open={showVersionsDialog} onOpenChange={(open) => {
        setShowVersionsDialog(open);
        if (!open) setSelectedVersion(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historial de Versiones
            </DialogTitle>
            <DialogDescription>
              Versiones anteriores del presupuesto {quote.number}
            </DialogDescription>
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
              // Vista de detalle de una versión
              <div className="space-y-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedVersion(null)}
                  className="mb-2"
                >
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
              // Lista de versiones
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
                          {version.items?.length || 0} dispositivos • Total: {formatCurrency(version.totalVenta || 0)}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVersionsDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
