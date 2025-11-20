'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "reactfire";
import { useOrders, useOrderById } from "@/hooks/useOrders";
import { useClients } from "@/hooks/useClients";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  FileText,
  ChevronDown,
  Edit,
} from "lucide-react";
import { formatearPrecio, formatDate, formatDateString, extractIdFromSlug } from "@/lib/utils";
import { toast } from "sonner";
import { EOrderStatus, TPaymentHistory, TFactura } from "@/types/order";
import { EPaymentMethod } from "@/types/sale";
import { doc, updateDoc } from "firebase/firestore";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection } from "firebase/firestore";
import collections from "@/lib/collections";
import { TProduct, TProductVariant } from "@/types/product";
import { TClient } from "@/types/client";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrderDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { data: user } = useUser();
  const firestore = useFirestore();

  // Extraer el ID real del slug
  const orderId = extractIdFromSlug(params.id);

  // Hooks
  const { updateOrder, changeOrderStatus, deleteOrder } = useOrders();
  const {
    orden: order,
    loading: orderLoading,
    error: orderError,
  } = useOrderById(orderId);
  const { clients, loading: clientsLoading, updateClient } = useClients();

  // Productos
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { data: products } = useFirestoreCollectionData(productsCollection, {
    idField: "id",
  });

  // Estados de edición - SIEMPRE editable
  const [editedOrder, setEditedOrder] = useState(order);
  const [saving, setSaving] = useState(false);

  // Estados para pagos (seña y parciales)
  const [pagoParcial, setPagoParcial] = useState("");
  const [metodoPago, setMetodoPago] = useState<EPaymentMethod>(
    EPaymentMethod.CASH
  );
  const [banco, setBanco] = useState<string>("");
  const [loadingPago, setLoadingPago] = useState(false);

  // Estados para item manual
  const [showManualItemDialog, setShowManualItemDialog] = useState(false);
  const [manualItem, setManualItem] = useState({
    productName: "",
    description: "",
    variantName: "",
    quantity: 1,
    unitPrice: 0,
    discount: 0,
    notes: "",
  });

  // Estados para agregar productos
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<TProduct | null>(null);
  const [selectedVariant, setSelectedVariant] =
    useState<TProductVariant | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemDiscount, setItemDiscount] = useState(0);

  // Estado para colapso de contacto
  const [showContactDetails, setShowContactDetails] = useState(false);

  // Estados para múltiples facturas
  const [facturas, setFacturas] = useState<TFactura[]>([]);
  const [showAddFactura, setShowAddFactura] = useState(false);
  const [editingFacturaId, setEditingFacturaId] = useState<string | null>(null);

  // Estados para el formulario de nueva factura
  const [newFacturaTipo, setNewFacturaTipo] = useState("");
  const [newFacturaNumero, setNewFacturaNumero] = useState("");
  const [newFacturaFecha, setNewFacturaFecha] = useState("");
  const [newFacturaMonto, setNewFacturaMonto] = useState("");

  // ============================================
  // FUNCIONES HELPER PARA PAGOS (Solución Híbrida)
  // ============================================
  
  /**
   * Obtiene todos los pagos consolidados (downPayment legacy + paymentHistory)
   * para mostrar en la UI de forma unificada
   */
  const getConsolidatedPayments = (order: any): TPaymentHistory[] => {
    const payments: TPaymentHistory[] = [];
    
    // Si existe downPayment legacy, agregarlo como primer pago
    if (order?.downPayment && order.downPayment > 0) {
      payments.push({
        amount: order.downPayment,
        date: order.createdAt || new Date(),
        type: "seña",
        method: order.paymentMethod || EPaymentMethod.CASH,
        notes: "Seña/Anticipo ",
      });
    }
    
    // Agregar todos los pagos del paymentHistory
    if (order?.paymentHistory && order.paymentHistory.length > 0) {
      payments.push(...order.paymentHistory);
    }
    
    return payments;
  };

  /**
   * Calcula el total pagado considerando ambas fuentes
   */
  const getTotalPaid = (order: any): number => {
    const downPaymentAmount = order?.downPayment || 0;
    const historyAmount = order?.paymentHistory?.reduce(
      (sum: number, payment: any) => sum + Number(payment.amount),
      0
    ) || 0;
    
    return Number(downPaymentAmount) + Number(historyAmount);
  };

  /**
   * Calcula el saldo restante
   */
  const getRemainingBalance = (order: any, total: number): number => {
    return total - getTotalPaid(order);
  };

  /**
   * Verifica si la orden ya tiene una seña registrada
   */
  const hasDownPaymentRegistered = (order: any): boolean => {
    // Verificar si existe downPayment legacy
    if (order?.downPayment && order.downPayment > 0) {
      return true;
    }
    
    // Verificar si existe una seña en paymentHistory
    if (order?.paymentHistory && order.paymentHistory.length > 0) {
      return order.paymentHistory.some((payment: TPaymentHistory) => payment.type === "seña");
    }
    
    return false;
  };

  // Funciones para manejar facturas
  const handleAddFactura = () => {
    if (!newFacturaTipo || !newFacturaNumero || !newFacturaFecha) {
      toast.error("Todos los campos de la factura son requeridos");
      return;
    }

    const nuevaFactura: any = {
      id: `factura-${Date.now()}`,
      tipo: newFacturaTipo,
      numero: newFacturaNumero,
      fecha: newFacturaFecha,
    };
    
    if (newFacturaMonto) {
      nuevaFactura.monto = parseFloat(newFacturaMonto);
    }

    const nuevasFacturas = [...facturas, nuevaFactura];
    setFacturas(nuevasFacturas);

    // Limpiar formulario
    setNewFacturaTipo("");
    setNewFacturaNumero("");
    setNewFacturaFecha("");
    setNewFacturaMonto("");
    setShowAddFactura(false);

    // Guardar inmediatamente con las nuevas facturas
    handleSave(nuevasFacturas);

    toast.success("Factura agregada correctamente");
  };

  const handleEditFactura = (id: string) => {
    const factura = facturas.find((f) => f.id === id);
    if (factura) {
      setNewFacturaTipo(factura.tipo);
      setNewFacturaNumero(factura.numero);
      setNewFacturaFecha(factura.fecha);
      setNewFacturaMonto(factura.monto?.toString() || "");
      setEditingFacturaId(id);
      setShowAddFactura(true);
    }
  };

  const handleUpdateFactura = () => {
    if (!newFacturaTipo || !newFacturaNumero || !newFacturaFecha) {
      toast.error("Todos los campos de la factura son requeridos");
      return;
    }

    const facturasActualizadas = facturas.map((factura) =>
      factura.id === editingFacturaId
        ? {
            ...factura,
            tipo: newFacturaTipo,
            numero: newFacturaNumero,
            fecha: newFacturaFecha,
            ...(newFacturaMonto && { monto: parseFloat(newFacturaMonto) }),
          }
        : factura
    );

    setFacturas(facturasActualizadas);

    // Limpiar formulario
    setNewFacturaTipo("");
    setNewFacturaNumero("");
    setNewFacturaFecha("");
    setNewFacturaMonto("");
    setShowAddFactura(false);
    setEditingFacturaId(null);

    // Guardar inmediatamente con las facturas actualizadas
    handleSave(facturasActualizadas);

    toast.success("Factura actualizada correctamente");
  };

  const handleRemoveFactura = (id: string) => {
    const facturasRestantes = facturas.filter((f) => f.id !== id);
    setFacturas(facturasRestantes);

    // Guardar inmediatamente con las facturas restantes
    handleSave(facturasRestantes);

    toast.success("Factura eliminada correctamente");
  };

  const handleCancelFactura = () => {
    setNewFacturaTipo("");
    setNewFacturaNumero("");
    setNewFacturaFecha("");
    setNewFacturaMonto("");
    setShowAddFactura(false);
    setEditingFacturaId(null);
  };

  // Actualizar editedOrder cuando cambie order
  useEffect(() => {
    if (order && !saving) {
      setEditedOrder(order);
      // Cargar facturas existentes
      if (order.facturas && order.facturas.length > 0) {
        setFacturas(order.facturas);
      } else {
        // Migrar datos de factura antigua si existen
        if (order.invoiceNumber || order.invoiceDate) {
          const facturaLegacy: TFactura = {
            id: `factura-legacy-${Date.now()}`,
            tipo: (order as any).invoiceType || "Factura B",
            numero: order.invoiceNumber as string || "",
            fecha: (() => {
              try {
                if (!order.invoiceDate) return "";
                const dateValue: any = order.invoiceDate;
                const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
                return isNaN(date.getTime()) ? "" : date.toISOString().split("T")[0];
              } catch {
                return "";
              }
            })(),
          };
          setFacturas([facturaLegacy]);
        } else {
          setFacturas([]);
        }
      }
    }
  }, [order, saving]);

  // Obtener cliente completo
  const selectedClient = clients?.find((c) => c.id === order?.clientId);

  // Cálculos
  const subtotal =
    editedOrder?.items?.reduce(
      (sum: number, item: any) => sum + (item.subtotal || 0),
      0
    ) || 0;

  // Desglose de IVA: si está marcado, el subtotal incluye IVA y hay que desglosarlo
  const total =
    subtotal -
    // (editedOrder?.discountAmount || 0) -
    (editedOrder?.manualDiscount || 0) -
    ((editedOrder?.discountPercentage || 0) * subtotal) / 100;
  const baseImponible = editedOrder?.applyIVA ? total - total * 0.21 : total;
  const taxAmount = editedOrder?.applyIVA ? total * 0.21 : 0;

  // Productos filtrados para búsqueda
  const filteredProducts =
    products?.filter((product: any) => {
      if (!productSearchTerm) return true;
      return (
        product.name?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
        product.description
          ?.toLowerCase()
          .includes(productSearchTerm.toLowerCase())
      );
    }) || [];

  if (orderLoading) {
    return (
      <div className="container mx-auto py-6 max-w-7xl">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div>
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna 1: Cliente & Info General Skeleton */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-24 w-full" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Columna 2: Items Skeleton */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <Skeleton className="h-6 w-40" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-32" />
                  <Skeleton className="h-9 w-32" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 border rounded">
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Resumen Skeleton */}
            <Card className="mt-4">
              <CardHeader>
                <Skeleton className="h-6 w-40" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (orderError || !order) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-red-600">Error al cargar la orden </div>
        </div>
      </div>
    );
  }

  const handleDeleteOrder = async () => {
    if (!order) return;
    
    const confirmDelete = window.confirm("¿Está seguro que desea eliminar esta orden? Esta acción no se puede deshacer.");
    if (!confirmDelete) return;
    
    try {
      await deleteOrder(orderId);
      toast.success("Orden eliminada correctamente");
      // Cerrar la pestaña actual del navegador
      window.close();
    } catch (error) {
      toast.error("Error al eliminar la orden");
    }
  };

  const handleUpdateClientData = async (
    updatedClientData: Partial<TClient>
  ) => {
    if (!selectedClient?.id) return;

    try {
      await updateClient(selectedClient.id, updatedClientData);
      // Opcional: mostrar toast de confirmación
      // toast.success("Datos del cliente actualizados");
    } catch (error) {
      console.error("Error al actualizar cliente:", error);
      toast.error("Error al actualizar los datos del cliente");
    }
  };


  const handleSave = async (facturasOverride?: TFactura[]) => {
    if (!editedOrder || !user) return;

    setSaving(true);
    try {
      // Recalcular totales
      const newSubtotal =
        editedOrder.items?.reduce(
          (sum: number, item: any) => sum + (item.subtotal || 0),
          0
        ) || 0;
      const newBaseImponible = editedOrder.applyIVA
        ? newSubtotal / 1.21
        : newSubtotal;
      const newTaxAmount = editedOrder.applyIVA ? newBaseImponible * 0.21 : 0;
      const newTotal = total;
      const newBalance =
        total -
        (editedOrder?.downPayment || 0) -
        (order?.paymentHistory?.reduce(
          (sum: number, payment: any) => sum + payment.amount,
          0
        ) || 0);
      const newDiscountAmount =(editedOrder?.manualDiscount || 0) +
      ((editedOrder?.discountPercentage || 0) *
        subtotal) /
        100
      
       

      const { createdAt, updatedAt, ...rest } = editedOrder;
      // Preparar datos de actualización
      const updateData: any = {
        ...rest,
        subtotal: newSubtotal,
        taxAmount: newTaxAmount,
        total: newTotal,
        balance: newBalance,
        discountAmount: newDiscountAmount,
        estimatedDeliveryDate: editedOrder.estimatedDeliveryDate ? new Date(editedOrder.estimatedDeliveryDate).getTime() : undefined,
      };

      // Usar facturas del parámetro o del estado
      const facturasToSave = facturasOverride || facturas;

      // Agregar campos de facturación
      if (facturasToSave.length > 0) {
        updateData.facturas = facturasToSave;
        updateData.isInvoiced = true;
        updateData.invoiceNumber = facturasToSave[0].numero; // Mantener compatibilidad
        updateData.invoiceDate = facturasToSave[0].fecha
          ? new Date(facturasToSave[0].fecha + "T00:00:00")
          : undefined;
        updateData.invoiceType = facturasToSave[0].tipo;
      } else {
        updateData.facturas = [];  // Array vacío en vez de undefined
        updateData.isInvoiced = false;
        updateData.invoiceNumber = null;
        updateData.invoiceDate = null;
        updateData.invoiceType = null;
      }

      // Función para limpiar valores undefined recursivamente con protección contra referencias circulares
      const cleanData = (obj: any, seen = new WeakSet()): any => {
        if (obj === null || obj === undefined) return null;
        if (typeof obj !== "object") return obj;

        // Filtrar funciones y objetos internos de Firebase
        if (typeof obj === "function") return undefined;

        // Protección contra referencias circulares
        if (seen.has(obj)) return {};
        seen.add(obj);

        if (Array.isArray(obj)) {
          return obj
            .map((item) => cleanData(item, seen))
            .filter((item) => item !== undefined);
        }

        const cleaned: any = {};
        for (const [key, value] of Object.entries(obj)) {
          // Filtrar campos internos de Firebase/ReactFire
          if (
            key.startsWith("_") ||
            key === "firestore" ||
            key === "auth" ||
            key === "converter" ||
            typeof value === "function"
          ) {
            continue;
          }

          if (value !== undefined) {
            const cleanedValue = cleanData(value, seen);
            if (cleanedValue !== undefined) {
              cleaned[key] = cleanedValue;
            }
          }
        }
        return cleaned;
      };

      // Filtrar valores undefined recursivamente
      const cleanUpdateData = cleanData(updateData);

      await updateOrder(orderId, cleanUpdateData);

      toast.success("Orden actualizada exitosamente");
    } catch (error) {
      toast.error("Error al actualizar la orden");
      console.error("Error completo:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setEditedOrder((prev) => ({
      ...prev!,
      items: prev?.items?.filter((item) => item.id !== itemId) || [],
    }));
    // Aca tengo que actualizar el balance
  };

  // Manejar pagos (seña o parcial - ambos van a paymentHistory)
  const handlePagoParcial = async (tipoPago: 'seña' | 'parcial' = 'parcial') => {
    if (!order || !pagoParcial || isNaN(Number(pagoParcial))) return;

    const montoPago = Number(pagoParcial);
    
    // Usar función helper para calcular saldo actual (considera downPayment legacy + paymentHistory)
    const saldoActual = getRemainingBalance(order, total);

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
      
      // Preparar notas del pago
      let paymentNotes = tipoPago === "seña" ? "Seña/Anticipo" : "Pago parcial";
      if (metodoPago === EPaymentMethod.TRANSFER) {
        paymentNotes = `${paymentNotes} - Transferencia - ${banco}`;
      } else if (metodoPago === EPaymentMethod.MERCADOPAGO) {
        paymentNotes = `${paymentNotes} - Mercado Pago`;
      }
      
      const nuevoPago: TPaymentHistory = {
        amount: montoPago,
        date: new Date(),
        type: tipoPago,
        method: metodoPago,
        notes: paymentNotes,
      };

      const historialActual = order.paymentHistory || [];

      await updateDoc(doc(firestore, collections.ORDERS, order.id), {
        balance: nuevoSaldo,
        updatedAt: new Date(),
        paymentHistory: [...historialActual, nuevoPago],
      });

      toast.success(
        tipoPago === "seña" 
          ? "Seña registrada correctamente" 
          : "Pago registrado correctamente"
      );
      setPagoParcial("");
      setBanco("");
      setMetodoPago(EPaymentMethod.CASH);
    } catch (error) {
      console.error("Error al registrar pago:", error);
      toast.error("Error al registrar el pago");
    } finally {
      setLoadingPago(false);
    }
  };


  const BANCOS = ["Galicia", "Frances"];

  // Manejar item manual
  const handleAddManualItem = () => {
    if (!manualItem.productName || !manualItem.unitPrice) {
      toast.error("Nombre y precio son requeridos");
      return;
    }

    const itemSubtotal =
      manualItem.unitPrice *
      manualItem.quantity *
      (1 - manualItem.discount / 100);

    const newItem = {
      id: `${Date.now()}-${Math.random()}`,
      productId: undefined,
      variantId: undefined,
      productName: manualItem.productName,
      description: manualItem.description,
      variantName: manualItem.variantName,
      categories: [],
      quantity: manualItem.quantity,
      unitPrice: manualItem.unitPrice,
      discount: manualItem.discount,
      subtotal: itemSubtotal,
      tax: 0,
      taxAmount: 0,
      notes: manualItem.notes,
      isManual: true,
    };

    setEditedOrder((prev) => ({
      ...prev!,
      items: [...(prev?.items || []), newItem],
    }));

    // Reset
    setManualItem({
      productName: "",
      description: "",
      variantName: "",
      quantity: 1,
      unitPrice: 0,
      discount: 0,
      notes: "",
    });
    setShowManualItemDialog(false);
    toast.success("Item manual agregado");
  };

  // Manejar agregar producto del catálogo
  const handleAddProduct = () => {
    if (!selectedProduct) return;

    const price = Number(selectedVariant?.price || selectedProduct.price || 0);
    const itemSubtotal = price * itemQuantity * (1 - itemDiscount / 100);

    const newItem = {
      id: `${Date.now()}-${Math.random()}`,
      productId: selectedProduct.id,
      variantId: selectedVariant?.id,
      productName: selectedProduct.name || "",
      description: selectedProduct.description || "",
      variantName: selectedVariant?.size || "",
      categories: selectedProduct.categories || ([] as any),
      quantity: itemQuantity,
      unitPrice: price,
      discount: itemDiscount,
      subtotal: itemSubtotal,
      tax: 0,
      taxAmount: 0,
      notes: "",
      isManual: false,
    };

    setEditedOrder((prev) => ({
      ...prev!,
      items: [...(prev?.items || []), newItem as any],
    }));

    // Reset
    setSelectedProduct(null);
    setSelectedVariant(null);
    setItemQuantity(1);
    setItemDiscount(0);
    setProductSearchTerm("");
    setShowAddItemDialog(false);
    toast.success("Producto agregado");
  };

  const clearModalStates = () => {
    setSelectedProduct(null);
    setSelectedVariant(null);
    setItemQuantity(1);
    setItemDiscount(0);
    setProductSearchTerm("");
    setShowAddItemDialog(false);
  };

  return (
    <div className="container mx-auto py-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {/* <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button> */}
          <div>
            <h1 className="text-2xl font-bold">Orden {order.number}</h1>
            <p className="text-muted-foreground">
              Creada el {order.createdAt ? formatDate(order.createdAt) : "N/A"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => handleSave()}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Guardando..." : "Guardar"}
          </Button>
          <Button
            onClick={handleDeleteOrder}
            disabled={saving}
            className="bg-red-600 hover:bg-red-700"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {saving ? "Guardando..." : "Eliminar"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna 1: Cliente & Información General */}
        <div className="space-y-4">
          {/* Cliente - Movido arriba */}
          <Card>
            <CardHeader>
              <CardTitle>Información del Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nombre del Cliente</Label>
                <Input
                  value={
                    editedOrder?.clientName ||
                    editedOrder?.tempClientData?.name ||
                    order?.client?.name ||
                    ""
                  }
                  onChange={async (e) => {
                    const newValue = e.target.value;
                    // Actualizar orden local
                    setEditedOrder((prev: any) => ({
                      ...prev!,
                      clientName: newValue,
                    }));
                    // Actualizar cliente en BD
                    await handleUpdateClientData({ name: newValue });
                  }}
                  placeholder="Nombre del cliente"
                />
              </div>

              <div>
                <Label>Contacto</Label>
                <Input
                  value={
                    editedOrder?.contact?.name ||
                    editedOrder?.tempClientData?.contacts?.[0]?.name ||
                    order?.client?.contacts?.[0]?.name ||
                    ""
                  }
                  onChange={async (e) => {
                    const newValue = e.target.value;
                    // Actualizar orden local
                    setEditedOrder((prev: any) => ({
                      ...prev!,
                      contact: { ...prev?.contact, name: newValue },
                    }));
                    // Actualizar cliente en BD
                    if (selectedClient?.contacts?.[0]) {
                      const updatedContacts = [
                        ...(selectedClient.contacts || []),
                      ];
                      updatedContacts[0] = {
                        ...updatedContacts[0],
                        name: newValue,
                      };
                      await handleUpdateClientData({
                        contacts: updatedContacts,
                      });
                    }
                  }}
                  placeholder="Persona de contacto"
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={
                    editedOrder?.telefono ||
                    editedOrder?.contact?.phone ||
                    selectedClient?.phone ||
                    order?.client?.phone ||
                    editedOrder?.tempClientData?.phone ||
                    ""
                  }
                  onChange={async (e) => {
                    const newValue = e.target.value;
                    // Actualizar orden local
                    setEditedOrder((prev: any) => ({
                      ...prev!,
                      telefono: newValue,
                    }));
                    // Actualizar cliente en BD
                    await handleUpdateClientData({ phone: newValue });
                  }}
                  placeholder="Teléfono"
                />
              </div>

              <div>
                <Label>CUIT/CUIL</Label>
                <Input
                  value={
                    editedOrder?.cuit ||
                    selectedClient?.cuit ||
                    order?.client?.cuit ||
                    ""
                  }
                  onChange={async (e) => {
                    const newValue = e.target.value;
                    // Actualizar orden local
                    setEditedOrder((prev: any) => ({
                      ...prev!,
                      cuit: newValue,
                    }));
                    // Actualizar cliente en BD
                    await handleUpdateClientData({ cuit: newValue });
                  }}
                  placeholder="20-12345678-9"
                />
              </div>

              <div>
                <Label>Referencia</Label>
                <Input
                  value={
                    editedOrder?.reference ||
                    selectedClient?.reference ||
                    order?.client?.reference ||
                    ""
                  }
                  onChange={async (e) => {
                    const newValue = e.target.value;
                    // Actualizar orden local
                    setEditedOrder((prev: any) => ({
                      ...prev!,
                      reference: newValue,
                    }));
                    // Actualizar cliente en BD
                    await handleUpdateClientData({ reference: newValue });
                  }}
                  placeholder="Referencia del cliente"
                />
              </div>

              {/* Datos del Contacto - Colapsable */}
              <div className="border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowContactDetails(!showContactDetails)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <h4 className="font-medium">Datos del Contacto</h4>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      showContactDetails ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {showContactDetails && (
                  <div className="space-y-3 mt-3">
                    <div>
                      <Label>Email del Contacto</Label>
                      <Input
                        type="email"
                        value={
                          editedOrder?.contact?.email ||
                          order?.client?.contacts?.[0]?.email ||
                          editedOrder?.contact?.name ||
                          editedOrder?.contact?.position ||
                          editedOrder?.contact?.email ||
                          editedOrder?.contact?.phone ||
                          ""
                        }
                        onChange={async (e) => {
                          const newValue = e.target.value;
                          // Actualizar orden local
                          setEditedOrder((prev: any) => ({
                            ...prev!,
                            contact: {
                              ...prev?.contact,
                              email: newValue,
                            },
                          }));
                          // Actualizar cliente en BD
                          if (selectedClient?.contacts?.[0]) {
                            const updatedContacts = [
                              ...(selectedClient.contacts || []),
                            ];
                            updatedContacts[0] = {
                              ...updatedContacts[0],
                              email: newValue,
                            };
                            await handleUpdateClientData({
                              contacts: updatedContacts,
                            });
                          }
                        }}
                        placeholder="contacto@empresa.com"
                      />
                    </div>

                    <div>
                      <Label>Teléfono del Contacto</Label>
                      <Input
                        value={
                          editedOrder?.contact?.phone ||
                          order?.client?.contacts?.[0]?.phone ||
                          ""
                        }
                        onChange={async (e) => {
                          const newValue = e.target.value;
                          // Actualizar orden local
                          setEditedOrder((prev: any) => ({
                            ...prev!,
                            contact: {
                              ...prev?.contact,
                              phone: newValue,
                            },
                          }));
                          // Actualizar cliente en BD
                          if (selectedClient?.contacts?.[0]) {
                            const updatedContacts = [
                              ...(selectedClient.contacts || []),
                            ];
                            updatedContacts[0] = {
                              ...updatedContacts[0],
                              phone: newValue,
                            };
                            await handleUpdateClientData({
                              contacts: updatedContacts,
                            });
                          }
                        }}
                        placeholder="Teléfono del contacto"
                      />
                    </div>

                    <div>
                      <Label>Posición/Cargo</Label>
                      <Input
                        value={
                          editedOrder?.contact?.position ||
                          order?.client?.contacts?.[0]?.position ||
                          ""
                        }
                        onChange={async (e) => {
                          const newValue = e.target.value;
                          // Actualizar orden local
                          setEditedOrder((prev: any) => ({
                            ...prev!,
                            contact: {
                              ...prev?.contact,
                              position: newValue,
                            },
                          }));
                          // Actualizar cliente en BD
                          if (selectedClient?.contacts?.[0]) {
                            const updatedContacts = [
                              ...(selectedClient.contacts || []),
                            ];
                            updatedContacts[0] = {
                              ...updatedContacts[0],
                              position: newValue,
                            };
                            await handleUpdateClientData({
                              contacts: updatedContacts,
                            });
                          }
                        }}
                        placeholder="Gerente, Asistente, etc."
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Información General */}
          <Card>
            <CardHeader>
              <CardTitle>Información General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Estado</Label>
                <Select
                  value={editedOrder?.status}
                  onValueChange={(value) =>
                    setEditedOrder((prev: any) => ({
                      ...prev!,
                      status: value as EOrderStatus,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EOrderStatus.DRAFT}>Borrador</SelectItem>
                    <SelectItem value={EOrderStatus.IN_PROCESS}>
                      En Proceso
                    </SelectItem>
                    <SelectItem value={EOrderStatus.COMPLETED}>
                      Completada
                    </SelectItem>
                    <SelectItem value={EOrderStatus.CANCELLED}>
                      Cancelada
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Fecha de Entrega</Label>
                <Input
                  type="date"
                  value={
                    editedOrder?.estimatedDeliveryDate
                      ? new Date(editedOrder.estimatedDeliveryDate)
                          .toISOString()
                          .split("T")[0]
                      : " "
                  }
                  onChange={(e) =>
                    setEditedOrder((prev: any) => ({
                      ...prev!,
                      estimatedDeliveryDate: e.target.value
                        ? new Date(e.target.value)
                        : undefined,
                    }))
                  }
                />
              </div>

              <div>
                <Label>Notas</Label>
                <Textarea
                  value={editedOrder?.notes || ""}
                  onChange={(e) =>
                    setEditedOrder((prev: any) => ({
                      ...prev!,
                      notes: e.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Agregar notas..."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Columna 2: Items */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Items de la Orden</CardTitle>
              <div className="flex gap-2">
                <Dialog
                  open={showAddItemDialog}
                  onOpenChange={setShowAddItemDialog}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar Item
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Agregar Producto a la Orden</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      {!selectedProduct ? (
                        <div className="space-y-4">
                          <div>
                            <Label>Buscar Producto</Label>
                            <Input
                              placeholder="Buscar por nombre o descripción..."
                              value={productSearchTerm}
                              onChange={(e) =>
                                setProductSearchTerm(e.target.value)
                              }
                            />
                          </div>

                          <div className="max-h-64 overflow-y-auto border rounded">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Producto</TableHead>
                                  <TableHead>Descripción</TableHead>
                                  {/* <TableHead>Precio</TableHead> */}
                                  <TableHead>Acción</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredProducts.map((product: any) => (
                                  <TableRow key={product.id}>
                                    <TableCell className="font-medium">
                                      {product.name}
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-600">
                                      {product.description}
                                    </TableCell>
                                    {/* <TableCell>
                                      {formatearPrecio(
                                        Number(product.price || 0)
                                      )}
                                    </TableCell> */}
                                    <TableCell>
                                      <Button
                                        size="sm"
                                        onClick={() =>
                                          setSelectedProduct(product)
                                        }
                                        className="bg-blue-600 hover:bg-blue-700"
                                      >
                                        Seleccionar
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="p-4 border rounded bg-gray-50">
                            <h3 className="font-medium">
                              {selectedProduct.name}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {selectedProduct.description}
                            </p>
                            {/* <p className="text-sm font-medium">
                              {formatearPrecio(
                                Number(selectedProduct.price || 0)
                              )}
                            </p> */}
                          </div>

                          {selectedProduct.variants &&
                            selectedProduct.variants.length > 0 && (
                              <div>
                                <Label>Seleccionar Variante</Label>
                                <div className="grid grid-cols-3 gap-2 mt-2">
                                  {selectedProduct.variants.map((variant) => (
                                    <Button
                                      key={variant.id}
                                      variant={
                                        selectedVariant?.id === variant.id
                                          ? "default"
                                          : "outline"
                                      }
                                      size="sm"
                                      onClick={() =>
                                        setSelectedVariant(variant)
                                      }
                                      className={
                                        selectedVariant?.id === variant.id
                                          ? "bg-blue-600 hover:bg-blue-700"
                                          : ""
                                      }
                                    >
                                      {variant.size}
                                      <br />
                                      <span className="text-xs">
                                        {formatearPrecio(
                                          Number(variant.price || 0)
                                        )}
                                      </span>
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            )}

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Cantidad</Label>
                              <Input
                                type="number"
                                min="1"
                                value={itemQuantity}
                                onChange={(e) =>
                                  setItemQuantity(parseInt(e.target.value) || 1)
                                }
                              />
                            </div>
                            <div>
                              <Label>Descuento (%)</Label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                placeholder="0"
                                value={itemDiscount}
                                onChange={(e) =>
                                  setItemDiscount(
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                              />
                            </div>
                          </div>

                          {/* Preview del subtotal */}
                          <div className="bg-blue-50 p-3 rounded">
                            <div className="text-sm">
                              <div>Producto: {selectedProduct.name}</div>
                              {selectedVariant && (
                                <div>Variante: {selectedVariant.size}</div>
                              )}
                              <div>Cantidad: {itemQuantity}</div>
                              <div>
                                Precio unitario:{" "}
                                {formatearPrecio(
                                  Number(
                                    selectedVariant?.price ||
                                      selectedProduct.price ||
                                      0
                                  )
                                )}
                              </div>
                              {itemDiscount > 0 && (
                                <div>Descuento: {itemDiscount}%</div>
                              )}
                              <div className="font-bold">
                                Subtotal:{" "}
                                {formatearPrecio(
                                  Number(
                                    selectedVariant?.price ||
                                      selectedProduct.price ||
                                      0
                                  ) *
                                    itemQuantity *
                                    (1 - itemDiscount / 100)
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={clearModalStates}>
                        Cancelar
                      </Button>
                      {selectedProduct && (
                        <Button
                          onClick={handleAddProduct}
                          disabled={
                            !selectedProduct ||
                            (selectedProduct.variants &&
                              selectedProduct.variants.length > 0 &&
                              !selectedVariant)
                          }
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Agregar a la orden
                        </Button>
                      )}
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={showManualItemDialog}
                  onOpenChange={setShowManualItemDialog}
                >
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-gray-600 hover:bg-gray-700 text-white"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Item Manual
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Agregar Item Manual</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Nombre del Producto *</Label>
                        <Input
                          value={manualItem.productName}
                          onChange={(e) =>
                            setManualItem((prev) => ({
                              ...prev,
                              productName: e.target.value,
                            }))
                          }
                          placeholder="Nombre del producto o servicio"
                        />
                      </div>
                      <div>
                        <Label>Descripción</Label>
                        <Textarea
                          value={manualItem.description}
                          onChange={(e) =>
                            setManualItem((prev) => ({
                              ...prev,
                              description: e.target.value,
                            }))
                          }
                          placeholder="Descripción detallada"
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label>Variante/Tamaño</Label>
                        <Input
                          value={manualItem.variantName}
                          onChange={(e) =>
                            setManualItem((prev) => ({
                              ...prev,
                              variantName: e.target.value,
                            }))
                          }
                          placeholder="Ej: Talle L, 2x1m, etc."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Cantidad *</Label>
                          <Input
                            type="number"
                            min="1"
                            value={manualItem.quantity}
                            onChange={(e) =>
                              setManualItem((prev) => ({
                                ...prev,
                                quantity: parseInt(e.target.value) || 1,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label>Precio Unitario *</Label>
                          <Input
                            type="number"
                            min="0"
                            step="10.00"
                            placeholder="0.00"
                            value={manualItem.unitPrice}
                            onChange={(e) =>
                              setManualItem((prev) => ({
                                ...prev,
                                unitPrice: parseFloat(e.target.value),
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Descuento (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="0"
                          value={manualItem.discount}
                          onChange={(e) =>
                            setManualItem((prev) => ({
                              ...prev,
                              discount: parseFloat(e.target.value) ,
                            }))
                          }
                        />
                      </div>
                      {/* Preview del subtotal */}
                      {manualItem.unitPrice > 0 && (
                        <div className="bg-gray-50 p-3 rounded">
                          <div className="text-sm">
                            <div>Cantidad: {manualItem.quantity}</div>
                            <div>
                              Precio unitario:{" "}
                              {formatearPrecio(manualItem.unitPrice)}
                            </div>
                            {manualItem.discount > 0 && (
                              <div>Descuento: {manualItem.discount}%</div>
                            )}
                            <div className="font-bold">
                              Subtotal:{" "}
                              {formatearPrecio(
                                manualItem.unitPrice *
                                  manualItem.quantity *
                                  (1 - manualItem.discount / 100)
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setShowManualItemDialog(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleAddManualItem}
                        disabled={
                          !manualItem.productName || !manualItem.unitPrice
                        }
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Agregar Item
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Variante</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Precio Unit.</TableHead>
                    <TableHead>Subtotal</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editedOrder?.items?.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {item?.product?.name || item.productName}
                          </div>
                          {item.description && (
                            <div className="text-sm text-gray-600">
                              {item?.product?.description || item.description}
                            </div>
                          )}
                          <div className="mt-1 px-2 py-1 bg-gray-200 text-gray-800 text-xs rounded inline-block">
                            {item.isManual ? "Manual" : "Catálogo"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {item.variantName || item.variant?.size || "-"}
                      </TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell>{formatearPrecio(item.unitPrice)}</TableCell>
                      <TableCell>{formatearPrecio(item.subtotal)}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemoveItem(item.id)}
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

          {/* Resumen de Pagos - 3 Cards */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Resumen de Pagos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Card Total */}
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-sm text-slate-600 mb-1">Total</p>
                  <p className="text-xl font-semibold">
                    {formatearPrecio(total)}
                  </p>
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    {editedOrder?.applyIVA ? (
                      <>
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Base imponible</span>
                          <span>{formatearPrecio(baseImponible)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>IVA (21%)</span>
                          <span>{formatearPrecio(taxAmount)}</span>
                        </div>
                        {/* <div className="flex justify-between text-xs text-slate-500">
                          <span>Subtotal (con IVA)</span>
                          <span>{formatearPrecio(subtotal)}</span>
                        </div> */}
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Total s/descuento</span>
                          <span>{formatearPrecio(subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Descuento</span>
                          <span>
                            -
                            {formatearPrecio(
                              // (editedOrder?.discountAmount || 0) +
                                (editedOrder?.manualDiscount || 0) +
                                ((editedOrder?.discountPercentage || 0) *
                                  subtotal) /
                                  100
                            )}
                          </span>
                        </div>
                      </>
                    )}
                    {/* {(editedOrder?.discountAmount || 0) > 0 && (
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Descuento</span>
                        <span>
                          -{formatearPrecio(editedOrder?.discountAmount || 0)}
                        </span>
                      </div>
                    )} */}
                  </div>
                </div>

                {/* Card Pagado */}
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-green-600 mb-1">Pagado</p>
                  <p className="text-xl font-semibold text-green-700">
                    {formatearPrecio(getTotalPaid(order))}
                  </p>
                  <div className="mt-2 pt-2 border-t border-green-200">
                    <div className="flex justify-between text-xs text-green-600">
                      <span>Seña</span>
                      <span>{formatearPrecio(getConsolidatedPayments(order).filter((payment) => payment.type === "seña").map((payment) => payment.amount).reduce((sum, amount) => sum + amount, 0))}</span>
                    </div>
                  </div>
                </div>

                {/* Card Saldo */}
                <div className="bg-amber-50 p-4 rounded-lg">
                  <p className="text-sm text-amber-600 mb-1">Saldo</p>
                  <p className="text-xl font-semibold text-amber-700">
                    {formatearPrecio(getRemainingBalance(order, total))}
                  </p>
                </div>
              </div>

              {/* Controles de edición */}
              <div className="space-y-4 border-t pt-4">
                {/* Campos de descuento */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Descuento (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editedOrder?.discountPercentage || ""}
                      onChange={(e) =>
                        setEditedOrder((prev: any) => ({
                          ...prev!,
                          discountPercentage:
                            parseFloat(e.target.value) || 0,
                        }))
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label>Descuento ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editedOrder?.manualDiscount || ""}
                      onChange={(e) =>
                        setEditedOrder((prev: any) => ({
                          ...prev!,
                          manualDiscount: parseFloat(e.target.value) || 0,
                        }))
                      }
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={editedOrder?.applyIVA}
                    onCheckedChange={(checked) =>
                      setEditedOrder((prev: any) => ({
                        ...prev!,
                        applyIVA: !!checked,
                      }))
                    }
                  />
                  <Label>Desglosar IVA (21%)</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="facturado"
                    disabled={true}
                    checked={editedOrder?.isInvoiced || false}
                    onCheckedChange={(checked) =>
                      setEditedOrder((prev: any) => ({
                        ...prev!,
                        isInvoiced: !!checked,
                      }))
                    }
                  />
                  <Label htmlFor="facturado">Facturado</Label>
                </div>

                {/* Información de facturación - Sistema múltiple */}
                <div className="border-t pt-4 space-y-4">
                  {/* Header con botón agregar */}
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Facturas</h4>
                    <Button
                      type="button"
                      onClick={() => setShowAddFactura(true)}
                      className="bg-blue-600 hover:bg-blue-700"
                      size="sm"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar Factura
                    </Button>
                  </div>

                  {/* Lista de facturas */}
                  {facturas.length > 0 && (
                    <div className="space-y-2">
                      {facturas.map((factura) => (
                        <div
                          key={factura.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-4 text-sm">
                              <span className="font-medium">
                                {factura.tipo}
                              </span>
                              <span>N° {factura.numero}</span>
                              <span>
                                {formatDateString(factura.fecha)}
                              </span>
                              {factura.monto && (
                                <span className="text-green-600 font-medium">
                                  ${factura.monto.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditFactura(factura.id)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRemoveFactura(factura.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Formulario para agregar/editar factura */}
                  {showAddFactura && (
                    <div className="p-4 border rounded-lg bg-blue-50">
                      <h5 className="font-medium mb-3">
                        {editingFacturaId ? "Editar Factura" : "Nueva Factura"}
                      </h5>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <Label>Tipo de Factura</Label>
                          <Select
                            value={newFacturaTipo}
                            onValueChange={(value) => setNewFacturaTipo(value)}
                          >
                            <SelectTrigger className={newFacturaTipo ? " text-black" : " text-gray-500"}>
                              <SelectValue placeholder="Tipo de factura"  />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Factura A">
                                Factura A
                              </SelectItem>
                              <SelectItem value="Factura B">
                                Factura B
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Número de Factura</Label>
                          <Input
                            value={newFacturaNumero}
                            onChange={(e) =>
                              setNewFacturaNumero(e.target.value)
                            }
                            placeholder="0001-00000001"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Fecha de Factura</Label>
                          <Input
                            type="date"
                            value={newFacturaFecha}
                            onChange={(e) => setNewFacturaFecha(e.target.value)}
                            className={newFacturaFecha ? " text-black" : " text-gray-500"}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Monto </Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={newFacturaMonto}
                            onChange={(e) => setNewFacturaMonto(e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          type="button"
                          onClick={
                            editingFacturaId
                              ? handleUpdateFactura
                              : handleAddFactura
                          }
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {editingFacturaId ? "Actualizar" : "Agregar"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleCancelFactura}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Formulario de pago (seña o parcial) */}
                {getRemainingBalance(order, total) > 0 && (
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium">
                        {hasDownPaymentRegistered(order) 
                          ? "Registrar pago parcial" 
                          : "Registrar seña"}
                      </h4>
                    </div>
                    <div className="space-y-3">
                      <div className={`grid ${metodoPago === EPaymentMethod.TRANSFER ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
                        <div>
                          <Label>Monto</Label>
                          <Input
                            type="number"
                            min="0"
                            step="10.00"
                            placeholder="0.00"
                            value={pagoParcial}
                            onChange={(e) => setPagoParcial(e.target.value)}
                            className="h-10 align-middle"
                          />
                        </div>
                        <div>
                          <Label>Método de pago</Label>
                          <Select
                            value={metodoPago}
                            onValueChange={(value) =>
                              setMetodoPago(value as EPaymentMethod)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EPaymentMethod.CASH}>
                                Efectivo
                              </SelectItem>
                              <SelectItem value={EPaymentMethod.CREDIT_CARD}>
                                Tarjeta de crédito
                              </SelectItem>
                              <SelectItem value={EPaymentMethod.DEBIT_CARD}>
                                Tarjeta de débito
                              </SelectItem>
                              <SelectItem value={EPaymentMethod.TRANSFER}>
                                Transferencia
                              </SelectItem>
                              <SelectItem value={EPaymentMethod.MERCADOPAGO}>
                                Mercado Pago
                              </SelectItem>
                              <SelectItem value={EPaymentMethod.CHECK}>
                                Cheque
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {metodoPago === EPaymentMethod.TRANSFER && (
                          <div>
                            <Label>Banco</Label>
                            <Select value={banco} onValueChange={setBanco}>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar banco" />
                              </SelectTrigger>
                              <SelectContent>
                                {BANCOS.map((banco: string) => (
                                  <SelectItem key={banco} value={banco}>
                                    {banco}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      <div className="col-span-1">
                      <Button
                        onClick={() => handlePagoParcial(
                          hasDownPaymentRegistered(order) ? "parcial" : "seña"
                        )}
                        disabled={loadingPago || !pagoParcial}
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                      >
                        {loadingPago 
                          ? "Registrando..." 
                          : hasDownPaymentRegistered(order)
                            ? "Registrar pago parcial" 
                            : "Registrar seña"}
                      </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Historial de pagos consolidado */}
                {getConsolidatedPayments(order).length > 0 && (
                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-medium mb-3">
                      Historial de pagos
                      <span className="text-sm text-gray-500 ml-2">
                        ({getConsolidatedPayments(order).length} {getConsolidatedPayments(order).length === 1 ? "pago" : "pagos"})
                      </span>
                    </h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Monto</TableHead>
                          <TableHead>Método</TableHead>
                          <TableHead>Notas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getConsolidatedPayments(order).map(
                          (payment: TPaymentHistory, index: number) => (
                            <TableRow key={index}>
                              <TableCell className="text-sm">
                                {formatDate(payment.date == undefined ? order.createdAt : payment.date)}
                                {/* {!payment.date ? formatDate(payment.date) : formatDate(order.createdAt)} */}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                    payment.type === "seña"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-green-100 text-green-700"
                                  }`}
                                >
                                  {payment.type === "seña" ? "Seña" : "Parcial"}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium">
                                {formatearPrecio(payment.amount)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {payment.method === EPaymentMethod.CASH
                                  ? "Efectivo"
                                  : payment.method === EPaymentMethod.CREDIT_CARD
                                  ? "T. Crédito"
                                  : payment.method === EPaymentMethod.DEBIT_CARD
                                  ? "T. Débito"
                                  : payment.method === EPaymentMethod.TRANSFER
                                  ? "Transferencia"
                                  : payment.method === EPaymentMethod.MERCADOPAGO
                                  ? "Mercado Pago"
                                  : payment.method === EPaymentMethod.CHECK
                                  ? "Cheque"
                                  : "Otro"}
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {payment.notes || "-"}
                              </TableCell>
                            </TableRow>
                          )
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
