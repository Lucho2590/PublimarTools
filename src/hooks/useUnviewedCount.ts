import { useState, useEffect } from "react";
import { useFirestore } from "reactfire";
import { collection, query, where, getDocs } from "firebase/firestore";
import { TEcommerceOrder } from "@/types/ecommerceOrder";
import { TAbandonedCart } from "@/types/abandonedCart";

export function useUnviewedCount() {
  const firestore = useFirestore();
  const [unviewedCount, setUnviewedCount] = useState(0);

  useEffect(() => {
    const loadUnviewedCount = async () => {
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

        setUnviewedCount(unviewedOrders + unviewedCarts);
      } catch (error) {
        console.error("Error loading unviewed count:", error);
      }
    };

    // Cargar inicialmente
    loadUnviewedCount();

    // Actualizar cada 30 segundos
    const interval = setInterval(loadUnviewedCount, 30000);

    return () => clearInterval(interval);
  }, [firestore]);

  return unviewedCount;
}
