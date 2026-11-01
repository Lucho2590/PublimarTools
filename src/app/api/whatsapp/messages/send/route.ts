// Envío de un mensaje de texto desde la bandeja. Autenticado con el ID token de
// Firebase del operador. La ventana de 24 h se valida server-side en sendText.

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin, verifyAuthToken } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { sendText } from "@/lib/whatsapp/outbound";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await verifyAuthToken(request);
  if (!auth.authenticated || !auth.uid) {
    return NextResponse.json(
      { error: auth.error || "No autorizado" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { contactId, text } = body || {};
  if (!contactId || !text?.trim()) {
    return NextResponse.json(
      { error: "Faltan contactId o text" },
      { status: 400 }
    );
  }

  // Nombre del operador (para mostrar en el hilo), best-effort.
  let senderName: string | undefined;
  try {
    const db = getFirestoreAdmin();
    const userSnap = await db.collection(collections.USERS).doc(auth.uid).get();
    senderName = userSnap.data()?.displayName;
  } catch {
    /* no bloquea el envío */
  }

  const result = await sendText({
    contactId,
    body: text,
    senderUid: auth.uid,
    senderName,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true, ...result });
}
