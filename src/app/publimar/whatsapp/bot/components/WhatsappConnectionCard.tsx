"use client";

import { useEffect, useMemo, useState } from "react";
import { useFirestore, useFirestoreCollectionData, useFirestoreDocData } from "reactfire";
import { collection, doc } from "firebase/firestore";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Link2,
  Loader2,
  RefreshCw,
  Settings2,
  Smartphone,
  Unlink,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";
import collections from "@/lib/collections";
import { isAdminOrAbove } from "@/lib/permissions";
import { EUserRole } from "@/types/user";
import { cn } from "@/lib/utils";
import { ConnectionWizard } from "./connection/ConnectionWizard";
import { DisconnectDialog } from "./connection/DisconnectDialog";
import { HistorySyncProgress } from "./connection/HistorySyncProgress";
import { TechSetupPanel } from "./connection/TechSetupPanel";
import { DISCONNECT_REASONS, FOURTEEN_DAY_RULE } from "./connection/content";
import { useWhatsappAdminApi, useWhatsappSetup } from "./connection/useWhatsappSetup";

function formatDate(ts: any): string | null {
  const d: Date | null = ts?.toDate?.() ?? (ts instanceof Date ? ts : null);
  return d ? d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : null;
}

/**
 * Conexión con WhatsApp (Meta Cloud API). El camino normal es el asistente
 * (Embedded Signup con coexistencia: el número sigue en el celular). El alta
 * por token queda en "Avanzado" para el número de prueba de Meta.
 */
export function WhatsappConnectionCard({ handoffHours = 12 }: { handoffHours?: number }) {
  const firestore = useFirestore();
  const { userRole } = useAuth();
  const isAdmin = isAdminOrAbove(userRole);
  const isSuperuser = userRole === EUserRole.SUPERUSER;

  const integrationRef = useMemo(() => doc(firestore, collections.WHATSAPP_INTEGRATION, "default"), [firestore]);
  const channelsRef = useMemo(() => collection(firestore, collections.WHATSAPP_CHANNELS), [firestore]);
  const { data: integration } = useFirestoreDocData(integrationRef);
  const { data: channels } = useFirestoreCollectionData(channelsRef, { idField: "id" });
  const integ = integration as any;

  const setup = useWhatsappSetup(isAdmin);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);

  const status: string = integ?.status || "disconnected";
  const connected = status === "connected";
  const broken = status === "error";
  const disconnecting = status === "disconnecting";
  const hasNumber = connected || broken || disconnecting;
  const coexistence = !!integ?.coexistenceEnabled;
  const channel = useMemo(() => {
    const list = (channels as any[]) || [];
    return list.find((c) => c.id === integ?.phoneNumberId) || list.find((c) => c.defaultForSending) || null;
  }, [channels, integ?.phoneNumberId]);
  const disconnect = integ?.disconnect;

  // La configuración técnica se abre sola para el superuser si falta algo.
  useEffect(() => {
    if (isSuperuser && setup.status && !setup.status.ready) setTechOpen(true);
  }, [isSuperuser, setup.status]);

  const openTechSetup = () => {
    setWizardOpen(false);
    setTechOpen(true);
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" /> Conexión con WhatsApp
        </CardTitle>

        {/* Estado */}
        <div className="text-sm">
          {connected && (
            <div className="space-y-1">
              <p className="flex flex-wrap items-center gap-1 text-green-700">
                <CheckCircle2 className="h-4 w-4" /> Conectado
                {channel?.displayPhoneNumber ? ` · ${channel.displayPhoneNumber}` : ""}
                {channel?.verifiedName ? ` (${channel.verifiedName})` : ""}
              </p>
              <p className="text-slate-600">
                {coexistence
                  ? "Coexistencia activa: el número sigue en el celular y en la app."
                  : "Conectado solo a la API (sin el celular). Para el número del local usá \"Conectar WhatsApp\"."}
                {integ?.onboardedAt ? ` Conectado el ${formatDate(integ.onboardedAt)}.` : ""}
              </p>
            </div>
          )}
          {broken && (
            <p className="flex items-center gap-1 text-red-700">
              <AlertTriangle className="h-4 w-4" /> Desconectado: {integ?.error || "Meta rechazó el envío"}. Volvé a
              conectar.
            </p>
          )}
          {disconnecting && (
            <p className="flex items-center gap-1 text-amber-700">
              <AlertTriangle className="h-4 w-4" /> Desvinculación a medias: falta desconectarlo desde el celular.
            </p>
          )}
          {!hasNumber && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-slate-500">
                <XCircle className="h-4 w-4" /> Sin conectar
              </p>
              {disconnect?.displayPhoneNumber && (
                <p className="text-xs text-slate-500">
                  {disconnect.displayPhoneNumber} se desvinculó
                  {formatDate(disconnect.confirmedAt || disconnect.requestedAt)
                    ? ` el ${formatDate(disconnect.confirmedAt || disconnect.requestedAt)}`
                    : ""}
                  {disconnect.confirmedAt ? " (confirmado por Meta)" : ""}.
                  {!disconnect.requestedBy && disconnect.reason
                    ? ` ${DISCONNECT_REASONS[disconnect.reason] || ""}`
                    : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {connected && coexistence && <HistorySyncProgress integration={integ} />}
        {connected && coexistence && (
          <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
            {FOURTEEN_DAY_RULE}
          </p>
        )}

        {/* Acciones */}
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            {!hasNumber && (
              <Button onClick={() => setWizardOpen(true)}>
                <Link2 className="mr-2 h-4 w-4" /> Conectar WhatsApp
              </Button>
            )}
            {broken && (
              <Button onClick={() => setWizardOpen(true)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Reconectar
              </Button>
            )}
            {disconnecting && (
              <Button onClick={() => setDisconnectOpen(true)}>Continuar desvinculación</Button>
            )}
            {(connected || broken) && (
              <Button variant="outline" onClick={() => setDisconnectOpen(true)}>
                <Unlink className="mr-2 h-4 w-4" /> Desvincular número
              </Button>
            )}
            <Button variant="ghost" onClick={() => setHowOpen(true)}>
              <BookOpen className="mr-2 h-4 w-4" /> Ver cómo funciona
            </Button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Solo un administrador puede conectar o desvincular el número.</p>
        )}

        {/* Configuración técnica (superuser) */}
        {isSuperuser && (
          <Collapsible open={techOpen} onOpenChange={setTechOpen} className="rounded-lg border">
            <CollapsibleTrigger className="flex w-full items-center gap-2 p-3 text-left text-sm font-medium">
              <Settings2 className="h-4 w-4" />
              <span className="flex-1">Configuración técnica de Meta (una sola vez)</span>
              {setup.loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : setup.status?.ready ? (
                <span className="text-xs font-normal text-green-700">Completa</span>
              ) : (
                <span className="text-xs font-normal text-red-700">Falta completar</span>
              )}
              <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", techOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t p-3">
              <TechSetupPanel
                setup={setup.status}
                loading={setup.loading}
                error={setup.error}
                onRefresh={setup.refresh}
              />
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Alta manual por token (número de prueba de Meta) */}
        {isAdmin && <ManualConnect integration={integ} channel={channel} />}
      </CardContent>

      <ConnectionWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        setup={setup.status}
        setupLoading={setup.loading}
        onRefreshSetup={setup.refresh}
        integration={integ}
        handoffHours={handoffHours}
        canSeeTechSetup={isSuperuser}
        onOpenTechSetup={openTechSetup}
      />
      <ConnectionWizard
        readOnly
        open={howOpen}
        onOpenChange={setHowOpen}
        setup={null}
        setupLoading={false}
        onRefreshSetup={() => {}}
        integration={integ}
        handoffHours={handoffHours}
        canSeeTechSetup={false}
        onOpenTechSetup={() => {}}
      />
      <DisconnectDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        integration={integ}
        displayPhoneNumber={channel?.displayPhoneNumber}
      />
    </Card>
  );
}

/** Alta por token de System User: solo para el número de prueba de Meta o números solo-API. */
function ManualConnect({ integration, channel }: { integration: any; channel: any }) {
  const api = useWhatsappAdminApi();
  const [open, setOpen] = useState(false);
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  // Las altas viejas (antes del asistente) no tienen onboardingMethod: fueron manuales.
  const isManual =
    (integration?.onboardingMethod ?? "manual") === "manual" &&
    !!integration?.status &&
    integration.status !== "disconnected";

  useEffect(() => {
    if (!isManual) return;
    if (integration?.wabaId) setWabaId((v) => v || integration.wabaId);
    if (channel?.id) setPhoneNumberId((v) => v || channel.id);
  }, [isManual, integration?.wabaId, channel?.id]);

  const connect = async () => {
    if (!wabaId.trim() || !phoneNumberId.trim() || !token.trim()) {
      toast.error("Completá los tres datos");
      return;
    }
    setSaving(true);
    try {
      const data = await api<{ displayPhoneNumber?: string }>("connect", {
        body: { wabaId: wabaId.trim(), phoneNumberId: phoneNumberId.trim(), token: token.trim() },
      });
      setToken("");
      toast.success(`Conectado${data.displayPhoneNumber ? `: ${data.displayPhoneNumber}` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo conectar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        Avanzado: conectar con token (número de prueba de Meta)
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3 rounded-lg border border-dashed p-3">
        <p className="text-xs text-amber-700">
          Este camino NO es coexistencia: usalo solo con el número de prueba de Meta o con un número que no esté en
          ningún celular. Para el número del local usá &quot;Conectar WhatsApp&quot;.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>ID de la cuenta de WhatsApp Business (WABA ID)</Label>
            <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="1234567890…" />
          </div>
          <div className="space-y-1">
            <Label>ID del número de teléfono</Label>
            <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="1234567890…" />
          </div>
          <div className="space-y-1">
            <Label>Token de acceso</Label>
            <Input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={isManual ? "•••••• (guardado) — pegá uno nuevo para cambiarlo" : "EAAG…"}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={connect} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isManual ? "Actualizar token" : "Conectar con token"}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
