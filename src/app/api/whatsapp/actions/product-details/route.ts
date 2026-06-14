import { NextRequest, NextResponse } from "next/server";
import { requireBot } from "@/lib/whatsapp/auth";
import { getProductDetails } from "@/lib/whatsapp/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const unauth = requireBot(request);
  if (unauth) return unauth;

  try {
    const body = await request.json().catch(() => ({}));
    const product = await getProductDetails(body);
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error("[whatsapp] product-details:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
