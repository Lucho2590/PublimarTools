"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  collection,
  addDoc,
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
import { EQuoteStatus } from "~/types/quote";
import { TClient } from "~/types/client";
import { TProduct, TProductVariant, TProductCategory } from "~/types/product";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

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
  const [loading, setLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<TClient | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<TProduct | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<TProductVariant | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemDiscount, setItemDiscount] = useState(0);
  const [itemNotes, setItemNotes] = useState("");

  const router = useRouter();
  const firestore = useFirestore();

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
    validUntil: new Date(new Date().setDate(new Date().getDate() + 30))
      .toISOString()
      .split("T")[0], // 30 days from now
    taxRate: 21, // Default tax rate
  });

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

    const price = Number(selectedVariant
      ? selectedVariant.price
      : selectedProduct.price || 0);
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
          stock: item.product.stock || 0,
          sku: item.product.sku || "",
          taxRate: item.product.taxRate || 21,
          variants: item.product.variants || [],
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
        number: quoteNumber,
        client: {
          id: selectedClient.id,
          name: selectedClient.name,
          type: selectedClient.type,
          status: selectedClient.status,
          email: selectedClient.email || "",
          phone: selectedClient.phone || "",
          address: selectedClient.address || "",
          taxId: selectedClient.cuit || "",
          notes: selectedClient.notes || "",
          contacts: selectedClient.contacts || [],
          createdAt: selectedClient.createdAt,
          updatedAt: selectedClient.updatedAt,
        },
        status: EQuoteStatus.DRAFT,
        items: sanitizedItems,
        subtotal: subtotal,
        taxRate: parseFloat(formData.taxRate.toString()),
        taxAmount: taxAmount,
        total: total,
        validUntil: new Date(formData.validUntil),
        notes: formData.notes || "",
        comments: [],
        publicUrl: `${window.location.origin}/presupuestos/${quoteNumber}`,
        createdBy: "admin", // Would come from auth in a real app
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const quotesCollection = collection(firestore, collections.QUOTES);
      await addDoc(quotesCollection, quoteData);

      toast.success("Presupuesto creado exitosamente");
      router.push("/dashboard/banderas/presupuestos");
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

  const handleSelectClient = (client: TClient) => {
    setSelectedClient(client);
    setSearchTerm("");
  };

  const handleProductSelect = (product: TProduct, variant?: TProductVariant) => {
    setSelectedProduct(product);
    setSelectedVariant(variant || null);
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Crear nuevo presupuesto</h1>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/banderas/presupuestos")}
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
                          {/* <TableHead></TableHead> */}
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
                              {/* <TableHead>Categorías</TableHead> */}
                              {/* <TableHead>Medida</TableHead> */}
                              <TableHead className="text-right">Stock</TableHead>
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
                                    {/* <TableCell>
                                      {getCategoryNames(typedProduct.categories)}
                                    </TableCell> */}
                                    {/* <TableCell>
                                      {typedProduct.variants && typedProduct.variants.length > 0 ? (
                                        <Select
                                          value={selectedVariant?.size || ""}
                                          onValueChange={(value) => {
                                            const variant = typedProduct.variants.find(v => v.size === value);
                                            if (variant) {
                                              handleProductSelect(typedProduct, variant);
                                            }
                                          }}
                                        >
                                          <SelectTrigger className="w-[150px]">
                                            <SelectValue placeholder="Seleccionar medida" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {typedProduct.variants.map((variant) => (
                                              <SelectItem
                                                key={variant.id}
                                                value={variant.size}
                                              >
                                                {variant.size}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        "-"
                                      )}
                                    </TableCell> */}
                                    <TableCell className="text-right">
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
                                    </TableCell>
                                    {/* <TableCell className="text-right">
                                      {selectedVariant ? (
                                        <span>${Number(selectedVariant.price).toFixed(2)}</span>
                                      ) : (
                                        "-"
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {selectedVariant ? (
                                        <span>
                                          $
                                          {calculatePriceWithTax(
                                            Number(selectedVariant.price),
                                            Number(typedProduct.taxRate)
                                          ).toFixed(2)}
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
                                      ${Number(variant.price).toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="text-sm text-slate-500 mt-1">
                                    Stock: {variant.stock} unidades
                                  </div>
                                </div>
                              ))}
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
                        <Label htmlFor="notes">Notas del producto</Label>
                        <Textarea
                          id="notes"
                          value={itemNotes}
                          onChange={(e) => setItemNotes(e.target.value)}
                          placeholder="Añade notas específicas para este producto..."
                          rows={2}
                        />
                      </div>

                      <div className="bg-slate-50 p-4 rounded-md">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm">
                              Precio unitario: $
                              {selectedVariant
                                ? Number(selectedVariant.price).toFixed(2)
                                : Number(selectedProduct.price || 0).toFixed(2)}
                            </p>
                            {itemDiscount > 0 && (
                              <p className="text-sm">
                                Descuento: {itemDiscount}% ($
                                {(
                                  ((selectedVariant
                                    ? Number(selectedVariant.price)
                                    : Number(selectedProduct.price || 0)) *
                                    itemDiscount) /
                                  100
                                ).toFixed(2)}
                                )
                              </p>
                            )}
                            <p className="text-sm">Cantidad: {itemQuantity}</p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold">
                              Subtotal: $
                              {(
                                itemQuantity *
                                ((selectedVariant
                                  ? Number(selectedVariant.price)
                                  : Number(selectedProduct.price || 0)) -
                                  ((selectedVariant
                                    ? Number(selectedVariant.price)
                                    : Number(selectedProduct.price || 0)) *
                                    itemDiscount) /
                                    100)
                              ).toFixed(2)}
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
                  className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
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
              onClick={() => router.push("/dashboard/banderas/presupuestos")}
              disabled={loading}
              type="button"
              className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
            >
              Cancelar
            </Button>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={loading || !selectedClient}
                variant="default"
                className="bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
              >
                {loading ? "Guardando..." : "Guardar como borrador"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
} 