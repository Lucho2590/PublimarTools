// Llamadas del navegador a /api/arca/* con el token de Firebase del usuario.

import type { User } from "firebase/auth";
import type {
  TArcaAlcance,
  TArcaInvoice,
  TArcaPadronResult,
  TArcaPublicConfig,
  TArcaReceptor,
  TArcaSource,
} from "@/types/arca";

async function call<T>(user: User | null | undefined, url: string, init?: RequestInit): Promise<T> {
  if (!user) throw new Error("Tenés que estar logueado");
  const token = await user.getIdToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ArcaApiError(data.error || `Error ${res.status}`, res.status);
  return data as T;
}

export class ArcaApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Id de idempotencia: uno por intento de emisión (se genera al abrir el diálogo). */
export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "");
  return `${Date.now()}${Math.random().toString(36).slice(2, 12)}`;
}

export function consultarPadron(
  user: User | null | undefined,
  cuit: string,
  cache?: { clientId: string; razonIndex?: number | null },
): Promise<TArcaPadronResult> {
  const params = new URLSearchParams({ cuit });
  if (cache?.clientId) params.set("clientId", cache.clientId);
  if (cache?.razonIndex != null) params.set("razonIndex", String(cache.razonIndex));
  return call(user, `/api/arca/padron?${params.toString()}`);
}

export type TEmitirFacturaBody = {
  requestId: string;
  source: TArcaSource;
  sourceId: string;
  receptor: Omit<TArcaReceptor, "condicionIvaReceptorId">;
  alcance: TArcaAlcance;
  pagoKeys?: string[];
  monto?: number;
  descripcion?: string;
};

export async function emitirFactura(user: User | null | undefined, body: TEmitirFacturaBody): Promise<TArcaInvoice> {
  const { invoice } = await call<{ invoice: TArcaInvoice }>(user, "/api/arca/facturas", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return invoice;
}

export async function emitirNotaCredito(
  user: User | null | undefined,
  body: { requestId: string; facturaId: string; monto?: number; motivo?: string },
): Promise<TArcaInvoice> {
  const { invoice } = await call<{ invoice: TArcaInvoice }>(user, "/api/arca/notas-credito", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return invoice;
}

export async function getComprobante(user: User | null | undefined, id: string): Promise<TArcaInvoice> {
  const { invoice } = await call<{ invoice: TArcaInvoice }>(user, `/api/arca/comprobantes/${encodeURIComponent(id)}`);
  return invoice;
}

export function getArcaConfig(user: User | null | undefined): Promise<TArcaPublicConfig> {
  return call(user, "/api/arca/config");
}

export async function postArcaConfig(
  user: User | null | undefined,
  body: Record<string, unknown>,
): Promise<{ config: TArcaPublicConfig; csrPem?: string }> {
  return call(user, "/api/arca/config", { method: "POST", body: JSON.stringify(body) });
}

export type TArcaStatus = {
  environment: string;
  wsfeServer: { ok: boolean; detail: string };
  wsfeAuth: { ok: boolean; detail: string };
  padron: { ok: boolean; detail: string };
  ultimos: { tipo: string; ultimo: string }[];
};

export function getArcaStatus(user: User | null | undefined): Promise<TArcaStatus> {
  return call(user, "/api/arca/status");
}
