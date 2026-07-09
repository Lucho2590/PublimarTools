import { Firestore, doc, getDoc, setDoc } from "firebase/firestore";
import collections from "@/lib/collections";
import { DEFAULT_ROUNDING, TRoundingConfig } from "@/lib/utils";

/** Doc fijo dentro de la colección `settings` que guarda la config de redondeo. */
export const PRICING_CONFIG_DOC = "pricing";

/** Normaliza los datos crudos de Firestore a un TRoundingConfig válido. */
export const parseRoundingConfig = (data: any): TRoundingConfig => {
  if (!data) return { ...DEFAULT_ROUNDING };
  const multiplo = [10, 50, 100].includes(data.multiplo)
    ? data.multiplo
    : DEFAULT_ROUNDING.multiplo;
  const direccion = data.direccion === "arriba" ? "arriba" : "cercano";
  const terminacion = ["ninguna", "90", "99", "00"].includes(data.terminacion)
    ? data.terminacion
    : "ninguna";
  return { multiplo, direccion, terminacion };
};

/** Lee la config global de redondeo. Si no existe, devuelve la config por defecto. */
export async function getRoundingConfig(
  firestore: Firestore
): Promise<TRoundingConfig> {
  try {
    const snap = await getDoc(
      doc(firestore, collections.SETTINGS, PRICING_CONFIG_DOC)
    );
    return snap.exists() ? parseRoundingConfig(snap.data()) : { ...DEFAULT_ROUNDING };
  } catch (error) {
    console.error("Error leyendo config de redondeo:", error);
    return { ...DEFAULT_ROUNDING };
  }
}

/** Guarda la config global de redondeo. */
export async function saveRoundingConfig(
  firestore: Firestore,
  config: TRoundingConfig
): Promise<void> {
  await setDoc(
    doc(firestore, collections.SETTINGS, PRICING_CONFIG_DOC),
    config,
    { merge: true }
  );
}
