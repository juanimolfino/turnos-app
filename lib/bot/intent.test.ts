import { describe, expect, it, vi } from "vitest";
import type { ChatTurn } from "@/lib/bot/brain";

// Mockeamos el SDK de OpenAI: nunca pegamos a la API real.
// Cada test setea su propia mockImplementation (evitamos mockReset en beforeEach:
// combinado con un throw dispara un falso "unhandled rejection" en vitest).
const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { extraerIntencion, IntentSchema } from "@/lib/bot/intent";

// Jueves 25/06/2026 (mediodía BA). mañana = viernes 26; el sábado = 27.
const REF = new Date("2026-06-25T12:00:00-03:00");

const EMPTY = { date: null, time: null, zone: null, club: null, sport: null };

const modelReturns = (obj: unknown) => ({
  choices: [{ message: { content: JSON.stringify(obj) } }],
});

function lastSystemPrompt(): string {
  return create.mock.calls.at(-1)![0].messages[0].content;
}

describe("extraerIntencion", () => {
  it("consolida día, hora y zona dichos en mensajes distintos", async () => {
    create.mockImplementation(async () =>
      modelReturns({ date: "2026-06-27", time: "18:00", zone: "Bolívar", club: null, sport: "padel" }),
    );
    const history: ChatTurn[] = [
      { role: "user", content: "quiero una cancha el sábado" },
      { role: "assistant", content: "¿a qué hora?" },
      { role: "user", content: "a las 18hs" },
      { role: "assistant", content: "¿en qué zona?" },
      { role: "user", content: "por Bolívar" },
    ];

    const intent = await extraerIntencion(history, REF);
    expect(intent).toEqual({
      date: "2026-06-27",
      time: "18:00",
      zone: "Bolívar",
      club: null,
      sport: "padel",
    });

    // La conversación completa se manda al modelo (system + todos los turnos).
    const messages = create.mock.calls.at(-1)![0].messages;
    expect(messages).toHaveLength(history.length + 1);
    expect(messages.slice(1)).toEqual(history);
  });

  it("ancla 'hoy' al referenceDate en la timezone del negocio", async () => {
    create.mockImplementation(async () => modelReturns({ ...EMPTY }));
    await extraerIntencion([{ role: "user", content: "hola" }], REF);

    const prompt = lastSystemPrompt();
    expect(prompt).toContain("2026-06-25"); // iso de hoy
    expect(prompt.toLowerCase()).toContain("jueves"); // día de semana
    expect(prompt).toContain("America/Argentina/Buenos_Aires");
  });

  it("'mañana' resuelve al día siguiente del referenceDate", async () => {
    create.mockImplementation(async () =>
      modelReturns({ date: "2026-06-26", time: null, zone: null, club: null, sport: "padel" }),
    );
    const intent = await extraerIntencion([{ role: "user", content: "mañana" }], REF);
    expect(intent.date).toBe("2026-06-26"); // viernes 26
  });

  it("'el sábado' resuelve al sábado correcto", async () => {
    create.mockImplementation(async () =>
      modelReturns({ date: "2026-06-27", time: null, zone: null, club: null, sport: "padel" }),
    );
    const intent = await extraerIntencion([{ role: "user", content: "el sábado" }], REF);
    expect(intent.date).toBe("2026-06-27"); // sábado 27
  });

  it("normaliza la hora a HH:MM 24h ('8 pm' → '20:00')", async () => {
    create.mockImplementation(async () =>
      modelReturns({ date: null, time: "20:00", zone: null, club: null, sport: "padel" }),
    );
    const intent = await extraerIntencion([{ role: "user", content: "a las 8 pm" }], REF);
    expect(intent.time).toBe("20:00");
  });

  it("campos no mencionados → null (y sport default 'padel')", async () => {
    create.mockImplementation(async () =>
      modelReturns({ date: null, time: null, zone: null, club: null, sport: null }),
    );
    const intent = await extraerIntencion([{ role: "user", content: "hola" }], REF);
    expect(intent).toEqual({ date: null, time: null, zone: null, club: null, sport: "padel" });
  });

  it("trata strings vacíos del modelo como null", async () => {
    create.mockImplementation(async () =>
      modelReturns({ date: "", time: "", zone: "", club: "", sport: "" }),
    );
    const intent = await extraerIntencion([{ role: "user", content: "hola" }], REF);
    expect(intent).toEqual({ date: null, time: null, zone: null, club: null, sport: "padel" });
  });

  it("extrae un club concreto separado de la zona", async () => {
    create.mockImplementation(async () =>
      modelReturns({ date: "2026-06-27", time: null, zone: null, club: "Pádel Central", sport: "padel" }),
    );

    const intent = await extraerIntencion([{ role: "user", content: "qué hay en Pádel Central el sábado" }], REF);

    expect(intent).toEqual({
      date: "2026-06-27",
      time: null,
      zone: null,
      club: "Pádel Central",
      sport: "padel",
    });
  });

  it("salida con formato inválido → todos null, sin crashear", async () => {
    create.mockImplementation(async () =>
      modelReturns({ date: "mañana", time: "8pm", zone: "Bolívar", club: null, sport: "padel" }),
    );
    const intent = await extraerIntencion([{ role: "user", content: "x" }], REF);
    expect(intent).toEqual({ date: null, time: null, zone: null, club: null, sport: null });
  });

  it("JSON no parseable → todos null, sin crashear", async () => {
    create.mockImplementation(async () => ({
      choices: [{ message: { content: "no soy json" } }],
    }));
    const intent = await extraerIntencion([{ role: "user", content: "x" }], REF);
    expect(intent).toEqual({ date: null, time: null, zone: null, club: null, sport: null });
  });

  it("error de la API → todos null, sin crashear", async () => {
    create.mockImplementation(async () => {
      throw new Error("rate limit");
    });
    const intent = await extraerIntencion([{ role: "user", content: "x" }], REF);
    expect(intent).toEqual({ date: null, time: null, zone: null, club: null, sport: null });
  });

  it("IntentSchema acepta nulls y rechaza formatos malos", () => {
    expect(IntentSchema.safeParse({ date: null, time: null, zone: null, club: null, sport: null }).success).toBe(true);
    expect(IntentSchema.safeParse({ date: "2026-06-27", time: "18:00", zone: "Bolívar", club: "Pádel Central", sport: "padel" }).success).toBe(true);
    expect(IntentSchema.safeParse({ date: "2026-06-27", time: "18:00", zone: "Bolívar", sport: "padel" }).success).toBe(true);
    expect(IntentSchema.safeParse({ date: "27/06", time: null, zone: null, club: null, sport: null }).success).toBe(false);
    expect(IntentSchema.safeParse({ date: null, time: "25:00", zone: null, club: null, sport: null }).success).toBe(false);
  });
});
