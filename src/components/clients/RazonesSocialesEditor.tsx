"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CuitInput } from "@/components/cuit-input";
import { ArcaPadronBadge, ValidarCuitButton, padronSnapshot } from "@/components/arca/ValidarCuitButton";
import { taxConditionOptions } from "@/lib/taxCondition";
import { EClientTaxCondition, TRazonSocial } from "@/types/client";

export const emptyRazonSocial = (): TRazonSocial => ({
  razonSocial: "",
  fantasyName: "",
  cuit: "",
  taxCondition: undefined,
  domicilio: "",
});

/**
 * Limpia la lista antes de guardar: descarta las vacías y los campos sin valor
 * (Firestore no acepta `undefined`).
 */
export function cleanRazonesSociales(list: TRazonSocial[]): TRazonSocial[] {
  return list
    .filter((rs) => rs.razonSocial.trim() !== "")
    .map((rs) => ({
      razonSocial: rs.razonSocial.trim(),
      ...(rs.fantasyName?.trim() ? { fantasyName: rs.fantasyName.trim() } : {}),
      ...(rs.cuit?.trim() ? { cuit: rs.cuit.trim() } : {}),
      ...(rs.taxCondition ? { taxCondition: rs.taxCondition } : {}),
      ...(rs.domicilio?.trim() ? { domicilio: rs.domicilio.trim() } : {}),
      ...(rs.arcaPadron ? { arcaPadron: rs.arcaPadron } : {}),
    }));
}

type Props = {
  value: TRazonSocial[];
  onChange: (next: TRazonSocial[]) => void;
};

/** Razones sociales adicionales de un cliente (otros CUIT a los que se le factura). */
export function RazonesSocialesEditor({ value, onChange }: Props) {
  const update = (index: number, patch: Partial<TRazonSocial>) => {
    const next = [...value];
    next[index] = { ...next[index], ...patch };
    // Si cambia el CUIT, la validación anterior deja de aplicar.
    if (patch.cuit !== undefined && patch.cuit !== value[index].cuit) delete next[index].arcaPadron;
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {value.map((rs, index) => (
        <div key={index} className="border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-slate-600">Razón social {index + 2}</span>
            <Button
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>CUIT</Label>
              <div className="flex gap-2">
                <CuitInput value={rs.cuit} onValueChange={(digits) => update(index, { cuit: digits })} />
                <ValidarCuitButton
                  cuit={rs.cuit}
                  size="default"
                  onResult={(r) =>
                    update(index, {
                      razonSocial: r.razonSocial || rs.razonSocial,
                      domicilio: r.domicilio || rs.domicilio,
                      taxCondition: r.condicion,
                      arcaPadron: padronSnapshot(r),
                    })
                  }
                />
              </div>
              <ArcaPadronBadge snapshot={rs.arcaPadron} />
            </div>
            <div className="space-y-2">
              <Label>Razón social *</Label>
              <Input
                value={rs.razonSocial}
                onChange={(e) => update(index, { razonSocial: e.target.value })}
                placeholder="Razón social..."
              />
            </div>
            <div className="space-y-2">
              <Label>Condición frente al IVA</Label>
              <Select
                value={rs.taxCondition ?? "none"}
                onValueChange={(v) =>
                  update(index, { taxCondition: v === "none" ? undefined : (v as EClientTaxCondition) })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar condición fiscal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin definir</SelectItem>
                  {taxConditionOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label} · {opt.invoice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nombre de fantasía</Label>
              <Input
                value={rs.fantasyName || ""}
                onChange={(e) => update(index, { fantasyName: e.target.value })}
                placeholder="Nombre de fantasía..."
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Domicilio fiscal</Label>
              <Input
                value={rs.domicilio || ""}
                onChange={(e) => update(index, { domicilio: e.target.value })}
                placeholder="Se completa al validar en ARCA"
              />
            </div>
          </div>
        </div>
      ))}

      <Button type="button" onClick={() => onChange([...value, emptyRazonSocial()])} variant="outline" size="sm">
        <Plus className="h-4 w-4 mr-1.5" />
        Agregar otra razón social
      </Button>
    </div>
  );
}
