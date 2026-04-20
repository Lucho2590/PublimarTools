import {
  useFirestore,
  useFirestoreCollectionData,
} from "reactfire";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { useCallback, useMemo } from "react";
import collections from "@/lib/collections";
import { TOperationalExpense } from "@/types/operationalExpense";

const COLLECTION_NAME = collections.OPERATIONAL_EXPENSES;

export function useOperationalExpenses() {
  const firestore = useFirestore();

  const expensesCollection = useMemo(
    () => collection(firestore, COLLECTION_NAME),
    [firestore],
  );

  const expensesQuery = useMemo(
    () => query(expensesCollection, orderBy("date", "desc")),
    [expensesCollection],
  );

  const { status, data } = useFirestoreCollectionData(expensesQuery, {
    idField: "id",
  });

  const expenses = useMemo(
    () =>
      ((data as TOperationalExpense[]) || []).filter(
        (e) => !(e as any).deleted,
      ),
    [data],
  );

  const createExpense = useCallback(
    async (
      expense: Omit<TOperationalExpense, "id" | "createdAt" | "updatedAt">,
    ) => {
      const docRef = await addDoc(expensesCollection, {
        ...expense,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    },
    [expensesCollection],
  );

  const updateExpense = useCallback(
    async (
      id: string,
      patch: Partial<Omit<TOperationalExpense, "id" | "createdAt" | "updatedAt">>,
    ) => {
      const ref = doc(firestore, COLLECTION_NAME, id);
      await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
    },
    [firestore],
  );

  const softDeleteExpense = useCallback(
    async (id: string) => {
      const ref = doc(firestore, COLLECTION_NAME, id);
      await updateDoc(ref, {
        deleted: true,
        updatedAt: serverTimestamp(),
      });
    },
    [firestore],
  );

  return {
    expenses,
    loading: status === "loading",
    error: status === "error",
    createExpense,
    updateExpense,
    softDeleteExpense,
  };
}
