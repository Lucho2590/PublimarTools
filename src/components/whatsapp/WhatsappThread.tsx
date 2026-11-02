"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFirestore, useFirestoreCollectionData, useFirestoreDocData } from "reactfire";
import { collection, doc, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCheck, Clock, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import collections from "@/lib/collections";
import { isWithinServiceWindow } from "@/lib/whatsapp/outboundHelpers";
import { WaText, toDate } from "@/app/publimar/whatsapp/bot/components/shared";
import { EWhatsappMessageDirection, EWhatsappMessageStatus, TWhatsappMessageDoc } from "@/types/whatsapp";

/** Motivo del fallo en criollo (los de Meta vienen en inglés). */
function failReason(m: TWhatsappMessageDoc): string {
  if (m.errorCode === "190") return "venció el token de Meta";
  if (m.errorCode === "131030") return "el número no está habilitado en la cuenta de prueba";
  if (m.errorCode === "131047") return "pasaron más de 24 h desde el último mensaje del cliente";
  return m.errorMessage || "error de envío";
}

function StatusIcon({ status }: { status: EWhatsappMessageStatus }) {
  if (status === EWhatsappMessageStatus.PENDING) return <Clock className="h-3 w-3" />;
  if (status === EWhatsappMessageStatus.SENT) return <Check className="h-3 w-3" />;
  if (status === EWhatsappMessageStatus.DELIVERED) return <CheckCheck className="h-3 w-3" />;
  if (status === EWhatsappMessageStatus.READ) return <CheckCheck className="h-3 w-3 text-sky-500" />;
  return null;
}

/**
 * Charla real de WhatsApp (lo que efectivamente entró y salió por Meta), con el
 * estado de cada mensaje y para responder desde la app. Al responder una
 * persona, el bot se pausa con ese cliente (lo hace el endpoint de envío).
 */
export function WhatsappThread({ contactId, className }: { contactId: string; className?: string }) {
  const firestore = useFirestore();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const messagesQuery = useMemo(
    () => query(collection(firestore, collections.WHATSAPP_MESSAGES), where("contactId", "==", contactId)),
    [firestore, contactId]
  );
  const { status, data } = useFirestoreCollectionData(messagesQuery, { idField: "id" });
  // Orden acá (evita un índice compuesto); últimos 150.
  const messages = useMemo(
    () =>
      ((data as TWhatsappMessageDoc[] | undefined) || [])
        .filter((m) => !m.deletedAt)
        .sort((a, b) => (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0))
        .slice(-150),
    [data]
  );

  const contactRef = useMemo(() => doc(firestore, collections.WHATSAPP_CONTACTS, contactId), [firestore, contactId]);
  const { data: contact } = useFirestoreDocData(contactRef);
  const lastInboundMs = toDate((contact as any)?.lastInboundAt)?.getTime() ?? null;
  const windowOpen = isWithinServiceWindow(lastInboundMs, Date.now());

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, contactId]);

  const send = async () => {
    const body = text.trim();
    if (!body || !user || sending) return;
    setSending(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/whatsapp/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ contactId, text: body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.code === "190" ? "No se envió: venció el token de Meta" : json.error || "No se pudo enviar");
      } else {
        setText(""); // aparece solo por el listener en tiempo real
      }
    } catch {
      toast.error("Error de red al enviar");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className={`overflow-y-auto bg-[#efeae2] p-4 space-y-2 ${className || ""}`}>
        {messages.map((m) => {
          const outbound = m.direction === EWhatsappMessageDirection.OUTBOUND;
          const time = toDate(m.createdAt)?.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
          if (!outbound) {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-lg bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">
                  {m.content ? <WaText text={m.content} /> : <span className="italic text-slate-600">[{m.type}]</span>}
                  <span className="block text-right text-[10px] text-slate-500 mt-0.5">{time}</span>
                </div>
              </div>
            );
          }
          const failed = m.status === EWhatsappMessageStatus.FAILED;
          const who = m.metadata?.bot
            ? "🤖 Agente"
            : m.metadata?.isEcho
              ? "Desde el celular"
              : m.senderName || "Equipo";
          return (
            <div key={m.id} className="flex justify-start">
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${failed ? "bg-red-50 border border-red-200" : "bg-white"}`}
              >
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 mb-0.5">
                  {m.metadata?.isEcho ? <Smartphone className="h-3 w-3" /> : null}
                  {who}
                </span>
                <WaText text={m.content || ""} />
                <span className="flex items-center justify-end gap-1 text-[10px] text-slate-500 mt-0.5">
                  {time}
                  <StatusIcon status={m.status} />
                </span>
                {failed && (
                  <span className="flex items-center gap-1 text-xs text-red-700 mt-1">
                    <AlertTriangle className="h-3 w-3" /> No se envió: {failReason(m)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {status !== "loading" && !messages.length && (
          <p className="text-center text-sm text-slate-500">Sin mensajes registrados.</p>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t">
        {windowOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2"
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribile al cliente… (el bot se pausa con este cliente)"
              disabled={sending}
            />
            <Button type="submit" disabled={sending || !text.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <p className="text-center text-xs text-slate-500 py-1.5">
            Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp solo deja escribirle con una
            plantilla aprobada.
          </p>
        )}
      </div>
    </>
  );
}
