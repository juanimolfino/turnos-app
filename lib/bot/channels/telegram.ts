import type { ChannelAdapter } from "@/lib/bot/types";

// Adaptador del canal Telegram: responde al usuario vía la Bot API.
export const telegramAdapter: ChannelAdapter = {
  async send(userId: string, text: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN no configurado");

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: userId, text }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Telegram sendMessage falló (${res.status}): ${body}`);
    }
  },
};
