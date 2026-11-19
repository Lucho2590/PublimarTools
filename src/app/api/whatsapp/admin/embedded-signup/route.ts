// Alta por Embedded Signup (asistente "Conectar WhatsApp"): recibe el `code`
// del popup de Meta + el waba_id, canjea el token, suscribe la cuenta y, con
// coexistencia, pide la sincronización de contactos e historial del celular.

import { NextRequest, NextResponse } from "next/server";
import { requireWhatsappAdmin } from "@/lib/whatsapp/auth";
import { connectEmbedded } from "@/lib/whatsapp/integration";
import { CloudApiError } from "@/lib/whatsapp/cloudApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Traduce los errores de Meta más comunes a algo que el usuario entienda. */
function friendlyError(error: unknown): string {
  if (error instanceof CloudApiError) {
    const msg = error.message || "";
    if (/authorization code|code has (expired|been used)/i.test(msg)) {
      return "El permiso de Meta venció antes de terminar (dura unos segundos). Volvé a tocar \"Abrir Meta\".";
    }
    if (error.code === 190) return "Meta rechazó el permiso. Volvé a intentar el proceso desde el principio.";
    if (error.code === 200 || error.code === 10) {
      return "La cuenta de Facebook no tiene permisos sobre esta cuenta de WhatsApp. Usá una cuenta administradora del portfolio.";
    }
    return `Meta respondió: ${msg}`;
  }
  return error instanceof Error ? error.message : "Error interno";
}

export async function POST(request: NextRequest) {
  const gate = await requireWhatsappAdmin(request);
  if (gate instanceof NextResponse) return gate;

  try {
    const body = await request.json().catch(() => ({}));
    const { code, wabaId, phoneNumberId, businessAppOnboarding } = body || {};
    if (!code) {
      return NextResponse.json(
        { error: "Meta no devolvió el permiso. Volvé a intentar." },
        { status: 400 }
      );
    }
    const result = await connectEmbedded({
      code: String(code),
      wabaId: wabaId ? String(wabaId) : null,
      phoneNumberId: phoneNumberId ? String(phoneNumberId) : null,
      businessAppOnboarding: !!businessAppOnboarding,
      createdBy: gate.uid,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[whatsapp] admin/embedded-signup:", error);
    return NextResponse.json({ error: friendlyError(error) }, { status: 500 });
  }
}
