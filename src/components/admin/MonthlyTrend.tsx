"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearPrecio } from "@/lib/utils";
import type { MonthlyPoint } from "@/lib/rentabilidad";

interface MonthlyTrendProps {
  title?: string;
  data: MonthlyPoint[];
}

/**
 * Tendencia mensual de ingresos vs gastos con columnas (divs + Tailwind).
 * Cada mes muestra dos barras: ingresos (verde) y gastos (rojo).
 */
export function MonthlyTrend({ title = "Tendencia mensual", data }: MonthlyTrendProps) {
  const max = Math.max(
    1,
    ...data.map((p) => Math.max(p.ingresos, p.gastos)),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{title}</span>
          <span className="flex items-center gap-3 text-xs font-normal text-slate-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-green-600" />
              Ingresos
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-red-600" />
              Gastos
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-slate-500">Sin datos.</p>
        ) : (
          <div className="flex items-end justify-between gap-2 h-48">
            {data.map((p) => (
              <div
                key={p.month}
                className="flex flex-col items-center gap-1 flex-1 min-w-0"
              >
                <div className="flex items-end gap-1 h-40 w-full justify-center">
                  <div
                    className="w-1/2 max-w-[18px] rounded-t bg-green-600"
                    style={{ height: `${(p.ingresos / max) * 100}%` }}
                    title={`Ingresos: ${formatearPrecio(p.ingresos)}`}
                  />
                  <div
                    className="w-1/2 max-w-[18px] rounded-t bg-red-600"
                    style={{ height: `${(p.gastos / max) * 100}%` }}
                    title={`Gastos: ${formatearPrecio(p.gastos)}`}
                  />
                </div>
                <span className="text-[10px] text-slate-500 truncate w-full text-center">
                  {p.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
