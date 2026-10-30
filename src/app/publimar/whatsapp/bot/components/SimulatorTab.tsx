"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { EBotLayer, TBotReply, TBotTrace } from "@/types/bot";
import { LayerBadge, WaText, formatUsd } from "./shared";

type TChatItem =
  | { from: "user"; text: string }
  | { from: "bot"; reply: TBotReply }
  | { from: "trace"; trace: TBotTrace };

export function SimulatorTab() {
  const { user } = useAuth();
  const [items, setItems] = useState<TChatItem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [persistOrders, setPersistOrders] = useState(false);
  const [phone, setPhone] = useState("");
  const [openList, setOpenList] = useState<number | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  useEffect(() => {
    if (!user) return;
    user
      .getIdToken()
      .then((token) =>
        fetch("/api/bot/simulate", { headers: { Authorization: `Bearer ${token}` } })
      )
      .then((r) => r.json())
      .then((d) => setAiConfigured(!!d.aiConfigured))
      .catch(() => setAiConfigured(null));
  }, [user]);

  const send = async (payload: { text?: string; replyId?: string; replyTitle?: string }) => {
    if (!user || loading) return;
    const shown = payload.text ?? payload.replyTitle ?? "";
    setItems((prev) => [...prev, { from: "user", text: shown }]);
    setOpenList(null);
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/bot/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...payload, persistOrders, phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error del simulador");
      const replies: TBotReply[] = data.replies || [];
      setItems((prev) => [
        ...prev,
        ...replies.map((reply) => ({ from: "bot" as const, reply })),
        { from: "trace", trace: data.trace },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error del simulador");
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    send({ text });
  };

  const reset = async () => {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/bot/simulate", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setItems([]);
    toast.success("Conversación reiniciada");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card className="overflow-hidden">
        <div className="h-[60vh] overflow-y-auto bg-[#efeae2] p-4 space-y-2">
          {items.length === 0 && (
            <p className="text-center text-sm text-slate-500 mt-8">
              Escribí como si fueras un cliente. Ej: &quot;hola&quot;, &quot;cuánto sale la argentina
              90x150&quot;, &quot;hacen envíos?&quot;
            </p>
          )}
          {items.map((item, idx) => {
            if (item.from === "user") {
              return (
                <div key={idx} className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">
                    {item.text}
                  </div>
                </div>
              );
            }
            if (item.from === "trace") {
              const t = item.trace;
              return (
                <div key={idx} className="flex flex-wrap items-center gap-2 text-xs text-slate-600 pl-1">
                  <LayerBadge layer={t.layer} />
                  {t.intent && <span>intención: {t.intent}</span>}
                  {t.score != null && <span>score: {t.score}</span>}
                  <span>{t.latencyMs} ms</span>
                  {t.aiUsage && (
                    <span>
                      IA: {t.aiUsage.inputTokens + t.aiUsage.cacheReadTokens}→{t.aiUsage.outputTokens} tokens ·{" "}
                      {formatUsd(t.aiUsage.costUsd)}
                    </span>
                  )}
                  {t.segment && <span>cliente: {t.segment}</span>}
                  {t.note && <span className="italic">{t.note}</span>}
                  {t.note?.startsWith("Derivado a un humano") && (
                    <div className="basis-full mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                      El bot está en silencio porque derivó la charla a una persona (en WhatsApp
                      real responde el equipo). Tocá <b>Reiniciar conversación</b> para seguir probando.
                    </div>
                  )}
                </div>
              );
            }
            const r = item.reply;
            return (
              <div key={idx} className="flex justify-start">
                <div className="max-w-[80%] rounded-lg bg-white text-sm shadow-sm">
                  <div className="px-3 py-2">
                    <WaText text={r.text} />
                  </div>
                  {r.type === "buttons" && (
                    <div className="border-t divide-y">
                      {r.buttons.map((b) => (
                        <button
                          key={b.id}
                          className="block w-full px-3 py-2 text-center text-[#027eb5] hover:bg-slate-50 disabled:opacity-50"
                          disabled={loading}
                          onClick={() => send({ replyId: b.id, replyTitle: b.title })}
                        >
                          {b.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {r.type === "list" && (
                    <div className="border-t">
                      <button
                        className="block w-full px-3 py-2 text-center text-[#027eb5] hover:bg-slate-50"
                        onClick={() => setOpenList(openList === idx ? null : idx)}
                      >
                        ☰ {r.buttonLabel}
                      </button>
                      {openList === idx && (
                        <div className="border-t divide-y">
                          {r.rows.map((row) => (
                            <button
                              key={row.id}
                              className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
                              disabled={loading}
                              onClick={() => send({ replyId: row.id, replyTitle: row.title })}
                            >
                              <div>{row.title}</div>
                              {row.description && (
                                <div className="text-xs text-slate-500">{row.description}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> escribiendo…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <CardContent className="flex gap-2 p-3 border-t">
          <Input
            placeholder="Escribí un mensaje…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            disabled={loading}
          />
          <Button onClick={submit} disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6 space-y-4 text-sm">
            <Button variant="outline" className="w-full" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-2" /> Reiniciar conversación
            </Button>
            <div className="flex items-start gap-2">
              <Checkbox
                id="persist"
                checked={persistOrders}
                onCheckedChange={(v) => setPersistOrders(v === true)}
              />
              <Label htmlFor="persist" className="leading-snug">
                Guardar pedido real al confirmar
                <span className="block text-xs text-slate-500 font-normal">
                  Crea el cliente y el pedido en WhatsApp &gt; Pedidos
                </span>
              </Label>
            </div>
            {persistOrders && (
              <div className="space-y-1">
                <Label htmlFor="phone">Teléfono de prueba</Label>
                <Input
                  id="phone"
                  placeholder="5492231234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2 text-xs text-slate-600">
            <p className="font-medium text-slate-800 text-sm">Cómo leer la traza</p>
            <p>
              <LayerBadge layer={EBotLayer.FLOW} /> / <LayerBadge layer={EBotLayer.RULE} /> resuelto sin IA (gratis).
            </p>
            <p>
              <LayerBadge layer={EBotLayer.AI} /> tuvo que usar IA: enseñale la frase en &quot;Por aprender&quot;
              para que la próxima vez salga por reglas.
            </p>
            <p>
              IA en el servidor:{" "}
              {aiConfigured == null ? "…" : aiConfigured ? "✅ configurada" : "❌ falta ANTHROPIC_API_KEY"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
