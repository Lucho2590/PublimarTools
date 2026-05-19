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
import { AccountFormModal } from "./modal/AccountFormModal";
import { PaymentDefaultsModal } from "./modal/PaymentDefaultsModal";
import { TransferModal } from "./modal/TransferModal";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminOrAbove } from "@/lib/permissions";
import { formatearPrecio } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowLeft,
  Wallet,
  Plus,
  Pencil,
  Archive,
  RotateCcw,
  Eye,
  Settings,
  Copy,
  ArrowLeftRight,
} from "lucide-react";
import {
  TAccount,
  EAccountStatus,
  EAccountType,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_DEPARTMENT_LABELS,
} from "@/types/account";

export default function CuentasPage() {
  const { accounts, loading, archiveAccount, restoreAccount } = useAccounts({
    includeArchived: true,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>(
    EAccountStatus.ACTIVE,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [defaultsModalOpen, setDefaultsModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const { userRole } = useAuth();
  const canConfigure = isAdminOrAbove(userRole);
  const [editing, setEditing] = useState<TAccount | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filtered = useMemo(() => {
    const norm = (t: string) =>
      t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const term = norm(searchTerm);
    return accounts.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (term) {
        const hay = `${a.referenceNumber ?? ""} ${a.name} ${a.bankName ?? ""} ${a.holder ?? ""}`;
        if (!norm(hay).includes(term)) return false;
      }
      return true;
    });
  }, [accounts, searchTerm, typeFilter, statusFilter]);

  const totalBalance = useMemo(
    () =>
      filtered.reduce(
        (sum, a) => sum + (Number(a.currentBalance) || 0),
        0,
      ),
    [filtered],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, statusFilter, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageItems = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleArchive = async (a: TAccount) => {
    if (!a.id) return;
    if (!confirm(`¿Archivar la cuenta "${a.name}"?`)) return;
    try {
      await archiveAccount(a.id);
      toast.success("Cuenta archivada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al archivar");
    }
  };

  const handleCopyData = async (a: TAccount) => {
    const lines: string[] = [];
    lines.push(
      `Cuenta: ${a.name}${a.referenceNumber ? ` (N° ${a.referenceNumber})` : ""}`,
    );
    if (a.bankName) lines.push(`Banco: ${a.bankName}`);
    if (a.holder) lines.push(`Titular: ${a.holder}`);
    if (a.accountNumber) lines.push(`CBU / N° Cuenta: ${a.accountNumber}`);
    if (a.alias) lines.push(`Alias / CVU: ${a.alias}`);
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Datos copiados al portapapeles");
    } catch {
      toast.error("No se pudieron copiar los datos");
    }
  };

  const handleRestore = async (a: TAccount) => {
    if (!a.id) return;
    try {
      await restoreAccount(a.id);
      toast.success("Cuenta restaurada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al restaurar");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Cuentas</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/publimar/administracion">
              <ArrowLeft className="h-4 w-4 mr-1" /> Volver
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => setTransferModalOpen(true)}
          >
            <ArrowLeftRight className="h-4 w-4 mr-1" /> Transferir
          </Button>
          {canConfigure && (
            <Button
              variant="outline"
              onClick={() => setDefaultsModalOpen(true)}
            >
              <Settings className="h-4 w-4 mr-1" /> Cuentas por forma de pago
            </Button>
          )}
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Nueva cuenta
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Saldo total (filtrado)"
          value={formatearPrecio(totalBalance)}
          icon={Wallet}
          variant="blue"
        />
        <SummaryCard
          title="Cuentas activas"
          value={String(
            accounts.filter((a) => a.status === EAccountStatus.ACTIVE).length,
          )}
          icon={Wallet}
          variant="green"
        />
        <SummaryCard
          title="Cuentas archivadas"
          value={String(
            accounts.filter((a) => a.status === EAccountStatus.ARCHIVED).length,
          )}
          icon={Archive}
          variant="slate"
        />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <Label className="mb-2 block">Buscar</Label>
              <Input
                placeholder="Nombre, banco, titular…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-full md:w-56">
              <Label className="mb-2 block">Tipo</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.values(EAccountType).map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-48">
              <Label className="mb-2 block">Estado</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value={EAccountStatus.ACTIVE}>Activa</SelectItem>
                  <SelectItem value={EAccountStatus.ARCHIVED}>
                    Archivada
                  </SelectItem>
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
                    <TableHead>N° Ref</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Banco</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead className="text-right">Saldo actual</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-6 text-slate-500"
                      >
                        No hay cuentas que coincidan con los filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageItems.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {a.referenceNumber || "-"}
                        </TableCell>
                        <TableCell>{a.name}</TableCell>
                        <TableCell>{ACCOUNT_TYPE_LABELS[a.type]}</TableCell>
                        <TableCell>{a.bankName || "-"}</TableCell>
                        <TableCell>
                          {a.department
                            ? ACCOUNT_DEPARTMENT_LABELS[a.department]
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatearPrecio(Number(a.currentBalance) || 0)}{" "}
                          <span className="text-xs text-slate-500">
                            {a.currency}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              a.status === EAccountStatus.ACTIVE
                                ? "bg-green-100 text-green-800"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {a.status === EAccountStatus.ACTIVE
                              ? "Activa"
                              : "Archivada"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Copiar datos de la cuenta"
                              onClick={() => handleCopyData(a)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              title="Ver movimientos"
                            >
                              <Link
                                href={`/publimar/administracion/finanzas/movimientos?accountId=${a.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              onClick={() => {
                                setEditing(a);
                                setModalOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {a.status === EAccountStatus.ACTIVE ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Archivar"
                                onClick={() => handleArchive(a)}
                              >
                                <Archive className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Restaurar"
                                onClick={() => handleRestore(a)}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
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

      <AccountFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        account={editing}
      />

      {canConfigure && (
        <PaymentDefaultsModal
          open={defaultsModalOpen}
          onOpenChange={setDefaultsModalOpen}
        />
      )}

      <TransferModal
        open={transferModalOpen}
        onOpenChange={setTransferModalOpen}
      />
    </div>
  );
}
