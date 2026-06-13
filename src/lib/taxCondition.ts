import { EClientTaxCondition } from "@/types/client";

// Opciones de condición fiscal (frente al IVA) con su tipo de factura asociado.
export const taxConditionOptions: {
  value: EClientTaxCondition;
  label: string;
  invoice: string;
}[] = [
  {
    value: EClientTaxCondition.IVA_INSCRIPTO,
    label: "IVA Inscripto",
    invoice: "Factura A",
  },
  {
    value: EClientTaxCondition.IVA_EXENTO,
    label: "IVA Exento",
    invoice: "Factura B",
  },
  {
    value: EClientTaxCondition.IVA_NO_ALCANZADO,
    label: "IVA No Alcanzado",
    invoice: "Factura B",
  },
  {
    value: EClientTaxCondition.CONSUMIDOR_FINAL,
    label: "Consumidor Final",
    invoice: "Factura B",
  },
];

// Mapeo con etiqueta, tipo de factura y estilos de badge por condición fiscal.
export const taxConditionInfo: Record<
  EClientTaxCondition,
  { label: string; invoice: string; className: string }
> = {
  [EClientTaxCondition.IVA_INSCRIPTO]: {
    label: "IVA Inscripto",
    invoice: "Factura A",
    className: "bg-blue-50 text-blue-700 border border-blue-200",
  },
  [EClientTaxCondition.IVA_EXENTO]: {
    label: "IVA Exento",
    invoice: "Factura B",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  [EClientTaxCondition.IVA_NO_ALCANZADO]: {
    label: "IVA No Alcanzado",
    invoice: "Factura B",
    className: "bg-slate-50 text-slate-700 border border-slate-200",
  },
  [EClientTaxCondition.CONSUMIDOR_FINAL]: {
    label: "Consumidor Final",
    invoice: "Factura B",
    className: "bg-violet-50 text-violet-700 border border-violet-200",
  },
};

// Devuelve la etiqueta legible de una condición fiscal, o "-" si no está definida.
export function getTaxConditionLabel(value?: EClientTaxCondition | null): string {
  if (!value) return "-";
  return taxConditionInfo[value]?.label ?? "-";
}
