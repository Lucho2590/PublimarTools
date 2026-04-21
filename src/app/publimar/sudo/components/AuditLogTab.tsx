"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFirestore } from "reactfire";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  QueryConstraint,
  QueryDocumentSnapshot,
  Timestamp,
} from "firebase/firestore";
import { DateRange } from "react-day-picker";
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
import { ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  AUDIT_SECTION_LABELS,
  EAuditAction,
  EAuditEntityType,
  EAuditSection,
  TAuditLogEntry,
} from "@/types/auditLog";
import {
  formatFieldName,
  formatValue,
  sortFields,
  timestampToDate,
} from "./fieldFormat";

const PAGE_SIZE = 50;

const ACTION_BADGE: Record<EAuditAction, string> = {
  [EAuditAction.CREATE]: "bg-green-100 text-green-800",
  [EAuditAction.UPDATE]: "bg-blue-100 text-blue-800",
  [EAuditAction.DELETE]: "bg-red-100 text-red-800",
  [EAuditAction.RESTORE]: "bg-amber-100 text-amber-800",
  [EAuditAction.STOCK_CHANGE]: "bg-purple-100 text-purple-800",
};

const SECTION_OPTIONS = Object.values(EAuditSection);
const ENTITY_OPTIONS = Object.values(EAuditEntityType);
const ACTION_OPTIONS = Object.values(EAuditAction);

export function AuditLogTab() {
  const firestore = useFirestore();

  const [items, setItems] = useState<TAuditLogEntry[]>([]);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [sectionFilter, setSectionFilter] = useState<Set<EAuditSection>>(new Set());
  const [entityFilter, setEntityFilter] = useState<EAuditEntityType | "all">("all");
  const [actionFilter, setActionFilter] = useState<EAuditAction | "all">("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return { from, to };
  });

  const buildQueryConstraints = useCallback(
    (cursor: QueryDocumentSnapshot | null): QueryConstraint[] => {
      const constraints: QueryConstraint[] = [];

      const activeSections = Array.from(sectionFilter);
      if (activeSections.length === 1) {
        constraints.push(where("section", "==", activeSections[0]));
      } else if (activeSections.length > 1 && activeSections.length <= 10) {
        constraints.push(where("section", "in", activeSections));
      }

      if (entityFilter !== "all") {
        constraints.push(where("entityType", "==", entityFilter));
      }
      if (actionFilter !== "all") {
        constraints.push(where("action", "==", actionFilter));
      }

      if (dateRange?.from) {
        constraints.push(
          where("timestamp", ">=", Timestamp.fromDate(dateRange.from))
        );
      }
      if (dateRange?.to) {
        const to = new Date(dateRange.to);
        to.setHours(23, 59, 59, 999);
        constraints.push(where("timestamp", "<=", Timestamp.fromDate(to)));
      }

      constraints.push(orderBy("timestamp", "desc"));
      if (cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(PAGE_SIZE));
      return constraints;
    },
    [sectionFilter, entityFilter, actionFilter, dateRange]
  );

  const load = useCallback(
    async (mode: "reset" | "more") => {
      setLoading(true);
      setError(null);
      try {
        const cursor = mode === "more" ? lastDoc : null;
        const q = query(
          collection(firestore, collections.AUDIT_LOG),
          ...buildQueryConstraints(cursor)
        );
        const snap = await getDocs(q);
        const rows: TAuditLogEntry[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TAuditLogEntry, "id">),
        }));
        setLastDoc(snap.docs.length ? snap.docs[snap.docs.length - 1] : null);
        setHasMore(snap.docs.length === PAGE_SIZE);
        setItems((prev) => (mode === "reset" ? rows : [...prev, ...rows]));
      } catch (err: any) {
        console.error("[AuditLogTab] query failed", err);
        setError(
          err?.message?.includes("index")
            ? "Faltan índices en Firestore. Revisá la consola del navegador para el link de creación."
            : "Error cargando eventos."
        );
      } finally {
        setLoading(false);
      }
    },
    [firestore, buildQueryConstraints, lastDoc]
  );

  useEffect(() => {
    setLastDoc(null);
    setHasMore(true);
    load("reset");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionFilter, entityFilter, actionFilter, dateRange]);

  const visibleItems = useMemo(() => {
    let out = items;
    if (userFilter !== "all") {
      out = out.filter((i) => i.userId === userFilter);
    }
    const term = searchText.trim().toLowerCase();
    if (term) {
      out = out.filter((i) => {
        return (
          i.description?.toLowerCase().includes(term) ||
          i.entityLabel?.toLowerCase().includes(term) ||
          i.userName?.toLowerCase().includes(term) ||
          i.metadata?.saleNumber?.toString().toLowerCase().includes(term) ||
          i.entityId?.toLowerCase().includes(term)
        );
      });
    }
    return out;
  }, [items, userFilter, searchText]);

  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) {
      if (i.userId && !map.has(i.userId)) {
        map.set(i.userId, i.userName || i.userEmail || i.userId);
      }
    }
    return Array.from(map.entries());
  }, [items]);

  const toggleSection = (s: EAuditSection) => {
    setSectionFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const clearFilters = () => {
    setSectionFilter(new Set());
    setEntityFilter("all");
    setActionFilter("all");
    setUserFilter("all");
    setSearchText("");
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    setDateRange({ from, to });
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatTime = (ts: any): string => {
    const d = timestampToDate(ts);
    if (!d) return "-";
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Registro de actividad</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load("reset")}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Recargar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 mb-4">
          <div className="flex flex-wrap gap-2">
            {SECTION_OPTIONS.map((s) => {
              const active = sectionFilter.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSection(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-muted"
                  }`}
                >
                  {AUDIT_SECTION_LABELS[s]}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Entidad</Label>
              <Select value={entityFilter} onValueChange={(v) => setEntityFilter(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {ENTITY_OPTIONS.map((e) => (
                    <SelectItem key={e} value={e}>{AUDIT_ENTITY_LABELS[e]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Acción</Label>
              <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {ACTION_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>{AUDIT_ACTION_LABELS[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Usuario</Label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {userOptions.map(([uid, name]) => (
                    <SelectItem key={uid} value={uid}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-1">
              <Label className="text-xs">Rango de fechas</Label>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>
            <div>
              <Label className="text-xs">Buscar</Label>
              <Input
                placeholder="Descripción, N° venta, ID…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{visibleItems.length} eventos mostrados</span>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3 w-3 mr-1" /> Limpiar filtros
            </Button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-destructive p-3 border border-destructive/30 rounded mb-3">
            {error}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Sección</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Entidad</TableHead>
              <TableHead>Descripción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleItems.map((ev) => {
              const open = expanded.has(ev.id);
              return (
                <>
                  <TableRow
                    key={ev.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => toggleExpanded(ev.id)}
                  >
                    <TableCell>
                      {open ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatTime(ev.timestamp)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {AUDIT_SECTION_LABELS[ev.section] ?? ev.section}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${ACTION_BADGE[ev.action] ?? ""}`}>
                        {AUDIT_ACTION_LABELS[ev.action] ?? ev.action}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {ev.userName || ev.userEmail || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {AUDIT_ENTITY_LABELS[ev.entityType] ?? ev.entityType}
                      {ev.entityLabel ? ` · ${ev.entityLabel}` : ""}
                    </TableCell>
                    <TableCell className="text-sm">{ev.description}</TableCell>
                  </TableRow>
                  {open && (
                    <TableRow key={`${ev.id}-detail`}>
                      <TableCell colSpan={7} className="bg-muted/30 p-4">
                        <AuditDetail entry={ev} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
            {visibleItems.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No hay eventos
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex justify-center mt-4">
          {hasMore ? (
            <Button variant="outline" onClick={() => load("more")} disabled={loading}>
              {loading ? "Cargando…" : "Cargar más"}
            </Button>
          ) : items.length > 0 ? (
            <span className="text-xs text-muted-foreground">No hay más eventos</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function AuditDetail({ entry }: { entry: TAuditLogEntry }) {
  const beforeEntries = entry.changes?.before
    ? Object.entries(entry.changes.before)
    : [];
  const afterEntries = entry.changes?.after
    ? Object.entries(entry.changes.after)
    : [];
  const allKeys = Array.from(
    new Set([...beforeEntries.map(([k]) => k), ...afterEntries.map(([k]) => k)])
  );

  const metadataEntries = entry.metadata
    ? Object.entries(entry.metadata).filter(([, v]) => v !== null && v !== undefined)
    : [];

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div>
          <span className="text-muted-foreground">ID del evento: </span>
          <span className="font-mono">{entry.id}</span>
        </div>
        <div>
          <span className="text-muted-foreground">ID entidad: </span>
          <span className="font-mono">{entry.entityId}</span>
        </div>
        {entry.correlationId && (
          <div>
            <span className="text-muted-foreground">CorrelationId: </span>
            <span className="font-mono">{entry.correlationId}</span>
          </div>
        )}
      </div>

      {allKeys.length > 0 && (
        <div>
          <p className="font-medium text-xs text-muted-foreground mb-2">Cambios</p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left w-[160px] py-1">Campo</th>
                <th className="text-left py-1">Antes</th>
                <th className="text-left py-1">Después</th>
              </tr>
            </thead>
            <tbody>
              {sortFields(allKeys.map((k) => [k, null] as [string, any])).map(([k]) => {
                const beforeVal = entry.changes?.before?.[k];
                const afterVal = entry.changes?.after?.[k];
                return (
                  <tr key={k} className="border-t border-muted/40">
                    <td className="py-1 pr-4 font-medium text-xs">
                      {formatFieldName(k)}
                    </td>
                    <td className="py-1 pr-4 text-xs break-all">
                      {beforeVal === undefined ? (
                        <span className="text-muted-foreground/50">—</span>
                      ) : (
                        formatValue(beforeVal)
                      )}
                    </td>
                    <td className="py-1 text-xs break-all">
                      {afterVal === undefined ? (
                        <span className="text-muted-foreground/50">—</span>
                      ) : (
                        formatValue(afterVal)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {metadataEntries.length > 0 && (
        <div>
          <p className="font-medium text-xs text-muted-foreground mb-2">Metadata</p>
          <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
