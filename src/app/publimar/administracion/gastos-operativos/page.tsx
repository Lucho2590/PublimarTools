"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { SummaryCard } from "@/components/admin/SummaryCard";
import { TablePagination } from "@/components/admin/TablePagination";
import { ExpenseFormModal } from "./modal/ExpenseFormModal";
import { useOperationalExpenses } from "@/hooks/useOperationalExpenses";
import { useAccounts } from "@/hooks/useAccounts";
import { formatearPrecio, formatDateString } from "@/lib/utils";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Receipt,
} from "lucide-react";
import {
  TOperationalExpense,
  EExpenseCategory,
  EXPENSE_CATEGORY_LABELS,
} from "@/types/operationalExpense";
import { EPurchaseDepartment } from "@/types/purchase";
import { toast } from "sonner";

const DEPARTMENT_LABELS: Record<EPurchaseDepartment, string> = {
  [EPurchaseDepartment.BANDERAS]: "Banderas",
  [EPurchaseDepartment.VIA_PUBLICA]: "Vía Pública",
  [EPurchaseDepartment.ADMINISTRACION]: "Administración",
};

export default function GastosOperativosPage() {
  const { expenses, loading, softDeleteExpense } = useOperationalExpenses();
  const { accounts } = useAccounts({ includeArchived: true });
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TOperationalExpense | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const accountsById = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach((a) => a.id && m.set(a.id, a.name));
    return m;
  }, [accounts]);

  const filtered = useMemo(() => {
    const norm = (t: string) =>
      t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const term = norm(searchTerm);
    return expenses.filter((e) => {
      if (categoryFilter !== "all" && e.category !== categoryFilter)
        return false;
      if (departmentFilter !== "all" && e.department !== departmentFilter)
        return false;
      if (term && !norm(e.description).includes(term)) return false;
      return true;
    });
  }, [expenses, searchTerm, categoryFilter, departmentFilter]);

  const totalAmount = useMemo(
    () => filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [filtered],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, departmentFilter, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageItems = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleDelete = async (e: TOperationalExpense) => {
    if (!e.id) return;
    if (!confirm(`¿Eliminar el gasto "${e.description}"? Esta acción no se puede deshacer.`))
      return;
    try {
      await softDeleteExpense(e.id);
      toast.success("Gasto eliminado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gastos operativos</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/publimar/administracion">
              <ArrowLeft className="h-4 w-4 mr-1" /> Volver
            </Link>
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Nuevo gasto
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Total filtrado"
          value={formatearPrecio(totalAmount)}
          icon={Receipt}
          variant="red"
        />
        <SummaryCard
          title="Cantidad de gastos"
          value={String(filtered.length)}
          icon={Receipt}
          variant="slate"
        />
        <SummaryCard
          title="Promedio"
          value={
            filtered.length
              ? formatearPrecio(totalAmount / filtered.length)
              : formatearPrecio(0)
          }
          icon={Receipt}
          variant="amber"
        />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Label className="mb-2 block">Buscar</Label>
              <Input
                placeholder="Descripción…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-full md:w-56">
              <Label className="mb-2 block">Categoría</Label>
              <Select
                value={categoryFilter}
                onValueChange={setCategoryFilter}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.values(EExpenseCategory).map((c) => (
                    <SelectItem key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-56">
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
                      {DEPARTMENT_LABELS[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                    <TableHead>Descripción</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-6 text-slate-500"
                      >
                        No hay gastos que coincidan con los filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageItems.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{formatDateString(e.date)}</TableCell>
                        <TableCell className="font-medium">
                          {e.description}
                        </TableCell>
                        <TableCell>
                          {EXPENSE_CATEGORY_LABELS[e.category]}
                        </TableCell>
                        <TableCell>{DEPARTMENT_LABELS[e.department]}</TableCell>
                        <TableCell>
                          {e.accountId
                            ? accountsById.get(e.accountId) || "-"
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-red-700">
                          {formatearPrecio(Number(e.amount) || 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              onClick={() => {
                                setEditing(e);
                                setModalOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Eliminar"
                              onClick={() => handleDelete(e)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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

      <ExpenseFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        expense={editing}
      />
    </div>
  );
}
