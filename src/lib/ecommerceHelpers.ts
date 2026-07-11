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
import { variantDiscountsStock } from "./stock";
import {
  TAuditActor,
  writeAuditLog,
  generateCorrelationId,
} from "./auditLog";
import {
  EAuditAction,
  EAuditEntityType,
  EAuditSection,
} from "@/types/auditLog";

const SYSTEM_ACTOR: TAuditActor = {
  userId: null,
  userEmail: null,
  userName: "Sistema (ecommerce)",
  userRole: null,
};

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
  variantId: string | undefined,
  actor: TAuditActor,
  correlationId: string,
  context: { orderId: string; orderNumber?: string | null; saleId?: string; saleNumber?: string | null }
): Promise<void> {
  const productRef = doc(firestore, collections.PRODUCTS, productId);
  const productSnap = await getDoc(productRef);

  if (!productSnap.exists()) {
    console.warn(`Producto ${productId} no encontrado para descontar stock`);
    return;
  }

  const productData = productSnap.data();

  if (variantId && productData.hasVariants && productData.variants) {
    const variants = [...productData.variants];
    const variantIndex = variants.findIndex((v: any) => v.id === variantId);

    if (variantIndex !== -1) {
      // Variante marcada para no descontar stock: no tocamos nada.
      if (!variantDiscountsStock(variants[variantIndex])) return;
      const currentStock = Number(variants[variantIndex].stock) || 0;
      const newStock = Math.max(0, currentStock - quantity);
      const variantName = variants[variantIndex].size ?? variants[variantIndex].name;
      variants[variantIndex].stock = newStock;

      await updateDoc(productRef, {
        variants,
        updatedAt: serverTimestamp(),
      });

      await writeAuditLog(firestore, actor, {
        section: EAuditSection.ECOMMERCE,
        entityType: EAuditEntityType.PRODUCT_VARIANT,
        entityId: variantId,
        entityLabel: `${productData.name} (${variantName ?? ''})`.trim(),
        action: EAuditAction.STOCK_CHANGE,
        description: `-${quantity} en stock de ${productData.name}${variantName ? ' (' + variantName + ')' : ''} por pedido ecommerce`,
        metadata: {
          reason: "ecommerce",
          productId,
          productName: productData.name,
          variantId,
          variantName,
          stockBefore: currentStock,
          stockAfter: newStock,
          delta: -quantity,
          ...context,
        },
        correlationId,
      });
    }
  } else {
    const currentStock = Number(productData.stock) || 0;
    const newStock = Math.max(0, currentStock - quantity);

    await updateDoc(productRef, {
      stock: newStock,
      updatedAt: serverTimestamp(),
    });

    await writeAuditLog(firestore, actor, {
      section: EAuditSection.ECOMMERCE,
      entityType: EAuditEntityType.PRODUCT,
      entityId: productId,
      entityLabel: productData.name ?? null,
      action: EAuditAction.STOCK_CHANGE,
      description: `-${quantity} en stock de ${productData.name} por pedido ecommerce`,
      metadata: {
        reason: "ecommerce",
        productId,
        productName: productData.name,
        stockBefore: currentStock,
        stockAfter: newStock,
        delta: -quantity,
        ...context,
      },
      correlationId,
    });
  }
}

/**
 * Procesa un pedido de ecommerce: crea la venta y descuenta el stock
 * Solo debe llamarse cuando el pedido cambia a "shipped" o "delivered" por primera vez
 */
export async function processOrderSale(
  firestore: Firestore,
  order: TEcommerceOrder,
  actor: TAuditActor = SYSTEM_ACTOR
): Promise<{ saleId: string; saleNumber: string }> {
  const correlationId = generateCorrelationId();

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

  const saleNumber = generateSaleNumber();
  const saleData: Omit<TSale, "id"> = {
    number: saleNumber,
    items: saleItems,
    subtotal: order.subtotal,
    total: order.total,
    paymentMethod: EPaymentMethod.TRANSFER,
    department: ESaleDepartment.BANDERAS,
    isInvoiced: false,
    invoiceNumber: null,
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
    orderId: order.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const saleRef = await addDoc(collection(firestore, collections.SALES), {
    ...saleData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const item of order.items) {
    await decrementStock(
      firestore,
      item.productId,
      item.quantity,
      item.variant?.id,
      actor,
      correlationId,
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        saleId: saleRef.id,
        saleNumber,
      }
    );
  }

  const orderRef = doc(firestore, "ecommerceOrders", order.id);
  await updateDoc(orderRef, {
    saleId: saleRef.id,
    saleNumber: saleNumber,
    saleProcessedAt: serverTimestamp(),
  });

  await writeAuditLog(firestore, actor, {
    section: EAuditSection.ECOMMERCE,
    entityType: EAuditEntityType.SALE,
    entityId: saleRef.id,
    entityLabel: saleNumber,
    action: EAuditAction.CREATE,
    description: `Creó la venta ${saleNumber} desde pedido ${order.orderNumber ?? order.id} por $${order.total}`,
    metadata: {
      source: "ecommerce",
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      itemsCount: order.items.length,
      clientName: order.customer?.name ?? null,
    },
    correlationId,
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
  variantId: string | undefined,
  actor: TAuditActor,
  correlationId: string,
  context: { orderId: string; orderNumber?: string | null; saleId?: string; saleNumber?: string | null }
): Promise<void> {
  const productRef = doc(firestore, collections.PRODUCTS, productId);
  const productSnap = await getDoc(productRef);

  if (!productSnap.exists()) {
    console.warn(`Producto ${productId} no encontrado para devolver stock`);
    return;
  }

  const productData = productSnap.data();

  if (variantId && productData.hasVariants && productData.variants) {
    const variants = [...productData.variants];
    const variantIndex = variants.findIndex((v: any) => v.id === variantId);

    if (variantIndex !== -1) {
      const currentStock = Number(variants[variantIndex].stock) || 0;
      const newStock = currentStock + quantity;
      const variantName = variants[variantIndex].size ?? variants[variantIndex].name;
      variants[variantIndex].stock = newStock;

      await updateDoc(productRef, {
        variants,
        updatedAt: serverTimestamp(),
      });

      await writeAuditLog(firestore, actor, {
        section: EAuditSection.ECOMMERCE,
        entityType: EAuditEntityType.PRODUCT_VARIANT,
        entityId: variantId,
        entityLabel: `${productData.name} (${variantName ?? ''})`.trim(),
        action: EAuditAction.STOCK_CHANGE,
        description: `+${quantity} en stock de ${productData.name}${variantName ? ' (' + variantName + ')' : ''} por cancelación de pedido ecommerce`,
        metadata: {
          reason: "ecommerce_cancel",
          productId,
          productName: productData.name,
          variantId,
          variantName,
          stockBefore: currentStock,
          stockAfter: newStock,
          delta: quantity,
          ...context,
        },
        correlationId,
      });
    }
  } else {
    const currentStock = Number(productData.stock) || 0;
    const newStock = currentStock + quantity;

    await updateDoc(productRef, {
      stock: newStock,
      updatedAt: serverTimestamp(),
    });

    await writeAuditLog(firestore, actor, {
      section: EAuditSection.ECOMMERCE,
      entityType: EAuditEntityType.PRODUCT,
      entityId: productId,
      entityLabel: productData.name ?? null,
      action: EAuditAction.STOCK_CHANGE,
      description: `+${quantity} en stock de ${productData.name} por cancelación de pedido ecommerce`,
      metadata: {
        reason: "ecommerce_cancel",
        productId,
        productName: productData.name,
        stockBefore: currentStock,
        stockAfter: newStock,
        delta: quantity,
        ...context,
      },
      correlationId,
    });
  }
}

/**
 * Cancela una venta asociada a un pedido: devuelve stock y marca la venta como anulada
 */
export async function cancelOrderSale(
  firestore: Firestore,
  order: TEcommerceOrder,
  actor: TAuditActor = SYSTEM_ACTOR
): Promise<void> {
  if (!order.saleId) {
    console.log("El pedido no tiene venta asociada, nada que cancelar");
    return;
  }

  const correlationId = generateCorrelationId();

  const saleRef = doc(firestore, collections.SALES, order.saleId);
  const saleSnap = await getDoc(saleRef);

  if (saleSnap.exists()) {
    await updateDoc(saleRef, {
      cancelled: true,
      cancelledAt: serverTimestamp(),
      cancellationReason: "Pedido ecommerce cancelado",
      updatedAt: serverTimestamp(),
    });

    await writeAuditLog(firestore, actor, {
      section: EAuditSection.ECOMMERCE,
      entityType: EAuditEntityType.SALE,
      entityId: order.saleId,
      entityLabel: order.saleNumber ?? null,
      action: EAuditAction.UPDATE,
      description: `Anuló la venta ${order.saleNumber ?? ''} por cancelación de pedido ecommerce`.trim(),
      changes: {
        before: { cancelled: false },
        after: { cancelled: true, cancellationReason: "Pedido ecommerce cancelado" },
      },
      metadata: {
        source: "ecommerce",
        orderId: order.id,
        orderNumber: order.orderNumber,
      },
      correlationId,
    });
  }

  for (const item of order.items) {
    await incrementStock(
      firestore,
      item.productId,
      item.quantity,
      item.variant?.id,
      actor,
      correlationId,
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        saleId: order.saleId,
        saleNumber: order.saleNumber,
      }
    );
  }

  const orderRef = doc(firestore, "ecommerceOrders", order.id);
  await updateDoc(orderRef, {
    saleCancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  console.log(`✅ Pedido ${order.orderNumber}: venta cancelada y stock devuelto`);
}
