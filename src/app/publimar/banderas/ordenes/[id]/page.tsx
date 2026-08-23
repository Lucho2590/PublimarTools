'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "reactfire";
import { useOrders, useOrderById } from "@/hooks/useOrders";
import { useClients } from "@/hooks/useClients";
import { useSales } from "@/hooks/useSales";
import { EClientSection } from "@/types/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
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
  Wallet,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useClientAvailableCredit } from "@/hooks/useCreditNotes";
import { applyCreditNoteToDocument } from "@/lib/creditNotes";
import { formatearPrecio, formatDate, formatDateString, extractIdFromSlug } from "@/lib/utils";
import {
  calcDocumentTotals,
  calcItemDiscountAmount,
  calcItemGross,
  calcItemNet,
  formatItemDiscount,
  normalizeItemDiscount,
  TDiscountType,
} from "@/lib/totals";
import { DiscountInput } from "@/components/admin/DiscountInput";
import { toast } from "sonner";
import { EOrderStatus, TPaymentHistory, TFactura } from "@/types/order";
import { EPaymentMethod, ESaleDepartment } from "@/types/sale";
import { doc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection } from "firebase/firestore";
import collections from "@/lib/collections";
import { isDeleted } from "@/lib/softDelete";
import { variantDiscountsStock } from "@/lib/stock";
import { TProduct, TProductVariant } from "@/types/product";
import { TClient } from "@/types/client";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSelect } from "@/components/admin/AccountSelect";
import {
  registerAccountMovement,
  reverseAccountMovement,
} from "@/lib/accountMovements";
import { EMovementType } from "@/types/accountMovement";
import { useAccounts } from "@/hooks/useAccounts";
import {
  usePaymentAccountDefaults,
  getDefaultAccountId,
} from "@/hooks/usePaymentAccountDefaults";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminOrAbove } from "@/lib/permissions";

export default function OrderDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { data: user } = useUser();
  const firestore = useFirestore();
  const { userRole } = useAuth();
  const { accounts: allAccounts } = useAccounts({ includeArchived: true });
  const { defaults: paymentDefaults } = usePaymentAccountDefaults();
  const canEditPayments = isAdminOrAbove(userRole);

  // Extraer el ID real del slug
  const orderId = extractIdFromSlug(params.id);

  // Hooks
  const { updateOrder, changeOrderStatus, deleteOrder } = useOrders();
  const {
    orden: order,
    loading: orderLoading,
    error: orderError,
  } = useOrderById(orderId);
  const { clients, loading: clientsLoading, updateClient } = useClients({ section: EClientSection.BANDERAS });
  const { createSale, generateSaleNumber } = useSales();

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
  const [cuentaPago, setCuentaPago] = useState<string>("");
  const [loadingPago, setLoadingPago] = useState(false);

  // Estados para editar / eliminar pagos (solo SUPERUSER y ADMIN)
  const [pagoEditando, setPagoEditando] = useState<{
    index: number;
    payment: TPaymentHistory;
  } | null>(null);
  const [editForm, setEditForm] = useState<{
    amount: string;
    method: EPaymentMethod;
    banco: string;
    accountId: string;
  }>({ amount: "", method: EPaymentMethod.CASH, banco: "", accountId: "" });
  const [pagoEliminar, setPagoEliminar] = useState<{
    index: number;
    payment: TPaymentHistory;
  } | null>(null);
  const [savingPagoEdit, setSavingPagoEdit] = useState(false);

  // Estados para item manual
  const [showManualItemDialog, setShowManualItemDialog] = useState(false);
  const [manualItem, setManualItem] = useState({
    productName: "",
    description: "",
    variantName: "",
    quantity: 1,
    unitPrice: 0,
    discount: 0,
    discountType: "percent" as TDiscountType,
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
  const [itemDiscountType, setItemDiscountType] =
    useState<TDiscountType>("percent");

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

  // Estados para conversión a venta
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<any>(null);
  const [clicked, setClicked] = useState(false);

  // Notas de crédito disponibles para aplicar a esta orden
  const orderClientId =
    (order?.clientId as string | undefined) || (order as any)?.client?.id;
  const { notes: availableCreditNotes, total: availableCredit } =
    useClientAvailableCredit(orderClientId);
  const [applyingNoteId, setApplyingNoteId] = useState<string | null>(null);


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
   * Aplica una nota de crédito al saldo pendiente de la orden actual.
   */
  const handleApplyCreditNote = async (noteId: string) => {
    if (!order || !user?.uid) return;
    const orderTotal = Number((order as any).total) || total;
    if (orderTotal <= 0) {
      toast.error("La orden no tiene total definido");
      return;
    }
    if (getRemainingBalance(order, orderTotal) <= 0) {
      toast.error("La orden ya está totalmente cubierta");
      return;
    }
    setApplyingNoteId(noteId);
    try {
      const result = await applyCreditNoteToDocument(firestore, {
        noteId,
        documentId: orderId,
        documentType: "order",
        documentNumber: order.number,
        documentTotal: orderTotal,
        appliedBy: user.uid,
      });
      toast.success(
        `Nota aplicada: ${formatearPrecio(result.appliedAmount)}` +
          (result.forfeitedAmount > 0
            ? ` (sobrante perdido: ${formatearPrecio(result.forfeitedAmount)})`
            : ""),
      );
    } catch (err) {
      console.error("Error al aplicar nota de crédito:", err);
      toast.error(
        err instanceof Error ? err.message : "Error al aplicar la nota de crédito",
      );
    } finally {
      setApplyingNoteId(null);
    }
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
      // Las órdenes viejas guardaban el neto en `subtotal` sin declarar el
      // descuento de línea: se reconstruye para no alterar el total al abrir.
      setEditedOrder({
        ...order,
        items: (order.items || []).map((item: any) =>
          normalizeItemDiscount(item, item.subtotal)
        ),
      });
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

  // Obtener cliente completo (soporta ambos formatos: clientId y client.id)
  const selectedClient = clients?.find((c) =>
    c.id === order?.clientId || c.id === order?.client?.id
  );

  // Cálculo canónico compartido: primero el descuento de cada ítem (ya dentro
  // de `subtotal`), después el general sobre ese subtotal ya descontado.
  // El % va sobre el neto sin IVA, igual que en el alta de órdenes.
  const totals = calcDocumentTotals({
    items: editedOrder?.items || [],
    applyIVA: editedOrder?.applyIVA,
    taxRate: Number(editedOrder?.taxRate) || 21,
    discountPercentage: editedOrder?.discountPercentage,
    manualDiscount: editedOrder?.manualDiscount,
  });
  const grossSubtotal = totals.grossSubtotal;
  const itemsDiscountAmount = totals.itemsDiscountAmount;
  const subtotal = totals.subtotal;
  const total = totals.total;
  const baseImponible = totals.subtotalSinIVA;
  const taxAmount = totals.taxAmount;

  // Productos filtrados para búsqueda
  const filteredProducts =
    products?.filter((product: any) => {
      if (isDeleted(product)) return false;
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

  // Función para convertir orden a venta
  const convertOrderToSale = async (orderData: any) => {
    // NOTA: esta función NO registra movimientos de cuenta a propósito.
    // Los cobros de la orden ya impactaron las cuentas al registrarse cada
    // pago (handlePagoParcial). Registrar movimientos acá duplicaría el ingreso.
    try {
      // Transformar items de orden a items de venta
      const saleItems = orderData.items.map((item: any) => ({
        isManual: item.isManual || false,
        description: item.description || undefined,
        productId: item.productId || undefined,
        variantId: item.variantId || undefined,
        productName: item.productName || undefined,
        variantName: item.variantName || undefined,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        discount: Number(item.discount) || 0,
        discountType: item.discountType || "percent",
        total: Number(item.subtotal) || 0,
      }));

      const saleTotals = calcDocumentTotals({
        items: saleItems,
        applyIVA: orderData.applyIVA || false,
        taxRate: Number(orderData.taxRate) || 21,
        discountPercentage: orderData.discountPercentage,
        manualDiscount: orderData.manualDiscount,
      });

      // Crear la venta basada en la orden
      const saleData = {
        clientName: orderData.clientName || undefined,
        client: orderData.clientId || undefined,
        number: orderData.number,
        items: saleItems,
        subtotal: orderData.subtotal,
        total: orderData.total,
        applyIVA: orderData.applyIVA || false,
        // Mismo criterio que el resto de la app: la tasa se guarda en puntos
        // (21, no 0.21) y el IVA se desglosa del subtotal, no del total.
        taxRate: Number(orderData.taxRate) || 21,
        taxAmount: saleTotals.taxAmount,
        discountPercentage: orderData.discountPercentage || 0,
        discountAmount: saleTotals.generalDiscountAmount,
        manualDiscount: orderData.manualDiscount || 0,
        paymentMethod: (orderData.paymentMethod as EPaymentMethod)
          || (orderData.paymentHistory?.length > 0
            ? orderData.paymentHistory[orderData.paymentHistory.length - 1].method
            : EPaymentMethod.CASH),
        department: ESaleDepartment.BANDERAS,
        isInvoiced: orderData.isInvoiced || false,
        invoiceNumber: orderData.invoiceNumber || "",
        bank: orderData.bank || undefined,
        facturas: orderData.facturas || [],
        orderId: orderId,
      };

      // Crear la venta
      const saleId = await createSale(saleData as any);

      // Descontar stock de los productos (mismo flujo que en ventas/nueva)
      for (const item of orderData.items) {
        // Solo actualizar stock para productos del catálogo, no para items manuales
        const isManualItem = item.isManual || false;

        if (!isManualItem && item.productId) {
          try {
            const productRef = doc(firestore, collections.PRODUCTS, item.productId);
            const productDoc = await getDoc(productRef);

            if (productDoc.exists()) {
              const currentProduct = productDoc.data();
              const currentSalesCount = currentProduct.salesCount || 0;

              // Si tiene variante, actualizar stock de la variante específica
              if (item.variantId && currentProduct.variants) {
                const variant = currentProduct.variants.find((v: any) => v.id === item.variantId);
                const shouldUpdateStock =
                  variant && variant.stock != null && variantDiscountsStock(variant);
                await updateDoc(productRef, {
                  variants: shouldUpdateStock
                    ? currentProduct.variants.map((v: any) =>
                        v.id === item.variantId
                          ? { ...v, stock: Number(v.stock) - item.quantity }
                          : v
                      )
                    : currentProduct.variants,
                  salesCount: currentSalesCount + 1,
                  lastSaleDate: new Date(),
                });
              } else {
                // Si stock es null (ej: bandera personalizada), no descontar
                const shouldUpdateStock = currentProduct.stock != null;
                await updateDoc(productRef, {
                  ...(shouldUpdateStock && { stock: Number(currentProduct.stock) - item.quantity }),
                  salesCount: currentSalesCount + 1,
                  lastSaleDate: new Date(),
                });
              }
            }
          } catch (error) {
            console.error(`Error al actualizar stock del producto ${item.productId}:`, error);
            // Continuar con los demás productos aunque uno falle
          }
        }
      }

      toast.success(`Orden convertida a venta exitosamente (ID: ${saleId})`);

      return saleId;
    } catch (error) {
      console.error("Error al convertir orden a venta:", error);
      toast.error("Error al convertir la orden a venta");
      throw error;
    }
  };

  const handleSave = async (facturasOverride?: TFactura[]) => {
    if (!editedOrder || !user) return;

    setSaving(true);
    try {
      // Recalcular totales (misma fórmula canónica que la pantalla)
      const newSubtotal = totals.subtotal;
      const newTaxAmount = totals.taxAmount;
      const newTotal = total;
      const newBalance =
        total -
        (editedOrder?.downPayment || 0) -
        (order?.paymentHistory?.reduce(
          (sum: number, payment: any) => sum + payment.amount,
          0
        ) || 0);
      const newDiscountAmount = totals.generalDiscountAmount;

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

      // Verificar si debe mostrar diálogo de conversión a venta
      const shouldConvert =
        cleanUpdateData.status === EOrderStatus.COMPLETED &&
        newBalance === 0 &&
        !order?.convertedToSale;

      if (shouldConvert) {
        // Guardar datos pendientes y mostrar diálogo
        setPendingSaveData(cleanUpdateData);
        setShowConvertDialog(true);
        setSaving(false);
        return;
      }

      // Guardar normalmente si no requiere conversión
      await updateOrder(orderId, cleanUpdateData);

      toast.success("Orden actualizada exitosamente");
    } catch (error) {
      toast.error("Error al actualizar la orden");
      console.error("Error completo:", error);
    } finally {
      setSaving(false);
    }
  };

  // Función para confirmar conversión a venta
  const handleConfirmConvert = async () => {
    if (!pendingSaveData) return;

    setClicked(true);
    setSaving(true);
    try {
      // Primero guardar la orden
      await updateOrder(orderId, pendingSaveData);

      // Luego convertir a venta
      const saleId = await convertOrderToSale(pendingSaveData);

      // Actualizar la orden con la referencia a la venta usando doc y updateDoc directamente
      const orderRef = doc(firestore, collections.ORDERS, orderId);
      await updateDoc(orderRef, {
        convertedToSale: true,
        convertedAt: serverTimestamp(),
        saleId: saleId,
        updatedAt: serverTimestamp(),
      });

      toast.success("Orden guardada y convertida a venta exitosamente");

      // Limpiar estados
      setShowConvertDialog(false);
      setPendingSaveData(null);
      setClicked(false);
    } catch (error) {
      console.error("Error al guardar y convertir:", error);
      toast.error("Error al procesar la orden");
    } finally {
      setSaving(false);
    }
  };

  // Función para cancelar conversión y solo guardar
  const handleCancelConvert = async () => {
    if (!pendingSaveData) return;

    setSaving(true);
    try {
      await updateOrder(orderId, pendingSaveData);
      toast.success("Orden actualizada exitosamente");

      // Limpiar estados
      setShowConvertDialog(false);
      setPendingSaveData(null);
    } catch (error) {
      console.error("Error al guardar:", error);
      toast.error("Error al actualizar la orden");
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
      
      const pagoId = `pago-${Date.now()}`;

      // Si se eligió una cuenta, registrar el ingreso en esa cuenta.
      // Sin cuenta seleccionada no se genera movimiento (igual que en ventas).
      let accountMovementId: string | null = null;
      if (cuentaPago) {
        try {
          const acc = allAccounts.find((a) => a.id === cuentaPago);
          accountMovementId = await registerAccountMovement(firestore, {
            accountId: cuentaPago,
            type: EMovementType.INCOME,
            amount: montoPago,
            description: `Pago orden #${order.number}${
              order.clientName ? ` - ${order.clientName}` : ""
            } (${metodoPago}${banco ? ` ${banco}` : ""}${
              acc ? ` → ${acc.name}` : ""
            })`,
            date: new Date(),
            sourceType: "order",
            sourceId: order.id,
            createdBy: userRole || user?.uid || "",
          });
        } catch (err) {
          console.error("Error al registrar movimiento de cuenta:", err);
        }
      }

      const nuevoPago: TPaymentHistory = {
        id: pagoId,
        amount: montoPago,
        date: new Date(),
        type: tipoPago,
        method: metodoPago,
        notes: paymentNotes,
        accountId: cuentaPago || null,
        accountMovementId,
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
      setCuentaPago("");
      setMetodoPago(EPaymentMethod.CASH);
    } catch (error) {
      console.error("Error al registrar pago:", error);
      toast.error("Error al registrar el pago");
    } finally {
      setLoadingPago(false);
    }
  };


  const BANCOS = ["Galicia", "Frances"];

  // ============================================
  // EDITAR / ELIMINAR PAGOS (solo SUPERUSER y ADMIN)
  // ============================================

  const buildPaymentNotes = (
    type: string,
    method: EPaymentMethod,
    bancoSel: string,
  ): string => {
    let notes = type === "seña" ? "Seña/Anticipo" : "Pago parcial";
    if (method === EPaymentMethod.TRANSFER) {
      notes = `${notes} - Transferencia${bancoSel ? ` - ${bancoSel}` : ""}`;
    } else if (method === EPaymentMethod.MERCADOPAGO) {
      notes = `${notes} - Mercado Pago`;
    }
    return notes;
  };

  // Recalcula el balance de la orden a partir de un paymentHistory dado
  // (considera también el downPayment legacy).
  const computeBalanceFromHistory = (history: TPaymentHistory[]): number => {
    const downPaymentAmount = Number((order as any)?.downPayment) || 0;
    const historyAmount = history.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );
    return total - downPaymentAmount - historyAmount;
  };

  const abrirEdicionPago = (index: number, payment: TPaymentHistory) => {
    setPagoEditando({ index, payment });
    setEditForm({
      amount: String(payment.amount ?? ""),
      method: payment.method,
      banco:
        payment.method === EPaymentMethod.TRANSFER
          ? ((order as any)?.bank as string) || ""
          : "",
      accountId: payment.accountId || "",
    });
  };

  const handleGuardarEdicionPago = async () => {
    if (!order || !pagoEditando) return;
    if (!canEditPayments) {
      toast.error("No tenés permisos para editar pagos");
      return;
    }
    const monto = Number(editForm.amount);
    if (!monto || isNaN(monto) || monto <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    if (editForm.method === EPaymentMethod.TRANSFER && !editForm.banco) {
      toast.error("Debes seleccionar un banco");
      return;
    }
    setSavingPagoEdit(true);
    try {
      const { index, payment } = pagoEditando;

      // Revertir el movimiento anterior si lo había
      if (payment.accountMovementId) {
        try {
          await reverseAccountMovement(firestore, payment.accountMovementId);
        } catch (err) {
          console.error("Error al revertir movimiento anterior:", err);
        }
      }

      // Registrar el nuevo movimiento si se eligió cuenta
      let accountMovementId: string | null = null;
      if (editForm.accountId) {
        try {
          const acc = allAccounts.find((a) => a.id === editForm.accountId);
          accountMovementId = await registerAccountMovement(firestore, {
            accountId: editForm.accountId,
            type: EMovementType.INCOME,
            amount: monto,
            description: `Pago orden #${order.number}${
              order.clientName ? ` - ${order.clientName}` : ""
            } (${editForm.method}${
              editForm.banco ? ` ${editForm.banco}` : ""
            }${acc ? ` → ${acc.name}` : ""}) [editado]`,
            date: payment.date ? new Date(payment.date) : new Date(),
            sourceType: "order",
            sourceId: order.id,
            createdBy: userRole || user?.uid || "",
          });
        } catch (err) {
          console.error("Error al registrar movimiento de cuenta:", err);
        }
      }

      const historial = [...(order.paymentHistory || [])];
      historial[index] = {
        ...payment,
        amount: monto,
        method: editForm.method,
        notes: buildPaymentNotes(payment.type, editForm.method, editForm.banco),
        accountId: editForm.accountId || null,
        accountMovementId,
      };

      await updateDoc(doc(firestore, collections.ORDERS, order.id), {
        paymentHistory: historial,
        balance: computeBalanceFromHistory(historial),
        updatedAt: new Date(),
      });

      toast.success("Pago actualizado correctamente");
      setPagoEditando(null);
    } catch (error) {
      console.error("Error al editar el pago:", error);
      toast.error("Error al editar el pago");
    } finally {
      setSavingPagoEdit(false);
    }
  };

  const handleEliminarPago = async () => {
    if (!order || !pagoEliminar) return;
    if (!canEditPayments) {
      toast.error("No tenés permisos para eliminar pagos");
      return;
    }
    setSavingPagoEdit(true);
    try {
      const { index, payment } = pagoEliminar;

      if (payment.accountMovementId) {
        try {
          await reverseAccountMovement(firestore, payment.accountMovementId);
        } catch (err) {
          console.error("Error al revertir movimiento:", err);
        }
      }

      const historial = (order.paymentHistory || []).filter(
        (_: TPaymentHistory, i: number) => i !== index,
      );

      await updateDoc(doc(firestore, collections.ORDERS, order.id), {
        paymentHistory: historial,
        balance: computeBalanceFromHistory(historial),
        updatedAt: new Date(),
      });

      toast.success("Pago eliminado correctamente");
      setPagoEliminar(null);
    } catch (error) {
      console.error("Error al eliminar el pago:", error);
      toast.error("Error al eliminar el pago");
    } finally {
      setSavingPagoEdit(false);
    }
  };

  // Manejar item manual
  const handleAddManualItem = () => {
    if (!manualItem.productName || !manualItem.unitPrice) {
      toast.error("Nombre y precio son requeridos");
      return;
    }

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
      discountType: manualItem.discountType,
      subtotal: calcItemNet(manualItem),
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
      discountType: "percent",
      notes: "",
    });
    setShowManualItemDialog(false);
    toast.success("Item manual agregado");
  };



  // Manejar agregar producto del catálogo
  const handleAddProduct = () => {
    if (!selectedProduct) return;

    const price = Number(selectedVariant?.price || selectedProduct.price || 0);

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
      discountType: itemDiscountType,
      subtotal: calcItemNet({
        quantity: itemQuantity,
        unitPrice: price,
        discount: itemDiscount,
        discountType: itemDiscountType,
      }),
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
    setItemDiscountType("percent");
    setProductSearchTerm("");
    setShowAddItemDialog(false);
    toast.success("Producto agregado");
  };

  const clearModalStates = () => {
    setSelectedProduct(null);
    setSelectedVariant(null);
    setItemQuantity(1);
    setItemDiscount(0);
    setItemDiscountType("percent");
    setProductSearchTerm("");
    setShowAddItemDialog(false);
  };

  return (
    <div className="container mx-auto py-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push("/publimar/banderas/ordenes")}
            title="Volver a órdenes"
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Orden {order.number}</h1>
              {(() => {
                const map: Record<string, { label: string; cls: string }> = {
                  [EOrderStatus.COMPLETED]: { label: "Entregada", cls: "bg-green-100 text-green-800" },
                  [EOrderStatus.IN_PROCESS]: { label: "En proceso", cls: "bg-amber-100 text-amber-800" },
                  [EOrderStatus.DRAFT]: { label: "Borrador", cls: "bg-gray-100 text-gray-800" },
                  [EOrderStatus.CANCELLED]: { label: "Cancelada", cls: "bg-red-100 text-red-800" },
                };
                const info = map[order.status] ?? map[EOrderStatus.DRAFT];
                return (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${info.cls}`}>
                    {info.label}
                  </span>
                );
              })()}
            </div>
            <p className="text-slate-600 text-sm mt-1">
              Creada el {order.createdAt ? formatDate(order.createdAt) : "N/A"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => handleSave()}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Guardando..." : "Guardar"}
          </Button>
          <Button
            onClick={handleDeleteOrder}
            disabled={saving}
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna 1: Cliente & Información General */}
        <div className="space-y-4">
          {/* Cliente - Movido arriba */}
          <Card className="border-0 shadow-sm">
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
                    selectedClient?.contacts?.[0]?.name ||
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
                    selectedClient?.phone ||
                    editedOrder?.contact?.phone ||
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
                          selectedClient?.contacts?.[0]?.email ||
                          order?.client?.contacts?.[0]?.email ||
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
                          selectedClient?.contacts?.[0]?.phone ||
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
                          selectedClient?.contacts?.[0]?.position ||
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
          <Card className="border-0 shadow-sm">
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
                      Entregada
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
          <Card className="border-0 shadow-sm">
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
                              <Label>Descuento</Label>
                              <DiscountInput
                                value={itemDiscount}
                                type={itemDiscountType}
                                onValueChange={setItemDiscount}
                                onTypeChange={setItemDiscountType}
                                inputClassName="flex-1"
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
                                <div>
                                  Descuento:{" "}
                                  {formatItemDiscount({
                                    quantity: itemQuantity,
                                    unitPrice: Number(
                                      selectedVariant?.price ||
                                        selectedProduct.price ||
                                        0
                                    ),
                                    discount: itemDiscount,
                                    discountType: itemDiscountType,
                                  })}
                                </div>
                              )}
                              <div className="font-bold">
                                Subtotal:{" "}
                                {formatearPrecio(
                                  calcItemNet({
                                    quantity: itemQuantity,
                                    unitPrice: Number(
                                      selectedVariant?.price ||
                                        selectedProduct.price ||
                                        0
                                    ),
                                    discount: itemDiscount,
                                    discountType: itemDiscountType,
                                  })
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
                          <MoneyInput
                            placeholder="0"
                            value={manualItem.unitPrice || 0}
                            onValueChange={(n) =>
                              setManualItem((prev) => ({
                                ...prev,
                                unitPrice: n,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Descuento</Label>
                        <DiscountInput
                          value={manualItem.discount || 0}
                          type={manualItem.discountType}
                          onValueChange={(discount) =>
                            setManualItem((prev) => ({ ...prev, discount }))
                          }
                          onTypeChange={(discountType) =>
                            setManualItem((prev) => ({ ...prev, discountType }))
                          }
                          inputClassName="flex-1"
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
                              <div>
                                Descuento: {formatItemDiscount(manualItem)} (−
                                {formatearPrecio(
                                  calcItemDiscountAmount(manualItem)
                                )}
                                )
                              </div>
                            )}
                            <div className="font-bold">
                              Subtotal: {formatearPrecio(calcItemNet(manualItem))}
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
                    <TableHead>Desc.</TableHead>
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
                          <Badge
                            variant="secondary"
                            className={`mt-1 ${
                              item.isManual
                                ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                                : "bg-blue-100 text-blue-800 hover:bg-blue-100"
                            }`}
                          >
                            {item.isManual ? "Manual" : "Catálogo"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {item.variantName || item.variant?.size || "-"}
                      </TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell>{formatearPrecio(item.unitPrice)}</TableCell>
                      <TableCell>
                        {item.discount > 0 ? (
                          <span className="text-green-600">
                            {formatItemDiscount(item)} (−
                            {formatearPrecio(calcItemDiscountAmount(item))})
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {item.discount > 0 && (
                          <span className="mr-2 text-xs text-slate-400 line-through">
                            {formatearPrecio(calcItemGross(item))}
                          </span>
                        )}
                        {formatearPrecio(item.subtotal)}
                      </TableCell>
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
          <Card className="mt-4 border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Resumen de Pagos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Card Total */}
                <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4">
                  <p className="text-sm text-slate-600 mb-1">Total</p>
                  <p className="text-2xl font-bold text-slate-900">
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
                          <span>{formatearPrecio(grossSubtotal)}</span>
                        </div>
                        {itemsDiscountAmount > 0 && (
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>Descuento en ítems</span>
                            <span>-{formatearPrecio(itemsDiscountAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Descuento general</span>
                          <span>
                            -
                            {formatearPrecio(
                              totals.generalDiscountAmount +
                                totals.manualDiscount
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
                <div className="rounded-lg border border-green-200 bg-gradient-to-br from-green-50 to-green-100 p-4">
                  <p className="text-sm text-green-600 mb-1">Pagado</p>
                  <p className="text-2xl font-bold text-green-700">
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
                <div className="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100 p-4">
                  <p className="text-sm text-amber-600 mb-1">Saldo</p>
                  <p className="text-2xl font-bold text-amber-700">
                    {formatearPrecio(getRemainingBalance(order, total))}
                  </p>
                </div>
              </div>

              {/* Notas de crédito disponibles del cliente */}
              {availableCredit > 0 &&
                getRemainingBalance(order, total) > 0 && (
                  <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Wallet className="h-4 w-4 text-amber-800" />
                      <span className="font-semibold text-amber-900 text-sm">
                        Saldo a favor del cliente:{" "}
                        {formatearPrecio(availableCredit)}
                      </span>
                      <Badge className="bg-amber-200 text-amber-900 hover:bg-amber-200">
                        {availableCreditNotes.length} nota
                        {availableCreditNotes.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <p className="text-xs text-amber-900 mb-2">
                      La nota se usa completa. Si supera el saldo pendiente, el
                      sobrante se pierde.
                    </p>
                    <div className="flex flex-col gap-2">
                      {availableCreditNotes.map((n) => {
                        const remaining = getRemainingBalance(order, total);
                        const willForfeit = n.amount > remaining;
                        return (
                          <div
                            key={n.id}
                            className="flex items-center justify-between gap-2 rounded bg-white border border-amber-200 px-2 py-2"
                          >
                            <div className="text-sm">
                              <span className="font-medium">{n.number}</span>{" "}
                              <span className="font-semibold">
                                {formatearPrecio(n.amount)}
                              </span>
                              {n.reason && (
                                <span className="block text-xs text-slate-500">
                                  {n.reason}
                                </span>
                              )}
                              {willForfeit && (
                                <span className="block text-xs text-amber-700">
                                  Sobrante perdido:{" "}
                                  {formatearPrecio(n.amount - remaining)}
                                </span>
                              )}
                            </div>
                            <Button
                              size="sm"
                              disabled={applyingNoteId === n.id}
                              onClick={() => handleApplyCreditNote(n.id)}
                            >
                              {applyingNoteId === n.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Aplicar"
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* Controles de edición */}
              <div className="space-y-4 border-t pt-4">
                {/* Campos de descuento */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Desc. general (%)</Label>
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
                    <Label>Desc. general ($)</Label>
                    <MoneyInput
                      value={editedOrder?.manualDiscount || 0}
                      onValueChange={(n) =>
                        setEditedOrder((prev: any) => ({
                          ...prev!,
                          manualDiscount: n,
                        }))
                      }
                      placeholder="0"
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
                          <MoneyInput
                            placeholder="0"
                            value={parseFloat(newFacturaMonto) || 0}
                            onValueChange={(n) =>
                              setNewFacturaMonto(n ? String(n) : "")
                            }
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
                          <MoneyInput
                            placeholder="0"
                            value={parseFloat(pagoParcial) || 0}
                            onValueChange={(n) =>
                              setPagoParcial(n ? String(n) : "")
                            }
                            className="h-10 align-middle"
                          />
                        </div>
                        <div>
                          <Label>Método de pago</Label>
                          <Select
                            value={metodoPago}
                            onValueChange={(value) => {
                              setMetodoPago(value as EPaymentMethod);
                              setCuentaPago(
                                getDefaultAccountId(
                                  paymentDefaults,
                                  "sales",
                                  value as EPaymentMethod,
                                ),
                              );
                            }}
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
                      <div>
                        <Label>Cuenta (opcional)</Label>
                        <AccountSelect
                          value={cuentaPago}
                          onChange={(value) => setCuentaPago(value)}
                          placeholder={
                            metodoPago === EPaymentMethod.CASH
                              ? "Ej: Efectivo Banderas"
                              : "Seleccionar cuenta"
                          }
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Si seleccionás una cuenta, el cobro impacta su saldo.
                        </p>
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
                          {canEditPayments && (
                            <TableHead className="text-right">Acciones</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getConsolidatedPayments(order).map(
                          (payment: TPaymentHistory, index: number) => {
                            const legacyOffset =
                              (order as any)?.downPayment &&
                              (order as any).downPayment > 0
                                ? 1
                                : 0;
                            const historyIndex = index - legacyOffset;
                            const isEditable =
                              canEditPayments && historyIndex >= 0;
                            return (
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
                                  : payment.method === EPaymentMethod.CREDIT_NOTE
                                  ? "Nota de crédito"
                                  : "Otro"}
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {payment.notes || "-"}
                              </TableCell>
                              {canEditPayments && (
                                <TableCell className="text-right">
                                  {isEditable ? (
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        title="Editar pago"
                                        onClick={() =>
                                          abrirEdicionPago(
                                            historyIndex,
                                            (order.paymentHistory || [])[
                                              historyIndex
                                            ],
                                          )
                                        }
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        title="Eliminar pago"
                                        className="text-red-600 hover:text-red-700"
                                        onClick={() =>
                                          setPagoEliminar({
                                            index: historyIndex,
                                            payment:
                                              (order.paymentHistory || [])[
                                                historyIndex
                                              ],
                                          })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400">
                                      —
                                    </span>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                            );
                          }
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

      {/* Dialog para editar un pago (solo SUPERUSER y ADMIN) */}
      <Dialog
        open={!!pagoEditando}
        onOpenChange={(open) => !open && setPagoEditando(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Monto</Label>
              <MoneyInput
                placeholder="0"
                value={parseFloat(editForm.amount) || 0}
                onValueChange={(n) =>
                  setEditForm((f) => ({ ...f, amount: n ? String(n) : "" }))
                }
              />
            </div>
            <div>
              <Label>Método de pago</Label>
              <Select
                value={editForm.method}
                onValueChange={(value) =>
                  setEditForm((f) => ({
                    ...f,
                    method: value as EPaymentMethod,
                    banco:
                      (value as EPaymentMethod) === EPaymentMethod.TRANSFER
                        ? f.banco
                        : "",
                    accountId: getDefaultAccountId(
                      paymentDefaults,
                      "sales",
                      value as EPaymentMethod,
                    ),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EPaymentMethod.CASH}>Efectivo</SelectItem>
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
                  <SelectItem value={EPaymentMethod.CHECK}>Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editForm.method === EPaymentMethod.TRANSFER && (
              <div>
                <Label>Banco</Label>
                <Select
                  value={editForm.banco}
                  onValueChange={(value) =>
                    setEditForm((f) => ({ ...f, banco: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANCOS.map((b: string) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Cuenta (opcional)</Label>
              <AccountSelect
                value={editForm.accountId}
                onChange={(value) =>
                  setEditForm((f) => ({ ...f, accountId: value }))
                }
                placeholder="Seleccionar cuenta"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Al guardar se revierte el movimiento anterior y se registra el
                nuevo según la cuenta seleccionada.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPagoEditando(null)}
              disabled={savingPagoEdit}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGuardarEdicionPago}
              disabled={savingPagoEdit}
            >
              {savingPagoEdit ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación para eliminar un pago */}
      <Dialog
        open={!!pagoEliminar}
        onOpenChange={(open) => !open && setPagoEliminar(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar pago</DialogTitle>
          </DialogHeader>
          <div className="py-3 text-sm text-gray-600">
            ¿Seguro que querés eliminar este pago de{" "}
            <strong>
              {pagoEliminar
                ? formatearPrecio(pagoEliminar.payment.amount)
                : ""}
            </strong>
            ? Si tenía un movimiento de cuenta asociado, se revertirá del saldo
            de la cuenta. Esta acción no se puede deshacer.
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPagoEliminar(null)}
              disabled={savingPagoEdit}
            >
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleEliminarPago}
              disabled={savingPagoEdit}
            >
              {savingPagoEdit ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación para convertir a venta */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convertir a Venta</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Esta orden está <strong>Entregada</strong> y tiene <strong>saldo $0</strong>.
            </p>
            <p className="text-sm text-gray-600 mt-2">
              ¿Deseas convertirla automáticamente a una <strong>Venta</strong>?
            </p>
            {editedOrder && (
              <div className="mt-3 p-3 bg-gray-50 rounded-md">
                <p className="text-sm font-medium">Orden #{editedOrder.number}</p>
                <p className="text-sm text-gray-600">
                  Cliente: {editedOrder.clientName || order?.client?.name}
                </p>
                <p className="text-sm text-gray-600">
                  Total: {formatearPrecio(total)}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelConvert} disabled={saving}>
              No, solo guardar
            </Button>
            <Button onClick={handleConfirmConvert} className="bg-green-600 hover:bg-green-700" disabled={clicked || saving}>
              {saving ? "Procesando..." : "Sí, convertir a Venta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
