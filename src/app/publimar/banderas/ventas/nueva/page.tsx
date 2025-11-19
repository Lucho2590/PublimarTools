"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Search,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Save,
  ArrowLeft,
  FileText,
  Pencil,
  X,
} from "lucide-react";
import { toast } from "sonner";
import collections from "@/lib/collections";
import { TProduct, TProductCategory, TProductVariant } from "@/types/product";
import { EPaymentMethod, TFactura } from "@/types/sale";
import { formatearPrecio, redondearADecena, redondearTotal, formatDateString } from "@/lib/utils";
import { useClients } from "@/hooks/useClients";

interface SaleItem {
  id: string;
  product: TProduct;
  variant: TProductVariant;
  quantity: number;
  unitPrice: number;
  total: number;
}

export default function NuevaVentaPage() {
  const router = useRouter();
  const firestore = useFirestore();

  // Hook de clientes
  const { 
    clients, 
    loading: clientsLoading,
    createClient 
  } = useClients();

  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [items, setItems] = useState<SaleItem[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set()
  );
  const [selectedQuantities, setSelectedQuantities] = useState<
    Record<string, number>
  >({});
  const [paymentMethod, setPaymentMethod] = useState<EPaymentMethod>(
    EPaymentMethod.CASH
  );
  const [bank, setBank] = useState<string>("");
  const [isInvoiced, setIsInvoiced] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const [applyIVA, setApplyIVA] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [manualTotal, setManualTotal] = useState<number | null>(null);
  const [manualDiscount, setManualDiscount] = useState<number>(0);
  
  // Estados para múltiples facturas
  const [facturas, setFacturas] = useState<TFactura[]>([]);
  const [showAddFactura, setShowAddFactura] = useState(false);
  const [editingFacturaId, setEditingFacturaId] = useState<string | null>(null);
  const [newFacturaTipo, setNewFacturaTipo] = useState("");
  const [newFacturaNumero, setNewFacturaNumero] = useState("");
  const [newFacturaFecha, setNewFacturaFecha] = useState("");
  const [newFacturaMonto, setNewFacturaMonto] = useState("");

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

  // Estados para el cliente
  const [cliente, setCliente] = useState("");
  const [clienteInput, setClienteInput] = useState("");
  const [personaContacto, setPersonaContacto] = useState("");
  const [direccion, setDireccion] = useState("");
  const [email, setEmail] = useState("");
  const [cuit, setCuit] = useState("");
  const [telefono, setTelefono] = useState("");
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [highlightedClientIndex, setHighlightedClientIndex] = useState(-1);
  const clienteInputRef = useRef<HTMLInputElement>(null);
  const dropdownClientRef = useRef<HTMLUListElement>(null);
  const [isClientExpanded, setIsClientExpanded] = useState(false);

  // Cálculos simples sin useMemo para evitar problemas
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const taxRate = 21; // IVA

  // Calcular IVA desde precio final cuando aplica
  let taxAmount = 0;
  let subtotalSinIVA = subtotal;

  if (applyIVA) {
    // Si aplicamos IVA, los precios son finales (con IVA incluido)
    // Calculamos el IVA que está incluido en el precio
    taxAmount = redondearTotal(subtotal * (taxRate / (100 + taxRate)));
    subtotalSinIVA = redondearTotal(subtotal - taxAmount);
  }

  const discountAmount = redondearTotal(
    subtotal * (discountPercentage / 100)
  );
  const calculatedTotal = redondearTotal(
    subtotal - discountAmount - manualDiscount
  );
  const total = manualTotal !== null ? manualTotal : calculatedTotal;

  const handleTotalChange = (value: string) => {
    const numericValue = parseFloat(value);
    if (!isNaN(numericValue)) {
      setManualTotal(redondearTotal(numericValue));
    } else {
      setManualTotal(null);
    }
  };

  const limpiarFormulario = () => {
    setItems([]);
    setPaymentMethod(EPaymentMethod.CASH);
    setBank("");
    setIsInvoiced(false);
    setInvoiceNumber("");
    setSearchTerm("");
    setSelectedCategory("");
    setCurrentPage(1);
    setSelectedProducts(new Set());
    setSelectedQuantities({});
    setSelectedVariants({});
    setApplyIVA(true);
    setDiscountPercentage(0);
    setManualTotal(null);
    setManualDiscount(0);
    // Limpiar datos del cliente
    setCliente("");
    setClienteInput("");
    setPersonaContacto("");
    setDireccion("");
    setEmail("");
    setCuit("");
    setTelefono("");
    setFacturas([]);
  };

  // Funciones de manejo del cliente
  const handleSelectClient = (clientId: string) => {
    setCliente(clientId);
    // Precargar datos del cliente
    const selectedClient = clients?.find((c: any) => c.id === clientId);
    if (selectedClient) {
      setPersonaContacto(selectedClient.contacts?.[0]?.name || "");
      setDireccion(selectedClient.address || "");
      setEmail(selectedClient.email || "");
      setTelefono(selectedClient.phone || "");
      setCuit(selectedClient.cuit || "");
      // Expandir la card para mostrar los datos precargados
      setIsClientExpanded(true);
    }
  };

  const handleClientInputChange = (value: string) => {
    setClienteInput(value);
    setShowClienteDropdown(true);
    setHighlightedClientIndex(-1);
    // Si el valor no coincide con ningún cliente existente, limpiar el clientId
    const clientExists = clients?.some(
      (c: any) => c.name.toLowerCase().trim() === value.toLowerCase().trim()
    );
    if (!clientExists) {
      setCliente(""); // Limpiar el ID si es un cliente nuevo/manual
    }
  };

  const handleClientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const filteredClients = clients?.filter((c: any) =>
      c.name.toLowerCase().includes(clienteInput.toLowerCase())
    ) || [];

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedClientIndex((prev) =>
        prev < filteredClients.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedClientIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && highlightedClientIndex >= 0) {
      e.preventDefault();
      const selectedClient = filteredClients[highlightedClientIndex];
      handleSelectClient(selectedClient.id);
      setClienteInput(selectedClient.name);
      setShowClienteDropdown(false);
      setHighlightedClientIndex(-1);
      if (clienteInputRef.current) clienteInputRef.current.blur();
    }
  };

  const handleCreateClient = async () => {
    if (!clienteInput.trim()) {
      toast.error("El nombre del cliente es requerido");
      return;
    }

    try {
      // Preparar datos del cliente
      const clientData: any = {
        name: clienteInput.trim(),
        type: "individual",
        status: "active",
        contacts: personaContacto || email || telefono ? [{
          name: personaContacto || clienteInput,
          email: email || "",
          phone: telefono || "",
        }] : [],
      };

      const newClientId = await createClient(clientData);
      
      // Actualizar el cliente seleccionado
      setCliente(newClientId);
      setShowClienteDropdown(false);
      setIsClientExpanded(true);
      toast.success(`Cliente "${clienteInput}" creado exitosamente`);
    } catch (error) {
      console.error('Error al crear cliente:', error);
      toast.error("Error al crear el cliente");
    }
  };

  // Obtener productos
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { status: productsStatus, data: products } = useFirestoreCollectionData(
    productsCollection,
    {
      idField: "id",
    }
  );

  // Obtener categorías
  const categoriesCollection = collection(
    firestore,
    collections.products.CATEGORIES
  );
  const { data: categories } = useFirestoreCollectionData(
    categoriesCollection,
    {
      idField: "id",
    }
  );

  // Filtrar productos con filtro súper combinado
  const filteredProducts = products?.reduce((unique: TProduct[], product) => {
    const typedProduct = product as unknown as TProduct;
    const exists = unique.find((p) => p.name === typedProduct.name);
    if (exists) return unique;

    // Filtro de búsqueda combinada
    if (searchTerm.trim()) {
      // Separar términos por comas o espacios
      const terminos = searchTerm
        .toLowerCase()
        .split(/[,\s]+/)
        .filter((term) => term.trim().length > 0);

      // Crear texto combinado de TODOS los campos
      const textoCompleto = [
        // Datos del producto
        typedProduct.name,
        typedProduct.sku,

        // Datos de variantes
        ...(typedProduct.variants
          ?.map((v) => [
            v.size,
            v.sku,
            v.price?.toString(),
            v.stock?.toString(),
          ])
          .flat() || []),

        // Nombres de categorías
        typedProduct.categories
          ?.map((id) => {
            const category = categories?.find(
              (c) => (c as unknown as TProductCategory).id === id
            );
            return category
              ? (category as unknown as TProductCategory).name
              : "";
          })
          .filter(Boolean)
          .join(", ") || "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      // Verificar que TODOS los términos estén presentes
      const matchesSearch = terminos.every((termino) =>
        textoCompleto.includes(termino)
      );
      if (!matchesSearch) return unique;
    }

    // Filtro por categoría
    const matchesCategory =
      selectedCategory === "" ||
      selectedCategory === "all" ||
      (typedProduct.categories &&
        typedProduct.categories.includes(selectedCategory));


    if (matchesCategory) {
      unique.push(typedProduct);
    }

    return unique;
  }, []);

  // Ordenar productos por popularidad (más vendidos primero)
  const sortedProducts = filteredProducts?.sort((a, b) => {
    const salesA = (a as any).totalSales || 0;
    const salesB = (b as any).totalSales || 0;
    return salesB - salesA; // Descendente (más vendidos primero)
  });

  // Calcular productos paginados
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = sortedProducts?.slice(startIndex, endIndex);
  const totalPages = Math.ceil((sortedProducts?.length || 0) / itemsPerPage);

  // Inicializar las variantes seleccionadas con la primera variante de cada producto
  useEffect(() => {
    if (products && Array.isArray(products) && products.length > 0) {
      const initialVariants: Record<string, string> = {};

      products.forEach((product) => {
        try {
          const typedProduct = product as unknown as TProduct;
          // Verificar que el producto tenga ID y variantes
          if (
            typedProduct?.id &&
            typedProduct?.variants &&
            Array.isArray(typedProduct.variants) &&
            typedProduct.variants.length > 0
          ) {
            const firstVariant = typedProduct.variants[0];
            if (firstVariant?.id) {
              initialVariants[typedProduct.id] = firstVariant.id;
            }
          }
        } catch (error) {
          console.warn("Error procesando producto:", product, error);
        }
      });

      // Solo actualizar si hay variantes para establecer
      if (Object.keys(initialVariants).length > 0) {
        setSelectedVariants(initialVariants);
      }
    }
  }, [products]);

  const handleVariantChange = (productId: string, variantId: string) => {
    setSelectedVariants((prev) => ({
      ...prev,
      [productId]: variantId,
    }));
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleQuantityChange = (
    productId: string,
    variantId: string,
    newQuantity: number
  ) => {
    // Si el item ya está en la lista de items, actualizamos su cantidad
    const existingItem = items.find(
      (item) => item.product.id === productId && item.variant.id === variantId
    );

    if (existingItem) {
      if (newQuantity > Number(existingItem.variant.stock)) {
        toast.error("No hay suficiente stock disponible");
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === existingItem.id
            ? {
                ...item,
                quantity: newQuantity,
                total: newQuantity * item.unitPrice,
              }
            : item
        )
      );
    } else {
      // Si no está en la lista, actualizamos la cantidad temporal
      setSelectedQuantities((prev) => ({
        ...prev,
        [`${productId}-${variantId}`]: newQuantity,
      }));
    }
  };

  const handleAddSelectedProducts = () => {
    const productsToAdd = paginatedProducts?.filter((product) => {
      const typedProduct = product as unknown as TProduct;
      return selectedProducts.has(typedProduct.id);
    });

    if (productsToAdd && productsToAdd.length > 0) {
      productsToAdd.forEach((product) => {
        const typedProduct = product as unknown as TProduct;
        const selectedVariant = typedProduct.variants?.find(
          (v) => v.id === selectedVariants[typedProduct.id]
        );
        if (selectedVariant) {
          const quantity =
            selectedQuantities[`${typedProduct.id}-${selectedVariant.id}`] || 0;
          if (quantity > 0) {
            const newItem: SaleItem = {
              id: crypto.randomUUID(),
              product: typedProduct,
              variant: selectedVariant,
              quantity: quantity,
              unitPrice: Number(selectedVariant.price),
              total: Number(selectedVariant.price) * quantity,
            };
            setItems((prev) => [...prev, newItem]);
          }
        }
      });
      setSelectedProducts(new Set());
      setSelectedQuantities({});
      toast.success("Productos agregados correctamente");
    } else {
      toast.error("No hay productos seleccionados");
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  // Funciones para manejar facturas
  const handleAddFactura = () => {
    if (!newFacturaTipo || !newFacturaNumero || !newFacturaFecha) {
      toast.error("Tipo, Número y Fecha son requeridos");
      return;
    }

    if (editingFacturaId) {
      // Editar factura existente
      setFacturas(prev => 
        prev.map(f => 
          f.id === editingFacturaId 
            ? {
                ...f,
                tipo: newFacturaTipo,
                numero: newFacturaNumero,
                fecha: newFacturaFecha,
                ...(newFacturaMonto && { monto: parseFloat(newFacturaMonto) }),
              }
            : f
        )
      );
      toast.success("Factura actualizada correctamente");
    } else {
      // Agregar nueva factura
      const nuevaFactura: TFactura = {
        id: `factura-${Date.now()}`,
        tipo: newFacturaTipo,
        numero: newFacturaNumero,
        fecha: newFacturaFecha,
        ...(newFacturaMonto && { monto: parseFloat(newFacturaMonto) }),
      };
      setFacturas(prev => [...prev, nuevaFactura]);
      toast.success("Factura agregada correctamente");
    }

    // Limpiar formulario
    setNewFacturaTipo("");
    setNewFacturaNumero("");
    setNewFacturaFecha("");
    setNewFacturaMonto("");
    setShowAddFactura(false);
    setEditingFacturaId(null);
  };

  const handleEditFactura = (id: string) => {
    const factura = facturas.find(f => f.id === id);
    if (factura) {
      setNewFacturaTipo(factura.tipo);
      setNewFacturaNumero(factura.numero);
      setNewFacturaFecha(factura.fecha);
      setNewFacturaMonto(factura.monto?.toString() || "");
      setEditingFacturaId(id);
      setShowAddFactura(true);
    }
  };

  const handleDeleteFactura = (id: string) => {
    setFacturas(prev => prev.filter(f => f.id !== id));
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

    const newItem: SaleItem = {
      id: crypto.randomUUID(),
      product: {
        id: `manual-${Date.now()}`,
        name: manualItem.productName,
        description: manualItem.description,
        sku: "",
        categories: [],
        variants: [],
        salesCount: 0,
        totalSales: 0,
        price: manualItem.unitPrice,
        stock: Infinity,
        imageUrls: [],
        hasVariants: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as TProduct,
      variant: {
        id: `manual-variant-${Date.now()}`,
        size: manualItem.variantName || "N/A",
        sku: "",
        price: manualItem.unitPrice,
        stock: Infinity,
      } as TProductVariant,
      quantity: manualItem.quantity,
      unitPrice: manualItem.unitPrice,
      total: itemSubtotal,
    };

    setItems((prev) => [...prev, newItem]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      toast.error("No hay productos en la venta");
      return;
    }

    setLoading(true);

    try {
      // Calcular valores en el momento del submit para asegurar que están actualizados
      const currentSubtotal = items.reduce((sum, item) => sum + item.total, 0);
      let currentTaxAmount = 0;
      let currentSubtotalSinIVA = currentSubtotal;

      if (applyIVA) {
        currentTaxAmount = redondearTotal(currentSubtotal * (21 / (100 + 21)));
        currentSubtotalSinIVA = redondearTotal(
          currentSubtotal - currentTaxAmount
        );
      }

      const currentDiscountAmount = redondearTotal(
        currentSubtotalSinIVA * (discountPercentage / 100)
      );
      const currentCalculatedTotal = redondearTotal(
        currentSubtotal - currentDiscountAmount - manualDiscount
      );
      const currentTotal =
        manualTotal !== null ? manualTotal : currentCalculatedTotal;

      // Construir objeto de datos del cliente solo si hay información
      const clientData: any = {};
      if (cliente) {
        clientData.clientId = cliente;
      }
      if (clienteInput) {
        clientData.clientName = clienteInput;
      }
      if (personaContacto) {
        clientData.contact = { name: personaContacto };
      }
      if (direccion) {
        clientData.direccion = direccion;
      }
      if (email) {
        clientData.email = email;
      }
      if (telefono) {
        clientData.telefono = telefono;
      }
      if (cuit) {
        clientData.cuit = cuit;
      }

      const saleData = {
        number: new Date().getTime().toString(),
        items: items.map((item) => ({
          description: item.product.description,
          productId: item.product.id,
          variantId: item.variant.id,
          productName: item.product.name,
          variantName: item.variant.size,
          quantity: item.quantity,
          unitPrice: redondearTotal(item.unitPrice),
          total: redondearTotal(item.total),
        })),
        subtotal: redondearTotal(
          applyIVA ? currentSubtotalSinIVA : currentSubtotal
        ),
        total: redondearTotal(currentTotal),
        applyIVA,
        taxRate: 21,
        taxAmount: redondearTotal(currentTaxAmount),
        discountPercentage,
        discountAmount: redondearTotal(currentDiscountAmount),
        manualDiscount: redondearTotal(manualDiscount),
        paymentMethod,
        bank: paymentMethod === EPaymentMethod.TRANSFER ? bank : null,
        isInvoiced,
        invoiceNumber: isInvoiced ? invoiceNumber : null,
        facturas: facturas.length > 0 ? facturas : [],
        // Datos del cliente (solo se incluyen si tienen valor)
        ...clientData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const salesCollection = collection(firestore, collections.SALES);
      await addDoc(salesCollection, saleData);

      for (const item of items) {
        // Solo actualizar stock para productos del catálogo, no para items manuales
        const isManualItem = item.product.id.startsWith('manual-');
        
        if (!isManualItem) {
          const productRef = doc(
            firestore,
            collections.PRODUCTS,
            item.product.id
          );
          
          // Actualizar stock Y contadores de ventas
          const currentProduct = item.product;
          const currentTotalSales = currentProduct.totalSales || 0;
          const currentSalesCount = currentProduct.salesCount || 0;
          
          await updateDoc(productRef, {
            variants: item.product.variants.map((v) =>
              v.id === item.variant.id
                ? { ...v, stock: Number(v.stock) - item.quantity }
                : v
            ),
            // Actualizar contadores de ventas
            totalSales: currentTotalSales + item.quantity,
            salesCount: currentSalesCount + 1,
            lastSaleDate: new Date(),
          });
        }
      }

      toast.success("Venta registrada con éxito");
      router.push("/publimar/banderas/ventas");
      
    } catch (error) {
      console.error("Error al registrar la venta:", error);
      toast.error("Error al registrar la venta");
    } finally {
      setLoading(false);
    }
  };

  if (productsStatus === "loading") {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Nueva Venta</h1>
            <p className="text-muted-foreground">
              Registra una nueva venta en el sistema
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sección Cliente */}
        <Card>
          <CardHeader 
            className="cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setIsClientExpanded(!isClientExpanded)}
          >
            <div className="flex items-center justify-between">
              <CardTitle>Cliente </CardTitle>
              <ChevronDown 
                className={`h-5 w-5 transition-transform duration-200 ${
                  isClientExpanded ? 'rotate-180' : ''
                }`}
              />
            </div>
          </CardHeader>
          {isClientExpanded && (
            <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1" style={{ position: "relative" }}>
                <Label>Cliente</Label>
                <Input
                  ref={clienteInputRef}
                  placeholder="Buscar o escribir cliente..."
                  value={clienteInput}
                  onChange={(e) => handleClientInputChange(e.target.value)}
                  onKeyDown={handleClientKeyDown}
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
                />
                {showClienteDropdown &&
                  clients &&
                  clients.length > 0 &&
                  clienteInput && (
                    <ul
                      ref={dropdownClientRef}
                      style={{
                        position: "absolute",
                        zIndex: 10,
                        background: "white",
                        border: "1px solid #e5e7eb",
                        padding: 6,
                        borderRadius: 6,
                        width: "100%",
                        maxHeight: 180,
                        overflowY: "auto",
                        marginTop: 2,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      }}
                    >
                      {clients
                        .filter((c: any) =>
                          c.name
                            .toLowerCase()
                            .includes(clienteInput.toLowerCase())
                        )
                        .map((c: any, index: number) => (
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
                            }}
                            onMouseEnter={() => setHighlightedClientIndex(index)}
                            onMouseDown={() => {
                              handleSelectClient(c.id);
                              setClienteInput(c.name);
                              setShowClienteDropdown(false);
                              setHighlightedClientIndex(-1);
                              if (clienteInputRef.current)
                                clienteInputRef.current.blur();
                            }}
                          >
                            {c.name}
                          </li>
                        ))}
                    </ul>
                  )}
              </div>
              <div className="flex-1">
                <Label>Persona de contacto</Label>
                <Input
                  placeholder="Persona de contacto..."
                  value={personaContacto}
                  onChange={(e) => setPersonaContacto(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Dirección</Label>
                <Input
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CUIT</Label>
                <Input
                  value={cuit}
                  onChange={(e) => setCuit(e.target.value)}
                />
              </div>
            </div>

            {clienteInput && !cliente && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleCreateClient}
                  className="bg-gray-600 hover:bg-gray-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Cliente
                </Button>
           
              </div>
            )}
            </CardContent>
          )}
        </Card>

        {/* Búsqueda de productos - Nueva UI Híbrida */}
        <Card>
          <CardHeader>
            <CardTitle>Seleccionar Productos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filtros en una línea */}
            <div className="flex gap-3 items-center flex-wrap">
              {/* Búsqueda */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar productos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Categoría */}
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent className="max-h-48 overflow-y-auto">
                  <SelectItem value="all">Todas</SelectItem>
                  {categories?.map((category) => {
                    const typedCategory =
                      category as unknown as TProductCategory;
                    return (
                      <SelectItem
                        key={typedCategory.id}
                        value={typedCategory.id}
                      >
                        {typedCategory.name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {/* Stock */}
              {/* <Select value={selectedStock} onValueChange={setSelectedStock}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Stock" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="con_stock">Con Stock</SelectItem>
                  <SelectItem value="poco_stock">Poco Stock</SelectItem>
                  <SelectItem value="sin_stock">Sin Stock</SelectItem>
                </SelectContent>
              </Select> */}

              {/* Botón limpiar */}
              {(searchTerm || selectedCategory !== "") && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedCategory("");
                    setCurrentPage(1);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Limpiar
                </Button>
              )}

              {/* Botón agregar - solo cuando hay selección */}
              {/* {selectedProducts.size > 0 && ( */}
              <Button
                type="button"
                disabled={selectedProducts.size === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={handleAddSelectedProducts}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar ({selectedProducts.size})
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="bg-gray-600 hover:bg-gray-400 text-white"
                onClick={() => setShowManualItemDialog(true)}
              >
                <FileText className="h-4 w-4 mr-2" />
                Item Manual
              </Button>
            </div>

            {/* Contador de resultados */}
            <div className="text-sm text-muted-foreground">
              {sortedProducts?.length === products?.length
                ? `${products?.length || 0} productos disponibles`
                : `${sortedProducts?.length || 0} de ${
                    products?.length || 0
                  } productos`}
            </div>

            {/* Lista compacta de productos */}
            <div className="space-y-1 max-h-96 overflow-y-auto border rounded-lg p-2">
              {paginatedProducts?.map((product) => {
                const typedProduct = product as unknown as TProduct;
                const selectedVariant = typedProduct.variants?.find(
                  (v) => v.id === selectedVariants[typedProduct.id]
                );

                // Verificar si hay al menos una variante con stock
                const hasAvailableStock = typedProduct.variants?.some(
                  (v) => Number(v.stock) > 0
                );

                const stockColor = selectedVariant
                  ? Number(selectedVariant.stock) === 0
                    ? "text-red-500"
                    : Number(selectedVariant.stock) <= 5
                    ? "text-orange-500"
                    : "text-green-600"
                  : "text-gray-400";

                const isSelected = selectedProducts.has(typedProduct.id);
                const currentQuantity = (() => {
                  const existingItem = items.find(
                    (item) =>
                      item.product.id === typedProduct.id &&
                      item.variant?.id === selectedVariant?.id
                  );
                  if (existingItem) {
                    return existingItem.quantity;
                  }
                  return (
                    selectedQuantities[
                      `${typedProduct.id}-${selectedVariant?.id}`
                    ] || 0
                  );
                })();

                return (
                  <div
                    key={typedProduct.id}
                    className={`flex items-center gap-3 p-2 rounded-md transition-all ${
                      isSelected
                        ? "bg-blue-50 border border-blue-200"
                        : "hover:bg-gray-50"
                    } ${!hasAvailableStock ? "opacity-60" : ""}`}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      onChange={(e) => {
                        const newSelected = new Set(selectedProducts);
                        if (e.target.checked) {
                          newSelected.add(typedProduct.id);
                        } else {
                          newSelected.delete(typedProduct.id);
                        }
                        setSelectedProducts(newSelected);
                      }}
                      checked={isSelected}
                      disabled={!hasAvailableStock}
                    />

                    {/* Info del producto */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm truncate">
                            {typedProduct.name}
                          </h4>
                          {typedProduct.categories &&
                            typedProduct.categories.length > 0 && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">
                                {typedProduct.categories
                                  .map((id) => {
                                    const category = categories?.find(
                                      (c) =>
                                        (c as unknown as TProductCategory).id ===
                                        id
                                    );
                                    return category
                                      ? (category as unknown as TProductCategory)
                                          .name
                                      : "";
                                  })
                                  .filter(Boolean)[0] || "-"}
                              </span>
                            )}
                          {/* Indicador de popularidad */}
                          {(typedProduct as any).totalSales > 0 && (
                            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded whitespace-nowrap">
                              🔥 {(typedProduct as any).totalSales} vendidos
                            </span>
                          )}
                        </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span>
                          {/* Stock:{" "}
                          <span className={stockColor}>
                            {selectedVariant?.stock === Infinity
                              ? "∞"
                              : selectedVariant?.stock || 0}
                          </span> */}
                        </span>
                        {selectedVariant && (
                          <>
                            {/* <span>•</span> */}
                            <span className="font-medium">
                              {formatearPrecio(Number(selectedVariant.price))}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Medida */}
                    <div className="w-[150px]">
                      <Select
                        onValueChange={(variantId) => {
                          handleVariantChange(typedProduct.id, variantId);
                        }}
                        value={selectedVariants[typedProduct.id]}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Medida" />
                        </SelectTrigger>
                        <SelectContent className="max-h-48 overflow-y-auto">
                          {typedProduct.variants?.map((variant) => (
                            <SelectItem
                              key={variant.id}
                              value={variant.id}
                              disabled={Number(variant.stock) === 0}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>{variant.size}</span>
                                <span
                                  className={`text-xs ml-2 ${
                                    Number(variant.stock) === 0
                                      ? "text-red-500"
                                      : Number(variant.stock) <= 5
                                      ? "text-orange-500"
                                      : "text-green-600"
                                  }`}
                                >
                                  {variant.stock === Infinity
                                    ? "∞"
                                    : variant.stock}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Cantidad */}
                    <div className="w-16">
                      <Input
                        type="number"
                        min="0"
                        max={
                          selectedVariant ? Number(selectedVariant.stock) : 1
                        }
                        value={currentQuantity}
                        onChange={(e) => {
                          if (!isSelected) return;

                          const newValue = parseInt(e.target.value);
                          if (!selectedVariant) return;

                          if (
                            newValue >= 0 &&
                            newValue <= Number(selectedVariant.stock)
                          ) {
                            handleQuantityChange(
                              typedProduct.id,
                              selectedVariant.id,
                              newValue
                            );
                          }
                        }}
                        disabled={!isSelected}
                        className="h-8 text-xs text-center"
                        placeholder="0"
                      />
                    </div>

                    {/* Preview del total */}
                    {isSelected && currentQuantity > 0 && selectedVariant && (
                      <div className="w-20 text-right">
                        <span className="text-sm font-medium text-green-600">
                          {formatearPrecio(
                            Number(selectedVariant.price) * currentQuantity
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {paginatedProducts?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No se encontraron productos</p>
                  <p className="text-sm">
                    Intenta ajustar los filtros de búsqueda
                  </p>
                </div>
              )}
            </div>

            {/* Paginación compacta */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm pt-2 border-t">
                <div className="text-muted-foreground">
                  {startIndex + 1}-
                  {Math.min(endIndex, sortedProducts?.length || 0)} de{" "}
                  {sortedProducts?.length}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-xs px-2">
                    {currentPage}/{totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Productos seleccionados */}
        {items.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Productos Seleccionados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{item.product.name}</p>
                      <p className="text-sm text-gray-500">
                        {item.variant.size} | {formatearPrecio(item.unitPrice)}{" "}
                        c/u
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleQuantityChange(
                              item.product.id,
                              item.variant.id,
                              item.quantity - 1
                            )
                          }
                          disabled={item.quantity <= 1}
                        >
                          -
                        </Button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleQuantityChange(
                              item.product.id,
                              item.variant.id,
                              item.quantity + 1
                            )
                          }
                        >
                          +
                        </Button>
                      </div>
                      <p className="w-24 text-right">
                        {formatearPrecio(item.total)}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="border-t pt-4">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-gray-700">Subtotal</p>
                      <p className="font-semibold">
                        {formatearPrecio(subtotal)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="applyIVA"
                          checked={applyIVA}
                          onCheckedChange={(checked) =>
                            setApplyIVA(checked as boolean)
                          }
                          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                        <Label
                          htmlFor="applyIVA"
                          className="text-sm text-gray-700"
                        >
                          Desglosar IVA ({taxRate}%)
                        </Label>
                      </div>
                      <p className="text-sm text-gray-600">
                        {applyIVA ? `${formatearPrecio(taxAmount)}` : "$ 0,00"}
                      </p>
                    </div>

                    {applyIVA && (
                      <div className="flex justify-between items-center text-sm pl-6">
                        <p className="text-gray-600">Subtotal sin IVA</p>
                        <p className="font-medium">
                          {formatearPrecio(subtotalSinIVA)}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Label
                          htmlFor="discount"
                          className="text-sm text-gray-700 w-24"
                        >
                          Descuento (%)
                        </Label>
                        <Input
                          id="discount"
                          type="number"
                          min="0"
                          max="100"
                          value={discountPercentage}
                          onChange={(e) =>
                            setDiscountPercentage(Number(e.target.value))
                          }
                          className="w-16 h-8 text-center text-sm"
                          placeholder="0"
                        />
                      </div>
                      <p className="text-red-600">
                        -{formatearPrecio(discountAmount)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Label
                          htmlFor="manualDiscount"
                          className="text-sm text-gray-700 w-24"
                        >
                          Descuento ($)
                        </Label>
                        <Input
                          id="manualDiscount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={manualDiscount}
                          onChange={(e) =>
                            setManualDiscount(Number(e.target.value))
                          }
                          className="w-20 h-8 text-center text-sm"
                          placeholder="0"
                        />
                      </div>
                      <p className="text-red-600">
                        -{formatearPrecio(manualDiscount)}
                      </p>
                    </div>

                    <div className="border-t pt-3">
                      <div className="flex justify-between items-center">
                        <p className="text-lg font-semibold">Total</p>
                        <p className="text-xl font-bold">
                          {formatearPrecio(redondearADecena(total))}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dialog para Item Manual */}
        <Dialog
          open={showManualItemDialog}
          onOpenChange={setShowManualItemDialog}
        >
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
                    value={manualItem.unitPrice || ""}
                    onChange={(e) =>
                      setManualItem((prev) => ({
                        ...prev,
                        unitPrice: parseFloat(e.target.value) || 0,
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
                  value={manualItem.discount || ""}
                  onChange={(e) =>
                    setManualItem((prev) => ({
                      ...prev,
                      discount: parseFloat(e.target.value) || 0,
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
                type="button"
                variant="outline"
                onClick={() => setShowManualItemDialog(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
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

        {/* Detalles de pago */}
        <Card>
          <CardHeader>
            <CardTitle>Detalles de Pago</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Método de Pago</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(value) =>
                      setPaymentMethod(value as EPaymentMethod)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar método de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EPaymentMethod.CASH}>
                        Efectivo
                      </SelectItem>
                      <SelectItem value={EPaymentMethod.CREDIT_CARD}>
                        Tarjeta de Crédito
                      </SelectItem>
                      <SelectItem value={EPaymentMethod.DEBIT_CARD}>
                        Tarjeta de Débito
                      </SelectItem>
                      <SelectItem value={EPaymentMethod.TRANSFER}>
                        Transferencia
                      </SelectItem>
                      <SelectItem value={EPaymentMethod.MERCADOPAGO}>
                        MercadoPago
                      </SelectItem>
                      <SelectItem value={EPaymentMethod.CHECK}>
                        Cheque
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {paymentMethod === EPaymentMethod.TRANSFER && (
                  <div className="space-y-2">
                    <Label htmlFor="bank">Banco</Label>
                    <Select value={bank} onValueChange={setBank}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar banco" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Galicia">Galicia</SelectItem>
                        <SelectItem value="Frances">Frances</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {isInvoiced && (
                <div className="space-y-2">
                  <Label htmlFor="invoiceNumber">Número de Factura</Label>
                  <Input
                    id="invoiceNumber"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Ingrese el número de factura"
                  />
                </div>
              )}

              {/* Sistema de Múltiples Facturas */}
              <div className="border-t pt-4 space-y-4">
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
                        className="flex items-center justify-between p-3 bg-slate-50 border rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {factura.tipo} - {factura.numero}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDateString(factura.fecha)}
                            {factura.monto && ` - $${factura.monto.toFixed(2)}`}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditFactura(factura.id)}
                            className="h-8 w-8"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteFactura(factura.id)}
                            className="h-8 w-8 text-red-500 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Formulario agregar/editar factura */}
                {showAddFactura && (
                  <div className="border rounded-lg p-4 bg-blue-50 space-y-3">
                    <h5 className="font-medium text-sm">
                      {editingFacturaId ? "Editar Factura" : "Nueva Factura"}
                    </h5>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Tipo *</Label>
                        <Select
                          value={newFacturaTipo}
                          onValueChange={setNewFacturaTipo}
                        >
                          <SelectTrigger className={newFacturaTipo ? " text-black" : " text-gray-500"}>
                            <SelectValue placeholder="Tipo de factura" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Factura A">Factura A</SelectItem>
                            <SelectItem value="Factura B">Factura B</SelectItem>                   
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Número *</Label>
                        <Input
                          value={newFacturaNumero}
                          onChange={(e) => setNewFacturaNumero(e.target.value)}
                          placeholder="0000-00000000"
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Fecha *</Label>
                        <Input
                          type="date"
                          value={newFacturaFecha}
                          onChange={(e) => setNewFacturaFecha(e.target.value)}
                          className={newFacturaFecha ? " text-black" : " text-gray-500"}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Monto</Label>
                        <Input
                          type="number"
                          value={newFacturaMonto}
                          onChange={(e) => setNewFacturaMonto(e.target.value)}
                          placeholder="0.00"
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCancelFactura}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddFactura}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {editingFacturaId ? "Actualizar" : "Agregar"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer con botones */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Registrando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Registrar Venta
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
