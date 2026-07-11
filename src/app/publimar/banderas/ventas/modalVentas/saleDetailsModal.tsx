"use client";
import { useFirestore, useFirestoreDocData, useUser } from "reactfire";
import {
  doc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
  Timestamp,
  getDoc,
  increment,
} from "firebase/firestore";
import { softDelete, isDeleted } from '@/lib/softDelete';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  TSale,
  TSaleItem,
  EPaymentMethod,
  TFactura,
  TReturn,
  TReturnItem,
  TExchangeItem,
  TSaleFormaPago,
  TReturnPayment,
  PAYMENT_METHOD_ACCOUNT_TYPES,
  PAYMENT_METHOD_LABELS,
} from "@/types/sale";
import collections from "@/lib/collections";
import { useState, useEffect, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TProduct, TProductCategory } from "@/types/product";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ProductAutocomplete, AutocompleteOption } from "@/components/ui/product-autocomplete";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  formatearPrecio,
  redondearTotal,
  redondearADecena,
  formatDateString,
  formatDate,
} from "@/lib/utils";
import { variantDiscountsStock } from "@/lib/stock";
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
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { useClients } from "@/hooks/useClients";
import { EClientSection } from "@/types/client";
import { useAuditLog } from "@/hooks/useAuditLog";
import {
  buildChanges,
  describeSaleDelete,
  describeSaleUpdate,
  describeStockChange,
  generateCorrelationId,
} from "@/lib/auditLog";
import {
  EAuditAction,
  EAuditEntityType,
  EAuditSection,
} from "@/types/auditLog";
import { AccountSelect } from "@/components/admin/AccountSelect";
import { useAccounts } from "@/hooks/useAccounts";
import {
  usePaymentAccountDefaults,
  getDefaultAccountId,
} from "@/hooks/usePaymentAccountDefaults";
import { createCreditNote } from "@/lib/creditNotes";
import { ECreditNoteOriginType, TCreditNoteItem } from "@/types/creditNote";
import { registerAccountMovement } from "@/lib/accountMovements";
import { EMovementType } from "@/types/accountMovement";

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
  const { data: currentUser } = useUser();
  const { logEvent } = useAuditLog();
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const originalItemsRef = useRef<TSaleItem[]>([]);
  const [products, setProducts] = useState<Record<string, TProduct>>({});
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [items, setItems] = useState<TSaleItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<EPaymentMethod | null>(
    null,
  );
  const [isInvoiced, setIsInvoiced] = useState<boolean | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [formasPago, setFormasPago] = useState<TSaleFormaPago[]>([]);
  const { accounts: allAccounts } = useAccounts({ includeArchived: true });
  const { defaults: paymentDefaults } = usePaymentAccountDefaults();
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
  const [clientSection, setClientSection] = useState<EClientSection>(
    EClientSection.BANDERAS,
  );

  // Estados para devoluciones
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnItems, setReturnItems] = useState<{ [key: number]: number }>({}); // {itemIndex: quantity}
  const [returnReason, setReturnReason] = useState("");
  const [returnToStock, setReturnToStock] = useState(true);
  // Forma de pago de la devolución pura
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<EPaymentMethod>(
    EPaymentMethod.CASH,
  );
  const [refundPaymentAccountId, setRefundPaymentAccountId] = useState<string>("");

  // Estados para cambios
  const [isExchangeMode, setIsExchangeMode] = useState(false);
  const [exchangeItems, setExchangeItems] = useState<TExchangeItem[]>([]);
  // Forma de pago de la diferencia en un cambio
  const [differencePaymentMethod, setDifferencePaymentMethod] =
    useState<EPaymentMethod>(EPaymentMethod.CASH);
  const [differencePaymentAccountId, setDifferencePaymentAccountId] =
    useState<string>("");
  const [exchangeProductId, setExchangeProductId] = useState("");
  const [exchangeVariantId, setExchangeVariantId] = useState("");
  const [exchangeQuantity, setExchangeQuantity] = useState(1);
  const [exchangeUnitPrice, setExchangeUnitPrice] = useState(0);
  const [showExchangeManualDialog, setShowExchangeManualDialog] = useState(false);
  const [exchangeManualItem, setExchangeManualItem] = useState({
    productName: "",
    variantName: "",
    quantity: 1,
    unitPrice: 0,
  });

  // Precargar cuenta default cuando se abre el modal de devolución/cambio o
  // cuando llegan los defaults del admin.
  useEffect(() => {
    if (!showReturnDialog) return;
    if (!paymentDefaults?.sales) return;
    if (
      !refundPaymentAccountId &&
      refundPaymentMethod !== EPaymentMethod.CREDIT_NOTE
    ) {
      const def = getDefaultAccountId(
        paymentDefaults,
        "sales",
        refundPaymentMethod,
      );
      if (def) setRefundPaymentAccountId(def);
    }
    if (
      !differencePaymentAccountId &&
      differencePaymentMethod !== EPaymentMethod.CREDIT_NOTE
    ) {
      const def = getDefaultAccountId(
        paymentDefaults,
        "sales",
        differencePaymentMethod,
      );
      if (def) setDifferencePaymentAccountId(def);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReturnDialog, paymentDefaults]);

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
    createClient,
  } = useClients({ section: EClientSection.BANDERAS });

  // Estado para fecha editable
  const [editedDate, setEditedDate] = useState<string>("");

  const saleRef = saleId ? doc(firestore, collections.SALES, saleId) : null;
  const { data: sale } = useFirestoreDocData(
    saleRef ?? doc(firestore, collections.SALES, "dummy"),
    {
      idField: "id",
    },
  );

  const typedSale = sale as unknown as TSale;

  useEffect(() => {
    if (open) {
      // Solo cargar productos/categorías si no se cargaron antes (cache en memoria)
      if (Object.keys(products).length === 0) {
        loadProducts();
      }
      if (Object.keys(categories).length === 0) {
        loadCategories();
      }

      // Validar que los datos corresponden al saleId actual (evita race condition)
      if (!typedSale?.id || typedSale.id !== saleId) {
        return;
      }

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
          typedSale.manualDiscount || 0,
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
      if (typedSale?.accountId) {
        setSelectedAccountId(typedSale.accountId);
      } else {
        setSelectedAccountId("");
      }

      // Cargar formas de pago: si existen usarlas; si no, derivar una sola desde campos legacy
      if (typedSale?.formasPago && typedSale.formasPago.length > 0) {
        setFormasPago(typedSale.formasPago);
      } else if (typedSale?.paymentMethod) {
        setFormasPago([
          {
            id: `fp-legacy-${Date.now()}`,
            method: typedSale.paymentMethod,
            amount: typedSale.total || 0,
            accountId: typedSale.accountId || null,
            bank: typedSale.bank || null,
          },
        ]);
      } else {
        setFormasPago([]);
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
      if (typedSale?.clientId) {
        setCliente(typedSale.clientId);
        setClienteInput(typedSale.clientName || "");
      }
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
              ? new Date((typedSale.createdAt as any).seconds * 1000)
                  .toISOString()
                  .split("T")[0]
              : "",
          };
          setFacturas([facturaLegacy]);
        } else {
          setFacturas([]);
        }
      }
    }
  }, [open, typedSale, saleId]);

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
        collections.products.CATEGORIES,
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
    manualDisc: number,
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
        initialSubtotal * (taxRate / (100 + taxRate)),
      );
      calculatedSubtotalSinIVA = redondearTotal(
        initialSubtotal - calculatedTaxAmount,
      );
    }

    // Los descuentos se calculan sobre el subtotal completo (con IVA incluido)
    const calculatedDiscountAmount = redondearTotal(
      initialSubtotal * (discountPerc / 100),
    );
    const totalAfterDiscounts = redondearTotal(
      initialSubtotal - calculatedDiscountAmount - manualDisc,
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
            : f,
        ),
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

  // Handlers de formas de pago
  const addFormaPago = () => {
    setFormasPago((prev) => [
      ...prev,
      {
        id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        method: EPaymentMethod.CASH,
        amount: 0,
        accountId: "",
        bank: "",
      },
    ]);
  };

  const removeFormaPago = (id: string) => {
    setFormasPago((prev) => (prev.length > 1 ? prev.filter((fp) => fp.id !== id) : prev));
  };

  const updateFormaPago = (id: string, patch: Partial<TSaleFormaPago>) => {
    setFormasPago((prev) =>
      prev.map((fp) => {
        if (fp.id !== id) return fp;
        const next = { ...fp, ...patch };
        // Al cambiar el método, precargar la cuenta por defecto configurada
        // (salvo que el patch traiga una cuenta elegida explícitamente).
        if (patch.method !== undefined && patch.accountId === undefined) {
          next.accountId = getDefaultAccountId(
            paymentDefaults,
            "sales",
            patch.method,
          );
        }
        return next;
      })
    );
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
    setClientSection(EClientSection.BANDERAS);
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
      (c: any) => c.name.toLowerCase().trim() === value.toLowerCase().trim(),
    );
    if (!clientExists) {
      setCliente("");
    }
  };

  const handleClientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const filteredClients =
      clients?.filter((c: any) =>
        c.name.toLowerCase().includes(clienteInput.toLowerCase()),
      ) || [];

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedClientIndex((prev) =>
        prev < filteredClients.length - 1 ? prev + 1 : prev,
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
        section: EClientSection.BANDERAS,
        contacts:
          personaContacto || email || telefono
            ? [
                {
                  name: personaContacto || clienteInput,
                  email: email || "",
                  phone: telefono || "",
                },
              ]
            : [],
      };

      const newClientId = await createClient(clientData);
      setCliente(newClientId);
      setShowClienteDropdown(false);
      toast.success(`Cliente "${clienteInput}" creado exitosamente`);
    } catch (error) {
      console.error("Error al crear cliente:", error);
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

    // Limpiar datos del cliente
    setCliente("");
    setClienteInput("");
    setClientName("");
    setContactName("");
    setClientAddress("");
    setClientEmail("");
    setClientPhone("");
    setClientCuit("");

    // Limpiar estados del dialog de cliente (faltaban)
    setPersonaContacto("");
    setDireccion("");
    setEmail("");
    setCuit("");
    setTelefono("");
    setShowClienteDropdown(false);
    setHighlightedClientIndex(-1);
  };

  const handleModalClose = (open: boolean) => {
    if (!open) {
      clearModalStates();
    }
    onOpenChange(open);
  };

  // Funciones para manejar items de cambio
  const handleAddExchangeItem = () => {
    if (
      !exchangeProductId ||
      !exchangeVariantId ||
      exchangeQuantity <= 0 ||
      exchangeUnitPrice <= 0
    ) {
      toast.error("Complete todos los campos del producto");
      return;
    }

    const product = products[exchangeProductId];
    const variant = product?.variants?.find((v) => v.id === exchangeVariantId);

    const newExchangeItem: TExchangeItem = {
      productId: exchangeProductId,
      variantId: exchangeVariantId,
      productName: product?.name || "Producto",
      variantName: variant?.size || "",
      quantity: exchangeQuantity,
      unitPrice: exchangeUnitPrice,
      total: exchangeQuantity * exchangeUnitPrice,
    };

    setExchangeItems([...exchangeItems, newExchangeItem]);

    // Limpiar campos
    setExchangeProductId("");
    setExchangeVariantId("");
    setExchangeQuantity(1);
    setExchangeUnitPrice(0);
  };

  const handleRemoveExchangeItem = (index: number) => {
    setExchangeItems(exchangeItems.filter((_, i) => i !== index));
  };

  const handleAddExchangeManualItem = () => {
    if (!exchangeManualItem.productName || exchangeManualItem.unitPrice <= 0) {
      toast.error("Nombre y precio son requeridos");
      return;
    }

    const newItem: TExchangeItem = {
      productId: `manual-${Date.now()}`,
      variantId: `manual-variant-${Date.now()}`,
      productName: exchangeManualItem.productName,
      variantName: exchangeManualItem.variantName || "N/A",
      quantity: exchangeManualItem.quantity,
      unitPrice: exchangeManualItem.unitPrice,
      total: exchangeManualItem.quantity * exchangeManualItem.unitPrice,
    };

    setExchangeItems([...exchangeItems, newItem]);
    setExchangeManualItem({ productName: "", variantName: "", quantity: 1, unitPrice: 0 });
    setShowExchangeManualDialog(false);
    toast.success("Item manual agregado");
  };

  const handleExchangeVariantChange = (variantId: string) => {
    setExchangeVariantId(variantId);
    if (exchangeProductId && variantId) {
      const product = products[exchangeProductId];
      const variant = product?.variants?.find((v) => v.id === variantId);
      if (variant?.price) {
        setExchangeUnitPrice(Number(variant.price));
      }
    }
  };

  const handleProcessReturn = async () => {
    if (!saleRef || !saleId || !typedSale) return;

    // Validar que haya items seleccionados para devolver
    const selectedItems = Object.entries(returnItems).filter(
      ([_, qty]) => qty > 0,
    );

    if (selectedItems.length === 0) {
      toast.error("Debe seleccionar al menos un item para devolver");
      return;
    }

    // Validar motivo
    if (!returnReason.trim()) {
      toast.error("Debe especificar un motivo");
      return;
    }

    // Si es modo cambio, validar que haya items de cambio
    if (isExchangeMode && exchangeItems.length === 0) {
      toast.error("Debe agregar al menos un producto nuevo para el cambio");
      return;
    }

    // Validar forma de pago de la diferencia (cambios con diferencia != 0)
    if (isExchangeMode) {
      const saleSubtotalCheck = typedSale.subtotal || 0;
      const saleTotalCheck = typedSale.total || 0;
      const discountRatioCheck =
        saleSubtotalCheck > 0 ? saleTotalCheck / saleSubtotalCheck : 1;
      const grossReturnCheck = selectedItems.reduce((sum, [indexStr, qty]) => {
        const item = typedSale.items[parseInt(indexStr)];
        if (!item) return sum;
        return sum + (item.total / item.quantity) * qty;
      }, 0);
      const totalReturnCheck = redondearTotal(
        grossReturnCheck * discountRatioCheck,
      );
      const totalExchangeCheck = exchangeItems.reduce(
        (sum, item) => sum + item.total,
        0,
      );
      const diffCheck = totalExchangeCheck - totalReturnCheck;
      if (diffCheck !== 0) {
        const requiresAccount =
          differencePaymentMethod !== EPaymentMethod.CREDIT_NOTE &&
          differencePaymentMethod !== EPaymentMethod.CREDIT_CARD &&
          differencePaymentMethod !== EPaymentMethod.DEBIT_CARD;
        if (requiresAccount && !differencePaymentAccountId) {
          toast.error(
            "Debe seleccionar una cuenta para la diferencia del cambio",
          );
          return;
        }
        if (
          differencePaymentMethod === EPaymentMethod.CREDIT_NOTE &&
          (diffCheck > 0 || !typedSale.clientId)
        ) {
          toast.error(
            "La nota de crédito solo se puede usar para devolver al cliente y requiere un cliente registrado",
          );
          return;
        }
      }
    }

    // Validar forma de pago de la devolución pura
    if (!isExchangeMode) {
      const saleSubtotalR = typedSale.subtotal || 0;
      const saleTotalR = typedSale.total || 0;
      const discountRatioR =
        saleSubtotalR > 0 ? saleTotalR / saleSubtotalR : 1;
      const grossReturnR = selectedItems.reduce((sum, [indexStr, qty]) => {
        const item = typedSale.items[parseInt(indexStr)];
        if (!item) return sum;
        return sum + (item.total / item.quantity) * qty;
      }, 0);
      const totalRefundR = redondearTotal(grossReturnR * discountRatioR);
      if (totalRefundR > 0) {
        const requiresAccountR =
          refundPaymentMethod !== EPaymentMethod.CREDIT_NOTE &&
          refundPaymentMethod !== EPaymentMethod.CREDIT_CARD &&
          refundPaymentMethod !== EPaymentMethod.DEBIT_CARD;
        if (requiresAccountR && !refundPaymentAccountId) {
          toast.error(
            "Debe seleccionar una cuenta para la devolución",
          );
          return;
        }
        if (
          refundPaymentMethod === EPaymentMethod.CREDIT_NOTE &&
          !typedSale.clientId
        ) {
          toast.error(
            "Para emitir una nota de crédito la venta debe tener un cliente registrado",
          );
          return;
        }
      }
    }

    setIsLoading(true);
    try {
      // Crear items de devolución
      const returnItemsArray: TReturnItem[] = [];
      let totalRefund = 0;

      // Ratio de descuento: si la venta tiene descuento, aplicarlo proporcionalmente
      // Ej: subtotal $70000 con descuento $10000 = total $60000 → ratio = 60000/70000
      const saleSubtotal = typedSale.subtotal || 0;
      const saleTotal = typedSale.total || 0;
      const discountRatio = saleSubtotal > 0 ? saleTotal / saleSubtotal : 1;

      for (const [indexStr, quantity] of selectedItems) {
        const index = parseInt(indexStr);
        const item = typedSale.items[index];

        // Calcular monto proporcional a devolver (con descuento aplicado)
        const grossRefund = (item.total / item.quantity) * quantity;
        const refundAmount = redondearTotal(grossRefund * discountRatio);
        totalRefund += refundAmount;

        returnItemsArray.push({
          saleItemId: `${index}`,
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          variantName: item.variantName,
          quantityReturned: quantity,
          refundAmount: refundAmount,
        });

        // Devolver stock si está marcado
        if (
          returnToStock &&
          !item.isManual &&
          item.productId &&
          !item.productId.includes("manual")
        ) {
          try {
            const productRef = doc(
              firestore,
              collections.PRODUCTS,
              item.productId,
            );
            const productDoc = await getDoc(productRef);

            if (productDoc.exists()) {
              const currentProduct = productDoc.data();

              // Decrementar salesCount solo si se devuelve la cantidad completa
              const isFullReturn = quantity === item.quantity;

              if (item.variantId && currentProduct.variants) {
                // Si la variante no descuenta stock al vender, tampoco lo devuelve.
                const variant = currentProduct.variants.find(
                  (v: any) => v.id === item.variantId,
                );
                const shouldReturnStock = variantDiscountsStock(variant);
                await updateDoc(productRef, {
                  variants: shouldReturnStock
                    ? currentProduct.variants.map((v: any) =>
                        v.id === item.variantId
                          ? { ...v, stock: Number(v.stock) + quantity }
                          : v,
                      )
                    : currentProduct.variants,
                  ...(isFullReturn ? { salesCount: increment(-1) } : {}),
                });
              } else {
                await updateDoc(productRef, {
                  stock: Number(currentProduct.stock || 0) + quantity,
                  ...(isFullReturn ? { salesCount: increment(-1) } : {}),
                });
              }
            }
          } catch (error) {
            console.error(
              `Error al devolver stock del producto ${item.productId}:`,
              error,
            );
          }
        }
      }

      // Calcular totales de cambio si aplica
      let exchangeTotal = 0;
      let priceDifference = 0;

      if (isExchangeMode && exchangeItems.length > 0) {
        exchangeTotal = exchangeItems.reduce(
          (sum, item) => sum + item.total,
          0,
        );
        priceDifference = exchangeTotal - totalRefund;

        // Descontar stock de productos nuevos
        for (const exchangeItem of exchangeItems) {
          if (
            exchangeItem.productId &&
            !exchangeItem.productId.includes("manual")
          ) {
            try {
              const productRef = doc(
                firestore,
                collections.PRODUCTS,
                exchangeItem.productId,
              );
              const productDoc = await getDoc(productRef);

              if (productDoc.exists()) {
                const currentProduct = productDoc.data();

                if (exchangeItem.variantId && currentProduct.variants) {
                  // Si la variante no descuenta stock, no la tocamos.
                  const variant = currentProduct.variants.find(
                    (v: any) => v.id === exchangeItem.variantId,
                  );
                  const shouldDiscount = variantDiscountsStock(variant);
                  await updateDoc(productRef, {
                    variants: shouldDiscount
                      ? currentProduct.variants.map((v: any) =>
                          v.id === exchangeItem.variantId
                            ? {
                                ...v,
                                stock: Math.max(
                                  0,
                                  Number(v.stock) - exchangeItem.quantity,
                                ),
                              }
                            : v,
                        )
                      : currentProduct.variants,
                    salesCount: increment(1),
                  });
                } else {
                  await updateDoc(productRef, {
                    stock: Math.max(
                      0,
                      Number(currentProduct.stock || 0) - exchangeItem.quantity,
                    ),
                    salesCount: increment(1),
                  });
                }
              }
            } catch (error) {
              console.error(
                `Error al descontar stock del producto ${exchangeItem.productId}:`,
                error,
              );
            }
          }
        }
      }

      // Forma de pago de la diferencia (solo para cambios con diferencia != 0)
      let differencePayment: TReturnPayment | undefined = undefined;
      if (isExchangeMode && priceDifference !== 0) {
        differencePayment = {
          method: differencePaymentMethod,
          amount: Math.abs(priceDifference),
          accountId: differencePaymentAccountId || null,
          creditNoteId: null,
        };
      }

      // Forma de pago de la devolución pura (no cambio)
      let refundPayment: TReturnPayment | undefined = undefined;
      if (!isExchangeMode && totalRefund > 0) {
        refundPayment = {
          method: refundPaymentMethod,
          amount: totalRefund,
          accountId: refundPaymentAccountId || null,
          creditNoteId: null,
        };
      }

      // Crear objeto de devolución/cambio
      const newReturn: TReturn = {
        id: `${isExchangeMode ? "exchange" : "return"}-${Date.now()}`,
        date: new Date(),
        items: returnItemsArray,
        reason: returnReason,
        refundAmount: totalRefund,
        stockReturned: returnToStock,
        notes: "",
        // Campos de cambio
        isExchange: isExchangeMode,
        exchangeItems: isExchangeMode ? exchangeItems : [],
        exchangeTotal: isExchangeMode ? exchangeTotal : 0,
        priceDifference: isExchangeMode ? priceDifference : 0,
        ...(differencePayment ? { differencePayment } : {}),
        ...(refundPayment ? { refundPayment } : {}),
      };

      // Actualizar totales de la venta
      const currentReturns = typedSale.returns || [];
      const updatedReturns = [...currentReturns, newReturn];

      // Calcular nuevos totales
      const newTotalReturned = (typedSale.totalReturned || 0) + totalRefund;
      const newTotalExchanged =
        (typedSale.totalExchanged || 0) + (isExchangeMode ? exchangeTotal : 0);
      const newFinalTotal =
        typedSale.total - newTotalReturned + newTotalExchanged;
      console.log("venta actualizada", {
        returns: updatedReturns,
        totalReturned: newTotalReturned,
        totalExchanged: newTotalExchanged,
        finalTotal: newFinalTotal,
      });
      await updateDoc(saleRef, {
        returns: updatedReturns,
        totalReturned: newTotalReturned,
        totalExchanged: newTotalExchanged,
        finalTotal: newFinalTotal,
        updatedAt: serverTimestamp(),
      });

      toast.success(
        isExchangeMode
          ? "Cambio procesado exitosamente"
          : "Devolución procesada exitosamente",
      );

      // Registrar movimiento / NC por la diferencia del cambio
      if (isExchangeMode && differencePayment) {
        const isRefundToClient = priceDifference < 0; // se le devuelve al cliente
        const diffAmount = differencePayment.amount;
        const saleNum = typedSale.number;
        try {
          if (differencePayment.method === EPaymentMethod.CREDIT_NOTE) {
            // NC para devolver la diferencia al cliente
            if (typedSale.clientId) {
              const noteId = await createCreditNote(firestore, {
                clientId: typedSale.clientId,
                clientName: typedSale.clientName ?? "",
                amount: diffAmount,
                reason: `Diferencia de cambio - Venta #${saleNum}`,
                originType: ECreditNoteOriginType.RETURN,
                originDocument: {
                  id: saleId!,
                  type: "sale",
                  number: saleNum,
                },
                items: [],
                createdBy: currentUser?.uid ?? "",
              });
              // Persistir el id de la NC en el return recién agregado
              await updateDoc(saleRef, {
                returns: updatedReturns.map((r) =>
                  r.id === newReturn.id && r.differencePayment
                    ? {
                        ...r,
                        differencePayment: {
                          ...r.differencePayment,
                          creditNoteId: noteId,
                        },
                      }
                    : r,
                ),
                updatedAt: serverTimestamp(),
              });
              toast.success(
                `Nota de crédito generada por ${formatearPrecio(diffAmount)}`,
              );
            }
          } else if (differencePayment.accountId) {
            // Movimiento de cuenta por la diferencia
            const acc = allAccounts.find(
              (a) => a.id === differencePayment!.accountId,
            );
            await registerAccountMovement(firestore, {
              accountId: differencePayment.accountId,
              type: isRefundToClient
                ? EMovementType.EXPENSE
                : EMovementType.INCOME,
              amount: redondearTotal(diffAmount),
              description: `Diferencia cambio - Venta #${saleNum}${
                typedSale.clientName ? ` - ${typedSale.clientName}` : ""
              } (${differencePayment.method}${acc ? ` → ${acc.name}` : ""})`,
              date: new Date(),
              sourceType: "sale",
              sourceId: saleId!,
              createdBy: currentUser?.uid ?? "",
            });
          }
        } catch (err) {
          console.error(
            "Error al registrar movimiento/NC de la diferencia del cambio:",
            err,
          );
          toast.error(
            "Cambio registrado, pero falló el movimiento de la diferencia",
          );
        }
      }

      // Registrar movimiento / NC por la devolución pura
      if (!isExchangeMode && refundPayment) {
        try {
          if (refundPayment.method === EPaymentMethod.CREDIT_NOTE) {
            if (typedSale.clientId) {
              const ncItems: TCreditNoteItem[] = returnItemsArray.map((ri) => ({
                productId: ri.productId,
                variantId: ri.variantId,
                productName: ri.productName,
                variantName: ri.variantName,
                quantity: ri.quantityReturned,
                unitPrice:
                  ri.quantityReturned > 0
                    ? ri.refundAmount / ri.quantityReturned
                    : 0,
                subtotal: ri.refundAmount,
              }));
              const noteId = await createCreditNote(firestore, {
                clientId: typedSale.clientId,
                clientName: typedSale.clientName ?? "",
                amount: totalRefund,
                reason: returnReason,
                originType: ECreditNoteOriginType.RETURN,
                originDocument: {
                  id: saleId!,
                  type: "sale",
                  number: typedSale.number,
                },
                items: ncItems,
                createdBy: currentUser?.uid ?? "",
              });
              await updateDoc(saleRef, {
                returns: updatedReturns.map((r) =>
                  r.id === newReturn.id && r.refundPayment
                    ? {
                        ...r,
                        refundPayment: {
                          ...r.refundPayment,
                          creditNoteId: noteId,
                        },
                      }
                    : r,
                ),
                updatedAt: serverTimestamp(),
              });
              toast.success(
                `Nota de crédito generada por ${formatearPrecio(totalRefund)}`,
              );
            }
          } else if (refundPayment.accountId) {
            const acc = allAccounts.find(
              (a) => a.id === refundPayment!.accountId,
            );
            await registerAccountMovement(firestore, {
              accountId: refundPayment.accountId,
              type: EMovementType.EXPENSE,
              amount: redondearTotal(totalRefund),
              description: `Devolución - Venta #${typedSale.number}${
                typedSale.clientName ? ` - ${typedSale.clientName}` : ""
              } (${refundPayment.method}${acc ? ` → ${acc.name}` : ""})`,
              date: new Date(),
              sourceType: "sale",
              sourceId: saleId!,
              createdBy: currentUser?.uid ?? "",
            });
          }
        } catch (err) {
          console.error(
            "Error al registrar movimiento/NC de la devolución:",
            err,
          );
          toast.error(
            "Devolución registrada, pero falló el movimiento de cuenta/NC",
          );
        }
      }

      // Limpiar estados
      setReturnItems({});
      setReturnReason("");
      setReturnToStock(true);
      setRefundPaymentMethod(EPaymentMethod.CASH);
      setRefundPaymentAccountId("");
      setIsExchangeMode(false);
      setExchangeItems([]);
      setDifferencePaymentMethod(EPaymentMethod.CASH);
      setDifferencePaymentAccountId("");
      setShowReturnDialog(false);

      onSuccess();
    } catch (error) {
      console.error("Error al procesar:", error);
      toast.error("Error al procesar la operación");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!saleRef || !saleId || !typedSale) return;

    setIsLoading(true);
    try {
      // Calcular deltas de stock entre items originales y editados
      const originalItems = originalItemsRef.current;
      const SEP = "|||";

      // Mapa: {productId, variantId} → quantity original
      const originalQty = new Map<string, { productId: string; variantId: string; qty: number }>();
      for (const item of originalItems) {
        if (item.isManual || !item.productId || item.productId.includes("manual")) continue;
        const key = `${item.productId}${SEP}${item.variantId || ""}`;
        const prev = originalQty.get(key);
        originalQty.set(key, {
          productId: item.productId,
          variantId: item.variantId || "",
          qty: (prev?.qty || 0) + item.quantity,
        });
      }

      // Mapa: {productId, variantId} → quantity nuevo
      const newQty = new Map<string, { productId: string; variantId: string; qty: number }>();
      for (const item of items) {
        if (item.isManual || !item.productId || item.productId.includes("manual")) continue;
        const key = `${item.productId}${SEP}${item.variantId || ""}`;
        const prev = newQty.get(key);
        newQty.set(key, {
          productId: item.productId,
          variantId: item.variantId || "",
          qty: (prev?.qty || 0) + item.quantity,
        });
      }

      // Calcular deltas y actualizar stock
      const stockEditEvents: Array<{
        productId: string;
        productName?: string;
        variantId: string;
        variantName?: string;
        stockBefore: number;
        stockAfter: number;
        delta: number;
      }> = [];
      const allKeys = new Set([...originalQty.keys(), ...newQty.keys()]);
      for (const key of allKeys) {
        const oldEntry = originalQty.get(key);
        const newEntry = newQty.get(key);
        const oldQ = oldEntry?.qty || 0;
        const newQ = newEntry?.qty || 0;
        const delta = newQ - oldQ; // >0: descontar más, <0: devolver

        if (delta === 0) continue;

        const productId = (newEntry || oldEntry)!.productId;
        const variantId = (newEntry || oldEntry)!.variantId;

        try {
          const productRef = doc(firestore, collections.PRODUCTS, productId);
          const productDoc = await getDoc(productRef);

          if (productDoc.exists()) {
            const currentProduct = productDoc.data();

            if (variantId && currentProduct.variants) {
              const variant = currentProduct.variants.find((v: any) => v.id === variantId);
              const stockBefore = Number(variant?.stock ?? 0);
              await updateDoc(productRef, {
                variants: currentProduct.variants.map((v: any) =>
                  v.id === variantId
                    ? { ...v, stock: Number(v.stock) - delta }
                    : v,
                ),
                ...(oldQ === 0 && newQ > 0 ? { salesCount: increment(1) } : {}),
                ...(oldQ > 0 && newQ === 0 ? { salesCount: increment(-1) } : {}),
              });
              stockEditEvents.push({
                productId,
                productName: currentProduct.name,
                variantId,
                variantName: variant?.size,
                stockBefore,
                stockAfter: stockBefore - delta,
                delta: -delta,
              });
            } else {
              const stockBefore = Number(currentProduct.stock || 0);
              await updateDoc(productRef, {
                stock: stockBefore - delta,
                ...(oldQ === 0 && newQ > 0 ? { salesCount: increment(1) } : {}),
                ...(oldQ > 0 && newQ === 0 ? { salesCount: increment(-1) } : {}),
              });
              stockEditEvents.push({
                productId,
                productName: currentProduct.name,
                variantId: "",
                stockBefore,
                stockAfter: stockBefore - delta,
                delta: -delta,
              });
            }
          }
        } catch (error) {
          console.error(`Error al actualizar stock del producto ${productId}:`, error);
        }
      }

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

      // Registrar fecha de actualización
      updateData.updatedAt = serverTimestamp() as unknown as Date;

      // Normalizar y derivar formas de pago para retrocompatibilidad
      const formasPagoValidas: TSaleFormaPago[] = formasPago
        .filter((fp) => fp.amount > 0)
        .map((fp) => ({
          id: fp.id,
          method: fp.method,
          amount: redondearTotal(fp.amount),
          accountId: fp.accountId || null,
          bank: fp.method === EPaymentMethod.TRANSFER ? fp.bank || null : null,
        }));

      updateData.formasPago = formasPagoValidas;

      if (formasPagoValidas.length > 0) {
        const derivedFp =
          formasPagoValidas.length === 1
            ? formasPagoValidas[0]
            : formasPagoValidas.reduce((a, b) => (a.amount > b.amount ? a : b));
        updateData.paymentMethod = derivedFp.method;
        updateData.bank =
          derivedFp.method === EPaymentMethod.TRANSFER
            ? formasPagoValidas.find((fp) => fp.method === EPaymentMethod.TRANSFER)?.bank || null
            : null;
        updateData.accountId =
          formasPagoValidas.find((fp) => !!fp.accountId)?.accountId || null;
      } else if (paymentMethod) {
        updateData.paymentMethod = paymentMethod;
        updateData.bank =
          paymentMethod === EPaymentMethod.TRANSFER && selectedBank ? selectedBank : null;
        updateData.accountId = selectedAccountId || null;
      }
      if (isInvoiced !== null) {
        updateData.isInvoiced = isInvoiced;
        if (isInvoiced && invoiceNumber) {
          updateData.invoiceNumber = invoiceNumber;
        }
      }
      // Registrar cambio de fecha de creación
      if (editedDate) {
        updateData.createdAt = Timestamp.fromDate(
          new Date(`${editedDate}T12:00:00`),
        ) as unknown as Date;
      }

      // Datos del cliente
      if (cliente) {
        // Si hay un cliente seleccionado de la DB, guardar su ID
        updateData.clientId = cliente;
      } else {
        // Si no hay cliente seleccionado, limpiar el clientId
        updateData.clientId = null;
      }
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

      const correlationId = generateCorrelationId();
      await Promise.all(
        stockEditEvents.map((p) =>
          logEvent({
            section: EAuditSection.BANDERAS_STOCK,
            entityType: EAuditEntityType.PRODUCT_VARIANT,
            entityId: `${p.productId}:${p.variantId || "_"}`,
            entityLabel: `${p.productName ?? p.productId}${p.variantName ? ` · ${p.variantName}` : ""}`,
            action: EAuditAction.STOCK_CHANGE,
            description: describeStockChange(p.productName ?? p.productId, p.variantName, p.delta, "sale_edit"),
            metadata: {
              reason: "sale_edit",
              saleId,
              saleNumber: typedSale?.number,
              productId: p.productId,
              productName: p.productName,
              variantId: p.variantId,
              variantName: p.variantName,
              stockBefore: p.stockBefore,
              stockAfter: p.stockAfter,
              delta: p.delta,
            },
            correlationId,
          })
        )
      );

      const watched = [
        "clientId","clientName","total","subtotal","paymentMethod","bank","formasPago",
        "isInvoiced","invoiceNumber","discountPercentage","applyIVA","createdAt",
      ];
      const changes = buildChanges(typedSale ?? null, updateData as any, watched);
      const changedFields = Object.keys(changes.after ?? {});
      const saleNumber = typedSale?.number ?? saleId ?? "";
      await logEvent({
        section: EAuditSection.BANDERAS_VENTAS,
        entityType: EAuditEntityType.SALE,
        entityId: saleId!,
        entityLabel: saleNumber,
        action: EAuditAction.UPDATE,
        description: describeSaleUpdate(saleNumber, changedFields),
        changes,
        metadata: {
          total: updateData.total,
          itemsCount: items.length,
          stockDeltas: stockEditEvents.map((p) => ({
            productId: p.productId,
            variantId: p.variantId,
            productName: p.productName,
            variantName: p.variantName,
            delta: p.delta,
          })),
        },
        correlationId,
      });

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
    if (!saleRef || !saleId || !typedSale) return;

    const confirmDelete = window.confirm(
      "¿Está seguro que desea eliminar esta venta?",
    );
    if (!confirmDelete) return;

    const shouldRestoreStock = window.confirm(
      "¿Desea devolver los productos al stock?",
    );

    setIsLoading(true);
    const correlationId = generateCorrelationId();
    const stockRestoreEvents: Array<{
      productId: string;
      productName?: string;
      variantId: string;
      variantName?: string;
      stockBefore: number;
      stockAfter: number;
      delta: number;
    }> = [];
    try {
      if (shouldRestoreStock) {
        // Calcular cantidades ya devueltas por devoluciones previas (con stock devuelto)
        const alreadyReturned = new Map<string, number>();
        if (typedSale.returns) {
          for (const ret of typedSale.returns) {
            if (!ret.stockReturned) continue;
            for (const retItem of ret.items) {
              const key = `${retItem.productId || ""}|||${retItem.variantId || ""}`;
              alreadyReturned.set(key, (alreadyReturned.get(key) || 0) + retItem.quantityReturned);
            }
          }
        }

        // Restaurar stock de cada item no-manual (solo la cantidad pendiente)
        for (const item of typedSale.items) {
          if (item.isManual || !item.productId || item.productId.includes("manual")) continue;

          const key = `${item.productId}|||${item.variantId || ""}`;
          const returned = alreadyReturned.get(key) || 0;
          const pendingQty = item.quantity - returned;

          if (pendingQty <= 0) continue;

          try {
            const productRef = doc(firestore, collections.PRODUCTS, item.productId);
            const productDoc = await getDoc(productRef);

            if (productDoc.exists()) {
              const currentProduct = productDoc.data();

              if (item.variantId && currentProduct.variants) {
                const variant = currentProduct.variants.find((v: any) => v.id === item.variantId);
                const stockBefore = Number(variant?.stock ?? 0);
                await updateDoc(productRef, {
                  variants: currentProduct.variants.map((v: any) =>
                    v.id === item.variantId
                      ? { ...v, stock: Number(v.stock) + pendingQty }
                      : v,
                  ),
                  salesCount: increment(-1),
                });
                stockRestoreEvents.push({
                  productId: item.productId,
                  productName: item.productName ?? currentProduct.name,
                  variantId: item.variantId,
                  variantName: item.variantName ?? variant?.size,
                  stockBefore,
                  stockAfter: stockBefore + pendingQty,
                  delta: pendingQty,
                });
              } else {
                const stockBefore = Number(currentProduct.stock || 0);
                await updateDoc(productRef, {
                  stock: stockBefore + pendingQty,
                  salesCount: increment(-1),
                });
                stockRestoreEvents.push({
                  productId: item.productId,
                  productName: item.productName ?? currentProduct.name,
                  variantId: "",
                  variantName: item.variantName,
                  stockBefore,
                  stockAfter: stockBefore + pendingQty,
                  delta: pendingQty,
                });
              }
            }
          } catch (error) {
            console.error(`Error al devolver stock del producto ${item.productId}:`, error);
          }
        }

        // Marcar que se devolvió stock antes del soft delete
        await updateDoc(saleRef, { stockRestored: true });
      }

      await softDelete(firestore, collections.SALES, saleId);

      await Promise.all(
        stockRestoreEvents.map((p) =>
          logEvent({
            section: EAuditSection.BANDERAS_STOCK,
            entityType: EAuditEntityType.PRODUCT_VARIANT,
            entityId: `${p.productId}:${p.variantId || "_"}`,
            entityLabel: `${p.productName ?? p.productId}${p.variantName ? ` · ${p.variantName}` : ""}`,
            action: EAuditAction.STOCK_CHANGE,
            description: describeStockChange(p.productName ?? p.productId, p.variantName, p.delta, "sale_delete"),
            metadata: {
              reason: "sale_delete",
              saleId,
              saleNumber: typedSale.number,
              productId: p.productId,
              productName: p.productName,
              variantId: p.variantId,
              variantName: p.variantName,
              stockBefore: p.stockBefore,
              stockAfter: p.stockAfter,
              delta: p.delta,
            },
            correlationId,
          })
        )
      );

      await logEvent({
        section: EAuditSection.BANDERAS_VENTAS,
        entityType: EAuditEntityType.SALE,
        entityId: saleId,
        entityLabel: typedSale.number ?? saleId,
        action: EAuditAction.DELETE,
        description: describeSaleDelete(typedSale.number ?? saleId),
        changes: buildChanges(typedSale as any, null, ["number","clientName","total","paymentMethod"]),
        metadata: {
          total: typedSale.total,
          stockRestored: shouldRestoreStock,
          restoredItemsCount: stockRestoreEvents.length,
        },
        correlationId,
      });

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
    if (isDeleted(product)) return false;
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
                  onClick={() => setShowReturnDialog(true)}
                  className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white"
                >
                  <RotateCcw className="h-4 w-4" />
                  Devolución
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    originalItemsRef.current = [...items];
                    setIsEditing(true);
                  }}
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
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">
                              Formas de Pago
                            </label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addFormaPago}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Agregar
                            </Button>
                          </div>
                          {formasPago.map((fp, idx) => (
                            <div
                              key={fp.id}
                              className="border rounded-md p-2 bg-white space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">
                                  Pago {idx + 1}
                                </span>
                                {formasPago.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeFormaPago(fp.id)}
                                    className="text-red-500 hover:text-red-700 h-7 w-7"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs">Método</Label>
                                  <Select
                                    value={fp.method}
                                    onValueChange={(value) =>
                                      updateFormaPago(fp.id, {
                                        method: value as EPaymentMethod,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue placeholder="Método" />
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
                                <div>
                                  <Label className="text-xs">Monto</Label>
                                  <MoneyInput
                                    value={fp.amount || 0}
                                    onValueChange={(n) =>
                                      updateFormaPago(fp.id, { amount: n })
                                    }
                                    placeholder="0"
                                    className="h-9"
                                  />
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs">Cuenta (opcional)</Label>
                                <AccountSelect
                                  value={fp.accountId || ""}
                                  onChange={(value) =>
                                    updateFormaPago(fp.id, { accountId: value })
                                  }
                                  placeholder="Sin cuenta"
                                />
                              </div>
                            </div>
                          ))}
                          {(() => {
                            const sumaFormas = formasPago.reduce(
                              (s, fp) => s + (fp.amount || 0),
                              0,
                            );
                            const diferencia = redondearTotal(total - sumaFormas);
                            const cuadra = Math.abs(diferencia) < 0.01;
                            return (
                              <div className="flex items-center justify-between text-xs px-1">
                                <span className="text-gray-600">
                                  Suma: {formatearPrecio(sumaFormas)} | Total:{" "}
                                  {formatearPrecio(total)}
                                </span>
                                <span
                                  className={
                                    cuadra
                                      ? "text-green-600 font-medium"
                                      : "text-red-600 font-medium"
                                  }
                                >
                                  {cuadra
                                    ? "OK"
                                    : `Dif: ${formatearPrecio(diferencia)}`}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="font-medium">Formas de Pago:</p>
                          {formasPago.length > 0 ? (
                            <ul className="text-sm space-y-0.5 pl-2">
                              {formasPago.map((fp) => {
                                const acc = fp.accountId
                                  ? allAccounts.find((a) => a.id === fp.accountId)?.name
                                  : null;
                                return (
                                  <li key={fp.id}>
                                    {formatPaymentMethod(fp.method)} —{" "}
                                    {formatearPrecio(fp.amount)}
                                    {acc ? ` (${acc})` : ""}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-sm text-gray-500 pl-2">
                              {formatPaymentMethod(typedSale?.paymentMethod)}
                            </p>
                          )}
                        </div>
                      )}
                      {!isEditing && typedSale?.clientName && (
                        <p>
                          <span className="font-medium">Cliente:</span>{" "}
                          {typedSale.clientName}
                        </p>
                      )}
                      {isEditing && (
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium">
                            Cliente:
                          </Label>
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
                              <MoneyInput
                                value={parseFloat(newFacturaMonto) || 0}
                                onValueChange={(n) =>
                                  setNewFacturaMonto(n ? String(n) : "")
                                }
                                placeholder="0"
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
                                Number(e.target.value),
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
                          <MoneyInput
                            id="manualDiscount"
                            value={manualDiscount || 0}
                            onValueChange={(n) =>
                              handleManualDiscountChange(n)
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

                      <div className="mt-2 flex items-center justify-between rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-4">
                        <p className="text-base font-semibold text-blue-900">Total</p>
                        <p className="text-2xl font-bold text-blue-900">
                          {formatearPrecio(redondearADecena(total))}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-4">Productos</h3>
                {isEditing && (
                  <div className="mb-4 p-4 border rounded-lg bg-slate-50 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-slate-700">Agregar producto</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowManualItemDialog(true)}
                      >
                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                        Item manual
                      </Button>
                    </div>

                    {/* Busqueda y filtro */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar producto..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-8 bg-white"
                        />
                      </div>
                      <Select
                        value={selectedCategory}
                        onValueChange={setSelectedCategory}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Categoría" />
                        </SelectTrigger>
                        <SelectContent className="max-h-48 overflow-y-auto">
                          <SelectItem value="all">Todas</SelectItem>
                          {Object.entries(categories).map(([id, category]) => (
                            <SelectItem key={id} value={id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Producto y variante */}
                    <div className="grid grid-cols-2 gap-3">
                      <ProductAutocomplete
                        options={filteredProducts.map(([id, product]) => {
                          const totalStock = product?.variants?.reduce((sum, v) => sum + Number(v.stock), 0) ?? 0;
                          return {
                            id,
                            label: product?.name || "Producto sin nombre",
                            disabled: totalStock <= 0,
                            sublabel: totalStock <= 0 ? "Sin stock" : `${totalStock} disp.`,
                            sublabelClassName: totalStock <= 0 ? "text-red-500" : totalStock < 5 ? "text-red-500" : "text-green-600",
                          };
                        })}
                        value={selectedProduct}
                        onChange={setSelectedProduct}
                        placeholder="Buscar producto..."
                        className="bg-white"
                      />
                      <Select
                        value={selectedVariant}
                        onValueChange={handleVariantChange}
                        disabled={!selectedProduct}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Variante" />
                        </SelectTrigger>
                        <SelectContent className="max-h-48 overflow-y-auto">
                          {selectedProduct &&
                            products[selectedProduct]?.variants.map((variant) => {
                              const stock = Number(variant.stock);
                              return (
                                <SelectItem
                                  key={variant.id}
                                  value={variant.id}
                                  disabled={stock <= 0}
                                  className={stock <= 0 ? "opacity-50" : ""}
                                >
                                  {variant.size}{" "}
                                  <span className={stock <= 0 ? "text-red-500" : stock < 5 ? "text-red-500" : "text-green-600"}>
                                    {stock > 0 ? `(${stock} disp.)` : "(Sin stock)"}
                                  </span>
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Cantidad, precio y boton */}
                    <div className="flex items-end gap-3">
                      <div className="w-24">
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Cantidad</label>
                        <Input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(e) => setQuantity(Number(e.target.value))}
                          className="bg-white"
                        />
                      </div>
                      <div className="w-32">
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Precio unit.</label>
                        <MoneyInput
                          value={unitPrice || 0}
                          onValueChange={(n) => setUnitPrice(n)}
                          className="bg-white"
                          placeholder="0"
                        />
                      </div>
                      <Button
                        onClick={handleAddItem}
                        disabled={
                          !selectedProduct ||
                          !selectedVariant ||
                          quantity <= 0 ||
                          unitPrice <= 0
                        }
                        className="bg-blue-600 hover:bg-blue-700 flex-1"
                      >
                        <Plus className="h-4 w-4 mr-1.5" />
                        Agregar
                      </Button>
                    </div>
                  </div>
                )}

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
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
                              {item.isManual ||
                                (item.productId?.includes("manual") && (
                                  <p className="text-sm text-gray-400 size-1">
                                    {item.description}
                                  </p>
                                ))}
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

              {/* Historial de Devoluciones y Cambios */}
              {typedSale?.returns && typedSale.returns.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold mb-4">
                    Historial de Devoluciones y Cambios
                  </h3>
                  <div className="space-y-4">
                    {typedSale.returns.map((returnItem, returnIndex) => (
                      <div
                        key={returnItem.id}
                        className={`border rounded-lg p-4 ${returnItem.isExchange ? "bg-purple-50" : "bg-red-50"}`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4
                              className={`font-medium ${returnItem.isExchange ? "text-purple-900" : "text-red-900"}`}
                            >
                              {returnItem.isExchange
                                ? `Cambio #${returnIndex + 1}`
                                : `Devolución #${returnIndex + 1}`}
                            </h4>
                            <p className="text-sm text-gray-600">
                              {formatDate(returnItem.date)}
                            </p>
                          </div>
                          <div className="text-right">
                            {returnItem.isExchange ? (
                              <p
                                className={`font-bold ${(returnItem.priceDifference || 0) > 0 ? "text-orange-600" : (returnItem.priceDifference || 0) < 0 ? "text-green-600" : "text-gray-600"}`}
                              >
                                {(returnItem.priceDifference || 0) > 0
                                  ? `+${formatearPrecio(returnItem.priceDifference || 0)}`
                                  : (returnItem.priceDifference || 0) < 0
                                    ? formatearPrecio(
                                        returnItem.priceDifference || 0,
                                      )
                                    : "Sin diferencia"}
                              </p>
                            ) : (
                              <p className="font-bold text-red-900">
                                -{formatearPrecio(returnItem.refundAmount)}
                              </p>
                            )}
                            {returnItem.stockReturned && (
                              <p className="text-xs text-green-700">
                                Stock actualizado
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mb-2">
                          <p className="text-sm font-medium text-gray-700">
                            Motivo:
                          </p>
                          <p className="text-sm text-gray-600">
                            {returnItem.reason}
                          </p>
                        </div>

                        {/* Items devueltos */}
                        <div className="border-t pt-2 mt-2">
                          <p className="text-sm font-medium text-red-700 mb-1">
                            Items devueltos:
                          </p>
                          <ul className="space-y-1">
                            {returnItem.items.map((item, itemIndex) => (
                              <li
                                key={itemIndex}
                                className="text-sm text-gray-600 flex justify-between"
                              >
                                <span>
                                  {item.productName}{" "}
                                  {item.variantName && `(${item.variantName})`}{" "}
                                  - Cantidad: {item.quantityReturned}
                                </span>
                                <span className="font-medium text-red-600">
                                  -{formatearPrecio(item.refundAmount)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Forma de pago de la devolución pura */}
                        {!returnItem.isExchange &&
                          returnItem.refundPayment &&
                          (() => {
                            const rp = returnItem.refundPayment;
                            const acc = allAccounts.find(
                              (a) => a.id === rp.accountId,
                            );
                            const isNC =
                              rp.method === EPaymentMethod.CREDIT_NOTE ||
                              !!rp.creditNoteId;
                            return (
                              <div className="flex justify-between text-xs text-gray-600 mt-2 border-t pt-2">
                                <span>Forma de pago:</span>
                                <span>
                                  {isNC
                                    ? "Nota de crédito emitida"
                                    : `${PAYMENT_METHOD_LABELS[rp.method]}${
                                        acc ? ` → ${acc.name}` : ""
                                      }`}
                                </span>
                              </div>
                            );
                          })()}

                        {/* Items de cambio (solo si es un cambio) */}
                        {returnItem.isExchange &&
                          returnItem.exchangeItems &&
                          returnItem.exchangeItems.length > 0 && (
                            <div className="border-t pt-2 mt-2">
                              <p className="text-sm font-medium text-green-700 mb-1">
                                Items nuevos (cambio):
                              </p>
                              <ul className="space-y-1">
                                {returnItem.exchangeItems.map(
                                  (item, itemIndex) => (
                                    <li
                                      key={itemIndex}
                                      className="text-sm text-gray-600 flex justify-between"
                                    >
                                      <span>
                                        {item.productName}{" "}
                                        {item.variantName &&
                                          `(${item.variantName})`}{" "}
                                        - Cantidad: {item.quantity}
                                      </span>
                                      <span className="font-medium text-green-600">
                                        +{formatearPrecio(item.total)}
                                      </span>
                                    </li>
                                  ),
                                )}
                              </ul>
                            </div>
                          )}

                        {/* Resumen del cambio */}
                        {returnItem.isExchange && (
                          <div className="border-t pt-2 mt-2 bg-white/50 p-2 rounded">
                            <div className="flex justify-between text-sm">
                              <span>Valor devuelto:</span>
                              <span className="text-red-600">
                                -{formatearPrecio(returnItem.refundAmount)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span>Valor nuevo:</span>
                              <span className="text-green-600">
                                +
                                {formatearPrecio(returnItem.exchangeTotal || 0)}
                              </span>
                            </div>
                            <div className="flex justify-between font-medium border-t pt-1 mt-1">
                              <span>Diferencia:</span>
                              <span
                                className={
                                  (returnItem.priceDifference || 0) >= 0
                                    ? "text-orange-600"
                                    : "text-green-600"
                                }
                              >
                                {(returnItem.priceDifference || 0) > 0
                                  ? `Cliente pagó: ${formatearPrecio(returnItem.priceDifference || 0)}`
                                  : (returnItem.priceDifference || 0) < 0
                                    ? `Se devolvió: ${formatearPrecio(Math.abs(returnItem.priceDifference || 0))}`
                                    : "Sin diferencia"}
                              </span>
                            </div>
                            {returnItem.differencePayment && (() => {
                              const dp = returnItem.differencePayment;
                              const acc = allAccounts.find(
                                (a) => a.id === dp.accountId,
                              );
                              return (
                                <div className="flex justify-between text-xs text-gray-600 mt-1">
                                  <span>Forma de pago:</span>
                                  <span>
                                    {PAYMENT_METHOD_LABELS[dp.method]}
                                    {acc ? ` → ${acc.name}` : ""}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Resumen general */}
                  <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Total Original:</span>
                      <span>{formatearPrecio(typedSale.total)}</span>
                    </div>
                    <div className="flex justify-between items-center text-red-700 mb-2">
                      <span className="font-medium">Total Devuelto:</span>
                      <span>
                        -{formatearPrecio(typedSale.totalReturned || 0)}
                      </span>
                    </div>
                    {(typedSale.totalExchanged || 0) > 0 && (
                      <div className="flex justify-between items-center text-green-700 mb-2">
                        <span className="font-medium">
                          Total Cambios (nuevo):
                        </span>
                        <span>
                          +{formatearPrecio(typedSale.totalExchanged || 0)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-lg font-bold border-t pt-2">
                      <span>Total Final:</span>
                      <span className="text-blue-700">
                        {formatearPrecio(
                          typedSale.finalTotal || typedSale.total,
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}
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
                        (1 - manualItem.discount / 100),
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

      {/* Dialog para Item Manual en Cambio */}
      <Dialog open={showExchangeManualDialog} onOpenChange={setShowExchangeManualDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar item manual al cambio</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre del producto *</Label>
              <Input
                placeholder="Ej: Servicio de bordado"
                value={exchangeManualItem.productName}
                onChange={(e) =>
                  setExchangeManualItem((prev) => ({ ...prev, productName: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Variante / Medida</Label>
              <Input
                placeholder="Ej: Grande"
                value={exchangeManualItem.variantName}
                onChange={(e) =>
                  setExchangeManualItem((prev) => ({ ...prev, variantName: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  min="1"
                  value={exchangeManualItem.quantity}
                  onChange={(e) =>
                    setExchangeManualItem((prev) => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))
                  }
                />
              </div>
              <div>
                <Label>Precio unitario *</Label>
                <MoneyInput
                  placeholder="0"
                  value={exchangeManualItem.unitPrice || 0}
                  onValueChange={(n) =>
                    setExchangeManualItem((prev) => ({ ...prev, unitPrice: n }))
                  }
                />
              </div>
            </div>

            {exchangeManualItem.unitPrice > 0 && (
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-sm">
                  <div>Cantidad: {exchangeManualItem.quantity}</div>
                  <div>Precio unitario: {formatearPrecio(exchangeManualItem.unitPrice)}</div>
                  <div className="font-bold">
                    Subtotal: {formatearPrecio(exchangeManualItem.unitPrice * exchangeManualItem.quantity)}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExchangeManualDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddExchangeManualItem}
              disabled={!exchangeManualItem.productName || exchangeManualItem.unitPrice <= 0}
              className="bg-green-600 hover:bg-green-700"
            >
              Agregar Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Devolución/Cambio */}
      <Dialog
        open={showReturnDialog}
        onOpenChange={(open) => {
          setShowReturnDialog(open);
          if (!open) {
            setReturnItems({});
            setReturnReason("");
            setReturnToStock(true);
            setRefundPaymentMethod(EPaymentMethod.CASH);
            setRefundPaymentAccountId("");
            setIsExchangeMode(false);
            setExchangeItems([]);
            setDifferencePaymentMethod(EPaymentMethod.CASH);
            setDifferencePaymentAccountId("");
            setShowExchangeManualDialog(false);
            setExchangeManualItem({ productName: "", variantName: "", quantity: 1, unitPrice: 0 });
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isExchangeMode ? "Registrar Cambio" : "Registrar Devolución"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Toggle Devolución/Cambio */}
            <div className="flex items-center gap-4 p-3 bg-gray-100 rounded-lg">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isExchangeMode"
                  checked={isExchangeMode}
                  onCheckedChange={(checked) => {
                    setIsExchangeMode(checked as boolean);
                    if (!checked) setExchangeItems([]);
                  }}
                />
                <Label
                  htmlFor="isExchangeMode"
                  className="cursor-pointer font-medium"
                >
                  Es un cambio (el cliente se lleva otro producto)
                </Label>
              </div>
            </div>

            <div>
              <Label>Motivo *</Label>
              <Textarea
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder={
                  isExchangeMode
                    ? "Cambio de talle, cambio de modelo, etc."
                    : "Producto defectuoso, talla incorrecta, etc."
                }
                rows={2}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="returnToStock"
                checked={returnToStock}
                onCheckedChange={(checked) =>
                  setReturnToStock(checked as boolean)
                }
              />
              <Label htmlFor="returnToStock" className="cursor-pointer">
                Devolver productos al inventario
              </Label>
            </div>

            {/* Items a devolver */}
            <div className="border rounded-lg">
              <div className="bg-red-50 p-3 border-b">
                <h4 className="font-medium text-red-900">Items a devolver</h4>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Medida</TableHead>
                    <TableHead className="text-right">Cant. Original</TableHead>
                    <TableHead className="text-right">Precio Unit.</TableHead>
                    <TableHead className="text-right">
                      Cant. a Devolver
                    </TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typedSale?.items.map((item, index) => {
                    const returnQty = returnItems[index] || 0;
                    const refundAmount =
                      returnQty > 0
                        ? (item.total / item.quantity) * returnQty
                        : 0;

                    return (
                      <TableRow key={index}>
                        <TableCell>
                          {item.productName}
                          {item.isManual && (
                            <span className="text-xs text-gray-500 ml-2">
                              (Manual)
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{item.variantName || "N/A"}</TableCell>
                        <TableCell className="text-right">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatearPrecio(item.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            max={item.quantity}
                            value={returnQty}
                            onChange={(e) => {
                              const value = Math.min(
                                item.quantity,
                                Math.max(0, parseInt(e.target.value) || 0),
                              );
                              setReturnItems((prev) => ({
                                ...prev,
                                [index]: value,
                              }));
                            }}
                            className="w-20 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {returnQty > 0
                            ? `-${formatearPrecio(refundAmount)}`
                            : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Sección de productos nuevos (solo en modo cambio) */}
            {isExchangeMode && (
              <div className="border rounded-lg">
                <div className="bg-green-50 p-3 border-b flex items-start justify-between">
                  <div>
                    <h4 className="font-medium text-green-900">
                      Productos nuevos (lo que se lleva)
                    </h4>
                    <p className="text-sm text-green-700">
                      Agregue los productos que el cliente se lleva a cambio
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowExchangeManualDialog(true)}
                    className="shrink-0"
                  >
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    Item manual
                  </Button>
                </div>

                {/* Formulario para agregar producto nuevo */}
                <div className="p-4 border-b bg-gray-50 space-y-3">
                  {/* Producto y variante */}
                  <div className="grid grid-cols-2 gap-3">
                    <ProductAutocomplete
                      options={Object.entries(products).filter(([_, product]) => !isDeleted(product)).map(([id, product]) => {
                        const totalStock = product?.variants?.reduce((sum, v) => sum + Number(v.stock), 0) ?? 0;
                        return {
                          id,
                          label: product?.name || "Producto sin nombre",
                          disabled: totalStock <= 0,
                          sublabel: totalStock <= 0 ? "Sin stock" : `${totalStock} disp.`,
                          sublabelClassName: totalStock <= 0 ? "text-red-500" : totalStock < 5 ? "text-red-500" : "text-green-600",
                        };
                      })}
                      value={exchangeProductId}
                      onChange={setExchangeProductId}
                      placeholder="Buscar producto..."
                      className="h-9 bg-white"
                    />
                    <Select
                      value={exchangeVariantId}
                      onValueChange={handleExchangeVariantChange}
                      disabled={!exchangeProductId}
                    >
                      <SelectTrigger className="h-9 bg-white">
                        <SelectValue placeholder="Variante" />
                      </SelectTrigger>
                      <SelectContent className="max-h-48 overflow-y-auto">
                        {exchangeProductId &&
                          products[exchangeProductId]?.variants?.map(
                            (variant) => {
                              const stock = Number(variant.stock);
                              return (
                                <SelectItem
                                  key={variant.id}
                                  value={variant.id}
                                  disabled={stock <= 0}
                                  className={stock <= 0 ? "opacity-50" : ""}
                                >
                                  {variant.size}{" "}
                                  <span className={stock <= 0 ? "text-red-500" : stock < 5 ? "text-red-500" : "text-green-600"}>
                                    {stock > 0 ? `(${stock} disp.)` : "(Sin stock)"}
                                  </span>
                                </SelectItem>
                              );
                            },
                          )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Cantidad, precio y boton */}
                  <div className="flex items-end gap-3">
                    <div className="w-24">
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Cantidad</label>
                      <Input
                        type="number"
                        min="1"
                        value={exchangeQuantity}
                        onChange={(e) =>
                          setExchangeQuantity(Number(e.target.value))
                        }
                        className="h-9 bg-white"
                      />
                    </div>
                    <div className="w-32">
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Precio unit.</label>
                      <MoneyInput
                        value={exchangeUnitPrice || 0}
                        onValueChange={(n) => setExchangeUnitPrice(n)}
                        className="h-9 bg-white"
                        placeholder="0"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={handleAddExchangeItem}
                      disabled={
                        !exchangeProductId ||
                        !exchangeVariantId ||
                        exchangeQuantity <= 0 ||
                        exchangeUnitPrice <= 0
                      }
                      className="bg-green-600 hover:bg-green-700 h-9 flex-1"
                      size="sm"
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Agregar
                    </Button>
                  </div>
                </div>

                {/* Lista de productos nuevos agregados */}
                {exchangeItems.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Medida</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">
                          Precio Unit.
                        </TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-center">Quitar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exchangeItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.productName}</TableCell>
                          <TableCell>{item.variantName || "N/A"}</TableCell>
                          <TableCell className="text-right">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatearPrecio(item.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            +{formatearPrecio(item.total)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveExchangeItem(index)}
                              className="h-8 w-8 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {exchangeItems.length === 0 && (
                  <div className="p-4 text-center text-gray-500">
                    No hay productos nuevos agregados
                  </div>
                )}
              </div>
            )}

            {/* Resumen */}
            <div
              className={`p-4 rounded-lg ${isExchangeMode ? "bg-purple-50" : "bg-blue-50"}`}
            >
              {(() => {
                // Valor bruto de los items devueltos (sin descuento)
                const grossReturn = Object.entries(returnItems).reduce(
                  (total, [indexStr, qty]) => {
                    if (qty === 0) return total;
                    const index = parseInt(indexStr);
                    const item = typedSale?.items[index];
                    if (!item) return total;
                    return total + (item.total / item.quantity) * qty;
                  },
                  0,
                );

                // Aplicar descuento proporcional de la venta original
                // Ej: subtotal $70000, descuentos $10000, total $60000 → ratio = 60000/70000
                const saleSubtotal = typedSale?.subtotal || 0;
                const saleTotal = typedSale?.total || 0;
                const discountRatio = saleSubtotal > 0 ? saleTotal / saleSubtotal : 1;
                const totalReturn = redondearTotal(grossReturn * discountRatio);

                const totalExchange = exchangeItems.reduce(
                  (sum, item) => sum + item.total,
                  0,
                );
                const difference = totalExchange - totalReturn;

                const totalDiscount = redondearTotal(grossReturn - totalReturn);
                const hasDiscount = discountRatio < 1;

                return (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span>Valor de lo devuelto:</span>
                      <span className="font-medium text-red-600">
                        -{formatearPrecio(totalReturn)}
                      </span>
                    </div>

                    {hasDiscount && (
                      <div className="flex justify-between items-center text-sm text-gray-500">
                        <span>Descuento aplicado en la compra:</span>
                        <span>-{formatearPrecio(totalDiscount)}</span>
                      </div>
                    )}

                    {isExchangeMode && (
                      <>
                        <div className="flex justify-between items-center">
                          <span>Valor de lo nuevo:</span>
                          <span className="font-medium text-green-600">
                            +{formatearPrecio(totalExchange)}
                          </span>
                        </div>
                        <div className="border-t pt-2 mt-2">
                          <div className="flex justify-between items-center">
                            <span className="font-bold">Diferencia:</span>
                            <span
                              className={`text-lg font-bold ${difference > 0 ? "text-orange-600" : difference < 0 ? "text-green-600" : "text-gray-600"}`}
                            >
                              {difference > 0
                                ? `Cliente debe: ${formatearPrecio(difference)}`
                                : difference < 0
                                  ? `Devolver al cliente: ${formatearPrecio(Math.abs(difference))}`
                                  : "Sin diferencia"}
                            </span>
                          </div>
                        </div>

                        {/* Forma de pago de la diferencia */}
                        {difference !== 0 && (() => {
                          const isRefund = difference < 0;
                          const allowCreditNote =
                            isRefund && !!typedSale.clientId;
                          const methodOptions: EPaymentMethod[] = [
                            EPaymentMethod.CASH,
                            EPaymentMethod.CREDIT_CARD,
                            EPaymentMethod.DEBIT_CARD,
                            EPaymentMethod.TRANSFER,
                            EPaymentMethod.MERCADOPAGO,
                            EPaymentMethod.CHECK,
                            ...(allowCreditNote
                              ? [EPaymentMethod.CREDIT_NOTE]
                              : []),
                          ];
                          const isCreditNote =
                            differencePaymentMethod === EPaymentMethod.CREDIT_NOTE;
                          const accountDisabled =
                            differencePaymentMethod === EPaymentMethod.CREDIT_CARD ||
                            differencePaymentMethod === EPaymentMethod.DEBIT_CARD ||
                            isCreditNote;
                          const allowedTypes =
                            PAYMENT_METHOD_ACCOUNT_TYPES[differencePaymentMethod]
                              ?.length
                              ? PAYMENT_METHOD_ACCOUNT_TYPES[differencePaymentMethod]
                              : undefined;
                          const autoAccount =
                            accountDisabled && differencePaymentAccountId && !isCreditNote
                              ? allAccounts.find(
                                  (a) => a.id === differencePaymentAccountId,
                                )
                              : null;
                          return (
                            <div className="border-t pt-3 mt-2 space-y-2">
                              <Label className="text-sm font-medium">
                                {isRefund
                                  ? "Cómo se devuelve la diferencia al cliente"
                                  : "Cómo paga el cliente la diferencia"}
                              </Label>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">Método</Label>
                                  <Select
                                    value={differencePaymentMethod}
                                    onValueChange={(value) => {
                                      const newMethod = value as EPaymentMethod;
                                      setDifferencePaymentMethod(newMethod);
                                      if (
                                        newMethod === EPaymentMethod.CREDIT_NOTE
                                      ) {
                                        setDifferencePaymentAccountId("");
                                      } else {
                                        const def = getDefaultAccountId(
                                          paymentDefaults,
                                          "sales",
                                          newMethod,
                                        );
                                        setDifferencePaymentAccountId(def || "");
                                      }
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Método" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {methodOptions.map((m) => (
                                        <SelectItem key={m} value={m}>
                                          {PAYMENT_METHOD_LABELS[m]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">
                                    {isCreditNote
                                      ? "Cuenta"
                                      : differencePaymentMethod ===
                                          EPaymentMethod.CASH
                                        ? "Caja / cuenta"
                                        : "Cuenta"}
                                  </Label>
                                  <AccountSelect
                                    value={differencePaymentAccountId}
                                    onChange={(value) =>
                                      setDifferencePaymentAccountId(value)
                                    }
                                    allowedTypes={allowedTypes}
                                    disabled={accountDisabled}
                                    placeholder={
                                      isCreditNote
                                        ? "No aplica"
                                        : differencePaymentMethod ===
                                            EPaymentMethod.CASH
                                          ? "Ej: Efectivo Banderas"
                                          : "Seleccionar cuenta"
                                    }
                                  />
                                </div>
                              </div>
                              {autoAccount && (
                                <p className="text-xs text-gray-600">
                                  Se registrará en:{" "}
                                  <strong>{autoAccount.name}</strong>
                                  {autoAccount.referenceNumber
                                    ? ` (N° ${autoAccount.referenceNumber})`
                                    : ""}
                                </p>
                              )}
                              {isCreditNote && (
                                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2">
                                  Se generará una NC por{" "}
                                  {formatearPrecio(Math.abs(difference))} a favor
                                  de {typedSale.clientName ?? "este cliente"}.
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    )}

                    {!isExchangeMode && (
                      <div className="border-t pt-2 mt-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold">Total a reembolsar:</span>
                          <span className="text-lg font-bold text-blue-900">
                            {formatearPrecio(totalReturn)}
                          </span>
                        </div>

                        {totalReturn > 0 && (() => {
                          const allowCreditNote = !!typedSale.clientId;
                          const methodOptions: EPaymentMethod[] = [
                            EPaymentMethod.CASH,
                            EPaymentMethod.CREDIT_CARD,
                            EPaymentMethod.DEBIT_CARD,
                            EPaymentMethod.TRANSFER,
                            EPaymentMethod.MERCADOPAGO,
                            EPaymentMethod.CHECK,
                            ...(allowCreditNote
                              ? [EPaymentMethod.CREDIT_NOTE]
                              : []),
                          ];
                          const isCreditNote =
                            refundPaymentMethod === EPaymentMethod.CREDIT_NOTE;
                          const accountDisabled =
                            refundPaymentMethod === EPaymentMethod.CREDIT_CARD ||
                            refundPaymentMethod === EPaymentMethod.DEBIT_CARD ||
                            isCreditNote;
                          const allowedTypes =
                            PAYMENT_METHOD_ACCOUNT_TYPES[refundPaymentMethod]
                              ?.length
                              ? PAYMENT_METHOD_ACCOUNT_TYPES[refundPaymentMethod]
                              : undefined;
                          const autoAccount =
                            accountDisabled && refundPaymentAccountId && !isCreditNote
                              ? allAccounts.find(
                                  (a) => a.id === refundPaymentAccountId,
                                )
                              : null;
                          return (
                            <div className="border-t pt-3 mt-3 space-y-2">
                              <Label className="text-sm font-medium">
                                Cómo se devuelve al cliente
                              </Label>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">Método</Label>
                                  <Select
                                    value={refundPaymentMethod}
                                    onValueChange={(value) => {
                                      const newMethod = value as EPaymentMethod;
                                      setRefundPaymentMethod(newMethod);
                                      if (
                                        newMethod === EPaymentMethod.CREDIT_NOTE
                                      ) {
                                        setRefundPaymentAccountId("");
                                      } else {
                                        const def = getDefaultAccountId(
                                          paymentDefaults,
                                          "sales",
                                          newMethod,
                                        );
                                        setRefundPaymentAccountId(def || "");
                                      }
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Método" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {methodOptions.map((m) => (
                                        <SelectItem key={m} value={m}>
                                          {PAYMENT_METHOD_LABELS[m]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">
                                    {isCreditNote
                                      ? "Cuenta"
                                      : refundPaymentMethod ===
                                          EPaymentMethod.CASH
                                        ? "Caja / cuenta"
                                        : "Cuenta"}
                                  </Label>
                                  <AccountSelect
                                    value={refundPaymentAccountId}
                                    onChange={(value) =>
                                      setRefundPaymentAccountId(value)
                                    }
                                    allowedTypes={allowedTypes}
                                    disabled={accountDisabled}
                                    placeholder={
                                      isCreditNote
                                        ? "No aplica"
                                        : refundPaymentMethod ===
                                            EPaymentMethod.CASH
                                          ? "Ej: Efectivo Banderas"
                                          : "Seleccionar cuenta"
                                    }
                                  />
                                </div>
                              </div>
                              {autoAccount && (
                                <p className="text-xs text-gray-600">
                                  Se registrará en:{" "}
                                  <strong>{autoAccount.name}</strong>
                                  {autoAccount.referenceNumber
                                    ? ` (N° ${autoAccount.referenceNumber})`
                                    : ""}
                                </p>
                              )}
                              {isCreditNote && (
                                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2">
                                  Se generará una NC por{" "}
                                  {formatearPrecio(totalReturn)} a favor de{" "}
                                  {typedSale.clientName ?? "este cliente"}.
                                  Podrá usarse en una próxima orden o
                                  facturación.
                                </p>
                              )}
                              {!allowCreditNote && (
                                <p className="text-xs text-slate-500">
                                  Sin cliente registrado: no se puede emitir
                                  nota de crédito.
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowReturnDialog(false);
                setReturnItems({});
                setReturnReason("");
                setReturnToStock(true);
                setRefundPaymentMethod(EPaymentMethod.CASH);
                setRefundPaymentAccountId("");
                setIsExchangeMode(false);
                setExchangeItems([]);
                setDifferencePaymentMethod(EPaymentMethod.CASH);
                setDifferencePaymentAccountId("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleProcessReturn}
              disabled={isLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              {isLoading
                ? "Procesando..."
                : isExchangeMode
                  ? "Procesar Cambio"
                  : "Procesar Devolución"}
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
                            .includes(clienteInput.toLowerCase()),
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
                            onMouseEnter={() =>
                              setHighlightedClientIndex(index)
                            }
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
                <Input value={cuit} onChange={(e) => setCuit(e.target.value)} />
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
