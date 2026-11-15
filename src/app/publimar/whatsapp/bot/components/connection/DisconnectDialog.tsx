"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Smartphone, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PHONE_DISCONNECT_STEPS } from "./content";
import { useWhatsappAdminApi } from "./useWhatsappSetup";

/**
 * Desvinculación en dos partes:
 *  1. Desde la app: el número deja de recibir y mandar en el acto (el agente se calla).
 *  2. Con coexistencia, desde el celular: es la baja real del lado de Meta (Meta
 *     no deja hacerla por API). Meta la confirma por webhook y esta pantalla
 *     cambia sola; también se puede chequear a mano o forzar.
 */
export function DisconnectDialog({
  open,
  onOpenChange,
  integration,
  displayPhoneNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: any;
  displayPhoneNumber?: string | null;
}) {
  const api = useWhatsappAdminApi();
  const [busy, setBusy] = useState<null | "start" | "check" | "force">(null);
  const [confirmForce, setConfirmForce] = useState(false);
  const [notYet, setNotYet] = useState(false);

  const status = integration?.status;
  const coexistence = !!integration?.coexistenceEnabled;
  const disconnect = integration?.disconnect;
  const number = displayPhoneNumber || disconnect?.displayPhoneNumber || "el número";

  const run = async (action: "start" | "check" | "force") => {
    setBusy(action);
    setNotYet(false);
    try {
      const data = await api<{ needsPhoneStep?: boolean; confirmed?: boolean }>("disconnect", { body: { action } });
      if (action === "start" && !data.needsPhoneStep) toast.success("Número desvinculado");
      if (action === "check" && !data.confirmed) setNotYet(true);
      if (action === "force") toast.success("Desvinculación terminada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo desvincular");
    } finally {
      setBusy(null);
      setConfirmForce(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlink className="h-5 w-5" /> Desvincular {number}
          </DialogTitle>
          <DialogDescription>Para dejar de usarlo con el agente o conectar otro número.</DialogDescription>
        </DialogHeader>

        {/* Paso 1: confirmar */}
        {(status === "connected" || status === "error") && (
          <div className="space-y-4 text-sm">
            <ul className="list-disc space-y-1 pl-5 text-slate-700">
              <li>El agente deja de contestar y la app deja de recibir mensajes de este número.</li>
              <li>Las charlas que ya están en la bandeja se conservan.</li>
              {coexistence ? (
                <li>
                  En el celular <b>no se pierde nada</b>: WhatsApp Business sigue funcionando igual, con todos los chats.
                </li>
              ) : (
                <li>Este número está conectado solo a la API (sin celular).</li>
              )}
              {coexistence && (
                <li>
                  Después te vamos a pedir un último paso <b>en el celular</b> para que Meta lo libere del todo.
                </li>
              )}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!busy}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={() => run("start")} disabled={!!busy}>
                {busy === "start" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Desvincular
              </Button>
            </div>
          </div>
        )}

        {/* Paso 2: desconectar desde el celular */}
        {status === "disconnecting" && (
          <div className="space-y-4 text-sm">
            <div className="flex gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Listo en la app: el agente ya no recibe ni contesta mensajes de este número.</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="flex items-center gap-2 font-medium">
                <Smartphone className="h-4 w-4" /> Último paso: desconectalo desde el celular
              </p>
              <p className="mt-1 text-slate-600">Es lo que hace que Meta libere el número del todo.</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-slate-700">
                {PHONE_DISCONNECT_STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <p className="mt-3 flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Esperando la confirmación de Meta… esta pantalla se
                actualiza sola.
              </p>
            </div>
            {notYet && (
              <p className="flex gap-2 text-amber-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Meta todavía lo ve conectado. Revisá que hayas tocado &quot;Desconectar&quot; en el celular y probá en
                un minuto.
              </p>
            )}
            {confirmForce ? (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p>
                  Se termina la desvinculación sin esperar a Meta: se borran los datos de conexión de la app. Si no lo
                  desconectás desde el celular, Meta lo sigue viendo vinculado a esta app (no molesta para conectar
                  otro número, pero conviene hacerlo).
                </p>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmForce(false)} disabled={!!busy}>
                    Volver
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => run("force")} disabled={!!busy}>
                    {busy === "force" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Terminar igual
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirmForce(true)} disabled={!!busy}>
                  No me llega la confirmación
                </Button>
                <Button onClick={() => run("check")} disabled={!!busy}>
                  {busy === "check" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Ya lo desconecté
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Terminado */}
        {status === "disconnected" && (
          <div className="space-y-4 text-sm">
            <div className="flex gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {disconnect?.confirmedAt
                    ? "Desvinculado y confirmado por Meta."
                    : "Desvinculado de la app."}
                </p>
                {disconnect?.forced && (
                  <p className="mt-1">
                    Si todavía no lo hiciste, desconectalo también desde el celular: WhatsApp Business → Ajustes →
                    Cuenta → Plataforma empresarial → Desconectar.
                  </p>
                )}
                <p className="mt-1">Ya podés conectar otro número con &quot;Conectar WhatsApp&quot;.</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
