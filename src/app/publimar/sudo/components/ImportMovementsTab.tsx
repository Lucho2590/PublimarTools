"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFirestore } from "reactfire";
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { BarDistribution } from "@/components/admin/BarDistribution";
import { TablePagination } from "@/components/admin/TablePagination";
import { AccountSelect } from "@/components/admin/AccountSelect";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuth } from "@/contexts/AuthContext";
import { formatearPrecio, formatDate } from "@/lib/utils";
import collections from "@/lib/collections";
import {
  registerMovementsBatch,
  reverseImportBatch,
  type BatchMovementItem,
} from "@/lib/accountMovements";
import { EMovementType, TAccountMovement } from "@/types/accountMovement";
import {
  parseFile,
  normalizeRows,
  detectDuplicates,
  distinctRefs,
  autoMatchRef,
  groupByAccount,
  groupByMonth,
  type MappingConfig,
  type NormalizedMovement,
  type ParsedSheet,
} from "@/lib/importMovements";
import {
  Upload,
  FileSpreadsheet,
  ArrowLeft,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Undo2,
} from "lucide-react";

// Heurística para preseleccionar columnas según nombres típicos de homebanking.
function guessColumn(columns: string[], patterns: RegExp[]): string {
  for (const p of patterns) {
    const hit = columns.find((c) => p.test(c.toLowerCase()));
    if (hit) return hit;
  }
  return "";
}

function defaultMapping(columns: string[]): MappingConfig {
  const debit = guessColumn(columns, [/d[eé]bito/, /debe/, /egreso/]);
  const credit = guessColumn(columns, [/cr[eé]dito/, /haber/, /ingreso/]);
  const hasDebitCredit = Boolean(debit && credit);
  return {
    dateCol: guessColumn(columns, [/fecha/, /date/]),
    descriptionCol: guessColumn(columns, [
      /descrip/,
      /concepto/,
      /detalle/,
      /movimiento/,
      /referencia banc/,
    ]),
    amountMode: hasDebitCredit ? "debitCredit" : "single",
    amountCol: guessColumn(columns, [/importe/, /monto/, /amount/]),
    singleSignMode: "inverted",
    debitCol: debit,
    creditCol: credit,
    accountMode: "single",
    accountRefCol: guessColumn(columns, [/cuenta/, /n° cuenta/, /nro/, /referenc/]),
    singleAccountId: "",
  };
}

const NONE = "__none__";

export function ImportMovementsTab() {
  const firestore = useFirestore();
  const { accounts } = useAccounts({ includeArchived: true });
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<MappingConfig | null>(null);
  const [parsing, setParsing] = useState(false);

  // Mapeo confirmado por el usuario: número normalizado del Excel → accountId.
  const [refMap, setRefMap] = useState<Record<string, string>>({});

  const [normalized, setNormalized] = useState<NormalizedMovement[]>([]);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [duplicates, setDuplicates] = useState<Set<number>>(new Set());

  // Paso 2: filtro por cuenta y paginación de la tabla de detalle.
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ created: number; batchId: string } | null>(
    null,
  );
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);

  // -------------------------------------------------------------------------
  // Paso 1: subir y mapear
  // -------------------------------------------------------------------------

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setParsing(true);
    try {
      const parsed = await parseFile(file);
      if (parsed.rows.length === 0) {
        toast.error("El archivo no tiene filas legibles.");
        return;
      }
      setFileName(file.name);
      setSheet(parsed);
      setMapping(defaultMapping(parsed.columns));
    } catch (e) {
      console.error(e);
      toast.error("No se pudo leer el archivo. ¿Es un Excel o CSV válido?");
    } finally {
      setParsing(false);
    }
  };

  const updateMapping = (patch: Partial<MappingConfig>) =>
    setMapping((m) => (m ? { ...m, ...patch } : m));

  // Números de cuenta distintos del archivo (modo "columna").
  const refList = useMemo(() => {
    if (!sheet || !mapping || mapping.accountMode !== "column" || !mapping.accountRefCol)
      return [];
    return distinctRefs(sheet.rows, mapping.accountRefCol);
  }, [sheet, mapping]);

  // Al detectar los números distintos, precargar el mapeo con el match automático.
  useEffect(() => {
    if (refList.length === 0) return;
    setRefMap((prev) => {
      const next = { ...prev };
      refList.forEach((r) => {
        if (next[r.normalized] === undefined) {
          next[r.normalized] = autoMatchRef(r.normalized, accounts);
        }
      });
      return next;
    });
  }, [refList, accounts]);

  const mappedCount = useMemo(
    () => refList.filter((r) => refMap[r.normalized]).length,
    [refList, refMap],
  );

  const mappingValid = useMemo(() => {
    if (!mapping) return false;
    if (!mapping.dateCol || !mapping.descriptionCol) return false;
    if (mapping.amountMode === "single" && !mapping.amountCol) return false;
    if (
      mapping.amountMode === "debitCredit" &&
      !mapping.debitCol &&
      !mapping.creditCol
    )
      return false;
    if (mapping.accountMode === "single" && !mapping.singleAccountId) return false;
    if (mapping.accountMode === "column") {
      if (!mapping.accountRefCol) return false;
      if (mappedCount === 0) return false; // al menos un número mapeado a una cuenta
    }
    return true;
  }, [mapping, mappedCount]);

  const goToAnalysis = async () => {
    if (!sheet || !mapping) return;
    const rows = normalizeRows(
      sheet.rows,
      mapping,
      accounts,
      mapping.accountMode === "column" ? refMap : undefined,
    );
    setNormalized(rows);
    setAccountFilter("all");
    setPage(1);

    // Cargar movimientos existentes de las cuentas afectadas en el rango de
    // fechas para detectar duplicados.
    const dates = rows.map((r) => r.date).filter(Boolean) as Date[];
    let dupes = new Set<number>();
    if (dates.length > 0) {
      const min = new Date(Math.min(...dates.map((d) => d.getTime())));
      const max = new Date(Math.max(...dates.map((d) => d.getTime())));
      min.setHours(0, 0, 0, 0);
      max.setHours(23, 59, 59, 999);
      try {
        const snap = await getDocs(
          query(
            collection(firestore, collections.ACCOUNT_MOVEMENTS),
            where("date", ">=", Timestamp.fromDate(min)),
            where("date", "<=", Timestamp.fromDate(max)),
          ),
        );
        const affected = new Set(
          rows.map((r) => r.accountId).filter(Boolean) as string[],
        );
        const existing = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }) as TAccountMovement)
          .filter((m) => !(m as any).deleted && affected.has(m.accountId));
        dupes = detectDuplicates(rows, existing);
      } catch (e) {
        console.error("No se pudieron cargar movimientos para detectar duplicados", e);
      }
    }
    setDuplicates(dupes);
    setExcluded(new Set(dupes)); // duplicados pre-deseleccionados
    setOverrides({});
    setStep(2);
  };

  // -------------------------------------------------------------------------
  // Paso 2: análisis (aplica overrides de cuenta)
  // -------------------------------------------------------------------------

  const effective = useMemo<NormalizedMovement[]>(
    () =>
      normalized.map((m) => {
        const override = overrides[m.index];
        if (override && override !== NONE) {
          return { ...m, accountId: override, matchStatus: "matched" as const };
        }
        return m;
      }),
    [normalized, overrides],
  );

  const included = useMemo(
    () => effective.filter((m) => !excluded.has(m.index)),
    [effective, excluded],
  );

  const NO_ACCOUNT = "__none__";

  // Filtro por cuenta (paso 2).
  const matchesFilter = (m: NormalizedMovement) => {
    if (accountFilter === "all") return true;
    if (accountFilter === NO_ACCOUNT) return !m.accountId;
    return m.accountId === accountFilter;
  };

  // Conjunto importable completo (sin filtro): para el chart panorámico y el total.
  const importableAll = useMemo(
    () => included.filter((m) => m.accountId && m.date),
    [included],
  );

  // Conjunto que respeta el filtro de cuenta: KPIs, "neto por mes", tabla e importación.
  const importableView = useMemo(
    () => importableAll.filter(matchesFilter),
    [importableAll, accountFilter],
  );

  // Filas a mostrar en la tabla de detalle (incluye excluidas y "sin cuenta").
  const tableRows = useMemo(
    () => effective.filter(matchesFilter),
    [effective, accountFilter],
  );

  // Opciones del filtro: cada cuenta presente + "sin cuenta" si corresponde.
  const filterOptions = useMemo(() => {
    const ids = new Set(importableAll.map((m) => m.accountId as string));
    const opts = Array.from(ids).map((id) => {
      const acc = accounts.find((a) => a.id === id);
      const ref = acc?.referenceNumber;
      return {
        id,
        name: `${acc?.name || "Cuenta"}${ref ? ` (N° ${ref})` : ""}`,
      };
    });
    opts.sort((a, b) => a.name.localeCompare(b.name));
    return opts;
  }, [importableAll, accounts]);

  const stats = useMemo(() => {
    const ingresos = importableView
      .filter((m) => m.type === EMovementType.INCOME)
      .reduce((s, m) => s + m.amount, 0);
    const egresos = importableView
      .filter((m) => m.type === EMovementType.EXPENSE)
      .reduce((s, m) => s + m.amount, 0);
    const cuentas = new Set(importableView.map((m) => m.accountId)).size;
    const sinCuenta = effective.filter((m) => !m.accountId).length;
    return {
      ingresos,
      egresos,
      neto: ingresos - egresos,
      cuentas,
      sinCuenta,
      dupes: duplicates.size,
      total: effective.length,
      importables: importableView.length,
    };
  }, [importableView, effective, duplicates]);

  // Chart panorámico: siempre todas las cuentas (no depende del filtro).
  const byAccountItems = useMemo(
    () =>
      groupByAccount(importableAll, accounts).map((g) => ({
        key: g.key,
        label: g.label,
        value: g.neto,
        hint: `${g.count} mov.`,
      })),
    [importableAll, accounts],
  );
  const byMonthItems = useMemo(
    () =>
      groupByMonth(importableView).map((g) => ({
        key: g.key,
        label: g.label,
        value: g.neto,
        hint: `${g.count} mov.`,
      })),
    [importableView],
  );

  // Paginación de la tabla de detalle.
  const totalPages = Math.max(1, Math.ceil(tableRows.length / perPage));
  const pageRows = useMemo(
    () => tableRows.slice((page - 1) * perPage, page * perPage),
    [tableRows, page, perPage],
  );
  useEffect(() => {
    setPage(1);
  }, [accountFilter, perPage]);

  const toggleExcluded = (index: number) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  // -------------------------------------------------------------------------
  // Paso 3: confirmar e importar
  // -------------------------------------------------------------------------

  const doImport = async () => {
    if (!user?.uid) {
      toast.error("No se pudo identificar el usuario.");
      return;
    }
    if (importableView.length === 0) {
      toast.error("No hay movimientos con cuenta y fecha para importar.");
      return;
    }
    setImporting(true);
    setProgress(0);
    const batchId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `imp-${Date.now()}`;

    try {
      // Agrupar por cuenta (respeta el filtro de cuenta activo).
      const byAccount = new Map<string, BatchMovementItem[]>();
      importableView.forEach((m) => {
        const arr = byAccount.get(m.accountId!) || [];
        arr.push({
          type: m.type,
          amount: m.amount,
          description: m.description || "Movimiento importado",
          date: m.date as Date,
        });
        byAccount.set(m.accountId!, arr);
      });

      let created = 0;
      const total = byAccount.size;
      let done = 0;
      for (const [accountId, items] of Array.from(byAccount.entries())) {
        created += await registerMovementsBatch(firestore, accountId, items, {
          importBatchId: batchId,
          createdBy: user.uid,
        });
        done += 1;
        setProgress(Math.round((done / total) * 100));
      }

      setResult({ created, batchId });
      setUndone(false);
      setStep(3);
      toast.success(`Se importaron ${created} movimientos.`);
    } catch (e) {
      console.error(e);
      toast.error("Error al importar. Es posible que la carga sea parcial.");
    } finally {
      setImporting(false);
    }
  };

  const doUndo = async () => {
    if (!result) return;
    setUndoing(true);
    try {
      const n = await reverseImportBatch(firestore, result.batchId);
      setUndone(true);
      toast.success(`Se deshicieron ${n} movimientos.`);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo deshacer la importación.");
    } finally {
      setUndoing(false);
    }
  };

  const reset = () => {
    setStep(1);
    setSheet(null);
    setMapping(null);
    setFileName("");
    setNormalized([]);
    setOverrides({});
    setExcluded(new Set());
    setDuplicates(new Set());
    setRefMap({});
    setAccountFilter("all");
    setPage(1);
    setResult(null);
    setUndone(false);
    setProgress(0);
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const columns = sheet?.columns ?? [];

  return (
    <div className="space-y-4">
      {/* Indicador de pasos */}
      <div className="flex items-center gap-2 text-sm">
        {["1. Subir y mapear", "2. Analizar", "3. Importar"].map((s, i) => (
          <span
            key={s}
            className={`px-3 py-1 rounded-full ${
              step === i + 1
                ? "bg-blue-900 text-white"
                : step > i + 1
                  ? "bg-green-100 text-green-800"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            {s}
          </span>
        ))}
      </div>

      {/* PASO 1 */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Subir resumen (Excel / CSV) y mapear columnas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] || null)}
            />
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
              >
                <Upload className="h-4 w-4 mr-2" />
                {parsing ? "Leyendo…" : "Seleccionar archivo"}
              </Button>
              {fileName && (
                <span className="text-sm text-slate-600 flex items-center gap-1">
                  <FileSpreadsheet className="h-4 w-4" /> {fileName} —{" "}
                  {sheet?.rows.length ?? 0} filas
                </span>
              )}
            </div>

            {sheet && mapping && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ColumnSelect
                    label="Columna de Fecha"
                    value={mapping.dateCol}
                    columns={columns}
                    onChange={(v) => updateMapping({ dateCol: v })}
                  />
                  <ColumnSelect
                    label="Columna de Descripción"
                    value={mapping.descriptionCol}
                    columns={columns}
                    onChange={(v) => updateMapping({ descriptionCol: v })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Monto</Label>
                  <Select
                    value={mapping.amountMode}
                    onValueChange={(v) =>
                      updateMapping({ amountMode: v as MappingConfig["amountMode"] })
                    }
                  >
                    <SelectTrigger className="w-full md:w-80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">
                        Una columna con signo (+ ingreso / − egreso)
                      </SelectItem>
                      <SelectItem value="debitCredit">
                        Columnas separadas de Débito y Crédito
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {mapping.amountMode === "single" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ColumnSelect
                        label="Columna de Importe"
                        value={mapping.amountCol || ""}
                        columns={columns}
                        onChange={(v) => updateMapping({ amountCol: v })}
                      />
                      <div>
                        <Label className="mb-2 block">
                          Interpretación del signo
                        </Label>
                        <Select
                          value={mapping.singleSignMode || "inverted"}
                          onValueChange={(v) =>
                            updateMapping({
                              singleSignMode: v as MappingConfig["singleSignMode"],
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inverted">
                              Positivo = Egreso · Negativo = Ingreso
                            </SelectItem>
                            <SelectItem value="standard">
                              Positivo = Ingreso · Negativo = Egreso
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ColumnSelect
                        label="Columna de Débito (egreso)"
                        value={mapping.debitCol || ""}
                        columns={columns}
                        onChange={(v) => updateMapping({ debitCol: v })}
                        allowEmpty
                      />
                      <ColumnSelect
                        label="Columna de Crédito (ingreso)"
                        value={mapping.creditCol || ""}
                        columns={columns}
                        onChange={(v) => updateMapping({ creditCol: v })}
                        allowEmpty
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Cuenta</Label>
                  <Select
                    value={mapping.accountMode}
                    onValueChange={(v) =>
                      updateMapping({
                        accountMode: v as MappingConfig["accountMode"],
                      })
                    }
                  >
                    <SelectTrigger className="w-full md:w-80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">
                        Todo el archivo es de una sola cuenta
                      </SelectItem>
                      <SelectItem value="column">
                        Cada fila trae el N° de cuenta en una columna
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {mapping.accountMode === "single" ? (
                    <div className="w-full md:w-96">
                      <AccountSelect
                        value={mapping.singleAccountId || ""}
                        onChange={(v) => updateMapping({ singleAccountId: v })}
                      />
                    </div>
                  ) : (
                    <ColumnSelect
                      label="Columna con N° de cuenta"
                      value={mapping.accountRefCol || ""}
                      columns={columns}
                      onChange={(v) => updateMapping({ accountRefCol: v })}
                    />
                  )}

                  {/* Tabla de mapeo: cada N° distinto del Excel → cuenta del sistema */}
                  {mapping.accountMode === "column" && refList.length > 0 && (
                    <div className="mt-2 border rounded-lg overflow-x-auto">
                      <div className="px-4 py-2 text-sm text-slate-600 bg-slate-50 border-b">
                        Se encontraron <strong>{refList.length}</strong> números de
                        cuenta distintos. Confirmá a qué cuenta del sistema
                        corresponde cada uno ({mappedCount} asignados).
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>N° en el Excel</TableHead>
                            <TableHead className="text-right">Filas</TableHead>
                            <TableHead className="min-w-[260px]">
                              Cuenta del sistema
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {refList.map((r) => (
                            <TableRow key={r.normalized}>
                              <TableCell className="font-medium">{r.ref}</TableCell>
                              <TableCell className="text-right text-slate-500">
                                {r.count}
                              </TableCell>
                              <TableCell>
                                <AccountSelect
                                  value={refMap[r.normalized] || ""}
                                  onChange={(v) =>
                                    setRefMap((m) => ({ ...m, [r.normalized]: v }))
                                  }
                                  placeholder="Sin asignar…"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Preview de filas crudas */}
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.map((c) => (
                          <TableHead key={c} className="whitespace-nowrap">
                            {c}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sheet.rows.slice(0, 5).map((r, i) => (
                        <TableRow key={i}>
                          {columns.map((c) => (
                            <TableCell key={c} className="whitespace-nowrap text-xs">
                              {String(r[c] ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-end">
                  <Button onClick={goToAnalysis} disabled={!mappingValid}>
                    Analizar <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* PASO 2 */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              title="Ingresos"
              value={formatearPrecio(stats.ingresos)}
              icon={TrendingUp}
              variant="green"
            />
            <SummaryCard
              title="Egresos"
              value={formatearPrecio(stats.egresos)}
              icon={TrendingDown}
              variant="red"
            />
            <SummaryCard
              title="Neto"
              value={formatearPrecio(stats.neto)}
              icon={Scale}
              variant={stats.neto >= 0 ? "green" : "red"}
            />
            <SummaryCard
              title="A importar"
              value={`${stats.importables} / ${stats.total}`}
              subtitle={`${stats.cuentas} cuenta(s)`}
              icon={CheckCircle2}
              variant="blue"
            />
          </div>

          {(stats.sinCuenta > 0 || stats.dupes > 0) && (
            <div className="flex flex-wrap gap-3 text-sm">
              {stats.sinCuenta > 0 && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800">
                  <AlertTriangle className="h-4 w-4" /> {stats.sinCuenta} sin cuenta
                  (asigná o se descartan)
                </span>
              )}
              {stats.dupes > 0 && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-100 text-orange-800">
                  <AlertTriangle className="h-4 w-4" /> {stats.dupes} posibles
                  duplicados (pre-deseleccionados)
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BarDistribution
              title="Neto por cuenta"
              items={byAccountItems}
              color="blue"
            />
            <BarDistribution
              title="Neto por mes"
              items={byMonthItems}
              color="slate"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
                  <span className="text-sm text-slate-600">
                    {tableRows.length} movimientos
                    {accountFilter !== "all" && " (filtrado)"}
                  </span>
                  <div className="w-full sm:w-72">
                    <Select value={accountFilter} onValueChange={setAccountFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las cuentas</SelectItem>
                        {filterOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                        {stats.sinCuenta > 0 && (
                          <SelectItem value={NO_ACCOUNT}>Sin cuenta</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="px-4 pb-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Incl.</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="min-w-[220px]">Cuenta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((m) => {
                      const isDupe = duplicates.has(m.index);
                      const isIncluded = !excluded.has(m.index);
                      return (
                        <TableRow
                          key={m.index}
                          className={isDupe ? "bg-orange-50" : undefined}
                        >
                          <TableCell>
                            <Checkbox
                              checked={isIncluded}
                              onCheckedChange={() => toggleExcluded(m.index)}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {m.date ? formatDate(m.date) : (
                              <span className="text-red-600">sin fecha</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[280px] truncate">
                            {m.description || "—"}
                            {isDupe && (
                              <span className="text-xs text-orange-700 ml-2">
                                (posible duplicado)
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium ${
                              m.type === EMovementType.INCOME
                                ? "text-green-700"
                                : "text-red-700"
                            }`}
                          >
                            {formatearPrecio(m.amount)}
                          </TableCell>
                          <TableCell>
                            {m.type === EMovementType.INCOME ? "Ingreso" : "Egreso"}
                          </TableCell>
                          <TableCell>
                            {m.accountId ? (
                              (() => {
                                const acc = accounts.find(
                                  (a) => a.id === m.accountId,
                                );
                                const ref =
                                  acc?.referenceNumber || m.accountRefRaw;
                                return (
                                  <span className="whitespace-nowrap">
                                    {acc?.name || "Cuenta"}
                                    {ref && (
                                      <span className="text-xs text-slate-400 ml-1">
                                        N° {ref}
                                      </span>
                                    )}
                                  </span>
                                );
                              })()
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-amber-700 whitespace-nowrap">
                                  sin cuenta
                                  {m.accountRefRaw && ` (N° ${m.accountRefRaw})`}
                                </span>
                                <div className="w-48">
                                  <AccountSelect
                                    value={overrides[m.index] || ""}
                                    onChange={(v) =>
                                      setOverrides((o) => ({ ...o, [m.index]: v }))
                                    }
                                    placeholder="Asignar…"
                                  />
                                </div>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <TablePagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={tableRows.length}
                  itemsPerPage={perPage}
                  onPageChange={setPage}
                  onItemsPerPageChange={setPerPage}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Volver
            </Button>
            <Button
              onClick={doImport}
              disabled={importing || stats.importables === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              {importing
                ? `Importando… ${progress}%`
                : `Confirmar e importar ${stats.importables} movimientos`}
            </Button>
          </div>
        </div>
      )}

      {/* PASO 3 */}
      {step === 3 && result && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle2 className="h-6 w-6" />
              <span className="text-lg font-semibold">
                {undone
                  ? "Importación deshecha"
                  : `Se importaron ${result.created} movimientos`}
              </span>
            </div>
            <p className="text-sm text-slate-600">
              Lote de importación: <code>{result.batchId}</code>
            </p>
            <div className="flex gap-3">
              {!undone && (
                <Button
                  variant="outline"
                  onClick={doUndo}
                  disabled={undoing}
                  className="text-red-700 border-red-300 hover:bg-red-50"
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  {undoing ? "Deshaciendo…" : "Deshacer esta importación"}
                </Button>
              )}
              <Button onClick={reset}>Importar otro archivo</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ColumnSelect({
  label,
  value,
  columns,
  onChange,
  allowEmpty,
}: {
  label: string;
  value: string;
  columns: string[];
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  const EMPTY = "__empty__";
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      <Select
        value={value || (allowEmpty ? EMPTY : "")}
        onValueChange={(v) => onChange(v === EMPTY ? "" : v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Elegir columna…" />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && <SelectItem value={EMPTY}>(ninguna)</SelectItem>}
          {columns.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
