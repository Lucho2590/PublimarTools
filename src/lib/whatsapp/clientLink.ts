// Vincular una conversación de WhatsApp con un cliente ya cargado (lo hace el
// equipo desde el Chat o desde un pedido). Si el bot había creado un cliente
// nuevo para ese número, sus pedidos/órdenes/ventas pasan al cliente elegido y
// el duplicado se borra (soft delete).

import {
  arrayUnion,
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import collections from "@/lib/collections";

export async function linkWhatsappToClient(
  firestore: Firestore,
  args: { waId: string; clientId: string; previousClientId?: string | null; uid?: string | null }
): Promise<{ moved: number; mergedDuplicate: boolean }> {
  const { waId, clientId, previousClientId } = args;
  const targetSnap = await getDoc(doc(firestore, collections.CLIENTS, clientId));
  if (!targetSnap.exists()) throw new Error("No se encontró el cliente");
  const target = targetSnap.data() as any;

  const batch = writeBatch(firestore);
  const link = {
    clientId,
    clientName: target.name ?? null,
    clientCandidates: [],
    clientLinkedBy: "manual",
    clientLinkedAt: serverTimestamp(),
    clientLinkedByUid: args.uid ?? null,
  };
  const contactRef = doc(firestore, collections.WHATSAPP_CONTACTS, waId);
  if ((await getDoc(contactRef)).exists()) batch.update(contactRef, link);
  const sessionRef = doc(firestore, collections.BOT_SESSIONS, waId);
  if ((await getDoc(sessionRef)).exists()) batch.update(sessionRef, { clientId, updatedAt: serverTimestamp() });

  let moved = 0;
  let mergedDuplicate = false;
  if (previousClientId && previousClientId !== clientId) {
    // Lo que quedó a nombre del cliente anterior pasa al elegido.
    for (const col of [collections.WHATSAPP_ORDERS, collections.ORDERS, collections.SALES]) {
      const snap = await getDocs(query(collection(firestore, col), where("clientId", "==", previousClientId)));
      for (const d of snap.docs) {
        batch.update(d.ref, { clientId, clientName: target.name ?? null, updatedAt: serverTimestamp() });
        moved++;
      }
    }
    const prevRef = doc(firestore, collections.CLIENTS, previousClientId);
    const prevSnap = await getDoc(prevRef);
    const prev = prevSnap.data() as any;
    if (prevSnap.exists() && prev?.source === "whatsapp_bot" && !prev?.deleted) {
      // Duplicado del bot: se une al elegido (etiquetas y teléfono si faltaba) y se borra.
      const extra: Record<string, any> = { updatedAt: serverTimestamp() };
      if (Array.isArray(prev.tags) && prev.tags.length) extra.tags = arrayUnion(...prev.tags);
      if (!target.phone && prev.phone) extra.phone = prev.phone;
      batch.update(doc(firestore, collections.CLIENTS, clientId), extra);
      batch.update(prevRef, { deleted: true, deletedAt: serverTimestamp(), mergedInto: clientId });
      mergedDuplicate = true;
    }
  }
  await batch.commit();
  return { moved, mergedDuplicate };
}
