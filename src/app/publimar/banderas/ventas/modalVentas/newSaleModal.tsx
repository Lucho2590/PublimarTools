import { useState, useEffect } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Search,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import collections from "@/lib/collections";
import { TProduct, TProductCategory, TProductVariant } from "@/types/product";
import { EPaymentMethod } from "@/types/sale";
import { formatearPrecio, redondearADecena, redondearTotal } from "@/lib/utils";

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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStock, setSelectedStock] = useState<string>("all");
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
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const [applyIVA, setApplyIVA] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [manualTotal, setManualTotal] = useState<number | null>(null);
  const [manualDiscount, setManualDiscount] = useState<number>(0);

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const taxRate = 21; // IVA
  
  // Calcular IVA desde precio final cuando aplica
  let taxAmount = 0;
  let subtotalSinIVA = subtotal;
  
  if (applyIVA) {
    // Si aplicamos IVA, los precios son finales (con IVA incluido)
    // Calculamos el IVA que está incluido en el precio
    taxAmount = redondearTotal(subtotal * (taxRate / (100 + taxRate)));
    subtotalSinIVA = redondearTotal(subtotal - taxAmount);
  }
  
  const discountAmount = redondearTotal(subtotalSinIVA * (discountPercentage / 100));
  const calculatedTotal = redondearTotal(subtotal - discountAmount - manualDiscount);
  const total = manualTotal !== null ? manualTotal : calculatedTotal;

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
    setPaymentMethod(EPaymentMethod.CASH);
    setBank("");
    setIsInvoiced(false);
    setInvoiceNumber("");
    setSearchTerm("");
    setSelectedCategory("all");
    setSelectedStock("all");
    setCurrentPage(1);
    setSelectedProducts(new Set());
    setSelectedQuantities({});
    setSelectedVariants({});
    setApplyIVA(true);
    setDiscountPercentage(0);
    setManualTotal(null);
    setManualDiscount(0);
  };

  const handleModalClose = (open: boolean) => {
    if (!open) {
      limpiarFormulario();
    }
    onOpenChange(open);
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

  // Filtrar productos con filtro súper combinado
  const filteredProducts = products?.reduce((unique: TProduct[], product) => {
    const typedProduct = product as unknown as TProduct;
    const exists = unique.find((p) => p.name === typedProduct.name);
    if (exists) return unique;

    // Filtro de búsqueda combinada
    if (searchTerm.trim()) {
      // Separar términos por comas o espacios
      const terminos = searchTerm
        .toLowerCase()
        .split(/[,\s]+/)
        .filter(term => term.trim().length > 0);
      
      // Crear texto combinado de TODOS los campos
      const textoCompleto = [
        // Datos del producto
        typedProduct.name,
        typedProduct.sku,
        
        // Datos de variantes  
        ...(typedProduct.variants?.map(v => [
          v.size,
          v.sku,
          v.price?.toString(),
          v.stock?.toString()
        ]).flat() || []),
        
        // Nombres de categorías
        typedProduct.categories?.map((id) => {
          const category = categories?.find(
            (c) => (c as unknown as TProductCategory).id === id
          );
          return category ? (category as unknown as TProductCategory).name : "";
        }).filter(Boolean).join(", ") || "",
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      
      // Verificar que TODOS los términos estén presentes
      const matchesSearch = terminos.every(termino => textoCompleto.includes(termino));
      if (!matchesSearch) return unique;
    }
    
    // Filtro por categoría
    const matchesCategory = selectedCategory === "all" || 
      (typedProduct.categories && typedProduct.categories.includes(selectedCategory));
    
    // Filtro por stock
    let matchesStock = true;
    if (selectedStock !== "all") {
      const hasStock = typedProduct.variants?.some(v => Number(v.stock) > 0);
      if (selectedStock === "con_stock") {
        matchesStock = hasStock || false;
      } else if (selectedStock === "sin_stock") {
        matchesStock = !hasStock;
      } else if (selectedStock === "poco_stock") {
        matchesStock = typedProduct.variants?.some(v => Number(v.stock) <= 5 && Number(v.stock) > 0) || false;
      }
    }
    
    if (matchesCategory && matchesStock) {
      unique.push(typedProduct);
    }
    
    return unique;
  }, []);



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
          unitPrice: redondearTotal(item.unitPrice), // Precio final unitario
          total: redondearTotal(item.total), // Total final del item
        })),
        subtotal: redondearTotal(applyIVA ? subtotalSinIVA : subtotal), // Subtotal sin IVA si aplica
        total: redondearTotal(total),
        // Información de IVA
        applyIVA,
        taxRate,
        taxAmount: redondearTotal(taxAmount), // IVA calculado desde precio final
        // Información de descuentos
        discountPercentage,
        discountAmount: redondearTotal(discountAmount),
        manualDiscount: redondearTotal(manualDiscount),
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
      <Dialog open={open} onOpenChange={handleModalClose}>
        <DialogContent className="max-w-[60vw] max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleModalClose}>
      <DialogContent className=" max-h-[90vh] flex flex-col overflow-hidden max-w-4xl">
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
                  {/* Filtros combinados */}
                  <div className="space-y-3 pt-6">
                    <div className="relative ">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por TODO: nombre, categoría, medida, SKU, precio..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Categoría:</label>
                        <Select
                          value={selectedCategory}
                          onValueChange={setSelectedCategory}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Todas" />
                          </SelectTrigger>
                          <SelectContent className="max-h-48 overflow-y-auto">
                            <SelectItem value="all">Todas</SelectItem>
                            {categories?.map((category) => {
                              const typedCategory = category as unknown as TProductCategory;
                              return (
                                <SelectItem key={typedCategory.id} value={typedCategory.id}>
                                  {typedCategory.name}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Stock:</label>
                        <Select
                          value={selectedStock}
                          onValueChange={setSelectedStock}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Todos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="con_stock">Con Stock</SelectItem>
                            <SelectItem value="poco_stock">Poco Stock</SelectItem>
                            <SelectItem value="sin_stock">Sin Stock</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {(searchTerm || selectedCategory !== "all" || selectedStock !== "all") && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSearchTerm('');
                            setSelectedCategory("all");
                            setSelectedStock("all");
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Limpiar
                        </Button>
                      )}
                      
                      <div className="ml-auto">
                        <Button
                          type="button"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={handleAddSelectedProducts}
                          size="sm"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Agregar ({selectedProducts.size})
                        </Button>
                      </div>
                    </div>
                    
                    {/* Contador de resultados */}
                    <div className="text-sm text-muted-foreground">
                      {filteredProducts?.length === products?.length 
                        ? `${products?.length || 0} productos disponibles`
                        : `${filteredProducts?.length || 0} de ${products?.length || 0} productos`
                      }
                    </div>
                  </div>

                  {/* Vista compacta de productos */}
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {paginatedProducts?.map((product) => {
                      const typedProduct = product as unknown as TProduct;
                      const selectedVariant = typedProduct.variants?.find(
                        (v) => v.id === selectedVariants[typedProduct.id]
                      );

                      // Verificar si hay al menos una variante con stock
                      const hasAvailableStock = typedProduct.variants?.some(
                        (v) => Number(v.stock) > 0
                      );
                      
                      const stockColor = selectedVariant 
                        ? Number(selectedVariant.stock) === 0 
                          ? "text-red-500"
                          : Number(selectedVariant.stock) <= 5 
                          ? "text-orange-500" 
                          : "text-green-600"
                        : "text-gray-400";

                      return (
                        <div
                          key={typedProduct.id}
                          className={`border rounded-lg p-3 transition-all ${
                            selectedProducts.has(typedProduct.id) 
                              ? "bg-blue-50 border-blue-200" 
                              : "hover:bg-gray-50"
                          } ${!hasAvailableStock ? "opacity-60" : ""}`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300"
                              onChange={(e) => {
                                const newSelected = new Set(selectedProducts);
                                if (e.target.checked) {
                                  newSelected.add(typedProduct.id);
                                } else {
                                  newSelected.delete(typedProduct.id);
                                }
                                setSelectedProducts(newSelected);
                              }}
                              checked={selectedProducts.has(typedProduct.id)}
                              disabled={!hasAvailableStock}
                            />
                            
                            {/* Producto info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-sm truncate">{typedProduct.name}</h4>
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                  {typedProduct.categories?.map((id) => {
                                    const category = categories?.find(
                                      (c) => (c as unknown as TProductCategory).id === id
                                    );
                                    return category ? (category as unknown as TProductCategory).name : "";
                                  }).filter(Boolean).join(", ") || "-"}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600">
                                Stock: <span className={stockColor}>{selectedVariant?.stock || 0}</span>
                                {selectedVariant && " • " + formatearPrecio(Number(selectedVariant.price))}
                              </p>
                            </div>
                            
                            {/* Medida selector */}
                            <div className="w-28">
                              <Select
                                onValueChange={(variantId) => {
                                  handleVariantChange(typedProduct.id, variantId);
                                }}
                                value={selectedVariants[typedProduct.id]}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Medida" />
                                </SelectTrigger>
                                <SelectContent>
                                  {typedProduct.variants?.map((variant) => (
                                    <SelectItem
                                      key={variant.id}
                                      value={variant.id}
                                      disabled={Number(variant.stock) === 0}
                                    >
                                      <div className="flex items-center justify-between w-full">
                                        <span>{variant.size}</span>
                                        <span className={`text-xs ml-2 ${
                                          Number(variant.stock) === 0 
                                            ? "text-red-500" 
                                            : Number(variant.stock) <= 5 
                                            ? "text-orange-500" 
                                            : "text-green-600"
                                        }`}>
                                          ({variant.stock})
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
                                className="h-8 text-xs text-center"
                                placeholder="0"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {paginatedProducts?.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <p>No se encontraron productos</p>
                        <p className="text-sm">Intenta ajustar los filtros de búsqueda</p>
                      </div>
                    )}
                  </div>
                </CardContent>
                {/* Paginación compacta */}
                {totalPages > 1 && (
                  <div className="border-t px-6 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">
                        {startIndex + 1}-{Math.min(endIndex, filteredProducts?.length || 0)} de {filteredProducts?.length}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
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
                  </div>
                )}
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
                                Desglosar IVA ({taxRate}%)
                              </Label>
                            </div>
                            <p className="text-sm text-gray-600">
                              {applyIVA ? `${formatearPrecio(taxAmount)}` : '$ 0,00'}
                            </p>
                          </div>

                          {applyIVA && (
                            <div className="flex justify-between items-center text-sm pl-6">
                              <p className="text-gray-600">Subtotal sin IVA</p>
                              <p className="font-medium">{formatearPrecio(subtotalSinIVA)}</p>
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
                            <p className="text-red-600">-{formatearPrecio(discountAmount)}</p>
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
                            <p className="text-red-600">-{formatearPrecio(manualDiscount)}</p>
                          </div>

                          <div className="border-t pt-3">
                            <div className="flex justify-between items-center">
                              <p className="text-lg font-semibold">Total</p>
                              <p className="text-xl font-bold">{formatearPrecio(redondearADecena(total))}</p>
                            </div>
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

                    {/* <div className="flex items-center space-x-2">
                      <Switch
                        id="isInvoiced"
                        checked={isInvoiced}
                        onCheckedChange={setIsInvoiced}
                      />
                      <Label htmlFor="isInvoiced">Facturar</Label>
                    </div> */}

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
