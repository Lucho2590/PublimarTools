'use client';

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useFirestoreCollectionData, useUser } from "reactfire";
import {
  collection,
  addDoc,
  serverTimestamp,
  DocumentData,
  doc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { CuitInput } from "@/components/cuit-input";
import { formatCuit } from "@/lib/cuit";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
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
import { Search, Plus, Trash2, Edit, ArrowLeft, ChevronDown, ChevronUp, FileText } from "lucide-react";
import collections from "@/lib/collections";
import { EQuoteStatus } from "@/types/quote";
import { TClient, EClientType, EClientStatus, EClientSection } from "@/types/client";
import { TProduct, TProductVariant, TProductCategory } from "@/types/product";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatearPrecio, redondearTotal } from "@/lib/utils";
import { useClients } from "@/hooks/useClients";

// Tipo para los items del presupuesto
type QuoteItem = {
  id: string;
  product: TProduct;
  variant?: TProductVariant;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  notes: string;
};

export default function NuevoPresupuestoPage() {
  // ... (todo el código de la función tal como lo enviaste)
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<TClient | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState("");

  // Estados para cliente con autocomplete (igual que nueva orden)
  const [clienteInput, setClienteInput] = useState("");
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const clienteInputRef = useRef<HTMLInputElement>(null);
  const [highlightedClientIndex, setHighlightedClientIndex] = useState(-1);
  const dropdownClientRef = useRef<HTMLUListElement>(null);

  // Estados de datos del cliente
  const [personaContacto, setPersonaContacto] = useState("");
  const [direccion, setDireccion] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cuit, setCuit] = useState("");
  const [referencia, setReferencia] = useState("");

  // Estados para contacto adicional (opcional)
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoEmail, setContactoEmail] = useState("");
  const [contactoTelefono, setContactoTelefono] = useState("");
  const [contactoPosicion, setContactoPosicion] = useState("");
  const [isContactDetailsCollapsed, setIsContactDetailsCollapsed] = useState(true);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<TProduct | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<TProductVariant | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemDiscount, setItemDiscount] = useState(0);
  const [itemNotes, setItemNotes] = useState("");
  const [customUnitPrice, setCustomUnitPrice] = useState<number | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Estados para item manual
  const [showManualItemDialog, setShowManualItemDialog] = useState(false);
  const [manualItemName, setManualItemName] = useState("");
  const [manualItemMeasure, setManualItemMeasure] = useState("");
  const [manualItemDescription, setManualItemDescription] = useState("");
  const [manualItemQuantity, setManualItemQuantity] = useState(1);
  const [manualItemPrice, setManualItemPrice] = useState(0);

  // Estados para totales y descuentos
  const [applyIVA, setApplyIVA] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [manualDiscount, setManualDiscount] = useState(0);

  const firestore = useFirestore();
  const { data: user } = useUser();

  // Hook para clientes
  const { createClient } = useClients();

  // Estados para crear cliente nuevo
  const [showCreateClientDialog, setShowCreateClientDialog] = useState(false);
  const [pendingQuoteData, setPendingQuoteData] = useState<any>(null);
  const [creatingClient, setCreatingClient] = useState(false);

  // Fetch clients - Solo clientes de la sección "banderas"
  const clientsCollection = collection(firestore, collections.CLIENTS);
  const clientsQuery = query(
    clientsCollection,
    where("section", "==", EClientSection.BANDERAS),
    orderBy("name")
  );
  const { status: clientsStatus, data: clients } = useFirestoreCollectionData(
    clientsQuery,
    {
      idField: "id",
    }
  );

  // Fetch products
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { status: productsStatus, data: products } = useFirestoreCollectionData(
    productsCollection,
    {
      idField: "id",
    }
  );

  // Fetch categories
  const categoriesCollection = collection(firestore, collections.products.CATEGORIES);
  const { status: categoriesStatus, data: categories } = useFirestoreCollectionData(
    categoriesCollection,
    {
      idField: "id",
    }
  );

  // Basic quote info
  const [formData, setFormData] = useState({
    number: "", // Will be auto-generated
    notes: "",
    validUntil: new Date(new Date().setDate(new Date().getDate() + 7 ))
      .toISOString()
      .split("T")[0], // 30 days from now
    taxRate: 21, // Default tax rate
  });

  // Función para normalizar texto (quitar acentos y convertir a minúsculas)
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remover acentos
  };

  // Filter products based on search (case-insensitive y sin acentos)
  const filteredProducts = products?.filter((product: DocumentData) => {
    if (!product) return false;
    const searchNormalized = normalizeText(productSearchTerm);
    return (
      normalizeText(product.name || '').includes(searchNormalized) ||
      normalizeText(product.description || '').includes(searchNormalized)
    );
  });

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);

  // Calcular IVA desde precio final cuando aplica
  let taxAmount = 0;
  let subtotalSinIVA = subtotal;

  if (applyIVA) {
    const taxRate = parseFloat(formData.taxRate.toString());
    taxAmount = subtotal * (taxRate / (100 + taxRate));
    subtotalSinIVA = subtotal - taxAmount;
  }

  // Calcular descuentos
  const generalDiscountAmount = subtotalSinIVA * (discountPercentage / 100);
  const totalDiscountAmount = generalDiscountAmount + manualDiscount;

  // Total final
  const total = subtotal - totalDiscountAmount;

  // Calcular precio con IVA
  const calculatePriceWithTax = (price: number, taxRate: number) => {
    return price * (1 + taxRate / 100);
  };

  // Obtener nombres de categorías
  const getCategoryNames = (categoryIds: string[] | undefined) => {
    if (!categoryIds || !Array.isArray(categoryIds)) {
      return "-";
    }
    return (
      categoryIds
        .map((id) => {
          const category = categories?.find(
            (c) => (c as unknown as TProductCategory).id === id
          );
          return category ? (category as unknown as TProductCategory).name : "";
        })
        .filter(Boolean)
        .join(", ") || "-"
    );
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const addItemToQuote = () => {
    if (!selectedProduct) return;

    // Usar precio personalizado si existe, sino usar precio del producto/variante
    const price = customUnitPrice !== null
      ? customUnitPrice
      : Number(selectedVariant ? selectedVariant.price : selectedProduct.price || 0);

    const discountAmount = (price * itemDiscount) / 100;
    const priceAfterDiscount = price - discountAmount;
    const subtotal = priceAfterDiscount * itemQuantity;

    const newItem: QuoteItem = {
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
      // Editing existing item
      setItems(
        items.map((item) => (item.id === editingItemId ? newItem : item))
      );
    } else {
      // Adding new item
      setItems([...items, newItem]);
    }

    // Reset form
    setSelectedProduct(null);
    setSelectedVariant(null);
    setItemQuantity(1);
    setItemDiscount(0);
    setItemNotes("");
    setCustomUnitPrice(null);
    setProductSearchTerm("");
    setEditingItemId(null);
    setIsAddingProduct(false);
  };

  const startEditItem = (item: QuoteItem) => {
    console.log("Editamos Item:");
    setSelectedProduct(item.product);
    setSelectedVariant(item.variant || null);
    setItemQuantity(item.quantity);
    setItemDiscount(item.discount);
    setItemNotes(item.notes);
    setCustomUnitPrice(item.unitPrice); // Cargar precio actual del item
    setEditingItemId(item.id);
    setIsAddingProduct(true);
  };

  const removeItem = (itemId: string) => {
    setItems(items.filter((item) => item.id !== itemId));
  };

  // Manejar item manual
  const handleAddManualItem = () => {
    if (!manualItemName || !manualItemQuantity || !manualItemPrice) {
      toast.error("Nombre, cantidad y precio son requeridos");
      return;
    }

    const itemSubtotal = manualItemQuantity * manualItemPrice;

    const newItem: QuoteItem = {
      id: crypto.randomUUID(),
      product: {
        id: `manual-${Date.now()}`,
        name: manualItemName,
        description: manualItemDescription,
        sku: "",
        categories: [],
        variants: [],
        salesCount: 0,
        totalSales: 0,
        price: manualItemPrice,
        stock: Infinity,
        imageUrls: [],
        hasVariants: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as TProduct,
      variant: {
        id: `manual-variant-${Date.now()}`,
        size: manualItemMeasure || "Sin medida",
        sku: "",
        price: manualItemPrice,
        stock: Infinity,
      } as TProductVariant,
      quantity: manualItemQuantity,
      unitPrice: manualItemPrice,
      discount: 0,
      subtotal: itemSubtotal,
      notes: "",
    };

    setItems((prev) => [...prev, newItem]);

    // Reset manual item form
    setManualItemName("");
    setManualItemMeasure("");
    setManualItemDescription("");
    setManualItemQuantity(1);
    setManualItemPrice(0);

    setShowManualItemDialog(false);
    toast.success("Item manual agregado");
  };

  // Función auxiliar para limpiar datos (eliminar undefined)
  const cleanData = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(cleanData);
    if (typeof obj === "object") {
      const cleaned: any = {};
      for (const key in obj) {
        if (obj[key] !== undefined) {
          cleaned[key] = cleanData(obj[key]);
        }
      }
      return cleaned;
    }
    return obj;
  };

  // Función para crear un nuevo cliente en la BD
  const handleCreateNewClient = async () => {
    if (!pendingQuoteData) return;

    setCreatingClient(true);
    try {
      const clientData = {
        name: pendingQuoteData.clienteInput,
        type: EClientType.INDIVIDUAL,
        status: EClientStatus.ACTIVE,
        section: EClientSection.BANDERAS, // Cliente de la sección banderas
        email: pendingQuoteData.email || undefined,
        phone: pendingQuoteData.telefono || undefined,
        address: pendingQuoteData.direccion || undefined,
        cuit: pendingQuoteData.cuit || undefined,
        contacts:
          pendingQuoteData.contactoNombre ||
          pendingQuoteData.contactoEmail ||
          pendingQuoteData.contactoTelefono
            ? [
                {
                  name:
                    pendingQuoteData.contactoNombre ||
                    pendingQuoteData.personaContacto ||
                    undefined,
                  email: pendingQuoteData.contactoEmail || undefined,
                  phone: pendingQuoteData.contactoTelefono || undefined,
                  position: pendingQuoteData.contactoPosicion || undefined,
                },
              ]
            : undefined,
      };

      const cleanClientData = cleanData(clientData);
      const newClientId = await createClient(cleanClientData);

      toast.success(`Cliente "${pendingQuoteData.clienteInput}" creado exitosamente`);

      // Actualizar selectedClient con el ID nuevo
      setSelectedClient({
        ...cleanClientData,
        id: newClientId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as TClient);

      // Cerrar dialog y continuar con el presupuesto
      setShowCreateClientDialog(false);
      await proceedWithQuoteCreation({ ...pendingQuoteData, clientId: newClientId });
    } catch (error) {
      console.error("Error al crear cliente:", error);
      toast.error("Error al crear el cliente");
    } finally {
      setCreatingClient(false);
    }
  };

  // Función para crear presupuesto con cliente temporal (sin guardar cliente en BD)
  const handleCreateQuoteWithTemporaryClient = async () => {
    if (!pendingQuoteData) return;

    setCreatingClient(true);
    setShowCreateClientDialog(false);

    try {
      await proceedWithQuoteCreation({ ...pendingQuoteData, clientId: null });
      toast.success("Presupuesto creado exitosamente (cliente no guardado en BD)");
    } catch (error) {
      console.error("Error al crear presupuesto:", error);
      toast.error("Error al crear el presupuesto");
    } finally {
      setCreatingClient(false);
    }
  };

  // Función auxiliar para proceder con la creación del presupuesto
  const proceedWithQuoteCreation = async (data: any) => {
    if (!user) return;

    try {
      setLoading(true);

      // Generate quote number
      const quoteNumber = `P-${new Date().getFullYear()}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

      // Sanitize items
      const sanitizedItems = data.items.map((item: QuoteItem) => ({
        id: item.id,
        product: {
          id: item.product.id,
          name: item.product.name,
          description: item.product.description || "",
          categories: item.product.categories || [],
          imageUrls: item.product.imageUrls || [],
          hasVariants: item.product.hasVariants || false,
          price: item.product.price || 0,
          taxRate: item.product.taxRate || 21,
        },
        variant: item.variant
          ? {
              id: item.variant.id,
              size: item.variant.size,
              price: item.variant.price,
            }
          : null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
        subtotal: item.subtotal,
        notes: item.notes || "",
      }));

      // Calcular totales
      const subtotal = sanitizedItems.reduce((sum: number, item: any) => sum + item.subtotal, 0);
      const applyIVATax = data.applyIVA || false;
      const taxRate = applyIVATax ? 21 : 0;
      const subtotalSinIVA = subtotal / 1.21;
      const taxAmount = applyIVATax ? subtotal - subtotalSinIVA : 0;
      const total = subtotal;

      // Client data
      const clientData = data.clientId
        ? {
            id: data.clientId,
            name: data.clienteInput,
            type: EClientType.INDIVIDUAL,
            status: EClientStatus.ACTIVE,
            section: EClientSection.BANDERAS as EClientSection,
            email: data.email || "",
            phone: data.telefono || "",
            address: data.direccion || "",
            taxId: data.cuit || "",
            notes: "",
            contacts:
              data.contactoNombre || data.contactoEmail || data.contactoTelefono
                ? [
                    {
                      name: data.contactoNombre || data.personaContacto || "",
                      email: data.contactoEmail || "",
                      phone: data.contactoTelefono || "",
                      position: data.contactoPosicion || "",
                    },
                  ]
                : [],
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : {
            id: "",
            name: data.clienteInput,
            type: EClientType.INDIVIDUAL,
            status: EClientStatus.ACTIVE,
            section: EClientSection.BANDERAS as EClientSection,
            email: data.email || "",
            phone: data.telefono || "",
            address: data.direccion || "",
            taxId: data.cuit || "",
            notes: "",
            contacts:
              data.contactoNombre || data.contactoEmail || data.contactoTelefono
                ? [
                    {
                      name: data.contactoNombre || data.personaContacto || "",
                      email: data.contactoEmail || "",
                      phone: data.contactoTelefono || "",
                      position: data.contactoPosicion || "",
                    },
                  ]
                : [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

      // Obtener fecha de validez (30 días desde hoy por defecto)
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 30);

      const quoteData = {
        number: quoteNumber,
        client: clientData,
        section: EClientSection.BANDERAS as EClientSection,
        status: EQuoteStatus.DRAFT,
        items: sanitizedItems,
        subtotal: redondearTotal(applyIVATax ? subtotalSinIVA : subtotal),
        taxRate: taxRate,
        taxAmount: redondearTotal(taxAmount),
        total: redondearTotal(total),
        applyIVA: applyIVATax,
        discountPercentage: data.discountPercentage || 0,
        manualDiscount: data.manualDiscount || 0,
        validUntil: validUntil,
        notes: "",
        comments: [],
        publicUrl:
          typeof window !== "undefined"
            ? `${window.location.origin}/presupuestos/${quoteNumber}`
            : `https://${
                process.env.NEXT_PUBLIC_VERCEL_URL || "publimartools.vercel.app"
              }/presupuestos/${quoteNumber}`,
        createdBy: doc(firestore, `users/${user.uid}`),
        updatedBy: doc(firestore, `users/${user.uid}`),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        tax: redondearTotal(taxAmount),
      };

      const quotesCollection = collection(firestore, collections.QUOTES);
      await addDoc(quotesCollection, quoteData);

      toast.success("Presupuesto creado exitosamente");
      router.push("/publimar/banderas/presupuestos");
    } catch (error) {
      console.error("Error al crear presupuesto:", error);
      toast.error("Error al crear el presupuesto");
    } finally {
      setLoading(false);
      setPendingQuoteData(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!clienteInput.trim()) {
      toast.error("Debes ingresar un cliente");
      return;
    }
    if (!user) {
      toast.error("Debes estar logueado para crear un presupuesto");
      return;
    }
    setLoading(true);

    try {
      // Verificar si el cliente existe en la DB
      const existingClient = clients?.find(
        (c: any) => c.name?.toLowerCase() === clienteInput.trim().toLowerCase()
      );

      // Si el cliente no existe y no hay un selectedClient, preguntar si crear nuevo
      if (!existingClient && !selectedClient && clienteInput.trim()) {
        setLoading(false); // Parar el loading para mostrar el dialog
        // Guardar los datos del presupuesto para usar después
        const quoteDataTemp = {
          clienteInput: clienteInput.trim(),
          section: EClientSection.BANDERAS as EClientSection,
          email,
          telefono,
          direccion,
          cuit,
          contactoNombre,
          contactoEmail,
          contactoTelefono,
          contactoPosicion,
          personaContacto,
          items,
          applyIVA,
          discountPercentage,
          manualDiscount,
        };
        setPendingQuoteData(quoteDataTemp);
        setShowCreateClientDialog(true);
        return; // Salir y esperar respuesta del usuario
      }
      // Generate quote number (formato: Q-YYYY-XXXX)
      const quoteNumber = `P-${new Date().getFullYear()}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

      // Ensure all required fields have values and sanitize data for Firestore
      const sanitizedItems = items.map((item) => ({
        id: item.id,
        product: {
          id: item.product.id,
          name: item.product.name,
          description: item.product.description || "",
          categories: item.product.categories || [],
          imageUrls: item.product.imageUrls || [],
          hasVariants: item.product.hasVariants || false,
          price: item.product.price || 0,
          taxRate: item.product.taxRate || 21,
        },
        variant: item.variant
          ? {
              id: item.variant.id,
              size: item.variant.size,
              price: item.variant.price,
            }
          : null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
        subtotal: item.subtotal,
        notes: item.notes || "",
      }));

      // Preparar datos del cliente (usar selectedClient si existe, sino usar campos manuales)
      const clientData = selectedClient
        ? {
            section: EClientSection.BANDERAS as EClientSection,
            id: selectedClient.id,
            name: selectedClient.name,
            type: selectedClient.type,
            status: selectedClient.status,
            email: email || selectedClient.email || "",
            phone: telefono || selectedClient.phone || "",
            address: direccion || selectedClient.address || "",
            taxId: cuit || selectedClient.cuit || "",
            notes: selectedClient.notes || "",
            contacts:
              contactoNombre || contactoEmail || contactoTelefono
                ? [
                    {
                      name: contactoNombre || personaContacto || "",
                      email: contactoEmail || "",
                      phone: contactoTelefono || "",
                      position: contactoPosicion || "",
                    },
                  ]
                : selectedClient.contacts || [],
            createdAt: selectedClient.createdAt,
            updatedAt: selectedClient.updatedAt,
          }
        : {
            section: EClientSection.BANDERAS as EClientSection,
            id: "",
            name: clienteInput,
            type: "individual",
            status: "active",
            email: email || "",
            phone: telefono || "",
            address: direccion || "",
            taxId: cuit || "",
            notes: "",
            contacts:
              contactoNombre || contactoEmail || contactoTelefono
                ? [
                    {
                      name: contactoNombre || personaContacto || "",
                      email: contactoEmail || "",
                      phone: contactoTelefono || "",
                      position: contactoPosicion || "",
                    },
                  ]
                : [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };

      const quoteData = {
        number: quoteNumber,
        client: clientData,
        status: EQuoteStatus.DRAFT,
        items: sanitizedItems,
        subtotal: redondearTotal(applyIVA ? subtotalSinIVA : subtotal),
        taxRate: parseFloat(formData.taxRate.toString()),
        taxAmount: redondearTotal(taxAmount),
        total: redondearTotal(total),
        applyIVA,
        discountPercentage,
        manualDiscount,
        validUntil: new Date(formData.validUntil),
        notes: formData.notes || "",
        comments: [],
        publicUrl: typeof window !== 'undefined'
          ? `${window.location.origin}/presupuestos/${quoteNumber}`
          : `https://${process.env.NEXT_PUBLIC_VERCEL_URL || 'publimartools.vercel.app'}/presupuestos/${quoteNumber}`,
        createdBy: doc(firestore, `users/${user.uid}`),
        updatedBy: doc(firestore, `users/${user.uid}`),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        tax: redondearTotal(taxAmount),
      };

      const quotesCollection = collection(firestore, collections.QUOTES);
      await addDoc(quotesCollection, quoteData);

      toast.success("Presupuesto creado exitosamente");
      router.push("/publimar/banderas/presupuestos");
    } catch (error) {
      console.error("Error al crear presupuesto:", error);
      toast.error(
        `Ocurrió un error al crear el presupuesto: ${
          error instanceof Error ? error.message : "Error desconocido"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClient = (clientId: string) => {
    const client = clients?.find((c: any) => c.id === clientId);
    if (!client) return;

    setSelectedClient(client as TClient);
    const contacto = client?.contacts?.[0];

    // Precargar datos del cliente
    setPersonaContacto(contacto?.name || "");
    setDireccion(client?.address || "");
    setEmail(contacto?.email || client?.email || "");
    setTelefono(client?.phone || "");
    setCuit(client?.cuit || "");
    setReferencia(client?.reference || "");

    // Precargar datos del contacto
    setContactoNombre(contacto?.name || "");
    setContactoEmail(contacto?.email || "");
    setContactoTelefono(contacto?.phone || "");
    setContactoPosicion(contacto?.position || "");
  };

  // Manejar cuando se escribe manualmente un cliente (sin seleccionar del dropdown)
  const handleClientInputChange = (value: string) => {
    setClienteInput(value);

    // Si el valor no coincide con ningún cliente existente, limpiar el cliente seleccionado
    const existingClient = clients?.find((c: any) =>
      c.name.toLowerCase() === value.toLowerCase()
    );

    if (!existingClient) {
      setSelectedClient(null); // Limpiar si es un cliente nuevo/manual
    }
  };

  // Manejar teclas en el input de cliente
  const handleClientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showClienteDropdown) return;

    const filteredClients = clients?.filter((c: any) =>
      c.name.toLowerCase().includes(clienteInput.toLowerCase())
    ) || [];

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedClientIndex((prev) =>
          prev < filteredClients.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedClientIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedClientIndex >= 0 && highlightedClientIndex < filteredClients.length) {
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


  const handleProductSelect = (product: TProduct, variant?: TProductVariant) => {
    setSelectedProduct(product);
    setSelectedVariant(variant || null);
    // Cargar precio inicial del producto o variante
    const initialPrice = variant ? Number(variant.price) : Number(product.price || 0);
    setCustomUnitPrice(initialPrice);
  };

  const handleVariantSelect = (variant: TProductVariant) => {
    setSelectedVariant(variant);
    // Actualizar precio cuando cambia la variante
    setCustomUnitPrice(Number(variant.price));
  };

  const handleResetProductSelection = () => {
    setSelectedProduct(null);
    setSelectedVariant(null);
    setItemQuantity(1);
    setItemDiscount(0);
    setItemNotes("");
    setCustomUnitPrice(null);
  };

  return (
    <div>
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
                router.push("/publimar/banderas/presupuestos");
              }}
            >
              Sí, cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Nuevo presupuesto</h1>
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

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Detalles del presupuesto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="validUntil">Válido hasta</Label>
                <Input
                  id="validUntil"
                  name="validUntil"
                  type="date"
                  value={formData.validUntil}
                  onChange={handleChange}
                  required
                />
              </div>
              {/* <div className="space-y-2">
                <Label htmlFor="taxRate">Tasa de impuesto (%)</Label>
                <Input
                  id="taxRate"
                  name="taxRate"
                  type="number"
                  value={formData.taxRate}
                  onChange={handleChange}
                  required
                />
              </div> */}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows={3}
                placeholder="Incluye cualquier nota o comentario adicional para el cliente..."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Productos</CardTitle>
            <div className="flex gap-2">
            <Dialog open={showManualItemDialog} onOpenChange={setShowManualItemDialog}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-gray-600 hover:bg-gray-700 text-white"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Item Manual
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Agregar item manual</DialogTitle>
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
                      onChange={(e) => setManualItemDescription(e.target.value)}
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
                        onChange={(e) => setManualItemQuantity(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manualPrice">Precio unitario</Label>
                      <MoneyInput
                        id="manualPrice"
                        placeholder="0"
                        value={manualItemPrice || 0}
                        onValueChange={(n) => setManualItemPrice(n)}
                      />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Precio total:</span>
                      <span className="text-lg font-bold text-blue-600">
                        {formatearPrecio(manualItemQuantity * manualItemPrice)}
                      </span>
                    </div>
                  </div>
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
                    disabled={!manualItemName || !manualItemQuantity || !manualItemPrice}
                    className="bg-blue-900 hover:bg-blue-700 text-white"
                  >
                    Agregar item
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={isAddingProduct} onOpenChange={setIsAddingProduct}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddingProduct(true)}
                    className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Agregar producto
                  </Button>
                </DialogTrigger>
              <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingItemId
                      ? "Editar producto"
                      : "Agregar producto al presupuesto "}
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
                          onChange={(e) => setProductSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <div className="max-h-72 overflow-y-auto border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nombre</TableHead>
                              {/* <TableHead>Categorías</TableHead> */}
                              {/* <TableHead>Medida</TableHead> */}
                              {/* <TableHead className="text-right">Stock</TableHead> */}
                              {/* <TableHead className="text-right">Precio</TableHead>
                              <TableHead className="text-right">+ IVA</TableHead> */}
                              <TableHead>Acción</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {productsStatus === "loading" ? (
                              <TableRow>
                                <TableCell
                                  colSpan={7}
                                  className="text-center py-4"
                                >
                                  Cargando productos...
                                </TableCell>
                              </TableRow>
                            ) : filteredProducts && filteredProducts.length > 0 ? (
                              filteredProducts.map((product: DocumentData) => {
                                const typedProduct = product as unknown as TProduct;
                                const selectedVariant = typedProduct.variants?.[0];
                                return (
                                  <TableRow key={product.id}>
                                    <TableCell>{product.name}</TableCell>
                                    {/* <TableCell className="text-right">
                                      {selectedVariant ? (
                                        <span
                                          className={`${
                                            Number(selectedVariant.stock) < 5 ? "text-red-500" : ""
                                          }`}
                                        >
                                          {selectedVariant.stock}
                                        </span>
                                      ) : (
                                        "-"
                                      )}
                                    </TableCell> */}
                                    <TableCell>
                                      <Button
                                        size="sm"
                                        onClick={() => handleProductSelect(typedProduct, selectedVariant)}
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
                                  colSpan={7}
                                  className="text-center py-4"
                                >
                                  {productSearchTerm
                                    ? "No se encontraron productos con el término de búsqueda."
                                    : "Busca un producto para agregarlo al presupuesto."}
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

                      {selectedProduct.hasVariants && (
                        <div className="space-y-2">
                          <Label>Selecciona una variante</Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {products
                              ?.find((p) => p.id === selectedProduct.id)
                              ?.variants?.map((variant: TProductVariant) => (
                                <div
                                  key={variant.id}
                                  className={`cursor-pointer border rounded-md p-3 transition-all ${
                                    selectedVariant?.id === variant.id
                                      ? "border-slate-800 bg-slate-50"
                                      : "hover:border-slate-400"
                                  }`}
                                  onClick={() => handleVariantSelect(variant)}
                                >
                                  <div className="flex justify-between">
                                    <span className="font-medium">
                                      {variant.size}
                                    </span>
                                    <span className="text-slate-700">
                                      {formatearPrecio(Number(variant.price))}
                                    </span>
                                  </div>
                                  <div className="text-sm text-slate-500 mt-1">
                                    {variant.stock === Infinity ? " " : `Stock: ${variant.stock} unidades`}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="quantity">Cantidad</Label>
                          <Input
                            id="quantity"
                            type="number"
                            min="1"
                            value={itemQuantity}
                            onChange={(e) =>
                              setItemQuantity(parseInt(e.target.value) || 1)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="customPrice">Precio Unitario</Label>
                          <MoneyInput
                            id="customPrice"
                            placeholder="0"
                            value={customUnitPrice || 0}
                            onValueChange={(n) => setCustomUnitPrice(n)}
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
                              setItemDiscount(parseInt(e.target.value) || 0)
                            }
                          />
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-md">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm">
                              Precio unitario: {formatearPrecio(customUnitPrice || 0)}
                            </p>
                            {itemDiscount > 0 && (
                              <p className="text-sm">
                                Descuento: {itemDiscount}% ({formatearPrecio(
                                  ((customUnitPrice || 0) * itemDiscount) / 100
                                )})
                              </p>
                            )}
                            <p className="text-sm">Cantidad: {itemQuantity}</p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold">
                              Subtotal: {formatearPrecio(
                                itemQuantity *
                                ((customUnitPrice || 0) -
                                  ((customUnitPrice || 0) * itemDiscount) / 100)
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
                    onClick={() => {
                      setIsAddingProduct(false);
                      setSelectedProduct(null);
                      setSelectedVariant(null);
                      setItemQuantity(1);
                      setItemDiscount(0);
                      setItemNotes("");
                      setCustomUnitPrice(null);
                      setProductSearchTerm("");
                      setEditingItemId(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={addItemToQuote}
                    disabled={
                      !selectedProduct ||
                      (selectedProduct.hasVariants && !selectedVariant)
                    }
                  >
                    {editingItemId
                      ? "Actualizar producto"
                      : "Agregar al presupuesto"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-md">
                <p className="text-slate-500 mb-4">
                  No hay productos en el presupuesto
                </p>
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
                            <p className="font-medium">{item.product.name}</p>
                            {item.variant && (
                              <p className="text-sm text-slate-500">
                                Medida: {item.variant.size}
                              </p>
                            )}
                            {item.product.description && (
                              <p className="text-xs text-slate-500 mt-1">
                                {item.product.description}
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
                              title="Editarlos"
                              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
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
                      Desglosar IVA ({formData.taxRate}%)
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
                    <MoneyInput
                      id="manualDiscount"
                      value={manualDiscount || 0}
                      onValueChange={(n) => setManualDiscount(n)}
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

        <Card>
          <CardFooter className="flex justify-between pt-6">
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm('¿Estás seguro de que deseas cancelar? Se perderán los cambios no guardados.')) {
                  router.push("/publimar/banderas/presupuestos");
                }
              }}
              disabled={loading}
              type="button"
              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
            >
              Cancelar
            </Button>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={loading || (!selectedClient && !clienteInput.trim())}
                variant="default"
                className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
              >
                {loading ? "Guardando..." : "Guardar como borrador"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>

      {/* Dialog para crear cliente nuevo */}
      <Dialog open={showCreateClientDialog} onOpenChange={setShowCreateClientDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cliente no encontrado</DialogTitle>
            <div className="text-sm text-muted-foreground">
              El cliente "<strong>{clienteInput}</strong>" no existe en la base de datos.
              <br />¿Qué deseas hacer?
            </div>
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-3">
              <div className="rounded-lg border p-3">
                <h4 className="font-medium text-sm mb-1">Opción 1: Solo este presupuesto</h4>
                <p className="text-xs text-muted-foreground">
                  No guardar el cliente en la BD. Solo existirá en este presupuesto.
                </p>
              </div>

              <div className="rounded-lg border p-3 bg-green-50/50">
                <h4 className="font-medium text-sm mb-1">Opción 2: Guardar como nuevo cliente</h4>
                <p className="text-xs text-muted-foreground">
                  Crear el cliente en la BD para reutilizarlo en futuros presupuestos.
                </p>
                {(email || telefono || direccion || cuit) && (
                  <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                    <p className="font-medium">Se guardará con:</p>
                    {email && <p>• Email: {email}</p>}
                    {telefono && <p>• Tel: {telefono}</p>}
                    {direccion && <p>• Dir: {direccion}</p>}
                    {cuit && <p>• CUIT: {formatCuit(cuit)}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateClientDialog(false);
                setPendingQuoteData(null);
                setLoading(false);
              }}
              disabled={creatingClient}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateQuoteWithTemporaryClient}
              disabled={creatingClient}
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            >
              {creatingClient ? "Creando..." : "Solo este presupuesto"}
            </Button>
            <Button
              onClick={handleCreateNewClient}
              disabled={creatingClient}
              className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
            >
              {creatingClient ? "Creando..." : "Guardar como nuevo cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
