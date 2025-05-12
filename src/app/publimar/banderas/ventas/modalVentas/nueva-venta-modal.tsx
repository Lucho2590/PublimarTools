import { useState, useEffect } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Loader2,
  Search,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import collections from "~/lib/collections";
import { TProduct, TProductCategory, TProductVariant } from "~/types/product";
import { EPaymentMethod } from "~/types/sale";

const formatearPrecio = (valor: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(valor);
};

interface SaleItem {
  id: string;
  product: TProduct;
  variant: TProductVariant;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface NuevaVentaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function NuevaVentaModal({
  open,
  onOpenChange,
  onSuccess,
}: NuevaVentaModalProps) {
  const firestore = useFirestore();
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [items, setItems] = useState<SaleItem[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set()
  );
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<EPaymentMethod>(
    EPaymentMethod.CASH
  );
  const [bank, setBank] = useState<string>("");
  const [isInvoiced, setIsInvoiced] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const [applyIVA, setApplyIVA] = useState(true);
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [manualTotal, setManualTotal] = useState<number | null>(null);

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const taxRate = 21; // IVA
  const taxAmount = applyIVA ? subtotal * (taxRate / 100) : 0;
  const discountAmount = subtotal * (discountPercentage / 100);
  const calculatedTotal = subtotal + taxAmount - discountAmount;
  const total = manualTotal !== null ? manualTotal : calculatedTotal;

  const handleTotalChange = (value: string) => {
    const numericValue = parseFloat(value);
    if (!isNaN(numericValue)) {
      setManualTotal(numericValue);
    } else {
      setManualTotal(null);
    }
  };

  const limpiarFormulario = () => {
    setItems([]);
    setPaymentMethod(EPaymentMethod.CASH);
    setBank("");
    setIsInvoiced(false);
    setInvoiceNumber("");
    setSearchTerm("");
    setCurrentPage(1);
    setSelectedProducts(new Set());
    setSelectedQuantities({});
    setSelectedVariants({});
    setApplyIVA(true);
    setDiscountPercentage(0);
    setManualTotal(null);
  };

  // Obtener productos
  const productsCollection = collection(firestore, collections.PRODUCTS);
  const { status: productsStatus, data: products } = useFirestoreCollectionData(
    productsCollection,
    {
      idField: "id",
    }
  );

  // Obtener categorías
  const categoriesCollection = collection(firestore, collections.products.CATEGORIES);
  const { data: categories } = useFirestoreCollectionData(
    categoriesCollection,
    {
      idField: "id",
    }
  );

  // Filtrar productos según la búsqueda
  const filteredProducts = products?.reduce((unique: TProduct[], product) => {
    const typedProduct = product as unknown as TProduct;
    const exists = unique.find((p) => p.name === typedProduct.name);
    if (
      !exists &&
      typedProduct.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      unique.push(typedProduct);
    }
    return unique;
  }, []);

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

  // Calcular productos paginados
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts?.slice(startIndex, endIndex);
  const totalPages = Math.ceil((filteredProducts?.length || 0) / itemsPerPage);

  // Inicializar las variantes seleccionadas con la primera variante de cada producto
  useEffect(() => {
    if (products) {
      const initialVariants: Record<string, string> = {};
      products.forEach((product) => {
        const typedProduct = product as unknown as TProduct;
        if (typedProduct.variants?.[0]?.id) {
          initialVariants[typedProduct.id] = typedProduct.variants[0].id;
        }
      });
      setSelectedVariants(initialVariants);
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

  const handleQuantityChange = (productId: string, variantId: string, newQuantity: number) => {
    // Si el item ya está en la lista de items, actualizamos su cantidad
    const existingItem = items.find(
      (item) => item.product.id === productId && item.variant.id === variantId
    );

    if (existingItem) {
      if (newQuantity > Number(existingItem.variant.stock)) {
        toast.error("No hay suficiente stock disponible");
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === existingItem.id
            ? {
                ...item,
                quantity: newQuantity,
                total: newQuantity * item.unitPrice,
              }
            : item
        )
      );
    } else {
      // Si no está en la lista, actualizamos la cantidad temporal
      setSelectedQuantities(prev => ({
        ...prev,
        [`${productId}-${variantId}`]: newQuantity
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
          const quantity = selectedQuantities[`${typedProduct.id}-${selectedVariant.id}`] || 0;
          if (quantity > 0) {
            const newItem: SaleItem = {
              id: crypto.randomUUID(),
              product: typedProduct,
              variant: selectedVariant,
              quantity: quantity,
              unitPrice: Number(selectedVariant.price),
              total: Number(selectedVariant.price) * quantity,
            };
            setItems(prev => [...prev, newItem]);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const saleData = {
        number: new Date().getTime().toString(),
        items: items.map((item) => ({
          productId: item.product.id,
          variantId: item.variant.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
        subtotal,
        total,
        paymentMethod,
        bank: paymentMethod === EPaymentMethod.TRANSFER ? bank : null,
        isInvoiced,
        invoiceNumber: isInvoiced ? invoiceNumber : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Crear la venta
      const salesCollection = collection(firestore, collections.SALES);
      await addDoc(salesCollection, saleData);

      // Actualizar el stock de cada producto
      for (const item of items) {
        const productRef = doc(firestore, collections.PRODUCTS, item.product.id);
        await updateDoc(productRef, {
          variants: item.product.variants.map((v) =>
            v.id === item.variant.id
              ? { ...v, stock: Number(v.stock) - item.quantity }
              : v
          ),
        });
      }

      toast.success("Venta registrada con éxito");
      onSuccess?.();
      onOpenChange(false);
      // Limpiar el formulario
      limpiarFormulario();
    } catch (error) {
      console.error("Error al registrar la venta:", error);
      toast.error("Error al registrar la venta");
    } finally {
      setLoading(false);
    }
  };

  if (productsStatus === "loading") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[60vw] max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[60vw] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Nueva Venta</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="flex-1 overflow-auto">
            <div className="space-y-6 p-6">
              {/* Búsqueda de productos */}
              <Card className="flex flex-col">
                {/* <CardHeader>
                  <CardTitle>Agregar Productos</CardTitle>
                </CardHeader> */}
                <CardContent className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar productos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <Button
                      type="button"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleAddSelectedProducts}
                      variant="outline"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar Seleccionados
                    </Button>
                  </div>

                  <div className="border rounded-lg">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-center p-4 font-medium w-10"></th>
                          <th className="text-left p-4 font-medium">
                            Producto
                          </th>
                          <th className="text-left p-4 font-medium">Medida</th>
                          <th className="text-left p-4 font-medium">Categoria</th>
                          <th className="text-left p-4 font-medium">Valor</th>
                          <th className="text-left p-4 font-medium">
                            Cantidad
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedProducts?.map((product) => {
                          const typedProduct = product as unknown as TProduct;
                          const selectedVariant = typedProduct.variants?.find(
                            (v) => v.id === selectedVariants[typedProduct.id]
                          );

                          // Verificar si hay al menos una variante con stock
                          const hasAvailableStock = typedProduct.variants?.some(
                            (v) => Number(v.stock) > 0
                          );

                          return (
                            <tr
                              key={typedProduct.id}
                              className="border-b hover:bg-muted/50 transition-colors"
                            >
                              <td className="p-4 text-center">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-gray-300"
                                  onChange={(e) => {
                                    const newSelected = new Set(
                                      selectedProducts
                                    );
                                    if (e.target.checked) {
                                      newSelected.add(typedProduct.id);
                                    } else {
                                      newSelected.delete(typedProduct.id);
                                    }
                                    setSelectedProducts(newSelected);
                                  }}
                                  checked={selectedProducts.has(
                                    typedProduct.id
                                  )}
                                  disabled={!hasAvailableStock}
                                />
                              </td>
                              <td className="p-4 font-medium">
                                {typedProduct.name}
                              </td>
                              <td className="p-4">
                                <Select
                                  onValueChange={(variantId) => {
                                    handleVariantChange(
                                      typedProduct.id,
                                      variantId
                                    );
                                  }}
                                  value={selectedVariants[typedProduct.id]}
                                >
                                  <SelectTrigger className="w-[120px]">
                                    <SelectValue placeholder="Medida" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {typedProduct.variants?.map((variant) => (
                                      <SelectItem
                                        key={variant.id}
                                        value={variant.id}
                                        disabled={Number(variant.stock) === 0}
                                      >
                                        {variant.size}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="p-4">
                              {getCategoryNames(typedProduct.categories)}
                              </td>
                              <td className="p-4">
                                {selectedVariant
                                  ? formatearPrecio(Number(selectedVariant.price))
                                  : "-"}
                              </td>
                              <td className="p-4">
                                <Input
                                  type="number"
                                  min="0"
                                  max={selectedVariant ? Number(selectedVariant.stock) : 0}
                                  value={(() => {
                                    const existingItem = items.find(
                                      (item) =>
                                        item.product.id === typedProduct.id &&
                                        item.variant?.id === selectedVariant?.id
                                    );
                                    if (existingItem) {
                                      return existingItem.quantity;
                                    }
                                    return selectedQuantities[`${typedProduct.id}-${selectedVariant?.id}`] || 0;
                                  })()}
                                  onChange={(e) => {
                                    if (!selectedProducts.has(typedProduct.id)) return;
                                    
                                    const newValue = parseInt(e.target.value);
                                    if (!selectedVariant) return;
                                    
                                    if (newValue >= 0 && newValue <= Number(selectedVariant.stock)) {
                                      handleQuantityChange(typedProduct.id, selectedVariant.id, newValue);
                                    }
                                  }}
                                  disabled={!selectedProducts.has(typedProduct.id)}
                                  className="w-20"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                  </div>
                </CardContent>
                <div className="flex justify-end px-6">
                <Button
                      type="button"
                      className="bg-green-600 hover:bg-green-700 text-white max-w-55 "
                      onClick={handleAddSelectedProducts}
                      variant="outline"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar Seleccionados
                    </Button>
                </div>
                {/* Paginación */}
                <div className="mt-auto border-t p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-muted-foreground">
                        Mostrando {startIndex + 1}-
                        {Math.min(endIndex, filteredProducts?.length || 0)} de{" "}
                        {filteredProducts?.length} productos
                      </div>
                      <Select
                        value={itemsPerPage.toString()}
                        onValueChange={(value) => {
                          setItemsPerPage(Number(value));
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger className="w-[100px]">
                          <SelectValue placeholder="Por página" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Página {currentPage} de {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Productos seleccionados */}
              {items.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Productos Seleccionados</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between"
                        >
                          <div>
                            <p className="font-medium">{item.product.name}</p>
                            <p className="text-sm text-gray-500">
                              {item.variant.size} | {formatearPrecio(item.unitPrice)} c/u
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
                            <p className="w-24 text-right">{formatearPrecio(item.total)}</p>
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
                      ))}
                      <div className="border-t pt-4">
                        <div className="flex justify-between items-center">
                          <p className="font-semibold">Subtotal</p>
                          <p className="font-semibold">{formatearPrecio(subtotal)}</p>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="applyIVA"
                              checked={applyIVA}
                              onCheckedChange={(checked) => setApplyIVA(checked as boolean)}
                              className="data-[state=checked]:bg-blue-900 data-[state=checked]:border-blue-900"
                            />
                            <Label htmlFor="applyIVA">IVA ({taxRate}%)</Label>
                          </div>
                          <p>{formatearPrecio(taxAmount)}</p>
                        </div>

                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <div className="flex items-center gap-2">
                            <Label htmlFor="discount">Descuento (%)</Label>
                            <Input
                              id="discount"
                              type="number"
                              min="0"
                              max="100"
                              value={discountPercentage}
                              onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                              className="w-20 h-8"
                            />
                          </div>
                          <p className="text-red-500">-{formatearPrecio(discountAmount)}</p>
                        </div>

                        <div className="flex justify-between items-center font-semibold text-lg mt-2">
                          <p>Total</p>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={total}
                              onChange={(e) => handleTotalChange(e.target.value)}
                              className="w-32 text-right font-semibold"
                            />
                            {manualTotal !== null && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setManualTotal(null)}
                                className="h-8 px-2"
                              >
                                <span className="text-xs">Reset</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Detalles de pago */}
              <Card>
                <CardHeader>
                  <CardTitle>Detalles de Pago</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="paymentMethod">Método de Pago</Label>
                        <Select
                          value={paymentMethod}
                          onValueChange={(value) =>
                            setPaymentMethod(value as EPaymentMethod)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar método de pago" />
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
                          </SelectContent>
                        </Select>
                      </div>

                      {paymentMethod === EPaymentMethod.TRANSFER && (
                        <div className="space-y-2">
                          <Label htmlFor="bank">Banco</Label>
                          <Select
                            value={bank}
                            onValueChange={setBank}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar banco" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Galicia">Galicia</SelectItem>
                              <SelectItem value="Frances">Frances</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="isInvoiced"
                        checked={isInvoiced}
                        onCheckedChange={setIsInvoiced}
                      />
                      <Label htmlFor="isInvoiced">Facturar</Label>
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
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="border-t p-4 mt-auto">
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  limpiarFormulario();
                  onOpenChange(false);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading || items.length === 0}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Registrar Venta
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
