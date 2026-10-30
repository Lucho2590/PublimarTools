"use client";

import { useEffect, useMemo, useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import collections from "@/lib/collections";
import { filterActive } from "@/lib/softDelete";
import { BOT_CONFIG_DOC_ID, SUGGESTED_PRODUCT_TYPES } from "@/lib/bot/defaults";
import { normalizeText } from "@/lib/bot/normalize";
import { TBotProductType } from "@/types/bot";

type TRow = { categoryId: string; label: string; description: string; keywords: string };

/**
 * Tipos de bandera que el bot pregunta cuando el pedido es genérico
 * ("argentina" → ¿Flameo, Ceremonia o Escritorio?). Cada tipo es una categoría.
 */
export function ProductTypesCard() {
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
  const [rows, setRows] = useState<TRow[] | null>(null);
  const [usingSuggested, setUsingSuggested] = useState(false);

  // Carga la config; si no hay tipos guardados, muestra los sugeridos.
  useEffect(() => {
    if (!categories.length || rows) return;
    getDoc(doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID)).then((snap) => {
      const saved = (snap.data()?.productTypes || []) as TBotProductType[];
      if (saved.length) {
        setRows(saved.map((t) => ({ ...t, keywords: (t.keywords || []).join(", ") })));
        return;
      }
      const suggested = SUGGESTED_PRODUCT_TYPES.map((s) => {
        const cat = categories.find((c) => normalizeText(String(c.name)) === s.categoryName);
        return cat
          ? { categoryId: cat.id, label: s.label, description: s.description, keywords: s.keywords.join(", ") }
          : null;
      }).filter(Boolean) as TRow[];
      setRows(suggested);
      setUsingSuggested(true);
    });
  }, [categories, firestore, rows]);

  const update = (idx: number, patch: Partial<TRow>) =>
    setRows((prev) => (prev || []).map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const add = () => {
    const used = new Set((rows || []).map((r) => r.categoryId));
    const cat = categories.find((c) => !used.has(c.id));
    if (!cat) return;
    setRows([...(rows || []), { categoryId: cat.id, label: String(cat.name), description: "", keywords: "" }]);
  };

  const save = async () => {
    const productTypes: TBotProductType[] = (rows || [])
      .filter((r) => r.categoryId && r.label.trim())
      .map((r) => ({
        categoryId: r.categoryId,
        label: r.label.trim(),
        description: r.description.trim(),
        keywords: r.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
      }));
    await setDoc(
      doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID),
      { productTypes },
      { merge: true }
    );
    setUsingSuggested(false);
    toast.success("Tipos de bandera guardados");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tipos de bandera</CardTitle>
        <p className="text-sm text-slate-600">
          Cuando el cliente pide algo genérico (&quot;bandera argentina&quot;), el bot le pregunta el
          tipo antes de pasarle precios. Cada tipo es una categoría del catálogo. Las palabras son
          cómo lo dicen los clientes (ej: &quot;mástil, exterior&quot;).
          {usingSuggested && " Estos son los sugeridos: guardalos o ajustalos."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {(rows || []).map((r, idx) => (
          <div key={idx} className="grid gap-2 md:grid-cols-[180px_140px_1fr_1fr_auto] md:items-center">
            <Select value={r.categoryId} onValueChange={(v) => update(idx, { categoryId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Nombre" value={r.label} onChange={(e) => update(idx, { label: e.target.value })} />
            <Input
              placeholder="Descripción corta"
              value={r.description}
              onChange={(e) => update(idx, { description: e.target.value })}
            />
            <Input
              placeholder="palabras, separadas, por coma"
              value={r.keywords}
              onChange={(e) => update(idx, { keywords: e.target.value })}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRows((rows || []).filter((_, i) => i !== idx))}
              aria-label="Quitar tipo"
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ))}
        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={add} disabled={!categories.length}>
            <Plus className="h-4 w-4 mr-2" /> Agregar tipo
          </Button>
          <Button onClick={save} disabled={!rows}>
            <Save className="h-4 w-4 mr-2" /> Guardar tipos
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
