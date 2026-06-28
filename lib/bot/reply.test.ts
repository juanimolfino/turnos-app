import { describe, expect, it, vi } from "vitest";

// Mock del SDK de OpenAI. Cada test setea su mockImplementation (sin mockReset en
// beforeEach: combinado con un throw dispara un falso unhandled rejection).
const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { redactarRespuesta, horariosPermitidos, horariosInventados } from "@/lib/bot/reply";
import type { Intent } from "@/lib/bot/intent";

const intent: Intent = { date: "2026-06-27", time: "18:00", zone: "Bolívar", sport: "padel" };
const lugares = [{ clubId: "cl1", lugar: "El Corralón", barrio: "Centro", slots: [{ start: "16:30", end: "18:00", canchas: [{ id: "ct1", name: "Cancha 1" }] }] }];

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

  it("el system prompt refuerza enumerar turnos concretos y prohíbe inventar", async () => {
    create.mockImplementation(async () => modelReturns("ok"));
    await redactarRespuesta({ history: [], userText: "el sábado", intent, lugares });

    const system = create.mock.calls.at(-1)![0].messages[0].content as string;
    expect(system).toMatch(/PROHIBIDO/);
    expect(system).toMatch(/ENUMER/i); // enumerar turnos concretos
    expect(system).toMatch(/rango/i); // prohíbe el rango difuso
    expect(system).toMatch(/EXACTAMENTE/);
  });

  it("el prompt cierra honesto: no ofrecer 'más' del mismo día, ofrecer OTRO día", async () => {
    create.mockImplementation(async () => modelReturns("ok"));
    await redactarRespuesta({ history: [], userText: "el sábado", intent, lugares });

    const system = create.mock.calls.at(-1)![0].messages[0].content as string;
    // No prometer opciones inexistentes; "más" solo si quedan turnos sin nombrar.
    expect(system).toMatch(/NUNCA prometas opciones que no están/i);
    expect(system).toMatch(/SOLO es válido si quedan turnos/i);
    // Cuando ya mostró todos: ofrecer otro día (acción real).
    expect(system).toMatch(/OTRO día/);
    expect(system).toMatch(/no repitas la misma lista/i);
  });

  it("a los datos les marca que son TODOS los turnos del día", async () => {
    create.mockImplementation(async () => modelReturns("ok"));
    await redactarRespuesta({ history: [], userText: "el sábado", intent, lugares });

    const datosMsg = create.mock.calls.at(-1)![0].messages.at(-1).content as string;
    expect(datosMsg).toContain('"sonTodosLosTurnosDelDia":true');
  });
});

// Set de slots concretos para los tests del validador.
const setLugares = [
  { clubId: "cl1", lugar: "Pádel Central", barrio: "Belgrano", slots: [
    { start: "16:30", end: "18:00", canchas: [{ id: "a", name: "Cancha 2" }] },
    { start: "20:00", end: "21:30", canchas: [{ id: "b", name: "Cancha 1" }] },
  ] },
];

describe("horariosPermitidos", () => {
  it("incluye start/end de cada slot y la hora pedida", () => {
    const set = horariosPermitidos(setLugares, "18:00");
    expect([...set].sort()).toEqual(["16:30", "18:00", "20:00", "21:30"]);
  });

  it("sin hora pedida, solo los horarios de los slots", () => {
    const set = horariosPermitidos(setLugares, null);
    expect([...set].sort()).toEqual(["16:30", "18:00", "20:00", "21:30"]);
  });
});

describe("horariosInventados", () => {
  it("una respuesta que solo usa horarios del set → no detecta inventados", () => {
    const texto = "En Pádel Central, Cancha 2 hay 16:30 y en Cancha 1 a las 20:00. ¿Te sirve alguno?";
    expect(horariosInventados(texto, setLugares, null)).toEqual([]);
  });

  it("detecta un horario que NO está en los datos (ej. 17:00 inventado)", () => {
    const texto = "Hay turnos a las 16:30, 17:00 y 20:00.";
    expect(horariosInventados(texto, setLugares, null)).toEqual(["17:00"]);
  });

  it("permite mencionar la hora pedida aunque no sea un slot (para el 'no hay a esa hora')", () => {
    const texto = "A las 18:00 no hay, pero tenés 16:30 y 20:00.";
    expect(horariosInventados(texto, setLugares, "18:00")).toEqual([]);
  });

  it("la respuesta del bot menciona solo horarios presentes en el set", async () => {
    // Respuesta realista: enumera turnos concretos del set, sin inventar.
    create.mockImplementation(async () =>
      modelReturns("En Pádel Central: Cancha 2 a las 16:30 y Cancha 1 a las 20:00. ¿Querés alguno?"),
    );
    const out = await redactarRespuesta({ history: [], userText: "el sábado", intent: { ...intent, time: null }, lugares: setLugares });

    expect(horariosInventados(out, setLugares, null)).toEqual([]); // ningún horario fuera de los datos
  });
});
