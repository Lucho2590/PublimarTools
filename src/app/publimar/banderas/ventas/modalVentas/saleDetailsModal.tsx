'use client';
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
import { formatearPrecio } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit, Save, X, Search, Filter } from "lucide-react";

const BANCOS = ["Galicia", "Frances"];

interface SaleDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
  onSuccess: () => void;
}

export function SaleDetailsModal({ open, onOpenChange, saleId, onSuccess }: SaleDetailsModalProps) {
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [products, setProducts] = useState<Record<string, TProduct>>({});
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [items, setItems] = useState<TSaleItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<EPaymentMethod | null>(null);
  const [isInvoiced, setIsInvoiced] = useState<boolean | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [total, setTotal] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [categories, setCategories] = useState<Record<string, TProductCategory>>({});

  const saleRef = saleId ? doc(firestore, collections.SALES, saleId) : null;
  const { data: sale } = useFirestoreDocData(saleRef ?? doc(firestore, collections.SALES, "dummy"), {
    idField: "id",
  });

  const typedSale = sale as unknown as TSale;

  useEffect(() => {
    if (open) {
      loadProducts();
      loadCategories();
      if (typedSale?.items) {
        setItems(typedSale.items);
        setTotal(calculateTotal(typedSale.items));
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
      const categoriesCollection = collection(firestore, collections.products.CATEGORIES);
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

  const calculateTotal = (itemsToCalculate: TSaleItem[]) => {
    return itemsToCalculate.reduce((sum, item) => sum + item.total, 0);
  };

  const handleAddItem = () => {
    if (!selectedProduct || !selectedVariant || quantity <= 0 || unitPrice <= 0) return;

    const newItem: TSaleItem = {
      productId: selectedProduct,
      variantId: selectedVariant,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    };

    const newItems = [...items, newItem];
    setItems(newItems);
    setTotal(calculateTotal(newItems));
    setSelectedProduct("");
    setSelectedVariant("");
    setQuantity(1);
    setUnitPrice(0);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
    setTotal(calculateTotal(newItems));
  };

  const handleSave = async () => {
    if (!saleRef || !saleId) return;

    setIsLoading(true);
    try {
      const updateData: Partial<TSale> = {
        items,
        total,
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
      const variant = product?.variants.find(v => v.id === variantId);
      if (variant?.price) {
        setUnitPrice(Number(variant.price));
      }
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "-";
    try {
      if (typeof timestamp === 'object' && 'seconds' in timestamp) {
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
      default:
        return method;
    }
  };

  const getVariantName = (productId: string, variantId: string) => {
    const product = products[productId];
    if (!product) return "Variante no encontrada";
    const variant = product.variants.find(v => v.id === variantId);
    return variant ? `${variant.size}` : "Variante no encontrada";
  };

  // Filtrar productos basado en el término de búsqueda y categoría
  const filteredProducts = Object.entries(products).filter(([_, product]) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = product.name.toLowerCase().includes(searchLower);
    const matchesCategory = selectedCategory === "all" || product.categories.includes(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  const getCategoryName = (categoryId: string) => {
    return categories[categoryId]?.name || "Sin categoría";
  };

  if (!saleId) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Venta #{typedSale?.number}</DialogTitle>
          {!isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2"
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
                className="flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isLoading}
                className="flex items-center gap-2"
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
                  <p><span className="font-medium">Fecha:</span> {formatDate(typedSale?.createdAt)}</p>
                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <div>
                        <label className="text-sm font-medium">Método de Pago</label>
                        <Select
                          value={paymentMethod || ""}
                          onValueChange={(value) => setPaymentMethod(value as EPaymentMethod)}
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
                      <p><span className="font-medium">Método de Pago:</span> {formatPaymentMethod(typedSale?.paymentMethod)}</p>
                      {typedSale?.paymentMethod === EPaymentMethod.TRANSFER && typedSale?.bank && (
                        <p><span className="font-medium">Banco:</span> {typedSale.bank}</p>
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
                          <label className="text-sm font-medium">Número de Factura</label>
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
                      <p><span className="font-medium">Facturado:</span> {typedSale?.isInvoiced ? "Sí" : "No"}</p>
                      {typedSale?.invoiceNumber && (
                        <p><span className="font-medium">Número de Factura:</span> {typedSale.invoiceNumber}</p>
                      )}
                    </>
                  )}
                  <p><span className="font-medium">Total:</span> {formatearPrecio(total)}</p>
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
                      <label className="text-sm font-medium mb-2 block">Filtrar por categoría</label>
                      <Select
                        value={selectedCategory}
                        onValueChange={setSelectedCategory}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Todas las categorías" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas las categorías</SelectItem>
                          {Object.entries(categories).map(([id, category]) => (
                            <SelectItem key={id} value={id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="relative">
                      <label className="text-sm font-medium mb-2 block">Buscar productos</label>
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
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar producto" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredProducts.map(([id, product]) => {
                            const hasStock = product?.variants?.some(variant => Number(variant.stock) > 0) ?? false;
                            return (
                              <SelectItem 
                                key={id} 
                                value={id}
                                disabled={!hasStock}
                                className={!hasStock ? "opacity-50 cursor-not-allowed" : ""}
                              >
                                <div className="flex flex-col">
                                  <span>{product?.name || "Producto sin nombre"}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {product?.categories?.map(catId => getCategoryName(catId)).join(", ") || "Sin categoría"}
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
                          {selectedProduct && products[selectedProduct]?.variants.map((variant) => (
                            <SelectItem 
                              key={variant.id} 
                              value={variant.id}
                              disabled={Number(variant.stock) <= 0}
                              className={Number(variant.stock) <= 0 ? "opacity-50 cursor-not-allowed" : ""}
                            >
                              {variant.size} {Number(variant.stock) <= 0 && "(Sin stock)"}
                            </SelectItem>
                          ))}
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
                      <label className="text-sm font-medium">Precio Unitario</label>
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
                    disabled={!selectedProduct || !selectedVariant || quantity <= 0 || unitPrice <= 0}
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
                      <TableHead>Categoría</TableHead>
                      <TableHead>Medida</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Precio Unitario</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      {isEditing && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={isEditing ? 7 : 6} className="text-center py-4">
                          Cargando productos...
                        </TableCell>
                      </TableRow>
                    ) : items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isEditing ? 7 : 6} className="text-center py-4">
                          No hay productos en esta venta
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{products[item.productId]?.name || "Producto no encontrado"}</TableCell>
                          <TableCell>
                            {products[item.productId]?.categories?.map(catId => getCategoryName(catId)).join(", ") || "Sin categoría"}
                          </TableCell>
                          <TableCell>{getVariantName(item.productId, item.variantId)}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatearPrecio(item.unitPrice)}</TableCell>
                          <TableCell className="text-right">{formatearPrecio(item.total)}</TableCell>
                          {isEditing && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveItem(index)}
                              >
                                <X className="h-4 w-4" />
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