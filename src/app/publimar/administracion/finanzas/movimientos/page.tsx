"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { TablePagination } from "@/components/admin/TablePagination";
import { useAccountMovements } from "@/hooks/useAccountMovements";
import { useAccounts } from "@/hooks/useAccounts";
import { formatearPrecio, formatDate } from "@/lib/utils";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import {
  EMovementType,
  MOVEMENT_TYPE_LABELS,
  movementSignedAmount,
} from "@/types/accountMovement";
import type { DateRange } from "react-day-picker";

function toDate(d: any): Date | null {
  if (!d) return null;
  if (typeof d.toDate === "function") return d.toDate();
  if (d?.seconds) return new Date(d.seconds * 1000);
  if (d instanceof Date) return d;
  if (typeof d === "string") return new Date(d);
  return null;
}

export default function MovimientosPage() {
  const searchParams = useSearchParams();
  const initialAccount = searchParams?.get("accountId") ?? "all";

  const { accounts } = useAccounts({ includeArchived: true });
  const [accountFilter, setAccountFilter] = useState<string>(initialAccount);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Cuando cambia el query param actualiza la selección
  useEffect(() => {
    const fromUrl = searchParams?.get("accountId");
    if (fromUrl) setAccountFilter(fromUrl);
  }, [searchParams]);

  const { movements, loading } = useAccountMovements({
    accountId: accountFilter !== "all" ? accountFilter : undefined,
  });

  const accountsById = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach((a) => a.id && m.set(a.id, a.name));
    return m;
  }, [accounts]);

  const filtered = useMemo(() => {
    const from = dateRange?.from ?? null;
    const to = dateRange?.to ?? dateRange?.from ?? null;
    return movements.filter((m) => {
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (from && to) {
        const d = toDate(m.date);
        if (!d) return false;
        if (d < from || d > new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1))
          return false;
      }
      return true;
    });
  }, [movements, typeFilter, dateRange]);

  useEffect(() => {
    setCurrentPage(1);
  }, [accountFilter, typeFilter, dateRange, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageItems = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    filtered.forEach((m) => {
      const signed = movementSignedAmount(m);
      if (signed >= 0) income += signed;
      else expense += -signed;
    });
    return { income, expense, net: income - expense };
  }, [filtered]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Movimientos de cuentas</h1>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion/finanzas">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver a Finanzas
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Ingresos"
          value={formatearPrecio(totals.income)}
          icon={ArrowLeftRight}
          variant="green"
        />
        <SummaryCard
          title="Egresos"
          value={formatearPrecio(totals.expense)}
          icon={ArrowLeftRight}
          variant="red"
        />
        <SummaryCard
          title="Neto"
          value={formatearPrecio(totals.net)}
          icon={ArrowLeftRight}
          variant={totals.net >= 0 ? "blue" : "amber"}
        />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
            <div className="w-full md:w-56">
              <Label className="mb-2 block">Cuenta</Label>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id!}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-56">
              <Label className="mb-2 block">Tipo de movimiento</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.values(EMovementType).map((t) => (
                    <SelectItem key={t} value={t}>
                      {MOVEMENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
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

      {loading ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-6 text-slate-500"
                      >
                        Sin movimientos para los filtros aplicados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageItems.map((m) => {
                      const signed = movementSignedAmount(m);
                      return (
                        <TableRow key={m.id}>
                          <TableCell>{formatDate(m.date)}</TableCell>
                          <TableCell>
                            {accountsById.get(m.accountId) || "-"}
                          </TableCell>
                          <TableCell>
                            {MOVEMENT_TYPE_LABELS[m.type]}
                          </TableCell>
                          <TableCell className="font-medium">
                            {m.description}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {m.sourceType ?? "-"}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${
                              signed >= 0 ? "text-green-700" : "text-red-700"
                            }`}
                          >
                            {signed >= 0 ? "+" : ""}
                            {formatearPrecio(signed)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filtered.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
