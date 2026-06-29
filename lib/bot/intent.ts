import OpenAI from "openai";
import { z } from "zod";
import type { ChatTurn } from "@/lib/bot/brain";

// Extracción de intención: convierte la conversación en datos estructurados
// { date, time, zone, club, sport }. Standalone y agnóstica al canal; todavía NO está
// cableada al flujo del bot (eso es Fase 5). Tolerante a fallos: ante error de
// API o salida inválida del modelo devuelve todos los campos en null (el bot
// repregunta). Esa tolerancia aplica a parseo conversacional, NO a reservas/pagos.

const MODEL = "gpt-4.1-mini";
const TIMEZONE = "America/Argentina/Buenos_Aires";

export const IntentSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD")
    .nullable(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "hora debe ser HH:MM 24h")
    .nullable(),
  zone: z.string().nullable(),
  club: z.string().nullable().default(null),
  sport: z.string().nullable(),
});

export type Intent = z.infer<typeof IntentSchema>;

const EMPTY: Intent = { date: null, time: null, zone: null, club: null, sport: null };

let client: OpenAI | null = null;
function getOpenAI(): OpenAI {
  // Mismo patrón que lib/bot/brain.ts: singleton lazy server-side, API key solo
  // en el entorno del servidor. (No se puede importar el de brain sin tocarlo.)
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// "Hoy" según la timezone del negocio, para resolver fechas relativas.
function formatReference(referenceDate: Date): { iso: string; human: string } {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
  const human = new Intl.DateTimeFormat("es-AR", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(referenceDate);
  return { iso, human };
}

function buildSystemPrompt(referenceDate: Date): string {
  const { iso, human } = formatReference(referenceDate);
  return `Sos un extractor de intención para reservas de canchas. Leé TODA la conversación y consolidá lo que el usuario fue diciendo en distintos mensajes (el día puede estar en un mensaje, la hora en otro, la zona en otro).

Hoy es ${human} (${iso}). Zona horaria: ${TIMEZONE}.

Devolvé EXCLUSIVAMENTE un objeto JSON (sin texto adicional, sin markdown) con estas claves:
- "date": la fecha pedida en formato YYYY-MM-DD. Resolvé referencias relativas ("hoy", "mañana", "el sábado", "el próximo viernes") a fecha absoluta usando la fecha de hoy de arriba. Si el usuario no mencionó día, null.
- "time": la hora en formato HH:MM de 24 horas. Normalizá ("8 pm" → "20:00", "18hs" → "18:00", "8 y media" → "08:30"). Si no mencionó hora, null.
- "zone": la zona, barrio o ciudad mencionada, tal cual la dijo el usuario. Si no mencionó, null.
- "club": el lugar/club/cancha comercial específico mencionado por el usuario (ej. "Pádel Central", "cancha de test"). Si el usuario pide "solo en X", "en X", "me gusta X" o "qué hay en X", poné X acá. Si no mencionó un club concreto, null.
- "sport": el deporte. Hoy solo existe "padel"; si no se menciona otro, usá "padel".

Reglas: NO inventes valores. No confundas club con barrio: "Belgrano"/"Centro" suelen ser zone; "Pádel Central"/"La Esquina Pádel" suelen ser club. Si un dato no aparece en la conversación, poné null (excepto sport, que por defecto es "padel"). Respondé solo el JSON.`;
}

export async function extraerIntencion(
  history: ChatTurn[],
  referenceDate: Date,
): Promise<Intent> {
  try {
    const completion = await getOpenAI().chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt(referenceDate) },
          ...history,
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      },
      { timeout: 15_000, maxRetries: 1 },
    );

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      console.error("[intent] respuesta vacía del modelo");
      return { ...EMPTY };
    }

    // Strings vacíos → null antes de validar (algunos modelos devuelven "" en
    // vez de null para campos ausentes).
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const k of ["date", "time", "zone", "club", "sport"]) {
      if (obj[k] === "") obj[k] = null;
    }

    const parsed = IntentSchema.safeParse(obj);
    if (!parsed.success) {
      console.error("[intent] salida inválida del modelo:", parsed.error.message);
      return { ...EMPTY };
    }

    // sport default "padel" (único deporte hoy); el resto queda como vino.
    return { ...parsed.data, sport: parsed.data.sport ?? "padel" };
  } catch (err) {
    console.error(
      "[intent] error extrayendo intención:",
      err instanceof Error ? err.message : err,
    );
    return { ...EMPTY };
  }
}
