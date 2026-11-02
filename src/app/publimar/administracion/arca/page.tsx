"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "reactfire";
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  CircleDashed,
  Download,
  FileUp,
  FlaskConical,
  KeyRound,
  Loader2,
  PlugZap,
  RefreshCw,
  Save,
  ShieldCheck,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CuitInput } from "@/components/cuit-input";
import { getArcaConfig, getArcaStatus, postArcaConfig, type TArcaStatus } from "@/lib/arca/api";
import { CONDICION_IVA_EMISOR, DEFAULT_UMBRAL_CONSUMIDOR_FINAL } from "@/lib/arca/constants";
import { isValidCuitChecksum } from "@/lib/cuit";
import { cn } from "@/lib/utils";
import type { TArcaEnvironment, TArcaPublicConfig } from "@/types/arca";
import { ArcaGuideDialog, type TGuideTab } from "./ArcaGuideDialog";

const ENV_SHORT: Record<TArcaEnvironment, string> = { homologacion: "Pruebas", produccion: "Producción" };

type TEmisorForm = {
  cuit: string;
  razonSocial: string;
  domicilioComercial: string;
  iibb: string;
  inicioActividades: string;
  puntoVenta: string;
  umbralConsumidorFinal: number;
};

const formFromConfig = (c: TArcaPublicConfig): TEmisorForm => ({
  cuit: c.cuit,
  razonSocial: c.razonSocial,
  domicilioComercial: c.domicilioComercial,
  iibb: c.iibb,
  inicioActividades: c.inicioActividades,
  puntoVenta: c.puntoVenta ? String(c.puntoVenta) : "",
  umbralConsumidorFinal: c.umbralConsumidorFinal || DEFAULT_UMBRAL_CONSUMIDOR_FINAL,
});

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/pkcs10" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const certExpired = (iso?: string) => (iso ? new Date(iso).getTime() < Date.now() : false);
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "");
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function ArcaConfigPage() {
  const { data: user } = useUser();
  const [config, setConfig] = useState<TArcaPublicConfig | null>(null);
  const [form, setForm] = useState<TEmisorForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<TArcaStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [certTab, setCertTab] = useState<TArcaEnvironment>("homologacion");
  const [guide, setGuide] = useState<{ open: boolean; tab: TGuideTab }>({ open: false, tab: "antes" });

  const load = (c: TArcaPublicConfig, resetForm = true) => {
    setConfig(c);
    if (resetForm) setForm(formFromConfig(c));
  };

  useEffect(() => {
    if (!user) return;
    getArcaConfig(user)
      .then((c) => {
        load(c);
        setCertTab(c.environment);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo cargar la configuración"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const openGuide = (tab: TGuideTab) => setGuide({ open: true, tab });

  if (loading || !form || !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const env = config.environment;
  const saved = formFromConfig(config);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof TEmisorForm>(k: K, v: TEmisorForm[K]) => setForm((p) => (p ? { ...p, [k]: v } : p));

  // Estado de cada paso (siempre sobre lo guardado, no sobre lo que se está tipeando).
  const activeCert = config.certs[env];
  const emisorOk = isValidCuitChecksum(config.cuit) && !!config.razonSocial && !!config.domicilioComercial;
  const certOk = activeCert.hasCert && !certExpired(activeCert.certExpiresAt);
  const pvOk = config.puntoVenta > 0;
  const connOk =
    !!status && status.environment === env && status.wsfeServer.ok && status.wsfeAuth.ok && status.padron.ok;
  const steps = [
    { id: "emisor", label: "Datos del emisor y punto de venta", done: emisorOk && pvOk },
    { id: "certificado", label: `Certificado de ${ENV_SHORT[env].toLowerCase()}`, done: certOk },
    { id: "conexion", label: "Prueba de conexión", done: connOk },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const save = async (environment: TArcaEnvironment = env) => {
    if (form.cuit && !isValidCuitChecksum(form.cuit)) {
      toast.error("El CUIT del emisor no es válido");
      return;
    }
    setSaving(true);
    try {
      const { config: c } = await postArcaConfig(user, {
        action: "save",
        ...form,
        environment,
        puntoVenta: Number(form.puntoVenta) || 0,
      });
      load(c);
      if (environment !== env) setStatus(null);
      toast.success(environment !== env ? `Ambiente: ${ENV_SHORT[environment]}` : "Datos guardados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const switchEnvironment = (next: TArcaEnvironment) => {
    if (next === env || saving) return;
    if (
      next === "produccion" &&
      !window.confirm("Vas a pasar a PRODUCCIÓN: desde ahora las facturas emitidas tienen validez fiscal. ¿Continuar?")
    ) {
      return;
    }
    setCertTab(next);
    save(next);
  };

  const check = async () => {
    setChecking(true);
    try {
      setStatus(await getArcaStatus(user));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo conectar con ARCA");
      setStatus(null);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturación electrónica ARCA</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Factura A/B y notas de crédito con el CUIT de Banderas, y validación de CUITs en el padrón.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => openGuide("antes")}>
            <BookOpen className="h-4 w-4 mr-1.5" />
            Cómo configurar ARCA
          </Button>
          <Button asChild variant="ghost">
            <Link href="/publimar/administracion">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Volver
            </Link>
          </Button>
        </div>
      </div>

      {!config.encryptionConfigured && (
        <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Falta la variable ARCA_ENCRYPTION_KEY en el servidor</p>
            <p>
              Cargala en el hosting (<code>openssl rand -base64 32</code>) y volvé a deployar. Sin ella no se puede
              generar el certificado.
            </p>
          </div>
        </div>
      )}

      {/* Resumen de avance */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {doneCount === steps.length ? (
                <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700 text-sm font-bold">
                  {doneCount}/{steps.length}
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-900">
                  {doneCount === steps.length
                    ? `Listo para facturar en ${ENV_SHORT[env].toLowerCase()}`
                    : `Faltan ${steps.length - doneCount} paso${steps.length - doneCount === 1 ? "" : "s"} para facturar`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {doneCount === steps.length
                    ? env === "produccion"
                      ? "Las facturas tienen validez fiscal."
                      : "Las facturas salen sin validez fiscal. Cuando termines las pruebas, configurá producción."
                    : "Seguí los pasos en orden. Lo que se hace en la web de ARCA está en la guía."}
                </p>
              </div>
            </div>
            <EnvPill env={env} />
          </div>

          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${(doneCount / steps.length) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50",
                  s.done ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200",
                )}
              >
                <StepDot n={i + 1} done={s.done} />
                <span className={cn("font-medium", s.done ? "text-emerald-900" : "text-slate-700")}>{s.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna principal */}
        <div className="space-y-6 lg:col-span-2">
          {/* Paso 1: emisor */}
          <Card id="emisor" className="border-0 shadow-sm scroll-mt-6">
            <SectionHeader
              n={1}
              title="Datos del emisor"
              description="Salen impresos en cada factura. Tienen que coincidir con los de ARCA."
              done={emisorOk && pvOk}
            />
            <CardContent className="space-y-6 pt-0">
              <FieldGroup title="Identificación">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="CUIT" hint={form.cuit && !isValidCuitChecksum(form.cuit) ? "CUIT inválido" : undefined} error>
                    <CuitInput value={form.cuit} onValueChange={(d) => set("cuit", d)} />
                  </Field>
                  <Field label="Razón social">
                    <Input value={form.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} />
                  </Field>
                  <Field label="Domicilio comercial" className="sm:col-span-2">
                    <Input
                      value={form.domicilioComercial}
                      onChange={(e) => set("domicilioComercial", e.target.value)}
                      placeholder="Calle, número, localidad, provincia"
                    />
                  </Field>
                  <Field label="Condición frente al IVA">
                    <div className="flex h-9 items-center rounded-md border bg-slate-50 px-3 text-sm text-slate-600">
                      {CONDICION_IVA_EMISOR}
                    </div>
                  </Field>
                </div>
              </FieldGroup>

              <FieldGroup title="Datos fiscales">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Ingresos Brutos">
                    <Input value={form.iibb} onChange={(e) => set("iibb", e.target.value)} placeholder="N° o Convenio Multilateral" />
                  </Field>
                  <Field label="Inicio de actividades">
                    <Input
                      type="date"
                      value={form.inicioActividades}
                      onChange={(e) => set("inicioActividades", e.target.value)}
                    />
                  </Field>
                </div>
              </FieldGroup>

              <FieldGroup title="Facturación">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="Punto de venta"
                    hint={
                      <>
                        De tipo Web Services, distinto al de Comprobantes en línea.{" "}
                        <button type="button" className="text-blue-700 hover:underline" onClick={() => openGuide("produccion")}>
                          ¿Cómo lo creo?
                        </button>
                      </>
                    }
                  >
                    <Input
                      inputMode="numeric"
                      value={form.puntoVenta}
                      onChange={(e) => set("puntoVenta", e.target.value.replace(/\D/g, ""))}
                      placeholder="Ej: 3"
                    />
                  </Field>
                  <Field
                    label="Factura B a consumidor final sin DNI, hasta"
                    hint="Desde ese monto ARCA exige identificar al comprador. Confirmalo con el contador."
                  >
                    <MoneyInput value={form.umbralConsumidorFinal} onValueChange={(n) => set("umbralConsumidorFinal", n)} />
                  </Field>
                </div>
              </FieldGroup>

              <div className="flex items-center justify-end gap-3 border-t pt-4">
                {dirty && <span className="text-xs text-amber-700">Hay cambios sin guardar</span>}
                <Button onClick={() => save()} disabled={saving || !dirty}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                  Guardar datos
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Paso 2: certificado */}
          <Card id="certificado" className="border-0 shadow-sm scroll-mt-6">
            <SectionHeader
              n={2}
              title="Certificado digital"
              description="Con él la app se identifica ante ARCA. Cada ambiente tiene el suyo."
              done={certOk}
            />
            <CardContent className="pt-0">
              <Tabs value={certTab} onValueChange={(v) => setCertTab(v as TArcaEnvironment)}>
                <TabsList className="grid w-full grid-cols-2 sm:w-80">
                  {(["homologacion", "produccion"] as TArcaEnvironment[]).map((e) => (
                    <TabsTrigger key={e} value={e} className="gap-1.5">
                      {ENV_SHORT[e]}
                      {config.certs[e].hasCert && !certExpired(config.certs[e].certExpiresAt) && (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {(["homologacion", "produccion"] as TArcaEnvironment[]).map((e) => (
                  <TabsContent key={e} value={e} className="pt-4">
                    <CertificatePanel
                      environment={e}
                      config={config}
                      disabled={!config.encryptionConfigured}
                      emisorReady={!!config.cuit && !!config.razonSocial}
                      onConfig={(c) => load(c, !dirty)}
                      onOpenGuide={() => openGuide(e)}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Columna lateral */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 space-y-3">
              <div>
                <p className="font-semibold text-slate-900">Ambiente activo</p>
                <p className="text-xs text-muted-foreground">Con cuál se emiten las facturas desde órdenes y ventas.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["homologacion", "produccion"] as TArcaEnvironment[]).map((e) => (
                  <button
                    key={e}
                    type="button"
                    disabled={saving}
                    onClick={() => switchEnvironment(e)}
                    className={cn(
                      "rounded-lg border-2 px-3 py-2.5 text-left transition-colors disabled:opacity-60",
                      env === e
                        ? e === "produccion"
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-amber-400 bg-amber-50"
                        : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      {e === "produccion" ? <ShieldCheck className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
                      {ENV_SHORT[e]}
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      {e === "produccion" ? "Con validez fiscal" : "Sin validez fiscal"}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card id="conexion" className="border-0 shadow-sm scroll-mt-6">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 flex items-center gap-2">
                    <StepDot n={3} done={connOk} />
                    Prueba de conexión
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Verifica certificado, servicios y punto de venta en {ENV_SHORT[env].toLowerCase()}.</p>
                </div>
              </div>
              <Button className="w-full" variant={connOk ? "outline" : "default"} onClick={check} disabled={checking}>
                {checking ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PlugZap className="h-4 w-4 mr-1.5" />}
                {status ? "Volver a probar" : "Probar conexión"}
              </Button>
              {status && (
                <div className="space-y-2.5">
                  {(
                    [
                      ["Servidores de ARCA", status.wsfeServer],
                      ["Facturación (wsfe)", status.wsfeAuth],
                      ["Padrón (validar CUIT)", status.padron],
                    ] as const
                  ).map(([label, item]) => (
                    <div key={label} className="flex items-start gap-2 text-sm">
                      {item.ok ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground break-words">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                  {!connOk && (
                    <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={() => openGuide("problemas")}>
                      Ver problemas comunes
                    </button>
                  )}
                  {status.ultimos.length > 0 && (
                    <div className="rounded-md border divide-y text-xs">
                      <p className="px-3 py-1.5 font-medium text-slate-500">Últimos números autorizados</p>
                      {status.ultimos.map((u) => (
                        <div key={u.tipo} className="flex justify-between px-3 py-1.5">
                          <span>{u.tipo}</span>
                          <span className="font-mono">{u.ultimo}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-blue-50/60">
            <CardContent className="p-5 space-y-2">
              <p className="font-semibold text-slate-900 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-700" />
                ¿Primera vez?
              </p>
              <p className="text-sm text-slate-600">
                La guía explica qué hacer en la web de ARCA para pruebas y para producción, con los errores más comunes.
              </p>
              <Button variant="outline" size="sm" className="bg-white" onClick={() => openGuide("homologacion")}>
                Abrir la guía
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ArcaGuideDialog
        open={guide.open}
        onOpenChange={(open) => setGuide((g) => ({ ...g, open }))}
        tab={guide.tab}
        onTabChange={(tab) => setGuide((g) => ({ ...g, tab }))}
      />
    </div>
  );
}

// --------------------------------------------------------------------------

function EnvPill({ env }: { env: TArcaEnvironment }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-semibold",
        env === "produccion" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
      )}
    >
      {env === "produccion" ? <ShieldCheck className="h-3.5 w-3.5" /> : <FlaskConical className="h-3.5 w-3.5" />}
      {env === "produccion" ? "Producción" : "Pruebas (homologación)"}
    </span>
  );
}

function StepDot({ n, done }: { n: number; done: boolean }) {
  return done ? (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
      <Check className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-xs font-semibold text-slate-500">
      {n}
    </span>
  );
}

function SectionHeader({
  n,
  title,
  description,
  done,
}: {
  n: number;
  title: string;
  description: string;
  done: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-5 pb-4">
      <div className="flex items-start gap-3">
        <StepDot n={n} done={done} />
        <div>
          <h2 className="font-semibold text-slate-900 leading-6">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
          done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600",
        )}
      >
        {done ? "Completo" : "Pendiente"}
      </span>
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className={cn("text-xs", error ? "text-red-600" : "text-muted-foreground")}>{hint}</p>}
    </div>
  );
}

function CertificatePanel({
  environment,
  config,
  disabled,
  emisorReady,
  onConfig,
  onOpenGuide,
}: {
  environment: TArcaEnvironment;
  config: TArcaPublicConfig;
  disabled: boolean;
  emisorReady: boolean;
  onConfig: (c: TArcaPublicConfig) => void;
  onOpenGuide: () => void;
}) {
  const { data: user } = useUser();
  const info = config.certs[environment];
  const [alias, setAlias] = useState("banderas-app");
  const [certPem, setCertPem] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState<"csr" | "cert" | null>(null);
  const expired = certExpired(info.certExpiresAt);
  const ready = info.hasCert && !expired;
  const where = environment === "homologacion" ? "WSASS" : "Administración de Certificados Digitales";

  const generate = async () => {
    if (info.hasCert && !window.confirm("Un CSR nuevo invalida el certificado actual de este ambiente. ¿Continuar?")) return;
    setBusy("csr");
    try {
      const { config: c, csrPem } = await postArcaConfig(user, { action: "generateCsr", environment, alias });
      onConfig(c);
      if (csrPem) downloadText(`banderas-${environment}.csr`, csrPem);
      toast.success("Pedido generado: se descargó el archivo .csr");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el CSR");
    } finally {
      setBusy(null);
    }
  };

  const upload = async (pem = certPem) => {
    if (!pem.trim()) return;
    setBusy("cert");
    try {
      const { config: c } = await postArcaConfig(user, { action: "uploadCert", environment, certPem: pem });
      onConfig(c);
      setCertPem("");
      setShowPaste(false);
      toast.success("Certificado cargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el certificado");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Estado */}
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border px-4 py-3",
          ready
            ? "border-emerald-200 bg-emerald-50"
            : expired
            ? "border-red-200 bg-red-50"
            : info.hasCsr
            ? "border-amber-200 bg-amber-50"
            : "border-slate-200 bg-slate-50",
        )}
      >
        {ready ? (
          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
        ) : expired ? (
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
        ) : (
          <KeyRound className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
        )}
        <div className="text-sm min-w-0">
          <p className="font-semibold text-slate-900">
            {ready
              ? `Certificado cargado · vence el ${fmtDate(info.certExpiresAt)}`
              : expired
              ? `Certificado vencido el ${fmtDate(info.certExpiresAt)}`
              : info.hasCsr
              ? "Pedido generado: falta cargar el certificado de ARCA"
              : "Sin configurar"}
          </p>
          <p className="text-slate-600 break-words">
            {ready
              ? info.certSubject
              : expired
              ? "Generá un pedido nuevo y repetí el trámite en ARCA."
              : info.hasCsr
              ? `Subí el .csr en ${where} y pegá acá el certificado que devuelve.`
              : "Empezá generando el pedido de certificado."}
          </p>
        </div>
      </div>

      <ol className="space-y-5">
        <SubStep n="A" title="Generar el pedido de certificado (CSR)" done={info.hasCsr} active={!info.hasCsr}>
          {!emisorReady && (
            <p className="text-xs text-amber-700">Primero guardá CUIT y razón social en Datos del emisor.</p>
          )}
          {info.hasCsr ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => downloadText(`banderas-${environment}.csr`, info.csrPem!)}>
                <Download className="h-4 w-4 mr-1.5" />
                Descargar .csr
              </Button>
              <Button size="sm" variant="ghost" onClick={generate} disabled={disabled || busy !== null || !emisorReady}>
                {busy === "csr" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                Generar uno nuevo
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Nombre (alias)" className="sm:max-w-[220px]" />
              <Button onClick={generate} disabled={disabled || busy !== null || !emisorReady}>
                {busy === "csr" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <KeyRound className="h-4 w-4 mr-1.5" />}
                Generar y descargar .csr
              </Button>
            </div>
          )}
        </SubStep>

        <SubStep n="B" title={`Crear el certificado en ARCA (${where})`} done={info.hasCert} active={info.hasCsr && !info.hasCert}>
          <p className="text-sm text-muted-foreground">
            {environment === "homologacion"
              ? "Con el .csr se crea el certificado en WSASS y se lo autoriza para wsfe y ws_sr_constancia_inscripcion."
              : "Se sube el .csr, se descarga el .crt y se lo asocia a Facturación Electrónica y a Consulta a Padrón."}
          </p>
          <Button size="sm" variant="outline" onClick={onOpenGuide}>
            <BookOpen className="h-4 w-4 mr-1.5" />
            Ver paso a paso
          </Button>
        </SubStep>

        <SubStep n="C" title="Cargar el certificado" done={ready} active={info.hasCsr && !ready} last>
          {ready && !showPaste ? (
            <Button size="sm" variant="ghost" onClick={() => setShowPaste(true)} disabled={!info.hasKey}>
              Reemplazar certificado
            </Button>
          ) : (
            <div className="space-y-2">
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors",
                  info.hasKey && !disabled ? "border-slate-300 hover:border-blue-400 hover:bg-blue-50/40" : "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="file"
                  accept=".crt,.pem,.cer,.txt"
                  className="hidden"
                  disabled={!info.hasKey || disabled || busy !== null}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) upload(await f.text());
                  }}
                />
                {busy === "cert" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                ) : (
                  <FileUp className="h-5 w-5 text-slate-500" />
                )}
                <span className="text-sm font-medium text-slate-700">Subir el archivo .crt</span>
                <span className="text-xs text-muted-foreground">
                  {info.hasKey ? "o pegá el texto del certificado abajo" : "Disponible después de generar el pedido"}
                </span>
              </label>
              {info.hasKey && (
                <>
                  <Textarea
                    rows={3}
                    value={certPem}
                    onChange={(e) => setCertPem(e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----"
                    className="font-mono text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    {ready && (
                      <Button size="sm" variant="ghost" onClick={() => setShowPaste(false)}>
                        Cancelar
                      </Button>
                    )}
                    <Button size="sm" onClick={() => upload()} disabled={disabled || !certPem.trim() || busy !== null}>
                      Guardar certificado
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </SubStep>
      </ol>
    </div>
  );
}

function SubStep({
  n,
  title,
  done,
  active,
  last,
  children,
}: {
  n: string;
  title: string;
  done: boolean;
  active: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            done ? "bg-emerald-500 text-white" : active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500",
          )}
        >
          {done ? <Check className="h-4 w-4" /> : n}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-slate-200" />}
      </div>
      <div className={cn("flex-1 space-y-2 pb-1", !done && !active && "opacity-70")}>
        <p className="font-medium text-slate-900 leading-7 flex items-center gap-2">
          {title}
          {!done && !active && <CircleDashed className="h-3.5 w-3.5 text-slate-400" />}
        </p>
        {children}
      </div>
    </li>
  );
}
