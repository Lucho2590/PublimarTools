import { useMemo } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import collections from "@/lib/collections";
import { useAccounts } from "@/hooks/useAccounts";
import { useOperationalExpenses } from "@/hooks/useOperationalExpenses";
import { TSale } from "@/types/sale";
import { TBilling } from "@/types/billing";
import { TPurchase } from "@/types/purchase";
import {
  ExpenseEntry,
  RevenueEntry,
  normalizeExpenses,
  normalizeRevenue,
} from "@/lib/rentabilidad";

export interface UseRentabilidadOptions {
  from: Date;
  to: Date;
}

export interface UseRentabilidadResult {
  revenue: RevenueEntry[];
  expenses: ExpenseEntry[];
  sales: TSale[];
  billings: TBilling[];
  purchases: TPurchase[];
  accounts: ReturnType<typeof useAccounts>["accounts"];
  loading: boolean;
}

/** Devuelve el final del día para que el rango incluya la jornada completa de `to`. */
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Orquesta las queries del módulo de Rentabilidad para un rango de fechas y
 * devuelve el ledger normalizado (ingresos/gastos) más los datos crudos que
 * algunas subpáginas necesitan (ventas para ranking de productos, cuentas).
 *
 * Estrategia de performance:
 *  - Ventas: filtro por `createdAt` en Firestore (Timestamp).
 *  - Compras: filtro por `date` (string YYYY-MM-DD) con range query lexicográfica.
 *  - Facturaciones: se traen completas (volumen bajo) y se filtran los pagos en cliente.
 *  - Gastos operativos / cuentas: hooks existentes (orden y filtros en cliente).
 */
export function useRentabilidad({
  from,
  to,
}: UseRentabilidadOptions): UseRentabilidadResult {
  const firestore = useFirestore();
  const { accounts, loading: accountsLoading } = useAccounts({
    includeArchived: true,
  });
  const { expenses: operationalExpenses, loading: opLoading } =
    useOperationalExpenses();

  const fromEnd = useMemo(() => from, [from]);
  const toEnd = useMemo(() => endOfDay(to), [to]);

  // Ventas — filtradas por createdAt en el servidor.
  const salesQuery = useMemo(
    () =>
      query(
        collection(firestore, collections.SALES),
        where("createdAt", ">=", Timestamp.fromDate(fromEnd)),
        where("createdAt", "<=", Timestamp.fromDate(toEnd)),
        orderBy("createdAt", "desc"),
      ),
    [firestore, fromEnd, toEnd],
  );
  const { status: salesStatus, data: salesData } = useFirestoreCollectionData(
    salesQuery,
    { idField: "id" },
  );

  // Compras — filtradas por date string en el servidor.
  const fromYMD = useMemo(() => toYMD(from), [from]);
  const toYMD_ = useMemo(() => toYMD(to), [to]);
  const purchasesQuery = useMemo(
    () =>
      query(
        collection(firestore, collections.PURCHASES),
        where("date", ">=", fromYMD),
        where("date", "<=", toYMD_),
        orderBy("date", "desc"),
      ),
    [firestore, fromYMD, toYMD_],
  );
  const { status: purchasesStatus, data: purchasesData } =
    useFirestoreCollectionData(purchasesQuery, { idField: "id" });

  // Facturaciones VP — completas, se filtran los pagos en cliente.
  const billingsQuery = useMemo(
    () => query(collection(firestore, collections.BILLINGS)),
    [firestore],
  );
  const { status: billingsStatus, data: billingsData } =
    useFirestoreCollectionData(billingsQuery, { idField: "id" });

  const sales = (salesData as TSale[]) || [];
  const billings = (billingsData as TBilling[]) || [];
  const purchases = (purchasesData as TPurchase[]) || [];

  const revenue = useMemo(
    () => normalizeRevenue(sales, billings, fromEnd, toEnd),
    [sales, billings, fromEnd, toEnd],
  );

  const expenses = useMemo(
    () => normalizeExpenses(purchases, operationalExpenses, fromEnd, toEnd),
    [purchases, operationalExpenses, fromEnd, toEnd],
  );

  const loading =
    salesStatus === "loading" ||
    purchasesStatus === "loading" ||
    billingsStatus === "loading" ||
    accountsLoading ||
    opLoading;

  return {
    revenue,
    expenses,
    sales,
    billings,
    purchases,
    accounts,
    loading,
  };
}
