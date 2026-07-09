import { doc, updateDoc, serverTimestamp, Firestore } from "firebase/firestore";

/**
 * Soft delete: marca un documento como eliminado sin borrarlo de Firestore.
 * Guarda `deleted: true` y `deletedAt: timestamp`.
 */
export async function softDelete(
  firestore: Firestore,
  collectionName: string,
  documentId: string
) {
  const docRef = doc(firestore, collectionName, documentId);
  await updateDoc(docRef, {
    deleted: true,
    deletedAt: serverTimestamp(),
  });
}

/**
 * Devuelve `true` si el documento está marcado como eliminado (soft delete).
 * Los documentos viejos sin el campo `deleted` se tratan como activos.
 */
export const isDeleted = (item: unknown): boolean =>
  !!(item as { deleted?: boolean } | null)?.deleted;

/**
 * Filtra una lista dejando solo los documentos activos (no eliminados).
 * Usar en todo punto de lectura para que un producto/entidad con soft delete
 * no aparezca en ninguna parte de la app.
 */
export function filterActive<T>(items: T[] | undefined | null): T[] {
  return (items ?? []).filter((item) => !isDeleted(item));
}
