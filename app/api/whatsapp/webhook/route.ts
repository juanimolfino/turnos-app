import { NextResponse, type NextRequest } from "next/server";
import { secretMatches } from "@/lib/bot/verify";
import { verifyWhatsAppSignature } from "@/lib/whatsapp/webhook-signature";

export async function GET(request: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) return NextResponse.json({ error: "webhook not configured" }, { status: 500 });

  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge && secretMatches(verifyToken, token)) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return NextResponse.json({ error: "webhook not configured" }, { status: 500 });

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyWhatsAppSignature({ appSecret, body, signature })) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const update = JSON.parse(body) as unknown;
    console.log("[whatsapp] webhook recibido", update);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
