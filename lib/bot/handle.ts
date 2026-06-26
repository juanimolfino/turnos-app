import type { Channel, ChannelAdapter, IncomingMessage } from "@/lib/bot/types";
import type { ChatTurn } from "@/lib/bot/brain";
import { telegramAdapter } from "@/lib/bot/channels/telegram";
import { generarRespuesta } from "@/lib/bot/brain";
import { getHistory, appendTurns } from "@/lib/bot/memory";
import { extraerIntencion } from "@/lib/bot/intent";
import { buscarDisponibilidad } from "@/lib/bot/search";
import { redactarRespuesta } from "@/lib/bot/reply";

// Registro de adaptadores por canal. Para sumar un canal nuevo (ej. WhatsApp),
// se agrega su entrada acá y un value en el type Channel; handle no cambia.
const adapters: Record<Channel, ChannelAdapter> = {
  telegram: telegramAdapter,
};

// Punto de entrada agnóstico al canal. La clave separa hilos por canal+usuario
// (`telegram:12345`). Flujo:
//  1) cargar historial y extraer la intención sobre la conversación completa
//  2) si falta lo esencial (día o deporte) → repreguntar (charla natural)
//  3) si hay día + deporte → buscar disponibilidad real y dejar que la IA la
//     redacte (sobre hechos, sin inventar). Todavía NO reserva (eso es Fase 6).
export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  console.log(`[bot] ${msg.channel}:${msg.userId} → ${msg.text}`);

  const key = `${msg.channel}:${msg.userId}`;
  const history = await getHistory(key);
  const userTurn: ChatTurn = { role: "user", content: msg.text };

  // "Ahora": extraerIntencion lo formatea en la timezone del negocio (BA).
  const intent = await extraerIntencion([...history, userTurn], new Date());

  let respuesta: string;
  if (!intent.date || !intent.sport) {
    // Falta info esencial para buscar → repreguntamos de forma natural.
    respuesta = await generarRespuesta(msg.text, history);
  } else {
    const lugares = await buscarDisponibilidad(intent, msg.text);
    respuesta = await redactarRespuesta({ history, userText: msg.text, intent, lugares });
  }

  const adapter = adapters[msg.channel];
  await adapter.send(msg.userId, respuesta);

  await appendTurns(key, [userTurn, { role: "assistant", content: respuesta }]);
}
