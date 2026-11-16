"use client";

import { CheckCircle2, History, Loader2 } from "lucide-react";

/** Progreso de la importación de chats viejos del celular (webhook `history`, en vivo). */
export function HistorySyncProgress({ integration }: { integration: any }) {
  const sync = integration?.historySync;
  if (!sync) return null;
  const progress = Math.min(100, Math.max(0, Number(sync.progress) || 0));
  const imported = Number(sync.messagesImported) || 0;

  if (sync.status === "declined") {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <History className="h-4 w-4" /> No se compartió el historial: la bandeja arranca con los mensajes nuevos.
      </p>
    );
  }
  if (sync.status === "error") {
    return (
      <p className="flex items-center gap-2 text-sm text-amber-700">
        <History className="h-4 w-4" /> No se pudieron traer los chats viejos ({sync.error || "error de Meta"}). Los
        mensajes nuevos llegan igual.
      </p>
    );
  }
  if (sync.status === "done") {
    return (
      <p className="flex items-center gap-2 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4" /> Chats viejos importados ({imported.toLocaleString("es-AR")} mensajes).
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        {sync.status === "requested"
          ? "Esperando que Meta mande los chats viejos (puede tardar unos minutos)…"
          : `Importando chats viejos… ${imported.toLocaleString("es-AR")} mensajes`}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
