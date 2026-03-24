import { useState, useEffect, useCallback, useTransition } from "react";
import { useFirestore } from "reactfire";
import { collection, query, where, getDocs } from "firebase/firestore";
import { TEcommerceOrder } from "@/types/ecommerceOrder";
import { TAbandonedCart } from "@/types/abandonedCart";

export function useUnviewedCount() {
  const firestore = useFirestore();
  const [unviewedCount, setUnviewedCount] = useState(0);
  const [, startTransition] = useTransition();

  const loadUnviewedCount = useCallback(async () => {
    try {
      // Contar pedidos no vistos
      const ordersSnap = await getDocs(collection(firestore, "ecommerceOrders"));
      const orders = ordersSnap.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id } as TEcommerceOrder)
      );
      const unviewedOrders = orders.filter((order) => !order.viewed).length;

      // Contar carritos no vistos
      const cartsQuery = query(
        collection(firestore, "abandonedCarts"),
        where("abandoned", "==", true),
        where("converted", "==", false)
      );
      const cartsSnap = await getDocs(cartsQuery);
      const carts = cartsSnap.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id } as TAbandonedCart)
      );
      const unviewedCarts = carts.filter((cart) => !cart.viewed).length;

      // Actualizar en una transición para no bloquear la UI
      startTransition(() => {
        setUnviewedCount(unviewedOrders + unviewedCarts);
      });
    } catch (error) {
      console.error("Error loading unviewed count:", error);
    }
  }, [firestore, startTransition]);

  useEffect(() => {
    // Cargar después de un pequeño delay para no bloquear el render inicial
    const initialTimeout = setTimeout(loadUnviewedCount, 100);

    // Actualizar cada 30 segundos
    const interval = setInterval(loadUnviewedCount, 30000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [loadUnviewedCount]);

  return unviewedCount;
}
