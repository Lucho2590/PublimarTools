import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * Valida el secreto compartido que n8n envía en cada request al header
 * `x-bot-secret`. Es la única credencial que vive en Vercel para el bot;
 * la key de IA y el token de WhatsApp viven en n8n.
 */
export function verifyBotSecret(request: NextRequest): boolean {
  const secret = process.env.WHATSAPP_BOT_API_SECRET;
  if (!secret) return false;

  // Acepta el secreto por header `x-bot-secret` o por query param `?s=`.
  // El query param es útil con n8n, donde la URL es un campo fijo (la IA no lo toca),
  // a diferencia de los headers que el agente puede intentar completar.
  const provided =
    request.headers.get("x-bot-secret") ||
    request.nextUrl.searchParams.get("s") ||
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Devuelve una respuesta 403 si el secreto no es válido, o `null` si está OK.
 * Usar al inicio de cada route handler de las acciones del bot.
 * Se usa 403 (no 401) a propósito: es un endpoint máquina-a-máquina y, además,
 * el proxy del entorno de desarrollo rompe ante respuestas 401.
 */
export function requireBot(request: NextRequest): NextResponse | null {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: "Secreto inválido o ausente" }, { status: 403 });
  }
  return null;
}
