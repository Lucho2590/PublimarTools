// Chequeo automático de la configuración técnica de Meta (la que se hace una
// sola vez): variables de entorno + webhook de la app (URL y campos). También
// le pasa al navegador el App ID y el config_id del Embedded Signup (no son
// secretos), así el asistente no depende de variables NEXT_PUBLIC.

import { NextRequest, NextResponse } from "next/server";
import { requireWhatsappAdmin } from "@/lib/whatsapp/auth";
import { getAppSubscriptions } from "@/lib/whatsapp/cloudApi";
import { GRAPH_VERSION, REQUIRED_WEBHOOK_FIELDS } from "@/lib/whatsapp/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TSetupCheck = { id: string; ok: boolean; detail?: string };

const ENV_VARS = [
  "META_APP_ID",
  "META_ES_CONFIG_ID",
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_ENCRYPTION_KEY",
] as const;

function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const gate = await requireWhatsappAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const checks: TSetupCheck[] = [];
  const missingEnv = ENV_VARS.filter((k) => !process.env[k]);
  for (const k of ENV_VARS) {
    checks.push({ id: `env:${k}`, ok: !missingEnv.includes(k) });
  }

  const expectedUrl = `${publicOrigin(request)}/api/whatsapp/webhook`;
  let webhook: {
    callbackUrl: string | null;
    expectedUrl: string;
    missingFields: string[];
    error?: string;
  } = { callbackUrl: null, expectedUrl, missingFields: [...REQUIRED_WEBHOOK_FIELDS] };

  if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
    try {
      const subs = await getAppSubscriptions();
      const waba = subs.find((s) => s.object === "whatsapp_business_account");
      const fields = new Set((waba?.fields || []).map((f) => f.name));
      webhook = {
        callbackUrl: waba?.callback_url ?? null,
        expectedUrl,
        missingFields: REQUIRED_WEBHOOK_FIELDS.filter((f) => !fields.has(f)),
      };
      // Alcanza con que apunte al webhook de la app (en local el origen es
      // localhost y Meta apunta a Vercel: no es un error).
      const url = waba?.callback_url || "";
      const pointsToApp = /\/api\/whatsapp\/webhook\/?$/.test(url);
      checks.push({
        id: "webhook:url",
        ok: !!waba?.active && pointsToApp,
        detail: url
          ? `Configurada: ${url}${pointsToApp && url !== expectedUrl ? " (otro dominio que esta pantalla)" : ""}`
          : "No hay webhook de WhatsApp configurado",
      });
    } catch (error) {
      webhook.error = error instanceof Error ? error.message : String(error);
      checks.push({ id: "webhook:url", ok: false, detail: `No pudimos leer la configuración: ${webhook.error}` });
    }
  } else {
    checks.push({ id: "webhook:url", ok: false, detail: "Primero cargá META_APP_ID y META_APP_SECRET" });
  }
  checks.push({
    id: "webhook:fields",
    ok: webhook.missingFields.length === 0,
    detail: webhook.missingFields.length ? `Faltan: ${webhook.missingFields.join(", ")}` : undefined,
  });

  return NextResponse.json({
    ready: checks.every((c) => c.ok),
    checks,
    webhook,
    appId: process.env.META_APP_ID || null,
    configId: process.env.META_ES_CONFIG_ID || null,
    graphVersion: GRAPH_VERSION,
  });
}
