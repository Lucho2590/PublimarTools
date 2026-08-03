"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { BarDistribution } from "@/components/admin/BarDistribution";
import { CalendarHeatmap } from "@/components/admin/CalendarHeatmap";
import { MonthlyLineChart } from "@/components/admin/MonthlyLineChart";
import { TablePagination } from "@/components/admin/TablePagination";
import { useRentabilidad } from "@/hooks/useRentabilidad";
import { formatearPrecio } from "@/lib/utils";
import {
  dailyRevenueSeries,
  inRange,
  revenueByDepartment,
  revenueByHourBucket,
  revenueByWeekday,
  RENTA_DEPARTMENTS,
  RENTA_DEPARTMENT_LABELS,
  type RentaDepartment,
} from "@/lib/rentabilidad";
import {
  ArrowLeft,
  CalendarDays,
  CalendarRange,
  Receipt,
  TrendingUp,
  Trophy,
} from "lucide-react";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Meses mínimos que dibuja el mapa de calor, aunque se filtre un rango menor. */
const HEATMAP_MONTHS = 3;

/** Final del día, para que el rango incluya la jornada completa de `to`. */
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Inicio del día, para que el rango arranque a las 00:00 de `from`. */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Variación porcentual contra el período anterior. `null` si no hay base. */
function pctDelta(actual: number, previo: number): number | null {
  if (previo === 0) return null;
  return ((actual - previo) / previo) * 100;
}

/** Texto corto: en una grilla de 4 cards no entra "vs. período anterior". */
function deltaLabel(actual: number, previo: number): string {
  const pct = pctDelta(actual, previo);
  if (pct === null) return "sin período previo";
  const signo = pct >= 0 ? "+" : "−";
  return `${signo}${Math.abs(pct).toFixed(1).replace(".", ",")}% vs. anterior`;
}

export default function RitmoDeVentasPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return { from: startOfMonth(now), to: endOfMonth(now) };
  });
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Rango actual, período anterior contiguo de la misma duración, y rango del
  // mapa de calor (siempre al menos HEATMAP_MONTHS meses, para que el
  // calendario llene el ancho aunque se filtre un solo mes).
  const { from, to, prevFrom, prevTo, heatFrom, fetchFrom } = useMemo(() => {
    const now = new Date();
    const from = startOfDay(dateRange?.from ?? startOfMonth(now));
    const to = endOfDay(dateRange?.to ?? dateRange?.from ?? endOfMonth(now));
    const prevTo = endOfDay(new Date(from.getTime() - DAY_MS));
    const dias = Math.max(
      1,
      Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1,
    );
    const prevFrom = startOfDay(
      new Date(prevTo.getTime() - (dias - 1) * DAY_MS),
    );
    const heatFrom = startOfDay(
      new Date(
        Math.min(
          startOfMonth(from).getTime(),
          startOfMonth(subMonths(to, HEATMAP_MONTHS - 1)).getTime(),
        ),
      ),
    );
    const fetchFrom = prevFrom < heatFrom ? prevFrom : heatFrom;
    return { from, to, prevFrom, prevTo, heatFrom, fetchFrom };
  }, [dateRange]);

  // Una sola query: se pide el rango extendido (mapa de calor + período
  // anterior + actual) y se parte en cliente, en lugar de disparar el hook
  // varias veces.
  const { revenue, loading } = useRentabilidad({ from: fetchFrom, to });

  const byDepartment = useMemo(
    () =>
      departmentFilter === "all"
        ? revenue
        : revenue.filter((r) => r.department === departmentFilter),
    [revenue, departmentFilter],
  );

  const current = useMemo(
    () => byDepartment.filter((r) => inRange(r.date, from, to)),
    [byDepartment, from, to],
  );
  const previous = useMemo(
    () => byDepartment.filter((r) => inRange(r.date, prevFrom, prevTo)),
    [byDepartment, prevFrom, prevTo],
  );

  const daily = useMemo(
    () => dailyRevenueSeries(current, from, to),
    [current, from, to],
  );
  const weekday = useMemo(
    () => revenueByWeekday(current, from, to),
    [current, from, to],
  );
  const hourly = useMemo(() => revenueByHourBucket(current), [current]);

  const kpis = useMemo(() => {
    const total = current.reduce((s, r) => s + r.amount, 0);
    const prevTotal = previous.reduce((s, r) => s + r.amount, 0);
    const dias = daily.length || 1;
    const prevDias =
      Math.round((prevTo.getTime() - prevFrom.getTime()) / DAY_MS) + 1 || 1;
    return {
      total,
      prevTotal,
      operaciones: current.length,
      prevOperaciones: previous.length,
      ticket: current.length > 0 ? total / current.length : 0,
      prevTicket: previous.length > 0 ? prevTotal / previous.length : 0,
      porDia: total / dias,
      prevPorDia: prevTotal / prevDias,
    };
  }, [current, previous, daily, prevFrom, prevTo]);

  const mejorDia = useMemo(
    () =>
      daily.reduce<(typeof daily)[number] | null>(
        (best, d) => (best === null || d.ventas > best.ventas ? d : best),
        null,
      ),
    [daily],
  );

  // El mapa de calor tiene su propio alcance (mínimo 3 meses), así que se
  // recalcula sobre el rango extendido en vez de reusar `daily`.
  const heatmapDays = useMemo(
    () =>
      dailyRevenueSeries(byDepartment, heatFrom, to).map((d) => ({
        day: d.day,
        date: d.date,
        value: d.ventas,
        hint: `${d.cantidad} oper.`,
      })),
    [byDepartment, heatFrom, to],
  );

  const heatmapTitle =
    heatFrom < from
      ? `Mapa de calor · últimos ${HEATMAP_MONTHS} meses`
      : "Mapa de calor";

  const weekdayRanked = useMemo(
    () => [...weekday].sort((a, b) => b.promedio - a.promedio),
    [weekday],
  );
  const mejorWeekday = weekdayRanked[0];

  const weekdayItems = useMemo(
    () =>
      weekdayRanked.map((w) => ({
        key: String(w.weekday),
        label: w.label,
        value: w.promedio,
        hint: `${w.cantidad} oper. · total ${formatearPrecio(w.total)}`,
      })),
    [weekdayRanked],
  );

  const hourlyItems = useMemo(
    () =>
      hourly
        .filter((h) => h.total > 0)
        .map((h) => ({
          key: h.key,
          label: h.label,
          value: h.total,
          hint: `${h.cantidad} oper.`,
        })),
    [hourly],
  );

  const departmentItems = useMemo(() => {
    const totals = revenueByDepartment(current);
    return RENTA_DEPARTMENTS.filter((d) => totals[d] > 0).map((d) => ({
      key: d,
      label: RENTA_DEPARTMENT_LABELS[d],
      value: totals[d],
      hint:
        kpis.total > 0
          ? `${((totals[d] / kpis.total) * 100).toFixed(0)}%`
          : undefined,
    }));
  }, [current, kpis.total]);

  // Tabla: días más recientes primero.
  const tableRows = useMemo(() => [...daily].reverse(), [daily]);
  const totalPages = Math.max(1, Math.ceil(tableRows.length / itemsPerPage));
  const page = Math.min(currentPage, totalPages);
  const pageRows = useMemo(
    () => tableRows.slice((page - 1) * itemsPerPage, page * itemsPerPage),
    [tableRows, page, itemsPerPage],
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ritmo de ventas</h1>
          <p className="text-slate-600 text-sm mt-1">
            Cuándo se vende: día a día, por día de la semana y por franja
            horaria.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion/analiticas">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
            <div className="w-full md:w-52">
              <Label className="mb-2 block">Departamento</Label>
              <Select
                value={departmentFilter}
                onValueChange={(v) => {
                  setDepartmentFilter(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {RENTA_DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {RENTA_DEPARTMENT_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-64">
              <Label className="mb-2 block">Rango de fechas</Label>
              <DateRangePicker
                value={dateRange}
                onChange={(r) => {
                  setDateRange(r);
                  setCurrentPage(1);
                }}
              />
            </div>
            {/* El espacio sobrante se usa para explicitar contra qué compara el
                "% vs. anterior" de las tarjetas, que si no queda adivinando. */}
            <div className="md:ml-auto md:text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Período comparado
              </p>
              <p className="text-sm text-slate-600 mt-1">
                {format(prevFrom, "d 'de' MMMM", { locale: es })} –{" "}
                {format(prevTo, "d 'de' MMMM 'de' yyyy", { locale: es })}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {daily.length} {daily.length === 1 ? "día" : "días"} en el
                período seleccionado
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <SummaryCard
              title="Total vendido"
              value={formatearPrecio(kpis.total)}
              subtitle={deltaLabel(kpis.total, kpis.prevTotal)}
              icon={TrendingUp}
              variant="green"
            />
            <SummaryCard
              title="Operaciones"
              value={String(kpis.operaciones)}
              subtitle={deltaLabel(kpis.operaciones, kpis.prevOperaciones)}
              icon={Receipt}
              variant="blue"
            />
            <SummaryCard
              title="Ticket promedio"
              value={formatearPrecio(kpis.ticket)}
              subtitle={deltaLabel(kpis.ticket, kpis.prevTicket)}
              icon={Receipt}
              variant="slate"
            />
            <SummaryCard
              title="Promedio por día"
              value={formatearPrecio(kpis.porDia)}
              subtitle={deltaLabel(kpis.porDia, kpis.prevPorDia)}
              icon={CalendarRange}
              variant="amber"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <SummaryCard
              title="Mejor día del período"
              value={
                mejorDia && mejorDia.ventas > 0
                  ? formatearPrecio(mejorDia.ventas)
                  : "—"
              }
              subtitle={
                mejorDia && mejorDia.ventas > 0
                  ? `${mejorDia.weekdayLabel} ${mejorDia.label} · ${mejorDia.cantidad} oper.`
                  : "Sin ventas en el período"
              }
              icon={Trophy}
              variant="green"
            />
            <SummaryCard
              title="Mejor día de la semana"
              value={
                mejorWeekday && mejorWeekday.total > 0
                  ? mejorWeekday.label
                  : "—"
              }
              subtitle={
                mejorWeekday && mejorWeekday.total > 0
                  ? `${formatearPrecio(mejorWeekday.promedio)} promedio · ${mejorWeekday.ocurrencias} en el rango`
                  : "Sin ventas en el período"
              }
              icon={CalendarDays}
              variant="blue"
            />
          </div>

          <div className="mb-6">
            <CalendarHeatmap title={heatmapTitle} days={heatmapDays} />
          </div>

          <div className="mb-6">
            <MonthlyLineChart
              title="Ventas por día"
              data={daily}
              series={[{ key: "ventas", label: "Ventas", color: "#2563eb" }]}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <BarDistribution
              title="Ranking por día de la semana (promedio)"
              items={weekdayItems}
              color="blue"
              emptyLabel="Sin ventas en el período."
            />
            <BarDistribution
              title="Por franja horaria"
              items={hourlyItems}
              color="amber"
              emptyLabel="Sin datos horarios. Solo las ventas de Banderas registran hora; los cobros de Vía Pública se cargan por fecha."
            />
          </div>

          {departmentFilter === "all" && (
            <div className="mb-6">
              <BarDistribution
                title="Ventas por departamento"
                items={departmentItems}
                color="green"
                emptyLabel="Sin ventas en el período."
              />
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="p-4 overflow-x-auto">
                <h3 className="text-sm font-semibold mb-3 text-slate-700">
                  Detalle por día
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Día</TableHead>
                      <TableHead className="text-right">Operaciones</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">% del período</TableHead>
                      <TableHead className="text-right">vs. promedio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-6 text-slate-500"
                        >
                          Sin días en el período.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pageRows.map((d) => {
                        const vsPromedio =
                          kpis.porDia > 0
                            ? ((d.ventas - kpis.porDia) / kpis.porDia) * 100
                            : null;
                        return (
                          <TableRow key={d.day}>
                            <TableCell className="font-medium">
                              {d.label}
                            </TableCell>
                            <TableCell className="text-slate-600">
                              {d.weekdayLabel}
                            </TableCell>
                            <TableCell className="text-right text-slate-600">
                              {d.cantidad}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-green-700">
                              {formatearPrecio(d.ventas)}
                            </TableCell>
                            <TableCell className="text-right text-slate-600">
                              {kpis.total > 0
                                ? `${((d.ventas / kpis.total) * 100).toFixed(1)}%`
                                : "—"}
                            </TableCell>
                            <TableCell
                              className={`text-right ${
                                vsPromedio === null
                                  ? "text-slate-500"
                                  : vsPromedio >= 0
                                    ? "text-green-700"
                                    : "text-red-700"
                              }`}
                            >
                              {vsPromedio === null
                                ? "—"
                                : `${vsPromedio >= 0 ? "+" : ""}${vsPromedio.toFixed(0)}%`}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                <TablePagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={tableRows.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(n) => {
                    setItemsPerPage(n);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
