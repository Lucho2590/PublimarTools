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
import collections from "@/lib/collections";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertTriangle,
  CheckCircle2,
  Link2Off,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  Wrench,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/useAuditLog";
import {
  applyStockFixes,
  backfillSaleCreateEvent,
  PendingStockFix,
} from "@/lib/stockReconciliation";
import { formatearPrecio, formatDate } from "@/lib/utils";
import { isDeleted } from "@/lib/softDelete";
import { variantDiscountsStock } from "@/lib/stock";
import { EAuditAction, EAuditEntityType } from "@/types/auditLog";

// Máximo de eventos de auditoría a traer por ventana (misma cota que el resto de /sudo).
const FETCH_LIMIT = 5000;

type Estado = "sin_descontar" | "orden_sin_auditar" | "delta_distinto" | "no_verificable";

const ESTADO_META: Record<Estado, { label: string; className: string }> = {
  sin_descontar: { label: "Sin descontar", className: "bg-red-100 text-red-800" },
  orden_sin_auditar: {
    label: "Orden sin auditar",
    className: "bg-amber-100 text-amber-800",
  },
  delta_distinto: {
    label: "Delta distinto",
    className: "bg-orange-100 text-orange-800",
  },
  no_verificable: {
    label: "No verificable",
    className: "bg-slate-200 text-slate-700",
  },
};

interface ItemDescuadrado {
  key: string;
  estado: Estado;
  saleId: string;
  saleNumber: string;
  fecha: Date | null;
  clientName: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  cantidad: number;
  delta: number | null;
  stockActual: number | string;
}

interface VentaRota {
  id: string;
  number: string;
  fecha: Date | null;
  clientName: string;
  total: number;
  itemsSinDescontar: number;
  /** Renglones que hay que descontar si se aprieta "Corregir". */
  fixes: PendingStockFix[];
}

interface CadenaRota {
  key: string;
  productName: string;
  variantName: string;
  detalle: string;
  stockAuditado: number;
  stockActual: number;
  diferencia: number;
}

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  return null;
};

/** Un renglón manual no toca inventario: se identifica por el prefijo del id. */
const esManual = (item: any): boolean =>
  !!item?.isManual ||
  !item?.productId ||
  String(item.productId).includes("manual");

export function StockReconciliationTab() {
  const firestore = useFirestore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncado, setTruncado] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 15);
    return { from, to };
  });

  const [resumen, setResumen] = useState({
    ventas: 0,
    movimientos: 0,
    itemsOk: 0,
    itemsOmitidos: 0,
  });
  const [porMotivo, setPorMotivo] = useState<Array<[string, number]>>([]);
  const [descuadrados, setDescuadrados] = useState<ItemDescuadrado[]>([]);
  const [ventasRotas, setVentasRotas] = useState<VentaRota[]>([]);
  const [cadenasRotas, setCadenasRotas] = useState<CadenaRota[]>([]);

  const { logEvent } = useAuditLog();
  /** Ventas elegidas para corregir; el diálogo confirma antes de escribir. */
  const [aCorregir, setACorregir] = useState<VentaRota[] | null>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const desde = dateRange?.from ?? new Date(Date.now() - 15 * 86400000);
      const hasta = new Date(dateRange?.to ?? new Date());
      hasta.setHours(23, 59, 59, 999);

      const [salesSnap, auditSnap, productsSnap] = await Promise.all([
        getDocs(
          query(
            collection(firestore, collections.SALES),
            where("createdAt", ">=", Timestamp.fromDate(desde)),
            where("createdAt", "<=", Timestamp.fromDate(hasta)),
            orderBy("createdAt", "desc"),
            limit(FETCH_LIMIT),
          ),
        ),
        getDocs(
          query(
            collection(firestore, collections.AUDIT_LOG),
            where("timestamp", ">=", Timestamp.fromDate(desde)),
            where("timestamp", "<=", Timestamp.fromDate(hasta)),
            orderBy("timestamp", "desc"),
            limit(FETCH_LIMIT),
          ),
        ),
        getDocs(collection(firestore, collections.PRODUCTS)),
      ]);

      // --- Índices de auditoría ------------------------------------------
      /** stock_change agrupados por venta, para cruzar contra los items. */
      const movsPorVenta = new Map<string, any[]>();
      /** stock_change ordenados por variante, para reconstruir la cadena. */
      const movsPorVariante = new Map<string, any[]>();
      /** Ventas que sí llegaron a escribir su evento `create`. */
      const ventasAuditadas = new Set<string>();
      const motivos = new Map<string, number>();
      let movimientos = 0;

      auditSnap.docs.forEach((d) => {
        const v = d.data() as any;
        const m = v.metadata || {};
        if (v.action === EAuditAction.STOCK_CHANGE) {
          movimientos++;
          const motivo = m.reason || "sin motivo";
          motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
          if (m.saleId) {
            if (!movsPorVenta.has(m.saleId)) movsPorVenta.set(m.saleId, []);
            movsPorVenta.get(m.saleId)!.push(m);
          }
          if (m.productId && m.variantId) {
            const k = `${m.productId}:${m.variantId}`;
            if (!movsPorVariante.has(k)) movsPorVariante.set(k, []);
            movsPorVariante.get(k)!.push({ ...m, at: toDate(v.timestamp) });
          }
        }
        if (
          v.action === EAuditAction.CREATE &&
          v.entityType === EAuditEntityType.SALE
        ) {
          ventasAuditadas.add(v.entityId);
        }
      });

      // Si la consulta llega al tope, el reporte está incompleto y hay que
      // decirlo: callarlo haría leer "todo cuadra" sobre datos recortados.
      setTruncado(
        auditSnap.size >= FETCH_LIMIT || salesSnap.size >= FETCH_LIMIT
          ? "El rango supera el máximo de registros que se traen de una vez. Achicá el rango de fechas para que el reporte sea completo."
          : null,
      );

      const productos = new Map<string, any>();
      productsSnap.docs.forEach((d) => productos.set(d.id, d.data()));

      // --- Cruce venta por venta -----------------------------------------
      const filas: ItemDescuadrado[] = [];
      const rotas: VentaRota[] = [];
      let itemsOk = 0;
      let itemsOmitidos = 0;
      let ventas = 0;

      salesSnap.docs.forEach((d) => {
        const venta = d.data() as any;
        if (isDeleted(venta)) return;
        ventas++;

        const movs = movsPorVenta.get(d.id) ?? [];
        const fecha = toDate(venta.createdAt);
        let sinDescontar = 0;
        const fixesVenta: PendingStockFix[] = [];

        (venta.items ?? []).forEach((item: any, idx: number) => {
          if (esManual(item)) {
            itemsOmitidos++;
            return;
          }
          const producto = productos.get(item.productId);
          const variante = (producto?.variants ?? []).find(
            (v: any) => v.id === item.variantId,
          );
          // La variante declara explícitamente que no descuenta: no es un descuadre.
          if (variante && !variantDiscountsStock(variante)) {
            itemsOmitidos++;
            return;
          }

          const mov = movs.find(
            (m) =>
              m.productId === item.productId &&
              (!item.variantId || m.variantId === item.variantId),
          );

          const base = {
            key: `${d.id}-${idx}`,
            saleId: d.id,
            saleNumber: venta.number ?? d.id,
            fecha,
            clientName: venta.clientName ?? "—",
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName ?? "—",
            variantName: item.variantName ?? "",
            cantidad: Number(item.quantity) || 0,
            stockActual: variante ? variante.stock : "—",
          };

          if (mov) {
            if (Math.abs(Number(mov.delta)) !== Number(item.quantity)) {
              filas.push({ ...base, estado: "delta_distinto", delta: Number(mov.delta) });
            } else {
              itemsOk++;
            }
            return;
          }

          // Sin movimiento: puede ser una conversión de orden vieja (descontaba
          // sin auditar) o un descuadre real.
          if (!variante) {
            filas.push({ ...base, estado: "no_verificable", delta: null });
          } else if (venta.orderId) {
            filas.push({ ...base, estado: "orden_sin_auditar", delta: null });
          } else {
            filas.push({ ...base, estado: "sin_descontar", delta: null });
            sinDescontar++;
            fixesVenta.push({
              saleId: d.id,
              saleNumber: base.saleNumber,
              productId: item.productId,
              productName: base.productName,
              variantId: item.variantId,
              variantName: base.variantName,
              quantity: base.cantidad,
            });
          }
        });

        // Sin evento `create` la venta abortó a mitad: quedó el documento pero
        // no la auditoría ni el descuento.
        if (!ventasAuditadas.has(d.id)) {
          rotas.push({
            id: d.id,
            number: venta.number ?? d.id,
            fecha,
            clientName: venta.clientName ?? "—",
            total: Number(venta.total) || 0,
            itemsSinDescontar: sinDescontar,
            fixes: fixesVenta,
          });
        }
      });

      // --- Cadena de stock por variante ----------------------------------
      // Cada movimiento guarda stockBefore/stockAfter. Si la cadena es continua
      // y cierra contra el stock de hoy, todo cambio pasó por la auditoría.
      // Cualquier salto es un write que no dejó rastro.
      const cadenas: CadenaRota[] = [];
      movsPorVariante.forEach((movs, key) => {
        const [productId, variantId] = key.split(":");
        const producto = productos.get(productId);
        const variante = (producto?.variants ?? []).find(
          (v: any) => v.id === variantId,
        );
        if (!variante || !variantDiscountsStock(variante)) return;

        const orden = [...movs].sort(
          (a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0),
        );
        const saltos: string[] = [];
        for (let i = 1; i < orden.length; i++) {
          const prev = Number(orden[i - 1].stockAfter);
          const curr = Number(orden[i].stockBefore);
          if (Number.isFinite(prev) && Number.isFinite(curr) && prev !== curr) {
            saltos.push(
              `${orden[i].at ? formatDate(orden[i].at) : "?"}: quedaba ${prev} y el siguiente movimiento partió de ${curr}`,
            );
          }
        }

        const ultimo = Number(orden[orden.length - 1]?.stockAfter);
        const actual = Number(variante.stock);
        if (Number.isFinite(ultimo) && Number.isFinite(actual) && ultimo !== actual) {
          saltos.push(
            `el último movimiento dejó ${ultimo} y hoy el producto tiene ${actual}`,
          );
        }

        if (saltos.length > 0) {
          cadenas.push({
            key,
            productName: orden[0]?.productName ?? producto?.name ?? "—",
            variantName: orden[0]?.variantName ?? variante.size ?? "",
            detalle: saltos.join(" · "),
            stockAuditado: ultimo,
            stockActual: actual,
            diferencia: actual - ultimo,
          });
        }
      });
      cadenas.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));

      const pesoEstado: Record<Estado, number> = {
        sin_descontar: 0,
        delta_distinto: 1,
        orden_sin_auditar: 2,
        no_verificable: 3,
      };
      filas.sort(
        (a, b) =>
          pesoEstado[a.estado] - pesoEstado[b.estado] ||
          (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0),
      );
      rotas.sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0));

      setResumen({ ventas, movimientos, itemsOk, itemsOmitidos });
      setPorMotivo(Array.from(motivos.entries()).sort((a, b) => b[1] - a[1]));
      setDescuadrados(filas);
      setVentasRotas(rotas);
      setCadenasRotas(cadenas);
      setCurrentPage(1);
    } catch (err: any) {
      console.error("[StockReconciliationTab] query failed", err);
      setError(
        err?.message?.includes("index")
          ? "Falta un índice en Firestore para esta consulta. Revisá la consola para el link."
          : "Error corriendo la conciliación de stock.",
      );
    } finally {
      setLoading(false);
    }
  }, [firestore, dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Descuenta el stock pendiente y reconstruye la auditoría de las ventas
   * elegidas. La revalidación anti doble-descuento vive en applyStockFixes.
   */
  const corregir = async () => {
    if (!aCorregir) return;
    setCorrigiendo(true);
    try {
      const fixes = aCorregir.flatMap((v) => v.fixes);
      const { applied, skipped } = await applyStockFixes(firestore, logEvent, fixes);

      // El evento `create` que el alta fallida nunca escribió: sin esto la
      // venta seguiría figurando como "a medias" aunque ya esté corregida.
      await Promise.all(
        aCorregir.map((v) =>
          backfillSaleCreateEvent(logEvent, {
            id: v.id,
            number: v.number,
            total: v.total,
            clientName: v.clientName,
          }),
        ),
      );

      if (applied > 0) {
        toast.success(
          `${applied} ${applied === 1 ? "renglón descontado" : "renglones descontados"} y auditoría reconstruida`,
        );
      }
      if (skipped.length > 0) {
        toast.warning(`Sin tocar: ${skipped.join(" · ")}`);
      }
      if (applied === 0 && skipped.length === 0) {
        toast.info("No había nada pendiente de descontar.");
      }

      setACorregir(null);
      await load();
    } catch (err) {
      console.error("[StockReconciliationTab] fix failed", err);
      toast.error("No se pudo aplicar la corrección. Revisá la consola.");
    } finally {
      setCorrigiendo(false);
    }
  };

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return descuadrados;
    return descuadrados.filter((it) =>
      `${it.productName} ${it.variantName} ${it.saleNumber} ${it.clientName}`
        .toLowerCase()
        .includes(q),
    );
  }, [descuadrados, search]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / itemsPerPage));
  const pagina = filtrados.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const criticos = descuadrados.filter((d) => d.estado === "sin_descontar").length;
  const corregibles = ventasRotas.filter((v) => v.fixes.length > 0);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label>Rango de fechas</Label>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
          <div className="space-y-1 flex-1 min-w-[220px]">
            <Label>Buscar</Label>
            <Input
              placeholder="Producto, venta o cliente…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <Button onClick={load} disabled={loading} variant="outline">
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Actualizar
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {truncado && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {truncado}
        </div>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Ventas en el rango"
          value={resumen.ventas}
          icon={ShoppingCart}
          variant="blue"
        />
        <SummaryCard
          title="Movimientos de stock"
          value={resumen.movimientos}
          subtitle={porMotivo.map(([m, n]) => `${m}: ${n}`).join(" · ")}
          icon={PackageSearch}
          variant="slate"
        />
        <SummaryCard
          title="Items conciliados"
          value={resumen.itemsOk}
          subtitle={`${resumen.itemsOmitidos} omitidos (manuales o que no descuentan)`}
          icon={CheckCircle2}
          variant="green"
        />
        <SummaryCard
          title="Items sin descontar"
          value={criticos}
          subtitle={`${descuadrados.length} descuadres en total`}
          icon={AlertTriangle}
          variant={criticos > 0 ? "red" : "green"}
        />
      </div>

      {/* Ventas rotas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2Off className="h-4 w-4" />
            Ventas que quedaron a medias ({ventasRotas.length})
          </CardTitle>
          <p className="text-sm text-slate-600">
            El documento de la venta existe pero nunca se escribió su evento de
            auditoría: el alta abortó después de crear la venta, así que
            probablemente tampoco descontó stock. Corregir descuenta el stock
            pendiente y reconstruye la auditoría.
          </p>
          {corregibles.length > 0 && (
            <div className="pt-2">
              <Button size="sm" onClick={() => setACorregir(corregibles)}>
                <Wrench className="h-4 w-4 mr-2" />
                Corregir las {corregibles.length} ventas (
                {corregibles.reduce((n, v) => n + v.itemsSinDescontar, 0)} renglones)
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {ventasRotas.length === 0 ? (
            <p className="text-sm text-slate-500">
              Ninguna. Todas las ventas del rango tienen su auditoría completa.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venta</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Items sin descontar</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventasRotas.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.number}</TableCell>
                    <TableCell>{v.fecha ? formatDate(v.fecha) : "—"}</TableCell>
                    <TableCell>{v.clientName}</TableCell>
                    <TableCell className="text-right">
                      {formatearPrecio(v.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      {v.itemsSinDescontar}
                    </TableCell>
                    <TableCell className="text-right">
                      {v.fixes.length > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setACorregir([v])}
                        >
                          <Wrench className="h-4 w-4 mr-2" />
                          Corregir
                        </Button>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-green-100 text-green-800"
                        >
                          Nada pendiente
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Items descuadrados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Items sin movimiento de stock ({filtrados.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {filtrados.length === 0 ? (
            <p className="text-sm text-slate-500">
              Todo cuadra: cada item vendido tiene su movimiento de stock.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead>Venta</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Delta auditado</TableHead>
                    <TableHead className="text-right">Stock hoy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagina.map((it) => (
                    <TableRow key={it.key}>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={ESTADO_META[it.estado].className}
                        >
                          {ESTADO_META[it.estado].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{it.saleNumber}</TableCell>
                      <TableCell>{it.fecha ? formatDate(it.fecha) : "—"}</TableCell>
                      <TableCell>
                        {it.productName}
                        {it.variantName && (
                          <span className="text-slate-500"> · {it.variantName}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{it.cantidad}</TableCell>
                      <TableCell className="text-right">
                        {it.delta ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">{it.stockActual}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filtrados.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(n) => {
                  setItemsPerPage(n);
                  setCurrentPage(1);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Cadena de stock */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Cadena de stock rota ({cadenasRotas.length})
          </CardTitle>
          <p className="text-sm text-slate-600">
            Cada movimiento auditado guarda el stock antes y después. Si la
            cadena de una variante no encaja o no cierra contra el stock de hoy,
            hubo un cambio que no pasó por la auditoría.
          </p>
        </CardHeader>
        <CardContent>
          {cadenasRotas.length === 0 ? (
            <p className="text-sm text-slate-500">
              Ninguna. Todo cambio de stock del rango quedó auditado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Según auditoría</TableHead>
                  <TableHead className="text-right">Stock hoy</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cadenasRotas.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell>
                      {c.productName}
                      {c.variantName && (
                        <span className="text-slate-500"> · {c.variantName}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{c.stockAuditado}</TableCell>
                    <TableCell className="text-right">{c.stockActual}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        c.diferencia === 0 ? "" : "text-red-700"
                      }`}
                    >
                      {c.diferencia > 0 ? `+${c.diferencia}` : c.diferencia}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {c.detalle}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Confirmación: se listan los descuentos uno por uno antes de escribir. */}
      <Dialog open={!!aCorregir} onOpenChange={(o) => !o && setACorregir(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Corregir el stock pendiente</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p className="text-slate-600">
              Se va a descontar el stock que estas ventas nunca descontaron y se
              va a reconstruir su auditoría. Los renglones que ya tengan
              movimiento se saltean.
            </p>

            <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
              {(aCorregir ?? []).map((v) => (
                <div key={v.id} className="p-3">
                  <div className="font-medium">
                    Venta {v.number}
                    <span className="text-slate-500 font-normal">
                      {" "}
                      · {v.clientName} · {formatearPrecio(v.total)}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-slate-700">
                    {v.fixes.map((f) => (
                      <li key={`${f.productId}-${f.variantId}`}>
                        {f.productName}
                        {f.variantName && ` · ${f.variantName}`} —{" "}
                        <span className="font-medium">
                          descontar {f.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <p className="text-slate-500">
              El stock se relee en el momento de aplicar, así que el valor final
              sale del stock actual, no del que muestra este reporte.
            </p>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
              Ojo: si en algún caso lo que falló fue sólo la escritura de la
              auditoría y la venta sí descontó, corregir descontaría de nuevo.
              Ante la duda, chequeá el stock físico de esos productos primero.
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setACorregir(null)}
              disabled={corrigiendo}
            >
              Cancelar
            </Button>
            <Button onClick={corregir} disabled={corrigiendo}>
              {corrigiendo ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Aplicando…
                </>
              ) : (
                <>
                  <Wrench className="h-4 w-4 mr-2" />
                  Aplicar corrección
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
