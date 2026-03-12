// Ecommerce Helpers - Procesar ventas desde pedidos de tienda online
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  increment,
  serverTimestamp,
  Firestore,
} from "firebase/firestore";
import { TEcommerceOrder } from "@/types/ecommerceOrder";
import { TSale, TSaleItem, EPaymentMethod, ESaleDepartment } from "@/types/sale";
import collections from "./collections";

/**
 * Genera un número de venta único
 * Formato: V-YYYYMMDD-HHMMSS-XXX
 */
function generateSaleNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();

  return `V-${year}${month}${day}-${hours}${minutes}${seconds}-${random}`;
}

/**
 * Descuenta el stock de un producto o variante
 */
async function decrementStock(
  firestore: Firestore,
  productId: string,
  quantity: number,
  variantId?: string
): Promise<void> {
  const productRef = doc(firestore, collections.PRODUCTS, productId);
  const productSnap = await getDoc(productRef);

  if (!productSnap.exists()) {
    console.warn(`Producto ${productId} no encontrado para descontar stock`);
    return;
  }

  const productData = productSnap.data();

  if (variantId && productData.hasVariants && productData.variants) {
    // Descontar de la variante específica
    const variants = [...productData.variants];
    const variantIndex = variants.findIndex((v: any) => v.id === variantId);

    if (variantIndex !== -1) {
      const currentStock = Number(variants[variantIndex].stock) || 0;
      variants[variantIndex].stock = Math.max(0, currentStock - quantity);

      await updateDoc(productRef, {
        variants,
        updatedAt: serverTimestamp(),
      });

      console.log(
        `📦 Stock actualizado: ${productData.name} (variante ${variantId}): ${currentStock} → ${variants[variantIndex].stock}`
      );
    }
  } else {
    // Descontar del stock general del producto
    const currentStock = Number(productData.stock) || 0;
    const newStock = Math.max(0, currentStock - quantity);

    await updateDoc(productRef, {
      stock: newStock,
      updatedAt: serverTimestamp(),
    });

    console.log(
      `📦 Stock actualizado: ${productData.name}: ${currentStock} → ${newStock}`
    );
  }
}

/**
 * Procesa un pedido de ecommerce: crea la venta y descuenta el stock
 * Solo debe llamarse cuando el pedido cambia a "shipped" o "delivered" por primera vez
 */
export async function processOrderSale(
  firestore: Firestore,
  order: TEcommerceOrder
): Promise<{ saleId: string; saleNumber: string }> {
  // 1. Convertir items del pedido a items de venta
  const saleItems: TSaleItem[] = order.items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    variantId: item.variant?.id || "",
    variantName: item.variant?.name || null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.subtotal,
    description: item.variant
      ? `${item.productName} - ${item.variant.name}`
      : item.productName,
  }));

  // 2. Crear la venta
  const saleNumber = generateSaleNumber();
  const saleData: Omit<TSale, "id"> = {
    number: saleNumber,
    items: saleItems,
    subtotal: order.subtotal,
    total: order.total,
    paymentMethod: EPaymentMethod.TRANSFER, // Por defecto transferencia para ecommerce
    department: ESaleDepartment.BANDERAS,
    isInvoiced: false,
    invoiceNumber: null,
    // Cliente (si tenemos datos)
    clientName: order.customer?.name || "Cliente Web",
    tempClientData: order.customer
      ? {
          id: "",
          name: order.customer.name || "",
          email: order.customer.email || "",
          telefono: order.customer.phone || "",
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : undefined,
    // Referencia al pedido original
    orderId: order.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const saleRef = await addDoc(collection(firestore, collections.SALES), {
    ...saleData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  console.log(`✅ Venta creada: ${saleNumber} (ID: ${saleRef.id})`);

  // 3. Descontar stock de cada producto
  for (const item of order.items) {
    await decrementStock(
      firestore,
      item.productId,
      item.quantity,
      item.variant?.id
    );
  }

  // 4. Actualizar el pedido con la referencia a la venta
  const orderRef = doc(firestore, "ecommerceOrders", order.id);
  await updateDoc(orderRef, {
    saleId: saleRef.id,
    saleNumber: saleNumber,
    saleProcessedAt: serverTimestamp(),
  });

  return {
    saleId: saleRef.id,
    saleNumber,
  };
}

/**
 * Verifica si un pedido ya fue procesado como venta
 */
export function isOrderAlreadyProcessed(order: TEcommerceOrder): boolean {
  return !!(order as any).saleId || !!(order as any).saleProcessedAt;
}

/**
 * Incrementa el stock de un producto o variante (devolver stock)
 */
async function incrementStock(
  firestore: Firestore,
  productId: string,
  quantity: number,
  variantId?: string
): Promise<void> {
  const productRef = doc(firestore, collections.PRODUCTS, productId);
  const productSnap = await getDoc(productRef);

  if (!productSnap.exists()) {
    console.warn(`Producto ${productId} no encontrado para devolver stock`);
    return;
  }

  const productData = productSnap.data();

  if (variantId && productData.hasVariants && productData.variants) {
    // Devolver a la variante específica
    const variants = [...productData.variants];
    const variantIndex = variants.findIndex((v: any) => v.id === variantId);

    if (variantIndex !== -1) {
      const currentStock = Number(variants[variantIndex].stock) || 0;
      variants[variantIndex].stock = currentStock + quantity;

      await updateDoc(productRef, {
        variants,
        updatedAt: serverTimestamp(),
      });

      console.log(
        `📦 Stock devuelto: ${productData.name} (variante ${variantId}): ${currentStock} → ${variants[variantIndex].stock}`
      );
    }
  } else {
    // Devolver al stock general del producto
    const currentStock = Number(productData.stock) || 0;
    const newStock = currentStock + quantity;

    await updateDoc(productRef, {
      stock: newStock,
      updatedAt: serverTimestamp(),
    });

    console.log(
      `📦 Stock devuelto: ${productData.name}: ${currentStock} → ${newStock}`
    );
  }
}

/**
 * Cancela una venta asociada a un pedido: devuelve stock y marca la venta como anulada
 */
export async function cancelOrderSale(
  firestore: Firestore,
  order: TEcommerceOrder
): Promise<void> {
  // Verificar que el pedido tenga una venta asociada
  if (!order.saleId) {
    console.log("El pedido no tiene venta asociada, nada que cancelar");
    return;
  }

  // 1. Marcar la venta como anulada
  const saleRef = doc(firestore, collections.SALES, order.saleId);
  const saleSnap = await getDoc(saleRef);

  if (saleSnap.exists()) {
    await updateDoc(saleRef, {
      cancelled: true,
      cancelledAt: serverTimestamp(),
      cancellationReason: "Pedido ecommerce cancelado",
      updatedAt: serverTimestamp(),
    });
    console.log(`❌ Venta ${order.saleNumber} marcada como anulada`);
  }

  // 2. Devolver stock de cada producto
  for (const item of order.items) {
    await incrementStock(
      firestore,
      item.productId,
      item.quantity,
      item.variant?.id
    );
  }

  // 3. Actualizar el pedido para indicar que la venta fue cancelada
  const orderRef = doc(firestore, "ecommerceOrders", order.id);
  await updateDoc(orderRef, {
    saleCancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  console.log(`✅ Pedido ${order.orderNumber}: venta cancelada y stock devuelto`);
}
