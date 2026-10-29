// Simulador del bot (panel /publimar/whatsapp/bot). Corre el MISMO motor que
// usará WhatsApp, con una sesión propia por usuario del staff ("sim:<uid>").
//   POST   { text? , replyId?, replyTitle?, persistOrders?, phone? } → respuestas + traza
//   DELETE → reinicia la conversación simulada
//   GET    → estado del servidor (si la API key de IA está configurada)

import { NextRequest, NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/apiAuth";
import { isAiConfigured } from "@/lib/bot/ai";
import { handleIncoming } from "@/lib/bot/engine";
import { deleteSession } from "@/lib/bot/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await verifyAuthToken(request);
  if (!auth.authenticated || !auth.uid) {
    return NextResponse.json({ error: auth.error || "No autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
    if (body.persistOrders && !phone) {
      return NextResponse.json(
        { error: "Para guardar el pedido real cargá un teléfono de prueba" },
        { status: 400 }
      );
    }
    const result = await handleIncoming({
      sessionId: `sim:${auth.uid}`,
      channel: "simulator",
      text: typeof body.text === "string" ? body.text : null,
      replyId: typeof body.replyId === "string" ? body.replyId : null,
      replyTitle: typeof body.replyTitle === "string" ? body.replyTitle : null,
      phone: phone || null,
      persistOrders: !!body.persistOrders,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[bot] simulate:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyAuthToken(request);
  if (!auth.authenticated || !auth.uid) {
    return NextResponse.json({ error: auth.error || "No autorizado" }, { status: 401 });
  }
  await deleteSession(`sim:${auth.uid}`);
  return NextResponse.json({ ok: true });
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuthToken(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error || "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({ aiConfigured: isAiConfigured() });
}
