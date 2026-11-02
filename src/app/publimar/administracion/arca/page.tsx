"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "reactfire";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  KeyRound,
  Loader2,
  PlugZap,
  Save,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CuitInput } from "@/components/cuit-input";
import { getArcaConfig, getArcaStatus, postArcaConfig, type TArcaStatus } from "@/lib/arca/api";
import { DEFAULT_UMBRAL_CONSUMIDOR_FINAL } from "@/lib/arca/constants";
import { cn } from "@/lib/utils";
import type { TArcaEnvironment, TArcaPublicConfig } from "@/types/arca";

const ENV_LABEL: Record<TArcaEnvironment, string> = {
  homologacion: "Homologación (pruebas)",
  produccion: "Producción",
};

type TEmisorForm = {
  cuit: string;
  razonSocial: string;
  domicilioComercial: string;
  iibb: string;
  inicioActividades: string;
  puntoVenta: string;
  environment: TArcaEnvironment;
  umbralConsumidorFinal: number;
};

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/pkcs10" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ArcaConfigPage() {
  const { data: user } = useUser();
  const [config, setConfig] = useState<TArcaPublicConfig | null>(null);
  const [form, setForm] = useState<TEmisorForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<TArcaStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const load = (c: TArcaPublicConfig) => {
    setConfig(c);
    setForm({
      cuit: c.cuit,
      razonSocial: c.razonSocial,
      domicilioComercial: c.domicilioComercial,
      iibb: c.iibb,
      inicioActividades: c.inicioActividades,
      puntoVenta: c.puntoVenta ? String(c.puntoVenta) : "",
      environment: c.environment,
      umbralConsumidorFinal: c.umbralConsumidorFinal || DEFAULT_UMBRAL_CONSUMIDOR_FINAL,
    });
  };

  useEffect(() => {
    if (!user) return;
    getArcaConfig(user)
      .then(load)
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo cargar la configuración"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const save = async () => {
    if (!form) return;
    if (form.environment === "produccion" && config?.environment !== "produccion") {
      const ok = window.confirm(
        "Vas a pasar a PRODUCCIÓN: desde ahora las facturas emitidas tienen validez fiscal. ¿Continuar?",
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      const { config: c } = await postArcaConfig(user, {
        action: "save",
        ...form,
        puntoVenta: Number(form.puntoVenta) || 0,
      });
      load(c);
      setStatus(null);
      toast.success("Configuración guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
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

  if (loading || !form || !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const set = <K extends keyof TEmisorForm>(k: K, v: TEmisorForm[K]) => setForm((p) => (p ? { ...p, [k]: v } : p));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            Facturación electrónica ARCA
            <span
              className={cn(
                "text-xs font-semibold rounded-full px-2.5 py-1",
                config.environment === "produccion"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800",
              )}
            >
              {config.environment === "produccion" ? "PRODUCCIÓN" : "HOMOLOGACIÓN"}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Emisor único de Factura A/B y Notas de Crédito por web service (WSFEv1).
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Volver
          </Link>
        </Button>
      </div>

      {!config.encryptionConfigured && (
        <p className="rounded-md border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">
          Falta la variable de entorno <code>ARCA_ENCRYPTION_KEY</code> en el servidor (32 bytes en base64). Sin ella
          no se puede guardar la clave del certificado.
        </p>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">1. Datos del emisor</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>CUIT</Label>
              <CuitInput value={form.cuit} onValueChange={(d) => set("cuit", d)} />
            </div>
            <div className="space-y-2">
              <Label>Razón social</Label>
              <Input value={form.razonSocial} onChange={(e) => set("razonSocial", e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Domicilio comercial</Label>
              <Input value={form.domicilioComercial} onChange={(e) => set("domicilioComercial", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ingresos Brutos</Label>
              <Input value={form.iibb} onChange={(e) => set("iibb", e.target.value)} placeholder="N° o 'Convenio Multilateral'" />
            </div>
            <div className="space-y-2">
              <Label>Inicio de actividades</Label>
              <Input
                value={form.inicioActividades}
                onChange={(e) => set("inicioActividades", e.target.value)}
                placeholder="dd/mm/aaaa"
              />
            </div>
            <div className="space-y-2">
              <Label>Punto de venta (Web Services)</Label>
              <Input
                inputMode="numeric"
                value={form.puntoVenta}
                onChange={(e) => set("puntoVenta", e.target.value.replace(/\D/g, ""))}
                placeholder="Ej: 3"
              />
              <p className="text-xs text-muted-foreground">
                Tiene que ser un punto de venta de tipo &quot;Web Services&quot;, distinto al de Comprobantes en línea.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Ambiente</Label>
              <Select value={form.environment} onValueChange={(v) => set("environment", v as TArcaEnvironment)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="homologacion">{ENV_LABEL.homologacion}</SelectItem>
                  <SelectItem value="produccion">{ENV_LABEL.produccion}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Factura B a consumidor final sin DNI: hasta</Label>
              <MoneyInput value={form.umbralConsumidorFinal} onValueChange={(n) => set("umbralConsumidorFinal", n)} />
              <p className="text-xs text-muted-foreground">
                Desde ese monto ARCA exige identificar al comprador. Confirmá el valor vigente con el contador.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(["homologacion", "produccion"] as TArcaEnvironment[]).map((env) => (
          <CertificateCard
            key={env}
            environment={env}
            config={config}
            onConfig={load}
            disabled={!config.encryptionConfigured}
          />
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-semibold">3. Probar conexión ({ENV_LABEL[config.environment]})</CardTitle>
          <Button variant="outline" onClick={check} disabled={checking}>
            {checking ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PlugZap className="h-4 w-4 mr-1.5" />}
            Probar
          </Button>
        </CardHeader>
        <CardContent className="pt-0 space-y-3 text-sm">
          {status ? (
            <>
              {[
                ["Servidores de facturación (WSFEv1)", status.wsfeServer],
                ["Autenticación facturación (wsfe)", status.wsfeAuth],
                ["Padrón constancia de inscripción", status.padron],
              ].map(([label, c]) => {
                const item = c as { ok: boolean; detail: string };
                return (
                  <div key={label as string} className="flex items-start gap-2">
                    {item.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className="font-medium">{label as string}</p>
                      <p className="text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
              {status.ultimos.length > 0 && (
                <div className="rounded-md border divide-y">
                  {status.ultimos.map((u) => (
                    <div key={u.tipo} className="flex justify-between px-3 py-1.5">
                      <span>{u.tipo}</span>
                      <span className="font-mono">{u.ultimo}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              Verifica el certificado del ambiente activo, la autorización de los servicios y el punto de venta.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CertificateCard({
  environment,
  config,
  onConfig,
  disabled,
}: {
  environment: TArcaEnvironment;
  config: TArcaPublicConfig;
  onConfig: (c: TArcaPublicConfig) => void;
  disabled: boolean;
}) {
  const { data: user } = useUser();
  const info = config.certs[environment];
  const [alias, setAlias] = useState("banderas-app");
  const [certPem, setCertPem] = useState("");
  const [busy, setBusy] = useState<"csr" | "cert" | null>(null);
  const expired = info.certExpiresAt ? new Date(info.certExpiresAt).getTime() < Date.now() : false;

  const generate = async () => {
    if (info.hasCert && !window.confirm("Generar un CSR nuevo invalida el certificado actual de este ambiente. ¿Continuar?")) {
      return;
    }
    setBusy("csr");
    try {
      const { config: c, csrPem } = await postArcaConfig(user, { action: "generateCsr", environment, alias });
      onConfig(c);
      if (csrPem) downloadText(`banderas-${environment}.csr`, csrPem);
      toast.success("CSR generado y descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el CSR");
    } finally {
      setBusy(null);
    }
  };

  const upload = async () => {
    setBusy("cert");
    try {
      const { config: c } = await postArcaConfig(user, { action: "uploadCert", environment, certPem });
      onConfig(c);
      setCertPem("");
      toast.success("Certificado guardado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el certificado");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-slate-500" />
          2. Certificado de {ENV_LABEL[environment]}
          {config.environment === environment && (
            <span className="text-[11px] rounded bg-blue-100 text-blue-800 px-1.5 py-0.5">activo</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4 text-sm">
        <div className="rounded-md bg-slate-50 border p-3 space-y-1">
          <p>
            Clave privada: <b>{info.hasKey ? "generada" : "no"}</b> · CSR: <b>{info.hasCsr ? "sí" : "no"}</b> · Certificado:{" "}
            <b className={info.hasCert ? (expired ? "text-red-700" : "text-emerald-700") : ""}>
              {info.hasCert ? (expired ? "vencido" : "cargado") : "no"}
            </b>
          </p>
          {info.certExpiresAt && (
            <p className="text-muted-foreground">Vence: {new Date(info.certExpiresAt).toLocaleDateString("es-AR")}</p>
          )}
          {info.certSubject && <p className="text-muted-foreground break-all">{info.certSubject}</p>}
        </div>

        <div className="space-y-2">
          <Label>a) Generar el pedido de certificado (CSR)</Label>
          <div className="flex gap-2">
            <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Alias" />
            <Button variant="outline" onClick={generate} disabled={disabled || busy !== null}>
              {busy === "csr" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generar CSR"}
            </Button>
            {info.csrPem && (
              <Button
                variant="ghost"
                title="Descargar CSR"
                onClick={() => downloadText(`banderas-${environment}.csr`, info.csrPem!)}
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {environment === "homologacion"
              ? "Subilo en ARCA → WSASS (Autogestión Certificados Homologación) y autorizá los servicios wsfe y ws_sr_constancia_inscripcion."
              : "Subilo en ARCA → Administración de Certificados Digitales; después, en el Administrador de Relaciones, asociá el certificado a Facturación Electrónica y a Consulta a Padrón Constancia de Inscripción."}
          </p>
        </div>

        <div className="space-y-2">
          <Label>b) Pegar el certificado (.crt) que entrega ARCA</Label>
          <Textarea
            rows={4}
            value={certPem}
            onChange={(e) => setCertPem(e.target.value)}
            placeholder="-----BEGIN CERTIFICATE-----"
            className="font-mono text-xs"
          />
          <div className="flex gap-2 justify-end">
            <label className="inline-flex">
              <input
                type="file"
                accept=".crt,.pem,.cer"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setCertPem(await f.text());
                  e.target.value = "";
                }}
              />
              <span className="inline-flex items-center rounded-md border px-3 text-sm cursor-pointer hover:bg-slate-50 h-9">
                <Upload className="h-4 w-4 mr-1.5" /> Elegir archivo
              </span>
            </label>
            <Button onClick={upload} disabled={disabled || !certPem.trim() || !info.hasKey || busy !== null}>
              {busy === "cert" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar certificado"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
