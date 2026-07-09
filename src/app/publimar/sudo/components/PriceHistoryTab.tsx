"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFirestore } from "reactfire";
import {
  Timestamp,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { DateRange } from "react-day-picker";
import { toast } from "sonner";
import collections from "@/lib/collections";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { TablePagination } from "@/components/admin/TablePagination";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { MonthlyLineChart } from "@/components/admin/MonthlyLineChart";
import {
  ArrowDown,
  ArrowUp,
  LineChart,
  RefreshCw,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import { formatearPrecio, formatDate } from "@/lib/utils";
import { useAuditLog } from "@/hooks/useAuditLog";
import { revertPriceChanges } from "@/lib/priceHistory";
import {
  EPriceChangeSource,
  PRICE_SOURCE_LABELS,
  TPriceHistoryEntry,
} from "@/types/priceHistory";

// Máximo de eventos a traer por ventana de fecha (se filtra el resto en cliente).
const FETCH_LIMIT = 2000;

const SOURCE_BADGE: Record<EPriceChangeSource, string> = {
  [EPriceChangeSource.AUMENTO]: "bg-blue-100 text-blue-800",
  [EPriceChangeSource.REDONDEO_MASIVO]: "bg-purple-100 text-purple-800",
  [EPriceChangeSource.EDICION]: "bg-amber-100 text-amber-800",
  [EPriceChangeSource.CREACION]: "bg-green-100 text-green-800",
  [EPriceChangeSource.REVERT]: "bg-slate-200 text-slate-800",
};

const SOURCE_OPTIONS = Object.values(EPriceChangeSource);

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function PriceHistoryTab() {
  const firestore = useFirestore();
  const { actor } = useAuditLog();

  const [items, setItems] = useState<TPriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);

  // Filtros.
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<EPriceChangeSource | "all">("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [groupByBatch, setGroupByBatch] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return { from, to };
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const constraints = [] as any[];
      if (dateRange?.from) {
        constraints.push(where("createdAt", ">=", Timestamp.fromDate(dateRange.from)));
      }
      if (dateRange?.to) {
        const to = new Date(dateRange.to);
        to.setHours(23, 59, 59, 999);
        constraints.push(where("createdAt", "<=", Timestamp.fromDate(to)));
      }
      constraints.push(orderBy("createdAt", "desc"));
      constraints.push(limit(FETCH_LIMIT));

      const snap = await getDocs(
        query(collection(firestore, collections.PRICE_HISTORY), ...constraints)
      );
      const rows: TPriceHistoryEntry[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<TPriceHistoryEntry, "id">),
      }));
      setItems(rows);
    } catch (err: any) {
      console.error("[PriceHistoryTab] query failed", err);
      setError(
        err?.message?.includes("index")
          ? "Falta un índice en Firestore (createdAt). Revisá la consola para el link."
          : "Error cargando el historial de precios."
      );
    } finally {
      setLoading(false);
    }
  }, [firestore, dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset de página al cambiar filtros.
  useEffect(() => {
    setCurrentPage(1);
  }, [search, sourceFilter, userFilter, groupByBatch, itemsPerPage]);

  const users = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of items) {
      if (it.userId) map.set(it.userId, it.userName || it.userEmail || it.userId);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (sourceFilter !== "all" && it.source !== sourceFilter) return false;
      if (userFilter !== "all" && it.userId !== userFilter) return false;
      if (q && !`${it.productName} ${it.variantSize ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [items, search, sourceFilter, userFilter]);

  // KPIs.
  const kpis = useMemo(() => {
    const total = filtered.length;
    const withPct = filtered.filter((it) => it.oldPrice > 0);
    const avgPct =
      withPct.length > 0
        ? withPct.reduce((s, it) => s + it.changePct, 0) / withPct.length
        : 0;
    const up = filtered.filter((it) => it.newPrice > it.oldPrice).length;
    const down = filtered.filter((it) => it.newPrice < it.oldPrice).length;
    return { total, avgPct, up, down };
  }, [filtered]);

  // Serie mensual: cantidad de cambios por mes.
  const chartData = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const it of filtered) {
      const d = it.createdAt?.toDate?.() ?? null;
      if (!d) continue;
      const k = monthKey(d);
      byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, cambios]) => ({ label, cambios }));
  }, [filtered]);

  // Agrupación por lote (para revertir operaciones completas).
  const batches = useMemo(() => {
    const map = new Map<string, TPriceHistoryEntry[]>();
    for (const it of filtered) {
      const list = map.get(it.batchId) ?? [];
      list.push(it);
      map.set(it.batchId, list);
    }
    return Array.from(map.entries())
      .map(([batchId, entries]) => ({
        batchId,
        entries,
        source: entries[0].source,
        createdAt: entries[0].createdAt,
        userName: entries[0].userName || entries[0].userEmail || "—",
        count: entries.length,
        allReverted: entries.every((e) => e.reverted),
      }))
      .sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
      );
  }, [filtered]);

  const totalPages = Math.max(
    1,
    Math.ceil((groupByBatch ? batches.length : filtered.length) / itemsPerPage)
  );
  const pageStart = (currentPage - 1) * itemsPerPage;
  const pageRows = filtered.slice(pageStart, pageStart + itemsPerPage);
  const pageBatches = batches.slice(pageStart, pageStart + itemsPerPage);

  const doRevertEntries = async (
    entries: TPriceHistoryEntry[],
    label: string
  ) => {
    const revertibles = entries.filter(
      (e) => !e.reverted && e.source !== EPriceChangeSource.CREACION
    );
    if (revertibles.length === 0) {
      toast.error("No hay cambios revertibles en esta selección");
      return;
    }
    if (
      !confirm(
        `Vas a revertir ${revertibles.length} precio(s) de ${label}. ` +
          `Esto vuelve a poner el precio anterior y pisa el actual. ¿Continuar?`
      )
    )
      return;

    setReverting(true);
    try {
      const res = await revertPriceChanges(firestore, actor, revertibles);
      toast.success(
        `Se revirtieron ${res.pricesReverted} precio(s) en ${res.productsUpdated} producto(s)`
      );
      await load();
    } catch (err) {
      console.error("[PriceHistoryTab] revert failed", err);
      toast.error("Error al revertir los cambios");
    } finally {
      setReverting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-900" />
            Historial de precios
          </CardTitle>
          <Button onClick={load} variant="outline" disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Recargar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Rango de fechas</Label>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>
            <div className="space-y-1.5">
              <Label>Producto</Label>
              <Input
                placeholder="Buscar por producto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Origen</Label>
              <Select
                value={sourceFilter}
                onValueChange={(v) => setSourceFilter(v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {SOURCE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PRICE_SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Usuario</Label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              title="Cambios"
              value={kpis.total}
              icon={LineChart}
              variant="blue"
            />
            <SummaryCard
              title="Variación promedio"
              value={`${kpis.avgPct >= 0 ? "+" : ""}${kpis.avgPct.toFixed(1)}%`}
              icon={TrendingUp}
              variant={kpis.avgPct >= 0 ? "green" : "red"}
            />
            <SummaryCard
              title="Suben"
              value={kpis.up}
              icon={ArrowUp}
              variant="green"
            />
            <SummaryCard
              title="Bajan"
              value={kpis.down}
              icon={ArrowDown}
              variant="red"
            />
          </div>
        </CardContent>
      </Card>

      {chartData.length > 0 && (
        <MonthlyLineChart
          title="Cambios de precio por mes"
          data={chartData}
          series={[{ key: "cambios", label: "Cambios", color: "#1e3a8a" }]}
          formatValue={(v) => String(Math.round(v))}
          height={260}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>
            {groupByBatch ? "Operaciones" : "Detalle de cambios"}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGroupByBatch((v) => !v)}
          >
            {groupByBatch ? "Ver detalle" : "Ver por operación"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay cambios de precio en el período.
            </div>
          ) : groupByBatch ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead className="text-right">Precios</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageBatches.map((b) => (
                    <TableRow key={b.batchId} className={b.allReverted ? "opacity-60" : ""}>
                      <TableCell>{formatDate(b.createdAt)}</TableCell>
                      <TableCell>
                        <Badge className={SOURCE_BADGE[b.source]} variant="secondary">
                          {PRICE_SOURCE_LABELS[b.source]}
                        </Badge>
                      </TableCell>
                      <TableCell>{b.userName}</TableCell>
                      <TableCell className="text-right">{b.count}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            reverting ||
                            b.allReverted ||
                            b.source === EPriceChangeSource.CREACION
                          }
                          onClick={() =>
                            doRevertEntries(b.entries, PRICE_SOURCE_LABELS[b.source].toLowerCase())
                          }
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          {b.allReverted ? "Revertido" : "Revertir lote"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Anterior</TableHead>
                    <TableHead className="text-right">Nuevo</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((it) => {
                    const up = it.newPrice > it.oldPrice;
                    const down = it.newPrice < it.oldPrice;
                    return (
                      <TableRow key={it.id} className={it.reverted ? "opacity-60" : ""}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(it.createdAt)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {it.productName}
                          {it.variantSize ? (
                            <span className="text-muted-foreground"> · {it.variantSize}</span>
                          ) : null}
                          {it.reverted && (
                            <Badge variant="secondary" className="ml-2 bg-slate-200 text-slate-700">
                              revertido
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {it.source === EPriceChangeSource.CREACION
                            ? "—"
                            : formatearPrecio(it.oldPrice)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatearPrecio(it.newPrice)}
                        </TableCell>
                        <TableCell
                          className={`text-right ${
                            up ? "text-emerald-600" : down ? "text-red-600" : "text-muted-foreground"
                          }`}
                        >
                          {it.oldPrice > 0
                            ? `${it.changePct >= 0 ? "+" : ""}${it.changePct.toFixed(1)}%`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={SOURCE_BADGE[it.source]} variant="secondary">
                            {PRICE_SOURCE_LABELS[it.source]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {it.userName || it.userEmail || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={
                              reverting ||
                              it.reverted ||
                              it.source === EPriceChangeSource.CREACION
                            }
                            onClick={() => doRevertEntries([it], it.productName)}
                            title="Revertir este cambio"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={groupByBatch ? batches.length : filtered.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
