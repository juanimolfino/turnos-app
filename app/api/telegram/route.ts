import { NextResponse, type NextRequest } from "next/server";
import { handleIncomingMessage } from "@/lib/bot/handle";
import { secretMatches } from "@/lib/bot/verify";

// Webhook del bot de Telegram. Telegram envía un "update" por cada mensaje.
// Validamos el secret token (tiempo constante), extraemos chat.id + text, y
// ESPERAMOS el procesamiento (incluida la llamada a la IA) antes de devolver
// 200: en serverless (Vercel) la función se congela apenas responde, así que un
// fire-and-forget cortaría la llamada a OpenAI. Ante error procesando, igual
// devolvemos 200 (el fallback ya se envió) para que Telegram no reintente.

type TelegramUpdate = {
  message?: {
    chat?: { id?: number };
    text?: string;
  };
};

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || !secretMatches(secret, got)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text;

  // Solo procesamos mensajes de texto; el resto se ignora (200 igual).
  if (chatId != null && typeof text === "string") {
    try {
      await handleIncomingMessage({
        channel: "telegram",
        userId: String(chatId),
        text,
      });
    } catch (err) {
      // No propagamos a Telegram para evitar reintentos en loop.
      console.error("[telegram] error procesando mensaje:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
