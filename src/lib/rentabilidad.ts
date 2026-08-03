/**
 * Núcleo de cálculo del módulo de Rentabilidad.
 *
 * Funciones puras (sin React ni Firestore): normalizan los documentos crudos de
 * Firestore a un "ledger" unificado en memoria (ingresos/gastos) y derivan las
 * agregaciones que consumen el dashboard y las subpáginas.
 *
 * Reglas de negocio replicadas de Finanzas (finanzas/page.tsx):
 *  - Ingreso Banderas = ventas con department BANDERAS (o legacy sin department),
 *    usando `finalTotal` para descontar devoluciones y excluyendo borradas.
 *  - Ingreso Vía Pública = pagos efectivamente cobrados en `billing.paymentHistory`
 *    cuyo `date` cae en el rango (NO `totalAmount`).
 */

import { ESaleDepartment, TSale } from "@/types/sale";
import { TBilling } from "@/types/billing";
import {
  EPurchaseDepartment,
  TPurchase,
} from "@/types/purchase";
import {
  EXPENSE_CATEGORY_LABELS,
  TOperationalExpense,
} from "@/types/operationalExpense";
import { EAccountStatus, EAccountType, TAccount } from "@/types/account";
import {
  EMovementType,
  TAccountMovement,
  movementSignedAmount,
} from "@/types/accountMovement";
import { EQuoteStatus, TQuote } from "@/types/quote";

// ---------------------------------------------------------------------------
// Departamentos
// ---------------------------------------------------------------------------

export type RentaDepartment = "banderas" | "via_publica" | "administracion";

export const RENTA_DEPARTMENTS: RentaDepartment[] = [
  "banderas",
  "via_publica",
  "administracion",
];

export const RENTA_DEPARTMENT_LABELS: Record<RentaDepartment, string> = {
  banderas: "Banderas",
  via_publica: "Vía Pública",
  administracion: "Administración",
};

// ---------------------------------------------------------------------------
// Ledger unificado
// ---------------------------------------------------------------------------

export interface RevenueEntry {
  date: Date;
  amount: number;
  department: RentaDepartment;
  source: "sale" | "billing";
  accountId?: string;
}

export interface ExpenseEntry {
  date: Date;
  amount: number;
  department: RentaDepartment;
  kind: "compra" | "operativo";
  category: string;
  providerId?: string;
  providerName?: string;
  accountId?: string;
}

// ---------------------------------------------------------------------------
// Helpers de fecha (centralizados; antes duplicados en cada page de Finanzas)
// ---------------------------------------------------------------------------

/** Normaliza un valor de fecha de Firestore (Timestamp / {seconds} / Date / string). */
export function toDate(d: any): Date | null {
  if (!d) return null;
  if (typeof d.toDate === "function") return d.toDate();
  if (d?.seconds) return new Date(d.seconds * 1000);
  if (d instanceof Date) return d;
  if (typeof d === "string") return new Date(d);
  return null;
}

/** Convierte un string `YYYY-MM-DD` a Date en hora local (mediodía, evita desfase de zona). */
export function dateFromYMD(s: string | undefined | null): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T12:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

export function inRange(d: Date | null, from: Date, to: Date): boolean {
  return !!d && d >= from && d <= to;
}

/** Clave de mes para agrupar: `2026-06`. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

/**
 * Convierte ventas (Banderas) y facturaciones (Vía Pública) en entradas de ingreso
 * dentro del rango [from, to].
 */
export function normalizeRevenue(
  sales: TSale[] | undefined,
  billings: TBilling[] | undefined,
  from: Date,
  to: Date,
): RevenueEntry[] {
  const entries: RevenueEntry[] = [];

  // Ventas Banderas (o legacy sin department). VP no se cuenta acá: viene de billings.
  (sales || [])
    .filter(
      (s) =>
        !(s as any).deleted &&
        (!s.department || s.department === ESaleDepartment.BANDERAS),
    )
    .forEach((s) => {
      const date = toDate(s.createdAt);
      if (!inRange(date, from, to)) return;
      entries.push({
        date: date as Date,
        amount: Number(s.finalTotal ?? s.total) || 0,
        department: "banderas",
        source: "sale",
        accountId: s.accountId ?? undefined,
      });
    });

  // Ingresos Vía Pública: cada pago de paymentHistory cuyo date cae en el rango.
  (billings || [])
    .filter((b) => !(b as any).deleted)
    .forEach((b) => {
      (b.paymentHistory || []).forEach((p) => {
        const date = toDate(p.date);
        if (!inRange(date, from, to)) return;
        entries.push({
          date: date as Date,
          amount: Number(p.amount) || 0,
          department: "via_publica",
          source: "billing",
          accountId: p.accountId,
        });
      });
    });

  return entries;
}

/**
 * Convierte compras a proveedores y gastos operativos en entradas de gasto
 * dentro del rango [from, to].
 */
export function normalizeExpenses(
  purchases: TPurchase[] | undefined,
  operationalExpenses: TOperationalExpense[] | undefined,
  from: Date,
  to: Date,
): ExpenseEntry[] {
  const entries: ExpenseEntry[] = [];

  (purchases || [])
    .filter((p) => !(p as any).deleted)
    .forEach((p) => {
      const date = dateFromYMD(p.date);
      if (!inRange(date, from, to)) return;
      entries.push({
        date: date as Date,
        amount: Number(p.amount) || 0,
        department: (p.department as RentaDepartment) || "administracion",
        kind: "compra",
        category: "Compra a proveedor",
        providerId: p.providerId,
        providerName: p.providerName || "Sin proveedor",
        accountId: p.accountId ?? undefined,
      });
    });

  (operationalExpenses || [])
    .filter((e) => !(e as any).deleted)
    .forEach((e) => {
      const date = dateFromYMD(e.date);
      if (!inRange(date, from, to)) return;
      entries.push({
        date: date as Date,
        amount: Number(e.amount) || 0,
        department: (e.department as RentaDepartment) || "administracion",
        kind: "operativo",
        category: EXPENSE_CATEGORY_LABELS[e.category] || "Otro",
        accountId: e.accountId,
      });
    });

  return entries;
}

// ---------------------------------------------------------------------------
// Agregaciones por departamento
// ---------------------------------------------------------------------------

function sumByKey<T>(items: T[], key: (i: T) => string, value: (i: T) => number) {
  const map = new Map<string, number>();
  items.forEach((i) => {
    const k = key(i);
    map.set(k, (map.get(k) || 0) + value(i));
  });
  return map;
}

export function revenueByDepartment(
  rev: RevenueEntry[],
): Record<RentaDepartment, number> {
  const base: Record<RentaDepartment, number> = {
    banderas: 0,
    via_publica: 0,
    administracion: 0,
  };
  rev.forEach((r) => {
    base[r.department] += r.amount;
  });
  return base;
}

export function expensesByDepartment(
  exp: ExpenseEntry[],
): Record<RentaDepartment, number> {
  const base: Record<RentaDepartment, number> = {
    banderas: 0,
    via_publica: 0,
    administracion: 0,
  };
  exp.forEach((e) => {
    base[e.department] += e.amount;
  });
  return base;
}

export interface DepartmentMargin {
  department: RentaDepartment;
  ingresos: number;
  gastos: number;
  margen: number;
  margenPct: number | null; // null cuando no hay ingresos (evita división por cero)
}

/**
 * Margen por departamento. `administracion` típicamente no tiene ingresos: su
 * "margen" es negativo y representa gasto de estructura/overhead — las páginas
 * lo muestran aparte, no como un departamento con margen negativo engañoso.
 */
export function marginByDepartment(
  rev: RevenueEntry[],
  exp: ExpenseEntry[],
): DepartmentMargin[] {
  const ingresos = revenueByDepartment(rev);
  const gastos = expensesByDepartment(exp);
  return RENTA_DEPARTMENTS.map((d) => {
    const ing = ingresos[d];
    const gas = gastos[d];
    return {
      department: d,
      ingresos: ing,
      gastos: gas,
      margen: ing - gas,
      margenPct: ing > 0 ? ((ing - gas) / ing) * 100 : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Agregaciones de gastos
// ---------------------------------------------------------------------------

export interface RankedItem {
  key: string;
  label: string;
  amount: number;
}

export function expensesByCategory(exp: ExpenseEntry[]): RankedItem[] {
  const map = sumByKey(
    exp,
    (e) => e.category,
    (e) => e.amount,
  );
  return Array.from(map.entries())
    .map(([label, amount]) => ({ key: label, label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function expensesByProvider(exp: ExpenseEntry[]): RankedItem[] {
  const onlyPurchases = exp.filter((e) => e.kind === "compra");
  const labels = new Map<string, string>();
  onlyPurchases.forEach((e) => {
    if (e.providerId) labels.set(e.providerId, e.providerName || "Sin proveedor");
  });
  const map = sumByKey(
    onlyPurchases,
    (e) => e.providerId || "sin-proveedor",
    (e) => e.amount,
  );
  return Array.from(map.entries())
    .map(([key, amount]) => ({
      key,
      label: labels.get(key) || "Sin proveedor",
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

// ---------------------------------------------------------------------------
// Rentabilidad de productos
// ---------------------------------------------------------------------------

export interface ProductRevenueRow {
  productId: string;
  productName: string;
  ingreso: number;
  unidades: number;
  /** Margen Banderas: queda en null hasta que exista costo por producto. */
  costo: number | null;
  margen: number | null;
}

/**
 * Ranking de productos por facturación y volumen, recorriendo los items de las
 * ventas Banderas en el rango. El margen real requiere costo por producto
 * (campo `cost` opcional, hoy ausente) → se deja preparado y devuelve null.
 */
export function productRevenueRanking(
  sales: TSale[] | undefined,
  costByProductId?: Map<string, number>,
): ProductRevenueRow[] {
  const map = new Map<
    string,
    { productName: string; ingreso: number; unidades: number }
  >();

  (sales || [])
    .filter(
      (s) =>
        !(s as any).deleted &&
        (!s.department || s.department === ESaleDepartment.BANDERAS),
    )
    .forEach((s) => {
      (s.items || []).forEach((it) => {
        const id = it.productId || `manual:${it.productName}`;
        const prev = map.get(id) || {
          productName: it.productName || "Producto",
          ingreso: 0,
          unidades: 0,
        };
        prev.ingreso += Number(it.total) || 0;
        prev.unidades += Number(it.quantity) || 0;
        map.set(id, prev);
      });
    });

  return Array.from(map.entries())
    .map(([productId, v]) => {
      const unitCost = costByProductId?.get(productId);
      const costo =
        unitCost !== undefined ? unitCost * v.unidades : null;
      return {
        productId,
        productName: v.productName,
        ingreso: v.ingreso,
        unidades: v.unidades,
        costo,
        margen: costo !== null ? v.ingreso - costo : null,
      };
    })
    .sort((a, b) => b.ingreso - a.ingreso);
}

export interface ProductMarginVPRow {
  productName: string;
  costo: number;
  venta: number;
  margen: number;
  margenPct: number | null;
}

/**
 * Margen real de productos de Vía Pública, usando `costo` y `precioVenta` de los
 * items de presupuestos confirmados.
 */
export function productMarginVP(
  quotes: TQuote[] | undefined,
): ProductMarginVPRow[] {
  const map = new Map<string, { costo: number; venta: number }>();

  (quotes || [])
    .filter((q) => !(q as any).deleted && q.status === EQuoteStatus.CONFIRMED)
    .forEach((q) => {
      // Items pueden venir sueltos (items[]) o anidados en periodos[].
      const flatItems = [
        ...(q.items || []),
        ...((q.periodos || []).flatMap((p) => p.items || [])),
      ];
      flatItems.forEach((it) => {
        const costo = Number(it.costo) || 0;
        const venta = Number(it.precioVenta ?? it.unitPrice) || 0;
        if (costo === 0 && venta === 0) return;
        const qty = Number(it.quantity) || 1;
        const name = it.productName || "Producto";
        const prev = map.get(name) || { costo: 0, venta: 0 };
        prev.costo += costo * qty;
        prev.venta += venta * qty;
        map.set(name, prev);
      });
    });

  return Array.from(map.entries())
    .map(([productName, v]) => ({
      productName,
      costo: v.costo,
      venta: v.venta,
      margen: v.venta - v.costo,
      margenPct: v.venta > 0 ? ((v.venta - v.costo) / v.venta) * 100 : null,
    }))
    .sort((a, b) => b.margen - a.margen);
}

// ---------------------------------------------------------------------------
// Liquidez y cuentas
// ---------------------------------------------------------------------------

export interface AccountBalanceRow {
  id: string;
  name: string;
  type: EAccountType;
  currency: "ARS" | "USD";
  balance: number;
  pct: number; // % sobre el total ARS
}

/** Liquidez = Σ currentBalance de cuentas ARS activas, excluyendo tarjetas de crédito (deuda). */
export function totalLiquidity(accounts: TAccount[] | undefined): number {
  return (accounts || [])
    .filter(
      (a) =>
        a.currency === "ARS" &&
        a.status === EAccountStatus.ACTIVE &&
        a.type !== EAccountType.CREDIT_CARD,
    )
    .reduce((s, a) => s + (Number(a.currentBalance) || 0), 0);
}

/** Distribución de plata por cuenta (ARS activas, excl. tarjetas), ordenada desc. */
export function moneyByAccount(
  accounts: TAccount[] | undefined,
): AccountBalanceRow[] {
  const ars = (accounts || []).filter(
    (a) =>
      a.currency === "ARS" &&
      a.status === EAccountStatus.ACTIVE &&
      a.type !== EAccountType.CREDIT_CARD,
  );
  const total = ars.reduce((s, a) => s + (Number(a.currentBalance) || 0), 0);
  return ars
    .map((a) => {
      const balance = Number(a.currentBalance) || 0;
      return {
        id: a.id || "",
        name: a.name,
        type: a.type,
        currency: a.currency,
        balance,
        pct: total > 0 ? (balance / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.balance - a.balance);
}

/** Cuentas en USD (se listan aparte, sin convertir a ARS). */
export function usdAccounts(accounts: TAccount[] | undefined): AccountBalanceRow[] {
  return (accounts || [])
    .filter((a) => a.currency === "USD" && a.status === EAccountStatus.ACTIVE)
    .map((a) => ({
      id: a.id || "",
      name: a.name,
      type: a.type,
      currency: a.currency,
      balance: Number(a.currentBalance) || 0,
      pct: 0,
    }))
    .sort((a, b) => b.balance - a.balance);
}

export interface AccountFlowRow {
  accountId: string;
  name: string;
  entradas: number; // ingresos + transferencias recibidas
  salidas: number; // egresos + transferencias enviadas (valor positivo)
  neto: number; // entradas - salidas
}

/**
 * Flujo neto por cuenta en el rango: cuánto entró y salió de cada cuenta.
 * Útil para ver dónde se acumula o desde dónde sale más plata.
 */
export function accountFlow(
  movements: TAccountMovement[] | undefined,
  accounts: TAccount[] | undefined,
  from: Date,
  to: Date,
): AccountFlowRow[] {
  const names = new Map<string, string>();
  (accounts || []).forEach((a) => a.id && names.set(a.id, a.name));

  const map = new Map<string, { entradas: number; salidas: number }>();
  (movements || [])
    .filter((m) => !(m as any).deleted)
    .forEach((m) => {
      const date = toDate(m.date);
      if (!inRange(date, from, to)) return;
      const signed = movementSignedAmount(m);
      const prev = map.get(m.accountId) || { entradas: 0, salidas: 0 };
      if (signed >= 0) prev.entradas += signed;
      else prev.salidas += -signed;
      map.set(m.accountId, prev);
    });

  return Array.from(map.entries())
    .map(([accountId, v]) => ({
      accountId,
      name: names.get(accountId) || "Cuenta",
      entradas: v.entradas,
      salidas: v.salidas,
      neto: v.entradas - v.salidas,
    }))
    .sort((a, b) => b.salidas - a.salidas);
}

// ---------------------------------------------------------------------------
// Series mensuales y proyección
// ---------------------------------------------------------------------------

export interface MonthlyPoint {
  month: string; // YYYY-MM
  label: string; // ej "jun 2026"
  ingresos: number;
  gastos: number;
  balance: number; // ingresos - gastos
}

const MONTH_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function labelForMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_SHORT[(m || 1) - 1]} ${y}`;
}

/**
 * Serie de los últimos `nMonths` meses (incluyendo el actual) a partir de las
 * entradas normalizadas, agrupando por mes calendario.
 */
export function monthlySeries(
  rev: RevenueEntry[],
  exp: ExpenseEntry[],
  nMonths: number,
  now: Date,
): MonthlyPoint[] {
  const keys: string[] = [];
  for (let i = nMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }

  const ingByMonth = new Map<string, number>();
  const gasByMonth = new Map<string, number>();
  rev.forEach((r) => {
    const k = monthKey(r.date);
    ingByMonth.set(k, (ingByMonth.get(k) || 0) + r.amount);
  });
  exp.forEach((e) => {
    const k = monthKey(e.date);
    gasByMonth.set(k, (gasByMonth.get(k) || 0) + e.amount);
  });

  return keys.map((k) => {
    const ingresos = ingByMonth.get(k) || 0;
    const gastos = gasByMonth.get(k) || 0;
    return {
      month: k,
      label: labelForMonthKey(k),
      ingresos,
      gastos,
      balance: ingresos - gastos,
    };
  });
}

export interface DepartmentMarginPoint {
  month: string; // YYYY-MM
  label: string; // ej "jun 2026"
  banderas: number;
  via_publica: number;
  administracion: number;
}

/**
 * Margen mensual (ingresos − gastos) por departamento, mes a mes, cubriendo
 * los meses calendario entre `from` y `to` (inclusive). Pensado para el gráfico
 * de línea: cada punto trae el margen de cada departamento.
 */
export function monthlyMarginByDepartment(
  rev: RevenueEntry[],
  exp: ExpenseEntry[],
  from: Date,
  to: Date,
): DepartmentMarginPoint[] {
  // Enumerar los meses calendario del rango.
  const keys: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const last = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= last) {
    keys.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Acumular ingresos y gastos por (mes, departamento).
  const ing = new Map<string, Record<RentaDepartment, number>>();
  const gas = new Map<string, Record<RentaDepartment, number>>();
  const blank = (): Record<RentaDepartment, number> => ({
    banderas: 0,
    via_publica: 0,
    administracion: 0,
  });

  rev.forEach((r) => {
    const k = monthKey(r.date);
    const row = ing.get(k) || blank();
    row[r.department] += r.amount;
    ing.set(k, row);
  });
  exp.forEach((e) => {
    const k = monthKey(e.date);
    const row = gas.get(k) || blank();
    row[e.department] += e.amount;
    gas.set(k, row);
  });

  return keys.map((k) => {
    const i = ing.get(k) || blank();
    const g = gas.get(k) || blank();
    return {
      month: k,
      label: labelForMonthKey(k),
      banderas: i.banderas - g.banderas,
      via_publica: i.via_publica - g.via_publica,
      administracion: i.administracion - g.administracion,
    };
  });
}

// ---------------------------------------------------------------------------
// Series diarias (¿qué días se vende más?)
// ---------------------------------------------------------------------------

/** Nombres de día indexados por `Date.getDay()` (0 = domingo). */
const WEEKDAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

/** Orden de presentación: lunes primero, domingo último. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Clave de día para agrupar: `2026-08-01` (hora local). */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Enumera todos los días calendario entre `from` y `to` (inclusive). */
function enumerateDays(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export interface DailyRevenuePoint {
  day: string; // YYYY-MM-DD
  label: string; // ej "01/08"
  date: Date;
  weekday: number; // 0 = domingo
  weekdayLabel: string;
  ventas: number; // monto
  cantidad: number; // # de operaciones
}

/**
 * Serie día a día del rango. Incluye los días sin ventas (en 0): un día flojo
 * es parte de la respuesta a "¿qué días vendemos más?".
 */
export function dailyRevenueSeries(
  rev: RevenueEntry[],
  from: Date,
  to: Date,
): DailyRevenuePoint[] {
  const totals = new Map<string, { ventas: number; cantidad: number }>();
  rev.forEach((r) => {
    const k = dayKey(r.date);
    const row = totals.get(k) || { ventas: 0, cantidad: 0 };
    row.ventas += r.amount;
    row.cantidad += 1;
    totals.set(k, row);
  });

  return enumerateDays(from, to).map((d) => {
    const k = dayKey(d);
    const row = totals.get(k) || { ventas: 0, cantidad: 0 };
    return {
      day: k,
      label: `${String(d.getDate()).padStart(2, "0")}/${String(
        d.getMonth() + 1,
      ).padStart(2, "0")}`,
      date: d,
      weekday: d.getDay(),
      weekdayLabel: WEEKDAY_LABELS[d.getDay()],
      ventas: row.ventas,
      cantidad: row.cantidad,
    };
  });
}

export interface WeekdayRevenue {
  weekday: number; // 0 = domingo
  label: string;
  total: number;
  cantidad: number;
  ocurrencias: number; // cuántos días de ese nombre hubo en el rango
  promedio: number; // total / ocurrencias
}

/**
 * Ranking por día de la semana, devuelto en orden lunes → domingo.
 *
 * `ocurrencias` se cuenta sobre el calendario del rango (no sobre las ventas):
 * si el rango tiene 5 lunes y solo 2 tuvieron ventas, el promedio igual divide
 * por 5. De lo contrario un día flojo aparentaría rendir igual que uno fuerte.
 */
export function revenueByWeekday(
  rev: RevenueEntry[],
  from: Date,
  to: Date,
): WeekdayRevenue[] {
  const totals = new Map<number, { total: number; cantidad: number }>();
  rev.forEach((r) => {
    const w = r.date.getDay();
    const row = totals.get(w) || { total: 0, cantidad: 0 };
    row.total += r.amount;
    row.cantidad += 1;
    totals.set(w, row);
  });

  const ocurrencias = new Map<number, number>();
  enumerateDays(from, to).forEach((d) => {
    ocurrencias.set(d.getDay(), (ocurrencias.get(d.getDay()) || 0) + 1);
  });

  return WEEKDAY_ORDER.map((w) => {
    const row = totals.get(w) || { total: 0, cantidad: 0 };
    const n = ocurrencias.get(w) || 0;
    return {
      weekday: w,
      label: WEEKDAY_LABELS[w],
      total: row.total,
      cantidad: row.cantidad,
      ocurrencias: n,
      promedio: n > 0 ? row.total / n : 0,
    };
  });
}

export interface HourBucketRevenue {
  key: string;
  label: string;
  total: number;
  cantidad: number;
}

const HOUR_BUCKETS: { key: string; label: string; from: number; to: number }[] =
  [
    { key: "madrugada", label: "Madrugada (00–06)", from: 0, to: 6 },
    { key: "manana", label: "Mañana (06–13)", from: 6, to: 13 },
    { key: "tarde", label: "Tarde (13–20)", from: 13, to: 20 },
    { key: "noche", label: "Noche (20–24)", from: 20, to: 24 },
  ];

/**
 * Distribución por franja horaria.
 *
 * Solo considera entradas con `source === "sale"`: los cobros de Vía Pública
 * vienen de un string `YYYY-MM-DD` normalizado a mediodía (ver `dateFromYMD`),
 * así que no tienen hora real y ensuciarían la franja "Tarde".
 */
export function revenueByHourBucket(rev: RevenueEntry[]): HourBucketRevenue[] {
  const totals = new Map<string, { total: number; cantidad: number }>();

  rev
    .filter((r) => r.source === "sale")
    .forEach((r) => {
      const h = r.date.getHours();
      const bucket = HOUR_BUCKETS.find((b) => h >= b.from && h < b.to);
      if (!bucket) return;
      const row = totals.get(bucket.key) || { total: 0, cantidad: 0 };
      row.total += r.amount;
      row.cantidad += 1;
      totals.set(bucket.key, row);
    });

  return HOUR_BUCKETS.map((b) => {
    const row = totals.get(b.key) || { total: 0, cantidad: 0 };
    return {
      key: b.key,
      label: b.label,
      total: row.total,
      cantidad: row.cantidad,
    };
  });
}

export interface MonthlyAverages {
  avgIngresos: number;
  avgGastos: number;
  avgBalance: number;
  monthsConsidered: number;
}

/**
 * Promedios mensuales sobre la serie, excluyendo el mes en curso por defecto
 * (un mes incompleto sesga el promedio hacia abajo).
 */
export function monthlyAverages(
  series: MonthlyPoint[],
  excludeCurrentMonth = true,
): MonthlyAverages {
  const considered = excludeCurrentMonth ? series.slice(0, -1) : series;
  const n = considered.length;
  if (n === 0) {
    return { avgIngresos: 0, avgGastos: 0, avgBalance: 0, monthsConsidered: 0 };
  }
  const sumIng = considered.reduce((s, p) => s + p.ingresos, 0);
  const sumGas = considered.reduce((s, p) => s + p.gastos, 0);
  return {
    avgIngresos: sumIng / n,
    avgGastos: sumGas / n,
    avgBalance: (sumIng - sumGas) / n,
    monthsConsidered: n,
  };
}

/** Proyección lineal simple del balance a `months` meses vista. */
export function projectBalance(
  currentLiquidity: number,
  avgIngresos: number,
  avgGastos: number,
  months: number,
): number {
  return currentLiquidity + (avgIngresos - avgGastos) * months;
}

export interface BreakEven {
  /** Facturación mensual necesaria para igualar el gasto mensual promedio. */
  simple: number;
  /** Facturación necesaria cubriendo costos fijos con margen de contribución. */
  porMargenContribucion: number | null;
  /** Margen de contribución estimado: (ingresos − compras) / ingresos. */
  margenContribucionPct: number | null;
  costosFijosMensuales: number;
  costosVariablesMensuales: number;
}

/**
 * Cuánto hay que facturar para no perder plata. Dos lecturas:
 *  - simple: igualar el gasto mensual promedio total.
 *  - por margen de contribución: tratar las compras como costo variable y los
 *    gastos operativos como costo fijo. Sin costo por producto, el margen de
 *    contribución se estima como (ingresos − compras) / ingresos.
 */
export function breakEven(
  series: MonthlyPoint[],
  rev: RevenueEntry[],
  exp: ExpenseEntry[],
  excludeCurrentMonth = true,
): BreakEven {
  const avgs = monthlyAverages(series, excludeCurrentMonth);
  const meses = avgs.monthsConsidered || 1;

  const totalIngresos = rev.reduce((s, r) => s + r.amount, 0);
  const totalCompras = exp
    .filter((e) => e.kind === "compra")
    .reduce((s, e) => s + e.amount, 0);
  const totalOperativos = exp
    .filter((e) => e.kind === "operativo")
    .reduce((s, e) => s + e.amount, 0);

  const costosFijosMensuales = totalOperativos / meses;
  const costosVariablesMensuales = totalCompras / meses;

  const margenContribucionPct =
    totalIngresos > 0
      ? ((totalIngresos - totalCompras) / totalIngresos) * 100
      : null;

  const porMargenContribucion =
    margenContribucionPct && margenContribucionPct > 0
      ? costosFijosMensuales / (margenContribucionPct / 100)
      : null;

  return {
    simple: avgs.avgGastos,
    porMargenContribucion,
    margenContribucionPct,
    costosFijosMensuales,
    costosVariablesMensuales,
  };
}
