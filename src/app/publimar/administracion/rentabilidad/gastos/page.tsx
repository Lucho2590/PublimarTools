"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { startOfMonth, endOfMonth } from "date-fns";
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
import { useRentabilidad } from "@/hooks/useRentabilidad";
import { formatearPrecio } from "@/lib/utils";
import {
  expensesByCategory,
  expensesByProvider,
  RENTA_DEPARTMENTS,
  RENTA_DEPARTMENT_LABELS,
  type RentaDepartment,
} from "@/lib/rentabilidad";
import { ArrowLeft, TrendingDown } from "lucide-react";

export default function RentabilidadGastosPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return { from: startOfMonth(now), to: endOfMonth(now) };
  });
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");

  const { from, to } = useMemo(() => {
    const from = dateRange?.from ?? startOfMonth(new Date());
    const to = dateRange?.to ?? dateRange?.from ?? endOfMonth(new Date());
    return { from, to };
  }, [dateRange]);

  const { expenses, loading } = useRentabilidad({ from, to });

  const filtered = useMemo(
    () =>
      expenses.filter((e) => {
        if (departmentFilter !== "all" && e.department !== departmentFilter)
          return false;
        if (kindFilter !== "all" && e.kind !== kindFilter) return false;
        return true;
      }),
    [expenses, departmentFilter, kindFilter],
  );

  const total = useMemo(
    () => filtered.reduce((s, e) => s + e.amount, 0),
    [filtered],
  );

  const byCategory = useMemo(
    () => expensesByCategory(filtered),
    [filtered],
  );
  const byProvider = useMemo(
    () => expensesByProvider(filtered),
    [filtered],
  );

  const byCategoryItems = useMemo(
    () => byCategory.map((c) => ({ key: c.key, label: c.label, value: c.amount })),
    [byCategory],
  );
  const byProviderItems = useMemo(
    () => byProvider.map((p) => ({ key: p.key, label: p.label, value: p.amount })),
    [byProvider],
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">¿En qué se gasta?</h1>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion/rentabilidad">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
            <div className="w-full md:w-52">
              <Label className="mb-2 block">Departamento</Label>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
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
            <div className="w-full md:w-52">
              <Label className="mb-2 block">Tipo</Label>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="compra">Compras a proveedor</SelectItem>
                  <SelectItem value="operativo">Gastos operativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-64">
              <Label className="mb-2 block">Rango de fechas</Label>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Total gastos (filtrado)"
          value={formatearPrecio(total)}
          icon={TrendingDown}
          variant="red"
        />
        <SummaryCard
          title="Registros"
          value={String(filtered.length)}
          icon={TrendingDown}
          variant="slate"
        />
        <SummaryCard
          title="Proveedores distintos"
          value={String(byProvider.length)}
          icon={TrendingDown}
          variant="amber"
        />
      </div>

      {loading ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <BarDistribution
              title="Gastos por tipo / categoría"
              items={byCategoryItems}
              color="red"
            />
            <BarDistribution
              title="Ranking de proveedores"
              items={byProviderItems}
              color="amber"
              maxItems={10}
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="p-4 overflow-x-auto">
                <h3 className="text-sm font-semibold mb-3 text-slate-700">
                  Detalle por proveedor
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Total comprado</TableHead>
                      <TableHead className="text-right">% del gasto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byProvider.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center py-6 text-slate-500"
                        >
                          Sin compras a proveedor en el período.
                        </TableCell>
                      </TableRow>
                    ) : (
                      byProvider.map((p) => (
                        <TableRow key={p.key}>
                          <TableCell className="font-medium">{p.label}</TableCell>
                          <TableCell className="text-right font-semibold text-red-700">
                            {formatearPrecio(p.amount)}
                          </TableCell>
                          <TableCell className="text-right text-slate-600">
                            {total > 0
                              ? `${((p.amount / total) * 100).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
