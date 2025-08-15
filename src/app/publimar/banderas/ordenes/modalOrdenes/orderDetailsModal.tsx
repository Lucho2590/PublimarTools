"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useFirestore,
  useFirestoreDocData,
  useFirestoreCollectionData,
} from "reactfire";
import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  DocumentData,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Edit, Save, X, Plus, Trash2, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import collections from "@/lib/collections";
import {
  EOrderStatus,
  TOrder,
  TOrderItem,
  TPaymentHistory,
} from "@/types/order";
import { EPaymentMethod } from "@/types/sale";
import { TProduct, TProductVariant } from "@/types/product";
import { TClient } from "@/types/client";
import { formatDate, formatearPrecio } from "@/lib/utils";

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
}

export default function OrderDetailsModal({
  isOpen,
  onClose,
  orderId,
}: OrderDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPago, setLoadingPago] = useState(false);
  const [items, setItems] = useState<TOrderItem[]>([]);
  const [pagoParcial, setPagoParcial] = useState("");
  const [metodoPago, setMetodoPago] = useState<EPaymentMethod>(
    EPaymentMethod.CASH
  );
  const [banco, setBanco] = useState<string>("");

  // Estados para agregar productos
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<TProduct | null>(null);
  const [selectedVariant, setSelectedVariant] =
    useState<TProductVariant | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemDiscount, setItemDiscount] = useState(0);
  const [itemNotes, setItemNotes] = useState("");
  
  // Estados para facturación
  const [tipoFactura, setTipoFactura] = useState("");
  const [facturaNumero, setFacturaNumero] = useState("");
  const [facturaFecha, setFacturaFecha] = useState("");
  const [facturado, setFacturado] = useState(false);

  const firestore = useFirestore();

  // Obtener la orden - crear un doc dummy si no hay orderId
  const orderDoc =
    orderId && firestore
      ? doc(firestore, collections.ORDERS, orderId)
      : firestore
      ? doc(firestore, collections.ORDERS, "dummy")
      : null;

  const { status, data } = useFirestoreDocData(orderDoc!, { idField: "id" });

  const order = data as TOrder | null ;
  
  const BANCOS = ["Galicia", "Frances"];

  // Fetch clients
  const clientsCollection = collection(
    firestore || ({} as any),
    collections.CLIENTS
  );
  const { data: clients } = useFirestoreCollectionData(clientsCollection, {
    idField: "id",
  });

  // Fetch products
  const productsCollection = collection(
    firestore || ({} as any),
    collections.PRODUCTS
  );
  const { data: products } = useFirestoreCollectionData(productsCollection, {
    idField: "id",
  });

  // Helper function para manejar datos legacy de client
  const getClientContact = (client: any, field: "name" | "email" | "phone") => {
    // Si contacts es un array, usar el primer contacto
    if (Array.isArray(client?.contacts) && client.contacts.length > 0) {
      return client.contacts[0][field] || client[field] || "";
    }
    // Si no hay contacts o es legacy data, usar datos directos del cliente
    return client?.[field] || "";
  };

  // Inicializar items cuando se carga la orden
  useEffect(() => {
    if (order?.items) {
      // Transformar los datos para que coincidan con TOrderItem
      // console.log("🔍 Transformando items:", order.items);
      const transformedItems: TOrderItem[] = order.items.map((item: any) => ({
        id: item.id || crypto.randomUUID(),
        product: item.product,
        variant: item.variant,
        quantity: item.quantity,
        unitPrice: item.unitPrice || item.price || 0,
        discount: item.discount || 0,
        subtotal:
          item.subtotal || item.quantity * (item.unitPrice || item.price || 0),
        tax: item.tax || 0,
        taxAmount: item.taxAmount || 0,
        applyIVA: item.applyIVA || false,
        description: item.description || "",
        categories: item.categories || [],
        notes: item.notes || "",
      }));
      setItems(transformedItems);
    } else {
      setItems([]);
    }
    
    // Inicializar estados de facturación cuando se carga la orden
    if (order && status === "success") {
      // console.log("📋 Inicializando facturación:", {
      //   isInvoiced: order.isInvoiced,
      //   invoiceType: (order as any).invoiceType,
      //   invoiceNumber: order.invoiceNumber
      // });
      setFacturado(Boolean(order.isInvoiced));
      setTipoFactura((order as any).invoiceType || "");
      setFacturaNumero(order.invoiceNumber || "");
      // Si existe una fecha de factura, convertirla al formato YYYY-MM-DD para el input
      if (order.invoiceDate) {
        // console.log("🔍 Procesando invoiceDate:", order.invoiceDate, "Tipo:", typeof order.invoiceDate);
        try {
          let date;
          
          // Manejar diferentes tipos de fecha que puede devolver Firebase
          if ((order.invoiceDate as any)?.toDate && typeof (order.invoiceDate as any).toDate === 'function') {
            // Es un Timestamp de Firebase
            date = (order.invoiceDate as any).toDate();
            // console.log("📅 Convertido desde Firebase Timestamp:", date);
          } else {
            // Es una fecha normal o string
            date = new Date(order.invoiceDate);
            // console.log("📅 Date creado:", date);
          }
          
          // console.log("✅ Es válido:", !isNaN(date.getTime()));
          // Verificar que la fecha sea válida
          if (!isNaN(date.getTime())) {
            const formattedDate = date.toISOString().split('T')[0];
            setFacturaFecha(formattedDate);
          } else {
            console.warn("⚠️ Fecha de factura inválida:", order.invoiceDate);
            setFacturaFecha("");
          }
        } catch (error) {
          console.warn("⚠️ Error al convertir fecha de factura:", error);
          setFacturaFecha("");
        }
      } else {
        console.log("🔍 No hay invoiceDate");
        setFacturaFecha("");
      }
    }
  }, [order, status]);

  // Reset function (stable reference)
  const resetModalState = useCallback(() => {
    setIsEditing(false);
    setItems([]);
    setPagoParcial("");
    setBanco("");
    setIsAddingProduct(false);
    setEditingItemId(null);
    setProductSearchTerm("");
    setSelectedProduct(null);
    setSelectedVariant(null);
    setItemQuantity(1);
    setItemDiscount(0);
    setItemNotes("");
    // Reset estados de facturación
    setTipoFactura("");
    setFacturaNumero("");
    setFacturaFecha("");
    setFacturado(false);
  }, []);

  // Reset al cerrar modal
  useEffect(() => {
    if (!isOpen) {
      resetModalState();
    }
  }, [isOpen, resetModalState]);

  // Asegurar que los estados de facturación estén correctos al entrar en modo edición
  useEffect(() => {
    if (isEditing && order && status === "success") {
      // console.log("🔍 Cargando estado facturación:", {
      //   isInvoiced: order.isInvoiced,
      //   invoiceType: (order as any).invoiceType,
      //   invoiceNumber: order.invoiceNumber,
      //   invoiceDate: order.invoiceDate ? formatDate(order.invoiceDate) : undefined,
      // });
      setFacturado(Boolean(order.isInvoiced));
      setTipoFactura((order as any).invoiceType || "");
      setFacturaNumero(order.invoiceNumber || "");
      // Si existe una fecha de factura, convertirla al formato YYYY-MM-DD para el input
      if (order.invoiceDate) {
        // console.log("🔍 Procesando invoiceDate (modo edición):", order.invoiceDate, "Tipo:", typeof order.invoiceDate);
        try {
          let date;
          
          // Manejar diferentes tipos de fecha que puede devolver Firebase
          if ((order.invoiceDate as any)?.toDate && typeof (order.invoiceDate as any).toDate === 'function') {
            // Es un Timestamp de Firebase
            date = (order.invoiceDate as any).toDate();
            // console.log("📅 Convertido desde Firebase Timestamp (modo edición):", date);
          } else {
            // Es una fecha normal o string
            date = new Date(order.invoiceDate);
            // console.log("📅 Date creado (modo edición):", date);
          }
          
          // console.log("✅ Es válido (modo edición):", !isNaN(date.getTime()));
          // Verificar que la fecha sea válida
          if (!isNaN(date.getTime())) {
            const formattedDate = date.toISOString().split('T')[0];
            setFacturaFecha(formattedDate);
          } else {
            // console.warn("⚠️ Fecha de factura inválida en modo edición:", order.invoiceDate);
            setFacturaFecha("");
          }
        } catch (error) {
          // console.warn("⚠️ Error al convertir fecha de factura en modo edición:", error);
          setFacturaFecha("");        
        }
      } else {
        // console.log("🔍 No hay invoiceDate (modo edición)");
        setFacturaFecha("");
      }
    }
  }, [isEditing, order, status]);

  // Si no tenemos firestore o orderId, mostrar loading
  if (!firestore || !orderId) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Cambiar estado de la orden
  const handleStatusChange = async (newStatus: EOrderStatus) => {
    if (!order || !orderId) return;

    try {
      const orderRef = doc(firestore, collections.ORDERS, orderId);

      // Si el estado es COMPLETED, crear una venta
      if (newStatus === EOrderStatus.COMPLETED) {
        const salesRef = collection(firestore, collections.SALES);
        const salesQuery = query(salesRef, orderBy("number", "desc"), limit(1));
        const salesSnapshot = await getDocs(salesQuery);
        const lastSale = salesSnapshot.docs[0];
        const lastNumber = lastSale ? parseInt(lastSale.data().number) : 0;

        // Obtener información completa de los productos
        const productsRef = collection(firestore, collections.PRODUCTS);
        const productsSnapshot = await getDocs(productsRef);
        const productsData = productsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Crear la venta con información completa de productos
        const saleData = {
          number: order.number,
          items: order.items.map((item: any) => {
            const productData = productsData.find(
              (p) => p.id === item.product.id
            );
            return {
              productId: item.product.id,
              variantId: item.variant,
              categoryId: item.categories,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.quantity * item.unitPrice,
              product: productData,
            };
          }),
          subtotal: order.subtotal,
          total: order.total,
          paymentMethod: metodoPago,
          isInvoiced: false,
          invoiceNumber: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          orderId: order.id,
        };

        await addDoc(salesRef, saleData);
      }

      // Actualizar el estado de la orden
      await updateDoc(orderRef, {
        status: newStatus,
        updatedAt: new Date(),
      });

      toast.success("Estado actualizado correctamente");
    } catch (error) {
      console.error("Error al actualizar el estado:", error);
      toast.error("Error al actualizar el estado");
    }
  };

  // Manejar pago parcial
  const handlePagoParcial = async () => {
    if (!order || !pagoParcial || isNaN(Number(pagoParcial))) return;

    const montoPago = Number(pagoParcial);
    const saldoActual = order.balance || 0;

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
      const nuevoPago: TPaymentHistory = {
        amount: montoPago,
        date: new Date(),
        method: metodoPago,
        notes:
          metodoPago === EPaymentMethod.TRANSFER
            ? `Transferencia - ${banco}`
            : "Pago parcial",
      };

      const historialActual = order.paymentHistory || [];

      await updateDoc(doc(firestore, collections.ORDERS, order.id), {
        balance: nuevoSaldo,
        updatedAt: new Date(),
        paymentHistory: [...historialActual, nuevoPago],
      });

      toast.success("Pago registrado correctamente");
      setPagoParcial("");
      setBanco("");
    } catch (error) {
      console.error("Error al registrar pago:", error);
      toast.error("Error al registrar el pago");
    } finally {
      setLoadingPago(false);
    }
  };

  // Manejar el guardado de cambios en edición
  const handleSave = async (e: React.FormEvent) => {
    // console.log("🚀 handleSave llamado");
    e.preventDefault();
    if (!order) {
      // console.log("❌ No hay orden, saliendo");
      return;
    }

    // console.log("💾 Iniciando guardado...");
    setLoading(true);
    try {
      const formData = new FormData(e.target as HTMLFormElement);
      
      // Calcular totales basados en los items actuales
      const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      const taxAmount = items.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
      const total = subtotal + taxAmount;
      
      // console.log("📊 Totales calculados:", { subtotal, taxAmount, total });
      
      // Crear objeto base sin campos undefined
      const updateData: any = {
        status: formData.get("status") as EOrderStatus,
        paymentMethod: formData.get("paymentMethod") as EPaymentMethod,
        notes: (formData.get("notes") as string) || "",
        items: items,
        subtotal: subtotal,
        total: total,
        taxAmount: taxAmount,
        downPayment: Number(formData.get("downPayment")) || 0,
        balance: Number(formData.get("balance")) || 0,
        // Información de facturación
        isInvoiced: facturado,
        updatedAt: new Date(),
      };

      // Agregar campos de facturación solo si tienen valores válidos
      if (facturado && facturaNumero) {
        updateData.invoiceNumber = facturaNumero;
      }
      
      if (facturado && facturaFecha) {
        updateData.invoiceDate = new Date(facturaFecha + 'T00:00:00');
      }
      
      if (facturado && tipoFactura) {
        updateData.invoiceType = tipoFactura;
      }

      // console.log("💾 Guardando orden con datos:", {
      //   isInvoiced: facturado,
      //   invoiceNumber: updateData.invoiceNumber || null,
      //   invoiceType: updateData.invoiceType || null,
      //   invoiceDate: updateData.invoiceDate || null,
      //   itemsCount: items.length,
      //   total: total
      // });

      await updateDoc(doc(firestore, collections.ORDERS, order.id), updateData);
      // console.log("✅ Orden actualizada exitosamente");
      toast.success("Orden actualizada correctamente");
      setIsEditing(false);
    } catch (error) {
      // console.error("❌ Error al actualizar orden:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`Error al actualizar la orden: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Filter products based on search
  const filteredProducts = products?.filter((product: DocumentData) => {
    if (!product) return false;
    return (
      product.name?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
      product.description
        ?.toLowerCase()
        .includes(productSearchTerm.toLowerCase())
    );
  });

  const handleProductSelect = (
    product: TProduct,
    variant?: TProductVariant
  ) => {
    setSelectedProduct(product);
    setSelectedVariant(variant || null);
    setProductSearchTerm("");
  };

  const handleVariantSelect = (variant: TProductVariant) => {
    setSelectedVariant(variant);
  };

  const handleResetProductSelection = () => {
    setSelectedProduct(null);
    setSelectedVariant(null);
    setItemQuantity(1);
    setItemDiscount(0);
    setItemNotes("");
    setProductSearchTerm("");
    setIsAddingProduct(false);
    setEditingItemId(null);
  };

  const addItemToOrder = () => {
    if (!selectedProduct) return;

    const price = selectedVariant?.price
      ? Number(selectedVariant.price)
      : Number(selectedProduct.price);

    const subtotal = price * itemQuantity * (1 - itemDiscount / 100);
    const taxAmount = subtotal * 0.21; // 21% IVA

    const newItem: TOrderItem = {
      id: editingItemId || Date.now().toString(),
      product: selectedProduct,
      variant: selectedVariant || undefined,
      quantity: itemQuantity,
      unitPrice: price,
      discount: itemDiscount,
      subtotal: subtotal,
      tax: taxAmount,
      taxAmount: taxAmount,
      description: selectedProduct.description || "",
      categories: [],
      notes: itemNotes,
    };

    if (editingItemId) {
      setItems((prev) =>
        prev.map((item) => (item.id === editingItemId ? newItem : item))
      );
      setEditingItemId(null);
    } else {
      setItems((prev) => [...prev, newItem]);
    }

    handleResetProductSelection();
  };

  const startEditItem = (item: TOrderItem) => {
    setSelectedProduct(item.product);
    setSelectedVariant(item.variant || null);
    setItemQuantity(item.quantity);
    setItemDiscount(item.discount || 0);
    setItemNotes(item.notes || "");
    setEditingItemId(item.id);
    setIsAddingProduct(true);
  };

  const removeItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  if (status === "loading") {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!order || !order.client) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="text-center my-12">
            <h2 className="text-xl font-semibold mb-4">
              No se encontró la orden o datos incompletos
            </h2>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  console.log("🔍 Order:", order);
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-2xl font-bold">
            Orden #{order.number}
          </DialogTitle>
          <div className="flex gap-2">
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                className="bg-blue-900 hover:bg-blue-600 text-white"
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="submit"
                  form="edit-order-form"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => console.log("🔘 Botón Guardar clickeado")}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Guardar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  disabled={loading}
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  {/* <X className="h-4 w-4 mr-2 text-red-500" /> */}
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {isEditing ? (
          // Modo edición
          <form id="edit-order-form" onSubmit={handleSave}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Información del Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="clientName">Nombre</Label>
                      <Input
                        id="clientName"
                        defaultValue={order.client.name}
                        disabled
                      />
                    </div>
                    <div>
                      <Label htmlFor="clientContact">Persona de contacto</Label>
                      <Input
                        id="clientContact"
                        defaultValue={getClientContact(order.client, "name")}
                        disabled
                      />
                    </div>
                    {order.client.email && (
                      <div>
                        <Label htmlFor="clientEmail">Email</Label>
                        <Input
                          id="clientEmail"
                          defaultValue={getClientContact(order.client, "email")}
                          disabled
                        />
                      </div>
                    )}
                    {order.client.phone && (
                      <div>
                        <Label htmlFor="clientPhone">Teléfono</Label>
                        <Input
                          id="clientPhone"
                          defaultValue={getClientContact(order.client, "phone")}
                          disabled
                        />
                      </div>
                    )}
                    {order.client.address && (
                      <div>
                        <Label htmlFor="clientAddress">Dirección</Label>
                        <Input
                          id="clientAddress"
                          defaultValue={order.client.address}
                          disabled
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Detalles de la Orden</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="status">Estado</Label>
                      <Select name="status" defaultValue={order.status}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* <SelectItem value={EOrderStatus.PENDING}>
                            Pendiente
                          </SelectItem> */}
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
                      <Label htmlFor="paymentMethod">Método de pago</Label>
                      <Select
                        name="paymentMethod"
                        defaultValue={order.paymentMethod}
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
                    {order.paymentMethod === EPaymentMethod.TRANSFER && (
                      <> 
                      <div>
                        <Label htmlFor="banco">Banco</Label>
                        <Select
                          value={banco}
                          onValueChange={(value) => setBanco(value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar banco" />
                          </SelectTrigger>
                          <SelectContent>
                            {BANCOS.map((banco: string ) => (
                              <SelectItem key={banco} value={banco}>{banco}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      </>
                    )}
                    <div>
                      <Label htmlFor="downPayment">Seña</Label>
                      <Input
                        id="downPayment"
                        name="downPayment"
                        type="number"
                        step="0.01"
                        defaultValue={order.downPayment}
                      />
                    </div>
                    <div>
                      <Label htmlFor="balance">Saldo</Label>
                      <Input
                        id="balance"
                        name="balance"
                        type="number"
                        step="0.01"
                        defaultValue={order.balance}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sección de productos en modo edición */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  Productos
                  <Button
                    className="bg-blue-900 hover:bg-blue-700 text-white"
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddingProduct(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Producto
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Formulario para agregar/editar productos */}
                {isAddingProduct && (
                  <div className="mb-6 p-4 border rounded-lg bg-gray-50">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="product-search">Buscar Producto</Label>
                        <div className="relative">
                          <Input
                            id="product-search"
                            type="text"
                            placeholder="Buscar producto..."
                            value={productSearchTerm}
                            onChange={(e) =>
                              setProductSearchTerm(e.target.value)
                            }
                            className="pl-10"
                          />
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                        </div>
                        {productSearchTerm && filteredProducts && (
                          <div className="mt-2 border rounded-md max-h-38 overflow-y-auto bg-white">
                            {filteredProducts.map((product: any) => (
                              <div
                                key={product.id}
                                className="p-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                                onClick={() => handleProductSelect(product)}
                              >
                                <div className="font-medium">
                                  {product.name}
                                </div>
                                {product.description && (
                                  <div className="text-sm text-gray-600">
                                    {product.description}
                                  </div>
                                )}
                                <div className="text-sm text-blue-600">
                                  {formatearPrecio(Number(product.price))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {selectedProduct && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <Label htmlFor="quantity">Cantidad</Label>
                            <Input
                              id="quantity"
                              type="number"
                              min="1"
                              value={itemQuantity}
                              onChange={(e) =>
                                setItemQuantity(Number(e.target.value))
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor="discount">Descuento (%)</Label>
                            <Input
                              id="discount"
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={itemDiscount}
                              onChange={(e) =>
                                setItemDiscount(Number(e.target.value))
                              }
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label htmlFor="item-notes">
                              Notas del producto
                            </Label>
                            <Input
                              id="item-notes"
                              value={itemNotes}
                              onChange={(e) => setItemNotes(e.target.value)}
                              placeholder="Notas adicionales..."
                            />
                          </div>
                        </div>
                      )}

                      {selectedProduct &&
                        selectedProduct.variants &&
                        selectedProduct.variants.length > 0 && (
                          <div>
                            <Label>Variantes</Label>
                            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-2">
                              {selectedProduct.variants.map((variant) => (
                                <Button
                                  key={variant.id}
                                  type="button"
                                  variant={
                                    selectedVariant?.id === variant.id
                                      ? "default"
                                      : "outline"
                                  }
                                  size="sm"
                                  onClick={() => handleVariantSelect(variant)}
                                >
                                  {variant.size}
                                  {/* {formatearPrecio(Number(variant.price))} */}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          onClick={addItemToOrder}
                          disabled={!selectedProduct}
                          className="bg-blue-900 hover:bg-blue-700"
                        >
                          {editingItemId ? "Actualizar" : "Agregar"} Producto
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleResetProductSelection}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tabla de productos */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Cant.</TableHead>
                      <TableHead>Desc.</TableHead>
                      <TableHead>Subtotal</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.product.name}</p>
                            {item.variant && (
                              <p className="text-sm text-slate-500">
                                Medida: {item.variant.size}
                              </p>
                            )}
                            {item.notes && (
                              <p className="text-xs text-slate-500 mt-1">
                                Nota: {item.notes}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatearPrecio(item.unitPrice)}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          {item.discount && item.discount > 0
                            ? `${item.discount}%`
                            : "-"}
                        </TableCell>
                        <TableCell>{formatearPrecio(item.subtotal)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              type="button"
                              className="text-blue-700 hover:text-blue-900 hover:bg-blue-50"
                              onClick={() => startEditItem(item)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="Eliminar"
                              type="button"
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {items.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-8 text-slate-500"
                        >
                          No hay productos agregados
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Información de facturación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Estado de facturación</Label>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="facturado"
                        checked={facturado}
                        onCheckedChange={(checked) => setFacturado(checked as boolean)}
                        className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                      />
                      <Label htmlFor="facturado" className="text-sm">
                        {facturado ? "Facturada" : "No facturada"}
                      </Label>
                    </div>
                  </div>
                  {facturado && (
                    <>
                      <div className="space-y-2">
                        <Label>Tipo de factura</Label>
                        <Select
                          value={tipoFactura}
                          onValueChange={(value) => setTipoFactura(value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder="Tipo..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A">A</SelectItem>
                            <SelectItem value="B">B</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Número de factura</Label>
                        <Input
                          value={facturaNumero}
                          onChange={(e) => setFacturaNumero(e.target.value)}
                          placeholder="Número de factura..."
                        />
                      </div>
                    </>
                  )}
                </div>
                {facturado && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Fecha de factura</Label>
                      <Input
                        type="date"
                        value={facturaFecha}
                        onChange={(e) => setFacturaFecha(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  name="notes"
                  defaultValue={order.notes || ""}
                  placeholder="Notas adicionales..."
                />
              </CardContent>
            </Card>
          </form>
        ) : (
          // Modo vista
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle>Información del Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                  <h3 className="font-medium text-lg">{order.client.name}</h3>
                  {Array.isArray(order.client.contacts) &&
                    order.client.contacts.length > 0 && (
                      <>
                        <p className="text-slate-600">
                          Contacto: {order.client.contacts[0].name}
                        </p>
                        {order.client.contacts[0].email && (
                          <p className="text-slate-600">
                            Email: {order.client.contacts[0].email}
                          </p>
                        )}
                        {order.client.contacts[0].phone && (
                          <p className="text-slate-600">
                            Teléfono: {order.client.contacts[0].phone}
                          </p>
                        )}
                      </>
                    )}
                      {order.client.phone &&
                    (
                      <p className="text-slate-600">
                        Teléfono: {order.client.phone}
                      </p>
                    )}
                  {order.client.email &&
                    !getClientContact(order.client, "email") && (
                      <p className="text-slate-600">
                        Email: {order.client.email}
                      </p>
                    )}
                
                  {order.client.address && (
                    <p className="text-slate-600">
                      Dirección: {order.client.address}
                    </p>
                  )}
                  {order.client.cuit && (
                    <p className="text-slate-600">
                      CUIT/CUIL: {order.client.cuit}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Detalles de la Orden</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Fecha:</span>
                      <span>{formatDate(order.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Estado:</span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          order.status === EOrderStatus.IN_PROCESS
                            ? "bg-amber-100 text-amber-800"
                            : order.status === EOrderStatus.COMPLETED
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {order.status === EOrderStatus.IN_PROCESS
                          ? "En Proceso"
                          : order.status === EOrderStatus.COMPLETED
                          ? "Entregada"
                          : "Cancelada"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Forma de pago:</span>
                      <span>
                        {order.paymentMethod === EPaymentMethod.CASH
                          ? "Efectivo"
                          : order.paymentMethod === EPaymentMethod.CREDIT_CARD
                          ? "Tarjeta de crédito"
                          : order.paymentMethod === EPaymentMethod.DEBIT_CARD
                          ? "Tarjeta de débito"
                          : order.paymentMethod === EPaymentMethod.TRANSFER
                          ? "Transferencia"
                          : order.paymentMethod === EPaymentMethod.MERCADOPAGO
                          ? "Mercado Pago"
                          : "No especificada"}
                      </span>
                    </div>
                    {/* {order.isInvoiced && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Factura:</span>
                        <span>{order.invoiceNumber || "-"}</span>
                      </div>
                    )} */}
                    <div className="flex justify-between">
                      <span className="text-slate-600">Factura:</span>
                      <span>{order.invoiceType || "-"} - {order.invoiceNumber}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Items</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Cant.</TableHead>
                      <TableHead>Desc.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.product.name}</p>
                            {item.variant && (
                              <p className="text-sm text-slate-500">
                                Medida: {item.variant.size}
                              </p>
                            )}
                            {item.notes && (
                              <p className="text-xs text-slate-500 mt-1">
                                Nota: {item.notes}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatearPrecio(item.unitPrice)}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          {item.discount && item.discount > 0
                            ? `${item.discount}%`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatearPrecio(item.subtotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {order.notes && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Notas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{order.notes}</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Pagos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Resumen de pagos */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ">
                    <div className="bg-slate-50 p-4 rounded-lg ">
                      <p className="text-sm text-slate-600 mb-1">Total</p>
                      <p className="text-xl font-semibold">
                        {formatearPrecio(order.total || 0)}
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-200">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Subtotal:</span>
                          <span>{formatearPrecio(order.subtotal || 0)}</span>
                        </div>
                        {order.applyIVA && order.taxRate ? (
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>IVA ({order.taxRate}%):</span>
                            <span>{formatearPrecio(order.taxAmount || 0)}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-green-600 mb-1">Pagado</p>
                      <p className="text-xl font-semibold text-green-700">
                        {formatearPrecio(
                          (order.total || 0) - (order.balance || 0)
                        )}
                      </p>
                      <div className="mt-2 pt-2 border-t border-green-100">
                        <div className="flex justify-between text-xs text-green-600">
                          <span>Seña:</span>
                          <span>{formatearPrecio(order.downPayment || 0)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg">
                      <p className="text-sm text-amber-600 mb-1">Saldo</p>
                      <p className="text-xl font-semibold text-amber-700">
                        {formatearPrecio(order.balance || 0)}
                      </p>
                    </div>
                  </div>

                  {/* Formulario de pago parcial - solo si hay saldo */}
                  {(order.balance || 0) > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Registrar pago</h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div>
                          <Label htmlFor="pagoParcial">Monto</Label>
                          <Input
                            id="pagoParcial"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={pagoParcial}
                            onChange={(e) => setPagoParcial(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="metodoPago">Método</Label>
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
                            <Label htmlFor="banco">Banco</Label>
                            <Select
                              value={banco}
                              onValueChange={(value) => setBanco(value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar banco" />
                              </SelectTrigger>
                              <SelectContent>
                                {BANCOS.map((banco: string ) => (
                                  <SelectItem key={banco} value={banco}>{banco}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <Button
                          onClick={handlePagoParcial}
                          disabled={loadingPago || !pagoParcial}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {loadingPago ? "Registrando..." : "Registrar pago"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Historial de pagos */}
                  {order.paymentHistory && order.paymentHistory.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Historial de pagos</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Monto</TableHead>
                            <TableHead>Método</TableHead>
                            <TableHead>Notas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {order.paymentHistory.map((payment, index) => (
                            <TableRow key={index}>
                              <TableCell>{formatDate(payment.date)}</TableCell>
                              <TableCell>
                                {formatearPrecio(payment.amount)}
                              </TableCell>
                              <TableCell>
                                {payment.method === EPaymentMethod.CASH
                                  ? "Efectivo"
                                  : payment.method ===
                                    EPaymentMethod.CREDIT_CARD
                                  ? "Tarjeta de crédito"
                                  : payment.method === EPaymentMethod.DEBIT_CARD
                                  ? "Tarjeta de débito"
                                  : payment.method === EPaymentMethod.TRANSFER
                                  ? "Transferencia"
                                  : payment.method ===
                                    EPaymentMethod.MERCADOPAGO
                                  ? "Mercado Pago"
                                  : payment.method === EPaymentMethod.CHECK
                                  ? "Cheque"
                                  : "Otro"}
                              </TableCell>
                              <TableCell>{payment.notes || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
