import type { Channel, ChannelAdapter, IncomingMessage } from "@/lib/bot/types";
import { telegramAdapter } from "@/lib/bot/channels/telegram";

// Registro de adaptadores por canal. Para sumar un canal nuevo (ej. WhatsApp),
// se agrega su entrada acá y un value en el type Channel; handle no cambia.
const adapters: Record<Channel, ChannelAdapter> = {
  telegram: telegramAdapter,
};

// Punto de entrada agnóstico al canal. Por ahora loguea y responde un eco.
// La lógica de negocio futura vive acá y nunca importa nada de un canal concreto.
export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  console.log(`[bot] ${msg.channel}:${msg.userId} → ${msg.text}`);

  const adapter = adapters[msg.channel];
  await adapter.send(msg.userId, `Echo: ${msg.text}`);
}
