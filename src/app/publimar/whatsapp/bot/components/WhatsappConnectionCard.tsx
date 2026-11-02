"use client";

import { useEffect, useMemo, useState } from "react";
import { useFirestore, useFirestoreCollectionData, useFirestoreDocData } from "reactfire";
import { collection, doc } from "firebase/firestore";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Link2, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import collections from "@/lib/collections";

/**
 * Conexión con la WhatsApp Cloud API (Meta). El token se manda al servidor,
 * que lo valida contra Meta, suscribe la app a la cuenta y lo guarda CIFRADO
 * (nunca vuelve al navegador).
 */
export function WhatsappConnectionCard() {
  const firestore = useFirestore();
  const { user } = useAuth();
  const integrationRef = useMemo(() => doc(firestore, collections.WHATSAPP_INTEGRATION, "default"), [firestore]);
  const channelsRef = useMemo(() => collection(firestore, collections.WHATSAPP_CHANNELS), [firestore]);
  const { data: integration } = useFirestoreDocData(integrationRef);
  const { data: channels } = useFirestoreCollectionData(channelsRef, { idField: "id" });

  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  const connected = (integration as any)?.status === "connected";
  const broken = (integration as any)?.status === "error";
  const channel = ((channels as any[]) || [])[0];

  // Renovar el token: los IDs ya conocidos se precargan, solo falta pegar el token nuevo.
  useEffect(() => {
    const waba = (integration as any)?.wabaId;
    if (waba) setWabaId((v) => v || waba);
    if (channel?.id) setPhoneNumberId((v) => v || channel.id);
  }, [integration, channel?.id]);
  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/whatsapp/webhook` : "/api/whatsapp/webhook";

  const connect = async () => {
    if (!user || !wabaId.trim() || !phoneNumberId.trim() || !token.trim()) {
      toast.error("Completá los tres datos");
      return;
    }
    setSaving(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/whatsapp/admin/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ wabaId: wabaId.trim(), phoneNumberId: phoneNumberId.trim(), token: token.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo conectar");
      setToken("");
      toast.success(`Conectado${data.displayPhoneNumber ? `: ${data.displayPhoneNumber}` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo conectar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Conexión con WhatsApp
        </CardTitle>
        <div className="text-sm">
          {connected ? (
            <span className="flex items-center gap-1 text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Conectado
              {channel?.displayPhoneNumber ? ` · ${channel.displayPhoneNumber}` : ""}
              {channel?.verifiedName ? ` (${channel.verifiedName})` : ""}
            </span>
          ) : broken ? (
            <span className="flex items-center gap-1 text-red-700">
              <AlertTriangle className="h-4 w-4" /> Desconectado: {(integration as any)?.error || "Meta rechazó el envío"}.
              Pegá un token nuevo y tocá conectar.
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-500">
              <XCircle className="h-4 w-4" /> Sin conectar
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
              placeholder={connected ? "•••••• (guardado) — pegá uno nuevo para cambiarlo" : "EAAG…"}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500 max-w-2xl">
            El token se valida con Meta y se guarda cifrado; no se vuelve a mostrar. En Meta, el
            webhook va a: <code className="bg-slate-100 px-1 rounded">{webhookUrl}</code> (campos
            <b> messages</b> y, con coexistencia, <b>smb_message_echoes</b>).
          </p>
          <Button onClick={connect} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {connected ? "Actualizar conexión" : "Conectar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
