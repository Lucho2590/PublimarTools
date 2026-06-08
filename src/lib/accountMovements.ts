import {
  Firestore,
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import collections from "@/lib/collections";
import {
  EMovementType,
  TMovementSource,
  isIncomingMovement,
  movementSignedAmount,
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

export interface BatchMovementItem {
  type: EMovementType;
  amount: number; // siempre positivo; el signo lo define `type`
  description: string;
  date: Date;
}

const FIRESTORE_BATCH_LIMIT = 400; // < 500 (límite duro de Firestore) por las dudas

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Crea N movimientos en una sola cuenta y actualiza su `currentBalance` UNA vez
 * por el delta neto, dentro de una transacción (mucho más eficiente que registrar
 * uno por uno). Se usa para importar resúmenes bancarios. Todos los movimientos
 * quedan marcados con `sourceType: "import"` y el `importBatchId` provisto, para
 * poder deshacer la importación entera con `reverseImportBatch`.
 *
 * Devuelve la cantidad de movimientos creados.
 */
export async function registerMovementsBatch(
  firestore: Firestore,
  accountId: string,
  items: BatchMovementItem[],
  opts: { importBatchId: string; createdBy: string },
): Promise<number> {
  if (items.length === 0) return 0;

  const accountRef = doc(firestore, collections.ACCOUNTS, accountId);
  const movementsCol = collection(firestore, collections.ACCOUNT_MOVEMENTS);

  let created = 0;
  // Chunkeamos para no superar el límite de escrituras por transacción.
  for (const group of chunk(items, FIRESTORE_BATCH_LIMIT)) {
    const netDelta = group.reduce(
      (sum, it) =>
        sum +
        movementSignedAmount({ type: it.type, amount: Math.abs(it.amount) }),
      0,
    );

    await runTransaction(firestore, async (tx) => {
      const snap = await tx.get(accountRef);
      if (!snap.exists()) throw new Error("La cuenta no existe");
      const current = Number(snap.data().currentBalance) || 0;
      tx.update(accountRef, {
        currentBalance: current + netDelta,
        updatedAt: serverTimestamp(),
      });

      group.forEach((it) => {
        const ref = doc(movementsCol);
        tx.set(ref, {
          accountId,
          date: Timestamp.fromDate(it.date),
          type: it.type,
          amount: Math.abs(it.amount),
          description: it.description,
          sourceType: "import" as TMovementSource,
          sourceId: null,
          counterpartyAccountId: null,
          importBatchId: opts.importBatchId,
          createdBy: opts.createdBy,
          createdAt: serverTimestamp(),
        });
      });
    });

    created += group.length;
  }

  return created;
}

/**
 * Deshace una importación completa: busca todos los movimientos con el
 * `importBatchId` dado, revierte el delta neto en cada cuenta afectada y elimina
 * los documentos. Idempotente. Devuelve la cantidad de movimientos revertidos.
 */
export async function reverseImportBatch(
  firestore: Firestore,
  importBatchId: string,
): Promise<number> {
  const movementsCol = collection(firestore, collections.ACCOUNT_MOVEMENTS);
  const snap = await getDocs(
    query(movementsCol, where("importBatchId", "==", importBatchId)),
  );
  if (snap.empty) return 0;

  // Agrupamos por cuenta para ajustar cada saldo una sola vez.
  const byAccount = new Map<string, { ids: string[]; delta: number }>();
  snap.docs.forEach((d) => {
    const m = d.data() as any;
    const entry = byAccount.get(m.accountId) || { ids: [], delta: 0 };
    entry.ids.push(d.id);
    entry.delta += movementSignedAmount({
      type: m.type,
      amount: Number(m.amount) || 0,
    });
    byAccount.set(m.accountId, entry);
  });

  let reversed = 0;
  for (const [accountId, { ids, delta }] of Array.from(byAccount.entries())) {
    const accountRef = doc(firestore, collections.ACCOUNTS, accountId);
    const groups = chunk(ids, FIRESTORE_BATCH_LIMIT);
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      // El ajuste de saldo (restar el delta neto de la cuenta) se hace una sola
      // vez por cuenta, en su primer chunk; los demás chunks sólo borran docs.
      const applyBalance = gi === 0;
      await runTransaction(firestore, async (tx) => {
        if (applyBalance) {
          const accSnap = await tx.get(accountRef);
          if (accSnap.exists()) {
            const current = Number(accSnap.data().currentBalance) || 0;
            tx.update(accountRef, {
              currentBalance: current - delta,
              updatedAt: serverTimestamp(),
            });
          }
        }
        group.forEach((id) =>
          tx.delete(doc(firestore, collections.ACCOUNT_MOVEMENTS, id)),
        );
      });
      reversed += group.length;
    }
  }

  return reversed;
}
