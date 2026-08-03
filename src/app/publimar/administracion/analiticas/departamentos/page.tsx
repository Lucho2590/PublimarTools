"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";
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
import { MonthlyLineChart } from "@/components/admin/MonthlyLineChart";
import { useRentabilidad } from "@/hooks/useRentabilidad";
import { formatearPrecio } from "@/lib/utils";
import {
  marginByDepartment,
  monthlyMarginByDepartment,
  RENTA_DEPARTMENTS,
  RENTA_DEPARTMENT_LABELS,
  type RentaDepartment,
} from "@/lib/rentabilidad";
import { ArrowLeft, TrendingUp, TrendingDown, Scale } from "lucide-react";

const DEPT_COLORS: Record<RentaDepartment, string> = {
  banderas: "#2563eb",
  via_publica: "#d97706",
  administracion: "#64748b",
};

export default function RentabilidadDepartamentosPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return { from: startOfMonth(subMonths(now, 5)), to: endOfMonth(now) };
  });
  const [chartDept, setChartDept] = useState<string>("all");

  const { from, to } = useMemo(() => {
    const from = dateRange?.from ?? startOfMonth(subMonths(new Date(), 5));
    const to = dateRange?.to ?? dateRange?.from ?? endOfMonth(new Date());
    return { from, to };
  }, [dateRange]);

  const { revenue, expenses, loading } = useRentabilidad({ from, to });

  const margins = useMemo(
    () => marginByDepartment(revenue, expenses),
    [revenue, expenses],
  );

  const chartData = useMemo(
    () => monthlyMarginByDepartment(revenue, expenses, from, to),
    [revenue, expenses, from, to],
  );

  const chartSeries = useMemo(() => {
    const all = RENTA_DEPARTMENTS.map((d) => ({
      key: d,
      label: RENTA_DEPARTMENT_LABELS[d],
      color: DEPT_COLORS[d],
    }));
    return chartDept === "all"
      ? all
      : all.filter((s) => s.key === chartDept);
  }, [chartDept]);

  const totals = useMemo(() => {
    const ingresos = margins.reduce((s, m) => s + m.ingresos, 0);
    const gastos = margins.reduce((s, m) => s + m.gastos, 0);
    return {
      ingresos,
      gastos,
      margen: ingresos - gastos,
      margenPct: ingresos > 0 ? ((ingresos - gastos) / ingresos) * 100 : null,
    };
  }, [margins]);

  const ingresosDist = useMemo(
    () =>
      margins
        .filter((m) => m.ingresos > 0)
        .map((m) => ({
          key: m.department,
          label: RENTA_DEPARTMENT_LABELS[m.department as RentaDepartment],
          value: m.ingresos,
        })),
    [margins],
  );

  const gastosDist = useMemo(
    () =>
      margins
        .filter((m) => m.gastos > 0)
        .map((m) => ({
          key: m.department,
          label: RENTA_DEPARTMENT_LABELS[m.department as RentaDepartment],
          value: m.gastos,
        })),
    [margins],
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Rentabilidad por departamento</h1>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion/analiticas">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <div>
              <Label className="mb-2 block">Rango de fechas</Label>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Ingresos"
          value={formatearPrecio(totals.ingresos)}
          icon={TrendingUp}
          variant="green"
        />
        <SummaryCard
          title="Gastos"
          value={formatearPrecio(totals.gastos)}
          icon={TrendingDown}
          variant="red"
        />
        <SummaryCard
          title="Margen"
          value={formatearPrecio(totals.margen)}
          icon={Scale}
          variant={totals.margen >= 0 ? "green" : "red"}
        />
        <SummaryCard
          title="Margen %"
          value={totals.margenPct !== null ? `${totals.margenPct.toFixed(1)}%` : "—"}
          icon={Scale}
          variant="slate"
        />
      </div>

      {loading ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h2 className="text-base font-semibold">
                  Margen mensual por departamento
                </h2>
                <div className="w-full sm:w-56">
                  <Select value={chartDept} onValueChange={setChartDept}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los departamentos</SelectItem>
                      {RENTA_DEPARTMENTS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {RENTA_DEPARTMENT_LABELS[d]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <MonthlyLineChart data={chartData} series={chartSeries} />
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardContent className="p-0">
              <div className="p-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Departamento</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Gastos</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                      <TableHead className="text-right">Margen %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {margins.map((m) => (
                      <TableRow key={m.department}>
                        <TableCell className="font-medium">
                          {RENTA_DEPARTMENT_LABELS[m.department as RentaDepartment]}
                          {m.ingresos === 0 && m.gastos > 0 && (
                            <span className="text-xs text-slate-400 ml-2">
                              (estructura)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-green-700">
                          {formatearPrecio(m.ingresos)}
                        </TableCell>
                        <TableCell className="text-right text-red-700">
                          {formatearPrecio(m.gastos)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            m.margen >= 0 ? "text-green-800" : "text-red-800"
                          }`}
                        >
                          {formatearPrecio(m.margen)}
                        </TableCell>
                        <TableCell className="text-right">
                          {m.margenPct !== null
                            ? `${m.margenPct.toFixed(1)}%`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-slate-500 mb-6">
            Los ingresos de Vía Pública corresponden a pagos efectivamente
            cobrados (facturación), no al total presupuestado. Administración
            suele no tener ingresos: su margen negativo es gasto de estructura
            que se reparte sobre el resto del negocio.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BarDistribution
              title="Ingresos por departamento"
              items={ingresosDist}
              color="green"
            />
            <BarDistribution
              title="Gastos por departamento"
              items={gastosDist}
              color="red"
            />
          </div>
        </>
      )}
    </div>
  );
}
