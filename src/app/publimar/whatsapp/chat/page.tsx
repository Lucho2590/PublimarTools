"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  Timestamp,
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { Bot, ExternalLink, Hand, MessageCircle, Search, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import collections from "@/lib/collections";
import { normalizeText } from "@/lib/bot/normalize";
import { BotTranscript } from "@/components/whatsapp/BotTranscript";
import { ClientTagBadge, useClientTagOptions } from "@/components/client/ClientTags";
import { toDate } from "../bot/components/shared";

type TChatSession = {
  id: string;
  channel: string;
  customerName?: string | null;
  phone?: string | null;
  segmentId?: string | null;
  status?: "active" | "handoff";
  needsAttention?: boolean;
  lastOrderNumber?: string | null;
  history?: { role: string; text: string }[];
  updatedAt?: any;
};

/**
 * Filtros de estado de la lista. Para sumar uno nuevo: agregarlo acá con su
 * condición (se combinan con el filtro de tipo de cliente).
 */
const STATE_FILTERS: { id: string; label: string; test: (s: TChatSession) => boolean }[] = [
  { id: "all", label: "Todas", test: () => true },
  { id: "attention", label: "Por atender", test: (s) => !!s.needsAttention },
  { id: "bot", label: "Bot atendiendo", test: (s) => s.status !== "handoff" },
  { id: "human", label: "Con persona", test: (s) => s.status === "handoff" },
  { id: "order", label: "Con pedido", test: (s) => !!s.lastOrderNumber },
];

const NO_SEGMENT = "_none";

function displayName(s: TChatSession): string {
  if (s.customerName) return s.customerName;
  if (s.phone) return `+${s.phone}`;
  return s.channel === "simulator" ? "Prueba del simulador" : "Cliente";
}

function hhmm(d: Date | null): string {
  if (!d) return "";
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function Chip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
        active ? "border-blue-600 bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
      )}
    >
      {children}
      <span className={cn("ml-1", active ? "text-blue-100" : "text-slate-400")}>{count}</span>
    </button>
  );
}

export default function ChatPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const tagOptions = useClientTagOptions();
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");

  const sessionsQuery = useMemo(
    () => query(collection(firestore, collections.BOT_SESSIONS), orderBy("updatedAt", "desc"), limit(200)),
    [firestore]
  );
  const { status, data } = useFirestoreCollectionData(sessionsQuery, { idField: "id" });
  const sessions = (data as TChatSession[] | undefined) || [];

  const q = normalizeText(search);
  const bySearch = sessions.filter(
    (s) =>
      !q ||
      normalizeText(displayName(s)).includes(q) ||
      (s.phone || "").includes(search.replace(/\D/g, "") || "~")
  );
  const segmentOf = (s: TChatSession) =>
    s.segmentId && s.segmentId !== "_skip" ? s.segmentId : NO_SEGMENT;
  const matchSegment = (s: TChatSession, seg: string) => seg === "all" || segmentOf(s) === seg;
  const matchState = (s: TChatSession, st: string) =>
    (STATE_FILTERS.find((f) => f.id === st) || STATE_FILTERS[0]).test(s);

  const filtered = bySearch.filter((s) => matchSegment(s, segment) && matchState(s, stateFilter));
  const selected = filtered.find((s) => s.id === params.get("c")) || filtered[0] || null;

  const segmentChips = [
    { id: "all", label: "Todos" },
    ...tagOptions.map((o) => ({ id: o.id, label: o.label.split(" / ")[0] })),
    { id: NO_SEGMENT, label: "Sin tipo" },
  ];

  const takeOver = async (s: TChatSession) => {
    await updateDoc(doc(firestore, collections.BOT_SESSIONS, s.id), {
      status: "handoff",
      pausedUntil: Timestamp.fromDate(new Date(Date.now() + 12 * 3600 * 1000)),
      needsAttention: false,
      handoffReason: `Tomada por ${user?.email || "el equipo"}`,
      handoffAt: serverTimestamp(),
      attendedAt: serverTimestamp(),
      attendedBy: user?.email || user?.uid || null,
    });
    toast.success("Tomaste la conversación: el bot no le va a responder");
  };
  const backToBot = async (s: TChatSession) => {
    await updateDoc(doc(firestore, collections.BOT_SESSIONS, s.id), {
      status: "active",
      pausedUntil: null,
      needsAttention: false,
      attendedAt: serverTimestamp(),
      attendedBy: user?.email || user?.uid || null,
    });
    toast.success("Conversación devuelta al bot");
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Chat</h1>
        <p className="text-sm text-slate-600">
          Todas las conversaciones del bot. Filtrá por tipo de cliente o estado y tomá la charla cuando haga falta.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="p-3 border-b space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Buscar contacto…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {segmentChips.map((c) => (
                  <Chip
                    key={c.id}
                    active={segment === c.id}
                    onClick={() => setSegment(c.id)}
                    count={bySearch.filter((s) => matchSegment(s, c.id) && matchState(s, stateFilter)).length}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {STATE_FILTERS.map((f) => (
                  <Chip
                    key={f.id}
                    active={stateFilter === f.id}
                    onClick={() => setStateFilter(f.id)}
                    count={bySearch.filter((s) => matchSegment(s, segment) && matchState(s, f.id)).length}
                  >
                    {f.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="divide-y max-h-[62vh] overflow-y-auto">
              {status === "loading" && <p className="p-4 text-sm text-slate-500">Cargando…</p>}
              {status !== "loading" && !filtered.length && (
                <p className="p-4 text-sm text-slate-500">No hay conversaciones con esos filtros.</p>
              )}
              {filtered.map((s) => {
                const last = s.history?.[s.history.length - 1];
                const seg = segmentOf(s);
                return (
                  <button
                    key={s.id}
                    onClick={() => router.replace(`/publimar/whatsapp/chat?c=${encodeURIComponent(s.id)}`)}
                    className={cn(
                      "w-full text-left p-3 hover:bg-slate-50 transition-colors",
                      selected?.id === s.id && "bg-blue-50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{displayName(s)}</span>
                      <span className="text-xs text-slate-500 shrink-0">{hhmm(toDate(s.updatedAt))}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="text-xs text-slate-500 truncate">
                        {last ? `${last.role === "bot" ? "🤖 " : ""}${last.text}` : "—"}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {seg !== NO_SEGMENT && <ClientTagBadge id={seg} options={tagOptions} />}
                        {s.needsAttention ? (
                          <Badge variant="secondary" className="bg-red-100 text-red-700">Por atender</Badge>
                        ) : s.status === "handoff" ? (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800">Persona</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-purple-100 text-purple-800">Bot</Badge>
                        )}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selected ? (
          <Card className="overflow-hidden flex flex-col">
            <div className="p-3 border-b flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{displayName(selected)}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                  {selected.phone ? `+${selected.phone}` : selected.channel === "simulator" ? "Simulador" : ""}
                  {segmentOf(selected) !== NO_SEGMENT && (
                    <ClientTagBadge id={segmentOf(selected)} options={tagOptions} />
                  )}
                  {selected.lastOrderNumber && <span>· Último pedido {selected.lastOrderNumber}</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selected.status === "handoff" ? (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800">🙋 Con una persona</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-purple-100 text-purple-800">🤖 Bot atendiendo</Badge>
                )}
                {selected.phone && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`https://wa.me/${selected.phone}`} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                )}
                {selected.status === "handoff" ? (
                  <Button variant="outline" size="sm" onClick={() => backToBot(selected)}>
                    <Bot className="h-4 w-4 mr-1" /> Devolver al bot
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => takeOver(selected)}>
                    <Hand className="h-4 w-4 mr-1" /> Tomar conversación
                  </Button>
                )}
              </div>
            </div>
            <BotTranscript sessionId={selected.id} className="h-[58vh]" />
            <div className="p-3 border-t flex gap-2">
              <Input
                disabled
                placeholder="Responder desde acá va a estar disponible al conectar WhatsApp (Fase 2)."
              />
              <Button disabled>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">Elegí una conversación.</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
