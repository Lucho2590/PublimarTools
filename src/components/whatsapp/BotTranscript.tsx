"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, where } from "firebase/firestore";
import collections from "@/lib/collections";
import { WaText, toDate } from "@/app/publimar/whatsapp/bot/components/shared";
import { TBotTurn } from "@/types/bot";

/**
 * Charla de una sesión del bot, estilo WhatsApp (cliente a la derecha, bot a la
 * izquierda), armada con el log de turnos. La usan Chat y Atender.
 */
export function BotTranscript({ sessionId, className }: { sessionId: string; className?: string }) {
  const firestore = useFirestore();
  const turnsQuery = useMemo(
    () => query(collection(firestore, collections.BOT_TURNS), where("sessionId", "==", sessionId)),
    [firestore, sessionId]
  );
  const { status, data } = useFirestoreCollectionData(turnsQuery, { idField: "id" });
  // Últimos 80 en orden (se ordena acá: evita un índice compuesto).
  const turns = useMemo(
    () =>
      ((data as TBotTurn[] | undefined) || [])
        .slice()
        .sort((a, b) => (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0))
        .slice(-80),
    [data]
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length, sessionId]);

  return (
    <div className={`overflow-y-auto bg-[#efeae2] p-4 space-y-2 ${className || ""}`}>
      {turns.map((t) => (
        <div key={t.id} className="space-y-1">
          {(t.text || t.replyId) && (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-lg bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">
                {t.text || <span className="italic text-slate-600">(eligió una opción)</span>}
                <span className="block text-right text-[10px] text-slate-500 mt-0.5">
                  {toDate(t.createdAt)?.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          )}
          {t.replyPreview && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                <WaText text={t.replyPreview.split(" | ").join("\n\n")} />
              </div>
            </div>
          )}
        </div>
      ))}
      {status !== "loading" && !turns.length && (
        <p className="text-center text-sm text-slate-500">Sin mensajes registrados.</p>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
