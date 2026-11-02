// Configuración del emisor y certificados (solo admin).
//   GET  → configuración pública (sin secretos)
//   POST { action: "save", ...emisor }
//   POST { action: "generateCsr", environment, alias, titularCuit } → { csrPem }
//   POST { action: "uploadCert", environment, certPem }
//   POST { action: "setAuthCuit", authCuit } (solo homologación)

import { NextRequest, NextResponse } from "next/server";
import {
  generateCsr,
  getPublicConfig,
  saveCertificate,
  saveEmisor,
  setAuthCuit,
} from "@/lib/arca/server/config";
import { errorResponse, requireArcaUser } from "@/lib/arca/server/routeAuth";
import type { TArcaEnvironment } from "@/types/arca";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const env = (v: unknown): TArcaEnvironment => (v === "produccion" ? "produccion" : "homologacion");

export async function GET(request: NextRequest) {
  const auth = await requireArcaUser(request, "admin");
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await getPublicConfig());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireArcaUser(request, "admin");
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    switch (body?.action) {
      case "save":
        await saveEmisor(
          {
            cuit: String(body.cuit || ""),
            razonSocial: String(body.razonSocial || ""),
            domicilioComercial: String(body.domicilioComercial || ""),
            iibb: String(body.iibb || ""),
            inicioActividades: String(body.inicioActividades || ""),
            puntoVenta: Number(body.puntoVenta) || 0,
            environment: env(body.environment),
            umbralConsumidorFinal: Number(body.umbralConsumidorFinal) || 0,
          },
          auth.uid,
        );
        break;
      case "generateCsr": {
        const csrPem = await generateCsr(
          env(body.environment),
          String(body.alias || ""),
          String(body.titularCuit || ""),
          auth.uid,
        );
        return NextResponse.json({ csrPem, config: await getPublicConfig() });
      }
      case "uploadCert":
        await saveCertificate(env(body.environment), String(body.certPem || ""), auth.uid);
        break;
      case "setAuthCuit":
        await setAuthCuit(body.authCuit === "certificado" ? "certificado" : "emisor", auth.uid);
        break;
      default:
        return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }
    return NextResponse.json({ config: await getPublicConfig() });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
