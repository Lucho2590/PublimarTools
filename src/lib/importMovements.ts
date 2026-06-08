/**
 * Núcleo de parseo y normalización para importar movimientos de cuenta desde
 * un Excel/CSV (resumen del homebanking).
 *
 * Funciones puras (sin React): parsean el archivo, mapean columnas elegidas por
 * el usuario a nuestro esquema, matchean cuentas por número de referencia,
 * detectan posibles duplicados y agrupan para el análisis previo a la importación.
 */

import { EMovementType, TAccountMovement } from "@/types/accountMovement";
import { TAccount } from "@/types/account";
import { monthKey } from "@/lib/rentabilidad";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ParsedSheet {
  columns: string[];
  rows: Record<string, any>[];
}

export type AmountMode = "single" | "debitCredit";
export type AccountMode = "column" | "single";

export type SingleSignMode = "standard" | "inverted";

export interface MappingConfig {
  dateCol: string;
  descriptionCol: string;
  amountMode: AmountMode;
  amountCol?: string; // amountMode === 'single'
  /** Interpretación del signo en modo columna única.
   *  'standard': positivo → Ingreso. 'inverted': positivo → Egreso (default). */
  singleSignMode?: SingleSignMode;
  debitCol?: string; // amountMode === 'debitCredit'
  creditCol?: string; // amountMode === 'debitCredit'
  accountMode: AccountMode;
  accountRefCol?: string; // accountMode === 'column'
  singleAccountId?: string; // accountMode === 'single'
}

export type MatchStatus = "matched" | "unmatched";

export interface NormalizedMovement {
  index: number; // índice estable dentro del lote
  date: Date | null;
  description: string;
  amount: number; // siempre positivo
  type: EMovementType; // INCOME | EXPENSE
  accountId: string | null;
  accountRefRaw: string; // lo que vino en el archivo (o "")
  matchStatus: MatchStatus;
  ambiguous: boolean; // el número de referencia matcheó más de una cuenta
  raw: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Parseo del archivo
// ---------------------------------------------------------------------------

/** Lee el archivo (xlsx/xls/csv) y devuelve columnas + filas como objetos. */
export async function parseFile(file: File): Promise<ParsedSheet> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { columns: [], rows: [] };
  const worksheet = workbook.Sheets[sheetName];

  // defval: "" para que todas las filas tengan las mismas claves.
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: "",
    raw: true,
  });

  // Columnas: unión de todas las claves preservando el orden de aparición.
  const seen = new Set<string>();
  const columns: string[] = [];
  rows.forEach((r) =>
    Object.keys(r).forEach((k) => {
      if (!seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
    }),
  );

  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Parsers de fecha y monto (formatos argentinos)
// ---------------------------------------------------------------------------

const EXCEL_EPOCH = Date.UTC(1899, 11, 30); // base de los seriales de Excel

/** Parsea fecha desde Date (cellDates), serial de Excel o string dd/MM/yyyy | yyyy-MM-dd. */
export function parseDate(value: any): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === "number") {
    // Serial de Excel (días desde 1899-12-30).
    const ms = EXCEL_EPOCH + Math.round(value) * 24 * 60 * 60 * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(value).trim();
  if (!s) return null;

  // dd/MM/yyyy o dd-MM-yyyy (también con yyyy de 2 dígitos)
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    let [, dd, mm, yy] = dmy;
    let year = Number(yy);
    if (year < 100) year += 2000;
    const d = new Date(year, Number(mm) - 1, Number(dd), 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // yyyy-MM-dd
  const ymd = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (ymd) {
    const [, yy, mm, dd] = ymd;
    const d = new Date(Number(yy), Number(mm) - 1, Number(dd), 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Parsea un monto. Devuelve número con signo (puede ser negativo).
 * Maneja "1.234,56" (AR), "1,234.56", símbolo de moneda, y negativos por signo
 * o paréntesis "(1.234,56)".
 */
export function parseAmount(value: any): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;

  let s = String(value).trim();
  if (!s) return 0;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.includes("-")) negative = true;

  // Quitar todo lo que no sea dígito, coma o punto.
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return 0;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  // El separador decimal es el último símbolo que aparezca.
  if (lastComma > lastDot) {
    // Formato AR: '.' miles, ',' decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // Formato US: ',' miles, '.' decimal
    s = s.replace(/,/g, "");
  } else {
    // Sólo un tipo de separador o ninguno
    s = s.replace(/,/g, ".");
  }

  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

// ---------------------------------------------------------------------------
// Normalización + matching de cuentas
// ---------------------------------------------------------------------------

export function normalizeRef(s: string): string {
  return String(s).trim().toLowerCase().replace(/^0+(?=\d)/, "");
}

/** Números de cuenta distintos presentes en una columna, con cantidad de filas. */
export function distinctRefs(
  rows: Record<string, any>[],
  accountRefCol: string,
): { ref: string; normalized: string; count: number }[] {
  const map = new Map<string, { ref: string; count: number }>();
  rows.forEach((r) => {
    const raw = String(r[accountRefCol] ?? "").trim();
    if (!raw) return;
    const key = normalizeRef(raw);
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else map.set(key, { ref: raw, count: 1 });
  });
  return Array.from(map.entries())
    .map(([normalized, v]) => ({ ref: v.ref, normalized, count: v.count }))
    .sort((a, b) => b.count - a.count);
}

/** Sugiere un accountId para un número, por `referenceNumber` (sólo si matchea exactamente una cuenta). */
export function autoMatchRef(normalized: string, accounts: TAccount[]): string {
  const hits = accounts.filter(
    (a) => a.referenceNumber && normalizeRef(a.referenceNumber) === normalized,
  );
  return hits.length === 1 && hits[0].id ? hits[0].id : "";
}

/**
 * Aplica el mapeo a las filas crudas y resuelve la cuenta de cada movimiento.
 * En modo "column", si se pasa `refMap` (número normalizado → accountId, confirmado
 * por el usuario), se usa ese mapeo; si no, cae al auto-match por `referenceNumber`.
 */
export function normalizeRows(
  rows: Record<string, any>[],
  mapping: MappingConfig,
  accounts: TAccount[],
  refMap?: Record<string, string>,
): NormalizedMovement[] {
  // Índice de cuentas por referenceNumber normalizado → lista de ids.
  const refIndex = new Map<string, string[]>();
  accounts.forEach((a) => {
    if (a.referenceNumber && a.id) {
      const k = normalizeRef(a.referenceNumber);
      const arr = refIndex.get(k) || [];
      arr.push(a.id);
      refIndex.set(k, arr);
    }
  });

  return rows.map((raw, index) => {
    const date = parseDate(raw[mapping.dateCol]);
    const description = String(raw[mapping.descriptionCol] ?? "").trim();

    let signed = 0;
    if (mapping.amountMode === "single") {
      signed = parseAmount(raw[mapping.amountCol ?? ""]);
      // Por defecto el banco del usuario trae el signo invertido (positivo = egreso).
      if (mapping.singleSignMode !== "standard") signed = -signed;
    } else {
      const debit = Math.abs(parseAmount(raw[mapping.debitCol ?? ""]));
      const credit = Math.abs(parseAmount(raw[mapping.creditCol ?? ""]));
      signed = credit - debit; // crédito = ingreso, débito = egreso
    }

    const type = signed >= 0 ? EMovementType.INCOME : EMovementType.EXPENSE;
    const amount = Math.abs(signed);

    let accountId: string | null = null;
    let accountRefRaw = "";
    let matchStatus: MatchStatus = "unmatched";
    let ambiguous = false;

    if (mapping.accountMode === "single") {
      accountId = mapping.singleAccountId ?? null;
      matchStatus = accountId ? "matched" : "unmatched";
    } else {
      accountRefRaw = String(raw[mapping.accountRefCol ?? ""] ?? "").trim();
      const norm = normalizeRef(accountRefRaw);
      if (refMap) {
        // Mapeo confirmado por el usuario (número del Excel → cuenta del sistema).
        const mapped = refMap[norm];
        if (mapped) {
          accountId = mapped;
          matchStatus = "matched";
        }
      } else {
        const hits = refIndex.get(norm) || [];
        if (hits.length === 1) {
          accountId = hits[0];
          matchStatus = "matched";
        } else if (hits.length > 1) {
          ambiguous = true; // hay que elegir cuál en la preview
        }
      }
    }

    return {
      index,
      date,
      description,
      amount,
      type,
      accountId,
      accountRefRaw,
      matchStatus,
      ambiguous,
      raw,
    };
  });
}

// ---------------------------------------------------------------------------
// Detección de duplicados
// ---------------------------------------------------------------------------

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dupeKey(accountId: string, date: Date, amount: number): string {
  return `${accountId}|${dayKey(date)}|${Math.round(amount * 100)}`;
}

/**
 * Marca como posibles duplicados los movimientos que ya existen: misma cuenta,
 * mismo día, mismo monto (y, si la descripción del existente está presente, que
 * coincida parcialmente). Devuelve el set de índices duplicados.
 */
export function detectDuplicates(
  normalized: NormalizedMovement[],
  existing: TAccountMovement[],
): Set<number> {
  const existingByKey = new Map<string, TAccountMovement[]>();
  existing.forEach((m) => {
    const d = m.date instanceof Date ? m.date : (m.date as any)?.toDate?.();
    if (!d || !m.accountId) return;
    const k = dupeKey(m.accountId, d, Math.abs(Number(m.amount) || 0));
    const arr = existingByKey.get(k) || [];
    arr.push(m);
    existingByKey.set(k, arr);
  });

  const dupes = new Set<number>();
  normalized.forEach((n) => {
    if (!n.accountId || !n.date) return;
    const candidates = existingByKey.get(
      dupeKey(n.accountId, n.date, n.amount),
    );
    if (!candidates || candidates.length === 0) return;
    // Si hay candidatos con mismo monto/día/cuenta, lo tratamos como duplicado.
    dupes.add(n.index);
  });

  return dupes;
}

// ---------------------------------------------------------------------------
// Agrupaciones para el análisis
// ---------------------------------------------------------------------------

export interface GroupRow {
  key: string;
  label: string;
  ingresos: number;
  egresos: number;
  neto: number;
  count: number;
}

function emptyGroup(key: string, label: string): GroupRow {
  return { key, label, ingresos: 0, egresos: 0, neto: 0, count: 0 };
}

function addToGroup(g: GroupRow, m: NormalizedMovement) {
  if (m.type === EMovementType.INCOME) g.ingresos += m.amount;
  else g.egresos += m.amount;
  g.neto = g.ingresos - g.egresos;
  g.count += 1;
}

export function groupByAccount(
  movements: NormalizedMovement[],
  accounts: TAccount[],
): GroupRow[] {
  const names = new Map<string, string>();
  accounts.forEach((a) => a.id && names.set(a.id, a.name));
  const map = new Map<string, GroupRow>();
  movements.forEach((m) => {
    const key = m.accountId || "__none__";
    const label = m.accountId ? names.get(m.accountId) || "Cuenta" : "Sin cuenta";
    const g = map.get(key) || emptyGroup(key, label);
    addToGroup(g, m);
    map.set(key, g);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function groupByMonth(movements: NormalizedMovement[]): GroupRow[] {
  const map = new Map<string, GroupRow>();
  movements.forEach((m) => {
    if (!m.date) return;
    const key = monthKey(m.date);
    const g = map.get(key) || emptyGroup(key, key);
    addToGroup(g, m);
    map.set(key, g);
  });
  return Array.from(map.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
}

export function groupByType(movements: NormalizedMovement[]): GroupRow[] {
  const ingresos = emptyGroup("income", "Ingresos");
  const egresos = emptyGroup("expense", "Egresos");
  movements.forEach((m) => addToGroup(m.type === EMovementType.INCOME ? ingresos : egresos, m));
  return [ingresos, egresos];
}
