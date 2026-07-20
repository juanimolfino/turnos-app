import { NextResponse, type NextRequest } from "next/server";
import { handleIncomingMessage } from "@/lib/bot/handle";
import { secretMatches } from "@/lib/bot/verify";
import { verifyWhatsAppSignature } from "@/lib/whatsapp/webhook-signature";

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: Array<{
          from?: string;
          type?: string;
          text?: { body?: string };
        }>;
        statuses?: unknown[];
      };
    }>;
  }>;
};

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

  let update: WhatsAppWebhookPayload;
  try {
    update = JSON.parse(body) as WhatsAppWebhookPayload;
    console.log("[whatsapp] webhook recibido", update);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  for (const entry of update.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      for (const message of change.value?.messages ?? []) {
        const text = message.text?.body;
        if (message.type !== "text" || !message.from || typeof text !== "string") continue;
        try {
          await handleIncomingMessage({
            channel: "whatsapp",
            userId: message.from,
            text,
          });
        } catch (err) {
          // No propagamos a Meta para evitar reintentos en loop.
          console.error("[whatsapp] error procesando mensaje:", err);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
