import OpenAI from "openai";
import { z } from "zod";
import type { ChatTurn } from "@/lib/bot/brain";
import type { LugarDisponibilidad } from "@/lib/bot/search";

// Decide, sobre la conversación y las opciones ofrecidas, qué quiere hacer el
// usuario respecto de RESERVAR. Agnóstico al canal. Tolerante: ante error o
// salida inválida → { tipo: "ninguna" } (el bot sigue buscando/charlando).

const MODEL = "gpt-4.1-mini";

const AccionSchema = z.object({
  // "ninguna" = sigue explorando; "elegir" = eligió un turno pero falta el nombre;
  // "reservar" = eligió un turno Y dio nombre y apellido.
  tipo: z.enum(["ninguna", "elegir", "reservar"]),
  lugar: z.string().nullable(),
  hora: z.string().nullable(), // HH:MM del turno elegido
  cancha: z.string().nullable(),
  nombre: z.string().nullable(), // nombre y apellido del cliente
});

export type AccionReserva = z.infer<typeof AccionSchema>;

const NINGUNA: AccionReserva = { tipo: "ninguna", lugar: null, hora: null, cancha: null, nombre: null };

let client: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function buildSystem(lugares: LugarDisponibilidad[]): string {
  // Solo nombres/horarios al modelo (no ids).
  const opciones = lugares.map((l) => ({
    lugar: l.lugar,
    turnos: l.slots.map((s) => ({ hora: s.start, canchas: s.canchas.map((c) => c.name) })),
  }));
  return `Sos el asistente de reservas de pádel. Te paso OPCIONES (los turnos que se le ofrecieron al usuario) y la conversación. Determiná qué quiere hacer AHORA con la reserva y devolvé SOLO un JSON.

OPCIONES = ${JSON.stringify(opciones)}

Claves del JSON:
- "tipo": "reservar" si el usuario ELIGIÓ un turno Y ya dio su nombre y apellido; "elegir" si eligió un turno pero todavía NO dio el nombre; "ninguna" si sigue explorando, preguntando o no eligió nada concreto.
- "lugar": el lugar del turno elegido (tal como figura en OPCIONES), o null.
- "hora": la hora de inicio del turno elegido en formato HH:MM (debe ser una de las de OPCIONES), o null.
- "cancha": la cancha elegida si la mencionó, o null.
- "nombre": el nombre y apellido que dio el usuario para la reserva, o null.

Reglas: el turno elegido debe corresponder a una opción real de OPCIONES (no inventes lugar/hora). Si el usuario solo dice un nombre después de que se le pidió, y ya había un turno en juego, marcá "reservar" con ese nombre y el turno del contexto. Respondé solo el JSON.`;
}

export async function extraerAccionReserva(
  history: ChatTurn[],
  lugares: LugarDisponibilidad[],
): Promise<AccionReserva> {
  // Sin opciones ofrecidas no hay nada que reservar.
  if (lugares.length === 0) return { ...NINGUNA };

  try {
    const completion = await getOpenAI().chat.completions.create(
      {
        model: MODEL,
        messages: [{ role: "system", content: buildSystem(lugares) }, ...history],
        temperature: 0,
        response_format: { type: "json_object" },
      },
      { timeout: 15_000, maxRetries: 1 },
    );

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return { ...NINGUNA };
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const k of ["lugar", "hora", "cancha", "nombre"]) if (obj[k] === "") obj[k] = null;
    const parsed = AccionSchema.safeParse(obj);
    if (!parsed.success) {
      console.error("[reserva] acción inválida:", parsed.error.message);
      return { ...NINGUNA };
    }
    // "reservar" sin nombre no tiene sentido → lo bajamos a "elegir".
    if (parsed.data.tipo === "reservar" && !parsed.data.nombre) {
      return { ...parsed.data, tipo: "elegir" };
    }
    return parsed.data;
  } catch (err) {
    console.error("[reserva] error extrayendo acción:", err instanceof Error ? err.message : err);
    return { ...NINGUNA };
  }
}
