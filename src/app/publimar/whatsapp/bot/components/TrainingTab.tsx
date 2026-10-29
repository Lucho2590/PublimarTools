"use client";

import { useEffect, useMemo, useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { toast } from "sonner";
import { Plus, Save, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import collections from "@/lib/collections";
import { filterActive } from "@/lib/softDelete";
import {
  BOT_CONFIG_DOC_ID,
  BOT_TEMPLATE_VARS,
  DEFAULT_BOT_INTENTS,
} from "@/lib/bot/defaults";
import { EBotIntentKind, TBotIntent } from "@/types/bot";
import { NewFaqDialog } from "./NewFaqDialog";

export function TrainingTab() {
  const firestore = useFirestore();
  const intentsRef = useMemo(() => collection(firestore, collections.BOT_INTENTS), [firestore]);
  const { status, data } = useFirestoreCollectionData(intentsRef, { idField: "id" });
  const intents = useMemo(() => {
    const list = ((data as TBotIntent[] | undefined) || []).slice();
    // Sistema primero, después FAQ; alfabético dentro de cada grupo.
    return list.sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === EBotIntentKind.SYSTEM ? -1 : 1) ||
        a.label.localeCompare(b.label, "es")
    );
  }, [data]);
  const [newFaqOpen, setNewFaqOpen] = useState(false);

  const seed = async () => {
    const batch = writeBatch(firestore);
    for (const intent of DEFAULT_BOT_INTENTS) {
      const { id, ...rest } = intent;
      batch.set(doc(firestore, collections.BOT_INTENTS, id), {
        ...rest,
        hits: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    toast.success("Intenciones iniciales cargadas");
  };

  if (status === "loading") return <p className="text-sm text-slate-500">Cargando…</p>;

  return (
    <div className="space-y-6">
      {intents.length === 0 ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm">
              Todavía no hay intenciones. Cargá las iniciales (saludo, precios, pedido, horarios,
              envíos, pagos…) y después las ajustás.
            </p>
            <Button onClick={seed}>Cargar intenciones iniciales</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600 max-w-2xl">
              Cada intención tiene <b>frases de ejemplo</b>. Si un mensaje se parece lo suficiente a
              alguna, el bot responde <b>sin usar IA</b>. Cuantas más frases reales cargues, menos IA
              gasta.
            </p>
            <Button onClick={() => setNewFaqOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nueva pregunta frecuente
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {intents.map((intent) => (
              <IntentCard key={intent.id} intent={intent} />
            ))}
          </div>
        </>
      )}

      <ProductAliasesCard />
      <NewFaqDialog open={newFaqOpen} onOpenChange={setNewFaqOpen} />
    </div>
  );
}

function IntentCard({ intent }: { intent: TBotIntent }) {
  const firestore = useFirestore();
  const ref = doc(firestore, collections.BOT_INTENTS, intent.id);
  const [example, setExample] = useState("");
  const [answer, setAnswer] = useState(intent.answer || "");
  const isFaq = intent.kind === EBotIntentKind.FAQ;

  useEffect(() => setAnswer(intent.answer || ""), [intent.answer]);

  const addExample = async () => {
    const e = example.trim();
    if (!e) return;
    await updateDoc(ref, { examples: arrayUnion(e), updatedAt: serverTimestamp() });
    setExample("");
  };
  const removeExample = (e: string) =>
    updateDoc(ref, { examples: arrayRemove(e), updatedAt: serverTimestamp() });
  const toggle = (enabled: boolean) => updateDoc(ref, { enabled, updatedAt: serverTimestamp() });
  const saveAnswer = async () => {
    await updateDoc(ref, { answer, updatedAt: serverTimestamp() });
    toast.success("Respuesta guardada");
  };
  const remove = async () => {
    if (!confirm(`¿Eliminar la pregunta frecuente "${intent.label}"?`)) return;
    await deleteDoc(ref);
  };

  return (
    <Card className={intent.enabled ? "" : "opacity-60"}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            {intent.label}
            <Badge variant="outline" className="font-normal">
              {isFaq ? "Pregunta frecuente" : "Sistema"}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{intent.hits || 0} usos</span>
            <div className="flex items-center gap-1">
              <Checkbox
                id={`en-${intent.id}`}
                checked={intent.enabled}
                onCheckedChange={(v) => toggle(v === true)}
              />
              <Label htmlFor={`en-${intent.id}`} className="text-xs">
                Activa
              </Label>
            </div>
            {isFaq && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={remove}>
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {(intent.examples || []).map((e) => (
            <Badge key={e} variant="secondary" className="font-normal gap-1">
              {e}
              <button onClick={() => removeExample(e)} aria-label={`Quitar ${e}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Agregar frase de ejemplo…"
            value={example}
            onChange={(e) => setExample(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addExample()}
          />
          <Button variant="outline" onClick={addExample} disabled={!example.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {isFaq && (
          <div className="space-y-2">
            <Textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Variables: {BOT_TEMPLATE_VARS.map((v) => `{${v.key}}`).join(" ")}
              </p>
              <Button size="sm" onClick={saveAnswer} disabled={answer === (intent.answer || "")}>
                <Save className="h-4 w-4 mr-1" /> Guardar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Otros nombres con los que los clientes piden cada producto. */
function ProductAliasesCard() {
  const firestore = useFirestore();
  const productsRef = useMemo(() => collection(firestore, collections.PRODUCTS), [firestore]);
  const { data } = useFirestoreCollectionData(productsRef, { idField: "id" });
  const products = useMemo(
    () =>
      filterActive((data as any[]) || []).sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "es")
      ),
    [data]
  );
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getDoc(doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID)).then((snap) => {
      const map = (snap.data()?.productAliases || {}) as Record<string, string[]>;
      setAliases(Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.join(", ")])));
      setLoaded(true);
    });
  }, [firestore]);

  const save = async () => {
    const productAliases: Record<string, string[]> = {};
    for (const [id, raw] of Object.entries(aliases)) {
      const list = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length) productAliases[id] = list;
    }
    // Sin merge en este campo: reemplaza el mapa completo (permite borrar alias).
    await updateDoc(doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID), {
      productAliases,
    }).catch(() =>
      setDoc(doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID), { productAliases }, { merge: true })
    );
    toast.success("Alias guardados");
  };

  const q = search.toLowerCase().trim();
  const visible = products.filter((p) => !q || String(p.name || "").toLowerCase().includes(q));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Otros nombres de productos</CardTitle>
        <p className="text-sm text-slate-600">
          Cómo piden los clientes cada bandera (separados por coma). Ej: Bandera Argentina →
          &quot;celeste y blanca, nacional&quot;.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button onClick={save} disabled={!loaded}>
            <Save className="h-4 w-4 mr-2" /> Guardar alias
          </Button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto divide-y border rounded-md">
          {visible.map((p) => (
            <div key={p.id} className="grid gap-2 p-2 md:grid-cols-[240px_1fr] md:items-center">
              <span className="text-sm">{p.name}</span>
              <Input
                placeholder="alias1, alias2…"
                value={aliases[p.id] || ""}
                onChange={(e) => setAliases((prev) => ({ ...prev, [p.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
