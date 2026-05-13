"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CuitInput } from "@/components/cuit-input";
import { formatCuit } from "@/lib/cuit";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "reactfire";
import { redirect, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
  Search,
  Plus,
  Trash2,
  Edit,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  formatDate,
  formatearPrecio,
  redondearTotal,
  formatDateString,
} from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { TProduct, TProductVariant } from "@/types/product";
import { toast } from "sonner";
import { EPaymentMethod } from "@/types/sale";
import { EOrderStatus, TFactura, TPaymentHistory } from "@/types/order";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection } from "firebase/firestore";
import collections from "@/lib/collections";

// Hooks personalizados
import { useOrders } from "@/hooks/useOrders";
import { useClients } from "@/hooks/useClients";
import { useQuotes } from "@/hooks/useQuotes";
import { EClientStatus, EClientSection } from "@/types/client";
import { EQuoteStatus, TQuote } from "@/types/quote";
import { ClientCreditBanner } from "@/components/admin/ClientCreditBanner";
import { applyCreditNoteToDocument } from "@/lib/creditNotes";

export default function NuevasOrdenesPage() {
  const router = useRouter();
  const { data: user } = useUser();
  const firestore = useFirestore();

  // Hooks personalizados
  const { createOrder, generateOrderNumber, createOrderWithDefaults } =
    useOrders();

  const {
    clients,
    loading: clientsLoading,
    createClient,
  } = useClients({ section: EClientSection.BANDERAS });

  const { quotes, loading: quotesLoading } = useQuotes();

  // Estados para presupuestos del cliente
  const [clientQuotes, setClientQuotes] = useState<TQuote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [showQuoteSelector, setShowQuoteSelector] = useState(false);
  console.log("Quotes del cliente:", clientQuotes);

  // Productos
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { status: productsStatus, data: products } = useFirestoreCollectionData(
    productsCollection,
    { idField: "id" },
  );

  // Estado: nota de crédito seleccionada (a aplicar tras crear la orden)
  const [selectedCreditNoteId, setSelectedCreditNoteId] = useState<string | null>(null);

  // Estados para los campos principales
  const [cliente, setCliente] = useState("");
  const [personaContacto, setPersonaContacto] = useState("");
  const [direccion, setDireccion] = useState("");
  const [email, setEmail] = useState("");
  const [cuit, setCuit] = useState("");
  const [detalle, setDetalle] = useState("");
  const [fechaEntrada] = useState(() => new Date().toISOString().split("T")[0]);
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [costoUnidad, setCostoUnidad] = useState("");
  const [precioUnidad, setPrecioUnidad] = useState("");
  const [costoTotal, setCostoTotal] = useState("");
  const [precioTotal, setPrecioTotal] = useState("");
  const [iva, setIva] = useState("21");
  const [totalNeto, setTotalNeto] = useState("");
  // Estados para múltiples facturas
  const [facturas, setFacturas] = useState<TFactura[]>([]);
  const [showAddFactura, setShowAddFactura] = useState(false);
  const [editingFacturaId, setEditingFacturaId] = useState<string | null>(null);

  // Estados para el formulario de nueva factura
  const [newFacturaTipo, setNewFacturaTipo] = useState("");
  const [newFacturaNumero, setNewFacturaNumero] = useState("");
  const [newFacturaFecha, setNewFacturaFecha] = useState("");
  const [newFacturaMonto, setNewFacturaMonto] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [sena, setSena] = useState("");
  const [metodoPagoSena, setMetodoPagoSena] = useState<EPaymentMethod>(
    EPaymentMethod.CASH,
  );
  const [bancoSena, setBancoSena] = useState("");
  const [saldo, setSaldo] = useState("");
  const [aFacturar, setAFacturar] = useState(false);
  const [facturado, setFacturado] = useState(false);
  const [estado, setEstado] = useState(EOrderStatus.IN_PROCESS);
  const [contactosFiltrados, setContactosFiltrados] = useState<string[]>([]);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const contactInputRef = useRef<HTMLInputElement>(null);
  const [clienteInput, setClienteInput] = useState("");
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const clienteInputRef = useRef<HTMLInputElement>(null);
  const [highlightedClientIndex, setHighlightedClientIndex] = useState(-1);
  const dropdownClientRef = useRef<HTMLUListElement>(null);
  const [telefono, setTelefono] = useState("");
  const [referencia, setReferencia] = useState("");

  // Estados para contacto
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoEmail, setContactoEmail] = useState("");
  const [contactoTelefono, setContactoTelefono] = useState("");
  const [contactoPosicion, setContactoPosicion] = useState("");

  // Estados para crear cliente nuevo
  const [showCreateClientDialog, setShowCreateClientDialog] = useState(false);
  const [pendingOrderData, setPendingOrderData] = useState<any>(null);
  const [creatingClient, setCreatingClient] = useState(false);

  // Estados para Items
  const [items, setItems] = useState<any[]>([]);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isAddingManualItem, setIsAddingManualItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingManualItemId, setEditingManualItemId] = useState<string | null>(
    null,
  );
  console.log("Items actuales:", items);

  // Estados para item manual
  const [manualItemName, setManualItemName] = useState("");
  const [manualItemMeasure, setManualItemMeasure] = useState("");
  const [manualItemDescription, setManualItemDescription] = useState("");
  const [manualItemQuantity, setManualItemQuantity] = useState(1);
  const [manualItemPrice, setManualItemPrice] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<TProduct | null>(null);
  const [selectedVariant, setSelectedVariant] =
    useState<TProductVariant | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemDiscount, setItemDiscount] = useState(0);
  const [itemNotes, setItemNotes] = useState("");
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [applyIVA, setApplyIVA] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [manualDiscount, setManualDiscount] = useState(0);
  const [banco, setBanco] = useState("");

  const BANCOS = ["Galicia", "Frances", "Mercado Pago"];

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

    setFacturas((prev) => [...prev, nuevaFactura]);

    // Limpiar formulario
    setNewFacturaTipo("");
    setNewFacturaNumero("");
    setNewFacturaFecha("");
    setNewFacturaMonto("");
    setShowAddFactura(false);

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

    setFacturas((prev) =>
      prev.map((factura) =>
        factura.id === editingFacturaId
          ? {
              ...factura,
              tipo: newFacturaTipo,
              numero: newFacturaNumero,
              fecha: newFacturaFecha,
              ...(newFacturaMonto && { monto: parseFloat(newFacturaMonto) }),
            }
          : factura,
      ),
    );

    // Limpiar formulario
    setNewFacturaTipo("");
    setNewFacturaNumero("");
    setNewFacturaFecha("");
    setNewFacturaMonto("");
    setShowAddFactura(false);
    setEditingFacturaId(null);

    toast.success("Factura actualizada correctamente");
  };

  const handleRemoveFactura = (id: string) => {
    setFacturas((prev) => prev.filter((f) => f.id !== id));
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

  // Estados para UI
  const [loading, setLoading] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isOrderDetailsCollapsed, setIsOrderDetailsCollapsed] = useState(true);
  const [isContactDetailsCollapsed, setIsContactDetailsCollapsed] =
    useState(true);

  // Función para normalizar texto (quitar acentos y convertir a minúsculas)
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // Remover acentos
  };

  // Filtrar productos (case-insensitive y sin acentos, memoizado)
  const filteredProducts = useMemo(() => {
    return products?.filter((product: any) => {
      const searchNormalized = normalizeText(productSearchTerm);
      return (
        normalizeText(product.name || "").includes(searchNormalized) ||
        normalizeText(product.description || "").includes(searchNormalized)
      );
    });
  }, [products, productSearchTerm]);

  // Calcular totales
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);

  // Calcular IVA desde precio final cuando aplica
  let taxAmount = 0;
  let subtotalSinIVA = subtotal;

  if (applyIVA) {
    const taxRate = parseFloat(iva);
    taxAmount = subtotal * (taxRate / (100 + taxRate));
    subtotalSinIVA = subtotal - taxAmount;
  }

  // Calcular descuentos
  const generalDiscountAmount = subtotalSinIVA * (discountPercentage / 100);
  const totalDiscountAmount = generalDiscountAmount + manualDiscount;

  // Los descuentos de items ya están en el subtotal, así que solo agregamos los generales
  const total = subtotal - totalDiscountAmount;

  // // Calcular descuentos
  // const discountAmount = subtotalSinIVA * (discountPercentage / 100);
  // const total = subtotal - discountAmount - manualDiscount;

  // Manejar selección de cliente
  const handleSelectClient = (clientId: string) => {
    setCliente(clientId);
    const client = clients?.find((c: any) => c.id === clientId);
    const contacto = client?.contacts?.[0];

    // Precargar datos del cliente
    setPersonaContacto(contacto?.name || "");
    setDireccion(client?.address || "");
    setEmail(contacto?.email || client?.email || "");
    setCuit(client?.cuit || "");
    setTelefono(client?.phone || "");
    setReferencia(client?.reference || "");

    // Precargar datos del contacto
    setContactoNombre(contacto?.name || "");
    setContactoEmail(contacto?.email || "");
    setContactoTelefono(contacto?.phone || "");
    setContactoPosicion(contacto?.position || "");

    // Filtrar presupuestos del cliente seleccionado (CONFIRMED o SENT)
    const filteredQuotes = quotes.filter(
      (q) =>
        q.client?.id === clientId &&
        (q.status === EQuoteStatus.CONFIRMED || q.status === EQuoteStatus.SENT),
    );
    setClientQuotes(filteredQuotes);
    setSelectedQuoteId(null);
    setShowQuoteSelector(false);
  };

  // Importar items de un presupuesto
  const handleImportQuoteItems = (quoteId: string) => {
    const quote = clientQuotes.find((q) => q.id === quoteId);
    if (!quote?.items) return;

    // Mapear items del presupuesto al formato de la orden
    // Los items del presupuesto tienen product y variant como objetos anidados
    const importedItems = quote.items.map((item: any, index: number) => ({
      id: `imported_${Date.now()}_${index}`,
      product: item.product || null,
      variant: item.variant || null,
      productId: item.product?.id || item.productId,
      productName: item.product?.name || item.productName,
      variantId: item.variant?.id || item.variantId,
      variantName: item.variant?.size || item.variantName,
      description: item.product?.description || item.description || "",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount || 0,
      subtotal: item.subtotal,
      notes: item.notes || "",
      isManual: item.isManual || item.product?.id?.startsWith("manual-") || false,
    }));

    setItems(importedItems);
    setSelectedQuoteId(quoteId);
    setShowQuoteSelector(false);
    toast.success(`Items importados del presupuesto ${quote.number}`);
  };

  // Manejar cuando se escribe manualmente un cliente (sin seleccionar del dropdown)
  const handleClientInputChange = (value: string) => {
    setClienteInput(value);

    // Si el valor no coincide con ningún cliente existente, limpiar el clientId
    const existingClient = clients?.find(
      (c: any) => c.name.toLowerCase() === value.toLowerCase(),
    );

    if (!existingClient) {
      setCliente(""); // Limpiar el ID si es un cliente nuevo/manual
    }

    setShowClienteDropdown(true);
    setHighlightedClientIndex(-1); // Resetear el índice al escribir
  };

  // Manejar navegación con teclado en el dropdown de clientes
  const handleClientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showClienteDropdown || !clients) return;

    const filteredClients = clients.filter((c: any) =>
      c.name.toLowerCase().includes(clienteInput.toLowerCase()),
    );

    if (filteredClients.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedClientIndex((prev) =>
          prev < filteredClients.length - 1 ? prev + 1 : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedClientIndex((prev) =>
          prev > 0 ? prev - 1 : filteredClients.length - 1,
        );
        break;
      case "Enter":
        e.preventDefault();
        if (
          highlightedClientIndex >= 0 &&
          highlightedClientIndex < filteredClients.length
        ) {
          const selectedClient = filteredClients[highlightedClientIndex];
          handleSelectClient(selectedClient.id);
          setClienteInput(selectedClient.name);
          setShowClienteDropdown(false);
          if (clienteInputRef.current) clienteInputRef.current.blur();
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowClienteDropdown(false);
        setHighlightedClientIndex(-1);
        break;
    }
  };

  // Función para crear cliente nuevo
  const handleCreateNewClient = async () => {
    if (!clienteInput.trim()) {
      toast.error("El nombre del cliente es requerido");
      return;
    }

    setCreatingClient(true);
    try {
      // Preparar datos del cliente
      const clientData: any = {
        status: EClientStatus.ACTIVE,
        section: EClientSection.BANDERAS, // Cliente de la sección banderas
        name: clienteInput.trim(),
        email: email || undefined,
        phone: telefono || undefined,
        cuit: cuit || undefined,
        address: direccion || undefined,
        reference: referencia || undefined,
        contacts: [
          {
            name: personaContacto || clienteInput.trim(),
            email: email || undefined,
            phone: telefono || undefined,
          },
        ],
      };

      // Limpiar valores undefined con protección contra referencias circulares
      const cleanData = (obj: any, seen = new WeakSet()): any => {
        if (obj === null || obj === undefined) return null;
        if (typeof obj !== "object") return obj;

        // Protección contra referencias circulares
        if (seen.has(obj)) return {};
        seen.add(obj);

        if (Array.isArray(obj)) {
          return obj.map((item) => cleanData(item, seen));
        }

        const cleaned: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value !== undefined) {
            cleaned[key] = cleanData(value, seen);
          }
        }
        return cleaned;
      };

      const cleanClientData = cleanData(clientData);
      console.log("🔧 Creando cliente con datos:", cleanClientData);

      const newClientId = await createClient(cleanClientData);

      // Actualizar el cliente seleccionado
      setCliente(newClientId);

      toast.success(`Cliente "${clienteInput}" creado exitosamente`);

      // Cerrar dialog y continuar con la orden usando los datos pendientes
      setShowCreateClientDialog(false);
      if (pendingOrderData) {
        await proceedWithOrderCreation({
          ...pendingOrderData,
          clientId: newClientId,
        });
      }
    } catch (error) {
      console.error("Error al crear cliente:", error);
      toast.error("Error al crear el cliente");
    } finally {
      setCreatingClient(false);
    }
  };

  // Función para crear orden con cliente temporal (sin guardar cliente en BD)
  const handleCreateOrderWithTemporaryClient = async () => {
    if (!pendingOrderData) return;

    setCreatingClient(true);
    try {
      // Crear la orden con los datos del cliente como información temporal
      // (no se crea el cliente en la BD, solo se guarda la info en la orden)
      const orderDataWithTempClient = {
        ...pendingOrderData,
        clientId: null, // No hay ID porque no se guardó en BD
        clientName: clienteInput.trim(),
        // Guardar datos del cliente como campos temporales en la orden
        tempClientData: {
          name: clienteInput.trim(),
          email: email || undefined,
          phone: telefono || undefined,
          cuit: cuit || undefined,
          address: direccion || undefined,
          reference: referencia || undefined,
          contact:
            contactoNombre || contactoEmail || contactoTelefono
              ? {
                  name: contactoNombre || clienteInput,
                  email: contactoEmail || undefined,
                  phone: contactoTelefono || undefined,
                  position: contactoPosicion || undefined,
                }
              : undefined,
        },
      };

      toast.success("Creando orden con cliente temporal...");

      // Cerrar dialog y continuar con la orden
      setShowCreateClientDialog(false);
      await proceedWithOrderCreation(orderDataWithTempClient);
    } catch (error) {
      console.error("Error al crear orden:", error);
      toast.error("Error al crear la orden");
    } finally {
      setCreatingClient(false);
    }
  };

  // Función para proceder con la creación de la orden
  const proceedWithOrderCreation = async (orderData: any) => {
    try {
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

      const cleanOrderData = cleanData(orderData);
      console.log("🔧 Datos limpios para crear orden:", cleanOrderData);

      const orderId = await createOrder(cleanOrderData as any);

      if (selectedCreditNoteId && user?.uid) {
        try {
          const result = await applyCreditNoteToDocument(firestore, {
            noteId: selectedCreditNoteId,
            documentId: orderId,
            documentType: "order",
            documentNumber: cleanOrderData.number,
            documentTotal: redondearTotal(total),
            appliedBy: user.uid,
          });
          toast.success(
            `Nota de crédito aplicada: ${formatearPrecio(result.appliedAmount)}` +
              (result.forfeitedAmount > 0
                ? ` (sobrante perdido: ${formatearPrecio(result.forfeitedAmount)})`
                : ""),
          );
        } catch (err) {
          console.error("Error al aplicar nota de crédito:", err);
          toast.error(
            err instanceof Error
              ? `Orden creada, pero falló la aplicación de la NC: ${err.message}`
              : "Orden creada, pero falló la aplicación de la NC",
          );
        }
      }

      toast.success(`Orden creada exitosamente con ID: ${orderId}`);
      router.push("/publimar/banderas/ordenes");
    } catch (error) {
      console.error("Error al crear orden:", error);
      toast.error("Error al crear la orden");
    } finally {
      setLoading(false);
      setPendingOrderData(null);
    }
  };

  // Funciones para Items
  const addItemToOrder = () => {
    if (!selectedProduct) return;
    const price = Number(selectedVariant ? selectedVariant.price : 0);
    const discountAmount = (price * itemDiscount) / 100;
    const priceAfterDiscount = price - discountAmount;
    const subtotal = priceAfterDiscount * itemQuantity;
    const newItem = {
      id: editingItemId || Date.now().toString(),
      product: selectedProduct,
      variant: selectedVariant || undefined,
      quantity: itemQuantity,
      unitPrice: price,
      discount: itemDiscount,
      subtotal: subtotal,
      notes: itemNotes,
    };
    if (editingItemId) {
      setItems(
        items.map((item) => (item.id === editingItemId ? newItem : item)),
      );
    } else {
      setItems([...items, newItem]);
    }
    clearModalStates();
  };

  const startEditItem = (item: any) => {
    // Si es un item manual, abrir el modal de item manual
    if (item.isManual) {
      setManualItemName(item.productName || "");
      setManualItemMeasure(
        item.variantName === "Sin medida" ? "" : item.variantName || "",
      );
      setManualItemDescription(item.description || "");
      setManualItemQuantity(item.quantity || 1);
      setManualItemPrice(item.unitPrice || 0);
      setEditingManualItemId(item.id);
      setIsAddingManualItem(true);
      return;
    }

    // Item de producto normal
    setSelectedProduct(item.product);
    setSelectedVariant(item.variant || null);
    setItemQuantity(item.quantity);
    setItemDiscount(item.discount);
    setItemNotes(item.notes);
    setEditingItemId(item.id);
    setIsAddingItem(true);
  };

  const removeItem = (itemId: string) => {
    setItems(items.filter((item) => item.id !== itemId));
  };

  const handleResetProductSelection = () => {
    setSelectedProduct(null);
    setSelectedVariant(null);
    setItemQuantity(1);
    setItemDiscount(0);
    setItemNotes("");
  };

  const clearModalStates = () => {
    setSelectedProduct(null);
    setSelectedVariant(null);
    setItemQuantity(1);
    setItemDiscount(0);
    setItemNotes("");
    setProductSearchTerm("");
    setEditingItemId(null);
    setIsAddingItem(false);
  };

  const handleModalClose = (open: boolean) => {
    if (!open) {
      clearModalStates();
    }
    setIsAddingItem(open);
  };

  const handleAddManualItem = () => {
    if (!manualItemName || !manualItemQuantity || !manualItemPrice) {
      toast.error("Por favor completa todos los campos requeridos");
      return;
    }

    const newManualItem = {
      id: editingManualItemId || `manual_${Date.now()}`,
      productId: editingManualItemId || `manual_${Date.now()}`,
      productName: manualItemName,
      variantId: null,
      variantName: manualItemMeasure || "Sin medida",
      description: manualItemDescription,
      quantity: manualItemQuantity,
      unitPrice: manualItemPrice,
      subtotal: manualItemQuantity * manualItemPrice,
      isManual: true,
    };

    if (editingManualItemId) {
      // Modo edición: actualizar el item existente
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingManualItemId ? newManualItem : item,
        ),
      );
      toast.success("Item manual actualizado exitosamente");
    } else {
      // Modo agregar: crear nuevo item
      setItems((prev) => [...prev, newManualItem]);
      toast.success("Item manual agregado exitosamente");
    }

    // Limpiar formulario
    setManualItemName("");
    setManualItemMeasure("");
    setManualItemDescription("");
    setManualItemQuantity(1);
    setManualItemPrice(0);
    setEditingManualItemId(null);

    setIsAddingManualItem(false);
  };

  // Calcular saldo
  useEffect(() => {
    const s = parseFloat(sena) || 0;
    setSaldo((total - s).toFixed(2));
  }, [total, sena]);

  useEffect(() => {
    // Actualizar estado de facturado basado en si hay facturas
    setFacturado(facturas.length > 0);
  }, [facturas]);

  // Resetear formulario de item manual cuando se cierra el modal
  useEffect(() => {
    if (!isAddingManualItem) {
      setManualItemName("");
      setManualItemMeasure("");
      setManualItemDescription("");
      setManualItemQuantity(1);
      setManualItemPrice(0);
      setEditingManualItemId(null);
    }
  }, [isAddingManualItem]);

  // Auto-scroll para mantener el item highlightado visible en el dropdown
  useEffect(() => {
    if (highlightedClientIndex >= 0 && dropdownClientRef.current) {
      const highlightedElement = dropdownClientRef.current.children[
        highlightedClientIndex
      ] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }
  }, [highlightedClientIndex]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!clienteInput || items.length === 0) {
      toast.error("Debes seleccionar un cliente y agregar al menos un item");
      return;
    }

    if (!user) {
      toast.error("Debes estar logueado para crear una orden");
      return;
    }

    // Verificar si el cliente existe en la BD
    const existingClient = clients?.find(
      (c: any) =>
        c.name.toLowerCase().trim() === clienteInput.toLowerCase().trim(),
    );

    setLoading(true);

    // Crear paymentHistory si hay seña
    let paymentHistory: TPaymentHistory[] = [];
    if (sena && parseFloat(sena) > 0) {
      let senaNotes = "Seña/Anticipo";
      if (metodoPagoSena === EPaymentMethod.TRANSFER) {
        senaNotes += ` - Transferencia${bancoSena ? ` - ${bancoSena}` : ""}`;
      } else if (metodoPagoSena === EPaymentMethod.MERCADOPAGO) {
        senaNotes += " - Mercado Pago";
      }

      paymentHistory = [
        {
          amount: parseFloat(sena),
          type: "seña",
          method: metodoPagoSena,
          notes: senaNotes,
        },
      ];
    }

    try {
      // Preparar datos de la orden usando el helper del hook
      const baseOrderData = {
        number: generateOrderNumber(),
        quoteId: `quote-${Date.now()}`, // O usar un presupuesto real
        invoiceType: facturas.length > 0 ? facturas[0].tipo : "sin factura",
        status: estado,
        subtotal: redondearTotal(applyIVA ? subtotalSinIVA : subtotal),
        taxRate: parseFloat(iva),
        taxAmount: redondearTotal(taxAmount),
        total: redondearTotal(total),
        applyIVA,
        paymentHistory: paymentHistory,
        items: items.map((item) => ({
          id: item.id,
          // Referencias (no duplicar objetos completos)
          productId: item.isManual ? undefined : item.product?.id,
          variantId: item.variant?.id,

          // Datos para mostrar rápido (snapshot)
          productName: item.isManual
            ? item.productName
            : item.product?.name || "",
          description: item.isManual
            ? item.description
            : item.product?.description || "",
          variantName: item.isManual
            ? item.variantName
            : item.variant?.size || "",
          // categories: item.isManual ? [] : item.product?.categories || [],

          // Datos de la orden
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          subtotal: item.subtotal,
          tax: 0,
          taxAmount: 0,
          notes: item.notes || "",
          isManual: item.isManual || false,
        })),
      };

      const orderData = createOrderWithDefaults({
        ...baseOrderData,
        notes: detalle,
        paymentMethod: formaPago as any,
        isInvoiced: facturado,
        ...(facturas.length > 0 && { invoiceNumber: facturas[0].numero }),
        ...(facturas.length > 0 &&
          facturas[0].fecha && { invoiceDate: new Date(facturas[0].fecha) }),
        discountPercentage: discountPercentage,
        discountAmount: totalDiscountAmount,
        manualDiscount: manualDiscount,
        // Agregar array de facturas
        facturas: facturas.length > 0 ? facturas : [],
        ...(fechaEntrega && {
          estimatedDeliveryDate: new Date(fechaEntrega).getTime(),
        }),
        // Nueva forma: seña en paymentHistory
        paymentHistory: paymentHistory,
        balance: parseFloat(saldo) || 0,
        // Datos del cliente (solo referencias, no duplicar datos)
        contact: {
          name: contactoNombre || undefined,
          position: contactoPosicion || undefined,
          email: contactoEmail || undefined,
          phone: contactoTelefono || undefined,
        },
        ...(cliente && { clientId: cliente }), // Referencia a la DB del cliente
        ...(clienteInput && { clientName: clienteInput }), // Solo el nombre para mostrar
        ...(referencia && { reference: referencia }), // Referencia del cliente
      });

      // Si el cliente no existe y no hay un ID seleccionado, preguntar si crear nuevo
      if (!existingClient && !cliente && clienteInput.trim()) {
        setLoading(false); // Parar el loading para mostrar el dialog
        setPendingOrderData(orderData); // Guardar datos para usar después
        setShowCreateClientDialog(true);
        return; // Salir y esperar respuesta del usuario
      }

      // Debug: mostrar datos del cliente que se van a guardar
      console.log("Datos del cliente a guardar:", {
        clientId: cliente || null,
        clientName: clienteInput,
        reference: referencia,
      });

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

      // Limpiar datos antes de enviar a Firebase
      const cleanOrderData = cleanData(orderData);

      const orderId = await createOrder(cleanOrderData as any);

      if (selectedCreditNoteId && user?.uid) {
        try {
          const result = await applyCreditNoteToDocument(firestore, {
            noteId: selectedCreditNoteId,
            documentId: orderId,
            documentType: "order",
            documentNumber: cleanOrderData.number,
            documentTotal: redondearTotal(total),
            appliedBy: user.uid,
          });
          toast.success(
            `Nota de crédito aplicada: ${formatearPrecio(result.appliedAmount)}` +
              (result.forfeitedAmount > 0
                ? ` (sobrante perdido: ${formatearPrecio(result.forfeitedAmount)})`
                : ""),
          );
        } catch (err) {
          console.error("Error al aplicar nota de crédito:", err);
          toast.error(
            err instanceof Error
              ? `Orden creada, pero falló la aplicación de la NC: ${err.message}`
              : "Orden creada, pero falló la aplicación de la NC",
          );
        }
      }

      toast.success(`Orden creada exitosamente con ID: ${orderId}`);
      router.push("/publimar/banderas/ordenes");
    } catch (error) {
      toast.error(
        "Error al guardar la orden: " +
          (error instanceof Error ? error.message : "Error desconocido"),
      );
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  console.log("Items:", items);

  return (
    <div className="p-6">
      {/* Diálogo de cancelación */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="max-w-xs p-4">
          <div className="text-center text-sm text-slate-700 mb-4">
            ¿Cancelar creación? Se perderán los cambios no guardados.
          </div>
          <div className="flex justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
            >
              No, volver
            </Button>
            <Button
              size="sm"
              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
              onClick={() => {
                setShowCancelDialog(false);
                router.push("/publimar/banderas/ordenes");
              }}
            >
              Sí, cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Nueva orden</h1>
        <Button
          variant="outline"
          onClick={() => setShowCancelDialog(true)}
          disabled={loading}
          type="button"
          className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
        >
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Sección Cliente */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
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
                    Este cliente tiene {clientQuotes.length} presupuesto(s)
                    disponible(s)
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
                        className="flex items-center justify-between p-2 bg-white rounded border cursor-pointer hover:bg-gray-50"
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
                <Label>CUIT/CUIL</Label>
                <CuitInput value={cuit} onValueChange={setCuit} />
              </div>
              <div className="space-y-2">
                <Label>Referencia</Label>
                <Input
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="Referencia del cliente..."
                />
              </div>
            </div>

            {/* Sección de Contacto */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-sm font-medium text-gray-700">
                  Datos del Contacto (Opcional)
                </h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setIsContactDetailsCollapsed(!isContactDetailsCollapsed)
                  }
                  className="p-1 h-6 w-6"
                >
                  {isContactDetailsCollapsed ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronUp className="h-3 w-3" />
                  )}
                </Button>
              </div>
              {!isContactDetailsCollapsed && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nombre del contacto</Label>
                      <Input
                        value={contactoNombre}
                        onChange={(e) => setContactoNombre(e.target.value)}
                        placeholder="Nombre completo..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Posición/Cargo</Label>
                      <Input
                        value={contactoPosicion}
                        onChange={(e) => setContactoPosicion(e.target.value)}
                        placeholder="Ej: Gerente, Encargado..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label>Email del contacto</Label>
                      <Input
                        type="email"
                        value={contactoEmail}
                        onChange={(e) => setContactoEmail(e.target.value)}
                        placeholder="email@ejemplo.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Teléfono del contacto</Label>
                      <Input
                        value={contactoTelefono}
                        onChange={(e) => setContactoTelefono(e.target.value)}
                        placeholder="Teléfono directo..."
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Detalles de la orden */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Detalles de la orden</CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setIsOrderDetailsCollapsed(!isOrderDetailsCollapsed)
                }
                className="p-1 h-8 w-8"
              >
                {isOrderDetailsCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          {!isOrderDetailsCollapsed && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fecha de entrada</Label>
                  <Input type="date" value={fechaEntrada} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Fecha de entrega</Label>
                  <Input
                    type="date"
                    value={fechaEntrega}
                    onChange={(e) => setFechaEntrega(e.target.value.toString())}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Detalles</Label>
                <Textarea
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder="Incluye cualquier detalle o especificación adicional..."
                  rows={3}
                />
              </div>
            </CardContent>
          )}
        </Card>

        {/* Items */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Items</CardTitle>
            <div className="flex gap-2">
              {/* Modal para item manual */}
              <Dialog
                open={isAddingManualItem}
                onOpenChange={setIsAddingManualItem}
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
                  {/* <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Item manual
                  </Button> */}
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>
                      {editingManualItemId
                        ? "Editar item manual"
                        : "Agregar item manual"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="manualName">Nombre del producto</Label>
                        <Input
                          id="manualName"
                          placeholder="Ej: Bandera personalizada"
                          value={manualItemName}
                          onChange={(e) => setManualItemName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="manualMeasure">Medida</Label>
                        <Input
                          id="manualMeasure"
                          placeholder="Ej: 90x1,40"
                          value={manualItemMeasure}
                          onChange={(e) => setManualItemMeasure(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manualDescription">Descripción</Label>
                      <Textarea
                        id="manualDescription"
                        placeholder="Descripción del producto..."
                        value={manualItemDescription}
                        onChange={(e) =>
                          setManualItemDescription(e.target.value)
                        }
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="manualQuantity">Cantidad</Label>
                        <Input
                          id="manualQuantity"
                          type="number"
                          min="1"
                          placeholder="1"
                          value={manualItemQuantity}
                          onChange={(e) =>
                            setManualItemQuantity(Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="manualPrice">Precio unitario</Label>
                        <Input
                          id="manualPrice"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={manualItemPrice}
                          onChange={(e) =>
                            setManualItemPrice(Number(e.target.value))
                          }
                        />
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Precio total:</span>
                        <span className="text-lg font-bold text-blue-600">
                          {formatearPrecio(
                            manualItemQuantity * manualItemPrice,
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsAddingManualItem(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleAddManualItem}
                      disabled={
                        !manualItemName ||
                        !manualItemQuantity ||
                        !manualItemPrice
                      }
                      className="bg-blue-900 hover:bg-blue-700 text-white"
                    >
                      {editingManualItemId ? "Actualizar item" : "Agregar item"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Modal para agregar items desde productos */}
              <Dialog open={isAddingItem} onOpenChange={handleModalClose}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddingItem(true)}
                    className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Agregar item
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingItemId
                        ? "Editar item"
                        : "Agregar item a la ordenes"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    {!selectedProduct ? (
                      <div className="space-y-4">
                        <div className="relative">
                          <Search
                            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                            size={16}
                          />
                          <Input
                            placeholder="Buscar producto por nombre o descripción..."
                            value={productSearchTerm}
                            onChange={(e) =>
                              setProductSearchTerm(e.target.value)
                            }
                            className="pl-10"
                          />
                        </div>
                        <div className="max-h-72 overflow-y-auto border rounded-md">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Acción</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {productsStatus === "loading" ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={2}
                                    className="text-center py-4"
                                  >
                                    Cargando productos...
                                  </TableCell>
                                </TableRow>
                              ) : filteredProducts &&
                                filteredProducts.length > 0 ? (
                                filteredProducts.map((product: any) => {
                                  const selectedVariant = product.variants?.[0];
                                  return (
                                    <TableRow key={product.id}>
                                      <TableCell>{product.name}</TableCell>
                                      <TableCell>
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            setSelectedProduct(product);
                                            setSelectedVariant(selectedVariant);
                                          }}
                                          type="button"
                                          className="bg-blue-900 hover:bg-blue-700 text-white"
                                        >
                                          Seleccionar
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })
                              ) : (
                                <TableRow>
                                  <TableCell
                                    colSpan={2}
                                    className="text-center py-4"
                                  >
                                    {productSearchTerm
                                      ? "No se encontraron productos con el término de búsqueda."
                                      : "Busca un producto para agregarlo a la orden."}
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex justify-between items-center mb-4">
                          <div>
                            <h3 className="text-lg font-semibold">
                              {selectedProduct.name}
                            </h3>
                            <p className="text-sm text-slate-500">
                              {selectedProduct.description}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleResetProductSelection}
                            className="flex items-center"
                          >
                            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a
                            productos
                          </Button>
                        </div>
                        {selectedProduct.variants &&
                          selectedProduct.variants.length > 1 && (
                            <div className="space-y-2">
                              <Label>Selecciona una variante</Label>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {selectedProduct.variants.map(
                                  (variant: TProductVariant) => (
                                    <div
                                      key={variant.id}
                                      className={`cursor-pointer border rounded-md p-3 transition-all ${
                                        selectedVariant?.id === variant.id
                                          ? "border-slate-800 bg-slate-50"
                                          : "hover:border-slate-400"
                                      }`}
                                      onClick={() =>
                                        setSelectedVariant(variant)
                                      }
                                    >
                                      <div className="flex justify-between">
                                        <span className="font-medium">
                                          {variant.size}
                                        </span>
                                        <span className="text-slate-700">
                                          {formatearPrecio(
                                            Number(variant.price),
                                          )}
                                        </span>
                                      </div>
                                      <div className="text-sm text-slate-500 mt-1">
                                        Stock: {variant.stock} unidades
                                      </div>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="quantity">Cantidad</Label>
                            <Input
                              id="quantity"
                              type="number"
                              min="1"
                              value={itemQuantity}
                              onChange={(e) =>
                                setItemQuantity(
                                  parseInt(e.target.value, 10) || 1,
                                )
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="discount">Descuento (%)</Label>
                            <Input
                              id="discount"
                              type="number"
                              min="0"
                              max="100"
                              value={itemDiscount}
                              onChange={(e) =>
                                setItemDiscount(
                                  parseInt(e.target.value, 10) || 0,
                                )
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="notes">Notas del item</Label>
                          <Textarea
                            id="notes"
                            value={itemNotes}
                            onChange={(e) => setItemNotes(e.target.value)}
                            placeholder="Añade notas específicas para este item..."
                            rows={2}
                          />
                        </div>
                        <div className="bg-slate-50 p-4 rounded-md">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-sm">
                                Precio unitario:{" "}
                                {formatearPrecio(
                                  selectedVariant
                                    ? Number(selectedVariant.price)
                                    : 0,
                                )}
                              </p>
                              {itemDiscount > 0 && (
                                <p className="text-sm">
                                  Descuento: {itemDiscount}% (
                                  {formatearPrecio(
                                    ((selectedVariant
                                      ? Number(selectedVariant.price)
                                      : 0) *
                                      itemDiscount) /
                                      100,
                                  )}
                                  )
                                </p>
                              )}
                              <p className="text-sm">
                                Cantidad: {itemQuantity}
                              </p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold">
                                Subtotal:{" "}
                                {formatearPrecio(
                                  itemQuantity *
                                    ((selectedVariant
                                      ? Number(selectedVariant.price)
                                      : 0) -
                                      ((selectedVariant
                                        ? Number(selectedVariant.price)
                                        : 0) *
                                        itemDiscount) /
                                        100),
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => clearModalStates()}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      onClick={addItemToOrder}
                      disabled={
                        !selectedProduct ||
                        (selectedProduct.variants &&
                          selectedProduct.variants.length > 1 &&
                          !selectedVariant)
                      }
                    >
                      {editingItemId ? "Actualizar item" : "Agregar a la orden"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-md">
                <p className="text-slate-500 mb-4">No hay items en la orden</p>
              </div>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Cant.</TableHead>
                      <TableHead>Desc.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {item.isManual
                                ? item.productName
                                : item.product?.name}
                            </p>
                            {item.isManual
                              ? item.variantName &&
                                item.variantName !== "Sin medida" && (
                                  <p className="text-sm text-slate-500">
                                    Medida: {item.variantName}
                                  </p>
                                )
                              : item.variant && (
                                  <p className="text-sm text-slate-500">
                                    Variante: {item.variant.size}
                                  </p>
                                )}
                            {item.isManual
                              ? item.description && (
                                  <p className="text-xs text-slate-500 mt-1">
                                    {item.description}
                                  </p>
                                )
                              : item.notes && (
                                  <p className="text-xs text-slate-500 mt-1">
                                    Nota: {item.notes}
                                  </p>
                                )}
                          </div>
                        </TableCell>
                        <TableCell>{formatearPrecio(item.unitPrice)}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          {item.discount > 0 ? `${item.discount}%` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatearPrecio(item.subtotal)}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => startEditItem(item)}
                              title="Editar"
                              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItem(item.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Totales */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="border-t pt-4">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-gray-700">Subtotal</p>
                  <p className="font-semibold">{formatearPrecio(subtotal)}</p>
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
                    <Label htmlFor="applyIVA" className="text-sm text-gray-700">
                      Desglosar IVA ({iva}%)
                    </Label>
                  </div>
                  <p className="text-sm text-gray-600">
                    {applyIVA
                      ? `${formatearPrecio(redondearTotal(taxAmount))}`
                      : "$ 0,00"}
                  </p>
                </div>

                {applyIVA && (
                  <div className="flex justify-between items-center text-sm pl-6">
                    <p className="text-gray-600">Subtotal sin IVA</p>
                    <p className="font-medium">
                      {formatearPrecio(redondearTotal(subtotalSinIVA))}
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
                    -{formatearPrecio(redondearTotal(totalDiscountAmount))}
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
                    -{formatearPrecio(redondearTotal(manualDiscount))}
                  </p>
                </div>

                <div className="border-t pt-3">
                  <div className="flex justify-between items-center">
                    <p className="text-lg font-semibold">Total</p>
                    <p className="text-xl font-bold">
                      {formatearPrecio(redondearTotal(total))}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Saldo a favor del cliente (nota de crédito) */}
        {cliente && (
          <div className="mb-6">
            <ClientCreditBanner
              clientId={cliente}
              documentTotal={redondearTotal(total)}
              selectedNoteId={selectedCreditNoteId}
              onSelect={setSelectedCreditNoteId}
            />
          </div>
        )}

        {/* Información de facturación */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Información de facturación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              {/* Seña/Anticipo */}
              <div>
                <h4 className="font-medium mb-3">Seña/Anticipo (Opcional)</h4>
                <div
                  className={`grid ${metodoPagoSena === EPaymentMethod.TRANSFER ? "grid-cols-3" : "grid-cols-2"} gap-4`}
                >
                  <div className="space-y-2">
                    <Label>Monto de seña</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={sena}
                      onChange={(e) => setSena(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Método de pago</Label>
                    <Select
                      value={metodoPagoSena}
                      onValueChange={(value) =>
                        setMetodoPagoSena(value as EPaymentMethod)
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
                  {metodoPagoSena === EPaymentMethod.TRANSFER && (
                    <div className="space-y-2">
                      <Label>Banco</Label>
                      <Select value={bancoSena} onValueChange={setBancoSena}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar banco" />
                        </SelectTrigger>
                        <SelectContent>
                          {BANCOS.map((bancoItem: string) => (
                            <SelectItem key={bancoItem} value={bancoItem}>
                              {bancoItem}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
              {/* Header con botón agregar */}
              <div className="flex items-center justify-between border-t pt-4 mt-4">
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
                          <span className="font-medium">{factura.tipo}</span>
                          <span>N° {factura.numero}</span>
                          <span>{formatDateString(factura.fecha)}</span>
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
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Factura A">Factura A</SelectItem>
                          <SelectItem value="Factura B">Factura B</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Número de Factura</Label>
                      <Input
                        value={newFacturaNumero}
                        onChange={(e) => setNewFacturaNumero(e.target.value)}
                        placeholder="0001-00000001"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fecha de Factura</Label>
                      <Input
                        type="date"
                        value={newFacturaFecha}
                        onChange={(e) => setNewFacturaFecha(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Monto</Label>
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
            {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Forma de pago</Label>
                <Select
                  value={formaPago}
                  onValueChange={(value) => setFormaPago(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Efectivo" />
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
                    <SelectItem value={EPaymentMethod.CHECK}>Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formaPago === EPaymentMethod.TRANSFER && (
                <div className="space-y-2">
                  <Label>Banco</Label>
                  <Select
                    value={banco}
                    onValueChange={(value) => setBanco(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar banco" />
                    </SelectTrigger>
                    <SelectContent>
                      {BANCOS.map((bancoItem: string) => (
                        <SelectItem key={bancoItem} value={bancoItem}>
                          {bancoItem}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Saldo</Label>
                <Input type="number" value={saldo} readOnly />
              </div>
            </div> */}
          </CardContent>
        </Card>

        {/* Footer con botones */}
        <Card>
          <CardFooter className="flex justify-between pt-6">
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(true)}
              disabled={loading}
              type="button"
              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
            >
              Cancelar
            </Button>
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="default"
                className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                disabled={loading}
              >
                {loading ? "Guardando..." : "Guardar orden"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>

      {/* Dialog para crear cliente nuevo */}
      <Dialog
        open={showCreateClientDialog}
        onOpenChange={setShowCreateClientDialog}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Cliente no encontrado</DialogTitle>
            <div className="text-sm text-muted-foreground">
              El cliente "<strong>{clienteInput}</strong>" no existe en la base
              de datos.
              <br />
              ¿Qué deseas hacer?
            </div>
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg text-sm">
                <div className="space-y-1">
                  <div>
                    <strong>• Solo esta orden:</strong> Guarda los datos del
                    cliente únicamente en esta orden (cliente temporal)
                  </div>
                  <div>
                    <strong>• Crear cliente:</strong> Guarda el cliente en la
                    base de datos para futuras órdenes
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">Datos del cliente:</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <strong>Nombre:</strong> {clienteInput}
                  </div>
                  {email && (
                    <div>
                      <strong>Email:</strong> {email}
                    </div>
                  )}
                  {telefono && (
                    <div>
                      <strong>Teléfono:</strong> {telefono}
                    </div>
                  )}
                  {cuit && (
                    <div>
                      <strong>CUIT:</strong> {formatCuit(cuit)}
                    </div>
                  )}
                  {direccion && (
                    <div>
                      <strong>Dirección:</strong> {direccion}
                    </div>
                  )}
                  {referencia && (
                    <div>
                      <strong>Referencia:</strong> {referencia}
                    </div>
                  )}

                  {(contactoNombre ||
                    contactoEmail ||
                    contactoTelefono ||
                    contactoPosicion) && (
                    <div className="border-t pt-2 mt-3">
                      <strong>Contacto:</strong>
                      {contactoNombre && (
                        <div className="ml-2">• Nombre: {contactoNombre}</div>
                      )}
                      {contactoEmail && (
                        <div className="ml-2">• Email: {contactoEmail}</div>
                      )}
                      {contactoTelefono && (
                        <div className="ml-2">
                          • Teléfono: {contactoTelefono}
                        </div>
                      )}
                      {contactoPosicion && (
                        <div className="ml-2">
                          • Posición: {contactoPosicion}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateClientDialog(false);
                setPendingOrderData(null);
                setLoading(false);
              }}
              disabled={creatingClient}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateOrderWithTemporaryClient}
              disabled={creatingClient}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              {creatingClient ? "Creando..." : "Solo esta orden"}
            </Button>
            <Button
              onClick={handleCreateNewClient}
              disabled={creatingClient}
              className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
            >
              {creatingClient ? "Creando..." : "Crear cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
