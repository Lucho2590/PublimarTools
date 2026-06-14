import { NextRequest, NextResponse } from "next/server";
import { requireBot } from "@/lib/whatsapp/auth";
import { createQuote } from "@/lib/whatsapp/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const unauth = requireBot(request);
  if (unauth) return unauth;

  try {
    const body = await request.json().catch(() => ({}));
    const result = await createQuote(body);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[whatsapp] create-quote:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
