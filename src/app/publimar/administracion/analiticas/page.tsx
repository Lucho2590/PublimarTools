"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { BarDistribution } from "@/components/admin/BarDistribution";
import { MonthlyTrend } from "@/components/admin/MonthlyTrend";
import { useRentabilidad } from "@/hooks/useRentabilidad";
import { formatearPrecio } from "@/lib/utils";
import {
  inRange,
  marginByDepartment,
  monthlySeries,
  totalLiquidity,
  RENTA_DEPARTMENT_LABELS,
  type RentaDepartment,
} from "@/lib/rentabilidad";
import {
  ArrowLeft,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  Scale,
  Building2,
  CalendarDays,
  Receipt,
  Package,
  LineChart,
  type LucideIcon,
} from "lucide-react";
import { startOfMonth, endOfMonth, subMonths } from "date-fns";

const N_MONTHS = 6;

export default function AnaliticasDashboardPage() {
  const { now, from, to, monthStart, monthEnd } = useMemo(() => {
    const now = new Date();
    return {
      now,
      from: startOfMonth(subMonths(now, N_MONTHS - 1)),
      to: endOfMonth(now),
      monthStart: startOfMonth(now),
      monthEnd: endOfMonth(now),
    };
  }, []);

  const { revenue, expenses, accounts, loading } = useRentabilidad({ from, to });

  const series = useMemo(
    () => monthlySeries(revenue, expenses, N_MONTHS, now),
    [revenue, expenses, now],
  );

  const monthKpis = useMemo(() => {
    const rev = revenue.filter((r) => inRange(r.date, monthStart, monthEnd));
    const exp = expenses.filter((e) => inRange(e.date, monthStart, monthEnd));
    const ingresos = rev.reduce((s, r) => s + r.amount, 0);
    const gastos = exp.reduce((s, e) => s + e.amount, 0);
    return { ingresos, gastos, margen: ingresos - gastos };
  }, [revenue, expenses, monthStart, monthEnd]);

  const liquidez = useMemo(() => totalLiquidity(accounts), [accounts]);

  const deptDistribution = useMemo(() => {
    const rev = revenue.filter((r) => inRange(r.date, monthStart, monthEnd));
    const exp = expenses.filter((e) => inRange(e.date, monthStart, monthEnd));
    return marginByDepartment(rev, exp)
      .filter((d) => d.ingresos > 0 || d.gastos > 0)
      .map((d) => ({
        key: d.department,
        label: RENTA_DEPARTMENT_LABELS[d.department as RentaDepartment],
        value: d.margen,
        hint:
          d.margenPct !== null ? `${d.margenPct.toFixed(0)}% margen` : "estructura",
      }));
  }, [revenue, expenses, monthStart, monthEnd]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Analíticas</h1>
          <p className="text-slate-600 text-sm mt-1">
            Ritmo de ventas, ingresos vs gastos, márgenes por departamento,
            liquidez y proyección.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion">
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard
              title="Liquidez (cuentas ARS)"
              value={formatearPrecio(liquidez)}
              icon={Wallet}
              variant="blue"
            />
            <SummaryCard
              title="Ingresos del mes"
              value={formatearPrecio(monthKpis.ingresos)}
              icon={TrendingUp}
              variant="green"
            />
            <SummaryCard
              title="Gastos del mes"
              value={formatearPrecio(monthKpis.gastos)}
              icon={TrendingDown}
              variant="red"
            />
            <SummaryCard
              title="Margen del mes"
              value={formatearPrecio(monthKpis.margen)}
              icon={Scale}
              variant={monthKpis.margen >= 0 ? "green" : "red"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            <MonthlyTrend
              title={`Tendencia últimos ${N_MONTHS} meses`}
              data={series}
            />
            <BarDistribution
              title="Margen por departamento (mes en curso)"
              items={deptDistribution}
              color="blue"
              emptyLabel="Sin movimientos este mes."
            />
          </div>

          <h2 className="text-lg font-semibold mb-3">Analizar en detalle</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <SectionCard
              title="Departamentos"
              description="Ingresos vs gastos y margen por departamento. Dónde se gana y dónde se fuga el capital."
              href="/publimar/administracion/analiticas/departamentos"
              icon={Building2}
            />
            <SectionCard
              title="Ritmo de ventas"
              description="Cuándo se vende: mapa de calor del mes, serie diaria, día de la semana y franja horaria."
              href="/publimar/administracion/analiticas/ritmo-de-ventas"
              icon={CalendarDays}
            />
            <SectionCard
              title="Gastos"
              description="En qué se gasta: por tipo y ranking de proveedores. Filtrable por departamento y período."
              href="/publimar/administracion/analiticas/gastos"
              icon={Receipt}
            />
            <SectionCard
              title="Productos"
              description="Ranking de productos por facturación y volumen (Banderas) y margen real (Vía Pública)."
              href="/publimar/administracion/analiticas/productos"
              icon={Package}
            />
            <SectionCard
              title="Cuentas y liquidez"
              description="Dónde termina la plata: distribución por cuenta y flujo de entradas/salidas."
              href="/publimar/administracion/analiticas/cuentas"
              icon={Wallet}
            />
            <SectionCard
              title="Proyección"
              description="Promedio mensual de ingresos/gastos, balance a futuro y cuánto facturar para no perder."
              href="/publimar/administracion/analiticas/proyeccion"
              icon={LineChart}
            />
          </div>
        </>
      )}
    </div>
  );
}

function SectionCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-blue-900" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">{description}</p>
        <Button asChild variant="outline" className="self-start">
          <Link href={href}>
            Ver {title.toLowerCase()} <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
