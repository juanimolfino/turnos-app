import type { Channel, ChannelAdapter, IncomingMessage } from "@/lib/bot/types";
import { telegramAdapter } from "@/lib/bot/channels/telegram";
import { generarRespuesta } from "@/lib/bot/brain";
import { getHistory, appendTurns } from "@/lib/bot/memory";

// Registro de adaptadores por canal. Para sumar un canal nuevo (ej. WhatsApp),
// se agrega su entrada acá y un value en el type Channel; handle no cambia.
const adapters: Record<Channel, ChannelAdapter> = {
  telegram: telegramAdapter,
};

// Punto de entrada agnóstico al canal. La clave separa hilos por canal+usuario
// (`telegram:12345`) para que distintos canales no se mezclen. El cerebro recibe
// el historial ya armado; no ve la clave ni el canal.
export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  console.log(`[bot] ${msg.channel}:${msg.userId} → ${msg.text}`);

  const key = `${msg.channel}:${msg.userId}`;

  const history = await getHistory(key);
  const respuesta = await generarRespuesta(msg.text, history);

  const adapter = adapters[msg.channel];
  await adapter.send(msg.userId, respuesta);

  await appendTurns(key, [
    { role: "user", content: msg.text },
    { role: "assistant", content: respuesta },
  ]);
}
