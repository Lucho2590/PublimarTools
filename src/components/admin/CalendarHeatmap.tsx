"use client";

import { memo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  format,
} from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatearPrecio, formatearPrecioCompacto } from "@/lib/utils";
import { dayKey } from "@/lib/rentabilidad";

export interface HeatmapDay {
  /** Clave `YYYY-MM-DD` (usar `dayKey` de lib/rentabilidad). */
  day: string;
  date: Date;
  value: number;
  /** Texto auxiliar para el tooltip (ej "3 oper."). */
  hint?: string;
}

interface CalendarHeatmapProps {
  title?: string;
  days: HeatmapDay[];
  /** Formatea el monto del tooltip. Default: formatearPrecio. */
  formatValue?: (v: number) => string;
  emptyLabel?: string;
  /** Tope de meses a dibujar; si el rango es más largo se avisa al pie. */
  maxMonths?: number;
  className?: string;
}

/**
 * Escala secuencial de azules, relativa al día más fuerte del período.
 * Las clases son literales completos a propósito: Tailwind purga las clases
 * armadas por interpolación y no hay `safelist` en el config.
 */
const LEVELS = [
  { max: 0, cell: "bg-slate-100 text-slate-400" },
  { max: 0.2, cell: "bg-blue-100 text-blue-900" },
  { max: 0.4, cell: "bg-blue-200 text-blue-900" },
  { max: 0.6, cell: "bg-blue-400 text-white" },
  { max: 0.8, cell: "bg-blue-600 text-white" },
  { max: Infinity, cell: "bg-blue-900 text-white" },
];

const WEEK_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function levelFor(value: number, max: number): (typeof LEVELS)[number] {
  if (value <= 0) return LEVELS[0];
  const ratio = value / max;
  return LEVELS.find((l) => ratio <= l.max) ?? LEVELS[LEVELS.length - 1];
}

/** Meses calendario cubiertos por los días recibidos, en orden. */
function monthsCovered(days: HeatmapDay[]): Date[] {
  if (days.length === 0) return [];
  const sorted = [...days].sort((a, b) => a.date.getTime() - b.date.getTime());
  const months: Date[] = [];
  const cursor = startOfMonth(sorted[0].date);
  const last = startOfMonth(sorted[sorted.length - 1].date);
  while (cursor <= last) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

/**
 * Mapa de calor tipo calendario (día × semana, semana arrancando en lunes).
 * Un bloque por mes cubierto; los días fuera del período o del mes quedan en
 * gris. La intensidad es relativa al día más fuerte del período.
 */
export const CalendarHeatmap = memo(function CalendarHeatmap({
  title,
  days,
  formatValue = formatearPrecio,
  emptyLabel = "Sin datos en el período.",
  maxMonths = 12,
  className,
}: CalendarHeatmapProps) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const max = Math.max(1, ...days.map((d) => d.value));
  const allMonths = monthsCovered(days);
  const months = allMonths.slice(0, maxMonths);
  const hidden = allMonths.length - months.length;

  const body =
    days.length === 0 ? (
      <p className="text-sm text-slate-500 py-2">{emptyLabel}</p>
    ) : (
      <div
        className={cn(
          "grid gap-x-6 gap-y-6 md:grid-cols-2 lg:grid-cols-3",
          className,
        )}
      >
        {months.map((month) => {
          const grid = eachDayOfInterval({
            start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
            end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
          });

          // Se descartan las semanas sin ningún día del período: en rangos que
          // arrancan a mitad de mes dejarían filas enteras vacías.
          const weeks: Date[][] = [];
          for (let i = 0; i < grid.length; i += 7) {
            const week = grid.slice(i, i + 7);
            if (week.some((d) => isSameMonth(d, month) && byDay.has(dayKey(d)))) {
              weeks.push(week);
            }
          }

          return (
            <div key={month.toISOString()} className="min-w-0">
              <p className="text-sm font-medium text-slate-700 mb-2 capitalize">
                {format(month, "MMMM yyyy", { locale: es })}
              </p>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEK_DAYS.map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs font-medium text-slate-500"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {weeks.flat().map((date) => {
                  const key = dayKey(date);
                  const entry = isSameMonth(date, month)
                    ? byDay.get(key)
                    : undefined;

                  // Fuera del mes o fuera del período filtrado: celda apagada.
                  if (!entry) {
                    return (
                      <div
                        key={key}
                        className="aspect-square rounded-md bg-slate-50/60"
                      />
                    );
                  }

                  const level = levelFor(entry.value, max);
                  const label = `${format(date, "EEE dd/MM", { locale: es })} · ${formatValue(
                    entry.value,
                  )}${entry.hint ? ` · ${entry.hint}` : ""}`;

                  return (
                    <div
                      key={key}
                      title={label}
                      aria-label={label}
                      className={cn(
                        // `min-w-0`: sin esto el monto de la celda le pone un
                        // ancho mínimo a la columna y la grilla desborda en
                        // pantallas angostas.
                        "aspect-square min-w-0 rounded-md flex flex-col items-center justify-center gap-0.5 overflow-hidden px-1 text-xs font-medium transition-transform hover:scale-105",
                        level.cell,
                      )}
                    >
                      <span>{date.getDate()}</span>
                      {entry.value > 0 && (
                        <span className="w-full truncate text-center text-[10px] leading-none opacity-80">
                          {formatearPrecioCompacto(entry.value)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {hidden > 0 && (
          <p className="text-xs text-slate-500">
            Se muestran los primeros {maxMonths} meses del período ({hidden}{" "}
            {hidden === 1 ? "mes oculto" : "meses ocultos"}). Acotá el rango para
            verlos.
          </p>
        )}
      </div>
    );

  if (!title) return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
          <span>{title}</span>
          <span className="flex items-center gap-1 text-xs font-normal text-slate-500">
            menos
            {LEVELS.map((l) => (
              <span
                key={l.cell}
                className={cn(
                  "inline-block h-3 w-3 rounded-sm",
                  l.cell.split(" ")[0],
                )}
              />
            ))}
            más
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
});
