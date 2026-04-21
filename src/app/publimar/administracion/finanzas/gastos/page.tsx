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
import { useOperationalExpenses } from "@/hooks/useOperationalExpenses";
import { formatearPrecio, formatDateString } from "@/lib/utils";
import { ArrowLeft, TrendingDown } from "lucide-react";
import {
  EPurchaseDepartment,
  EPurchasePaymentMethod,
  TPurchase,
} from "@/types/purchase";
import {
  TOperationalExpense,
  EXPENSE_CATEGORY_LABELS,
} from "@/types/operationalExpense";
import collections from "@/lib/collections";
import type { DateRange } from "react-day-picker";

const DEPT_LABELS: Record<EPurchaseDepartment, string> = {
  [EPurchaseDepartment.BANDERAS]: "Banderas",
  [EPurchaseDepartment.VIA_PUBLICA]: "Vía Pública",
  [EPurchaseDepartment.ADMINISTRACION]: "Administración",
};

const PM_LABELS: Record<EPurchasePaymentMethod, string> = {
  [EPurchasePaymentMethod.EFECTIVO]: "Efectivo",
  [EPurchasePaymentMethod.TARJETA]: "Tarjeta",
  [EPurchasePaymentMethod.TRANSFERENCIA]: "Transferencia",
  [EPurchasePaymentMethod.CUENTA_CORRIENTE]: "Cuenta corriente",
  [EPurchasePaymentMethod.CHEQUE]: "Cheque",
  [EPurchasePaymentMethod.ECHEQ]: "E-Cheq",
};

interface UnifiedExpense {
  id: string;
  origin: "compra" | "operativo";
  date: string;
  description: string;
  category: string;
  department: EPurchaseDepartment;
  amount: number;
  paymentMethod?: EPurchasePaymentMethod;
  accountId?: string;
}

export default function GastosFinanzasPage() {
  const firestore = useFirestore();
  const { accounts } = useAccounts({ includeArchived: true });
  const { expenses } = useOperationalExpenses();
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const purchasesQuery = useMemo(
    () =>
      query(
        collection(firestore, collections.PURCHASES),
        orderBy("date", "desc"),
        limit(1000),
      ),
    [firestore],
  );
  const { status, data: purchasesData } = useFirestoreCollectionData(
    purchasesQuery,
    { idField: "id" },
  );

  const accountsById = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach((a) => a.id && m.set(a.id, a.name));
    return m;
  }, [accounts]);

  const unified = useMemo<UnifiedExpense[]>(() => {
    const purchases = ((purchasesData as TPurchase[]) || []).filter(
      (p) => !(p as any).deleted,
    );
    const ops = expenses;

    const fromPurchases: UnifiedExpense[] = purchases.map((p) => ({
      id: p.id!,
      origin: "compra",
      date: p.date,
      description: p.description || p.providerName || "Compra",
      category: "Compra a proveedor",
      department: p.department,
      amount: Number(p.amount) || 0,
      paymentMethod: p.paymentMethod,
      accountId: p.accountId ?? undefined,
    }));

    const fromOps: UnifiedExpense[] = ops.map((e: TOperationalExpense) => ({
      id: e.id!,
      origin: "operativo",
      date: e.date,
      description: e.description,
      category: EXPENSE_CATEGORY_LABELS[e.category],
      department: e.department,
      amount: Number(e.amount) || 0,
      paymentMethod: e.paymentMethod,
      accountId: e.accountId,
    }));

    return [...fromPurchases, ...fromOps].sort((a, b) =>
      a.date < b.date ? 1 : -1,
    );
  }, [purchasesData, expenses]);

  const filtered = useMemo(() => {
    const norm = (t: string) =>
      t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const term = norm(searchTerm);
    const from = dateRange?.from ?? null;
    const to = dateRange?.to ?? dateRange?.from ?? null;

    return unified.filter((e) => {
      if (originFilter !== "all" && e.origin !== originFilter) return false;
      if (departmentFilter !== "all" && e.department !== departmentFilter)
        return false;
      if (accountFilter !== "all" && e.accountId !== accountFilter)
        return false;
      if (term && !norm(e.description).includes(term)) return false;
      if (from && to) {
        const d = new Date(`${e.date}T12:00:00`);
        if (d < from || d > new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1))
          return false;
      }
      return true;
    });
  }, [
    unified,
    searchTerm,
    originFilter,
    departmentFilter,
    accountFilter,
    dateRange,
  ]);

  const total = useMemo(
    () => filtered.reduce((s, e) => s + e.amount, 0),
    [filtered],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    originFilter,
    departmentFilter,
    accountFilter,
    dateRange,
    itemsPerPage,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageItems = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gastos</h1>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion/finanzas">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver a Finanzas
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Total gastos (filtrado)"
          value={formatearPrecio(total)}
          icon={TrendingDown}
          variant="red"
        />
        <SummaryCard
          title="Cantidad"
          value={String(filtered.length)}
          icon={TrendingDown}
          variant="slate"
        />
        <SummaryCard
          title="Promedio"
          value={
            filtered.length
              ? formatearPrecio(total / filtered.length)
              : formatearPrecio(0)
          }
          icon={TrendingDown}
          variant="amber"
        />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="mb-2 block">Buscar</Label>
              <Input
                placeholder="Descripción…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-full md:w-44">
              <Label className="mb-2 block">Origen</Label>
              <Select value={originFilter} onValueChange={setOriginFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="compra">Compra a proveedor</SelectItem>
                  <SelectItem value="operativo">Gasto operativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-52">
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
                  {Object.values(EPurchaseDepartment).map((d) => (
                    <SelectItem key={d} value={d}>
                      {DEPT_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-56">
              <Label className="mb-2 block">Cuenta de origen</Label>
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

      {status === "loading" ? (
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
                    <TableHead>Origen</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Depto.</TableHead>
                    <TableHead>Forma de pago</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-6 text-slate-500"
                      >
                        Sin resultados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageItems.map((e) => (
                      <TableRow key={`${e.origin}-${e.id}`}>
                        <TableCell>{formatDateString(e.date)}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              e.origin === "compra"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {e.origin === "compra" ? "Compra" : "Operativo"}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">
                          {e.description}
                        </TableCell>
                        <TableCell>{e.category}</TableCell>
                        <TableCell>{DEPT_LABELS[e.department]}</TableCell>
                        <TableCell>
                          {e.paymentMethod ? PM_LABELS[e.paymentMethod] : "-"}
                        </TableCell>
                        <TableCell>
                          {e.accountId
                            ? accountsById.get(e.accountId) || "-"
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-red-700">
                          {formatearPrecio(e.amount)}
                        </TableCell>
                      </TableRow>
                    ))
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
