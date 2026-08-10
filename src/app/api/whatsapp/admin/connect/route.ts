// Alta manual de la integración de WhatsApp (token de System User).
// Autenticado con el ID token de Firebase del usuario + gate de rol admin/superuser.
// Desbloquea todo el desarrollo sin depender del review de Tech Provider de Meta.

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin, verifyAuthToken } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { isAdminOrAbove } from "@/lib/permissions";
import { connectManual } from "@/lib/whatsapp/integration";

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

  // Gate de rol: solo admin/superuser puede cargar credenciales.
  const db = getFirestoreAdmin();
  const userSnap = await db.collection(collections.USERS).doc(auth.uid).get();
  if (!isAdminOrAbove(userSnap.data()?.role ?? null)) {
    return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
  }

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
      createdBy: auth.uid,
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
