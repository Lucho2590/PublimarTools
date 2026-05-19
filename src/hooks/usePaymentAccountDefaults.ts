import { useFirestore, useFirestoreDocData } from "reactfire";
import { doc } from "firebase/firestore";
import { useMemo } from "react";
import collections from "@/lib/collections";
import {
  TPaymentAccountDefaults,
  PAYMENT_ACCOUNT_DEFAULTS_DOC_ID,
} from "@/types/paymentAccountDefaults";
import { EPaymentMethod } from "@/types/sale";
import { EPurchasePaymentMethod } from "@/types/purchase";

/**
 * Lee en tiempo real el documento singleton con el mapeo
 * "forma de pago → cuenta por defecto".
 */
export function usePaymentAccountDefaults() {
  const firestore = useFirestore();

  const ref = useMemo(
    () =>
      doc(
        firestore,
        collections.PAYMENT_ACCOUNT_DEFAULTS,
        PAYMENT_ACCOUNT_DEFAULTS_DOC_ID,
      ),
    [firestore],
  );

  const { status, data } = useFirestoreDocData(ref, { idField: "id" });

  const defaults = useMemo<TPaymentAccountDefaults>(
    () => ((data as TPaymentAccountDefaults) || {}),
    [data],
  );

  return {
    defaults,
    loading: status === "loading",
    error: status === "error",
  };
}

/**
 * Devuelve el accountId por defecto configurado para una forma de pago,
 * o "" si no hay configuración para ese método.
 */
export function getDefaultAccountId(
  defaults: TPaymentAccountDefaults | undefined,
  scope: "sales",
  method: EPaymentMethod,
): string;
export function getDefaultAccountId(
  defaults: TPaymentAccountDefaults | undefined,
  scope: "purchases",
  method: EPurchasePaymentMethod,
): string;
export function getDefaultAccountId(
  defaults: TPaymentAccountDefaults | undefined,
  scope: "sales" | "purchases",
  method: EPaymentMethod | EPurchasePaymentMethod,
): string {
  if (!defaults) return "";
  const map =
    scope === "sales" ? defaults.sales : defaults.purchases;
  return (map as Record<string, string> | undefined)?.[method] || "";
}
