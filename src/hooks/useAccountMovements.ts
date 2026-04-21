import {
  useFirestore,
  useFirestoreCollectionData,
} from "reactfire";
import {
  collection,
  query,
  orderBy,
  where,
  QueryConstraint,
} from "firebase/firestore";
import { useMemo } from "react";
import collections from "@/lib/collections";
import { TAccountMovement } from "@/types/accountMovement";

const COLLECTION_NAME = collections.ACCOUNT_MOVEMENTS;

export interface UseAccountMovementsOptions {
  accountId?: string;
}

export function useAccountMovements(options?: UseAccountMovementsOptions) {
  const firestore = useFirestore();
  const accountId = options?.accountId;

  const movementsCollection = useMemo(
    () => collection(firestore, COLLECTION_NAME),
    [firestore],
  );

  const movementsQuery = useMemo(() => {
    const constraints: QueryConstraint[] = [];
    if (accountId) constraints.push(where("accountId", "==", accountId));
    constraints.push(orderBy("date", "desc"));
    return query(movementsCollection, ...constraints);
  }, [movementsCollection, accountId]);

  const { status, data } = useFirestoreCollectionData(movementsQuery, {
    idField: "id",
  });

  const movements = useMemo(
    () =>
      ((data as TAccountMovement[]) || []).filter(
        (m) => !(m as any).deleted,
      ),
    [data],
  );

  return {
    movements,
    loading: status === "loading",
    error: status === "error",
  };
}
