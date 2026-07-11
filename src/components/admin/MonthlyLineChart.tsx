"use client";

import { memo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearPrecio } from "@/lib/utils";

export interface LineSeries {
  key: string;
  label: string;
  color: string;
}

interface MonthlyLineChartProps {
  title?: string;
  /** Cada punto debe tener un campo `label` (eje X) y una clave por cada serie. */
  data: Record<string, any>[];
  series: LineSeries[];
  formatValue?: (v: number) => string;
  height?: number;
}

/** Abrevia montos grandes para el eje Y: 1.2M / 350k / 900. */
function compactNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}

/**
 * Gráfico de línea mensual reutilizable (recharts). Una línea por serie,
 * tooltips y leyenda. Pensado para márgenes/ingresos por departamento u otras
 * series temporales.
 */
export const MonthlyLineChart = memo(function MonthlyLineChart({
  title,
  data,
  series,
  formatValue = formatearPrecio,
  height = 320,
}: MonthlyLineChartProps) {
  const chart = (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "#64748b" }}
          tickMargin={8}
        />
        <YAxis
          tickFormatter={compactNumber}
          tick={{ fontSize: 12, fill: "#64748b" }}
          width={56}
        />
        <Tooltip
          formatter={(value: any, name: any) => [formatValue(Number(value)), name]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 2 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );

  if (!title) return chart;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{chart}</CardContent>
    </Card>
  );
});
