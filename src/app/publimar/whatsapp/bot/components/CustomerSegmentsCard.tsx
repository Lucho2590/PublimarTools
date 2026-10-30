"use client";

import { useEffect, useState } from "react";
import { useFirestore } from "reactfire";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import collections from "@/lib/collections";
import { BOT_CONFIG_DOC_ID, DEFAULT_CUSTOMER_SEGMENTS, segmentStyle } from "@/lib/bot/defaults";
import { normalizeText } from "@/lib/bot/normalize";
import { TBotCustomerSegment } from "@/types/bot";

type TRow = { id: string; label: string; keywords: string };

/**
 * Tipos de cliente: el bot los deduce por estas palabras (o los pregunta antes
 * del resumen) y etiqueta al cliente en Banderas > Clientes.
 */
export function CustomerSegmentsCard() {
  const firestore = useFirestore();
  const [rows, setRows] = useState<TRow[] | null>(null);

  useEffect(() => {
    getDoc(doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID)).then((snap) => {
      const saved = (snap.data()?.customerSegments || []) as TBotCustomerSegment[];
      const list = saved.length ? saved : DEFAULT_CUSTOMER_SEGMENTS;
      setRows(list.map((sg) => ({ id: sg.id, label: sg.label, keywords: sg.keywords.join(", ") })));
    });
  }, [firestore]);

  const update = (idx: number, patch: Partial<TRow>) =>
    setRows((prev) => (prev || []).map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const save = async () => {
    const customerSegments: TBotCustomerSegment[] = (rows || [])
      .filter((r) => r.label.trim())
      .map((r) => ({
        // El id es la etiqueta guardada en los clientes: no cambia al renombrar.
        id: r.id || normalizeText(r.label).replace(/\s+/g, "_").slice(0, 30),
        label: r.label.trim(),
        keywords: r.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
      }));
    await setDoc(
      doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID),
      { customerSegments },
      { merge: true }
    );
    toast.success("Tipos de cliente guardados");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tipos de cliente</CardTitle>
        <p className="text-sm text-slate-600">
          El bot deduce el tipo por estas palabras (&quot;es para el colegio&quot; → Escuela). Si no
          lo detecta, lo pregunta antes del resumen. Al confirmar el pedido, el cliente queda
          etiquetado en Banderas &gt; Clientes.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {(rows || []).map((r, idx) => (
          <div key={idx} className="grid gap-2 md:grid-cols-[220px_1fr_auto] md:items-center">
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full shrink-0 ${segmentStyle(r.id).split(" ")[0]}`} />
              <Input placeholder="Nombre" value={r.label} onChange={(e) => update(idx, { label: e.target.value })} />
            </div>
            <Input
              placeholder="palabras, separadas, por coma"
              value={r.keywords}
              onChange={(e) => update(idx, { keywords: e.target.value })}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRows((rows || []).filter((_, i) => i !== idx))}
              aria-label="Quitar tipo de cliente"
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ))}
        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => setRows([...(rows || []), { id: "", label: "", keywords: "" }])}
          >
            <Plus className="h-4 w-4 mr-2" /> Agregar tipo
          </Button>
          <Button onClick={save} disabled={!rows}>
            <Save className="h-4 w-4 mr-2" /> Guardar tipos de cliente
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
