// Emisión de Factura A/B desde una orden o venta de Banderas.
//   POST { requestId, source: "order"|"sale", sourceId, receptor, alcance, pagoKeys?, monto?, descripcion? }

import { NextRequest, NextResponse } from "next/server";
import { assertAuthorized, emitFactura } from "@/lib/arca/server/emit";
import { errorResponse, requireArcaUser } from "@/lib/arca/server/routeAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireArcaUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    const invoice = await emitFactura(body, auth.uid);
    return NextResponse.json({ invoice: assertAuthorized(invoice) });
  } catch (error) {
    return errorResponse(error);
  }
}
