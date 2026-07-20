import type { ChannelAdapter } from "@/lib/bot/types";
import { sendWhatsAppText } from "@/lib/whatsapp/client";

// Adaptador del canal WhatsApp: responde al usuario vía WhatsApp Cloud API.
// El userId del canal es el `message.from` de Meta, que viene como teléfono
// normalizado en dígitos internacionales.
export const whatsappAdapter: ChannelAdapter = {
  async send(userId: string, text: string): Promise<void> {
    await sendWhatsAppText({ to: userId, text });
  },
};
