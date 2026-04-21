"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useFirestore, useFirestoreCollectionData } from "reactfire";
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SummaryCard } from "@/components/admin/SummaryCard";
import { useAccounts } from "@/hooks/useAccounts";
import { useOperationalExpenses } from "@/hooks/useOperationalExpenses";
import { formatearPrecio } from "@/lib/utils";
import {
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowLeftRight,
  Receipt,
} from "lucide-react";
import collections from "@/lib/collections";
import { ESaleDepartment } from "@/types/sale";
import { startOfMonth, endOfMonth } from "date-fns";

function toDate(d: any): Date | null {
  if (!d) return null;
  if (typeof d.toDate === "function") return d.toDate();
  if (d?.seconds) return new Date(d.seconds * 1000);
  if (d instanceof Date) return d;
  if (typeof d === "string") return new Date(d);
  return null;
}

function inRange(d: Date | null, from: Date, to: Date) {
  return !!d && d >= from && d <= to;
}

function inThisMonthByDateString(s: string | undefined, from: Date, to: Date) {
  if (!s) return false;
  return inRange(new Date(`${s}T12:00:00`), from, to);
}

export default function FinanzasPage() {
  const firestore = useFirestore();
  const { accounts } = useAccounts();
  const { expenses } = useOperationalExpenses();

  // Rango del mes calculado dentro del componente para que esté fresco en cada render
  const { startMonth, endMonth } = useMemo(() => {
    const now = new Date();
    return { startMonth: startOfMonth(now), endMonth: endOfMonth(now) };
  }, []);

  // Ventas del mes — filtramos en Firestore por createdAt para no traer años de historial
  const salesQuery = useMemo(
    () =>
      query(
        collection(firestore, collections.SALES),
        where("createdAt", ">=", Timestamp.fromDate(startMonth)),
        where("createdAt", "<=", Timestamp.fromDate(endMonth)),
        orderBy("createdAt", "desc"),
      ),
    [firestore, startMonth, endMonth],
  );
  const { data: sales } = useFirestoreCollectionData(salesQuery, {
    idField: "id",
  });

  const purchasesQuery = useMemo(
    () => query(collection(firestore, collections.PURCHASES)),
    [firestore],
  );
  const { data: purchases } = useFirestoreCollectionData(purchasesQuery, {
    idField: "id",
  });

  // Facturaciones de Vía Pública — el ingreso real de VP viene de paymentHistory
  const billingsQuery = useMemo(
    () => query(collection(firestore, collections.BILLINGS)),
    [firestore],
  );
  const { data: billings } = useFirestoreCollectionData(billingsQuery, {
    idField: "id",
  });

  const totals = useMemo(() => {
    // Ingresos Banderas: ventas con department=BANDERAS (o legacy sin department),
    // usando finalTotal para descontar devoluciones y excluyendo borradas
    const ingresosBanderas = ((sales as any[]) || [])
      .filter(
        (s) =>
          !s.deleted &&
          (!s.department || s.department === ESaleDepartment.BANDERAS),
      )
      .reduce(
        (sum, s) => sum + (Number(s.finalTotal ?? s.total) || 0),
        0,
      );

    // Ingresos Vía Pública: suma de pagos en paymentHistory cuyo date caiga en el mes
    const ingresosVP = ((billings as any[]) || [])
      .filter((b) => !b.deleted)
      .reduce((sum, b) => {
        const history: any[] = b.paymentHistory || [];
        const monthPaid = history
          .filter((p) => inRange(toDate(p.date), startMonth, endMonth))
          .reduce((s, p) => s + (Number(p.amount) || 0), 0);
        return sum + monthPaid;
      }, 0);

    const ingresosMes = ingresosBanderas + ingresosVP;

    const gastosCompras = ((purchases as any[]) || [])
      .filter(
        (p) => !p.deleted && inThisMonthByDateString(p.date, startMonth, endMonth),
      )
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const gastosOperativos = expenses
      .filter((e) => inThisMonthByDateString(e.date, startMonth, endMonth))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const saldoTotal = accounts.reduce(
      (s, a) => s + (Number(a.currentBalance) || 0),
      0,
    );

    return {
      ingresosMes,
      ingresosBanderas,
      ingresosVP,
      gastosMes: gastosCompras + gastosOperativos,
      saldoTotal,
    };
  }, [sales, billings, purchases, expenses, accounts, startMonth, endMonth]);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Finanzas</h1>
        <Button asChild variant="outline">
          <Link href="/publimar/administracion">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <SummaryCard
          title="Ingresos del mes"
          value={formatearPrecio(totals.ingresosMes)}
          icon={TrendingUp}
          variant="green"
        />
        <SummaryCard
          title="Gastos del mes"
          value={formatearPrecio(totals.gastosMes)}
          icon={TrendingDown}
          variant="red"
        />
        <SummaryCard
          title="Saldo total en cuentas"
          value={formatearPrecio(totals.saldoTotal)}
          icon={Wallet}
          variant="blue"
        />
      </div>

      <div className="text-xs text-slate-500 mb-8">
        Ingresos del mes = Ventas Banderas ({formatearPrecio(totals.ingresosBanderas)})
        + Pagos recibidos en facturación Vía Pública ({formatearPrecio(totals.ingresosVP)}).
        Las ventas usan <code>finalTotal</code> para descontar devoluciones y se excluyen las borradas.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SectionCard
          title="Ingresos"
          description="Ventas y cobros consolidados, con desglose por departamento, método y cuenta destino."
          href="/publimar/administracion/finanzas/ingresos"
          icon={TrendingUp}
        />
        <SectionCard
          title="Gastos"
          description="Compras a proveedores y gastos operativos, filtrables por categoría y departamento."
          href="/publimar/administracion/finanzas/gastos"
          icon={TrendingDown}
        />
        <SectionCard
          title="Movimientos"
          description="Log de entradas y salidas por cuenta. Ajustes y transferencias."
          href="/publimar/administracion/finanzas/movimientos"
          icon={ArrowLeftRight}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard
          title="Cuentas"
          description="Bancos, billeteras y cajas de efectivo. Saldo actual y movimientos."
          href="/publimar/administracion/cuentas"
          icon={Wallet}
        />
        <SectionCard
          title="Gastos operativos"
          description="Cargá sueldos, alquiler, servicios e impuestos."
          href="/publimar/administracion/gastos-operativos"
          icon={Receipt}
        />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: any;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-blue-900" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">{description}</p>
        <Button asChild variant="outline" className="self-start">
          <Link href={href}>
            Ver {title.toLowerCase()} <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
