"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  useFirestore,
  useFirestoreDocData,
  useFirestoreCollectionData,
} from "reactfire";
import {
  doc,
  updateDoc,
  getDoc,
  collection,
  DocumentData,
} from "firebase/firestore";
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Edit, Save, X, Plus, Trash2, Search } from "lucide-react";
import collections from "@/lib/collections";
import { EQuoteStatus, TQuote, TQuoteItem } from "@/types/quote";
import { TClient } from "@/types/client";
import { TProduct, TProductVariant } from "@/types/product";
import { formatDate, formatearPrecio } from "@/lib/utils";

// Tipo para los items del presupuesto
type QuoteItem = {
  taxAmount: number;
  id: string;
  product: TProduct;
  variant?: TProductVariant;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  notes: string;
};

interface QuoteDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteId: string | null;
}

export default function QuoteDetailsModal({
  isOpen,
  onClose,
  quoteId,
}: QuoteDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<TQuote | null>(null);
  const [selectedClient, setSelectedClient] = useState<TClient | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<TProduct | null>(null);
  const [selectedVariant, setSelectedVariant] =
    useState<TProductVariant | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemDiscount, setItemDiscount] = useState(0);
  const [itemNotes, setItemNotes] = useState("");
  const firestore = useFirestore();

  // Basic quote info
  const [formData, setFormData] = useState({
    number: "",
    notes: "",
    validUntil: new Date().toISOString().split("T")[0],
    taxRate: 21,
    status: EQuoteStatus.DRAFT,
  });

  // Obtener el presupuesto - crear un doc dummy si no hay quoteId
  const quoteDoc =
    quoteId && firestore
      ? doc(firestore, collections.QUOTES, quoteId)
      : firestore
      ? doc(firestore, collections.QUOTES, "dummy")
      : null;

  const { status, data } = useFirestoreDocData(quoteDoc!, { idField: "id" });

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

  // Función de reset para el modal
  const resetModalStates = useCallback(() => {
    setIsEditing(false);
    setLoading(false);
    setQuote(null);
    setSelectedClient(null);
    setSearchTerm("");
    setProductSearchTerm("");
    setItems([]);
    setIsAddingProduct(false);
    setEditingItemId(null);
    setSelectedProduct(null);
    setSelectedVariant(null);
    setItemQuantity(1);
    setItemDiscount(0);
    setItemNotes("");
    setFormData({
      number: "",
      notes: "",
      validUntil: new Date().toISOString().split("T")[0],
      taxRate: 21,
      status: EQuoteStatus.DRAFT,
    });
  }, []);

  // Reset al cerrar modal
  useEffect(() => {
    if (!isOpen) {
      resetModalStates();
    }
  }, [isOpen, resetModalStates]);

  // Cargar datos del presupuesto cuando cambian los datos
  useEffect(() => {
    if (data && quoteId && isOpen) {
      const quoteData = data as TQuote;
      setQuote(quoteData);
      setSelectedClient(quoteData.client);

      if (quoteData.items && Array.isArray(quoteData.items)) {
        const mappedItems: QuoteItem[] = quoteData.items.map(
          (item: TQuoteItem) => ({
            id: item.id,
            product: { 
              id: item.productId || '', 
              name: item.productName,
              description: item.description || '',
              images: [],
              basePrice: item.unitPrice,
              categories: item.categories || [],
              stock: 0,
              status: 'active' as const,
              createdAt: new Date(),
              updatedAt: new Date()
            },
            variant: item.variantId ? { 
              id: item.variantId, 
              name: item.variantName || '',
              price: item.unitPrice,
              stock: 0,
              isActive: true
            } : undefined,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            subtotal: item.subtotal,
            taxAmount: item.taxAmount || 0,
            notes: item.notes || "",
          })
        );
        setItems(mappedItems);
      }

      setFormData({
        number: quoteData.number,
        notes: quoteData.notes || "",
        validUntil:
          quoteData.validUntil instanceof Date
            ? quoteData.validUntil.toISOString().split("T")[0]
            : typeof quoteData.validUntil === "object" &&
              quoteData.validUntil !== null &&
              "toDate" in quoteData.validUntil
            ? (quoteData.validUntil as { toDate: () => Date })
                .toDate()
                .toISOString()
                .split("T")[0]
            : new Date().toISOString().split("T")[0],
        taxRate: quoteData.taxRate || 21,
        status: quoteData.status || EQuoteStatus.DRAFT,
      });
    }
  }, [data, quoteId, isOpen]);

  // Recalcular taxAmount cuando cambie la tasa de impuesto
  useEffect(() => {
    if (items.length > 0) {
      const updatedItems = items.map((item) => ({
        ...item,
        taxAmount: item.subtotal * (Number(formData.taxRate) / 100),
      }));
      setItems(updatedItems);
    }
  }, [formData.taxRate, items]);

  // No renderizar nada si el modal no está abierto o no hay quoteId
  if (!isOpen || !quoteId) {
    return null;
  }

  // Si no tenemos firestore, mostrar loading
  if (!firestore) {
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

  // Filter clients based on search (memoizado)
  const filteredClients = useMemo(() => {
    return clients?.filter((client: DocumentData) => {
      if (!client) return false;
      return (
        client.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.phone?.includes(searchTerm)
      );
    });
  }, [clients, searchTerm]);

  // Filter products based on search (memoizado)
  const filteredProducts = useMemo(() => {
    return products?.filter((product: DocumentData) => {
      if (!product) return false;
      return (
        product.name?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
        product.description
          ?.toLowerCase()
          .includes(productSearchTerm.toLowerCase())
      );
    });
  }, [products, productSearchTerm]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const addItemToQuote = () => {
    if (!selectedProduct) return;

    const price = selectedVariant?.price
      ? Number(selectedVariant.price)
      : Number(selectedProduct.price);

    const subtotal = price * itemQuantity * (1 - itemDiscount / 100);
    const taxAmount = subtotal * (Number(formData.taxRate) / 100);

    const newItem: QuoteItem = {
      id: editingItemId || Date.now().toString(),
      product: selectedProduct,
      variant: selectedVariant || undefined,
      quantity: itemQuantity,
      unitPrice: price,
      discount: itemDiscount,
      subtotal: subtotal,
      taxAmount: taxAmount,
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

  const startEditItem = (item: QuoteItem) => {
    setSelectedProduct(item.product);
    setSelectedVariant(item.variant || null);
    setItemQuantity(item.quantity);
    setItemDiscount(item.discount);
    setItemNotes(item.notes);
    setEditingItemId(item.id);
    setIsAddingProduct(true);
  };

  const removeItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quote || !selectedClient) return;

    setLoading(true);
    try {
      const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      const tax = items.reduce((sum, item) => sum + item.taxAmount, 0);
      const total = subtotal + tax;

      const quoteItems: TQuoteItem[] = items.map((item) => ({
        id: item.id,
        productName: item.product.name,
        product: item.product,
        variant: item.variant,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        subtotal: item.subtotal,
        tax: item.taxAmount,
        taxAmount: item.taxAmount,
        description: item.product.description || "",
        categories: [],
        notes: item.notes,
      }));

      const updateData = {
        client: selectedClient,
        items: quoteItems,
        subtotal: subtotal,
        taxRate: Number(formData.taxRate),
        tax: tax,
        taxAmount: tax,
        total: total,
        notes: formData.notes,
        status: formData.status,
        validUntil: new Date(formData.validUntil),
        updatedAt: new Date(),
      };

      await updateDoc(doc(firestore, collections.QUOTES, quote.id), updateData);
      toast.success("Presupuesto actualizado correctamente");
      setIsEditing(false);
    } catch (error) {
      console.error("Error al actualizar presupuesto:", error);
      toast.error("Error al actualizar el presupuesto");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClient = (client: TClient) => {
    setSelectedClient(client);
    setSearchTerm("");
  };

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

  // Calcular totales
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const tax = items.reduce((sum, item) => sum + item.taxAmount, 0);
  const total = subtotal + tax;

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

  if (!quote || !quote.client) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <div className="text-center my-12">
            <h2 className="text-xl font-semibold mb-4">
              No se encontró el presupuesto o datos incompletos
            </h2>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-2xl font-bold">
            Presupuesto #{quote.number}
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
                  form="edit-quote-form"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white"
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
                  {/* <X className="h-4 w-4 mr-2" /> */}
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {isEditing ? (
          // Modo edición
          <form id="edit-quote-form" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Información del Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="client-search">Buscar Cliente</Label>
                      <div className="relative">
                        <Input
                          id="client-search"
                          type="text"
                          placeholder="Buscar por nombre, email o teléfono..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      </div>
                      {searchTerm && filteredClients && (
                        <div className="mt-2 border rounded-md max-h-40 overflow-y-auto">
                          {filteredClients.map((client: any) => (
                            <div
                              key={client.id}
                              className="p-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                              onClick={() => handleSelectClient(client)}
                            >
                              <div className="font-medium">{client.name}</div>
                              {client.email && (
                                <div className="text-sm text-gray-600">
                                  {client.email}
                                </div>
                              )}
                              {client.phone && (
                                <div className="text-sm text-gray-600">
                                  {client.phone}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedClient && (
                      <div className="p-3 bg-blue-50 rounded-md">
                        <div className="font-medium">{selectedClient.name}</div>
                        {selectedClient.email && (
                          <div className="text-sm text-gray-600">
                            {selectedClient.email}
                          </div>
                        )}
                        {selectedClient.phone && (
                          <div className="text-sm text-gray-600">
                            {selectedClient.phone}
                          </div>
                        )}
                        {selectedClient.address && (
                          <div className="text-sm text-gray-600">
                            {selectedClient.address}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Detalles del Presupuesto</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="number">Número</Label>
                      <Input
                        id="number"
                        name="number"
                        value={formData.number}
                        onChange={handleChange}
                        disabled
                      />
                    </div>
                    <div>
                      <Label htmlFor="validUntil">Válido hasta</Label>
                      <Input
                        id="validUntil"
                        name="validUntil"
                        type="date"
                        value={formData.validUntil}
                        onChange={handleChange}
                      />
                    </div>
                    <div>
                      <Label htmlFor="taxRate">Tasa de IVA (%)</Label>
                      <Input
                        id="taxRate"
                        name="taxRate"
                        type="number"
                        step="0.01"
                        value={formData.taxRate}
                        onChange={handleChange}
                      />
                    </div>
                    <div>
                      <Label htmlFor="status">Estado</Label>
                      <Select
                        name="status"
                        value={formData.status}
                        onValueChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            status: value as EQuoteStatus,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un estado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EQuoteStatus.DRAFT}>
                            Borrador
                          </SelectItem>
                          <SelectItem value={EQuoteStatus.SENT}>
                            Enviado
                          </SelectItem>
                          <SelectItem value={EQuoteStatus.CONFIRMED}>
                            Confirmado
                          </SelectItem>
                          <SelectItem value={EQuoteStatus.REJECTED}>
                            Rechazado
                          </SelectItem>
                        </SelectContent>
                      </Select>
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
                          <div className="mt-2 border rounded-md max-h-40 overflow-y-auto bg-white">
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
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
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
                                  {variant.size} -{" "}
                                  {formatearPrecio(Number(variant.price))}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          onClick={addItemToQuote}
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
                          {item.discount > 0 ? `${item.discount}%` : "-"}
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
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Totales en modo edición */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Totales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-right">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatearPrecio(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>IVA ({formData.taxRate}%):</span>
                    <span>{formatearPrecio(tax)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span>{formatearPrecio(total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Notas adicionales..."
                  rows={3}
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
                  <h3 className="font-medium text-lg">{quote.client.name}</h3>
                  {quote.client.email && (
                    <p className="text-slate-600">
                      Email: {quote.client.email}
                    </p>
                  )}
                  {quote.client.phone && (
                    <p className="text-slate-600">
                      Teléfono: {quote.client.phone}
                    </p>
                  )}
                  {quote.client.address && (
                    <p className="text-slate-600">
                      Dirección: {quote.client.address}
                    </p>
                  )}
                  {quote.client.cuit && (
                    <p className="text-slate-600">
                      CUIT/CUIL: {quote.client.cuit}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Detalles del Presupuesto</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Fecha:</span>
                      <span>{formatDate(quote.createdAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Válido hasta:</span>
                      <span>{formatDate(quote.validUntil)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Estado:</span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          quote.status === EQuoteStatus.DRAFT
                            ? "bg-slate-100 text-slate-800"
                            : quote.status === EQuoteStatus.SENT
                            ? "bg-blue-100 text-blue-800"
                            : quote.status === EQuoteStatus.CONFIRMED
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {quote.status === EQuoteStatus.DRAFT
                          ? "Borrador"
                          : quote.status === EQuoteStatus.SENT
                          ? "Enviado"
                          : quote.status === EQuoteStatus.CONFIRMED
                          ? "Confirmado"
                          : "Rechazado"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Tasa IVA:</span>
                      <span>{quote.taxRate}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Productos</CardTitle>
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
                    {quote.items.map((item: any) => (
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

            {quote.notes && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Notas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{quote.notes}</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Totales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-right">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatearPrecio(quote.subtotal || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>IVA ({quote.taxRate}%):</span>
                    <span>{formatearPrecio(quote.taxAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span>{formatearPrecio(quote.total || 0)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
