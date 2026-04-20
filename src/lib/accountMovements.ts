import {
  Firestore,
  addDoc,
  collection,
  doc,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import collections from "@/lib/collections";
import {
  EMovementType,
  TMovementSource,
  isIncomingMovement,
} from "@/types/accountMovement";

export interface RegisterMovementInput {
  accountId: string;
  type: EMovementType;
  amount: number;          // siempre positivo
  description: string;
  date?: Date;             // default: ahora
  sourceType?: TMovementSource;
  sourceId?: string;
  counterpartyAccountId?: string;
  createdBy: string;
}

/**
 * Registra un movimiento en `accountMovements` y actualiza `currentBalance`
 * de la cuenta de manera atómica. Para ADJUSTMENT, `amount` puede ser negativo.
 */
export async function registerAccountMovement(
  firestore: Firestore,
  input: RegisterMovementInput,
): Promise<string> {
  const accountRef = doc(firestore, collections.ACCOUNTS, input.accountId);
  const movementsCol = collection(firestore, collections.ACCOUNT_MOVEMENTS);

  const signedDelta =
    input.type === EMovementType.ADJUSTMENT
      ? input.amount
      : (isIncomingMovement(input.type) ? 1 : -1) * Math.abs(input.amount);

  // Actualizamos el saldo en transacción para evitar carreras.
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(accountRef);
    if (!snap.exists()) {
      throw new Error("La cuenta no existe");
    }
    const current = Number(snap.data().currentBalance) || 0;
    tx.update(accountRef, {
      currentBalance: current + signedDelta,
      updatedAt: serverTimestamp(),
    });
  });

  const movDate = input.date ?? new Date();
  const docRef = await addDoc(movementsCol, {
    accountId: input.accountId,
    date: Timestamp.fromDate(movDate),
    type: input.type,
    amount: Math.abs(input.amount),
    description: input.description,
    sourceType: input.sourceType ?? "manual",
    sourceId: input.sourceId ?? null,
    counterpartyAccountId: input.counterpartyAccountId ?? null,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}
