import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Diagnóstico temporal: NO expone valores, solo si las env vars están presentes
// y su largo. Sirve para verificar la config en Vercel. Borrar después.
export async function GET() {
  const s = process.env.WHATSAPP_BOT_API_SECRET;
  return NextResponse.json({
    botSecretConfigured: !!s,
    botSecretLength: s ? s.length : 0,
    firebaseClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
    firebasePrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    firebaseProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}
