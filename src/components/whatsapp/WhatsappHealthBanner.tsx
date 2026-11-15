"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreDocData } from "reactfire";
import { doc } from "firebase/firestore";
import { AlertTriangle } from "lucide-react";
import collections from "@/lib/collections";

/**
 * Aviso cuando la conexión con WhatsApp se cayó (ej. venció el token de Meta):
 * el bot sigue "contestando" pero los mensajes no salen hasta cargar otro token.
 */
export function WhatsappHealthBanner() {
  const firestore = useFirestore();
  const ref = useMemo(() => doc(firestore, collections.WHATSAPP_INTEGRATION, "default"), [firestore]);
  const { data } = useFirestoreDocData(ref);
  const integration = data as
    | {
        status?: string;
        error?: string | null;
        disconnect?: { requestedBy?: string | null; reason?: string | null; confirmedAt?: unknown } | null;
      }
    | undefined;

  // Meta lo desconectó sin que nadie lo pidiera desde la app (desde el celular
  // o por 14 días sin abrir WhatsApp Business): el agente no recibe nada.
  const droppedByMeta =
    integration?.status === "disconnected" &&
    !!integration.disconnect?.confirmedAt &&
    !integration.disconnect?.requestedBy;
  if (droppedByMeta) {
    const reason = integration?.disconnect?.reason;
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1 min-w-[16rem]">
          <b>WhatsApp desconectado:</b>{" "}
          {reason === "PRIMARY_INACTIVITY"
            ? "Meta cortó la conexión porque no se abrió WhatsApp Business en el celular por 14 días."
            : "se desconectó desde el celular."}{" "}
          El agente no está recibiendo mensajes.
        </span>
        <Link href="/publimar/whatsapp/bot?tab=config" className="font-medium underline underline-offset-2">
          Volver a conectar
        </Link>
      </div>
    );
  }

  if (integration?.status !== "error") return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-[16rem]">
        <b>WhatsApp desconectado:</b> {integration.error || "Meta rechazó el envío"}. Los mensajes no
        están saliendo hasta que vuelvas a conectar el número.
      </span>
      <Link href="/publimar/whatsapp/bot?tab=config" className="font-medium underline underline-offset-2">
        Reconectar
      </Link>
    </div>
  );
}
