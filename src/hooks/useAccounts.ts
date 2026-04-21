import {
  useFirestore,
  useFirestoreCollectionData,
  useFirestoreDocData,
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
import {
  TAccount,
  EAccountStatus,
} from "@/types/account";

const COLLECTION_NAME = collections.ACCOUNTS;

export interface UseAccountsOptions {
  includeArchived?: boolean;
}

export function useAccounts(options?: UseAccountsOptions) {
  const firestore = useFirestore();
  const includeArchived = options?.includeArchived ?? false;

  const accountsCollection = useMemo(
    () => collection(firestore, COLLECTION_NAME),
    [firestore],
  );

  const accountsQuery = useMemo(
    () => query(accountsCollection, orderBy("name", "asc")),
    [accountsCollection],
  );

  const { status, data } = useFirestoreCollectionData(accountsQuery, {
    idField: "id",
  });

  const accounts = useMemo(() => {
    const all = ((data as TAccount[]) || []).filter(
      (a) => !(a as any).deleted,
    );
    return includeArchived
      ? all
      : all.filter((a) => a.status !== EAccountStatus.ARCHIVED);
  }, [data, includeArchived]);

  const createAccount = useCallback(
    async (account: Omit<TAccount, "id" | "createdAt" | "updatedAt">) => {
      const docRef = await addDoc(accountsCollection, {
        ...account,
        currentBalance: account.currentBalance ?? account.initialBalance ?? 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    },
    [accountsCollection],
  );

  const updateAccount = useCallback(
    async (
      id: string,
      patch: Partial<Omit<TAccount, "id" | "createdAt" | "updatedAt">>,
    ) => {
      const ref = doc(firestore, COLLECTION_NAME, id);
      await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
    },
    [firestore],
  );

  const archiveAccount = useCallback(
    async (id: string) => {
      const ref = doc(firestore, COLLECTION_NAME, id);
      await updateDoc(ref, {
        status: EAccountStatus.ARCHIVED,
        updatedAt: serverTimestamp(),
      });
    },
    [firestore],
  );

  const restoreAccount = useCallback(
    async (id: string) => {
      const ref = doc(firestore, COLLECTION_NAME, id);
      await updateDoc(ref, {
        status: EAccountStatus.ACTIVE,
        updatedAt: serverTimestamp(),
      });
    },
    [firestore],
  );

  return {
    accounts,
    loading: status === "loading",
    error: status === "error",
    createAccount,
    updateAccount,
    archiveAccount,
    restoreAccount,
  };
}

export function useAccount(id?: string) {
  const firestore = useFirestore();

  const accountRef = useMemo(
    () => (id ? doc(firestore, COLLECTION_NAME, id) : null),
    [firestore, id],
  );

  const { status, data } = useFirestoreDocData(accountRef as any, {
    idField: "id",
  });

  return {
    account: id ? ((data as TAccount) ?? null) : null,
    loading: status === "loading",
    error: status === "error",
  };
}
