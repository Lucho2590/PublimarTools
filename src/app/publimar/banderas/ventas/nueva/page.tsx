"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { CuitInput } from "@/components/cuit-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import { isDeleted } from "@/lib/softDelete";
import { TProduct, TProductCategory, TProductVariant } from "@/types/product";
import { EPaymentMethod, ESaleDepartment, PAYMENT_METHOD_ACCOUNT_TYPES, TFactura, TSaleFormaPago } from "@/types/sale";
import { useQuotes } from "@/hooks/useQuotes";
import { EQuoteStatus, TQuote } from "@/types/quote";
import { formatearPrecio, redondearADecena, redondearTotal, formatDateString } from "@/lib/utils";
import {
  calcDocumentTotals,
  calcItemDiscountAmount,
  calcItemGross,
  calcItemNet,
  formatItemDiscount,
  resolveItemDiscount,
  TDiscountType,
} from "@/lib/totals";
import { DiscountInput } from "@/components/admin/DiscountInput";
import { useClients } from "@/hooks/useClients";
import { EClientSection } from "@/types/client";
import { useAuditLog } from "@/hooks/useAuditLog";
import { AccountSelect } from "@/components/admin/AccountSelect";
import { createSale } from "@/lib/sales";
import { variantDiscountsStock } from "@/lib/stock";
import { useAuth } from "@/contexts/AuthContext";
import { useAccounts } from "@/hooks/useAccounts";
import {
  usePaymentAccountDefaults,
  getDefaultAccountId,
} from "@/hooks/usePaymentAccountDefaults";

interface SaleItem {
  id: string;
  product: TProduct;
  variant: TProductVariant;
  quantity: number;
  unitPrice: number;
  /** Descuento de la línea: % o $ según `discountType` (default: %). */
  discount?: number;
  discountType?: TDiscountType;
  /** Importe de la línea ya descontado. */
  total: number;
}

export default function NuevaVentaPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { logEvent } = useAuditLog();
  const { userRole } = useAuth();
  const { accounts: allAccounts } = useAccounts({ includeArchived: true });
  const { defaults: paymentDefaults } = usePaymentAccountDefaults();

  // Hook de clientes - Solo clientes de la sección "banderas"
  const {
    clients,
    loading: clientsLoading,
    createClient
  } = useClients({ section: EClientSection.BANDERAS });

  // Hook de presupuestos para importar
  const { quotes } = useQuotes();

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
  const [formasPago, setFormasPago] = useState<TSaleFormaPago[]>([
    {
      id: `fp-${Date.now()}`,
      method: EPaymentMethod.CASH,
      amount: 0,
      accountId: "",
      bank: "",
    },
  ]);
  const defaultsAppliedRef = useRef(false);
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
    discountType: "percent" as TDiscountType,
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

  // Estados para importar presupuestos del cliente
  const [clientQuotes, setClientQuotes] = useState<TQuote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [showQuoteSelector, setShowQuoteSelector] = useState(false);

  // Cálculo canónico compartido: primero el descuento de cada ítem (ya dentro
  // de `subtotal`), después el general sobre ese subtotal ya descontado.
  const totals = calcDocumentTotals({
    items,
    applyIVA,
    discountPercentage,
    manualDiscount,
  });
  const taxRate = totals.taxRate;
  const grossSubtotal = totals.grossSubtotal;
  const itemsDiscountAmount = totals.itemsDiscountAmount;
  const subtotal = totals.subtotal;
  const taxAmount = totals.taxAmount;
  const subtotalSinIVA = totals.subtotalSinIVA;
  const discountAmount = totals.generalDiscountAmount;
  const calculatedTotal = totals.total;
  const total = manualTotal !== null ? manualTotal : calculatedTotal;

  // Suma de las formas de pago que NO son la primera.
  const othersSum = formasPago
    .slice(1)
    .reduce((s, fp) => s + (fp.amount || 0), 0);

  // La primera forma de pago se autocompleta con el resto (total − las demás).
  // Editable: si el usuario la pisa a mano, su valor persiste hasta que cambie
  // otra forma o el total/descuento (ahí se recalcula). No genera loop porque sólo
  // escribe prev[0].amount, que no afecta othersSum (slice(1)) ni length.
  useEffect(() => {
    setFormasPago((prev) => {
      if (!prev.length) return prev;
      const remaining = Math.max(0, redondearTotal(total - othersSum));
      if (Math.abs((prev[0].amount || 0) - remaining) < 0.001) return prev;
      return [{ ...prev[0], amount: remaining }, ...prev.slice(1)];
    });
  }, [total, othersSum, formasPago.length]);

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
    setFormasPago([
      {
        id: `fp-${Date.now()}`,
        method: EPaymentMethod.CASH,
        amount: 0,
        accountId: "",
        bank: "",
      },
    ]);
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

    // Filtrar presupuestos del cliente seleccionado (CONFIRMED o SENT)
    const filteredQuotes = quotes.filter(
      (q) =>
        q.client?.id === clientId &&
        (q.status === EQuoteStatus.CONFIRMED || q.status === EQuoteStatus.SENT)
    );
    setClientQuotes(filteredQuotes);
    setSelectedQuoteId(null);
    setShowQuoteSelector(false);
  };

  // Importar items de un presupuesto
  const handleImportQuoteItems = (quoteId: string) => {
    const quote = clientQuotes.find((q) => q.id === quoteId);
    if (!quote?.items) return;

    const importedItems: SaleItem[] = quote.items.map((item: any, index: number) => {
      const isManualItem =
        item.isManual ||
        (typeof item.productId === "string" && item.productId.startsWith("manual-"));

      const productId = item.product?.id || item.productId || `manual-${Date.now()}-${index}`;
      const variantId = item.variant?.id || item.variantId || `manual-variant-${Date.now()}-${index}`;
      const productName = item.product?.name || item.productName || "";
      const variantName = item.variant?.size || item.variantName || "";

      const product: any = item.product ?? {
        id: productId,
        name: productName,
        description: item.description || "",
        variants: [],
      };
      const variant: any = item.variant ?? {
        id: variantId,
        size: variantName,
        stock: 0,
        price: item.unitPrice,
      };

      const quantity = item.quantity || 1;
      const unitPrice = item.unitPrice || 0;
      // El subtotal del presupuesto ya viene con el descuento de línea adentro;
      // si el presupuesto es viejo y no declara el descuento, se reconstruye.
      const { discount, discountType } = resolveItemDiscount(
        {
          quantity,
          unitPrice,
          discount: Number(item.discount) || 0,
          discountType: item.discountType,
        },
        typeof item.subtotal === "number" ? item.subtotal : null,
      );

      return {
        id: `imported_${Date.now()}_${index}`,
        product: isManualItem
          ? { ...product, id: productId.startsWith("manual-") ? productId : `manual-${productId}` }
          : product,
        variant,
        quantity,
        unitPrice,
        discount,
        discountType,
        total: calcItemNet({ quantity, unitPrice, discount, discountType }),
      };
    });

    setItems(importedItems);

    // Los descuentos y el IVA son del presupuesto, no de los items: si no se copian
    // acá, la venta queda con el precio sin descontar.
    const quoteDiscountPercentage = Number(quote.discountPercentage) || 0;
    const quoteManualDiscount = Number(quote.manualDiscount) || 0;

    setApplyIVA(quote.applyIVA ?? false);
    setDiscountPercentage(quoteDiscountPercentage);
    setManualDiscount(quoteManualDiscount);
    // El total manual tiene prioridad sobre el calculado: si quedó uno de antes,
    // el descuento importado no se vería reflejado.
    setManualTotal(null);

    setSelectedQuoteId(quoteId);
    setShowQuoteSelector(false);
    toast.success(
      quoteDiscountPercentage > 0 || quoteManualDiscount > 0
        ? `Items y descuentos importados del presupuesto ${quote.number}`
        : `Items importados del presupuesto ${quote.number}`
    );
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
        // (salvo que el patch ya traiga una cuenta elegida explícitamente).
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

  // Precargar la cuenta por defecto en la forma de pago inicial (una sola vez,
  // cuando ya cargó la configuración y el usuario no eligió cuenta todavía).
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!paymentDefaults?.sales) return;
    setFormasPago((prev) => {
      if (prev.length !== 1 || prev[0].accountId) return prev;
      const def = getDefaultAccountId(
        paymentDefaults,
        "sales",
        prev[0].method,
      );
      if (!def) return prev;
      defaultsAppliedRef.current = true;
      return [{ ...prev[0], accountId: def }];
    });
  }, [paymentDefaults]);

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
        cuit: cuit || "", 
        address: direccion || "",
        email: email || "",
        phone: telefono || "",
        section: EClientSection.BANDERAS,
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

  // Cantidad de productos activos (sin eliminados) para los contadores
  const activeProductsCount = useMemo(
    () => (products ?? []).filter((p) => !isDeleted(p)).length,
    [products]
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

  // Filtrar productos con filtro súper combinado (memoizado)
  const sortedProducts = useMemo(() => {
    const filtered = products?.reduce((unique: TProduct[], product) => {
      if (isDeleted(product)) return unique;
      const typedProduct = product as unknown as TProduct;
      const exists = unique.find((p) => p.name === typedProduct.name);
      if (exists) return unique;

      // Filtro de búsqueda combinada
      if (searchTerm.trim()) {
        const terminos = searchTerm
          .toLowerCase()
          .split(/[,\s]+/)
          .filter((term) => term.trim().length > 0);

        const textoCompleto = [
          typedProduct.name,
          typedProduct.sku,
          ...(typedProduct.variants
            ?.map((v) => [v.size, v.sku, v.price?.toString(), v.stock?.toString()])
            .flat() || []),
          typedProduct.categories
            ?.map((id) => {
              const category = categories?.find(
                (c) => (c as unknown as TProductCategory).id === id
              );
              return category ? (category as unknown as TProductCategory).name : "";
            })
            .filter(Boolean)
            .join(", ") || "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const matchesSearch = terminos.every((termino) =>
          textoCompleto.includes(termino)
        );
        if (!matchesSearch) return unique;
      }

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

    // Ordenar por popularidad (más vendidos primero)
    return filtered?.sort((a, b) => {
      const salesA = (a as any).salesCount || 0;
      const salesB = (b as any).salesCount || 0;
      return salesB - salesA;
    });
  }, [products, searchTerm, selectedCategory, categories]);

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
      if (
        variantDiscountsStock(existingItem.variant) &&
        newQuantity > Number(existingItem.variant.stock)
      ) {
        toast.error("No hay suficiente stock disponible");
        return;
      }
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== existingItem.id) return item;
          const next = { ...item, quantity: newQuantity };
          return { ...next, total: calcItemNet(next) };
        })
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
              discount: 0,
              discountType: "percent",
              total: redondearTotal(Number(selectedVariant.price) * quantity),
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

  /** Descuento de una línea (% o $ sobre el total de la línea). */
  const updateItemDiscount = (
    itemId: string,
    patch: { discount?: number; discountType?: TDiscountType }
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const next = { ...item, ...patch };
        return { ...next, total: calcItemNet(next) };
      })
    );
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
      // El descuento se persiste, no se disuelve en el total: así se puede
      // ver y editar después desde el detalle de la venta.
      discount: manualItem.discount,
      discountType: manualItem.discountType,
      total: calcItemNet(manualItem),
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
      discountType: "percent",
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
      // Recalcular al momento del submit para asegurar que están actualizados
      const currentTotals = calcDocumentTotals({
        items,
        applyIVA,
        discountPercentage,
        manualDiscount,
      });
      const currentSubtotal = currentTotals.subtotal;
      const currentTaxAmount = currentTotals.taxAmount;
      const currentSubtotalSinIVA = currentTotals.subtotalSinIVA;
      const currentDiscountAmount = currentTotals.generalDiscountAmount;
      const currentTotal =
        manualTotal !== null ? manualTotal : currentTotals.total;

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

      // Normalizar formas de pago (sólo las que tengan monto > 0)
      const formasPagoValidas: TSaleFormaPago[] = formasPago
        .filter((fp) => fp.amount > 0)
        .map((fp) => ({
          id: fp.id,
          method: fp.method,
          amount: redondearTotal(fp.amount),
          accountId: fp.accountId || null,
          bank: fp.method === EPaymentMethod.TRANSFER ? fp.bank || null : null,
        }));

      // Método de pago derivado para retrocompatibilidad
      const derivedPaymentMethod =
        formasPagoValidas.length === 0
          ? formasPago[0]?.method || EPaymentMethod.CASH
          : formasPagoValidas.length === 1
            ? formasPagoValidas[0].method
            : formasPagoValidas.reduce((a, b) => (a.amount > b.amount ? a : b)).method;

      const derivedBank =
        derivedPaymentMethod === EPaymentMethod.TRANSFER
          ? formasPagoValidas.find((fp) => fp.method === EPaymentMethod.TRANSFER)?.bank || null
          : null;

      const primaryAccountId =
        formasPagoValidas.find((fp) => !!fp.accountId)?.accountId || null;

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
          discount: Number(item.discount || 0),
          discountType: item.discountType || "percent",
          total: redondearTotal(item.total),
        })),
        subtotal: redondearTotal(
          applyIVA ? currentSubtotalSinIVA : currentSubtotal
        ),
        department: ESaleDepartment.BANDERAS,
        total: redondearTotal(currentTotal),
        applyIVA,
        taxRate: 21,
        taxAmount: redondearTotal(currentTaxAmount),
        discountPercentage,
        discountAmount: redondearTotal(currentDiscountAmount),
        manualDiscount: redondearTotal(manualDiscount),
        paymentMethod: derivedPaymentMethod,
        bank: derivedBank,
        accountId: primaryAccountId,
        formasPago: formasPagoValidas,
        invoiceNumber: isInvoiced ? invoiceNumber : null,
        facturas: facturas.length > 0 ? facturas : [],
        // Datos del cliente (solo se incluyen si tienen valor)
        ...clientData,
      };

      await createSale(firestore, logEvent, userRole || "", {
        saleData,
        items,
        formasPagoValidas,
        allAccounts,
        clienteInput,
        total: currentTotal,
      });

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
            <p className="text-slate-600 text-sm mt-1">
              Registrá una nueva venta en el sistema
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sección Cliente */}
        <Card className="border-0 shadow-sm">
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

            {/* Selector de presupuestos del cliente */}
            {cliente && clientQuotes.length > 0 && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-700">
                    Este cliente tiene {clientQuotes.length} presupuesto(s) disponible(s)
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowQuoteSelector(!showQuoteSelector)}
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    Importar presupuesto
                  </Button>
                </div>

                {showQuoteSelector && (
                  <div className="mt-2 space-y-2">
                    {clientQuotes.map((quote) => (
                      <div
                        key={quote.id}
                        className={`flex items-center justify-between p-2 bg-white rounded border cursor-pointer hover:bg-gray-50 ${
                          selectedQuoteId === quote.id ? "border-blue-500" : ""
                        }`}
                        onClick={() => handleImportQuoteItems(quote.id)}
                      >
                        <div>
                          <span className="font-medium">{quote.number}</span>
                          <span className="text-sm text-gray-500 ml-2">
                            {formatearPrecio(quote.total)}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {quote.items?.length || 0} items
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                <CuitInput
                  value={cuit}
                  onValueChange={setCuit}
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
        <Card className="border-0 shadow-sm">
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
              {sortedProducts?.length === activeProductsCount
                ? `${activeProductsCount} productos disponibles`
                : `${sortedProducts?.length || 0} de ${activeProductsCount} productos`}
            </div>

            {/* Lista compacta de productos */}
            <div className="space-y-1 max-h-96 overflow-y-auto border rounded-lg p-2">
              {paginatedProducts?.map((product) => {
                const typedProduct = product as unknown as TProduct;
                const selectedVariant = typedProduct.variants?.find(
                  (v) => v.id === selectedVariants[typedProduct.id]
                );

                // Verificar si hay al menos una variante disponible
                // (las que no descuentan stock siempre están disponibles).
                const hasAvailableStock = typedProduct.variants?.some(
                  (v) => !variantDiscountsStock(v) || Number(v.stock) > 0
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
                          {(typedProduct as any).salesCount > 0 && (
                            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded whitespace-nowrap">
                              🔥 {(typedProduct as any).salesCount} vendidos
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
                              disabled={
                                variantDiscountsStock(variant) &&
                                Number(variant.stock) === 0
                              }
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>{variant.size}</span>
                                <span
                                  className={`text-xs ml-2 ${
                                    !variantDiscountsStock(variant)
                                      ? "text-gray-400"
                                      : Number(variant.stock) === 0
                                      ? "text-red-500"
                                      : Number(variant.stock) <= 5
                                      ? "text-orange-500"
                                      : "text-green-600"
                                  }`}
                                >
                                  {!variantDiscountsStock(variant)
                                    ? "libre"
                                    : variant.stock === Infinity
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
                          selectedVariant
                            ? variantDiscountsStock(selectedVariant)
                              ? Number(selectedVariant.stock)
                              : undefined
                            : 1
                        }
                        value={currentQuantity}
                        onChange={(e) => {
                          if (!isSelected) return;

                          const newValue = parseInt(e.target.value);
                          if (!selectedVariant) return;

                          if (
                            newValue >= 0 &&
                            (!variantDiscountsStock(selectedVariant) ||
                              newValue <= Number(selectedVariant.stock))
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
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Productos Seleccionados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {items.map((item) => {
                  const hasDiscount = Number(item.discount || 0) > 0;
                  return (
                    <div key={item.id} className="border-b pb-3 last:border-b-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{item.product.name}</p>
                          <p className="text-sm text-gray-500">
                            {item.variant.size} |{" "}
                            {formatearPrecio(item.unitPrice)} c/u
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
                            <span className="w-8 text-center">
                              {item.quantity}
                            </span>
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
                          <div className="w-24 text-right">
                            {hasDiscount && (
                              <p className="text-xs text-gray-400 line-through">
                                {formatearPrecio(calcItemGross(item))}
                              </p>
                            )}
                            <p>{formatearPrecio(item.total)}</p>
                          </div>
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
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-xs text-gray-500">Descuento</span>
                        <DiscountInput
                          size="sm"
                          value={item.discount || 0}
                          type={item.discountType || "percent"}
                          onValueChange={(discount) =>
                            updateItemDiscount(item.id, { discount })
                          }
                          onTypeChange={(discountType) =>
                            updateItemDiscount(item.id, { discountType })
                          }
                          inputClassName="w-28"
                        />
                        {hasDiscount && (
                          <span className="text-xs text-green-600">
                            −{formatearPrecio(calcItemDiscountAmount(item))}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="border-t pt-4">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-gray-700">Subtotal</p>
                      <p className="font-semibold">
                        {formatearPrecio(grossSubtotal)}
                      </p>
                    </div>

                    {itemsDiscountAmount > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <p className="text-gray-700">Descuento en ítems</p>
                        <p className="text-red-600">
                          -{formatearPrecio(itemsDiscountAmount)}
                        </p>
                      </div>
                    )}

                    {itemsDiscountAmount > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <p className="text-gray-700">Subtotal con descuentos</p>
                        <p className="font-medium">
                          {formatearPrecio(subtotal)}
                        </p>
                      </div>
                    )}

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
                          Desc. general (%)
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
                          Desc. general ($)
                        </Label>
                        <MoneyInput
                          id="manualDiscount"
                          value={manualDiscount || 0}
                          onValueChange={(n) => setManualDiscount(n)}
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
                        {formatearPrecio(calcItemDiscountAmount(manualItem))})
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
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Detalles de Pago</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Múltiples formas de pago */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Formas de Pago</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addFormaPago}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar forma de pago
                  </Button>
                </div>

                {formasPago.map((fp) => (
                  <div
                    key={fp.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border rounded-md p-3 bg-slate-50"
                  >
                    <div className="md:col-span-4 space-y-1">
                      <Label className="text-xs">Método</Label>
                      <Select
                        value={fp.method}
                        onValueChange={(value) =>
                          updateFormaPago(fp.id, { method: value as EPaymentMethod })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Método" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EPaymentMethod.CASH}>Efectivo</SelectItem>
                          <SelectItem value={EPaymentMethod.CREDIT_CARD}>Tarjeta de Crédito</SelectItem>
                          <SelectItem value={EPaymentMethod.DEBIT_CARD}>Tarjeta de Débito</SelectItem>
                          <SelectItem value={EPaymentMethod.TRANSFER}>Transferencia</SelectItem>
                          <SelectItem value={EPaymentMethod.MERCADOPAGO}>MercadoPago</SelectItem>
                          <SelectItem value={EPaymentMethod.CHECK}>Cheque</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-3 space-y-1">
                      <Label className="text-xs">Monto</Label>
                      <MoneyInput
                        value={fp.amount || 0}
                        onValueChange={(amount) =>
                          updateFormaPago(fp.id, { amount })
                        }
                        placeholder="0"
                      />
                    </div>
                    <div className="md:col-span-4 space-y-1">
                      <Label className="text-xs">
                        {fp.method === EPaymentMethod.CASH ? "Caja / cuenta" : "Cuenta destino"} (opcional)
                      </Label>
                      <AccountSelect
                        value={fp.accountId || ""}
                        onChange={(value) => updateFormaPago(fp.id, { accountId: value })}
                        allowedTypes={
                          PAYMENT_METHOD_ACCOUNT_TYPES[fp.method]?.length
                            ? PAYMENT_METHOD_ACCOUNT_TYPES[fp.method]
                            : undefined
                        }
                        disabled={
                          fp.method === EPaymentMethod.CREDIT_CARD ||
                          fp.method === EPaymentMethod.DEBIT_CARD
                        }
                        placeholder={
                          fp.method === EPaymentMethod.CASH
                            ? "Ej: Efectivo Banderas"
                            : "Seleccionar cuenta"
                        }
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-end">
                      {formasPago.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFormaPago(fp.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {(() => {
                  const sumaFormas = formasPago.reduce((s, fp) => s + (fp.amount || 0), 0);
                  const diferencia = redondearTotal(total - sumaFormas);
                  const cuadra = Math.abs(diferencia) < 0.01;
                  return (
                    <div className="flex items-center justify-between text-sm px-1">
                      <span className="text-gray-600">
                        Suma formas de pago: {formatearPrecio(sumaFormas)}
                        <span className="mx-2 text-gray-400">|</span>
                        Total de la venta: {formatearPrecio(total)}
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
                          : `Diferencia: ${formatearPrecio(diferencia)}`}
                      </span>
                    </div>
                  );
                })()}
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
            </div>
          </CardContent>
        </Card>

        {/* Footer con botones */}
        <Card className="border-0 shadow-sm">
          <CardFooter className="flex justify-end gap-4 pt-6">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-blue-900 hover:bg-blue-800 text-white"
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
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
