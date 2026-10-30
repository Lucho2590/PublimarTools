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
import collections from "@/lib/collections";
import { cn } from "@/lib/utils";
import { filterActive } from "@/lib/softDelete";
import { BOT_CONFIG_DOC_ID, SUGGESTED_CATALOG_GROUPS } from "@/lib/bot/defaults";
import { normalizeText } from "@/lib/bot/normalize";
import { TBotCatalogGroup } from "@/types/bot";

/** Menú del catálogo del bot: pocas opciones que agrupan varias categorías. */
export function CatalogGroupsCard() {
  const firestore = useFirestore();
  const categoriesRef = useMemo(
    () => collection(firestore, collections.products.CATEGORIES),
    [firestore]
  );
  const { data } = useFirestoreCollectionData(categoriesRef, { idField: "id" });
  const categories = useMemo(
    () =>
      filterActive((data as { id: string; name?: string }[]) || [])
        .filter((c) => c.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "es")),
    [data]
  );
  const [groups, setGroups] = useState<TBotCatalogGroup[] | null>(null);
  const [usingSuggested, setUsingSuggested] = useState(false);

  useEffect(() => {
    if (!categories.length || groups) return;
    getDoc(doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID)).then((snap) => {
      const saved = (snap.data()?.catalogGroups || []) as TBotCatalogGroup[];
      if (saved.length) {
        setGroups(saved);
        return;
      }
      setGroups(
        SUGGESTED_CATALOG_GROUPS.map((g) => ({
          id: g.id,
          label: g.label,
          rest: !!g.rest,
          categoryIds: categories
            .filter((c) => g.categoryNames.includes(normalizeText(String(c.name))))
            .map((c) => c.id),
        }))
      );
      setUsingSuggested(true);
    });
  }, [categories, firestore, groups]);

  const update = (idx: number, patch: Partial<TBotCatalogGroup>) =>
    setGroups((prev) => (prev || []).map((g, i) => (i === idx ? { ...g, ...patch } : g)));

  const toggleCategory = (idx: number, catId: string) => {
    const g = (groups || [])[idx];
    const categoryIds = g.categoryIds.includes(catId)
      ? g.categoryIds.filter((id) => id !== catId)
      : [...g.categoryIds, catId];
    update(idx, { categoryIds });
  };

  const save = async () => {
    const catalogGroups = (groups || [])
      .filter((g) => g.label.trim())
      .map((g) => ({
        id: g.id || normalizeText(g.label).replace(/\s+/g, "_").slice(0, 30),
        label: g.label.trim(),
        categoryIds: g.rest ? [] : g.categoryIds,
        rest: !!g.rest,
      }));
    await setDoc(
      doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID),
      { catalogGroups },
      { merge: true }
    );
    setUsingSuggested(false);
    toast.success("Menú del catálogo guardado");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Menú del catálogo</CardTitle>
        <p className="text-sm text-slate-600">
          Las opciones que ve el cliente al pedir el catálogo. Cada una junta categorías; un
          producto va a la primera opción que lo incluye. La marcada como &quot;resto&quot; se queda
          con todo lo demás.
          {usingSuggested && " Estas son las sugeridas: guardalas o ajustalas."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {(groups || []).map((g, idx) => (
          <div key={idx} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-3">
              <Input
                className="max-w-xs"
                placeholder="Nombre (ej: Argentinas)"
                value={g.label}
                onChange={(e) => update(idx, { label: e.target.value })}
              />
              <label className="flex items-center gap-1 text-sm">
                <Checkbox checked={!!g.rest} onCheckedChange={(v) => update(idx, { rest: v === true })} />
                Resto
              </label>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                onClick={() => setGroups((groups || []).filter((_, i) => i !== idx))}
                aria-label="Quitar opción"
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
            {!g.rest && (
              <div className="flex flex-wrap gap-1">
                {categories.map((c) => {
                  const on = g.categoryIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCategory(idx, c.id)}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-xs",
                        on ? "border-blue-300 bg-blue-50 text-blue-800" : "text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => setGroups([...(groups || []), { id: "", label: "", categoryIds: [] }])}
          >
            <Plus className="h-4 w-4 mr-2" /> Agregar opción
          </Button>
          <Button onClick={save} disabled={!groups}>
            <Save className="h-4 w-4 mr-2" /> Guardar menú
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
