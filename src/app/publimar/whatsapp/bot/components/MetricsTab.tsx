"use client";

import { useEffect, useMemo, useState } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, doc, getDoc, limit, orderBy, query } from "firebase/firestore";
import { Bot, DollarSign, MessageSquare, ShoppingBag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SummaryCard } from "@/components/admin/SummaryCard";
import collections from "@/lib/collections";
import { BOT_CONFIG_DOC_ID, mergeBotConfig } from "@/lib/bot/defaults";
import { normalizeText } from "@/lib/bot/normalize";
import { BOT_LAYER_LABELS, EBotLayer, EBotLearnStatus, TBotStats, TBotTurn } from "@/types/bot";
import { LAYER_STYLES, formatUsd } from "./shared";

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function MetricsTab() {
  const firestore = useFirestore();
  const statsRef = useMemo(() => collection(firestore, collections.BOT_STATS), [firestore]);
  const turnsQuery = useMemo(
    () =>
      query(collection(firestore, collections.BOT_TURNS), orderBy("createdAt", "desc"), limit(500)),
    [firestore]
  );
  const { data: statsData } = useFirestoreCollectionData(statsRef, { idField: "id" });
  const { data: turnsData } = useFirestoreCollectionData(turnsQuery, { idField: "id" });
  const [budget, setBudget] = useState<number | null>(null);

  useEffect(() => {
    getDoc(doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID)).then((snap) =>
      setBudget(mergeBotConfig(snap.data() as any).aiMonthlyBudgetUsd)
    );
  }, [firestore]);

  const months = useMemo(
    () =>
      ((statsData as TBotStats[] | undefined) || []).slice().sort((a, b) => b.id.localeCompare(a.id)),
    [statsData]
  );
  const month = months.find((m) => m.id === currentMonth());
  const turns = month?.turns || 0;
  const aiCalls = month?.aiCalls || 0;
  const withoutAiPct = turns ? Math.round(((turns - aiCalls) / turns) * 100) : 0;

  // Frases no resueltas más repetidas (pendientes de enseñar).
  const topUnresolved = useMemo(() => {
    const counts = new Map<string, { text: string; n: number }>();
    for (const t of (turnsData as TBotTurn[] | undefined) || []) {
      if (t.learnStatus !== EBotLearnStatus.PENDING || !t.text) continue;
      const key = normalizeText(t.text);
      const prev = counts.get(key);
      counts.set(key, { text: prev?.text || t.text, n: (prev?.n || 0) + 1 });
    }
    return Array.from(counts.values())
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
  }, [turnsData]);

  const layers = Object.values(EBotLayer).filter((l) => (month?.byLayer?.[l] || 0) > 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Mensajes este mes" value={turns} icon={MessageSquare} variant="blue" />
        <SummaryCard
          title="Resueltos sin IA"
          value={`${withoutAiPct}%`}
          subtitle={`${aiCalls} llamadas a la IA`}
          icon={Bot}
          variant="green"
        />
        <SummaryCard
          title="Costo de IA del mes"
          value={formatUsd(month?.aiCostUsd || 0)}
          subtitle={budget != null ? `Tope: ${formatUsd(budget)}` : undefined}
          icon={DollarSign}
          variant={budget != null && (month?.aiCostUsd || 0) >= budget ? "red" : "slate"}
        />
        <SummaryCard title="Pedidos tomados" value={month?.orders || 0} icon={ShoppingBag} variant="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quién resolvió cada mensaje (este mes)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {layers.length === 0 && <p className="text-sm text-slate-500">Sin datos todavía.</p>}
            {layers.map((l) => {
              const n = month?.byLayer?.[l] || 0;
              return (
                <div key={l} className="flex items-center justify-between text-sm">
                  <span className={`rounded px-2 py-0.5 text-xs ${LAYER_STYLES[l]}`}>
                    {BOT_LAYER_LABELS[l]}
                  </span>
                  <span className="tabular-nums">
                    {n} ({turns ? Math.round((n / turns) * 100) : 0}%)
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Frases que más se repiten sin resolver</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {topUnresolved.length === 0 && <p className="text-sm text-slate-500">Nada pendiente 🎉</p>}
            {topUnresolved.map((u) => (
              <div key={u.text} className="flex items-center justify-between text-sm gap-2">
                <span className="truncate">&quot;{u.text}&quot;</span>
                <span className="tabular-nums text-slate-500">{u.n}×</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {months.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meses anteriores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {months.map((m) => (
              <div key={m.id} className="grid grid-cols-4 gap-2 tabular-nums">
                <span>{m.id}</span>
                <span>{m.turns || 0} mensajes</span>
                <span>
                  {m.turns ? Math.round((((m.turns || 0) - (m.aiCalls || 0)) / m.turns) * 100) : 0}% sin IA
                </span>
                <span>{formatUsd(m.aiCostUsd || 0)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
