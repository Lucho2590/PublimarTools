"use client";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useFirestore, useFirestoreCollectionData, useUser } from "reactfire";
import {
  collection,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  doc,
} from "firebase/firestore";
import collections from "@/lib/collections";
import { EPaymentMethod } from "@/types/sale";
import { useRouter } from "next/navigation";
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
import { Search, Plus, Trash2, Edit, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { formatearPrecio, redondearTotal } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { TProduct, TProductVariant, TProductCategory } from "@/types/product";
// import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function NuevaOrdenPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { data: user } = useUser();

  // Clientes
  const clientsCollection = collection(firestore, collections.CLIENTS);
  const clientsQuery = query(clientsCollection, orderBy("name"));
  const { status: clientsStatus, data: clients } = useFirestoreCollectionData(
    clientsQuery,
    { idField: "id" }
  );

  // Presupuestos (quotes)
  const quotesCollection = collection(firestore, collections.QUOTES);
  const [selectedClientId, setSelectedClientId] = useState("");
  const quotesQuery = selectedClientId
    ? query(quotesCollection, where("client.id", "==", selectedClientId))
    : null;
  const { status: quotesStatus, data: quotes } = useFirestoreCollectionData(
    quotesQuery ?? quotesCollection,
    { idField: "id" }
  );

  // Estados para los campos principales (placeholder, lógica a implementar)
  const [cliente, setCliente] = useState("");
  const [personaContacto, setPersonaContacto] = useState("");
  const [direccion, setDireccion] = useState("");
  const [email, setEmail] = useState("");
  const [cuit, setCuit] = useState("");
  const [detalle, setDetalle] = useState("");
  const [fechaEntrada] = useState(() => new Date().toISOString().split("T")[0]);
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [presupuestoId, setPresupuestoId] = useState("");
  const [costoUnidad, setCostoUnidad] = useState("");
  const [precioUnidad, setPrecioUnidad] = useState("");
  const [costoTotal, setCostoTotal] = useState("");
  const [precioTotal, setPrecioTotal] = useState("");
  const [iva, setIva] = useState("21");
  const [totalNeto, setTotalNeto] = useState("");
  const [facturaNumero, setFacturaNumero] = useState("");
  const [facturaFecha, setFacturaFecha] = useState("");
  const [presupuestoNumero, setPresupuestoNumero] = useState("");
  const [presupuestoFecha, setPresupuestoFecha] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [sena, setSena] = useState("");
  const [saldo, setSaldo] = useState("");
  const [aFacturar, setAFacturar] = useState(false);
  const [facturado, setFacturado] = useState(false);
  const [estado, setEstado] = useState("in_process");
  const [contactosFiltrados, setContactosFiltrados] = useState<string[]>([]);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const contactInputRef = useRef<HTMLInputElement>(null);
  const [clienteInput, setClienteInput] = useState("");
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const clienteInputRef = useRef<HTMLInputElement>(null);
  const [telefono, setTelefono] = useState("");
  const [referencia, setReferencia] = useState("");
  
  // Estados para contacto
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoEmail, setContactoEmail] = useState("");
  const [contactoTelefono, setContactoTelefono] = useState("");
  const [contactoPosicion, setContactoPosicion] = useState("");

  // Estados para Items
  const [items, setItems] = useState<any[]>([]);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
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
  const [tipoFactura, setTipoFactura] = useState("");
  
  const BANCOS = ["Galicia", "Frances"];

  // Firestore
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { status: productsStatus, data: products } = useFirestoreCollectionData(
    productsCollection,
    { idField: "id" }
  );

  // Filtrar productos
  const filteredProducts = products?.filter((product: any) => {
    return (
      product.name?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
      product.description
        ?.toLowerCase()
        .includes(productSearchTerm.toLowerCase())
    );
  });

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
  const discountAmount = subtotalSinIVA * (discountPercentage / 100);
  const total = subtotal - discountAmount - manualDiscount;

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
        items.map((item) => (item.id === editingItemId ? newItem : item))
      );
    } else {
      setItems([...items, newItem]);
    }
    clearModalStates();
  };
  const startEditItem = (item: any) => {
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
    // Limpiar estados del modal de items
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

  // Manejar selección de cliente
  const handleSelectClient = (clientId: string) => {
    setSelectedClientId(clientId);
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
  };

  // Manejar selección de presupuesto
  const handleSelectQuote = (quoteId: string) => {
    if (quoteId === "none") {
      // Limpiar todos los campos relacionados con el presupuesto
      setPresupuestoId("");
      setDetalle("");
      setPrecioUnidad("");
      setPrecioTotal("");
      setIva("21");
      setTotalNeto("");
      setPresupuestoNumero("");
      setPresupuestoFecha("");
      setItems([]);
      return;
    }

    setPresupuestoId(quoteId);
    const quote = quotes?.find((q: any) => q.id === quoteId);
    setDetalle(quote?.details || "");
    setPrecioUnidad(quote?.items?.[0]?.unitPrice?.toString() || "");
    setPrecioTotal(quote?.total?.toString() || "");
    setIva(quote?.taxRate?.toString() || "21");
    setTotalNeto(quote?.totalWithTax?.toString() || "");
    setPresupuestoNumero(quote?.number || "");
    setPresupuestoFecha(
      quote?.createdAt
        ? new Date(quote.createdAt.seconds * 1000).toISOString().split("T")[0]
        : ""
    );
    // Cargar ítems del presupuesto en Items
    if (quote?.items && Array.isArray(quote.items)) {
      setItems(
        quote.items.map((item: any) => ({
          id: item.id,
          product: item.product,
          variant: item.variant,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
          subtotal: item.subtotal,
          notes: item.notes || "",
        }))
      );
    }
  };

  // Cálculo automático de total neto y saldo
  const calcTotalNeto = () => {
    const total = parseFloat(precioTotal) || 0;
    const ivaNum = parseFloat(iva) || 0;
    return (total + (total * ivaNum) / 100).toFixed(2);
  };
  const calcSaldo = () => {
    const neto = parseFloat(totalNeto || calcTotalNeto()) || 0;
    const s = parseFloat(sena) || 0;
    return (neto - s).toFixed(2);
  };

  // Actualizar total neto y saldo cuando cambian los valores
  useEffect(() => {
    setTotalNeto(calcTotalNeto());
  }, [precioTotal, iva]);
  useEffect(() => {
    const s = parseFloat(sena) || 0;
    setSaldo((total - s).toFixed(2));
  }, [total, sena]);

  const [loading, setLoading] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showCreateClientDialog, setShowCreateClientDialog] = useState(false);
  const [pendingOrderData, setPendingOrderData] = useState<any>(null);
  const [isOrderDetailsCollapsed, setIsOrderDetailsCollapsed] = useState(true);
  const [isContactDetailsCollapsed, setIsContactDetailsCollapsed] = useState(true);

  useEffect(() => {
    if(facturaNumero.length > 0){
      setFacturado(true);
    }
  }, [facturaNumero]);

  // Función para crear un nuevo cliente
  const createNewClient = async () => {
    try {
      const newClientData = {
        name: clienteInput,
        type: "company", // Por defecto, se puede ajustar según necesidades
        status: "active",
        email: email || null,
        phone: telefono || null,
        address: direccion || null,
        cuit: cuit || null,
        reference: referencia || null,
        contacts: contactoNombre ? [{
          name: contactoNombre,
          email: contactoEmail || "",
          phone: contactoTelefono || "",
          position: contactoPosicion || ""
        }] : [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const clientsCollection = collection(firestore, collections.CLIENTS);
      const docRef = await addDoc(clientsCollection, newClientData);
      
      return {
        id: docRef.id,
        ...newClientData
      };
    } catch (error) {
      console.error("Error creando cliente:", error);
      throw error;
    }
  };

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
    
    // Verificar si el cliente existe en la DB
    const existingClient = clients?.find((c: any) => 
      c.id === cliente || c.name.toLowerCase() === clienteInput.toLowerCase()
    );
    
    if (!existingClient && !cliente) {
      // El cliente no existe, mostrar diálogo de confirmación
      const orderData = await prepareOrderData();
      setPendingOrderData(orderData);
      setShowCreateClientDialog(true);
      return;
    }
    
    // El cliente existe o ya está seleccionado, proceder normalmente
    await saveOrder();
  };

  const prepareOrderData = async () => {
    // Generar número de orden único
    const orderNumber = `O-${new Date().getFullYear()}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;
    
    // Buscar cliente seleccionado o crear objeto temporal
    const clientObj = clients?.find((c: any) => c.id === cliente) || {
      id: null,
      name: clienteInput,
      email,
      phone: telefono,
      address: direccion,
      cuit,
      reference: referencia,
    };

    // Crear contacto si se proporcionaron datos
    const contactData = contactoNombre ? {
      name: contactoNombre,
      email: contactoEmail,
      phone: contactoTelefono,
      position: contactoPosicion
    } : null;

    // Crear un nuevo objeto cliente con el contacto
    const clientWithSelectedContact = {
      ...clientObj,
      contacts: contactData ? [contactData] : [],
    };

    return {
      number: orderNumber,
      client: clientWithSelectedContact,
      status: estado,
      items,
      subtotal: redondearTotal(applyIVA ? subtotalSinIVA : subtotal),
      taxRate: parseFloat(iva),
      taxAmount: redondearTotal(taxAmount),
      total: redondearTotal(total),
      // Información de IVA
      applyIVA,
      // Información de descuentos
      discountPercentage,
      discountAmount: redondearTotal(discountAmount),
      manualDiscount: redondearTotal(manualDiscount),
      notes: detalle,
      paymentMethod: formaPago,
      bank: formaPago === EPaymentMethod.TRANSFER ? banco : null,
      isInvoiced: facturado,
      invoiceNumber: facturaNumero,
      invoiceDate: facturaFecha,
      invoiceType: tipoFactura || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: doc(firestore, `users/${user?.uid}`),
      updatedBy: doc(firestore, `users/${user?.uid}`),
      estimatedDeliveryDate: fechaEntrega,
      budgetId: presupuestoId || null,
      budgetNumber: presupuestoNumero || null,
      budgetDate: presupuestoFecha || null,
      downPayment: sena,
      balance: saldo,
      cuit,
    };
  };

  const saveOrder = async (orderData?: any) => {
    setLoading(true);
    try {
      const dataToSave = orderData || await prepareOrderData();
      const ordersCollection = collection(firestore, collections.ORDERS);
      await addDoc(ordersCollection, dataToSave);
      toast.success("Orden guardada con éxito");
      router.push("/publimar/banderas/ordenes");
    } catch (error) {
      toast.error(
        "Error al guardar la orden: " +
          (error instanceof Error ? error.message : "Error desconocido")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClientAndOrder = async () => {
    setLoading(true);
    try {
      // Crear el cliente nuevo
      const newClient = await createNewClient();
      
      // Actualizar los datos de la orden con el cliente creado
      const updatedOrderData = {
        ...pendingOrderData,
        client: {
          ...newClient,
          contacts: contactoNombre ? [{
            name: contactoNombre,
            email: contactoEmail,
            phone: contactoTelefono,
            position: contactoPosicion
          }] : [],
        }
      };
      
      // Guardar la orden
      await saveOrder(updatedOrderData);
      setShowCreateClientDialog(false);
      setPendingOrderData(null);
    } catch (error) {
      toast.error("Error al crear cliente y orden: " + (error instanceof Error ? error.message : "Error desconocido"));
      setLoading(false);
    }
  };

  const handleSaveOrderWithoutClient = async () => {
    try {
      await saveOrder(pendingOrderData);
      setShowCreateClientDialog(false);
      setPendingOrderData(null);
    } catch (error) {
      toast.error("Error al guardar la orden: " + (error instanceof Error ? error.message : "Error desconocido"));
    }
  };

  return (
    <div className="p-6">
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

      <Dialog open={showCreateClientDialog} onOpenChange={setShowCreateClientDialog}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Cliente no encontrado</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-slate-700 mb-4">
            El cliente {clienteInput} no existe en la base de datos.
            <br />
            ¿Deseas registrarlo como un nuevo cliente?
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveOrderWithoutClient}
              disabled={loading}
            >
              No, solo guardar orden
            </Button>
            <Button
              size="sm"
              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
              onClick={handleCreateClientAndOrder}
              disabled={loading}
            >
              {loading ? "Creando..." : "Sí, crear cliente"}
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
                  onChange={(e) => {
                    setClienteInput(e.target.value);
                    setShowClienteDropdown(true);
                  }}
                  onFocus={() => setShowClienteDropdown(true)}
                  onBlur={() =>
                    setTimeout(() => setShowClienteDropdown(false), 150)
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
                        borderRadius: 4,
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
                        .map((c: any) => (
                          <li
                            key={c.id}
                            style={{ padding: 8, cursor: "pointer" }}
                            onMouseDown={() => {
                              handleSelectClient(c.id);
                              setClienteInput(c.name);
                              setShowClienteDropdown(false);
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
              <div className="flex-1" style={{ position: "relative" }}>
                <Label>Persona de contacto</Label>
                <Input
                  ref={contactInputRef}
                  placeholder="Buscar o escribir contacto..."
                  value={personaContacto}
                  onChange={(e) => {
                    setPersonaContacto(e.target.value);
                    const client = clients?.find((c: any) => c.id === cliente);
                    if (client?.contacts) {
                      setContactosFiltrados(
                        client.contacts
                          .map((c: any) => c.name)
                          .filter((name: string) =>
                            name
                              .toLowerCase()
                              .includes(e.target.value.toLowerCase())
                          )
                      );
                    } else {
                      setContactosFiltrados([]);
                    }
                    setShowContactDropdown(true);
                  }}
                  onFocus={() => {
                    const client = clients?.find((c: any) => c.id === cliente);
                    if (client?.contacts) {
                      setContactosFiltrados(
                        client.contacts.map((c: any) => c.name)
                      );
                    } else {
                      setContactosFiltrados([]);
                    }
                    setShowContactDropdown(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowContactDropdown(false), 150);
                  }}
                />
                {showContactDropdown && contactosFiltrados.length > 0 && (
                  <ul
                    style={{
                      position: "absolute",
                      zIndex: 10,
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: 4,
                      width: "100%",
                      maxHeight: 150,
                      overflowY: "auto",
                      marginTop: 2,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    }}
                  >
                    {contactosFiltrados.map((name) => (
                      <li
                        key={name}
                        style={{ padding: 8, cursor: "pointer" }}
                        onMouseDown={() => {
                          setPersonaContacto(name);
                          setShowContactDropdown(false);
                          const client = clients?.find(
                            (c: any) => c.id === cliente
                          );
                          const contacto = client?.contacts?.find(
                            (c: any) => c.name === name
                          );
                          setEmail(contacto?.email || client?.email || "");
                          setTelefono(contacto?.phone || client?.phone || "");
                          if (contactInputRef.current)
                            contactInputRef.current.blur();
                        }}
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
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
                <Input value={cuit} onChange={(e) => setCuit(e.target.value)} />
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
                <h4 className="text-sm font-medium text-gray-700">Datos del Contacto (Opcional)</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsContactDetailsCollapsed(!isContactDetailsCollapsed)}
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
            <div className="flex items-center gap-2">
              <CardTitle>Detalles de la orden</CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsOrderDetailsCollapsed(!isOrderDetailsCollapsed)}
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
                  onChange={(e) => setFechaEntrega(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Presupuesto</Label>
              <Select
                value={presupuestoId}
                onValueChange={(value) => handleSelectQuote(value)}
                disabled={!cliente}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar presupuesto..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin presupuesto</SelectItem>
                  {quotes &&
                    quotes
                      .filter((q: any) => q.client?.id === cliente)
                      .sort((a: any, b: any) => {
                        const aDate = a.createdAt?.seconds
                          ? a.createdAt.seconds
                          : 0;
                        const bDate = b.createdAt?.seconds
                          ? b.createdAt.seconds
                          : 0;
                        return bDate - aDate;
                      })
                      .map((q: any) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.number}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2 mt-2">
                <Button
                  disabled={!cliente}
                  variant="link"
                  className="p-0"
                  onClick={() =>
                    router.push("/publimar/banderas/presupuestos/nuevo")
                  }
                  name="Agregar presupuesto"
                  title="Agregar presupuesto"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    className="size-6"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
                    />
                  </svg>
                </Button>
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

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Items</CardTitle>
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
                    {editingItemId ? "Editar item" : "Agregar item a la orden "}
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
                              {/* <TableHead className="text-right">
                                Stock
                              </TableHead> */}
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
                            ) : filteredProducts &&
                              filteredProducts.length > 0 ? (
                              filteredProducts.map((product: any) => {
                                const selectedVariant = product.variants?.[0];
                                return (
                                  <TableRow key={product.id}>
                                    <TableCell>{product.name}</TableCell>
                                    {/* <TableCell className="text-right">
                                      {selectedVariant ? (
                                        <span
                                          className={
                                            Number(
                                              selectedVariant.stock
                                            ) < 5
                                              ? "text-red-500"
                                              : ""
                                          }
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
                                  colSpan={7}
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
                                    onClick={() => setSelectedVariant(variant)}
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
                                      Stock: {variant.stock} unidades
                                    </div>
                                  </div>
                                )
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
                              setItemQuantity(parseInt(e.target.value) || 1)
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
                              setItemDiscount(parseInt(e.target.value) || 0)
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
                                  : 0
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
                                    100
                                )}
                                )
                              </p>
                            )}
                            <p className="text-sm">Cantidad: {itemQuantity}</p>
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
                                      100)
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
                            <p className="font-medium">{item.product.name}</p>
                            {item.variant && (
                              <p className="text-sm text-slate-500">
                                Variante: {item.variant.size}
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
                      onCheckedChange={(checked) => setApplyIVA(checked as boolean)}
                      className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                    <Label htmlFor="applyIVA" className="text-sm text-gray-700">
                      Desglosar IVA ({iva}%)
                    </Label>
                  </div>
                  <p className="text-sm text-gray-600">
                    {applyIVA ? `${formatearPrecio(redondearTotal(taxAmount))}` : '$ 0,00'}
                  </p>
                </div>

                {applyIVA && (
                  <div className="flex justify-between items-center text-sm pl-6">
                    <p className="text-gray-600">Subtotal sin IVA</p>
                    <p className="font-medium">{formatearPrecio(redondearTotal(subtotalSinIVA))}</p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Label htmlFor="discount" className="text-sm text-gray-700 w-24">
                      Descuento (%)
                    </Label>
                    <Input
                      id="discount"
                      type="number"
                      min="0"
                      max="100"
                      value={discountPercentage}
                      onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                      className="w-16 h-8 text-center text-sm"
                      placeholder="0"
                    />
                  </div>
                  <p className="text-red-600">-{formatearPrecio(redondearTotal(discountAmount))}</p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Label htmlFor="manualDiscount" className="text-sm text-gray-700 w-24">
                      Descuento ($)
                    </Label>
                    <Input
                      id="manualDiscount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualDiscount}
                      onChange={(e) => setManualDiscount(Number(e.target.value))}
                      className="w-20 h-8 text-center text-sm"
                      placeholder="0"
                    />
                  </div>
                  <p className="text-red-600">-{formatearPrecio(redondearTotal(manualDiscount))}</p>
                </div>

                <div className="border-t pt-3">
                  <div className="flex justify-between items-center">
                    <p className="text-lg font-semibold">Total</p>
                    <p className="text-xl font-bold">{formatearPrecio(redondearTotal(total))}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Información de facturación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Factura</Label>
                  <Select
                    value={tipoFactura}
                    onValueChange={(value) => setTipoFactura(value)}
                  >
                    <SelectTrigger >
                      <SelectValue placeholder="Seleccionar tipo de factura" />
                    </SelectTrigger>
                    <SelectContent >
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="B">B</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Factura N°</Label>
                  <Input
                    value={facturaNumero}
                    onChange={(e) => setFacturaNumero(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fecha factura</Label>
                  <Input
                    type="date"
                    value={facturaFecha}
                    onChange={(e) => setFacturaFecha(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Forma de pago</Label>
                <Select
                  value={formaPago}
                  onValueChange={(value) => setFormaPago(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar forma de pago..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EPaymentMethod.CASH}>Efectivo</SelectItem>
                    <SelectItem value={EPaymentMethod.CREDIT_CARD}>
                      Tarjeta de Crédito
                    </SelectItem>
                    <SelectItem value={EPaymentMethod.DEBIT_CARD}>
                      Tarjeta de Débito
                    </SelectItem>
                    <SelectItem value={EPaymentMethod.TRANSFER}>Transferencia</SelectItem>
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
                       <SelectItem key={bancoItem} value={bancoItem}>{bancoItem}</SelectItem>
                     ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Seña</Label>
                <Input
                  type="number"
                  value={sena}
                  onChange={(e) => setSena(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Saldo</Label>
                <Input type="number" value={saldo} readOnly />
              </div>
            </div>
          </CardContent>
        </Card>

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
              >
                {loading ? "Guardando..." : "Guardar orden"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
