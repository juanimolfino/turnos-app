import { describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { extraerAccionReserva } from "@/lib/bot/extraer-reserva";
import type { LugarDisponibilidad } from "@/lib/bot/search";

const lugares: LugarDisponibilidad[] = [
  { clubId: "cl1", lugar: "Pádel Central", barrio: "Centro", slots: [{ start: "19:00", end: "20:30", canchas: [{ id: "ct1", name: "Cancha 1" }] }] },
];
const modelReturns = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
const history = [{ role: "user" as const, content: "dale, a nombre de Juan Pérez" }];

describe("extraerAccionReserva", () => {
  it("sin opciones ofrecidas → 'ninguna' (ni llama al modelo)", async () => {
    create.mockClear();
    const accion = await extraerAccionReserva(history, []);
    expect(accion.tipo).toBe("ninguna");
    expect(create).not.toHaveBeenCalled();
  });

  it("eligió turno + nombre → 'reservar'", async () => {
    create.mockImplementation(async () =>
      modelReturns({ tipo: "reservar", lugar: "Pádel Central", hora: "19:00", cancha: null, nombre: "Juan Pérez", telefono: "2314 555555" }),
    );
    const accion = await extraerAccionReserva(history, lugares);
    expect(accion).toEqual({
      tipo: "reservar",
      lugar: "Pádel Central",
      hora: "19:00",
      cancha: null,
      nombre: "Juan Pérez",
      telefono: "2314 555555",
    });
  });

  it("'reservar' sin nombre se degrada a 'elegir'", async () => {
    create.mockImplementation(async () =>
      modelReturns({ tipo: "reservar", lugar: "Pádel Central", hora: "19:00", cancha: null, nombre: null, telefono: "2314 555555" }),
    );
    const accion = await extraerAccionReserva(history, lugares);
    expect(accion.tipo).toBe("elegir");
  });

  it("salida inválida del modelo → 'ninguna', sin crashear", async () => {
    create.mockImplementation(async () => ({ choices: [{ message: { content: "no soy json" } }] }));
    const accion = await extraerAccionReserva(history, lugares);
    expect(accion.tipo).toBe("ninguna");
  });

  it("error de la API → 'ninguna', sin crashear", async () => {
    create.mockImplementation(async () => {
      throw new Error("rate limit");
    });
    const accion = await extraerAccionReserva(history, lugares);
    expect(accion.tipo).toBe("ninguna");
  });
});
