"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useAccounts } from "@/hooks/useAccounts";
import { formatearPrecio } from "@/lib/utils";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { ESaleDepartment, EPaymentMethod } from "@/types/sale";
import collections from "@/lib/collections";
import type { DateRange } from "react-day-picker";
import { startOfMonth, endOfMonth } from "date-fns";

const PAYMENT_METHOD_LABELS: Record<EPaymentMethod, string> = {
  [EPaymentMethod.CASH]: "Efectivo",
  [EPaymentMethod.CREDIT_CARD]: "Tarjeta crédito",
  [EPaymentMethod.DEBIT_CARD]: "Tarjeta débito",
  [EPaymentMethod.TRANSFER]: "Transferencia",
  [EPaymentMethod.MERCADOPAGO]: "MercadoPago",
  [EPaymentMethod.CHECK]: "Cheque",
};

const DEPT_LABELS: Record<ESaleDepartment, string> = {
  [ESaleDepartment.BANDERAS]: "Banderas",
  [ESaleDepartment.VIA_PUBLICA]: "Vía Pública",
};

function toDate(d: any): Date | null {
  if (!d) return null;
  if (typeof d.toDate === "function") return d.toDate();
  if (d?.seconds) return new Date(d.seconds * 1000);
  if (d instanceof Date) return d;
  if (typeof d === "string") return new Date(d);
  return null;
}

export default function IngresosPage() {
  const firestore = useFirestore();
  const { accounts } = useAccounts({ includeArchived: true });
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return { from: startOfMonth(now), to: endOfMonth(now) };
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const salesQuery = useMemo(
    () =>
      query(
        collection(firestore, collections.SALES),
        orderBy("createdAt", "desc"),
        limit(2000),
      ),
    [firestore],
  );
  const { status: salesStatus, data: sales } = useFirestoreCollectionData(
    salesQuery,
    { idField: "id" },
  );

  const accountsById = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach((a) => a.id && m.set(a.id, a.name));
    return m;
  }, [accounts]);

  const filtered = useMemo(() => {
    const norm = (t: string) =>
      t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const term = norm(searchTerm);
    const from = dateRange?.from ?? null;
    const to = dateRange?.to ?? dateRange?.from ?? null;

    return ((sales as any[]) || [])
      .filter((s) => !s.deleted)
      .filter((s) => {
        if (departmentFilter !== "all" && s.department !== departmentFilter)
          return false;
        if (methodFilter !== "all" && s.paymentMethod !== methodFilter)
          return false;
        if (accountFilter !== "all" && s.accountId !== accountFilter)
          return false;
        if (term) {
          const hay = `${s.number ?? ""} ${s.clientName ?? s.client?.name ?? ""}`;
          if (!norm(hay).includes(term)) return false;
        }
        if (from && to) {
          const d = toDate(s.createdAt) || toDate(s.date);
          if (!d) return false;
          if (d < from || d > new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1))
            return false;
        }
        return true;
      });
  }, [sales, searchTerm, departmentFilter, methodFilter, accountFilter, dateRange]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, departmentFilter, methodFilter, accountFilter, dateRange, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageItems = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const total = useMemo(
    () =>
      filtered.reduce(
        (sum, s) =>
          sum + (Number(s.finalTotal ?? s.total) || 0),
        0,
      ),
    [filtered],
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Ingresos</h1>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion/finanzas">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver a Finanzas
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Total ingresos (filtrado)"
          value={formatearPrecio(total)}
          icon={TrendingUp}
          variant="green"
        />
        <SummaryCard
          title="Cantidad ventas"
          value={String(filtered.length)}
          icon={TrendingUp}
          variant="slate"
        />
        <SummaryCard
          title="Ticket promedio"
          value={
            filtered.length
              ? formatearPrecio(total / filtered.length)
              : formatearPrecio(0)
          }
          icon={TrendingUp}
          variant="blue"
        />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="mb-2 block">Buscar</Label>
              <Input
                placeholder="N° venta o cliente…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-full md:w-48">
              <Label className="mb-2 block">Departamento</Label>
              <Select
                value={departmentFilter}
                onValueChange={setDepartmentFilter}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.values(ESaleDepartment).map((d) => (
                    <SelectItem key={d} value={d}>
                      {DEPT_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-52">
              <Label className="mb-2 block">Método de pago</Label>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.values(EPaymentMethod).map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-56">
              <Label className="mb-2 block">Cuenta destino</Label>
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
            <div className="w-full md:w-64">
              <Label className="mb-2 block">Rango de fechas</Label>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>
          </div>
        </CardContent>
      </Card>

      {salesStatus === "loading" ? (
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
                    <TableHead>N°</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Depto.</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Cuenta destino</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-6 text-slate-500"
                      >
                        Sin resultados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageItems.map((s: any) => {
                      const accountLabel = s.accountId
                        ? accountsById.get(s.accountId) || "-"
                        : s.bank || "-";
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            {s.number || "-"}
                          </TableCell>
                          <TableCell>
                            {s.clientName || s.client?.name || "-"}
                          </TableCell>
                          <TableCell>
                            {s.department
                              ? DEPT_LABELS[s.department as ESaleDepartment]
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {s.paymentMethod
                              ? PAYMENT_METHOD_LABELS[
                                  s.paymentMethod as EPaymentMethod
                                ]
                              : "-"}
                          </TableCell>
                          <TableCell>{accountLabel}</TableCell>
                          <TableCell className="text-right font-semibold text-green-700">
                            {formatearPrecio(
                              Number(s.finalTotal ?? s.total) || 0,
                            )}
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
