import { describe, expect, it, vi } from "vitest";

// Mock del SDK de OpenAI. Cada test setea su mockImplementation (sin mockReset en
// beforeEach: combinado con un throw dispara un falso unhandled rejection).
const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { redactarRespuesta } from "@/lib/bot/reply";
import type { Intent } from "@/lib/bot/intent";

const intent: Intent = { date: "2026-06-27", time: "18:00", zone: "Bolívar", sport: "padel" };
const lugares = [{ lugar: "El Corralón", barrio: "Centro", slots: [{ start: "16:30", end: "18:00", canchas: ["Cancha 1"] }] }];

const modelReturns = (content: string) => ({ choices: [{ message: { content } }] });

describe("redactarRespuesta", () => {
  it("devuelve el texto del modelo y le pasa los datos reales (no inventa)", async () => {
    create.mockImplementation(async () => modelReturns("En El Corralón hay a las 16:30."));
    const out = await redactarRespuesta({ history: [], userText: "el sábado a las 18", intent, lugares });

    expect(out).toBe("En El Corralón hay a las 16:30.");

    const messages = create.mock.calls.at(-1)![0].messages;
    const datosMsg = messages.at(-1); // los DATOS_DISPONIBILIDAD van como último mensaje
    expect(datosMsg.content).toContain("DATOS_DISPONIBILIDAD");
    expect(datosMsg.content).toContain("El Corralón");
    expect(datosMsg.content).toContain("16:30");
    // el mensaje del usuario también viaja
    expect(messages.some((m: { content: string }) => m.content === "el sábado a las 18")).toBe(true);
  });

  it("con lugares vacíos pasa la lista vacía (para el 'no hay')", async () => {
    create.mockImplementation(async () => modelReturns("No hay nada ese día, ¿otro?"));
    await redactarRespuesta({ history: [], userText: "el sábado", intent: { ...intent, time: null }, lugares: [] });

    const datosMsg = create.mock.calls.at(-1)![0].messages.at(-1);
    expect(datosMsg.content).toContain('"lugares":[]');
  });

  it("ante error de la API devuelve un fallback sin crashear", async () => {
    create.mockImplementation(async () => {
      throw new Error("rate limit");
    });
    const out = await redactarRespuesta({ history: [], userText: "x", intent, lugares });
    expect(out).toMatch(/no pude armar la búsqueda/i);
  });
});
