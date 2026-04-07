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
