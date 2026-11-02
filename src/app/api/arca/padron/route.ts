// Validación de CUIT contra el padrón de ARCA (constancia de inscripción).
//   GET ?cuit=XXXXXXXXXXX[&clientId=...&razonIndex=N]
// Con clientId guarda el resultado en el cliente (o en su razón social N).

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { consultarCuit } from "@/lib/arca/server/padron";
import { describeArcaError } from "@/lib/arca/server/client";
import { errorResponse, requireArcaUser } from "@/lib/arca/server/routeAuth";
import type { TArcaPadronResult, TArcaPadronSnapshot } from "@/types/arca";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function snapshotOf(r: TArcaPadronResult): TArcaPadronSnapshot {
  return {
    validatedAt: r.validatedAt,
    razonSocial: r.razonSocial,
    condicion: r.condicion,
    domicilio: r.domicilio,
    estadoClave: r.estadoClave,
  };
}

async function cacheInClient(clientId: string, razonIndex: number | null, r: TArcaPadronResult) {
  const ref = getFirestoreAdmin().collection(collections.CLIENTS).doc(clientId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  if (razonIndex == null) {
    // Solo si el CUIT consultado sigue siendo el del cliente.
    if (String(data.cuit || "").replace(/\D/g, "") !== r.cuit) return;
    await ref.update({ arcaPadron: snapshotOf(r) });
    return;
  }
  const list = Array.isArray(data.razonesSociales) ? [...data.razonesSociales] : [];
  const rs = list[razonIndex];
  if (!rs || String(rs.cuit || "").replace(/\D/g, "") !== r.cuit) return;
  list[razonIndex] = { ...rs, arcaPadron: snapshotOf(r) };
  await ref.update({ razonesSociales: list });
}

export async function GET(request: NextRequest) {
  const auth = await requireArcaUser(request, "padron");
  if (auth instanceof NextResponse) return auth;

  const params = request.nextUrl.searchParams;
  const cuit = params.get("cuit") || "";
  try {
    const result = await consultarCuit(cuit);
    const clientId = params.get("clientId");
    if (clientId) {
      const idx = params.get("razonIndex");
      await cacheInClient(clientId, idx != null && idx !== "" ? Number(idx) : null, result).catch((e) =>
        console.error("[arca] cache padrón en cliente:", e),
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    if (typeof (error as { status?: unknown })?.status === "number") return errorResponse(error);
    return NextResponse.json({ error: describeArcaError(error) }, { status: 502 });
  }
}
