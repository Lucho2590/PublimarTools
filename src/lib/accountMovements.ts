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

/**
 * Revierte un movimiento ya registrado: ajusta `currentBalance` de la cuenta
 * con el delta inverso y elimina el documento del movimiento. Es idempotente:
 * si el movimiento no existe, no hace nada.
 */
export async function reverseAccountMovement(
  firestore: Firestore,
  movementId: string,
): Promise<void> {
  const movementRef = doc(firestore, collections.ACCOUNT_MOVEMENTS, movementId);

  await runTransaction(firestore, async (tx) => {
    const movSnap = await tx.get(movementRef);
    if (!movSnap.exists()) {
      return; // ya fue eliminado o nunca existió
    }
    const mov = movSnap.data();
    const type = mov.type as EMovementType;
    const amount = Number(mov.amount) || 0;

    const signedDelta =
      type === EMovementType.ADJUSTMENT
        ? amount
        : (isIncomingMovement(type) ? 1 : -1) * Math.abs(amount);

    const accountRef = doc(firestore, collections.ACCOUNTS, mov.accountId);
    const accSnap = await tx.get(accountRef);
    if (accSnap.exists()) {
      const current = Number(accSnap.data().currentBalance) || 0;
      tx.update(accountRef, {
        currentBalance: current - signedDelta,
        updatedAt: serverTimestamp(),
      });
    }

    tx.delete(movementRef);
  });
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number; // positivo
  description: string;
  date?: Date; // default: ahora
  createdBy: string;
}

/**
 * Realiza una transferencia entre dos cuentas de forma atómica:
 * descuenta de la cuenta origen (TRANSFER_OUT) y acredita en la cuenta
 * destino (TRANSFER_IN), enlazando ambos movimientos por
 * `counterpartyAccountId`. Devuelve los ids de ambos movimientos.
 */
export async function transferBetweenAccounts(
  firestore: Firestore,
  input: TransferInput,
): Promise<{ outId: string; inId: string }> {
  const amount = Math.abs(Number(input.amount) || 0);
  if (amount <= 0) {
    throw new Error("El monto debe ser mayor a 0");
  }
  if (input.fromAccountId === input.toAccountId) {
    throw new Error("La cuenta de origen y destino deben ser distintas");
  }

  const fromRef = doc(firestore, collections.ACCOUNTS, input.fromAccountId);
  const toRef = doc(firestore, collections.ACCOUNTS, input.toAccountId);
  const movementsCol = collection(firestore, collections.ACCOUNT_MOVEMENTS);
  const outRef = doc(movementsCol);
  const inRef = doc(movementsCol);

  const movDate = input.date ?? new Date();

  await runTransaction(firestore, async (tx) => {
    // Todas las lecturas antes de las escrituras.
    const fromSnap = await tx.get(fromRef);
    const toSnap = await tx.get(toRef);
    if (!fromSnap.exists()) throw new Error("La cuenta de origen no existe");
    if (!toSnap.exists()) throw new Error("La cuenta de destino no existe");

    const fromBalance = Number(fromSnap.data().currentBalance) || 0;
    const toBalance = Number(toSnap.data().currentBalance) || 0;

    tx.update(fromRef, {
      currentBalance: fromBalance - amount,
      updatedAt: serverTimestamp(),
    });
    tx.update(toRef, {
      currentBalance: toBalance + amount,
      updatedAt: serverTimestamp(),
    });

    const baseDate = Timestamp.fromDate(movDate);
    tx.set(outRef, {
      accountId: input.fromAccountId,
      date: baseDate,
      type: EMovementType.TRANSFER_OUT,
      amount,
      description: input.description,
      sourceType: "manual",
      sourceId: null,
      counterpartyAccountId: input.toAccountId,
      createdBy: input.createdBy,
      createdAt: serverTimestamp(),
    });
    tx.set(inRef, {
      accountId: input.toAccountId,
      date: baseDate,
      type: EMovementType.TRANSFER_IN,
      amount,
      description: input.description,
      sourceType: "manual",
      sourceId: null,
      counterpartyAccountId: input.fromAccountId,
      createdBy: input.createdBy,
      createdAt: serverTimestamp(),
    });
  });

  return { outId: outRef.id, inId: inRef.id };
}
