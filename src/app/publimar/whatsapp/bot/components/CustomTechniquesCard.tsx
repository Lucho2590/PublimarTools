"use client";

import { useEffect, useMemo, useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import collections from "@/lib/collections";
import { filterActive } from "@/lib/softDelete";
import { BOT_CONFIG_DOC_ID, DEFAULT_CUSTOM_TECHNIQUES } from "@/lib/bot/defaults";
import { normalizeText } from "@/lib/bot/normalize";
import { parseSize } from "@/lib/bot/entities";
import { TBotCustomTechnique, TBotSizeRule } from "@/types/bot";

const NO_PRODUCT = "_none";

/**
 * Técnicas de bandera personalizada: el bot ofrece solo las que llegan a la
 * fecha (días mínimos) y aplican a la cantidad (mínimo). Con producto vinculado
 * da precio del catálogo; sin producto queda "a cotizar" por el equipo.
 */
export function CustomTechniquesCard() {
  const firestore = useFirestore();
  const productsRef = useMemo(() => collection(firestore, collections.PRODUCTS), [firestore]);
  const { data } = useFirestoreCollectionData(productsRef, { idField: "id" });
  const products = useMemo(
    () =>
      filterActive((data as { id: string; name?: string }[]) || [])
        .filter((p) => p.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "es")),
    [data]
  );
  const [rows, setRows] = useState<TBotCustomTechnique[] | null>(null);

  useEffect(() => {
    getDoc(doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID)).then((snap) => {
      const saved = (snap.data()?.customTechniques || []) as TBotCustomTechnique[];
      setRows(saved.length ? saved : DEFAULT_CUSTOM_TECHNIQUES);
    });
  }, [firestore]);

  const update = (idx: number, patch: Partial<TBotCustomTechnique>) =>
    setRows((prev) => (prev || []).map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const save = async () => {
    const customTechniques = (rows || [])
      .filter((r) => r.label.trim())
      .map((r) => ({
        ...r,
        id: r.id || normalizeText(r.label).replace(/\s+/g, "_").slice(0, 30),
        label: r.label.trim(),
        description: r.description.trim(),
        minDays: Math.max(0, Number(r.minDays) || 0),
        maxDays: Math.max(Number(r.minDays) || 0, Number(r.maxDays ?? r.minDays) || 0),
        sizeRules: (r.sizeRules || [])
          .filter((x) => parseSize(x.upTo))
          .map((x) => ({
            upTo: x.upTo.trim(),
            minDays: Math.max(0, Number(x.minDays) || 0),
            maxDays: Math.max(Number(x.minDays) || 0, Number(x.maxDays) || 0),
          })),
        minQty: Math.max(1, Number(r.minQty) || 1),
      }));
    await setDoc(
      doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID),
      { customTechniques },
      { merge: true }
    );
    toast.success("Técnicas guardadas");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Banderas personalizadas</CardTitle>
        <p className="text-sm text-slate-600">
          El bot pregunta para cuándo, cuántas y la medida, y ofrece solo las técnicas que llegan a
          tiempo (en días hábiles, según el horario de atención) y aplican a esa cantidad. Si la
          fecha cae dentro del rango, la ofrece como &quot;⚠️ justo&quot; y lo confirma el equipo. Con producto vinculado da el precio del catálogo; sin
          producto queda <b>a cotizar</b> en WhatsApp &gt; Pedidos. Ajustá los días y mínimos a los
          reales.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {(rows || []).map((r, idx) => {
          const rules = r.sizeRules || [];
          const setRules = (sizeRules: TBotSizeRule[]) => update(idx, { sizeRules });
          return (
            <div key={idx} className="rounded-md border p-3 space-y-3">
              <div className="grid gap-2 md:grid-cols-[170px_1fr_220px_auto_auto] md:items-center">
                <Input value={r.label} placeholder="Técnica" onChange={(e) => update(idx, { label: e.target.value })} />
                <Input
                  value={r.description}
                  placeholder="Descripción corta"
                  onChange={(e) => update(idx, { description: e.target.value })}
                />
                <Select
                  value={r.productId || NO_PRODUCT}
                  onValueChange={(v) => update(idx, { productId: v === NO_PRODUCT ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PRODUCT}>
                      {r.id === "sublimada" ? "Precio: personalizada sublimada" : "Sin producto: a cotizar"}
                    </SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1 text-sm">
                  <Checkbox checked={r.enabled} onCheckedChange={(v) => update(idx, { enabled: v === true })} />
                  Activa
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRows((rows || []).filter((_, i) => i !== idx))}
                  aria-label="Quitar técnica"
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-600">Plazo general:</span>
                <DaysRange
                  min={r.minDays}
                  max={r.maxDays ?? r.minDays}
                  onChange={(minDays, maxDays) => update(idx, { minDays, maxDays })}
                />
                <span className="text-slate-600 ml-4">Cantidad mínima:</span>
                <Input
                  type="number"
                  min={1}
                  className="w-20 h-8"
                  value={r.minQty}
                  onChange={(e) => update(idx, { minQty: Number(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Plazos según la medida (opcional). Se usa la primera fila que cubra la medida pedida;
                  las más grandes usan el plazo general.
                </p>
                {rules.map((rule, ri) => (
                  <div key={ri} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-600">Hasta</span>
                    <Input
                      className="w-28 h-8"
                      placeholder="90x1,50"
                      value={rule.upTo}
                      onChange={(e) =>
                        setRules(rules.map((x, i) => (i === ri ? { ...x, upTo: e.target.value } : x)))
                      }
                    />
                    <DaysRange
                      min={rule.minDays}
                      max={rule.maxDays}
                      onChange={(minDays, maxDays) =>
                        setRules(rules.map((x, i) => (i === ri ? { ...x, minDays, maxDays } : x)))
                      }
                    />
                    {rule.upTo && !parseSize(rule.upTo) && (
                      <span className="text-xs text-red-600">Medida no válida (usá AxB)</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setRules(rules.filter((_, i) => i !== ri))}
                      aria-label="Quitar plazo por medida"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setRules([...rules, { upTo: "", minDays: r.minDays, maxDays: r.maxDays ?? r.minDays }])
                  }
                >
                  <Plus className="h-3 w-3 mr-1" /> Plazo por medida
                </Button>
              </div>
            </div>
          );
        })}
        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setRows([
                ...(rows || []),
                {
                  id: "",
                  label: "",
                  description: "",
                  minDays: 7,
                  maxDays: 10,
                  minQty: 1,
                  productId: null,
                  enabled: true,
                },
              ])
            }
          >
            <Plus className="h-4 w-4 mr-2" /> Agregar técnica
          </Button>
          <Button onClick={save} disabled={!rows}>
            <Save className="h-4 w-4 mr-2" /> Guardar técnicas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** "de [10] a [15] días hábiles". */
function DaysRange({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  return (
    <span className="flex items-center gap-1 text-sm">
      de
      <Input
        type="number"
        min={0}
        className="w-16 h-8"
        value={min}
        onChange={(e) => onChange(Number(e.target.value), max)}
      />
      a
      <Input
        type="number"
        min={0}
        className="w-16 h-8"
        value={max}
        onChange={(e) => onChange(min, Number(e.target.value))}
      />
      días hábiles
    </span>
  );
}
