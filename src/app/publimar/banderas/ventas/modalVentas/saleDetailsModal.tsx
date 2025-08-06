"use client";
import { useFirestore, useFirestoreDocData } from "reactfire";
import { doc, updateDoc, collection, getDocs } from "firebase/firestore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TSale, TSaleItem, EPaymentMethod } from "@/types/sale";
import collections from "@/lib/collections";
import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TProduct, TProductCategory } from "@/types/product";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatearPrecio, redondearTotal, redondearADecena } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit, Save, X, Search, Filter, Trash2 } from "lucide-react";

const BANCOS = ["Galicia", "Frances"];

interface SaleDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
  onSuccess: () => void;
}

export function SaleDetailsModal({
  open,
  onOpenChange,
  saleId,
  onSuccess,
}: SaleDetailsModalProps) {
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [products, setProducts] = useState<Record<string, TProduct>>({});
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [items, setItems] = useState<TSaleItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<EPaymentMethod | null>(
    null
  );
  const [isInvoiced, setIsInvoiced] = useState<boolean | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [total, setTotal] = useState(0);
  const [subtotal, setSubtotal] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [subtotalSinIVA, setSubtotalSinIVA] = useState(0);
  const [applyIVA, setApplyIVA] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [manualDiscount, setManualDiscount] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [categories, setCategories] = useState<
    Record<string, TProductCategory>
  >({});

  const saleRef = saleId ? doc(firestore, collections.SALES, saleId) : null;
  const { data: sale } = useFirestoreDocData(
    saleRef ?? doc(firestore, collections.SALES, "dummy"),
    {
      idField: "id",
    }
  );

  const typedSale = sale as unknown as TSale;

  useEffect(() => {
    if (open) {
      loadProducts();
      loadCategories();
      if (typedSale?.items) {
        setItems(typedSale.items);
        
        // Inicializar valores desde la venta guardada
        setApplyIVA(typedSale.applyIVA || false);
        setDiscountPercentage(typedSale.discountPercentage || 0);
        setManualDiscount(typedSale.manualDiscount || 0);
        
        // Calcular totales usando la misma lógica que newSaleModal
        calculateTotals(typedSale.items, typedSale.applyIVA || false, typedSale.discountPercentage || 0, typedSale.manualDiscount || 0);
      }
      if (typedSale?.paymentMethod) {
        setPaymentMethod(typedSale.paymentMethod);
      }
      if (typedSale?.isInvoiced !== undefined) {
        setIsInvoiced(typedSale.isInvoiced);
      }
      if (typedSale?.invoiceNumber) {
        setInvoiceNumber(typedSale.invoiceNumber);
      }
      if (typedSale?.bank) {
        setSelectedBank(typedSale.bank);
      }
    }
  }, [open, typedSale]);

  const loadProducts = async () => {
    try {
      const productsCollection = collection(firestore, collections.PRODUCTS);
      const productsSnapshot = await getDocs(productsCollection);
      const productsMap: Record<string, TProduct> = {};
      productsSnapshot.forEach((doc) => {
        const product = doc.data() as TProduct;
        productsMap[doc.id] = product;
      });
      setProducts(productsMap);
    } catch (error) {
      console.error("Error al cargar productos:", error);
    }
  };

  const loadCategories = async () => {
    try {
      const categoriesCollection = collection(
        firestore,
        collections.products.CATEGORIES
      );
      const categoriesSnapshot = await getDocs(categoriesCollection);
      const categoriesMap: Record<string, TProductCategory> = {};
      categoriesSnapshot.forEach((doc) => {
        const category = doc.data() as TProductCategory;
        categoriesMap[doc.id] = category;
      });
      setCategories(categoriesMap);
    } catch (error) {
      console.error("Error al cargar categorías:", error);
    }
  };

  const calculateSubtotal = (itemsToCalculate: TSaleItem[]) => {
    return itemsToCalculate.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTotals = (itemsToCalculate: TSaleItem[], shouldApplyIVA: boolean, discountPerc: number, manualDisc: number) => {
    const initialSubtotal = calculateSubtotal(itemsToCalculate);
    const taxRate = 21; // IVA del 21%
    
    let calculatedTaxAmount = 0;
    let calculatedSubtotalSinIVA = initialSubtotal;
    
    if (shouldApplyIVA) {
      // Si aplicamos IVA, los precios son finales (con IVA incluido)
      // Calculamos el IVA que está incluido en el precio
      calculatedTaxAmount = redondearTotal(initialSubtotal * (taxRate / (100 + taxRate)));
      calculatedSubtotalSinIVA = redondearTotal(initialSubtotal - calculatedTaxAmount);
    }
    
    const calculatedDiscountAmount = redondearTotal(calculatedSubtotalSinIVA * (discountPerc / 100));
    const calculatedTotal = redondearTotal(initialSubtotal - calculatedDiscountAmount - manualDisc);
    
    setSubtotal(initialSubtotal);
    setTaxAmount(calculatedTaxAmount);
    setSubtotalSinIVA(calculatedSubtotalSinIVA);
    setDiscountAmount(calculatedDiscountAmount);
    setTotal(calculatedTotal);
  };

  const handleAddItem = () => {
    if (!selectedProduct || !selectedVariant || quantity <= 0 || unitPrice <= 0)
      return;

    const newItem: TSaleItem = {
      productId: selectedProduct,
      variantId: selectedVariant,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    };

    const newItems = [...items, newItem];
    calculateTotals(newItems, applyIVA, discountPercentage, manualDiscount);
    setItems(newItems);
    setSelectedProduct("");
    setSelectedVariant("");
    setQuantity(1);
    setUnitPrice(0);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    calculateTotals(newItems, applyIVA, discountPercentage, manualDiscount);
    setItems(newItems);
  };

  const handleIVAChange = (checked: boolean) => {
    setApplyIVA(checked);
    calculateTotals(items, checked, discountPercentage, manualDiscount);
  };

  const handleDiscountPercentageChange = (newPercentage: number) => {
    setDiscountPercentage(newPercentage);
    calculateTotals(items, applyIVA, newPercentage, manualDiscount);
  };

  const handleManualDiscountChange = (newManualDiscount: number) => {
    setManualDiscount(newManualDiscount);
    calculateTotals(items, applyIVA, discountPercentage, newManualDiscount);
  };

  const clearModalStates = () => {
    // Limpiar estados de edición
    setIsEditing(false);
    setIsLoading(false);
    
    // Limpiar productos y búsqueda
    setProducts({});
    setSelectedProduct("");
    setSelectedVariant("");
    setQuantity(1);
    setUnitPrice(0);
    setSearchTerm("");
    setSelectedCategory("all");
    setCategories({});
    
    // Limpiar items y totales
    setItems([]);
    setTotal(0);
    setSubtotal(0);
    setTaxAmount(0);
    setSubtotalSinIVA(0);
    setApplyIVA(false);
    setDiscountPercentage(0);
    setDiscountAmount(0);
    setManualDiscount(0);
    
    // Limpiar datos de pago
    setPaymentMethod(null);
    setIsInvoiced(null);
    setInvoiceNumber("");
    setSelectedBank("");
  };

  const handleModalClose = (open: boolean) => {
    if (!open) {
      clearModalStates();
    }
    onOpenChange(open);
  };

  const handleSave = async () => {
    if (!saleRef || !saleId) return;

    setIsLoading(true);
    try {
      const updateData: Partial<TSale> = {
        items,
        subtotal: redondearTotal(applyIVA ? subtotalSinIVA : subtotal),
        total: redondearTotal(total),
        // Información de IVA
        applyIVA,
        taxRate: 21,
        taxAmount: redondearTotal(taxAmount),
        // Información de descuentos
        discountPercentage,
        discountAmount: redondearTotal(discountAmount),
        manualDiscount: redondearTotal(manualDiscount),
      };
      if (paymentMethod) {
        updateData.paymentMethod = paymentMethod;
        if (paymentMethod === EPaymentMethod.TRANSFER && selectedBank) {
          updateData.bank = selectedBank;
        }
      }
      if (isInvoiced !== null) {
        updateData.isInvoiced = isInvoiced;
        if (isInvoiced && invoiceNumber) {
          updateData.invoiceNumber = invoiceNumber;
        }
      }

      await updateDoc(saleRef, updateData);
      onSuccess();
      setIsEditing(false);
    } catch (error) {
      console.error("Error al actualizar la venta:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVariantChange = (variantId: string) => {
    setSelectedVariant(variantId);
    if (selectedProduct && variantId) {
      const product = products[selectedProduct];
      const variant = product?.variants.find((v) => v.id === variantId);
      if (variant?.price) {
        setUnitPrice(Number(variant.price));
      }
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "-";
    try {
      if (typeof timestamp === "object" && "seconds" in timestamp) {
        return new Date(timestamp.seconds * 1000).toLocaleDateString();
      }
      return new Date(timestamp).toLocaleDateString();
    } catch (error) {
      console.error("Error al formatear fecha:", error);
      return "-";
    }
  };

  const formatPaymentMethod = (method: EPaymentMethod) => {
    switch (method) {
      case EPaymentMethod.CASH:
        return "Efectivo";
      case EPaymentMethod.CREDIT_CARD:
        return "Tarjeta de Crédito";
      case EPaymentMethod.DEBIT_CARD:
        return "Tarjeta de Débito";
      case EPaymentMethod.TRANSFER:
        return "Transferencia";
      case EPaymentMethod.MERCADOPAGO:
        return "MercadoPago";
      case EPaymentMethod.CHECK:
        return "Cheque";
      default:
        return method;
    }
  };

  const getVariantName = (productId: string, variantId: string) => {
    const product = products[productId];
    if (!product) return "Variante no encontrada";
    const variant = product.variants.find((v) => v.id === variantId);
    return variant ? `${variant.size}` : "Variante no encontrada";
  };

  // Filtrar productos basado en el término de búsqueda y categoría
  const filteredProducts = Object.entries(products).filter(([_, product]) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = product.name.toLowerCase().includes(searchLower);
    const matchesCategory =
      selectedCategory === "all" ||
      product.categories.includes(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  const getCategoryName = (categoryId: string) => {
    return categories[categoryId]?.name || "Sin categoría";
  };

  if (!saleId) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleModalClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Venta #{typedSale?.number}</DialogTitle>
          {!isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 bg-blue-900 hover:bg-blue-700 hover:text-white text-white"
            >
              <Edit className="h-4 w-4" />
              Editar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(false)}
                className="bg-red-500 hover:bg-red-600 text-white"
              >
                {/* <X className="h-4 w-4" /> */}
                Cancelar
              </Button>
              <Button
                type="submit"
                form="edit-quote-form"
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
                size="sm"
                onClick={handleSave}
              >
                <Save className="h-4 w-4" />
                Guardar
              </Button>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid gap-6 py-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">Información General</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p>
                    <span className="font-medium">Fecha:</span>{" "}
                    {formatDate(typedSale?.createdAt)}
                  </p>
                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <div>
                        <label className="text-sm font-medium">
                          Método de Pago
                        </label>
                        <Select
                          value={paymentMethod || ""}
                          onValueChange={(value) =>
                            setPaymentMethod(value as EPaymentMethod)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar método de pago" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(EPaymentMethod).map((method) => (
                              <SelectItem key={method} value={method}>
                                {formatPaymentMethod(method)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {paymentMethod === EPaymentMethod.TRANSFER && (
                        <div>
                          <label className="text-sm font-medium">Banco</label>
                          <Select
                            value={selectedBank}
                            onValueChange={setSelectedBank}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar banco" />
                            </SelectTrigger>
                            <SelectContent>
                              {BANCOS.map((banco) => (
                                <SelectItem key={banco} value={banco}>
                                  {banco}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <p>
                        <span className="font-medium">Método de Pago:</span>{" "}
                        {formatPaymentMethod(typedSale?.paymentMethod)}
                      </p>
                      {typedSale?.paymentMethod === EPaymentMethod.TRANSFER &&
                        typedSale?.bank && (
                          <p>
                            <span className="font-medium">Banco:</span>{" "}
                            {typedSale.bank}
                          </p>
                        )}
                    </>
                  )}
                </div>
                <div>
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isInvoiced || false}
                          onChange={(e) => setIsInvoiced(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <label className="text-sm font-medium">Facturado</label>
                      </div>
                      {isInvoiced && (
                        <div>
                          <label className="text-sm font-medium">
                            Número de Factura
                          </label>
                          <Input
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            placeholder="Ingrese el número de factura"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <p>
                        <span className="font-medium">Facturado:</span>{" "}
                        {typedSale?.isInvoiced ? "Sí" : "No"}
                      </p>
                      {typedSale?.invoiceNumber && (
                        <p>
                          <span className="font-medium">
                            Número de Factura:
                          </span>{" "}
                          {typedSale.invoiceNumber}
                        </p>
                      )}
                    </>
                  )}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p>Subtotal</p>
                      <p>{formatearPrecio(subtotal)}</p>
                    </div>
                    
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="applyIVA"
                          checked={applyIVA}
                          onCheckedChange={handleIVAChange}
                          disabled={!isEditing}
                          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                        <Label htmlFor="applyIVA" className="text-sm">
                          Desglosar IVA (21%)
                        </Label>
                      </div>
                      <p className="text-sm">
                        {applyIVA ? `${formatearPrecio(taxAmount)}` : '$ 0,00'}
                      </p>
                    </div>

                    {applyIVA && (
                      <div className="flex justify-between items-center text-sm pl-6">
                        <p>Subtotal sin IVA</p>
                        <p>{formatearPrecio(subtotalSinIVA)}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Label htmlFor="discount" className="text-sm w-24">
                          Descuento (%)
                        </Label>
                        <Input
                          id="discount"
                          type="number"
                          min="0"
                          max="100"
                          value={discountPercentage}
                          onChange={(e) => handleDiscountPercentageChange(Number(e.target.value))}
                          disabled={!isEditing}
                          className="w-16 h-8 text-center text-sm"
                          placeholder="0"
                        />
                      </div>
                      <p className="text-red-600">-{formatearPrecio(discountAmount)}</p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Label htmlFor="manualDiscount" className="text-sm w-24">
                          Descuento ($)
                        </Label>
                        <Input
                          id="manualDiscount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={manualDiscount}
                          onChange={(e) => handleManualDiscountChange(Number(e.target.value))}
                          disabled={!isEditing}
                          className="w-20 h-8 text-center text-sm"
                          placeholder="0"
                        />
                      </div>
                      <p className="text-red-600">-{formatearPrecio(manualDiscount)}</p>
                    </div>

                    <div className="border-t pt-3">
                      <div className="flex justify-between items-center">
                        <p className="text-lg">Total</p>
                        <p className="text-xl">{formatearPrecio(redondearADecena(total))}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Productos</h3>
              {isEditing && (
                <div className="mb-4 p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Agregar Producto</h4>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Filtrar por categoría
                      </label>
                      <Select
                        value={selectedCategory}
                        onValueChange={setSelectedCategory}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Todas las categorías" />
                        </SelectTrigger>
                        <SelectContent className="max-h-48 overflow-y-auto">
                          <SelectItem value="all">
                            Todas las categorías
                          </SelectItem>
                          {Object.entries(categories).map(([id, category]) => (
                            <SelectItem key={id} value={id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="relative">
                      <label className="text-sm font-medium mb-2 block">
                        Buscar productos
                      </label>
                      <Search className="absolute left-2 top-8 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nombre..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <label className="text-sm font-medium">Producto</label>
                      <Select
                        value={selectedProduct}
                        onValueChange={setSelectedProduct}
                      
                      >
                        <SelectTrigger >
                          <SelectValue placeholder="Seleccionar producto" />
                        </SelectTrigger>
                        <SelectContent className="max-h-48 overflow-y-auto">
                          {filteredProducts.map(([id, product]) => {
                            const hasStock =
                              product?.variants?.some(
                                (variant) => Number(variant.stock) > 0
                              ) ?? false;
                            return (
                              <SelectItem
                                key={id}
                                value={id}
                                disabled={!hasStock}
                                className={
                                  !hasStock
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }
                              >
                                <div className="flex flex-col">
                                  <span>
                                    {product?.name || "Producto sin nombre"}
                                  </span>
                      
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Variante</label>
                      <Select
                        value={selectedVariant}
                        onValueChange={handleVariantChange}
                        disabled={!selectedProduct}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar variante" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedProduct &&
                            products[selectedProduct]?.variants.map(
                              (variant) => (
                                <SelectItem
                                  key={variant.id}
                                  value={variant.id}
                                  disabled={Number(variant.stock) <= 0}
                                  className={
                                    Number(variant.stock) <= 0
                                      ? "opacity-50 cursor-not-allowed"
                                      : ""
                                  }
                                >
                                  {variant.size}{" "}
                                  {Number(variant.stock) <= 0 && "(Sin stock)"}
                                </SelectItem>
                              )
                            )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Cantidad</label>
                      <Input
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">
                        Precio Unitario
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleAddItem}
                    className="mt-4"
                    disabled={
                      !selectedProduct ||
                      !selectedVariant ||
                      quantity <= 0 ||
                      unitPrice <= 0
                    }
                  >
                    Agregar Producto
                  </Button>
                </div>
              )}

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      {/* <TableHead>Categoría</TableHead> */}
                      <TableHead>Medida</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">
                        Precio Unitario
                      </TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      {isEditing && (
                        <TableHead className="text-right">Acciones</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={isEditing ? 7 : 6}
                          className="text-center py-4"
                        >
                          Cargando productos...
                        </TableCell>
                      </TableRow>
                    ) : items.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={isEditing ? 7 : 6}
                          className="text-center py-4"
                        >
                          No hay productos en esta venta
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            {products[item.productId]?.name ||
                              "Producto no encontrado"}
                          </TableCell>
                          {/* <TableCell>
                            {products[item.productId]?.categories
                              ?.map((catId) => getCategoryName(catId))
                              .join(", ") || "Sin categoría"}
                          </TableCell> */}
                          <TableCell>
                            {getVariantName(item.productId, item.variantId)}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatearPrecio(item.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatearPrecio(item.total * (applyIVA ? 1.21 : 1))}
                          </TableCell>
                          {isEditing && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                title="Eliminar"
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                              >
                                {/* <X className="h-4 w-4" /> */}
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
