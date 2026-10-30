"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, doc, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { toast } from "sonner";
import { Bell, BellOff, Bot, CheckCircle2, ExternalLink, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import collections from "@/lib/collections";
import { enableSystemNotifications } from "@/components/whatsapp/WhatsappAttention";
import { toDate } from "../bot/components/shared";
import { BotTranscript } from "@/components/whatsapp/BotTranscript";

type TAttentionSession = {
  id: string;
  channel: string;
  customerName?: string | null;
  phone?: string | null;
  handoffReason?: string | null;
  handoffSummary?: string | null;
  handoffAt?: any;
  status?: string;
};

function timeAgo(d: Date | null): string {
  if (!d) return "";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return d.toLocaleDateString("es-AR");
}

function displayName(s: TAttentionSession): string {
  if (s.customerName) return s.customerName;
  if (s.phone) return `+${s.phone}`;
  return s.channel === "simulator" ? "Prueba del simulador" : "Cliente";
}

export default function AtenderPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const selectedId = params.get("c");

  const sessionsQuery = useMemo(
    () => query(collection(firestore, collections.BOT_SESSIONS), where("needsAttention", "==", true)),
    [firestore]
  );
  const { status, data } = useFirestoreCollectionData(sessionsQuery, { idField: "id" });
  const sessions = useMemo(
    () =>
      ((data as TAttentionSession[] | undefined) || [])
        .slice()
        .sort((a, b) => (toDate(b.handoffAt)?.getTime() || 0) - (toDate(a.handoffAt)?.getTime() || 0)),
    [data]
  );
  const selected = sessions.find((s) => s.id === selectedId) || sessions[0] || null;

  const [permission, setPermission] = useState<string>("default");
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) setPermission(Notification.permission);
    else setPermission("unsupported");
  }, []);

  const activateNotifications = async () => {
    const result = await enableSystemNotifications();
    setPermission(result);
    if (result === "granted") toast.success("Listo: vas a recibir avisos aunque estés en otra pestaña");
    else if (result === "denied")
      toast.error("El navegador bloqueó las notificaciones. Habilitalas desde el candado de la barra de direcciones.");
  };

  const markAttended = async (s: TAttentionSession, backToBot: boolean) => {
    const ref = doc(firestore, collections.BOT_SESSIONS, s.id);
    await updateDoc(ref, {
      needsAttention: false,
      attendedAt: serverTimestamp(),
      attendedBy: user?.email || user?.uid || null,
      ...(backToBot ? { status: "active", pausedUntil: null } : {}),
    });
    toast.success(backToBot ? "Charla devuelta al bot" : "Marcada como atendida");
    router.replace("/publimar/whatsapp/atender");
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Atender</h1>
          <p className="text-sm text-slate-600">
            Charlas que el bot pasó al equipo. Mientras estén acá, el bot no le responde al cliente.
          </p>
        </div>
        {permission === "granted" ? (
          <span className="flex items-center gap-1 text-sm text-green-700">
            <Bell className="h-4 w-4" /> Notificaciones activadas
          </span>
        ) : permission === "unsupported" ? (
          <span className="flex items-center gap-1 text-sm text-slate-500">
            <BellOff className="h-4 w-4" /> Este navegador no soporta notificaciones
          </span>
        ) : (
          <Button variant="outline" onClick={activateNotifications}>
            <Bell className="h-4 w-4 mr-2" /> Activar notificaciones
          </Button>
        )}
      </div>

      {status === "loading" ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : !sessions.length ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-600" />
            No hay charlas para atender 🎉
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="overflow-hidden">
            <CardContent className="p-0 divide-y max-h-[70vh] overflow-y-auto">
              {sessions.map((s) => {
                const active = selected?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => router.replace(`/publimar/whatsapp/atender?c=${encodeURIComponent(s.id)}`)}
                    className={cn(
                      "w-full text-left p-3 hover:bg-slate-50 transition-colors",
                      active && "bg-blue-50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{displayName(s)}</span>
                      <span className="text-xs text-slate-500 shrink-0">{timeAgo(toDate(s.handoffAt))}</span>
                    </div>
                    <p className="text-xs text-amber-700 mt-0.5">{s.handoffReason || "Necesita atención"}</p>
                    {s.handoffSummary && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{s.handoffSummary.split("\n")[0]}</p>
                    )}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {selected && <ConversationDetail session={selected} onResolve={markAttended} />}
        </div>
      )}
    </div>
  );
}

function ConversationDetail({
  session,
  onResolve,
}: {
  session: TAttentionSession;
  onResolve: (s: TAttentionSession, backToBot: boolean) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="p-4 border-b space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{displayName(session)}</p>
              <Badge variant="secondary" className="bg-amber-100 text-amber-800 mt-1">
                {session.handoffReason || "Necesita atención"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {session.phone && (
                <Button variant="outline" asChild>
                  <a href={`https://wa.me/${session.phone}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4 mr-2" /> Escribirle por WhatsApp
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
              <Button variant="outline" onClick={() => onResolve(session, true)}>
                <Bot className="h-4 w-4 mr-2" /> Devolver al bot
              </Button>
              <Button onClick={() => onResolve(session, false)}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Marcar atendida
              </Button>
            </div>
          </div>
          {session.handoffSummary && (
            <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm font-sans text-slate-700">
              {session.handoffSummary}
            </pre>
          )}
          <p className="text-xs text-slate-500">
            {session.phone
              ? "Respondele desde el WhatsApp del negocio. Cuando conectemos la API de WhatsApp vas a poder contestar desde acá."
              : "Charla del simulador (sin teléfono). En WhatsApp real vas a poder contestar desde acá."}{" "}
            <b>Marcar atendida</b> la saca de la lista (el bot sigue en silencio unas horas);{" "}
            <b>Devolver al bot</b> hace que el bot vuelva a responder.
          </p>
        </div>

        <BotTranscript sessionId={session.id} className="max-h-[55vh]" />
      </CardContent>
    </Card>
  );
}
