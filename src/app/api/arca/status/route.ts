// Prueba de conexión con ARCA en el ambiente activo (solo admin): estado de
// los servidores, autenticación WSAA y últimos números autorizados.

import { NextRequest, NextResponse } from "next/server";
import { getArcaClient, describeArcaError } from "@/lib/arca/server/client";
import { errorResponse, requireArcaUser } from "@/lib/arca/server/routeAuth";
import { CBTE_TIPO, cbteTipoLabel, formatNumeroComprobante } from "@/lib/arca/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type TCheck = { ok: boolean; detail: string };

async function check(fn: () => Promise<string>): Promise<TCheck> {
  try {
    return { ok: true, detail: await fn() };
  } catch (error) {
    return { ok: false, detail: describeArcaError(error) };
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireArcaUser(request, "admin");
  if (auth instanceof NextResponse) return auth;
  try {
    const { arca, ctx } = await getArcaClient();
    const billing = arca.electronicBillingService;

    const wsfeServer = await check(async () => {
      const s = await billing.getServerStatus();
      return `App ${s.appServer} · BD ${s.dbServer} · Auth ${s.authServer}`;
    });

    const ultimos: { tipo: string; ultimo: string }[] = [];
    const wsfeAuth = await check(async () => {
      if (!ctx.puntoVenta) throw new Error("Falta el punto de venta");
      for (const tipo of Object.values(CBTE_TIPO)) {
        const r = await billing.getLastVoucher(ctx.puntoVenta, tipo);
        const errs = Array.isArray(r.errors?.err) ? r.errors!.err : r.errors?.err ? [r.errors.err] : [];
        if (errs.length) throw new Error(errs.map((e: any) => `${e.code}: ${e.msg}`).join(" · "));
        ultimos.push({
          tipo: cbteTipoLabel(tipo),
          ultimo: r.cbteNro ? formatNumeroComprobante(ctx.puntoVenta, r.cbteNro) : "Sin emitir",
        });
      }
      return `Autenticado. Punto de venta ${ctx.puntoVenta}`;
    });

    const padron = await check(async () => {
      const r = await arca.registerInscriptionProofService.getTaxpayerDetails(Number(ctx.cuit));
      if (!r) throw new Error("El padrón no devolvió datos del CUIT emisor");
      return "Autenticado (consulta del CUIT emisor OK)";
    });

    return NextResponse.json({ environment: ctx.environment, wsfeServer, wsfeAuth, padron, ultimos });
  } catch (error) {
    return errorResponse(error, 412);
  }
}
