"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { MonthlyTrend } from "@/components/admin/MonthlyTrend";
import { useRentabilidad } from "@/hooks/useRentabilidad";
import { formatearPrecio } from "@/lib/utils";
import {
  breakEven,
  monthlyAverages,
  monthlySeries,
  projectBalance,
  totalLiquidity,
} from "@/lib/rentabilidad";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Scale,
  Wallet,
  Target,
  CalendarClock,
} from "lucide-react";

const HISTORY_MONTHS = 6;

export default function RentabilidadProyeccionPage() {
  const [projMonths, setProjMonths] = useState<number>(3);

  const { now, from, to } = useMemo(() => {
    const now = new Date();
    return {
      now,
      from: startOfMonth(subMonths(now, HISTORY_MONTHS - 1)),
      to: endOfMonth(now),
    };
  }, []);

  const { revenue, expenses, accounts, loading } = useRentabilidad({ from, to });

  const series = useMemo(
    () => monthlySeries(revenue, expenses, HISTORY_MONTHS, now),
    [revenue, expenses, now],
  );

  const avgs = useMemo(() => monthlyAverages(series, true), [series]);
  const liquidez = useMemo(() => totalLiquidity(accounts), [accounts]);
  const be = useMemo(
    () => breakEven(series, revenue, expenses, true),
    [series, revenue, expenses],
  );

  const proyectado = useMemo(
    () =>
      projectBalance(liquidez, avgs.avgIngresos, avgs.avgGastos, projMonths),
    [liquidez, avgs, projMonths],
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Proyección y balance a futuro</h1>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion/analiticas">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600 mb-4">
            Promedios calculados sobre los últimos{" "}
            <strong>{avgs.monthsConsidered}</strong> meses completos (se excluye el
            mes en curso porque está incompleto).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <SummaryCard
              title="Ingreso mensual promedio"
              value={formatearPrecio(avgs.avgIngresos)}
              icon={TrendingUp}
              variant="green"
            />
            <SummaryCard
              title="Gasto mensual promedio"
              value={formatearPrecio(avgs.avgGastos)}
              icon={TrendingDown}
              variant="red"
            />
            <SummaryCard
              title="Resultado mensual promedio"
              value={formatearPrecio(avgs.avgBalance)}
              icon={Scale}
              variant={avgs.avgBalance >= 0 ? "green" : "red"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <MonthlyTrend
              title={`Histórico ${HISTORY_MONTHS} meses`}
              data={series}
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" /> Balance proyectado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Label className="shrink-0">Proyectar a</Label>
                  <Select
                    value={String(projMonths)}
                    onValueChange={(v) => setProjMonths(Number(v))}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 meses</SelectItem>
                      <SelectItem value="6">6 meses</SelectItem>
                      <SelectItem value="12">12 meses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border p-4 bg-slate-50">
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                    <Wallet className="h-4 w-4" /> Liquidez actual
                  </div>
                  <div className="text-lg font-semibold text-slate-900">
                    {formatearPrecio(liquidez)}
                  </div>
                </div>

                <div className="rounded-lg border p-4 bg-blue-50 border-blue-200">
                  <div className="text-sm text-slate-600 mb-1">
                    Balance estimado en {projMonths} meses
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      proyectado >= 0 ? "text-blue-900" : "text-red-700"
                    }`}
                  >
                    {formatearPrecio(proyectado)}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Liquidez actual + (ingreso − gasto) promedio × {projMonths}.
                    Proyección lineal simple, sin estacionalidad.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Break-even */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" /> ¿Cuánto hay que facturar?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4">
                  <div className="text-sm font-medium text-slate-700 mb-1">
                    Para cubrir el gasto mensual
                  </div>
                  <div className="text-xl font-bold text-slate-900">
                    {formatearPrecio(be.simple)}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Facturación que iguala el gasto mensual promedio total
                    (compras + operativos). Si facturás esto, no perdés plata.
                  </p>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="text-sm font-medium text-slate-700 mb-1">
                    Por margen de contribución
                  </div>
                  <div className="text-xl font-bold text-slate-900">
                    {be.porMargenContribucion !== null
                      ? formatearPrecio(be.porMargenContribucion)
                      : "—"}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Trata las compras como costo variable y los gastos operativos
                    como costo fijo
                    {be.margenContribucionPct !== null
                      ? ` (margen de contribución estimado: ${be.margenContribucionPct.toFixed(
                          0,
                        )}%)`
                      : ""}
                    . Estimación, sin costo por producto.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
                <div className="flex justify-between border-b py-1">
                  <span className="text-slate-600">
                    Costos fijos mensuales (operativos)
                  </span>
                  <span className="font-medium">
                    {formatearPrecio(be.costosFijosMensuales)}
                  </span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span className="text-slate-600">
                    Costos variables mensuales (compras)
                  </span>
                  <span className="font-medium">
                    {formatearPrecio(be.costosVariablesMensuales)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
