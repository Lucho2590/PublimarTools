"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { TablePagination } from "@/components/admin/TablePagination";
import { useCreditNotes } from "@/hooks/useCreditNotes";
import { formatearPrecio, formatDate } from "@/lib/utils";
import { ArrowLeft, FileText, Plus, Receipt, Wallet } from "lucide-react";
import {
  CREDIT_NOTE_ORIGIN_LABELS,
  CREDIT_NOTE_STATUS_LABELS,
  ECreditNoteOriginType,
  ECreditNoteStatus,
} from "@/types/creditNote";
import { EClientSection } from "@/types/client";
import type { DateRange } from "react-day-picker";

function toDate(d: any): Date | null {
  if (!d) return null;
  if (typeof d.toDate === "function") return d.toDate();
  if (d?.seconds) return new Date(d.seconds * 1000);
  if (d instanceof Date) return d;
  if (typeof d === "string") return new Date(d);
  return null;
}

const STATUS_BADGE: Record<ECreditNoteStatus, string> = {
  [ECreditNoteStatus.AVAILABLE]: "bg-green-100 text-green-800 hover:bg-green-100",
  [ECreditNoteStatus.USED]: "bg-slate-200 text-slate-700 hover:bg-slate-200",
  [ECreditNoteStatus.EXPIRED]: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  [ECreditNoteStatus.CANCELLED]: "bg-red-100 text-red-800 hover:bg-red-100",
};

export default function NotasCreditoPage() {
  const { notes, loading } = useCreditNotes();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filtered = useMemo(() => {
    const from = dateRange?.from ?? null;
    const to = dateRange?.to ?? dateRange?.from ?? null;
    const term = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (statusFilter !== "all" && n.status !== statusFilter) return false;
      if (originFilter !== "all" && n.originType !== originFilter) return false;
      if (sectionFilter !== "all" && (n.clientSection ?? "") !== sectionFilter) return false;
      if (term) {
        const hay =
          (n.number ?? "").toLowerCase().includes(term) ||
          (n.clientName ?? "").toLowerCase().includes(term) ||
          (n.reason ?? "").toLowerCase().includes(term);
        if (!hay) return false;
      }
      if (from && to) {
        const d = toDate(n.createdAt);
        if (!d) return false;
        if (d < from || d > new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1))
          return false;
      }
      return true;
    });
  }, [notes, statusFilter, originFilter, sectionFilter, search, dateRange]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, originFilter, sectionFilter, search, dateRange, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageItems = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const totals = useMemo(() => {
    let totalAvailable = 0;
    let totalUsed = 0;
    let countAvailable = 0;
    filtered.forEach((n) => {
      if (n.status === ECreditNoteStatus.AVAILABLE) {
        totalAvailable += Number(n.amount) || 0;
        countAvailable++;
      }
      if (n.status === ECreditNoteStatus.USED) {
        totalUsed += Number(n.appliedAmount ?? n.amount) || 0;
      }
    });
    return { totalAvailable, totalUsed, countAvailable };
  }, [filtered]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notas de crédito</h1>
          <p className="text-slate-600 text-sm mt-1">
            Saldo a favor del cliente por devoluciones o acuerdos. Aplica a cualquier orden de trabajo o facturación.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/publimar/administracion">
              <ArrowLeft className="h-4 w-4 mr-1" /> Administración
            </Link>
          </Button>
          <Button asChild>
            <Link href="/publimar/administracion/notas-credito/nueva">
              <Plus className="h-4 w-4 mr-1" /> Nueva nota de crédito
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          title="Saldo disponible"
          value={formatearPrecio(totals.totalAvailable)}
          subtitle={`${totals.countAvailable} nota${totals.countAvailable === 1 ? "" : "s"}`}
          icon={Wallet}
          variant="green"
        />
        <SummaryCard
          title="Aplicado"
          value={formatearPrecio(totals.totalUsed)}
          icon={Receipt}
          variant="slate"
        />
        <SummaryCard
          title="Total notas"
          value={String(filtered.length)}
          icon={FileText}
          variant="blue"
        />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
            <div className="w-full md:w-64">
              <Label className="mb-2 block">Buscar</Label>
              <Input
                placeholder="Nro, cliente o motivo"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-full md:w-44">
              <Label className="mb-2 block">Estado</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.values(ECreditNoteStatus).map((s) => (
                    <SelectItem key={s} value={s}>
                      {CREDIT_NOTE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-44">
              <Label className="mb-2 block">Origen</Label>
              <Select value={originFilter} onValueChange={setOriginFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.values(ECreditNoteOriginType).map((o) => (
                    <SelectItem key={o} value={o}>
                      {CREDIT_NOTE_ORIGIN_LABELS[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-44">
              <Label className="mb-2 block">Sección</Label>
              <Select value={sectionFilter} onValueChange={setSectionFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value={EClientSection.BANDERAS}>Banderas</SelectItem>
                  <SelectItem value={EClientSection.VIA_PUBLICA}>Vía Pública</SelectItem>
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
                    <TableHead>Número</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Emitida</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-slate-500">
                        Sin notas de crédito para los filtros aplicados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageItems.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell className="font-medium">{n.number}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{n.clientName}</span>
                            {n.clientSection && (
                              <span className="text-xs text-slate-500">
                                {n.clientSection === EClientSection.BANDERAS
                                  ? "Banderas"
                                  : "Vía Pública"}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {CREDIT_NOTE_ORIGIN_LABELS[n.originType]}
                          {n.originDocumentNumber && (
                            <span className="text-xs text-slate-500 block">
                              {n.originDocumentNumber}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_BADGE[n.status]}>
                            {CREDIT_NOTE_STATUS_LABELS[n.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(n.createdAt)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatearPrecio(Number(n.amount) || 0)}
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/publimar/administracion/notas-credito/${n.id}`}>
                              Ver
                            </Link>
                          </Button>
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
