import OpenAI from "openai";
import type { ChatTurn } from "@/lib/bot/brain";
import type { Intent } from "@/lib/bot/intent";
import type { LugarDisponibilidad } from "@/lib/bot/search";

// Redacción de la respuesta de disponibilidad. La IA SOLO expresa los hechos que
// le pasamos (lugares y horarios reales); no inventa lugares ni horarios.
// Agnóstico al canal. Tolerante a fallos: ante error devuelve un fallback amable.

const MODEL = "gpt-4.1-mini";

const FALLBACK =
  "Perdoná, no pude armar la búsqueda en este momento. ¿Probamos de nuevo en un ratito?";

const SYSTEM = `Sos el asistente de pádel del pueblo (Bolívar). Hablás en español rioplatense (voseo), cálido y breve.

Te paso DATOS_DISPONIBILIDAD: los lugares y horarios libres REALES para el día consultado. Reglas estrictas:
- Usá SOLO esos datos. No inventes lugares, canchas ni horarios. No completes huecos.
- Agrupá lo que ofrecés POR LUGAR. Mencioná los horarios; si suma, nombrá la cancha.
- Si el usuario pidió una hora puntual y no está libre, ofrecé lo más cercano de ese mismo día.
- Si la lista viene vacía, decí claramente que no hay nada ese día y ofrecé buscar otro día.
- Si el usuario ELIGE una opción, confirmá lugar, cancha, día y hora, y aclará con simpatía que la reserva se habilita en el próximo paso (todavía no podés reservar ni cobrar). No digas que ya quedó reservado.
- Respuestas cortas (1-4 oraciones).`;

let client: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function redactarRespuesta(input: {
  history: ChatTurn[];
  userText: string;
  intent: Intent;
  lugares: LugarDisponibilidad[];
}): Promise<string> {
  const datos = {
    fecha: input.intent.date,
    horaPedida: input.intent.time,
    lugares: input.lugares,
  };

  try {
    const completion = await getOpenAI().chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          ...input.history,
          { role: "user", content: input.userText },
          {
            role: "system",
            content: `DATOS_DISPONIBILIDAD (usá solo esto, no inventes): ${JSON.stringify(datos)}`,
          },
        ],
        temperature: 0.5,
        max_tokens: 350,
      },
      { timeout: 15_000, maxRetries: 1 },
    );

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      console.error("[reply] respuesta vacía del modelo");
      return FALLBACK;
    }
    return reply;
  } catch (err) {
    console.error("[reply] error redactando respuesta:", err instanceof Error ? err.message : err);
    return FALLBACK;
  }
}
