"use client";

import { useMemo, useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  arrayUnion,
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { toast } from "sonner";
import { Check, EyeOff, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import collections from "@/lib/collections";
import { EBotIntentKind, EBotLearnStatus, TBotIntent, TBotTurn } from "@/types/bot";
import { LayerBadge, toDate } from "./shared";
import { NewFaqDialog } from "./NewFaqDialog";

/** Intención sugerida a partir de lo que entendió la IA. */
function suggestedIntentId(turn: TBotTurn, intents: TBotIntent[]): string {
  const ai = turn.ai;
  if (!ai) return "";
  if (ai.intent === "faq" && ai.faqId) return ai.faqId;
  return intents.find((i) => i.kind === EBotIntentKind.SYSTEM && i.action === ai.intent)?.id || "";
}

export function LearnTab() {
  const firestore = useFirestore();
  const turnsQuery = useMemo(
    () =>
      query(collection(firestore, collections.BOT_TURNS), orderBy("createdAt", "desc"), limit(300)),
    [firestore]
  );
  const intentsRef = useMemo(() => collection(firestore, collections.BOT_INTENTS), [firestore]);
  const { status, data: turnsData } = useFirestoreCollectionData(turnsQuery, { idField: "id" });
  const { data: intentsData } = useFirestoreCollectionData(intentsRef, { idField: "id" });
  const intents = useMemo(
    () =>
      ((intentsData as TBotIntent[] | undefined) || [])
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    [intentsData]
  );
  const pending = useMemo(
    () =>
      ((turnsData as TBotTurn[] | undefined) || []).filter(
        (t) => t.learnStatus === EBotLearnStatus.PENDING && t.text
      ),
    [turnsData]
  );
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [faqFor, setFaqFor] = useState<TBotTurn | null>(null);

  /** Agrega la frase a la intención y marca como aprendidos todos los turnos con el mismo texto. */
  const teach = async (turn: TBotTurn, intentId: string) => {
    if (!intentId || !turn.text) return;
    const batch = writeBatch(firestore);
    batch.update(doc(firestore, collections.BOT_INTENTS, intentId), {
      examples: arrayUnion(turn.text.trim()),
      updatedAt: serverTimestamp(),
    });
    const same = pending.filter(
      (t) => t.text?.trim().toLowerCase() === turn.text?.trim().toLowerCase()
    );
    for (const t of same) {
      batch.update(doc(firestore, collections.BOT_TURNS, t.id), {
        learnStatus: EBotLearnStatus.LEARNED,
        learnedIntent: intentId,
      });
    }
    await batch.commit();
    const label = intents.find((i) => i.id === intentId)?.label || intentId;
    toast.success(`Aprendido: "${turn.text}" → ${label}`);
  };

  const ignore = (turn: TBotTurn) =>
    updateDoc(doc(firestore, collections.BOT_TURNS, turn.id), {
      learnStatus: EBotLearnStatus.IGNORED,
    });

  if (status === "loading") return <p className="text-sm text-slate-500">Cargando…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 max-w-3xl">
        Mensajes que el bot <b>no pudo resolver con reglas</b>: los que tuvo que mandar a la IA y los
        que no entendió. Enseñale a qué intención corresponde cada uno y la próxima vez lo resuelve
        solo, sin gastar IA.
      </p>
      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            No hay nada para enseñar 🎉
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {pending.map((turn) => {
              const selected = choice[turn.id] ?? suggestedIntentId(turn, intents);
              const date = toDate(turn.createdAt);
              return (
                <div key={turn.id} className="p-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="space-y-1 min-w-0">
                    <p className="font-medium break-words">&quot;{turn.text}&quot;</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <LayerBadge layer={turn.layer} />
                      {turn.ai && (
                        <span>
                          IA entendió: <b>{turn.ai.intent === "faq" ? turn.ai.faqId : turn.ai.intent}</b>{" "}
                          ({Math.round(turn.ai.confidence * 100)}%)
                          {turn.ai.product ? ` · producto: ${turn.ai.product}` : ""}
                        </span>
                      )}
                      {date && <span>{date.toLocaleString("es-AR")}</span>}
                      {turn.channel === "simulator" && <span>(simulador)</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={selected}
                      onValueChange={(v) => setChoice((prev) => ({ ...prev, [turn.id]: v }))}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Elegir intención…" />
                      </SelectTrigger>
                      <SelectContent>
                        {intents.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" disabled={!selected} onClick={() => teach(turn, selected)}>
                      <Check className="h-4 w-4 mr-1" /> Enseñar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setFaqFor(turn)}>
                      <Plus className="h-4 w-4 mr-1" /> Nueva FAQ
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => ignore(turn)}>
                      <EyeOff className="h-4 w-4 mr-1" /> Ignorar
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
      <NewFaqDialog
        open={!!faqFor}
        onOpenChange={(o) => !o && setFaqFor(null)}
        initialExample={faqFor?.text || ""}
        onCreated={() => {
          if (faqFor)
            updateDoc(doc(firestore, collections.BOT_TURNS, faqFor.id), {
              learnStatus: EBotLearnStatus.LEARNED,
            });
        }}
      />
    </div>
  );
}
