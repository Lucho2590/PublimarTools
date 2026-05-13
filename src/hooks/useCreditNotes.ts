import { useMemo } from "react";
import {
  useFirestore,
  useFirestoreCollectionData,
} from "reactfire";
import {
  collection,
  orderBy,
  query,
  where,
  QueryConstraint,
} from "firebase/firestore";
import collections from "@/lib/collections";
import {
  ECreditNoteStatus,
  TCreditNote,
} from "@/types/creditNote";

const COLLECTION_NAME = collections.CREDIT_NOTES;

export interface UseCreditNotesOptions {
  clientId?: string;
  status?: ECreditNoteStatus;
}

function notExpired(n: TCreditNote, now: Date): boolean {
  const exp = (n as any).expiresAt;
  if (!exp) return true;
  const d = typeof exp?.toDate === "function" ? exp.toDate() : new Date(exp);
  return d >= now;
}

export function useCreditNotes(options?: UseCreditNotesOptions) {
  const firestore = useFirestore();
  const clientId = options?.clientId;
  const status = options?.status;

  const creditNotesCollection = useMemo(
    () => collection(firestore, COLLECTION_NAME),
    [firestore],
  );

  const creditNotesQuery = useMemo(() => {
    const constraints: QueryConstraint[] = [];
    if (clientId) constraints.push(where("clientId", "==", clientId));
    if (status) constraints.push(where("status", "==", status));
    constraints.push(orderBy("createdAt", "desc"));
    return query(creditNotesCollection, ...constraints);
  }, [creditNotesCollection, clientId, status]);

  const { status: queryStatus, data } = useFirestoreCollectionData(
    creditNotesQuery,
    { idField: "id" },
  );

  const notes = useMemo(
    () =>
      ((data as TCreditNote[]) || []).filter((n) => !(n as any).deleted),
    [data],
  );

  return {
    notes,
    loading: queryStatus === "loading",
    error: queryStatus === "error",
  };
}

/**
 * Devuelve las notas AVAILABLE no vencidas de un cliente y el saldo total disponible.
 * Usa suscripción onSnapshot vía reactfire.
 */
export function useClientAvailableCredit(clientId: string | undefined | null) {
  const firestore = useFirestore();

  const safeId = clientId || "__none__";

  const creditNotesCollection = useMemo(
    () => collection(firestore, COLLECTION_NAME),
    [firestore],
  );

  const q = useMemo(
    () =>
      query(
        creditNotesCollection,
        where("clientId", "==", safeId),
        where("status", "==", ECreditNoteStatus.AVAILABLE),
      ),
    [creditNotesCollection, safeId],
  );

  const { status, data } = useFirestoreCollectionData(q, { idField: "id" });

  const { notes, total } = useMemo(() => {
    if (!clientId) return { notes: [] as TCreditNote[], total: 0 };
    const now = new Date();
    const valid = ((data as TCreditNote[]) || []).filter(
      (n) => !(n as any).deleted && notExpired(n, now),
    );
    const sum = valid.reduce((acc, n) => acc + (Number(n.amount) || 0), 0);
    return { notes: valid, total: sum };
  }, [data, clientId]);

  return {
    notes,
    total,
    loading: status === "loading",
    error: status === "error",
  };
}

/**
 * Hook para listar todas las notas AVAILABLE (transversal) y agruparlas por cliente.
 * Útil para mostrar badges de "saldo a favor" en listados de clientes.
 */
export function useAvailableCreditByClient() {
  const firestore = useFirestore();
  const col = useMemo(
    () => collection(firestore, COLLECTION_NAME),
    [firestore],
  );
  const q = useMemo(
    () =>
      query(col, where("status", "==", ECreditNoteStatus.AVAILABLE)),
    [col],
  );
  const { status, data } = useFirestoreCollectionData(q, { idField: "id" });

  const byClient = useMemo(() => {
    const map = new Map<string, number>();
    if (!data) return map;
    const now = new Date();
    (data as TCreditNote[]).forEach((n) => {
      if ((n as any).deleted) return;
      if (!notExpired(n, now)) return;
      const prev = map.get(n.clientId) || 0;
      map.set(n.clientId, prev + (Number(n.amount) || 0));
    });
    return map;
  }, [data]);

  return {
    byClient,
    loading: status === "loading",
    error: status === "error",
  };
}
