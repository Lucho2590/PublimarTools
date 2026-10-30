"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, where } from "firebase/firestore";
import { toast } from "sonner";
import collections from "@/lib/collections";

/**
 * Lo pendiente de WhatsApp para el equipo: charlas que el bot derivó y pedidos
 * sin confirmar. Alimenta los contadores del menú y avisa cuando entra algo
 * nuevo (cartel + sonido + notificación del sistema si está permitida).
 */
type TAttention = { attention: number; pendingOrders: number };

const AttentionContext = createContext<TAttention>({ attention: 0, pendingOrders: 0 });

export const useWhatsappAttention = () => useContext(AttentionContext);

/** Pide permiso para notificaciones del sistema (tiene que ser con un click). */
export async function enableSystemNotifications(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

/** "Ding" corto con Web Audio (sin archivos de sonido). */
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.4);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Sin audio (permiso del navegador): el cartel alcanza.
  }
}

function systemNotify(title: string, body: string, href: string, onClick: (href: string) => void) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, tag: href, icon: "/favicon.ico" });
    n.onclick = () => {
      window.focus();
      onClick(href);
      n.close();
    };
  } catch {
    // Algunos navegadores (Safari iOS) no permiten new Notification fuera de un service worker.
  }
}

export function WhatsappAttentionProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const router = useRouter();

  const attentionQuery = useMemo(
    () => query(collection(firestore, collections.BOT_SESSIONS), where("needsAttention", "==", true)),
    [firestore]
  );
  const ordersQuery = useMemo(
    () => query(collection(firestore, collections.WHATSAPP_ORDERS), where("status", "==", "pending")),
    [firestore]
  );
  const { data: sessions } = useFirestoreCollectionData(attentionQuery, { idField: "id" });
  const { data: orders } = useFirestoreCollectionData(ordersQuery, { idField: "id" });

  // Lo que ya estaba al abrir la app no avisa; solo lo que entra después.
  const seen = useRef<{ sessions: Set<string> | null; orders: Set<string> | null }>({
    sessions: null,
    orders: null,
  });

  useEffect(() => {
    if (!sessions) return;
    const ids = new Set(sessions.map((s: any) => `${s.id}:${s.handoffAt?.seconds ?? ""}`));
    if (seen.current.sessions) {
      for (const s of sessions as any[]) {
        const key = `${s.id}:${s.handoffAt?.seconds ?? ""}`;
        if (seen.current.sessions.has(key)) continue;
        const who = s.customerName || (s.phone ? `+${s.phone}` : "Un cliente");
        const reason = s.handoffReason || "Necesita atención";
        const href = `/publimar/whatsapp/atender?c=${encodeURIComponent(s.id)}`;
        playChime();
        toast(`💬 ${who} necesita atención`, {
          description: reason,
          duration: 15000,
          action: { label: "Atender", onClick: () => router.push(href) },
        });
        systemNotify(`💬 ${who} necesita atención`, reason, href, (h) => router.push(h));
      }
    }
    seen.current.sessions = ids;
  }, [sessions, router]);

  useEffect(() => {
    if (!orders) return;
    const ids = new Set(orders.map((o: any) => o.id as string));
    if (seen.current.orders) {
      for (const o of orders as any[]) {
        if (seen.current.orders.has(o.id)) continue;
        const custom = o.kind === "custom_quote";
        const title = custom ? `🎨 Consulta a cotizar ${o.orderNumber}` : `🛒 Nuevo pedido ${o.orderNumber}`;
        const body = `${o.clientName || o.customerName || "Cliente"}${o.total ? ` · $${Math.round(o.total).toLocaleString("es-AR")}` : ""}`;
        const href = "/publimar/whatsapp/pedidos";
        playChime();
        toast(title, {
          description: body,
          duration: 15000,
          action: { label: "Ver", onClick: () => router.push(href) },
        });
        systemNotify(title, body, href, (h) => router.push(h));
      }
    }
    seen.current.orders = ids;
  }, [orders, router]);

  const value = useMemo(
    () => ({ attention: sessions?.length || 0, pendingOrders: orders?.length || 0 }),
    [sessions, orders]
  );
  return <AttentionContext.Provider value={value}>{children}</AttentionContext.Provider>;
}
