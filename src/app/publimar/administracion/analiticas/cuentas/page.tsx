"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { startOfMonth, endOfMonth } from "date-fns";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
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
import { BarDistribution } from "@/components/admin/BarDistribution";
import { useAccounts } from "@/hooks/useAccounts";
import { formatearPrecio } from "@/lib/utils";
import {
  accountFlow,
  moneyByAccount,
  totalLiquidity,
  usdAccounts,
} from "@/lib/rentabilidad";
import { ACCOUNT_TYPE_LABELS } from "@/types/account";
import { TAccountMovement } from "@/types/accountMovement";
import collections from "@/lib/collections";
import { ArrowLeft, Wallet, Banknote, ArrowDownUp } from "lucide-react";

export default function RentabilidadCuentasPage() {
  const firestore = useFirestore();
  const { accounts, loading: accountsLoading } = useAccounts({
    includeArchived: true,
  });

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const now = new Date();
    return { from: startOfMonth(now), to: endOfMonth(now) };
  });

  const { from, to } = useMemo(() => {
    const from = dateRange?.from ?? startOfMonth(new Date());
    const to = dateRange?.to ?? dateRange?.from ?? endOfMonth(new Date());
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    return { from, to: toEnd };
  }, [dateRange]);

  // Movimientos del período (la colección más voluminosa → filtro por fecha + límite).
  const movementsQuery = useMemo(
    () =>
      query(
        collection(firestore, collections.ACCOUNT_MOVEMENTS),
        where("date", ">=", Timestamp.fromDate(from)),
        where("date", "<=", Timestamp.fromDate(to)),
        orderBy("date", "desc"),
        limit(3000),
      ),
    [firestore, from, to],
  );
  const { status: movStatus, data: movData } = useFirestoreCollectionData(
    movementsQuery,
    { idField: "id" },
  );

  const liquidez = useMemo(() => totalLiquidity(accounts), [accounts]);
  const distribution = useMemo(() => moneyByAccount(accounts), [accounts]);
  const usd = useMemo(() => usdAccounts(accounts), [accounts]);

  const flow = useMemo(
    () =>
      accountFlow(
        (movData as TAccountMovement[]) || [],
        accounts,
        from,
        to,
      ),
    [movData, accounts, from, to],
  );

  const distItems = useMemo(
    () =>
      distribution.map((a) => ({
        key: a.id,
        label: a.name,
        value: a.balance,
        hint: `${a.pct.toFixed(0)}% · ${ACCOUNT_TYPE_LABELS[a.type]}`,
      })),
    [distribution],
  );

  const loading = accountsLoading || movStatus === "loading";

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Cuentas y liquidez</h1>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion/analiticas">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
        <SummaryCard
          title="Liquidez total (ARS)"
          value={formatearPrecio(liquidez)}
          icon={Wallet}
          variant="blue"
        />
        <SummaryCard
          title="Cuentas ARS activas"
          value={String(distribution.length)}
          icon={Banknote}
          variant="slate"
        />
        <SummaryCard
          title="Cuentas USD"
          value={String(usd.length)}
          icon={Banknote}
          variant="amber"
        />
      </div>
      <p className="text-xs text-slate-500 mb-6">
        Liquidez = saldo de las cuentas ARS activas, excluyendo tarjetas de
        crédito (son deuda, no plata disponible).
      </p>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div>
            <Label className="mb-2 block">Rango de fechas (flujo)</Label>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <BarDistribution
              title="Liquidez por cuenta"
              items={distItems}
              color="blue"
              emptyLabel="Sin cuentas ARS activas."
            />

            <Card>
              <CardContent className="p-0">
                <div className="p-4 overflow-x-auto">
                  <h3 className="text-sm font-semibold mb-3 text-slate-700 flex items-center gap-2">
                    <ArrowDownUp className="h-4 w-4" /> Flujo del período por cuenta
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cuenta</TableHead>
                        <TableHead className="text-right">Entradas</TableHead>
                        <TableHead className="text-right">Salidas</TableHead>
                        <TableHead className="text-right">Neto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {flow.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="text-center py-6 text-slate-500"
                          >
                            Sin movimientos en el período.
                          </TableCell>
                        </TableRow>
                      ) : (
                        flow.map((f) => (
                          <TableRow key={f.accountId}>
                            <TableCell className="font-medium">
                              {f.name}
                            </TableCell>
                            <TableCell className="text-right text-green-700">
                              {formatearPrecio(f.entradas)}
                            </TableCell>
                            <TableCell className="text-right text-red-700">
                              {formatearPrecio(f.salidas)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-semibold ${
                                f.neto >= 0 ? "text-green-800" : "text-red-800"
                              }`}
                            >
                              {formatearPrecio(f.neto)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          {usd.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 overflow-x-auto">
                  <h3 className="text-sm font-semibold mb-1 text-slate-700">
                    Cuentas en USD
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    Se listan aparte y no se suman a la liquidez en pesos.
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cuenta</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Saldo (USD)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usd.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell>{ACCOUNT_TYPE_LABELS[a.type]}</TableCell>
                          <TableCell className="text-right font-semibold">
                            US$ {a.balance.toLocaleString("es-AR")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
