// Webhook de Meta (WhatsApp Cloud API).
//   GET  → handshake de verificación (hub.challenge).
//   POST → verifica la firma HMAC sobre el cuerpo CRUDO, persiste el evento en
//          bruto y responde 200 SIEMPRE (Fase 1: solo persiste; el pipeline de
//          negocio se agrega en Fase 2). Un 500 haría que Meta reintente y
//          termine deshabilitando la suscripción — por eso nunca devolvemos 500.

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { classifyEventType, verifyMetaSignature } from "@/lib/whatsapp/webhookVerify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    process.env.META_WEBHOOK_VERIFY_TOKEN &&
    token === process.env.META_WEBHOOK_VERIFY_TOKEN
  ) {
    // Meta espera el challenge en texto plano.
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  // 1. Cuerpo CRUDO primero (la firma se calcula sobre los bytes exactos).
  const raw = await request.text();

  // 2. Verificación de firma: ÚNICO punto de auth del webhook.
  if (
    !verifyMetaSignature(
      raw,
      request.headers.get("x-hub-signature-256"),
      process.env.META_APP_SECRET
    )
  ) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: any = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }

  // 3. Persistir el evento crudo ANTES de procesar (idempotencia + reproceso).
  try {
    const db = getFirestoreAdmin();
    await db.collection(collections.WHATSAPP_WEBHOOK_EVENTS).add({
      eventType: classifyEventType(payload),
      payload,
      signatureValid: true,
      status: "pending",
      error: null,
      receivedAt: FieldValue.serverTimestamp(),
      processedAt: null,
    });
    // Fase 2 engancha acá el pipeline entrante (siempre con await).
  } catch (error) {
    // Aun si falla la persistencia, respondemos 200 para no gatillar reintentos
    // que terminen deshabilitando la suscripción. Queda logueado para revisar.
    console.error("[whatsapp webhook] error persistiendo evento:", error);
  }

  return new NextResponse(null, { status: 200 });
}
