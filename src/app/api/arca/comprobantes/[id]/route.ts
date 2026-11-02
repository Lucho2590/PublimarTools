// Datos de un comprobante ARCA (para el PDF y el diálogo de nota de crédito).

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import { ARCA_INVOICES_COLLECTION } from "@/lib/arca/server/config";
import { requireArcaUser } from "@/lib/arca/server/routeAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireArcaUser(request);
  if (auth instanceof NextResponse) return auth;
  const snap = await getFirestoreAdmin().collection(ARCA_INVOICES_COLLECTION).doc(params.id).get();
  if (!snap.exists) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 });
  return NextResponse.json({ invoice: { id: snap.id, ...snap.data() } });
}
