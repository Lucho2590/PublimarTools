// Renovar el token del número conectado SIN tocar la coexistencia (ej. cambiar
// el de 60 días del Embedded Signup por uno permanente de usuario del sistema).

import { NextRequest, NextResponse } from "next/server";
import { requireWhatsappAdmin } from "@/lib/whatsapp/auth";
import { replaceToken } from "@/lib/whatsapp/integration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const gate = await requireWhatsappAdmin(request);
  if (gate instanceof NextResponse) return gate;

  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";
    if (!token.trim()) return NextResponse.json({ error: "Pegá el token" }, { status: 400 });
    const { expiresAt } = await replaceToken({ token, updatedBy: gate.uid });
    return NextResponse.json({
      success: true,
      permanent: expiresAt === null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    });
  } catch (error) {
    console.error("[whatsapp] admin/token:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
