"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, Copy, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECH_NOTES, TECH_STEPS } from "./content";
import { TSetupStatus } from "./useWhatsappSetup";

function CopyValue({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <code className="break-all rounded bg-slate-100 px-1">{value}</code>
      <button
        type="button"
        className="text-slate-400 hover:text-slate-700"
        title="Copiar"
        onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copiado"))}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/**
 * Configuración técnica de Meta (una sola vez): cada punto se chequea solo
 * contra el servidor y contra Meta; los que fallan despliegan sus instrucciones.
 */
export function TechSetupPanel({
  setup,
  loading,
  error,
  onRefresh,
}: {
  setup: TSetupStatus | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const webhookUrl = setup?.webhook.expectedUrl || "";
  const visible = (setup?.checks || []).filter((c) => TECH_STEPS[c.id]);
  const pending = visible.filter((c) => !c.ok);
  // Solo se despliega el primer punto pendiente: de a uno, sin abrumar.
  const firstPendingId = pending[0]?.id;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {setup
            ? pending.length
              ? `Faltan ${pending.length} de ${visible.length} puntos. Se hace una sola vez, en el panel de Meta y en Vercel.`
              : "Todo configurado."
            : "Se hace una sola vez, en el panel de Meta y en Vercel."}
        </p>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("mr-1 h-4 w-4", loading && "animate-spin")} /> Volver a revisar
        </Button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading && !setup && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Revisando…
        </p>
      )}
      {setup && (
        <ul className="space-y-2">
          {setup.checks.map((check) => {
            const info = TECH_STEPS[check.id];
            if (!info) return null;
            const expanded = openIds[check.id] ?? check.id === firstPendingId;
            return (
              <li key={check.id} className={cn("rounded-lg border", check.ok ? "bg-white" : "border-red-200 bg-red-50")}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 p-3 text-left text-sm"
                  onClick={() => setOpenIds((o) => ({ ...o, [check.id]: !expanded }))}
                >
                  {check.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                  )}
                  <span className="flex-1 font-medium">{info.title}</span>
                  <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", expanded && "rotate-180")} />
                </button>
                {expanded && (
                  <div className="space-y-2 px-3 pb-3 pl-9 text-sm text-slate-700">
                    {check.detail && <p className="text-xs text-slate-500">{check.detail}</p>}
                    <ol className="list-decimal space-y-1 pl-4">
                      {info.steps.map((s) => (
                        <li key={s}>
                          {s.includes("{webhookUrl}") ? (
                            <>
                              {s.split("{webhookUrl}")[0]}
                              <CopyValue value={webhookUrl} />
                            </>
                          ) : (
                            s
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
        {TECH_NOTES.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
