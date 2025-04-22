"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  useFirestore,
  useFirestoreDoc,
  useFirestoreCollectionData,
} from "reactfire";
import {
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  DocumentData,
} from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "~/components/ui/dialog";
import { Search, Plus, Trash2, Edit, ArrowLeft } from "lucide-react";
import collections from "~/lib/collections";
import { EQuoteStatus, TQuote, TQuoteItem } from "~/types/quote";
import { TClient } from "~/types/client";
import { TProduct, TProductVariant } from "~/types/product";

// Tipo para los items del presupuesto local
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

export default function EditarPresupuestoPage({
  params,
}: {
  params: { id: string };
}) {
  const [loading, setLoading] = useState(false);
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
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();
  const firestore = useFirestore();

  // Obtener el presupuesto a editar
  const quoteRef = doc(firestore, collections.QUOTES, params.id);
  const { status: quoteStatus, data } = useFirestoreDoc(quoteRef, {
    idField: "id",
  });

  // Convertir el data a TQuote
  const quote = data as unknown as TQuote;

  // Fetch clients
  const clientsCollection = collection(firestore, collections.CLIENTS);
  const { status: clientsStatus, data: clients } = useFirestoreCollectionData(
    clientsCollection,
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

  // Basic quote info
  const [formData, setFormData] = useState({
    number: "", // Will be auto-generated
    notes: "",
    validUntil: new Date().toISOString().split("T")[0],
    taxRate: 21, // Default tax rate
  });

  // Cargar datos del presupuesto cuando esté disponible
  useEffect(() => {
    if (quoteStatus === "success" && quote) {
      // Configurar cliente seleccionado
      setSelectedClient(quote.client);

      // Configurar items
      const mappedItems: QuoteItem[] = quote.items.map((item: TQuoteItem) => ({
        id: item.id,
        product: item.product,
        variant: item.variant || undefined,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
        subtotal: item.subtotal,
        notes: item.notes || "",
      }));

      setItems(mappedItems);

      // Configurar datos básicos
      setFormData({
        number: quote.number,
        notes: quote.notes || "",
        validUntil: new Date(quote.validUntil).toISOString().split("T")[0],
        taxRate: quote.taxRate,
      });

      setIsLoading(false);
    }
  }, [quoteStatus, quote]);

  // Filter clients based on search
  const filteredClients = clients?.filter((client: DocumentData) => {
    if (!client) return false;
    return (
      client.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.phone?.includes(searchTerm)
    );
  });

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

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const taxAmount = subtotal * (Number(formData.taxRate) / 100);
  const total = subtotal + taxAmount;

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

    const price = selectedVariant
      ? selectedVariant.price
      : selectedProduct.price || 0;
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
    setProductSearchTerm("");
    setEditingItemId(null);
    setIsAddingProduct(false);
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
    setItems(items.filter((item) => item.id !== itemId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedClient) {
      toast.error("Debes seleccionar un cliente");
      return;
    }

    if (items.length === 0) {
      toast.error("Debes agregar al menos un producto al presupuesto");
      return;
    }

    setLoading(true);

    try {
      // Ensure all required fields have values and sanitize data for Firestore
      const sanitizedItems = items.map((item) => ({
        id: item.id,
        product: {
          id: item.product.id,
          name: item.product.name,
          description: item.product.description || "",
          category: item.product.category,
          status: item.product.status,
          imageUrls: item.product.imageUrls || [],
          hasVariants: item.product.hasVariants || false,
          price: item.product.price || 0,
          stock: item.product.stock || 0,
          sku: item.product.sku || "",
          createdAt: item.product.createdAt,
          updatedAt: item.product.updatedAt,
        },
        variant: item.variant
          ? {
              id: item.variant.id,
              size: item.variant.size,
              price: item.variant.price,
              stock: item.variant.stock,
              sku: item.variant.sku || "",
            }
          : null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
        subtotal: item.subtotal,
        notes: item.notes || "",
      }));

      const quoteData = {
        // Conservar el número y demás datos originales
        number: formData.number,
        client: {
          id: selectedClient.id,
          name: selectedClient.name,
          type: selectedClient.type,
          status: selectedClient.status,
          email: selectedClient.email || "",
          phone: selectedClient.phone || "",
          address: selectedClient.address || "",
          taxId: selectedClient.taxId || "",
          notes: selectedClient.notes || "",
          contacts: selectedClient.contacts || [],
          createdAt: selectedClient.createdAt,
          updatedAt: selectedClient.updatedAt,
        },
        status: quote.status, // Mantener el estado actual
        items: sanitizedItems,
        subtotal: subtotal,
        taxRate: parseFloat(formData.taxRate.toString()),
        taxAmount: taxAmount,
        total: total,
        validUntil: new Date(formData.validUntil),
        notes: formData.notes || "",
        updatedAt: serverTimestamp(),
      };

      await updateDoc(quoteRef, quoteData);

      toast.success("Presupuesto actualizado exitosamente");
      router.push(`/dashboard/presupuestos/${params.id}`);
    } catch (error) {
      console.error("Error al actualizar presupuesto:", error);
      toast.error(
        `Ocurrió un error al actualizar el presupuesto: ${
          error instanceof Error ? error.message : "Error desconocido"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClient = (client: TClient) => {
    setSelectedClient(client);
    setSearchTerm("");
  };

  const handleProductSelect = (product: TProduct) => {
    setSelectedProduct(product);

    // Si no tiene variantes, establecer el precio directamente
    if (!product.hasVariants) {
      setSelectedVariant(null);
    }
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
  };

  if (isLoading || quoteStatus === "loading") {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Editar presupuesto</h1>
        <Button
          variant="outline"
          onClick={() => router.push(`/dashboard/presupuestos/${params.id}`)}
        >
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedClient ? (
              <div className="bg-slate-50 p-4 rounded-md">
                <div className="flex justify-between">
                  <div>
                    <h3 className="font-medium text-lg">
                      {selectedClient.name}
                    </h3>
                    <p className="text-slate-500">
                      {selectedClient.email || "No email"} |{" "}
                      {selectedClient.phone || "No teléfono"}
                    </p>
                    {selectedClient.address && (
                      <p className="text-slate-500">{selectedClient.address}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => setSelectedClient(null)}
                    type="button"
                  >
                    Cambiar
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {/* Búsqueda de clientes */}
                <div className="mb-4 relative">
                  <Search
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    size={16}
                  />
                  <Input
                    placeholder="Buscar cliente por nombre, email o teléfono..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {searchTerm && clientsStatus !== "loading" && (
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Teléfono</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredClients && filteredClients.length > 0 ? (
                          filteredClients.map((client: DocumentData) => (
                            <TableRow key={client.id}>
                              <TableCell>{client.name}</TableCell>
                              <TableCell>{client.email || "-"}</TableCell>
                              <TableCell>{client.phone || "-"}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleSelectClient(client as TClient)
                                  }
                                  type="button"
                                >
                                  Seleccionar
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-4">
                              No se encontraron clientes con el término de
                              búsqueda.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
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
              <div className="space-y-2">
                <Label htmlFor="taxRate">Tasa de impuesto (%)</Label>
                <Input
                  id="taxRate"
                  name="taxRate"
                  type="number"
                  value={formData.taxRate}
                  onChange={handleChange}
                  required
                />
              </div>
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
            <Dialog open={isAddingProduct} onOpenChange={setIsAddingProduct}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={!selectedClient}
                  onClick={() => setIsAddingProduct(true)}
                >
                  <Plus className="mr-2 h-4 w-4" /> Agregar producto
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px]">
                <DialogHeader>
                  <DialogTitle>
                    {editingItemId
                      ? "Editar producto"
                      : "Agregar producto al presupuesto"}
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
                              <TableHead>Descripción</TableHead>
                              <TableHead>Precio</TableHead>
                              <TableHead>Acción</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {productsStatus === "loading" ? (
                              <TableRow>
                                <TableCell
                                  colSpan={4}
                                  className="text-center py-4"
                                >
                                  Cargando productos...
                                </TableCell>
                              </TableRow>
                            ) : filteredProducts &&
                              filteredProducts.length > 0 ? (
                              filteredProducts.map((product: DocumentData) => (
                                <TableRow key={product.id}>
                                  <TableCell>{product.name}</TableCell>
                                  <TableCell className="truncate max-w-[200px]">
                                    {product.description || "-"}
                                  </TableCell>
                                  <TableCell>
                                    {product.hasVariants
                                      ? "Múltiples precios"
                                      : `$${product.price?.toFixed(2) || "-"}`}
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleProductSelect(product as TProduct)
                                      }
                                      type="button"
                                    >
                                      Seleccionar
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell
                                  colSpan={4}
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
                      {/* Detalles del producto seleccionado */}
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
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-md">
                <p className="text-slate-500 mb-4">
                  No hay productos en el presupuesto
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddingProduct(true)}
                  disabled={!selectedClient}
                >
                  <Plus className="mr-2 h-4 w-4" /> Agregar producto
                </Button>
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
                        <TableCell>${item.unitPrice.toFixed(2)}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          {item.discount > 0 ? `${item.discount}%` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${item.subtotal.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEditItem(item)}
                              title="Editar"
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
            <div className="space-y-3 divide-y">
              <div className="flex justify-between py-2">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-600">
                  IVA ({formData.taxRate}%):
                </span>
                <span className="font-medium">${taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-lg font-semibold">Total:</span>
                <span className="text-lg font-bold">${total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardFooter className="flex justify-between pt-6">
            <Button
              variant="outline"
              onClick={() =>
                router.push(`/dashboard/presupuestos/${params.id}`)
              }
              disabled={loading}
              type="button"
            >
              Cancelar
            </Button>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={loading || !selectedClient}
                variant="default"
              >
                {loading ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
