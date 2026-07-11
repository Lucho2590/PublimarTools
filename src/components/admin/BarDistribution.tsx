"use client";

import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatearPrecio } from "@/lib/utils";

export interface BarDistributionItem {
  key: string;
  label: string;
  value: number;
  /** Texto auxiliar a la derecha del label (ej: "12 u." o "%"). */
  hint?: string;
}

type BarColor = "blue" | "green" | "red" | "amber" | "slate";

const BAR_COLORS: Record<BarColor, string> = {
  blue: "bg-blue-600",
  green: "bg-green-600",
  red: "bg-red-600",
  amber: "bg-amber-500",
  slate: "bg-slate-500",
};

interface BarDistributionProps {
  title?: string;
  items: BarDistributionItem[];
  color?: BarColor;
  /** Formatea el valor mostrado a la derecha. Default: formatearPrecio. */
  formatValue?: (v: number) => string;
  emptyLabel?: string;
  maxItems?: number;
  className?: string;
}

/**
 * Barras horizontales de distribución (Tailwind, sin librería de charts).
 * Reutilizable para: gastos por categoría/proveedor, plata por cuenta,
 * ingresos/gastos por departamento, etc.
 */
export const BarDistribution = memo(function BarDistribution({
  title,
  items,
  color = "blue",
  formatValue = formatearPrecio,
  emptyLabel = "Sin datos en el período.",
  maxItems,
  className,
}: BarDistributionProps) {
  const shown = maxItems ? items.slice(0, maxItems) : items;
  const max = Math.max(1, ...shown.map((i) => Math.abs(i.value)));

  const body = (
    <div className={cn("space-y-3", className)}>
      {shown.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">{emptyLabel}</p>
      ) : (
        shown.map((item) => {
          const pct = (Math.abs(item.value) / max) * 100;
          return (
            <div key={item.key}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm text-slate-700 truncate">
                  {item.label}
                  {item.hint && (
                    <span className="text-xs text-slate-400 ml-2">
                      {item.hint}
                    </span>
                  )}
                </span>
                <span className="text-sm font-semibold text-slate-900 shrink-0">
                  {formatValue(item.value)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn("h-full rounded-full", BAR_COLORS[color])}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  if (!title) return body;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
});
