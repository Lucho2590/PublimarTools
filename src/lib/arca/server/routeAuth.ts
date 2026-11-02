// Autorización de las rutas /api/arca/*: token de Firebase + rol del usuario
// (users/{uid}.role). Emitir lo puede hacer el staff de Banderas; validar CUITs
// en el padrón, también Vía Pública; configurar el emisor y los certificados,
// solo admin/superuser.

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin, verifyAuthToken } from "@/lib/apiAuth";
import collections from "@/lib/collections";
import { EUserRole } from "@/types/user";

const STAFF_ROLES = [EUserRole.SUPERUSER, EUserRole.ADMIN, EUserRole.BANDERAS];
const ADMIN_ROLES = [EUserRole.SUPERUSER, EUserRole.ADMIN];
const PADRON_ROLES = [...STAFF_ROLES, EUserRole.VIA_PUBLICA];

export type TArcaAuth = { uid: string; role: EUserRole };

export async function requireArcaUser(
  request: NextRequest,
  level: "staff" | "admin" | "padron" = "staff",
): Promise<TArcaAuth | NextResponse> {
  const auth = await verifyAuthToken(request);
  if (!auth.authenticated || !auth.uid) {
    return NextResponse.json({ error: auth.error || "No autorizado" }, { status: 401 });
  }
  const snap = await getFirestoreAdmin().collection(collections.USERS).doc(auth.uid).get();
  const role = snap.data()?.role as EUserRole | undefined;
  const allowed = level === "admin" ? ADMIN_ROLES : level === "padron" ? PADRON_ROLES : STAFF_ROLES;
  if (!role || !allowed.includes(role)) {
    return NextResponse.json({ error: "No tenés permisos para esta acción" }, { status: 403 });
  }
  return { uid: auth.uid, role };
}

export function errorResponse(error: unknown, fallbackStatus = 500): NextResponse {
  const status =
    typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : fallbackStatus;
  const message = error instanceof Error ? error.message : "Error interno";
  if (status >= 500) console.error("[arca]", error);
  return NextResponse.json({ error: message }, { status });
}
