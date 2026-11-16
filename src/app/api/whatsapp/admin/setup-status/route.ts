// Chequeo automático de la configuración técnica de Meta (la que se hace una
// sola vez): variables de entorno + webhook de la app (URL y campos). También
// le pasa al navegador el App ID y el config_id del Embedded Signup (no son
// secretos), así el asistente no depende de variables NEXT_PUBLIC.

import { NextRequest, NextResponse } from "next/server";
import { requireWhatsappAdmin } from "@/lib/whatsapp/auth";
import { getAppPublishInfo, getAppSubscriptions } from "@/lib/whatsapp/cloudApi";
import { GRAPH_VERSION, REQUIRED_WEBHOOK_FIELDS } from "@/lib/whatsapp/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** `manual`: Meta no lo informa por API; se muestra como "revisalo vos" y no cuenta para `ready`. */
type TSetupCheck = { id: string; ok: boolean; detail?: string; manual?: boolean };

const ENV_VARS = [
  "META_APP_ID",
  "META_ES_CONFIG_ID",
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_ENCRYPTION_KEY",
] as const;

/**
 * URL pública del webhook. En Vercel sale del dominio de producción. En local
 * no hay forma confiable de saberla desde el servidor (el host es una
 * dirección interna del dev server): devuelve null y el navegador usa la suya.
 */
function productionWebhookUrl(): string | null {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}/api/whatsapp/webhook` : null;
}

export async function GET(request: NextRequest) {
  const gate = await requireWhatsappAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const checks: TSetupCheck[] = [];
  // Vacía o con solo espacios cuenta como que falta.
  const missingEnv = ENV_VARS.filter((k) => !process.env[k]?.trim());
  for (const k of ENV_VARS) {
    checks.push({ id: `env:${k}`, ok: !missingEnv.includes(k) });
  }

  let expectedUrl = productionWebhookUrl();
  let webhook: {
    callbackUrl: string | null;
    /** URL que hay que cargar en Meta (null = la arma el navegador con su dominio). */
    expectedUrl: string | null;
    missingFields: string[];
    error?: string;
  } = { callbackUrl: null, expectedUrl, missingFields: [...REQUIRED_WEBHOOK_FIELDS] };

  if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
    try {
      const subs = await getAppSubscriptions();
      const waba = subs.find((s) => s.object === "whatsapp_business_account");
      const fields = new Set((waba?.fields || []).map((f) => f.name));
      // Alcanza con que apunte al webhook de la app (desde local, Meta apunta a
      // Vercel y está bien). Si ya apunta, esa es la URL que se muestra.
      const url = waba?.callback_url || "";
      const pointsToApp = /\/api\/whatsapp\/webhook\/?$/.test(url);
      if (pointsToApp) expectedUrl = url;
      webhook = {
        callbackUrl: waba?.callback_url ?? null,
        expectedUrl,
        missingFields: REQUIRED_WEBHOOK_FIELDS.filter((f) => !fields.has(f)),
      };
      checks.push({
        id: "webhook:url",
        ok: !!waba?.active && pointsToApp,
        detail: url
          ? `En Meta está: ${url}${pointsToApp ? "" : " (no es el webhook de esta app)"}`
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

  // Publicación de la app: sin publicar, Meta no entrega mensajes de números reales.
  if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
    try {
      const info = await getAppPublishInfo();
      const missing = [
        !info.privacyPolicyUrl && "URL de la política de privacidad",
        !info.category && "categoría",
      ].filter(Boolean);
      checks.push({
        id: "app:publish",
        ok: missing.length === 0,
        detail: missing.length ? `Faltan: ${missing.join(", ")}` : undefined,
      });
    } catch (error) {
      checks.push({
        id: "app:publish",
        ok: false,
        detail: `No pudimos leer los datos de la app: ${error instanceof Error ? error.message : error}`,
      });
    }
  } else {
    checks.push({ id: "app:publish", ok: false, detail: "Primero cargá META_APP_ID y META_APP_SECRET" });
  }
  checks.push({ id: "app:live", ok: false, manual: true });

  return NextResponse.json({
    ready: checks.every((c) => c.ok || c.manual),
    checks,
    webhook,
    appId: process.env.META_APP_ID?.trim() || null,
    configId: process.env.META_ES_CONFIG_ID?.trim() || null,
    graphVersion: GRAPH_VERSION,
  });
}
