"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { startOfMonth, endOfMonth } from "date-fns";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import { collection, query } from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { useRentabilidad } from "@/hooks/useRentabilidad";
import { formatearPrecio } from "@/lib/utils";
import {
  productMarginVP,
  productRevenueRanking,
  toDate,
  inRange,
} from "@/lib/rentabilidad";
import { EQuoteStatus, TQuote } from "@/types/quote";
import { EClientSection } from "@/types/client";
import collections from "@/lib/collections";
import { ArrowLeft, Package, TrendingUp } from "lucide-react";

export default function RentabilidadProductosPage() {
  const firestore = useFirestore();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return { from: startOfMonth(now), to: endOfMonth(now) };
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const { from, to } = useMemo(() => {
    const from = dateRange?.from ?? startOfMonth(new Date());
    const to = dateRange?.to ?? dateRange?.from ?? endOfMonth(new Date());
    return { from, to };
  }, [dateRange]);

  const { sales, loading } = useRentabilidad({ from, to });

  // Quotes confirmados para el margen real de Vía Pública.
  const quotesQuery = useMemo(
    () => query(collection(firestore, collections.QUOTES)),
    [firestore],
  );
  const { data: quotesData } = useFirestoreCollectionData(quotesQuery, {
    idField: "id",
  });

  const banderas = useMemo(() => productRevenueRanking(sales), [sales]);

  const totalBanderas = useMemo(
    () => banderas.reduce((s, p) => s + p.ingreso, 0),
    [banderas],
  );

  const vp = useMemo(() => {
    const confirmed = ((quotesData as TQuote[]) || []).filter((q) => {
      if ((q as any).deleted || q.status !== EQuoteStatus.CONFIRMED) return false;
      // Solo presupuestos de Vía Pública (la colección quotes es compartida con Banderas).
      if (q.client?.section !== EClientSection.VIA_PUBLICA) return false;
      const d = toDate(q.confirmedAt) || toDate(q.fecha) || toDate(q.createdAt);
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      return inRange(d, from, toEnd);
    });
    return productMarginVP(confirmed);
  }, [quotesData, from, to]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, perPage]);

  const totalPages = Math.max(1, Math.ceil(banderas.length / perPage));
  const pageItems = banderas.slice((page - 1) * perPage, page * perPage);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Rentabilidad de productos</h1>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion/analiticas">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Link>
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div>
            <Label className="mb-2 block">Rango de fechas</Label>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center my-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <>
          {/* Banderas: ranking por facturación */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <SummaryCard
              title="Facturación Banderas (filtrado)"
              value={formatearPrecio(totalBanderas)}
              icon={TrendingUp}
              variant="green"
            />
            <SummaryCard
              title="Productos vendidos"
              value={String(banderas.length)}
              icon={Package}
              variant="blue"
            />
          </div>

          <p className="text-xs text-slate-500 mb-3">
            Banderas: ranking por facturación y volumen de venta. El margen por
            producto requiere cargar el costo en cada producto (campo preparado,
            aún sin datos).
          </p>

          <Card className="mb-8">
            <CardContent className="p-0">
              <div className="p-4 overflow-x-auto">
                <h3 className="text-sm font-semibold mb-3 text-slate-700">
                  Banderas — por facturación
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Facturación</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {banderas.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center py-6 text-slate-500"
                        >
                          Sin ventas de Banderas en el período.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pageItems.map((p) => (
                        <TableRow key={p.productId}>
                          <TableCell className="font-medium">
                            {p.productName}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.unidades}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-700">
                            {formatearPrecio(p.ingreso)}
                          </TableCell>
                          <TableCell className="text-right text-slate-400">
                            {p.margen !== null
                              ? formatearPrecio(p.margen)
                              : "s/d"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <TablePagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={banderas.length}
                  itemsPerPage={perPage}
                  onPageChange={setPage}
                  onItemsPerPageChange={setPerPage}
                />
              </div>
            </CardContent>
          </Card>

          {/* Vía Pública: margen real */}
          <Card>
            <CardContent className="p-0">
              <div className="p-4 overflow-x-auto">
                <h3 className="text-sm font-semibold mb-1 text-slate-700">
                  Vía Pública — margen real
                </h3>
                <p className="text-xs text-slate-500 mb-3">
                  De presupuestos confirmados en el período, usando costo y precio
                  de venta de cada dispositivo.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto / dispositivo</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Venta</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                      <TableHead className="text-right">Margen %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vp.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-6 text-slate-500"
                        >
                          Sin presupuestos confirmados con costos en el período.
                        </TableCell>
                      </TableRow>
                    ) : (
                      vp.map((p) => (
                        <TableRow key={p.productName}>
                          <TableCell className="font-medium">
                            {p.productName}
                          </TableCell>
                          <TableCell className="text-right text-red-700">
                            {formatearPrecio(p.costo)}
                          </TableCell>
                          <TableCell className="text-right text-green-700">
                            {formatearPrecio(p.venta)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${
                              p.margen >= 0 ? "text-green-800" : "text-red-800"
                            }`}
                          >
                            {formatearPrecio(p.margen)}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.margenPct !== null
                              ? `${p.margenPct.toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
