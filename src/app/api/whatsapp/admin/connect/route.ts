// Alta manual de la integración de WhatsApp (token de System User).
// Para el número de prueba de Meta o números solo-API (sin coexistencia). El
// número del local se conecta con el asistente (Embedded Signup).

import { NextRequest, NextResponse } from "next/server";
import { requireWhatsappAdmin } from "@/lib/whatsapp/auth";
import { connectManual } from "@/lib/whatsapp/integration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const gate = await requireWhatsappAdmin(request);
  if (gate instanceof NextResponse) return gate;

  try {
    const body = await request.json().catch(() => ({}));
    const { wabaId, phoneNumberId, token } = body || {};
    if (!wabaId || !phoneNumberId || !token) {
      return NextResponse.json(
        { error: "Faltan wabaId, phoneNumberId o token" },
        { status: 400 }
      );
    }
    const result = await connectManual({
      wabaId,
      phoneNumberId,
      token,
      createdBy: gate.uid,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[whatsapp] admin/connect:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
