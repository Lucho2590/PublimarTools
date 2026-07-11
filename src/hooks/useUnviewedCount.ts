import { useState, useEffect, useCallback, useTransition } from "react";
import { useFirestore } from "reactfire";
import {
  collection,
  query,
  where,
  getCountFromServer,
} from "firebase/firestore";

export function useUnviewedCount() {
  const firestore = useFirestore();
  const [unviewedCount, setUnviewedCount] = useState(0);
  const [, startTransition] = useTransition();

  const loadUnviewedCount = useCallback(async () => {
    try {
      // Conteo agregado en el servidor (no descarga documentos).
      const unviewedOrdersQuery = query(
        collection(firestore, "ecommerceOrders"),
        where("viewed", "==", false)
      );
      const unviewedCartsQuery = query(
        collection(firestore, "abandonedCarts"),
        where("abandoned", "==", true),
        where("converted", "==", false),
        where("viewed", "==", false)
      );

      // allSettled: si a una le falta el índice compuesto (aún no deployado),
      // la otra sigue contando en vez de anular todo el badge.
      const [ordersRes, cartsRes] = await Promise.allSettled([
        getCountFromServer(unviewedOrdersQuery),
        getCountFromServer(unviewedCartsQuery),
      ]);

      const ordersCount =
        ordersRes.status === "fulfilled" ? ordersRes.value.data().count : 0;
      const cartsCount =
        cartsRes.status === "fulfilled" ? cartsRes.value.data().count : 0;
      const total = ordersCount + cartsCount;

      // Actualizar en una transición para no bloquear la UI
      startTransition(() => {
        setUnviewedCount(total);
      });
    } catch (error) {
      console.error("Error loading unviewed count:", error);
    }
  }, [firestore, startTransition]);

  useEffect(() => {
    // Cargar después de un pequeño delay para no bloquear el render inicial
    const initialTimeout = setTimeout(loadUnviewedCount, 100);

    // Actualizar cada 60 segundos
    const interval = setInterval(loadUnviewedCount, 60000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [loadUnviewedCount]);

  return unviewedCount;
}
