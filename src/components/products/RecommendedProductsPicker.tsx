"use client";

// "Recomendados para ofrecer": productos que el agente de WhatsApp ofrece cuando
// un cliente agrega este producto al pedido (ej. bandera de ceremonia → moño,
// banda, tahalí, asta, base).

import { useMemo, useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection } from "firebase/firestore";
import { Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import collections from "@/lib/collections";
import { filterActive } from "@/lib/softDelete";

export function RecommendedProductsPicker({
  value,
  onChange,
  excludeId,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  /** El producto que se está editando (no se recomienda a sí mismo). */
  excludeId?: string | null;
}) {
  const firestore = useFirestore();
  const { data } = useFirestoreCollectionData(collection(firestore, collections.PRODUCTS), { idField: "id" });
  const products = useMemo(
    () =>
      filterActive((data as any[]) || []).sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "es")
      ),
    [data]
  );
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [search, setSearch] = useState("");

  const results = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (q.length < 2) return [];
    return products
      .filter((p) => p.id !== excludeId && !value.includes(p.id) && String(p.name || "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, search, value, excludeId]);

  const add = (id: string) => {
    onChange([...value, id]);
    setSearch("");
  };
  const remove = (id: string) => onChange(value.filter((x) => x !== id));

  return (
    <div className="space-y-2">
      <Label>Recomendados para ofrecer</Label>
      <p className="text-xs text-slate-500">
        Cuando un cliente agregue este producto por WhatsApp, el agente le ofrece estos (una sola vez, en la
        misma medida si corresponde).
      </p>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-sm text-blue-900"
            >
              {byId.get(id)?.name || "Producto borrado"}
              <button type="button" onClick={() => remove(id)} aria-label="Quitar">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          className="pl-8"
          placeholder="Buscar producto para recomendar… (ej. moño, tahalí, asta)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow-md max-h-60 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => add(p.id)}
                className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-slate-50"
              >
                <span className="truncate">{p.name}</span>
                <Plus className="h-4 w-4 text-blue-600 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
