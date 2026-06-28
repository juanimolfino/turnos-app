import OpenAI from "openai";
import type { ChatTurn } from "@/lib/bot/brain";
import type { Intent } from "@/lib/bot/intent";
import type { LugarDisponibilidad } from "@/lib/bot/search";

// Redacción de la respuesta de disponibilidad. La IA SOLO expresa los hechos que
// le pasamos (lugares y horarios reales); enumera turnos concretos, nunca un
// rango parafraseado, y tiene prohibido inventar horarios que no estén en los
// datos. Agnóstico al canal. Tolerante a fallos: ante error, fallback amable.

const MODEL = "gpt-4.1-mini";

const FALLBACK =
  "Perdoná, no pude armar la búsqueda en este momento. ¿Probamos de nuevo en un ratito?";

const SYSTEM = `Sos el asistente de pádel del pueblo. Hablás en español rioplatense (voseo), cálido y breve.

Te paso DATOS_DISPONIBILIDAD: los lugares con sus horarios libres REALES del día. Esos son TODOS los turnos disponibles de ese día (la búsqueda ya trae el día completo): NO hay más turnos ocultos. Reglas ESTRICTAS:
- Solo podés nombrar horarios que estén EXACTAMENTE en DATOS_DISPONIBILIDAD. Está PROHIBIDO inventar, redondear o interpolar un horario que no esté en la lista. Si "17:00" no figura entre los slots, NO lo ofrezcas.
- Al ofrecer disponibilidad, ENUMERÁ los turnos concretos (las horas de inicio reales), agrupados por lugar y, si suma, por cancha. Ej: "En Pádel Central, Cancha 2: 17:00 y 18:30". PROHIBIDO resumir en un rango difuso tipo "de 8 a 20 hs en turnos de 1h30".
- Si hay muchos turnos, podés priorizar los más cercanos a lo que pidió el usuario. Pero ofrecer "te paso más" SOLO es válido si quedan turnos en DATOS_DISPONIBILIDAD que todavía NO nombraste. NUNCA prometas opciones que no están en los datos.
- Cuando ya enumeraste TODOS los turnos del día (o son pocos), NO ofrezcas "más opciones" del mismo día. Cerrá con honestidad: aclará que esos son todos los turnos de ese día y ofrecé buscar OTRO día u otro horario (eso sí es una acción real y distinta).
- Si el usuario igual pide "más" y ya mostraste todos, NO repitas la misma lista como si fueran nuevos: decí que esos son todos los de ese día y proponé cambiar de día.
- Si el usuario pidió una hora puntual que no está libre, decílo y ofrecé los horarios reales más cercanos de ese día (los de la lista, no uno inventado).
- Si la lista viene vacía, decí claro que no hay nada ese día y ofrecé buscar otro día.
- Si el usuario ELIGE una opción, confirmá lugar, cancha, día y hora (reales) y aclará con simpatía que la reserva se habilita en el próximo paso (todavía no podés reservar ni cobrar). No digas que ya quedó reservado.
- Respuestas cortas.`;

// ── Validación de horarios (anti-invención) ──────────────────────────────────
function normHora(t: string): string {
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

/** Horarios que el bot PUEDE nombrar: los start/end reales de cada slot, más la
 * hora que el usuario pidió (puede mencionarla para decir "a esa hora no hay"). */
export function horariosPermitidos(lugares: LugarDisponibilidad[], horaPedida: string | null): Set<string> {
  const set = new Set<string>();
  for (const lugar of lugares) {
    for (const s of lugar.slots) {
      set.add(normHora(s.start));
      set.add(normHora(s.end));
    }
  }
  if (horaPedida) set.add(normHora(horaPedida));
  return set;
}

/** Devuelve los horarios HH:MM que aparecen en el texto pero NO están permitidos
 * (inventados/interpolados por el modelo). Vacío = la respuesta solo usa datos reales. */
export function horariosInventados(text: string, lugares: LugarDisponibilidad[], horaPedida: string | null): string[] {
  const permitidos = horariosPermitidos(lugares, horaPedida);
  const encontrados = (text.match(/\b\d{1,2}:\d{2}\b/g) ?? []).map(normHora);
  return [...new Set(encontrados)].filter((t) => !permitidos.has(t));
}

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
  // Al modelo le pasamos solo lo humano (nombres de cancha, no ids).
  const datos = {
    fecha: input.intent.date,
    horaPedida: input.intent.time,
    // Señal explícita: estos son TODOS los turnos del día (no hay "más" para mostrar).
    sonTodosLosTurnosDelDia: true,
    lugares: input.lugares.map((l) => ({
      lugar: l.lugar,
      barrio: l.barrio,
      slots: l.slots.map((s) => ({ start: s.start, end: s.end, canchas: s.canchas.map((c) => c.name) })),
    })),
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
            content: `DATOS_DISPONIBILIDAD (usá solo esto; nombrá únicamente estos horarios, no inventes): ${JSON.stringify(datos)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 350,
      },
      { timeout: 15_000, maxRetries: 1 },
    );

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      console.error("[reply] respuesta vacía del modelo");
      return FALLBACK;
    }

    // Observabilidad: si el modelo nombró horarios fuera de los datos, lo dejamos
    // registrado server-side (no mutamos el texto para no romper el lenguaje natural).
    const inventados = horariosInventados(reply, input.lugares, input.intent.time);
    if (inventados.length) {
      console.warn(`[reply] el modelo mencionó horarios fuera de los datos: ${inventados.join(", ")}`);
    }

    return reply;
  } catch (err) {
    console.error("[reply] error redactando respuesta:", err instanceof Error ? err.message : err);
    return FALLBACK;
  }
}
