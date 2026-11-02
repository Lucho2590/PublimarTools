// Códigos y textos de ARCA compartidos entre el servidor (emisión) y la UI
// (diálogo, PDF). Sin dependencias de Node: se importa desde el cliente.

import { EClientTaxCondition } from "@/types/client";
import type { TArcaKind, TArcaLetra } from "@/types/arca";

export const CBTE_TIPO = {
  FACTURA_A: 1,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_CREDITO_B: 8,
} as const;

export const DOC_TIPO = {
  CUIT: 80,
  DNI: 96,
  CONSUMIDOR_FINAL: 99,
} as const;

/** Alícuota de IVA (FEParamGetTiposIva): 5 = 21%. */
export const IVA_21 = { id: 5, rate: 21 } as const;

/** Productos. Banderas no factura servicios (no exige fechas de servicio). */
export const CONCEPTO_PRODUCTOS = 1;

export const CONDICION_IVA_EMISOR = "IVA Responsable Inscripto";

export function cbteTipoFor(letra: TArcaLetra, kind: TArcaKind): number {
  if (letra === "A") return kind === "nc" ? CBTE_TIPO.NOTA_CREDITO_A : CBTE_TIPO.FACTURA_A;
  return kind === "nc" ? CBTE_TIPO.NOTA_CREDITO_B : CBTE_TIPO.FACTURA_B;
}

export function cbteTipoLabel(cbteTipo: number): string {
  switch (cbteTipo) {
    case CBTE_TIPO.FACTURA_A:
      return "Factura A";
    case CBTE_TIPO.NOTA_CREDITO_A:
      return "Nota de Crédito A";
    case CBTE_TIPO.FACTURA_B:
      return "Factura B";
    case CBTE_TIPO.NOTA_CREDITO_B:
      return "Nota de Crédito B";
    default:
      return `Comprobante ${cbteTipo}`;
  }
}

export function docTipoLabel(docTipo: number): string {
  if (docTipo === DOC_TIPO.CUIT) return "CUIT";
  if (docTipo === DOC_TIPO.DNI) return "DNI";
  return "Consumidor Final";
}

export function formatNumeroComprobante(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(5, "0")}-${String(numero).padStart(8, "0")}`;
}

// Leyendas obligatorias impresas en el comprobante.
/** RG 5003/2021: Factura A emitida a un monotributista. */
export const LEYENDA_MONOTRIBUTO =
  "El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618";
/** RG 5614/2024: Factura B (se completa con el IVA contenido en el PDF). */
export const LEYENDA_TRANSPARENCIA = "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)";

type TCondicionFiscal = {
  label: string;
  letra: TArcaLetra;
  /** CondicionIVAReceptorId (FEParamGetCondicionIvaReceptor). */
  condicionIvaReceptorId: number;
  /** Texto impreso como "Condición frente al IVA" del receptor. */
  printLabel: string;
  /** La clase A exige CUIT del receptor. */
  requiresCuit: boolean;
};

export const CONDICION_FISCAL: Record<EClientTaxCondition, TCondicionFiscal> = {
  [EClientTaxCondition.IVA_INSCRIPTO]: {
    label: "IVA Inscripto",
    letra: "A",
    condicionIvaReceptorId: 1,
    printLabel: "IVA Responsable Inscripto",
    requiresCuit: true,
  },
  [EClientTaxCondition.MONOTRIBUTO]: {
    label: "Monotributo",
    letra: "A",
    condicionIvaReceptorId: 6,
    printLabel: "Responsable Monotributo",
    requiresCuit: true,
  },
  [EClientTaxCondition.IVA_EXENTO]: {
    label: "IVA Exento",
    letra: "B",
    condicionIvaReceptorId: 4,
    printLabel: "IVA Sujeto Exento",
    requiresCuit: false,
  },
  [EClientTaxCondition.IVA_NO_ALCANZADO]: {
    label: "IVA No Alcanzado",
    letra: "B",
    condicionIvaReceptorId: 15,
    printLabel: "IVA No Alcanzado",
    requiresCuit: false,
  },
  [EClientTaxCondition.CONSUMIDOR_FINAL]: {
    label: "Consumidor Final",
    letra: "B",
    condicionIvaReceptorId: 5,
    printLabel: "Consumidor Final",
    requiresCuit: false,
  },
};

export function leyendasFor(condicion: EClientTaxCondition): string[] {
  if (condicion === EClientTaxCondition.MONOTRIBUTO) return [LEYENDA_MONOTRIBUTO];
  if (CONDICION_FISCAL[condicion].letra === "B") return [LEYENDA_TRANSPARENCIA];
  return [];
}

/** Umbral por defecto de Factura B a CF sin identificar (configurable; confirmar con el contador). */
export const DEFAULT_UMBRAL_CONSUMIDOR_FINAL = 10_000_000;
