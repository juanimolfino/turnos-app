import { NextResponse, type NextRequest, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { handleIncomingMessage } from "@/lib/bot/handle";

// Webhook del bot de Telegram. Telegram envía un "update" por cada mensaje.
// Validamos el secret token (tiempo constante), extraemos chat.id + text, y
// respondemos 200 enseguida; el procesamiento corre con after() tras enviar la
// respuesta (soportado en Vercel), para no demorar el ack a Telegram.

type TelegramUpdate = {
  message?: {
    chat?: { id?: number };
    text?: string;
  };
};

// Comparación en tiempo constante. timingSafeEqual exige buffers de igual largo,
// así que normalizamos longitudes manteniendo el comportamiento constante.
function secretMatches(expected: string, got: string | null): boolean {
  if (!got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) {
    // Comparamos contra sí mismo para no cortocircuitar por longitud.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

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
    // after(): se ejecuta luego de enviar el 200, sin bloquear el ack.
    after(async () => {
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
    });
  }

  return NextResponse.json({ ok: true });
}
