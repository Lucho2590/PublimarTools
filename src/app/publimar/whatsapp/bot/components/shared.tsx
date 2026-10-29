"use client";

import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { BOT_LAYER_LABELS, EBotLayer } from "@/types/bot";

export const LAYER_STYLES: Record<EBotLayer, string> = {
  [EBotLayer.GUARD]: "bg-slate-100 text-slate-700",
  [EBotLayer.FLOW]: "bg-green-100 text-green-800",
  [EBotLayer.STEP]: "bg-green-100 text-green-800",
  [EBotLayer.RULE]: "bg-blue-100 text-blue-800",
  [EBotLayer.AI]: "bg-purple-100 text-purple-800",
  [EBotLayer.FALLBACK]: "bg-amber-100 text-amber-800",
  [EBotLayer.HANDOFF]: "bg-red-100 text-red-800",
};

export function LayerBadge({ layer }: { layer: EBotLayer }) {
  return (
    <Badge variant="secondary" className={LAYER_STYLES[layer] || ""}>
      {BOT_LAYER_LABELS[layer] || layer}
    </Badge>
  );
}

export function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export const formatUsd = (n: number) =>
  `US$ ${(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

/** Formato WhatsApp mínimo: *negrita*, _cursiva_ y saltos de línea. */
export function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) => {
        if (p.startsWith("*") && p.endsWith("*") && p.length > 2)
          return <strong key={i}>{p.slice(1, -1)}</strong>;
        if (p.startsWith("_") && p.endsWith("_") && p.length > 2)
          return <em key={i}>{p.slice(1, -1)}</em>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </span>
  );
}
