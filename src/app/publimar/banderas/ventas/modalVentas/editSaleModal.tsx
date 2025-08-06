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
import { TSale, TSaleItem } from "@/types/sale";
import collections from "@/lib/collections";
import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EPaymentMethod } from "@/types/sale";
import { TProduct } from "@/types/product";
import { Input } from "@/components/ui/input";
import { formatearPrecio, redondearTotal } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface EditSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
  onSuccess: () => void;
}

export function EditSaleModal({ open, onOpenChange, saleId, onSuccess }: EditSaleModalProps) {
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Record<string, TProduct>>({});
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [items, setItems] = useState<TSaleItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<EPaymentMethod | null>(null);
  const [isInvoiced, setIsInvoiced] = useState<boolean | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [applyIVA, setApplyIVA] = useState<boolean>(true);
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [manualDiscount, setManualDiscount] = useState<number>(0);

  const clearModalStates = () => {
    setIsLoading(false);
    setProducts({});
    setSelectedProduct("");
    setSelectedVariant("");
    setQuantity(1);
    setUnitPrice(0);
    setItems([]);
    setPaymentMethod(null);
    setIsInvoiced(null);
    setInvoiceNumber("");
    setApplyIVA(true);
    setDiscountPercentage(0);
    setManualDiscount(0);
  };

  const handleModalClose = (open: boolean) => {
    if (!open) {
      clearModalStates();
    }
    onOpenChange(open);
  };

  const saleRef = saleId ? doc(firestore, collections.SALES, saleId) : null;
  const { data: sale } = useFirestoreDocData(saleRef ?? doc(firestore, collections.SALES, "dummy"), {
    idField: "id",
  });

  const typedSale = sale as unknown as TSale;

  // Cargar productos cuando se abre el modal
  useEffect(() => {
    if (open) {
      loadProducts();
      if (typedSale?.items) {
        setItems(typedSale.items);
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

  const handleAddItem = () => {
    if (!selectedProduct || !selectedVariant || quantity <= 0 || unitPrice <= 0) return;

    const newItem: TSaleItem = {
      productId: selectedProduct,
      variantId: selectedVariant,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    };

    setItems([...items, newItem]);
    setSelectedProduct("");
    setSelectedVariant("");
    setQuantity(1);
    setUnitPrice(0);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const calculateSubtotal = () => {
    return redondearTotal(items.reduce((sum, item) => sum + item.total, 0));
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const taxRate = 21;
    
    // Calcular IVA desde precio final cuando aplica
    let taxAmount = 0;
    let subtotalSinIVA = subtotal;
    
    if (applyIVA) {
      // Los precios son finales (con IVA incluido)
      taxAmount = redondearTotal(subtotal * (taxRate / (100 + taxRate)));
      subtotalSinIVA = redondearTotal(subtotal - taxAmount);
    }
    
    const discountAmount = redondearTotal(subtotalSinIVA * (discountPercentage / 100));
    return redondearTotal(subtotal - discountAmount - manualDiscount);
  };

  const handleSave = async () => {
    if (!saleRef || !saleId) return;

    setIsLoading(true);
    try {
      const subtotal = calculateSubtotal();
      const taxRate = 21;
      
      // Calcular IVA desde precio final cuando aplica
      let taxAmount = 0;
      let subtotalSinIVA = subtotal;
      
      if (applyIVA) {
        taxAmount = redondearTotal(subtotal * (taxRate / (100 + taxRate)));
        subtotalSinIVA = redondearTotal(subtotal - taxAmount);
      }
      
      const discountAmount = redondearTotal(subtotalSinIVA * (discountPercentage / 100));
      
      const updateData: Partial<TSale> = {
        items,
        subtotal: redondearTotal(applyIVA ? subtotalSinIVA : subtotal), // Subtotal sin IVA si aplica
        total: calculateTotal(),
        // Información de IVA
        applyIVA,
        taxRate,
        taxAmount: redondearTotal(taxAmount), // IVA calculado desde precio final
        // Información de descuentos
        discountPercentage,
        discountAmount: redondearTotal(discountAmount),
        manualDiscount,
      };
      if (paymentMethod) updateData.paymentMethod = paymentMethod;
      if (isInvoiced !== null) {
        updateData.isInvoiced = isInvoiced;
        if (isInvoiced && invoiceNumber) {
          updateData.invoiceNumber = invoiceNumber;
        }
      }

      await updateDoc(saleRef, updateData);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error al actualizar la venta:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Actualizar precio cuando se selecciona una variante
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

  // Si no hay saleId, no mostramos el modal
  if (!saleId) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleModalClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Editar Venta #{typedSale?.number}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid gap-4">
       

            <div className="pt-4">
              <h3 className="font-semibold mb-4">Agregar Producto</h3>
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
                      {Object.entries(products).map(([id, product]) => {
                        const hasStock = product?.variants?.some(variant => Number(variant.stock) > 0) ?? false;
                        return (
                          <SelectItem 
                            key={id} 
                            value={id}
                            disabled={!hasStock}
                            className={!hasStock ? "opacity-50 cursor-not-allowed" : ""}
                          >
                            {product?.name || "Producto sin nombre"} {!hasStock && "(Sin stock)"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Medida</label>
                  <Select
                    value={selectedVariant}
                    onValueChange={handleVariantChange}
                    disabled={!selectedProduct}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar medida" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedProduct &&
                        products[selectedProduct]?.variants?.map((variant) => (
                          <SelectItem 
                            key={variant.id} 
                            value={variant.id}
                            disabled={!variant?.stock || Number(variant?.stock) <= 0}
                            className={(!variant?.stock || Number(variant?.stock) <= 0) ? "opacity-50 cursor-not-allowed" : ""}
                          >
                            {variant?.size || "Medida sin nombre"} {(!variant?.stock || Number(variant?.stock) <= 0) && "(Sin stock)"}
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
                    step="0.010"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="mt-4">
                <Button
                  onClick={handleAddItem}
                  disabled={!selectedProduct || !selectedVariant || quantity <= 0 || unitPrice <= 0}
                  className="bg-blue-900 hover:bg-blue-900 hover:text-white"
                >
                  Agregar Producto
                </Button>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold mb-4">Productos</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Medida</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Precio Unitario</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{products[item.productId]?.name || "Producto no encontrado"}</TableCell>
                      <TableCell>
                        {products[item.productId]?.variants.find(v => v.id === item.variantId)?.size || "Medida no encontrada"}
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatearPrecio(item.unitPrice)}</TableCell>
                      <TableCell className="text-right">{formatearPrecio(item.total)}</TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemoveItem(index)}
                        >
                          Eliminar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="font-medium">Subtotal (precios finales)</p>
                  <p className="font-medium">{formatearPrecio(calculateSubtotal())}</p>
                </div>
                
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="applyIVA"
                      checked={applyIVA}
                      onCheckedChange={(checked) => setApplyIVA(checked as boolean)}
                      className="data-[state=checked]:bg-blue-900 data-[state=checked]:border-blue-900"
                    />
                    <Label htmlFor="applyIVA">Desglosar IVA (21%)</Label>
                  </div>
                  <p>{applyIVA ? `- ${formatearPrecio(calculateSubtotal() * (21 / 121))}` : formatearPrecio(0)}</p>
                </div>

                {applyIVA && (
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <p>Subtotal sin IVA</p>
                    <p>{formatearPrecio(calculateSubtotal() - (calculateSubtotal() * (21 / 121)))}</p>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="discountPercentage">Descuento (%)</Label>
                    <Input
                      id="discountPercentage"
                      type="number"
                      min="0"
                      max="100"
                      value={discountPercentage}
                      onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                      className="w-20 h-8"
                    />
                  </div>
                  <p className="text-red-500">-{formatearPrecio((applyIVA ? calculateSubtotal() - (calculateSubtotal() * (21 / 121)) : calculateSubtotal()) * (discountPercentage / 100))}</p>
                </div>

                <div className="flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="manualDiscount">Descuento ($)</Label>
                    <Input
                      id="manualDiscount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualDiscount}
                      onChange={(e) => setManualDiscount(Number(e.target.value))}
                      className="w-24 h-8"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-red-500">-{formatearPrecio(manualDiscount)}</p>
                </div>

                <div className="flex justify-between items-center font-semibold text-lg border-t pt-2">
                  <p>Total</p>
                  <p>{formatearPrecio(calculateTotal())}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Método de Pago</label>
                <Select
                  value={paymentMethod || typedSale?.paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as EPaymentMethod)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar método de pago" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EPaymentMethod.CASH}>Efectivo</SelectItem>
                    <SelectItem value={EPaymentMethod.CREDIT_CARD}>Tarjeta de Crédito</SelectItem>
                    <SelectItem value={EPaymentMethod.DEBIT_CARD}>Tarjeta de Débito</SelectItem>
                    <SelectItem value={EPaymentMethod.TRANSFER}>Transferencia</SelectItem>
                    <SelectItem value={EPaymentMethod.MERCADOPAGO}>MercadoPago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Facturado</label>
                <Select
                  value={isInvoiced !== null ? isInvoiced.toString() : typedSale?.isInvoiced.toString()}
                  onValueChange={(value) => setIsInvoiced(value === "true")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar estado de facturación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Sí</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
                {isInvoiced && (
                  <div className="mt-2">
                    <label className="text-sm font-medium">Número de Factura</label>
                    <Input
                      type="text"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="Ingrese el número de factura"
                    />
                  </div>
                )}
              </div>
            </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isLoading}
              className="bg-blue-900 hover:bg-blue-900 hover:text-white"
            >
              {isLoading ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 