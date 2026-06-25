import type { Channel, ChannelAdapter, IncomingMessage } from "@/lib/bot/types";
import { telegramAdapter } from "@/lib/bot/channels/telegram";
import { generarRespuesta } from "@/lib/bot/brain";

// Registro de adaptadores por canal. Para sumar un canal nuevo (ej. WhatsApp),
// se agrega su entrada acá y un value en el type Channel; handle no cambia.
const adapters: Record<Channel, ChannelAdapter> = {
  telegram: telegramAdapter,
};

// Punto de entrada agnóstico al canal: genera una respuesta con IA y la envía
// por el adaptador del canal correspondiente. Nunca importa nada de un canal
// concreto ni conoce cómo se generó la respuesta.
export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  console.log(`[bot] ${msg.channel}:${msg.userId} → ${msg.text}`);

  const respuesta = await generarRespuesta(msg.text);

  const adapter = adapters[msg.channel];
  await adapter.send(msg.userId, respuesta);
}
