"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  FOURTEEN_DAY_RULE,
  HOW_IT_WORKS,
  HOW_TO_DISCONNECT,
  META_STEPS,
  REQUIREMENTS,
  WHAT_CHANGES,
} from "./content";
import { SignupError, useEmbeddedSignup } from "./useEmbeddedSignup";
import { TSetupStatus, useWhatsappAdminApi } from "./useWhatsappSetup";
import { HistorySyncProgress } from "./HistorySyncProgress";

const STEPS = ["Cómo funciona", "Qué necesitás", "Qué vas a ver", "Conectar", "Listo"];

type TConnectResult = {
  displayPhoneNumber?: string;
  verifiedName?: string;
  coexistence: boolean;
  contactsSyncError?: string | null;
  historySyncError?: string | null;
};

/** Explicación de la coexistencia (paso 1, y "Ver cómo funciona" desde la tarjeta). */
export function HowItWorks({ handoffHours }: { handoffHours: number }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {HOW_IT_WORKS.map((item) => (
          <div key={item.title} className="rounded-lg border bg-white p-3">
            <p className="font-medium text-sm">
              <span className="mr-1.5">{item.icon}</span>
              {item.title}
            </p>
            <p className="mt-1 text-sm text-slate-600">{item.text.replace("{horas}", String(handoffHours))}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-medium">Qué cambia en el celular</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {WHAT_CHANGES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <b>Importante:</b> {FOURTEEN_DAY_RULE}
        </p>
      </div>
      <p className="text-sm text-slate-500">{HOW_TO_DISCONNECT}</p>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold",
              i < step && "border-green-600 bg-green-600 text-white",
              i === step && "border-slate-900 bg-slate-900 text-white",
              i > step && "border-slate-300 text-slate-400"
            )}
          >
            {i < step ? "✓" : i + 1}
          </span>
          <span className={cn(i === step ? "font-medium text-slate-900" : "text-slate-500", "hidden sm:inline")}>
            {label}
          </span>
          {i < STEPS.length - 1 && <span className="hidden text-slate-300 sm:inline">—</span>}
        </li>
      ))}
    </ol>
  );
}

export function ConnectionWizard({
  open,
  onOpenChange,
  setup,
  setupLoading,
  onRefreshSetup,
  integration,
  handoffHours,
  canSeeTechSetup,
  onOpenTechSetup,
  readOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setup: TSetupStatus | null;
  setupLoading: boolean;
  onRefreshSetup: () => void;
  integration: any;
  handoffHours: number;
  canSeeTechSetup: boolean;
  onOpenTechSetup: () => void;
  /** Solo la explicación (botón "Ver cómo funciona"). */
  readOnly?: boolean;
}) {
  const api = useWhatsappAdminApi();
  const { sdkReady, launch } = useEmbeddedSignup(setup?.appId ?? null, setup?.graphVersion ?? "v21.0");
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<"idle" | "meta" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TConnectResult | null>(null);

  // Cada vez que se abre arranca de cero (salvo que esté a mitad de conectar).
  useEffect(() => {
    if (open && phase === "idle") {
      setStep(0);
      setError(null);
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allChecked = REQUIREMENTS.every((r) => checked[r.id]);
  const busy = phase !== "idle";

  const connect = () => {
    if (!setup?.configId) return;
    setError(null);
    setPhase("meta");
    // launch() abre el popup en este mismo click (sin await antes).
    launch(setup.configId)
      .then(async (signup) => {
        setPhase("saving");
        const data = await api<TConnectResult>("embedded-signup", { body: signup });
        setResult(data);
        setStep(4);
        toast.success(`WhatsApp conectado${data.displayPhoneNumber ? `: ${data.displayPhoneNumber}` : ""}`);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "No se pudo conectar");
        if (e instanceof SignupError && e.kind === "cancel") return;
        console.error("[whatsapp] embedded signup:", e);
      })
      .finally(() => setPhase("idle"));
  };

  if (readOnly) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cómo funciona WhatsApp con el agente</DialogTitle>
            <DialogDescription>Coexistencia: el mismo número en tu celular y en la app.</DialogDescription>
          </DialogHeader>
          <HowItWorks handoffHours={handoffHours} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conectar el WhatsApp del negocio</DialogTitle>
          <DialogDescription>Paso a paso. Tu número sigue funcionando en el celular.</DialogDescription>
        </DialogHeader>
        <Stepper step={step} />

        <div className="min-h-[18rem]">
          {step === 0 && <HowItWorks handoffHours={handoffHours} />}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Tildá cada punto cuando lo tengas listo.</p>
              {REQUIREMENTS.map((r) => (
                <label
                  key={r.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                    checked[r.id] ? "border-green-300 bg-green-50" : "bg-white hover:bg-slate-50"
                  )}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={!!checked[r.id]}
                    onCheckedChange={(v) => setChecked((c) => ({ ...c, [r.id]: v === true }))}
                  />
                  <div>
                    <p className="text-sm font-medium">{r.title}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
                      {r.help.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  </div>
                </label>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Cuando toques <b>Abrir Meta</b> se abre una ventana de Facebook. Esto es lo que vas a ver, en orden:
              </p>
              <ol className="space-y-2">
                {META_STEPS.map((s, i) => (
                  <li
                    key={s.title}
                    className={cn("flex gap-3 rounded-lg border p-3", s.warning ? "border-red-200 bg-red-50" : "bg-white")}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                      {i + 1}
                    </span>
                    <div className="text-sm">
                      <p className="font-medium">{s.title}</p>
                      <p className="text-slate-600">{s.text}</p>
                      {s.warning && (
                        <p className="mt-1 flex gap-1.5 font-medium text-red-700">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          {s.warning}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {setupLoading && !setup ? (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Revisando la configuración…
                </p>
              ) : !setup?.ready ? (
                <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" /> Falta terminar la configuración técnica de Meta
                  </p>
                  <p>
                    Es un paso que se hace una sola vez, antes de conectar el número.{" "}
                    {canSeeTechSetup
                      ? "Abrí la configuración técnica y seguí los puntos en rojo."
                      : "Pedile al administrador del sistema que la complete."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {canSeeTechSetup && (
                      <Button size="sm" variant="outline" onClick={onOpenTechSetup}>
                        Abrir configuración técnica
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={onRefreshSetup} disabled={setupLoading}>
                      <RefreshCw className={cn("mr-1 h-4 w-4", setupLoading && "animate-spin")} /> Volver a revisar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border bg-white p-4 text-sm">
                    <p className="font-medium">Todo listo para conectar</p>
                    <p className="mt-1 text-slate-600">
                      Tené el celular a mano. Se abre la ventana de Meta: seguí los pasos que viste antes y acordate de
                      elegir <b>&quot;Conectar tu app de WhatsApp Business existente&quot;</b>.
                    </p>
                  </div>
                  {phase === "meta" && (
                    <p className="flex items-center gap-2 text-sm text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin" /> Esperando que termines en la ventana de Meta…
                    </p>
                  )}
                  {phase === "saving" && (
                    <p className="flex items-center gap-2 text-sm text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin" /> Recibimos los datos. Conectando el número y pidiendo
                      tus chats y contactos…
                    </p>
                  )}
                  {error && (
                    <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{error}</p>
                    </div>
                  )}
                  <Button size="lg" onClick={connect} disabled={busy || !sdkReady}>
                    {busy || !sdkReady ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ExternalLink className="mr-2 h-4 w-4" />
                    )}
                    {!sdkReady ? "Cargando Meta…" : error ? "Reintentar" : "Abrir Meta"}
                  </Button>
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
                <div className="text-sm">
                  <p className="font-medium text-green-900">
                    ¡Listo! {result?.displayPhoneNumber || "El número"} quedó conectado
                    {result?.verifiedName ? ` (${result.verifiedName})` : ""}.
                  </p>
                  {result?.coexistence ? (
                    <p className="text-green-800">
                      Coexistencia activa: el número sigue en tu celular y el agente ya puede contestar.
                    </p>
                  ) : (
                    <p className="text-amber-800">
                      Meta no lo marcó como coexistencia: puede que se haya elegido otra opción en la ventana. Revisá
                      que WhatsApp Business siga funcionando en el celular.
                    </p>
                  )}
                </div>
              </div>
              {result?.coexistence && <HistorySyncProgress integration={integration} />}
              {result?.contactsSyncError && (
                <p className="text-xs text-amber-700">
                  No pudimos pedir la agenda del celular ({result.contactsSyncError}). Los nombres se toman del perfil
                  de WhatsApp.
                </p>
              )}
              <div className="rounded-lg border bg-white p-4 text-sm">
                <p className="font-medium">Probalo</p>
                <p className="mt-1 text-slate-600">
                  Mandá un mensaje al número desde otro celular: tiene que aparecer en el celular y en la bandeja, y el
                  agente lo contesta. Después respondé vos desde el celular y fijate que el agente se calla con ese
                  cliente.
                </p>
              </div>
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{FOURTEEN_DAY_RULE}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          {step > 0 && step < 4 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Atrás
            </Button>
          ) : (
            <span />
          )}
          {step < 3 && (
            <Button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !allChecked}>
              {step === 0 ? "Entendido, sigamos" : step === 1 ? "Tengo todo" : "Ya sé qué hacer"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          {step === 4 && <Button onClick={() => onOpenChange(false)}>Cerrar</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
