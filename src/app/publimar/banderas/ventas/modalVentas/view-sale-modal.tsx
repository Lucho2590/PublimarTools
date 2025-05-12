import { useFirestore, useFirestoreDocData } from "reactfire";
import { doc, collection, getDocs } from "firebase/firestore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { TSale, EPaymentMethod } from "~/types/sale";
import collections from "~/lib/collections";
import { formatearPrecio } from "~/lib/utils";
import { useState, useEffect } from "react";
import { TProduct } from "~/types/product";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

interface ViewSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
}

export function ViewSaleModal({ open, onOpenChange, saleId }: ViewSaleModalProps) {
  const firestore = useFirestore();
  const [products, setProducts] = useState<Record<string, TProduct>>({});
  const [isLoading, setIsLoading] = useState(true);

  const saleRef = saleId ? doc(firestore, collections.SALES, saleId) : null;
  const { data: sale } = useFirestoreDocData(saleRef ?? doc(firestore, collections.SALES, "dummy"), {
    idField: "id",
  });

  const typedSale = sale as unknown as TSale;

  // Cargar productos cuando se abre el modal
  const loadProducts = async () => {
    if (!open) return;
    
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar productos cuando se abre el modal
  useEffect(() => {
    if (open) {
      loadProducts();
    }
  }, [open, firestore]);

  // Si no hay saleId, no mostramos el modal
  if (!saleId) {
    return null;
  }

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

  const getProductName = async (productId: string) => {
    if (products[productId]) {
      return products[productId].name;
    }

    try {
      const productDoc = await getDocs(collection(firestore, collections.PRODUCTS));
      const productsMap: Record<string, TProduct> = {};
      productDoc.forEach((doc) => {
        const product = doc.data() as TProduct;
        productsMap[doc.id] = product;
      });
      setProducts(productsMap);
      return productsMap[productId]?.name || "Producto no encontrado";
    } catch (error) {
      console.error("Error al obtener el producto:", error);
      return "Producto no encontrado";
    }
  };

  const getVariantName = (productId: string, variantId: string) => {
    const product = products[productId];
    if (!product) return "Variante no encontrada";
    const variant = product.variants.find(v => v.id === variantId);
    return variant ? `${variant.size}` : "Variante no encontrada";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Detalles de la Venta #{typedSale?.number}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="bg-slate-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-4">Información General</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p><span className="font-medium">Fecha:</span> {formatDate(typedSale?.createdAt)}</p>
                <p><span className="font-medium">Método de Pago:</span> {formatPaymentMethod(typedSale?.paymentMethod)}</p>
              </div>
              <div>
                <p><span className="font-medium">Facturado:</span> {typedSale?.isInvoiced ? "Sí" : "No"}</p>
                <p><span className="font-medium">Total:</span> {formatearPrecio(typedSale?.total)}</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Productos</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Medida</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Precio Unitario</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">
                      Cargando productos...
                    </TableCell>
                  </TableRow>
                ) : (
                  typedSale?.items?.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{products[item.productId]?.name || "Producto no encontrado"}</TableCell>
                      <TableCell>{getVariantName(item.productId, item.variantId)}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{formatearPrecio(item.unitPrice)}</TableCell>
                      <TableCell className="text-right">{formatearPrecio(item.total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 