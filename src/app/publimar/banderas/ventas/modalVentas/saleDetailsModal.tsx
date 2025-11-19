"use client";
import { useFirestore, useFirestoreDocData } from "reactfire";
import {
  doc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TSale, TSaleItem, EPaymentMethod, TFactura } from "@/types/sale";
import collections from "@/lib/collections";
import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TProduct, TProductCategory } from "@/types/product";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  formatearPrecio,
  redondearTotal,
  redondearADecena,
  formatDateString,
} from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Edit,
  Save,
  X,
  Search,
  Filter,
  Trash2,
  Plus,
  Pencil,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { useClients } from "@/hooks/useClients";

const BANCOS = ["Galicia", "Frances"];

interface SaleDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
  onSuccess: () => void;
}

export function SaleDetailsModal({
  open,
  onOpenChange,
  saleId,
  onSuccess,
}: SaleDetailsModalProps) {
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [products, setProducts] = useState<Record<string, TProduct>>({});
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [items, setItems] = useState<TSaleItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<EPaymentMethod | null>(
    null
  );
  const [isInvoiced, setIsInvoiced] = useState<boolean | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [total, setTotal] = useState(0);
  const [subtotal, setSubtotal] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [subtotalSinIVA, setSubtotalSinIVA] = useState(0);
  const [applyIVA, setApplyIVA] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [manualDiscount, setManualDiscount] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [categories, setCategories] = useState<
    Record<string, TProductCategory>
  >({});

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
  const [clientName, setClientName] = useState<string>("");
  const [contactName, setContactName] = useState<string>("");
  const [clientAddress, setClientAddress] = useState<string>("");
  const [clientEmail, setClientEmail] = useState<string>("");
  const [clientPhone, setClientPhone] = useState<string>("");
  const [clientCuit, setClientCuit] = useState<string>("");

  // Estados para el dialog de cliente
  const [showClientDialog, setShowClientDialog] = useState(false);
  const [clienteInput, setClienteInput] = useState("");
  const [cliente, setCliente] = useState("");
  const [personaContacto, setPersonaContacto] = useState("");
  const [direccion, setDireccion] = useState("");
  const [email, setEmail] = useState("");
  const [cuit, setCuit] = useState("");
  const [telefono, setTelefono] = useState("");
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [highlightedClientIndex, setHighlightedClientIndex] = useState(-1);

  // Hook de clientes
  const { 
    clients, 
    loading: clientsLoading,
    createClient 
  } = useClients();

  // Estado para fecha editable
  const [editedDate, setEditedDate] = useState<string>("");

  const saleRef = saleId ? doc(firestore, collections.SALES, saleId) : null;
  const { data: sale } = useFirestoreDocData(
    saleRef ?? doc(firestore, collections.SALES, "dummy"),
    {
      idField: "id",
    }
  );

  const typedSale = sale as unknown as TSale;

  useEffect(() => {
    if (open) {
      loadProducts();
      loadCategories();
      if (typedSale?.items) {
        setItems(typedSale.items);

        // Inicializar valores desde la venta guardada
        setApplyIVA(typedSale.applyIVA || false);
        setDiscountPercentage(typedSale.discountPercentage || 0);
        setManualDiscount(typedSale.manualDiscount || 0);

        // Calcular totales usando la misma lógica que newSaleModal
        calculateTotals(
          typedSale.items,
          typedSale.applyIVA || false,
          typedSale.discountPercentage || 0,
          typedSale.manualDiscount || 0
        );
      }
      if (typedSale?.paymentMethod) {
        setPaymentMethod(typedSale.paymentMethod);
      }
      if (typedSale?.isInvoiced !== undefined) {
        setIsInvoiced(typedSale.isInvoiced);
      }
      if (typedSale?.invoiceNumber) {
        setInvoiceNumber(typedSale.invoiceNumber);
      }
      if (typedSale?.bank) {
        setSelectedBank(typedSale.bank);
      }

      // Inicializar fecha editable
      if (typedSale?.createdAt) {
        try {
          const date =
            typeof typedSale.createdAt === "object" &&
            "seconds" in typedSale.createdAt
              ? new Date((typedSale.createdAt as any).seconds * 1000)
              : new Date(typedSale.createdAt);
          setEditedDate(date.toISOString().split("T")[0]);
        } catch (error) {
          console.error("Error al parsear fecha:", error);
        }
      }

      // Cargar datos del cliente
      if (typedSale?.clientName) {
        setClientName(typedSale.clientName);
      }
      if (typedSale?.contact) {
        setContactName((typedSale.contact as any)?.name || "");
      }
      if (typedSale?.direccion) {
        setClientAddress(typedSale.direccion);
      }
      if (typedSale?.email) {
        setClientEmail(typedSale.email);
      }
      if (typedSale?.telefono) {
        setClientPhone(typedSale.telefono);
      }
      if (typedSale?.cuit) {
        setClientCuit(typedSale.cuit);
      }

      // Cargar facturas existentes o migrar del sistema antiguo
      if (typedSale?.facturas && typedSale.facturas.length > 0) {
        setFacturas(typedSale.facturas);
      } else {
        // Migrar datos de factura antigua si existen
        if (typedSale?.invoiceNumber) {
          const facturaLegacy: TFactura = {
            id: `factura-legacy-${Date.now()}`,
            tipo: "Factura B", // Valor por defecto
            numero: typedSale.invoiceNumber,
            fecha: typedSale.createdAt
              ? new Date(typedSale.createdAt).toISOString().split("T")[0]
              : "",
          };
          setFacturas([facturaLegacy]);
        } else {
          setFacturas([]);
        }
      }
    }
  }, [open, typedSale]);

  const loadProducts = async () => {
    try {
      const productsCollection = collection(firestore, collections.PRODUCTS);
      const productsSnapshot = await getDocs(productsCollection);
      const productsMap: Record<string, TProduct> = {};
      productsSnapshot.forEach((doc) => {
        const product = doc.data() as TProduct;
        productsMap[doc.id] = product;
      });
      setProducts(productsMap);
    } catch (error) {
      console.error("Error al cargar productos:", error);
    }
  };

  const loadCategories = async () => {
    try {
      const categoriesCollection = collection(
        firestore,
        collections.products.CATEGORIES
      );
      const categoriesSnapshot = await getDocs(categoriesCollection);
      const categoriesMap: Record<string, TProductCategory> = {};
      categoriesSnapshot.forEach((doc) => {
        const category = doc.data() as TProductCategory;
        categoriesMap[doc.id] = category;
      });
      setCategories(categoriesMap);
    } catch (error) {
      console.error("Error al cargar categorías:", error);
    }
  };

  const calculateSubtotal = (itemsToCalculate: TSaleItem[]) => {
    return itemsToCalculate.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTotals = (
    itemsToCalculate: TSaleItem[],
    shouldApplyIVA: boolean,
    discountPerc: number,
    manualDisc: number
  ) => {
    const initialSubtotal = calculateSubtotal(itemsToCalculate);
    const taxRate = 21; // IVA del 21%

    // El IVA siempre se calcula sobre el subtotal ORIGINAL (antes de descuentos)
    let calculatedTaxAmount = 0;
    let calculatedSubtotalSinIVA = initialSubtotal;

    if (shouldApplyIVA) {
      // Si aplicamos IVA, los precios son finales (con IVA incluido)
      // Calculamos el IVA que está incluido en el subtotal ORIGINAL
      calculatedTaxAmount = redondearTotal(
        initialSubtotal * (taxRate / (100 + taxRate))
      );
      calculatedSubtotalSinIVA = redondearTotal(
        initialSubtotal - calculatedTaxAmount
      );
    }

    // Los descuentos se calculan sobre el subtotal completo (con IVA incluido)
    const calculatedDiscountAmount = redondearTotal(
      initialSubtotal * (discountPerc / 100)
    );
    const totalAfterDiscounts = redondearTotal(
      initialSubtotal - calculatedDiscountAmount - manualDisc
    );

    setSubtotal(initialSubtotal);
    setTaxAmount(calculatedTaxAmount);
    setSubtotalSinIVA(calculatedSubtotalSinIVA);
    setDiscountAmount(calculatedDiscountAmount);
    setTotal(totalAfterDiscounts);
  };

  const handleAddItem = () => {
    if (!selectedProduct || !selectedVariant || quantity <= 0 || unitPrice <= 0)
      return;

    const newItem: TSaleItem = {
      description: products[selectedProduct]?.description || "",
      productId: selectedProduct,
      variantId: selectedVariant,
      productName: products[selectedProduct]?.name,
      variantName: getVariantSize(selectedVariant),
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    
      // variantName: undefined
    };

    const newItems = [...items, newItem];
    calculateTotals(newItems, applyIVA, discountPercentage, manualDiscount);
    setItems(newItems);
    setSelectedProduct("");
    setSelectedVariant("");
    setQuantity(1);
    setUnitPrice(0);
  };

  const handleAddManualItem = () => {
    if (!manualItem.productName || !manualItem.unitPrice) {
      toast.error("Nombre y precio son requeridos");
      return;
    }

    const itemSubtotal =
      manualItem.unitPrice *
      manualItem.quantity *
      (1 - manualItem.discount / 100);

    const newItem: TSaleItem = {
      productId: `manual-${Date.now()}`,
      variantId: `manual-variant-${Date.now()}`,
      productName: manualItem.productName,
      description: manualItem.description,
      variantName: manualItem.variantName || "N/A",
      quantity: manualItem.quantity,
      unitPrice: manualItem.unitPrice,
      total: itemSubtotal,
      isManual: true,
    };

    const newItems = [...items, newItem];
    calculateTotals(newItems, applyIVA, discountPercentage, manualDiscount);
    setItems(newItems);

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

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    calculateTotals(newItems, applyIVA, discountPercentage, manualDiscount);
    setItems(newItems);
  };

  const handleIVAChange = (checked: boolean) => {
    setApplyIVA(checked);
    calculateTotals(items, checked, discountPercentage, manualDiscount);
  };

  const handleDiscountPercentageChange = (newPercentage: number) => {
    setDiscountPercentage(newPercentage);
    calculateTotals(items, applyIVA, newPercentage, manualDiscount);
  };

  const handleManualDiscountChange = (newManualDiscount: number) => {
    setManualDiscount(newManualDiscount);
    calculateTotals(items, applyIVA, discountPercentage, newManualDiscount);
  };

  // Funciones para manejar facturas
  const handleAddFactura = () => {
    if (!newFacturaTipo || !newFacturaNumero || !newFacturaFecha) {
      toast.error("Tipo, Número y Fecha son requeridos");
      return;
    }

    if (editingFacturaId) {
      // Editar factura existente
      setFacturas((prev) =>
        prev.map((f) =>
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
      setFacturas((prev) => [...prev, nuevaFactura]);
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

  const handleDeleteFactura = (id: string) => {
    setFacturas((prev) => prev.filter((f) => f.id !== id));
    toast.success("Factura eliminada correctamente");
  };

  // Funciones para manejar el cliente
  const handleOpenClientDialog = () => {
    // Precargar datos actuales del cliente si existen
    setClienteInput(clientName || "");
    setPersonaContacto(contactName || "");
    setDireccion(clientAddress || "");
    setEmail(clientEmail || "");
    setTelefono(clientPhone || "");
    setCuit(clientCuit || "");
    setShowClientDialog(true);
  };

  const handleSelectClient = (clientId: string) => {
    setCliente(clientId);
    const selectedClient = clients?.find((c: any) => c.id === clientId);
    if (selectedClient) {
      setPersonaContacto(selectedClient.contacts?.[0]?.name || "");
      setDireccion(selectedClient.address || "");
      setEmail(selectedClient.email || "");
      setTelefono(selectedClient.phone || "");
      setCuit(selectedClient.cuit || "");
    }
  };

  const handleClientInputChange = (value: string) => {
    setClienteInput(value);
    setShowClienteDropdown(true);
    setHighlightedClientIndex(-1);
    const clientExists = clients?.some(
      (c: any) => c.name.toLowerCase().trim() === value.toLowerCase().trim()
    );
    if (!clientExists) {
      setCliente("");
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
    }
  };

  const handleCreateClient = async () => {
    if (!clienteInput.trim()) {
      toast.error("El nombre del cliente es requerido");
      return;
    }

    try {
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
      setCliente(newClientId);
      setShowClienteDropdown(false);
      toast.success(`Cliente "${clienteInput}" creado exitosamente`);
    } catch (error) {
      console.error('Error al crear cliente:', error);
      toast.error("Error al crear el cliente");
    }
  };

  const handleSaveClient = () => {
    // Actualizar los estados locales con los datos del cliente
    setClientName(clienteInput || "");
    setContactName(personaContacto || "");
    setClientAddress(direccion || "");
    setClientEmail(email || "");
    setClientPhone(telefono || "");
    setClientCuit(cuit || "");
    
    // Cerrar el dialog
    setShowClientDialog(false);
    toast.success("Cliente actualizado correctamente");
  };

  const handleCancelFactura = () => {
    setNewFacturaTipo("");
    setNewFacturaNumero("");
    setNewFacturaFecha("");
    setNewFacturaMonto("");
    setShowAddFactura(false);
    setEditingFacturaId(null);
  };

  const clearModalStates = () => {
    // Limpiar estados de edición
    setIsEditing(false);
    setIsLoading(false);

    // Limpiar productos y búsqueda
    setProducts({});
    setSelectedProduct("");
    setSelectedVariant("");
    setQuantity(1);
    setUnitPrice(0);
    setSearchTerm("");
    setSelectedCategory("all");
    setCategories({});

    // Limpiar items y totales
    setItems([]);
    setTotal(0);
    setSubtotal(0);
    setTaxAmount(0);
    setSubtotalSinIVA(0);
    setApplyIVA(false);
    setDiscountPercentage(0);
    setDiscountAmount(0);
    setManualDiscount(0);

    // Limpiar datos de pago
    setPaymentMethod(null);
    setIsInvoiced(null);
    setInvoiceNumber("");
    setSelectedBank("");

    // Limpiar facturas
    setFacturas([]);
    setShowAddFactura(false);
    setEditingFacturaId(null);
    setNewFacturaTipo("");
    setNewFacturaNumero("");
    setNewFacturaFecha("");
    setNewFacturaMonto("");

    // Limpiar fecha editada
    setEditedDate("");
  };

  const handleModalClose = (open: boolean) => {
    if (!open) {
      clearModalStates();
    }
    onOpenChange(open);
  };

  const handleSave = async () => {
    if (!saleRef || !saleId) return;

    setIsLoading(true);
    try {
      const updateData: Partial<TSale> = {
        items,
        subtotal: redondearTotal(applyIVA ? subtotalSinIVA : subtotal),
        total: redondearTotal(total),
        // Información de IVA
        applyIVA,
        taxRate: 21,
        taxAmount: redondearTotal(taxAmount),
        // Información de descuentos
        discountPercentage,
        discountAmount: redondearTotal(discountAmount),
        manualDiscount: redondearTotal(manualDiscount),
        // Sistema de múltiples facturas
        facturas: facturas.length > 0 ? facturas : [],
      };
      
      // Fecha editada (mismo formato que facturas)
      if (editedDate) {
        updateData.updatedAt = serverTimestamp() as unknown as Date;
      }
      if (paymentMethod) {
        updateData.paymentMethod = paymentMethod;
        if (paymentMethod === EPaymentMethod.TRANSFER && selectedBank) {
          updateData.bank = selectedBank;
        }
      }
      if (isInvoiced !== null) {
        updateData.isInvoiced = isInvoiced;
        if (isInvoiced && invoiceNumber) {
          updateData.invoiceNumber = invoiceNumber;
        }
      }
      // Datos del cliente
      if (clientName) {
        updateData.clientName = clientName;
      }
      if (contactName) {
        updateData.contact = { name: contactName };
      }
      if (clientAddress) {
        updateData.direccion = clientAddress;
      }
      if (clientEmail) {
        updateData.email = clientEmail;
      }
      if (clientPhone) {
        updateData.telefono = clientPhone;
      }
      if (clientCuit) {
        updateData.cuit = clientCuit;
      }

      await updateDoc(saleRef, updateData);
      toast.success("Venta actualizada correctamente");
      onSuccess();
      setIsEditing(false);
    } catch (error) {
      console.error("Error al actualizar la venta:", error);
      toast.error("Error al actualizar la venta");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSale = async () => {
    if (!saleRef || !saleId) return;

    const confirmDelete = window.confirm(
      "¿Está seguro que desea eliminar esta venta? Esta acción no se puede deshacer."
    );

    if (!confirmDelete) return;

    setIsLoading(true);
    try {
      await deleteDoc(saleRef);
      toast.success("Venta eliminada correctamente");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error al eliminar la venta:", error);
      toast.error("Error al eliminar la venta");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVariantChange = (variantId: string) => {
    setSelectedVariant(variantId);
    if (selectedProduct && variantId) {
      const product = products[selectedProduct];
      const variant = product?.variants.find((v) => v.id === variantId);
      if (variant?.price) {
        setUnitPrice(Number(variant.price));
      }
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "-";
    try {
      if (typeof timestamp === "object" && "seconds" in timestamp) {
        return new Date(timestamp.seconds * 1000).toLocaleDateString();
      }
      return new Date(timestamp).toLocaleDateString();
    } catch (error) {
      console.error("Error al formatear fecha:", error);
      return "-";
    }
  };

  const formatPaymentMethod = (method: EPaymentMethod) => {
    switch (method) {
      case EPaymentMethod.CASH:
        return "Efectivo";
      case EPaymentMethod.CREDIT_CARD:
        return "Tarjeta de Crédito";
      case EPaymentMethod.DEBIT_CARD:
        return "Tarjeta de Débito";
      case EPaymentMethod.TRANSFER:
        return "Transferencia";
      case EPaymentMethod.MERCADOPAGO:
        return "MercadoPago";
      case EPaymentMethod.CHECK:
        return "Cheque";
      default:
        return method;
    }
  };

  const getVariantName = (productId: string, variantId: string) => {
    const product = products[productId];
    if (!product) return "Variante no encontrada";
    const variant = product.variants.find((v) => v.id === variantId);

    return variant ? `${variant.id}` : "Variante no encontrada";
  };

  const getVariantSize = (variantId: string) => {
    // Buscar en todos los productos hasta encontrar la variante
    for (const product of Object.values(products)) {
      const variant = product.variants?.find((v) => v.id === variantId);
      if (variant) {
        return variant.size;
      }
    }
    return "Sin variante";
  };

  // Filtrar productos basado en el término de búsqueda y categoría
  const filteredProducts = Object.entries(products).filter(([_, product]) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = product.name.toLowerCase().includes(searchLower);
    const matchesCategory =
      selectedCategory === "all" ||
      product.categories.includes(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  const getCategoryName = (categoryId: string) => {
    return categories[categoryId]?.name || "Sin categoría";
  };

  if (!saleId) {
    return null;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleModalClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>Venta #{typedSale?.number}</DialogTitle>
            {!isEditing ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                >
                  <Edit className="h-4 w-4" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteSale}
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  {/* <X className="h-4 w-4" /> */}
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  form="edit-quote-form"
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  size="sm"
                  onClick={handleSave}
                >
                  <Save className="h-4 w-4" />
                  Guardar
                </Button>
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2">
            <div className="grid gap-6 py-4">
              {/* Información del Cliente
            {clientName && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-semibold mb-4 text-blue-900">Cliente</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p>
                      <span className="font-medium">Nombre:</span> {clientName}
                    </p>
                  </div>
                  {contactName && (
                    <div>
                      <p>
                        <span className="font-medium">Contacto:</span> {contactName}
                      </p>
                    </div>
                  )}
                  {clientAddress && (
                    <div>
                      <p>
                        <span className="font-medium">Dirección:</span> {clientAddress}
                      </p>
                    </div>
                  )}
                  {clientEmail && (
                    <div>
                      <p>
                        <span className="font-medium">Email:</span> {clientEmail}
                      </p>
                    </div>
                  )}
                  {clientPhone && (
                    <div>
                      <p>
                        <span className="font-medium">Teléfono:</span> {clientPhone}
                      </p>
                    </div>
                  )}
                  {clientCuit && (
                    <div>
                      <p>
                        <span className="font-medium">CUIT:</span> {clientCuit}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )} */}

              <div className="bg-slate-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-4">Información General</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="space-y-2">
                      {isEditing ? (
                        <div>
                          <label className="text-sm font-medium">
                            Fecha de la Venta
                          </label>
                          <Input
                            type="date"
                            value={editedDate}
                            onChange={(e) => setEditedDate(e.target.value)}
                            className="w-full mt-1"
                          />
                        </div>
                      ) : (
                        <p>
                          <span className="font-medium">Fecha:</span>{" "}
                          {formatDate(typedSale?.createdAt)}
                        </p>
                      )}

                      {isEditing ? (
                        <div>
                          <label className="text-sm font-medium">
                            Método de Pago
                          </label>
                          <Select
                            value={paymentMethod || ""}
                            onValueChange={(value) =>
                              setPaymentMethod(value as EPaymentMethod)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar método de pago" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.values(EPaymentMethod).map((method) => (
                                <SelectItem key={method} value={method}>
                                  {formatPaymentMethod(method)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <p>
                          <span className="font-medium">Método de Pago:</span>{" "}
                          {formatPaymentMethod(typedSale?.paymentMethod)}
                        </p>
                      )}

                      {isEditing &&
                        paymentMethod === EPaymentMethod.TRANSFER && (
                          <div>
                            <label className="text-sm font-medium">Banco</label>
                            <Select
                              value={selectedBank}
                              onValueChange={setSelectedBank}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar banco" />
                              </SelectTrigger>
                              <SelectContent>
                                {BANCOS.map((banco) => (
                                  <SelectItem key={banco} value={banco}>
                                    {banco}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                      {!isEditing &&
                        typedSale?.paymentMethod === EPaymentMethod.TRANSFER &&
                        typedSale?.bank && (
                          <p>
                            <span className="font-medium">Banco:</span>{" "}
                            {typedSale.bank}
                          </p>
                        )}
                      {!isEditing && typedSale?.clientName && (
                        <p>
                          <span className="font-medium">Cliente:</span>{" "}
                          {typedSale.clientName}
                        </p>
                      )}
                      {isEditing && (
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium">Cliente:</Label>
                          <div className="flex-1">
                            <Input
                              value={clientName || ""}
                              placeholder="Sin cliente"
                              readOnly
                              className="bg-gray-50"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleOpenClientDialog}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            {clientName ? "Editar" : "Agregar"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    {/* Sistema de Múltiples Facturas */}
                    <div className="border-t pt-4 space-y-4 mb-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Facturas</h4>
                        {isEditing && (
                          <Button
                            type="button"
                            onClick={() => setShowAddFactura(true)}
                            className="bg-blue-600 hover:bg-blue-700"
                            size="sm"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Agregar
                          </Button>
                        )}
                      </div>

                      {/* Lista de facturas */}
                      {facturas.length > 0 && (
                        <div className="space-y-2">
                          {facturas.map((factura) => (
                            <div
                              key={factura.id}
                              className="flex items-center justify-between p-3 bg-white border rounded-lg"
                            >
                              <div className="flex-1">
                                <p className="text-sm font-medium">
                                  {factura.tipo} - {factura.numero}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatDateString(factura.fecha)}
                                  {factura.monto &&
                                    ` - ${formatearPrecio(factura.monto)}`}
                                </p>
                              </div>
                              {isEditing && (
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      handleEditFactura(factura.id)
                                    }
                                    className="h-8 w-8"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      handleDeleteFactura(factura.id)
                                    }
                                    className="h-8 w-8 text-red-500 hover:text-red-700"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Formulario agregar/editar factura */}
                      {isEditing && showAddFactura && (
                        <div className="border rounded-lg p-4 bg-blue-50 space-y-3">
                          <h5 className="font-medium text-sm">
                            {editingFacturaId
                              ? "Editar Factura"
                              : "Nueva Factura"}
                          </h5>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Tipo</Label>
                              <Select
                                value={newFacturaTipo}
                                onValueChange={setNewFacturaTipo}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Tipo" />
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
                            <div>
                              <Label className="text-xs">Número</Label>
                              <Input
                                value={newFacturaNumero}
                                onChange={(e) =>
                                  setNewFacturaNumero(e.target.value)
                                }
                                placeholder="0000-00000000"
                                className="h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Fecha</Label>
                              <Input
                                type="date"
                                value={newFacturaFecha}
                                onChange={(e) =>
                                  setNewFacturaFecha(e.target.value)
                                }
                                className="h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Monto</Label>
                              <Input
                                type="number"
                                value={newFacturaMonto}
                                onChange={(e) =>
                                  setNewFacturaMonto(e.target.value)
                                }
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

                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <p>Subtotal</p>
                        <p>{formatearPrecio(subtotal)}</p>
                      </div>

                      <div className="flex items-center justify-between border-b pb-2">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id="applyIVA"
                            checked={applyIVA}
                            onCheckedChange={handleIVAChange}
                            disabled={!isEditing}
                            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                          />
                          <Label htmlFor="applyIVA" className="text-sm">
                            Desglosa IVA (21%)
                          </Label>
                        </div>
                        <p className="text-sm">
                          {applyIVA
                            ? `${formatearPrecio(taxAmount)}`
                            : "$ 0,00"}
                        </p>
                      </div>

                      {applyIVA && (
                        <div className="flex justify-between items-center text-sm pl-6">
                          <p>Subtotal sin IVA</p>
                          <p>{formatearPrecio(subtotalSinIVA)}</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Label htmlFor="discount" className="text-sm w-24">
                            Descuento (%)
                          </Label>
                          <Input
                            id="discount"
                            type="number"
                            min="0"
                            max="100"
                            value={discountPercentage}
                            onChange={(e) =>
                              handleDiscountPercentageChange(
                                Number(e.target.value)
                              )
                            }
                            disabled={!isEditing}
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
                            className="text-sm w-24"
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
                              handleManualDiscountChange(Number(e.target.value))
                            }
                            disabled={!isEditing}
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
                          <p className="text-lg">Total</p>
                          <p className="text-xl">
                            {formatearPrecio(redondearADecena(total))}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-4">Productos</h3>
                {isEditing && (
                  <div className="mb-4 p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">Agregar Producto</h4>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Filtrar por categoría
                        </label>
                        <Select
                          value={selectedCategory}
                          onValueChange={setSelectedCategory}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Todas las categorías" />
                          </SelectTrigger>
                          <SelectContent className="max-h-48 overflow-y-auto">
                            <SelectItem value="all">
                              Todas las categorías
                            </SelectItem>
                            {Object.entries(categories).map(
                              ([id, category]) => (
                                <SelectItem key={id} value={id}>
                                  {category.name}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="relative">
                        <label className="text-sm font-medium mb-2 block">
                          Buscar productos
                        </label>
                        <Search className="absolute left-2 top-8 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar por nombre..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <label className="text-sm font-medium">Producto</label>
                        <Select
                          value={selectedProduct}
                          onValueChange={setSelectedProduct}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar producto" />
                          </SelectTrigger>
                          <SelectContent className="max-h-48 overflow-y-auto">
                            {filteredProducts.map(([id, product]) => {
                              const hasStock =
                                product?.variants?.some(
                                  (variant) => Number(variant.stock) > 0
                                ) ?? false;
                              return (
                                <SelectItem
                                  key={id}
                                  value={id}
                                  disabled={!hasStock}
                                  className={
                                    !hasStock
                                      ? "opacity-50 cursor-not-allowed"
                                      : ""
                                  }
                                >
                                  <div className="flex flex-col">
                                    <span>
                                      {product?.name || "Producto sin nombre"}
                                    </span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Variante</label>
                        <Select
                          value={selectedVariant}
                          onValueChange={handleVariantChange}
                          disabled={!selectedProduct}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar variante" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedProduct &&
                              products[selectedProduct]?.variants.map(
                                (variant) => (
                                  <SelectItem
                                    key={variant.id}
                                    value={variant.id}
                                    disabled={Number(variant.stock) <= 0}
                                    className={
                                      Number(variant.stock) <= 0
                                        ? "opacity-50 cursor-not-allowed"
                                        : ""
                                    }
                                  >
                                    {variant.size}{" "}
                                    {Number(variant.stock) <= 0 &&
                                      "(Sin stock)"}
                                  </SelectItem>
                                )
                              )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Cantidad</label>
                        <Input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(e) => setQuantity(Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">
                          Precio Unitario
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={unitPrice}
                          onChange={(e) => setUnitPrice(Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button
                        onClick={handleAddItem}
                        disabled={
                          !selectedProduct ||
                          !selectedVariant ||
                          quantity <= 0 ||
                          unitPrice <= 0
                        }
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Agregar Producto
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowManualItemDialog(true)}
                        className="bg-gray-600 hover:bg-gray-700 text-white"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Item Manual
                      </Button>
                    </div>
                  </div>
                )}

                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        {/* <TableHead>Categoría</TableHead> */}
                        <TableHead>Medida</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">
                          Precio Unitario
                        </TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        {isEditing && (
                          <TableHead className="text-right">Acciones</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell
                            colSpan={isEditing ? 7 : 6}
                            className="text-center py-4"
                          >
                            Cargando productos...
                          </TableCell>
                        </TableRow>
                      ) : items.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={isEditing ? 7 : 6}
                            className="text-center py-4"
                          >
                            No hay productos en esta venta
                          </TableCell>
                        </TableRow>
                      ) : (
                        items.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              {products[item.productId]?.name ||
                                item.productName ||
                                "Producto no encontrado"}
                              {item.isManual || item.productId?.includes("manual") && (
                                <p className="text-sm text-gray-400 size-1">
                                  {item.description}
                                </p>
                              )}
                            </TableCell>
                            {/* <TableCell>
                            {products[item.productId]?.categories
                              ?.map((catId) => getCategoryName(catId))
                              .join(", ") || "Sin categoría"}
                          </TableCell> */}
                            <TableCell>
                              {item.variantName ||
                                getVariantSize(item.variantId) ||
                                "Sin variante"}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.quantity}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatearPrecio(item.unitPrice)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatearPrecio(item.total)}
                            </TableCell>
                            {isEditing && (
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                  title="Eliminar"
                                  type="button"
                                  onClick={() => handleRemoveItem(index)}
                                >
                                  {/* <X className="h-4 w-4" /> */}
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                    Precio unitario: {formatearPrecio(manualItem.unitPrice)}
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
              disabled={!manualItem.productName || !manualItem.unitPrice}
              className="bg-green-600 hover:bg-green-700"
            >
              Agregar Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Cliente */}
      <Dialog open={showClientDialog} onOpenChange={setShowClientDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {clientName ? "Editar Cliente" : "Agregar Cliente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-4">
              <div className="flex-1" style={{ position: "relative" }}>
                <Label>Cliente</Label>
                <Input
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
                  className="bg-gray-500 hover:bg-gray-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Cliente
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowClientDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveClient}
              className="bg-green-600 hover:bg-green-700"
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
