"use client";

import { useEffect, useState } from "react";
import { useFirestore } from "reactfire";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import collections from "@/lib/collections";
import {
  BOT_CONFIG_DOC_ID,
  BOT_MODELS,
  BOT_TEMPLATE_VARS,
  DEFAULT_BOT_CONFIG,
  mergeBotConfig,
} from "@/lib/bot/defaults";
import { TBotConfig } from "@/types/bot";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const MESSAGE_FIELDS: { key: keyof TBotConfig["messages"]; label: string }[] = [
  { key: "intro", label: "Presentación (primer mensaje de cada charla)" },
  { key: "welcome", label: "Bienvenida (cuando solo saluda)" },
  { key: "fallback", label: "Cuando no entiende" },
  { key: "handoff", label: "Derivar a una persona" },
  { key: "handoffOutOfHours", label: "Derivar fuera de horario" },
  { key: "orderConfirmed", label: "Pedido confirmado ({numero}, {total})" },
  { key: "unsupportedMedia", label: "Audio / imagen (no soportado)" },
];

const BUSINESS_FIELDS: { key: keyof TBotConfig["business"]; label: string; rows: number }[] = [
  { key: "name", label: "Nombre del negocio", rows: 1 },
  { key: "address", label: "Dirección", rows: 2 },
  { key: "hours", label: "Horarios (texto)", rows: 2 },
  { key: "shipping", label: "Envíos (fuera de la ciudad)", rows: 3 },
  { key: "localCity", label: "Ciudad del local", rows: 1 },
  { key: "localDelivery", label: "Entregas en la ciudad (mensajero). Usá {ciudad}", rows: 2 },
  { key: "payments", label: "Formas de pago", rows: 2 },
  { key: "productionTime", label: "Tiempos de fabricación", rows: 2 },
  { key: "extra", label: "Otros datos útiles para la IA", rows: 3 },
];

export function ConfigTab() {
  const firestore = useFirestore();
  const ref = doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID);
  const [config, setConfig] = useState<TBotConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(doc(firestore, collections.SETTINGS, BOT_CONFIG_DOC_ID)).then((snap) =>
      setConfig(mergeBotConfig(snap.data() as Partial<TBotConfig> | undefined))
    );
  }, [firestore]);

  if (!config) return <p className="text-sm text-slate-500">Cargando…</p>;

  const set = <K extends keyof TBotConfig>(key: K, value: TBotConfig[K]) =>
    setConfig({ ...config, [key]: value });

  const save = async () => {
    setSaving(true);
    try {
      // Alias y tipos se editan en Entrenamiento: no se pisan desde acá.
      const { productAliases, productTypes, customerSegments, catalogGroups, customTechniques, ...rest } =
        config;
      await setDoc(ref, { ...rest, updatedAt: serverTimestamp() }, { merge: true });
      toast.success("Configuración guardada");
    } catch (e) {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (d: number) => {
    const days = config.businessHours.days.includes(d)
      ? config.businessHours.days.filter((x) => x !== d)
      : [...config.businessHours.days, d].sort();
    set("businessHours", { ...config.businessHours, days });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2">
              <Checkbox id="enabled" checked={config.enabled} onCheckedChange={(v) => set("enabled", v === true)} />
              <Label htmlFor="enabled" className="leading-snug">
                Bot activo en WhatsApp
                <span className="block text-xs text-slate-500 font-normal">
                  El simulador funciona igual aunque esté apagado.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="useButtons"
                checked={config.useButtons}
                onCheckedChange={(v) => set("useButtons", v === true)}
              />
              <Label htmlFor="useButtons" className="leading-snug">
                Mostrar botones y listas
                <span className="block text-xs text-slate-500 font-normal">
                  Apagado: todo en texto, las opciones van numeradas y el cliente escribe libre (o el
                  número).
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="askDelivery"
                checked={config.askDelivery}
                onCheckedChange={(v) => set("askDelivery", v === true)}
              />
              <Label htmlFor="askDelivery" className="leading-snug">
                Preguntar retiro o envío antes del resumen
                <span className="block text-xs text-slate-500 font-normal">
                  Si es envío, pide localidad y dirección.
                </span>
              </Label>
            </div>
            <div className="space-y-1">
              <Label>Umbral de coincidencia (0 a 1)</Label>
              <Input
                type="number"
                step="0.05"
                min={0.2}
                max={1}
                value={config.matchThreshold}
                onChange={(e) => set("matchThreshold", Math.min(1, Math.max(0.2, Number(e.target.value) || 0.5)))}
              />
              <p className="text-xs text-slate-500">
                Más bajo = acepta frases menos parecidas sin IA (más ahorro, más riesgo de confundirse).
              </p>
            </div>
            <div className="space-y-1">
              <Label>Horas de silencio del bot después de derivar a una persona</Label>
              <Input
                type="number"
                min={1}
                value={config.handoffPauseHours}
                onChange={(e) => set("handoffPauseHours", Math.max(1, Number(e.target.value) || 12))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inteligencia artificial (solo como respaldo)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2">
              <Checkbox id="ai" checked={config.aiEnabled} onCheckedChange={(v) => set("aiEnabled", v === true)} />
              <Label htmlFor="ai" className="leading-snug">
                Usar IA cuando las reglas no alcanzan
                <span className="block text-xs text-slate-500 font-normal">
                  Apagada: si no entiende, ofrece el menú y deriva a una persona.
                </span>
              </Label>
            </div>
            <div className="space-y-1">
              <Label>Modelo</Label>
              <Select value={config.model} onValueChange={(v) => set("model", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOT_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tope mensual de IA (US$)</Label>
              <MoneyInput
                value={config.aiMonthlyBudgetUsd}
                onValueChange={(n) => set("aiMonthlyBudgetUsd", n)}
              />
              <p className="text-xs text-slate-500">Al llegar al tope, el bot deja de usar IA hasta el mes siguiente.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Horario de atención humana</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="bh"
              checked={config.businessHours.enabled}
              onCheckedChange={(v) => set("businessHours", { ...config.businessHours, enabled: v === true })}
            />
            <Label htmlFor="bh">Avisar cuando se deriva fuera de horario</Label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {DAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1 text-sm">
                <Checkbox checked={config.businessHours.days.includes(i)} onCheckedChange={() => toggleDay(i)} />
                {d}
              </label>
            ))}
            <Input
              type="time"
              className="w-32"
              value={config.businessHours.open}
              onChange={(e) => set("businessHours", { ...config.businessHours, open: e.target.value })}
            />
            <span className="text-sm">a</span>
            <Input
              type="time"
              className="w-32"
              value={config.businessHours.close}
              onChange={(e) => set("businessHours", { ...config.businessHours, close: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del negocio</CardTitle>
            <p className="text-sm text-slate-600">
              Se usan en las respuestas ({BOT_TEMPLATE_VARS.map((v) => `{${v.key}}`).join(" ")}) y son lo
              único que la IA puede responder por su cuenta.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {BUSINESS_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label>{f.label}</Label>
                <Textarea
                  rows={f.rows}
                  value={config.business[f.key]}
                  onChange={(e) => set("business", { ...config.business, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Mensajes fijos</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  set("messages", { ...DEFAULT_BOT_CONFIG.messages });
                  toast.info("Textos sugeridos cargados: tocá Guardar configuración");
                }}
              >
                Restaurar textos sugeridos
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {MESSAGE_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label>{f.label}</Label>
                <Textarea
                  rows={3}
                  value={config.messages[f.key]}
                  onChange={(e) => set("messages", { ...config.messages, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-2" /> Guardar configuración
        </Button>
      </div>
    </div>
  );
}
