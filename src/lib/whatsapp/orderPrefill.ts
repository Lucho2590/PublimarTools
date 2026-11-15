// Pasar un pedido del agente de WhatsApp a venta u orden de trabajo: las pantallas
// de nueva venta / nueva orden leen ?fromWhatsapp=<id> y se precargan con esto.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { doc, Firestore, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import collections from "@/lib/collections";
import { EWhatsappOrderStatus, TWhatsappOrder } from "@/types/whatsapp";

/** Pedido de WhatsApp indicado en ?fromWhatsapp= (null si no vino de ahí). */
export function useWhatsappOrderPrefill(firestore: Firestore) {
  const params = useSearchParams();
  const id = params.get("fromWhatsapp");
  const [order, setOrder] = useState<TWhatsappOrder | null>(null);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getDoc(doc(firestore, collections.WHATSAPP_ORDERS, id))
      .then((snap) => alive && setOrder(snap.exists() ? ({ id: snap.id, ...snap.data() } as TWhatsappOrder) : null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [firestore, id]);

  return { order, loading };
}

/** Texto de la personalizada para usar como ítem manual. */
export function customOrderDescription(o: TWhatsappOrder): string {
  const d = o.customDetails;
  if (!d) return "";
  return [
    d.size && `Medida ${d.size}`,
    d.quantity != null && `${d.quantity} u.`,
    d.whenText && `Para: ${d.whenText}`,
    d.leadTime && `Plazo: ${d.leadTime}`,
    d.design && `Diseño: ${d.design}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Entrega + origen, para las notas de la venta / orden. */
export function whatsappOrderNote(o: TWhatsappOrder): string {
  const dl = o.delivery;
  const delivery = !dl
    ? null
    : dl.method === "pickup"
      ? "Retira en el local"
      : dl.method === "courier"
        ? "Mensajero"
        : `Envío${[dl.address, dl.place].filter(Boolean).length ? `: ${[dl.address, dl.place].filter(Boolean).join(", ")}` : ""}`;
  return [`Pedido WhatsApp ${o.orderNumber}${o.phone ? ` (+${o.phone})` : ""}`, delivery].filter(Boolean).join(" · ");
}

/** Deja el pedido como "Procesado" con el link a lo que se creó. */
export async function markWhatsappOrderProcessed(
  firestore: Firestore,
  whatsappOrderId: string,
  target: { type: "sale" | "order"; id: string; number?: string | null },
  uid?: string | null
): Promise<void> {
  await updateDoc(doc(firestore, collections.WHATSAPP_ORDERS, whatsappOrderId), {
    status: EWhatsappOrderStatus.PROCESSED,
    convertedTo: { ...target, number: target.number ?? null, at: serverTimestamp(), by: uid ?? null },
    updatedAt: serverTimestamp(),
  });
}
