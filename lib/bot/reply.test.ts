import { describe, expect, it } from "vitest";

import { formatearDisponibilidadTexto, redactarRespuesta, horariosPermitidos, horariosInventados } from "@/lib/bot/reply";
import type { Intent } from "@/lib/bot/intent";
import type { LugarDisponibilidad } from "@/lib/bot/search";

const intent: Intent = { date: "2026-06-27", time: "18:00", zone: "Bolívar", sport: "padel" };

describe("redactarRespuesta", () => {
  it("enumera todos los horarios recibidos, incluso más de 8 en el mismo lugar", async () => {
    const lugares: LugarDisponibilidad[] = [
      {
        clubId: "pc",
        lugar: "Pádel Central",
        barrio: "Belgrano",
        slots: [
          { start: "08:00", end: "09:30", canchas: [{ id: "c2", name: "Cancha 2" }] },
          { start: "09:30", end: "11:00", canchas: [{ id: "c2", name: "Cancha 2" }] },
          { start: "11:00", end: "12:30", canchas: [{ id: "c2", name: "Cancha 2" }] },
          { start: "12:30", end: "14:00", canchas: [{ id: "c2", name: "Cancha 2" }] },
          { start: "14:00", end: "15:30", canchas: [{ id: "c2", name: "Cancha 2" }] },
          {
            start: "16:00",
            end: "17:30",
            canchas: [
              { id: "c1", name: "Cancha 1" },
              { id: "c2", name: "Cancha 2" },
            ],
          },
          {
            start: "17:30",
            end: "19:00",
            canchas: [
              { id: "c1", name: "Cancha 1" },
              { id: "c2", name: "Cancha 2" },
            ],
          },
          {
            start: "19:00",
            end: "20:30",
            canchas: [
              { id: "c1", name: "Cancha 1" },
              { id: "c2", name: "Cancha 2" },
            ],
          },
          {
            start: "20:30",
            end: "22:00",
            canchas: [
              { id: "c1", name: "Cancha 1" },
              { id: "c2", name: "Cancha 2" },
            ],
          },
          { start: "22:00", end: "23:30", canchas: [{ id: "c1", name: "Cancha 1" }] },
        ],
      },
    ];

    const out = await redactarRespuesta({ history: [], userText: "para hoy", intent, lugares });

    expect(out).toContain("En Pádel Central, Belgrano:");
    for (const hora of ["08:00", "09:30", "11:00", "12:30", "14:00", "16:00", "17:30", "19:00", "20:30", "22:00"]) {
      expect(out).toContain(hora);
    }
    expect(out).toContain("Cancha 1 y Cancha 2 a las 16:00, 17:30, 19:00 y 20:30.");
  });
});

describe("formatearDisponibilidadTexto", () => {
  it("con lugares vacíos devuelve un no encontrado claro", () => {
    const out = formatearDisponibilidadTexto(intent, []);
    expect(out).toMatch(/no encontré turnos disponibles/i);
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
    const out = await redactarRespuesta({ history: [], userText: "el sábado", intent: { ...intent, time: null }, lugares: setLugares });

    expect(horariosInventados(out, setLugares, null)).toEqual([]); // ningún horario fuera de los datos
  });
});
