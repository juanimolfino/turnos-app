import OpenAI from "openai";

// Cerebro del bot: entra texto del usuario, sale texto de respuesta. Es
// agnóstico al canal (no conoce Telegram/WhatsApp) y nunca propaga excepciones:
// ante cualquier error de la API devuelve un fallback amable.

// Modelo de chat actual y rápido (verificado contra los modelos disponibles en
// la cuenta). Mini = baja latencia y costo, ideal para respuestas cortas.
// Para subir de calidad se puede cambiar por "gpt-5-mini".
const MODEL = "gpt-4.1-mini";

export const SYSTEM_PROMPT = `Sos el asistente de reservas de un sistema de canchas de pádel. Hablás en español rioplatense (voseo), con un tono corto, amable y natural.

Por ahora SOLO conversás: tu objetivo es entender qué quiere la persona para reservar, preguntando de a poco por el día, el horario y la zona o barrio.

Todavía NO podés reservar ni cobrar. Si te lo piden, aclará con simpatía que en breve vas a poder hacerlo, y mientras tanto seguí ayudando a ordenar lo que necesita (día, horario, zona).

No inventes canchas, precios ni disponibilidad. Mantené las respuestas breves (1-3 oraciones).`;

const FALLBACK =
  "Uy, estoy teniendo un problemita para responder en este momento. ¿Probás de nuevo en un ratito? 🙏";

// Un turno de la conversación. El cerebro recibe el historial ya armado; no sabe
// de dónde sale (DB, canal, etc.).
export type ChatTurn = { role: "user" | "assistant"; content: string };

let client: OpenAI | null = null;
function getOpenAI(): OpenAI {
  // Singleton lazy server-side. La API key vive solo en el entorno del servidor.
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// history default vacío: preserva el comportamiento (y los tests) de fases previas.
export async function generarRespuesta(text: string, history: ChatTurn[] = []): Promise<string> {
  try {
    const completion = await getOpenAI().chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: text },
        ],
        temperature: 0.6,
        max_tokens: 300,
      },
      { timeout: 15_000, maxRetries: 1 },
    );

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      console.error("[brain] respuesta vacía de la API de OpenAI");
      return FALLBACK;
    }
    return reply;
  } catch (err) {
    // No propagamos: el webhook debe poder responder igual (y devolver 200).
    console.error(
      "[brain] error generando respuesta:",
      err instanceof Error ? err.message : err,
    );
    return FALLBACK;
  }
}
