// Desvinculación del número.
//   action "start"  → el número deja de recibir/mandar ya. Sin coexistencia
//                     termina en el acto; con coexistencia queda esperando que
//                     el dueño lo desconecte desde el celular.
//   action "check"  → "Ya lo desconecté": le pregunta a Meta si la baja está hecha.
//   action "force"  → cierra la desvinculación sin esperar la confirmación de Meta.

import { NextRequest, NextResponse } from "next/server";
import { requireWhatsappAdmin } from "@/lib/whatsapp/auth";
import { checkDisconnect, finishDisconnect, startDisconnect } from "@/lib/whatsapp/integration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const gate = await requireWhatsappAdmin(request);
  if (gate instanceof NextResponse) return gate;

  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action || "start";
    if (action === "start") {
      const result = await startDisconnect(gate.uid);
      return NextResponse.json({ success: true, ...result });
    }
    if (action === "check") {
      const result = await checkDisconnect();
      return NextResponse.json({ success: true, ...result });
    }
    if (action === "force") {
      await finishDisconnect({ confirmed: false, forced: true, requestedBy: gate.uid });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (error) {
    console.error("[whatsapp] admin/disconnect:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
