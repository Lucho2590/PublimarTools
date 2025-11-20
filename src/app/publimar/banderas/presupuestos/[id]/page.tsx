'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "reactfire";
import { useQuotes, useQuoteById } from "@/hooks/useQuotes";
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
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Save,
  Trash2,
  Plus,
  Edit,
  FileText,
  Search,
} from "lucide-react";
import { formatearPrecio, formatDate, redondearTotal } from "@/lib/utils";
import { toast } from "sonner";
import { EQuoteStatus, TQuote } from "@/types/quote";
import { Skeleton } from "@/components/ui/skeleton";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection } from "firebase/firestore";
import collections from "@/lib/collections";
import { TProduct, TProductVariant } from "@/types/product";
import { Checkbox } from "@/components/ui/checkbox";

export default function QuoteDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { data: user } = useUser();
  const firestore = useFirestore();

  // Hooks
  const { updateQuote, changeQuoteStatus, deleteQuote } = useQuotes();
  const {
    quote,
    loading: quoteLoading,
    error: quoteError,
  } = useQuoteById(params.id);

  // Productos
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { data: products } = useFirestoreCollectionData(productsCollection, {
    idField: "id",
  });

  // Estados de edición
  const [editedQuote, setEditedQuote] = useState<TQuote | null>(null);
  const [saving, setSaving] = useState(false);

  // Estados para items
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<TProduct | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<TProductVariant | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemDiscount, setItemDiscount] = useState(0);
  const [customUnitPrice, setCustomUnitPrice] = useState<number | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState("");

  // Estados para item manual
  const [showManualItemDialog, setShowManualItemDialog] = useState(false);
  const [manualItemName, setManualItemName] = useState("");
  const [manualItemMeasure, setManualItemMeasure] = useState("");
  const [manualItemDescription, setManualItemDescription] = useState("");
  const [manualItemQuantity, setManualItemQuantity] = useState(1);
  const [manualItemPrice, setManualItemPrice] = useState(0);

  // Estados para totales
  const [applyIVA, setApplyIVA] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [manualDiscount, setManualDiscount] = useState(0);

  // Sincronizar editedQuote cuando llega el presupuesto
  useEffect(() => {
    if (quote) {
      setEditedQuote(quote);
      // Cargar estados de totales si existen
      if (quote.applyIVA !== undefined) setApplyIVA(quote.applyIVA);
      if (quote.discountPercentage !== undefined) setDiscountPercentage(quote.discountPercentage);
      if (quote.manualDiscount !== undefined) setManualDiscount(quote.manualDiscount);
    }
  }, [quote]);

  // Calcular totales automáticamente
  const calculateTotals = () => {
    if (!editedQuote) return { subtotal: 0, taxAmount: 0, total: 0, subtotalSinIVA: 0 };

    const subtotal = editedQuote.items.reduce((sum: number, item: any) => sum + (item.subtotal || 0), 0);

    let taxAmount = 0;
    let subtotalSinIVA = subtotal;

    if (applyIVA) {
      const taxRate = parseFloat(editedQuote.taxRate?.toString() || "21");
      taxAmount = subtotal * (taxRate / (100 + taxRate));
      subtotalSinIVA = subtotal - taxAmount;
    }

    const generalDiscountAmount = subtotalSinIVA * (discountPercentage / 100);
    const totalDiscountAmount = generalDiscountAmount + manualDiscount;
    const total = subtotal - totalDiscountAmount;

    return { subtotal, taxAmount, total, subtotalSinIVA };
  };

  const totals = calculateTotals();

  // Manejar guardado
  const handleSave = async () => {
    if (!editedQuote) return;

    setSaving(true);
    try {
      const updatedQuote = {
        ...editedQuote,
        subtotal: redondearTotal(applyIVA ? totals.subtotalSinIVA : totals.subtotal),
        taxAmount: redondearTotal(totals.taxAmount),
        total: redondearTotal(totals.total),
        applyIVA,
        discountPercentage,
        manualDiscount,
      };
      await updateQuote(params.id, updatedQuote);
      toast.success("Presupuesto actualizado correctamente");
    } catch (error) {
      console.error("Error al guardar:", error);
      toast.error("Error al guardar el presupuesto");
    } finally {
      setSaving(false);
    }
  };

  // Manejar cambio de estado
  const handleStatusChange = async (newStatus: EQuoteStatus) => {
    try {
      await changeQuoteStatus(params.id, newStatus);
      toast.success("Estado actualizado correctamente");
    } catch (error) {
      console.error("Error al cambiar estado:", error);
      toast.error("Error al cambiar el estado");
    }
  };

  // Funciones para manejar items
  const handleProductSelect = (product: TProduct, variant?: TProductVariant) => {
    setSelectedProduct(product);
    setSelectedVariant(variant || null);
    const initialPrice = variant ? Number(variant.price) : Number(product.price || 0);
    setCustomUnitPrice(initialPrice);
  };

  const handleVariantSelect = (variant: TProductVariant) => {
    setSelectedVariant(variant);
    setCustomUnitPrice(Number(variant.price));
  };

  const addItemToQuote = () => {
    if (!selectedProduct || !editedQuote) return;

    const price = customUnitPrice !== null
      ? customUnitPrice
      : Number(selectedVariant ? selectedVariant.price : selectedProduct.price || 0);

    const discountAmount = (price * itemDiscount) / 100;
    const priceAfterDiscount = price - discountAmount;
    const subtotal = priceAfterDiscount * itemQuantity;

    const newItem: any = {
      id: editingItemId || crypto.randomUUID(),
      product: {
        id: selectedProduct.id,
        name: selectedProduct.name,
        description: selectedProduct.description || "",
        categories: selectedProduct.categories || [],
        imageUrls: selectedProduct.imageUrls || [],
        hasVariants: selectedProduct.hasVariants || false,
        price: selectedProduct.price || 0,
      },
      variant: selectedVariant
        ? {
            id: selectedVariant.id,
            size: selectedVariant.size,
            price: selectedVariant.price,
          }
        : null,
      quantity: itemQuantity,
      unitPrice: price,
      discount: itemDiscount,
      subtotal: subtotal,
      productName: selectedProduct.name,
      variantName: selectedVariant?.size || "",
      description: selectedProduct.description || "",
    };

    if (editingItemId) {
      setEditedQuote({
        ...editedQuote,
        items: editedQuote.items.map((item: any) =>
          item.id === editingItemId ? newItem : item
        ),
      });
    } else {
      setEditedQuote({
        ...editedQuote,
        items: [...editedQuote.items, newItem],
      });
    }

    // Reset
    setSelectedProduct(null);
    setSelectedVariant(null);
    setItemQuantity(1);
    setItemDiscount(0);
    setCustomUnitPrice(null);
    setProductSearchTerm("");
    setEditingItemId(null);
    setIsAddingProduct(false);
  };

  const startEditItem = (item: any) => {
    setSelectedProduct(item.product);
    setSelectedVariant(item.variant || null);
    setItemQuantity(item.quantity);
    setItemDiscount(item.discount || 0);
    setCustomUnitPrice(item.unitPrice);
    setEditingItemId(item.id);
    setIsAddingProduct(true);
  };

  const removeItem = (itemId: string) => {
    if (!editedQuote) return;
    setEditedQuote({
      ...editedQuote,
      items: editedQuote.items.filter((item: any) => item.id !== itemId),
    });
  };

  // Manejar item manual
  const handleAddManualItem = () => {
    if (!manualItemName || !manualItemQuantity || !manualItemPrice || !editedQuote) {
      toast.error("Nombre, cantidad y precio son requeridos");
      return;
    }

    const itemSubtotal = manualItemQuantity * manualItemPrice;

    const newItem: any = {
      id: crypto.randomUUID(),
      product: {
        id: `manual-${Date.now()}`,
        name: manualItemName,
        description: manualItemDescription,
      },
      variant: {
        id: `manual-variant-${Date.now()}`,
        size: manualItemMeasure || "Sin medida",
        price: manualItemPrice,
      },
      quantity: manualItemQuantity,
      unitPrice: manualItemPrice,
      discount: 0,
      subtotal: itemSubtotal,
      productName: manualItemName,
      variantName: manualItemMeasure || "Sin medida",
      description: manualItemDescription,
      isManual: true,
    };

    setEditedQuote({
      ...editedQuote,
      items: [...editedQuote.items, newItem],
    });

    // Reset
    setManualItemName("");
    setManualItemMeasure("");
    setManualItemDescription("");
    setManualItemQuantity(1);
    setManualItemPrice(0);
    setShowManualItemDialog(false);
    toast.success("Item manual agregado");
  };

  // Loading state
  if (quoteLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (quoteError || !quote) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <p className="text-lg text-gray-600">
          No se pudo cargar el presupuesto
        </p>
        <Button onClick={() => router.push("/publimar/banderas/presupuestos")}>
          Volver a presupuestos
        </Button>
      </div>
    );
  }

  if (!editedQuote) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/publimar/banderas/presupuestos")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              Presupuesto {editedQuote.number}
            </h1>
            <p className="text-sm text-gray-500">
              Creado el {formatDate(editedQuote.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/publimar/banderas/presupuestos")}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-900 hover:bg-blue-700 text-white"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>

      {/* Card Cliente */}
      <Card>
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-gray-600">Nombre</Label>
              <p className="font-medium">{editedQuote.client.name}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Email</Label>
              <p className="font-medium">{editedQuote.client.email || "-"}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Teléfono</Label>
              <p className="font-medium">{editedQuote.client.phone || "-"}</p>
            </div>
            <div>
              <Label className="text-sm text-gray-600">Dirección</Label>
              <p className="font-medium">{editedQuote.client.address || "-"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Detalles */}
      <Card>
        <CardHeader>
          <CardTitle>Detalles del Presupuesto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="validUntil">Válido hasta</Label>
              <Input
                id="validUntil"
                type="date"
                value={
                  editedQuote.validUntil
                    ? (() => {
                        try {
                          // Manejar Timestamp de Firebase o Date normal
                          const date =
                            typeof editedQuote.validUntil === "object" &&
                            "toDate" in editedQuote.validUntil
                              ? editedQuote.validUntil.toDate()
                              : new Date(editedQuote.validUntil);
                          return date.toISOString().split("T")[0];
                        } catch {
                          return "";
                        }
                      })()
                    : ""
                }
                onChange={(e) =>
                  setEditedQuote({
                    ...editedQuote,
                    validUntil: new Date(e.target.value) as any,
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={editedQuote.notes || ""}
              onChange={(e) =>
                setEditedQuote({ ...editedQuote, notes: e.target.value })
              }
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Card Items - Tabla de productos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Items del Presupuesto</CardTitle>
          <div className="flex gap-2">
            {/* Dialog Item Manual */}
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
                      <Input
                        id="manualPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={manualItemPrice}
                        onChange={(e) => setManualItemPrice(Number(e.target.value))}
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
                  <Button type="button" variant="outline" onClick={() => setShowManualItemDialog(false)}>
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

            {/* Dialog Agregar Producto */}
            <Dialog open={isAddingProduct} onOpenChange={setIsAddingProduct}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-blue-900 hover:bg-blue-700 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" /> Agregar producto
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingItemId ? "Editar item" : "Agregar producto"}
                  </DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  {!selectedProduct ? (
                    <div className="space-y-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                        <Input
                          placeholder="Buscar producto..."
                          value={productSearchTerm}
                          onChange={(e) => setProductSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <div className="max-h-96 overflow-y-auto border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nombre</TableHead>
                              <TableHead>Acción</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {products
                              ?.filter((p: any) =>
                                p.name?.toLowerCase().includes(productSearchTerm.toLowerCase())
                              )
                              .map((product: any) => {
                                const typedProduct = product as TProduct;
                                const selectedVariant = typedProduct.variants?.[0];
                                return (
                                  <TableRow key={product.id}>
                                    <TableCell>{product.name}</TableCell>
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
                              })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold">{selectedProduct.name}</h3>
                        <p className="text-sm text-gray-500">{selectedProduct.description}</p>
                      </div>

                      {selectedProduct.hasVariants && (
                        <div className="space-y-2">
                          <Label>Selecciona una variante</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {products
                              ?.find((p: any) => p.id === selectedProduct.id)
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
                                    <span className="font-medium">{variant.size}</span>
                                    <span className="text-slate-700">{formatearPrecio(Number(variant.price))}</span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="quantity">Cantidad</Label>
                          <Input
                            id="quantity"
                            type="number"
                            min="1"
                            value={itemQuantity}
                            onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="customPrice">Precio Unitario</Label>
                          <Input
                            id="customPrice"
                            type="number"
                            min="0"
                            step="0.01"
                            value={customUnitPrice || 0}
                            onChange={(e) => setCustomUnitPrice(parseFloat(e.target.value) || 0)}
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
                            onChange={(e) => setItemDiscount(parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-md">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm">Precio unitario: {formatearPrecio(customUnitPrice || 0)}</p>
                            {itemDiscount > 0 && (
                              <p className="text-sm">
                                Descuento: {itemDiscount}% ({formatearPrecio(((customUnitPrice || 0) * itemDiscount) / 100)})
                              </p>
                            )}
                            <p className="text-sm">Cantidad: {itemQuantity}</p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold">
                              Subtotal: {formatearPrecio(itemQuantity * ((customUnitPrice || 0) - ((customUnitPrice || 0) * itemDiscount) / 100))}
                            </p>
                            <p className="text-sm text-slate-400 text-right">+ IVA</p>
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
                    disabled={!selectedProduct || (selectedProduct.hasVariants && !selectedVariant)}
                  >
                    {editingItemId ? "Actualizar" : "Agregar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {editedQuote.items && editedQuote.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Precio Unit.</TableHead>
                  <TableHead>Desc.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editedQuote.items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.productName || item.product?.name}</p>
                        {item.variantName && (
                          <p className="text-sm text-gray-500">
                            {item.variantName}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{formatearPrecio(item.unitPrice)}</TableCell>
                    <TableCell>
                      {item.discount ? `${item.discount}%` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatearPrecio(item.subtotal)}
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditItem(item)}
                          title="Editar"
                          className="bg-blue-900 hover:bg-blue-700 text-white"
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
          ) : (
            <p className="text-center text-gray-500 py-8">
              No hay items en este presupuesto
            </p>
          )}
        </CardContent>
      </Card>

      {/* Card Totales */}
      <Card>
        <CardHeader>
          <CardTitle>Totales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border-t pt-4">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-gray-700">Subtotal</p>
                <p className="font-semibold">{formatearPrecio(totals.subtotal)}</p>
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
                    Desglosar IVA ({editedQuote.taxRate}%)
                  </Label>
                </div>
                <p className="text-sm text-gray-600">
                  {applyIVA ? `${formatearPrecio(redondearTotal(totals.taxAmount))}` : "$ 0,00"}
                </p>
              </div>

              {applyIVA && (
                <div className="flex justify-between items-center text-sm pl-6">
                  <p className="text-gray-600">Subtotal sin IVA</p>
                  <p className="font-medium">{formatearPrecio(redondearTotal(totals.subtotalSinIVA))}</p>
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
                <p className="text-red-600">
                  -{formatearPrecio(redondearTotal((totals.subtotalSinIVA * discountPercentage) / 100 + manualDiscount))}
                </p>
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
                <p className="text-red-600">
                  -{formatearPrecio(redondearTotal(manualDiscount))}
                </p>
              </div>

              <div className="border-t pt-3">
                <div className="flex justify-between items-center">
                  <p className="text-lg font-semibold">Total</p>
                  <p className="text-xl font-bold">{formatearPrecio(redondearTotal(totals.total))}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Estado */}
      <Card>
        <CardHeader>
          <CardTitle>Estado del Presupuesto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="status">Estado</Label>
            <Select
              value={editedQuote.status}
              onValueChange={(value: EQuoteStatus) => handleStatusChange(value)}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EQuoteStatus.DRAFT}>Borrador</SelectItem>
                <SelectItem value={EQuoteStatus.SENT}>Enviado</SelectItem>
                <SelectItem value={EQuoteStatus.CONFIRMED}>Confirmado</SelectItem>
                <SelectItem value={EQuoteStatus.REJECTED}>Rechazado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
