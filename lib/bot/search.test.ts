import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Capa de datos mockeada. getDb resuelve dos queries:
// - resolverSportId: `select({ id }).from(sports)…` → select CON columnas.
// - clubs: `select().from(clubs)…` → select SIN columnas.
// from() es awaitable (path sin .where(), cuando no hay BOT_CITY) y además
// expone .where() (path con filtro de ciudad). Contamos lookups de sport.
const state = vi.hoisted(() => ({
  clubs: [] as unknown[],
  sports: [] as unknown[],
  sportLookups: 0,
  ilikePatterns: [] as string[],
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: (cols?: unknown) => {
      const isSport = cols !== undefined;
      if (isSport) state.sportLookups++;
      const rows = isSport ? state.sports : state.clubs;
      return {
        from: () => Object.assign(Promise.resolve(rows), { where: () => Promise.resolve(rows) }),
      };
    },
  }),
}));

// Capturamos los patrones que recibe ilike (para verificar el filtro de ciudad).
vi.mock("drizzle-orm", async (orig) => {
  const actual = await orig<typeof import("drizzle-orm")>();
  return {
    ...actual,
    ilike: (col: unknown, pattern: string) => {
      state.ilikePatterns.push(pattern);
      return actual.ilike(col as never, pattern);
    },
  };
});

const getClubAvailability = vi.fn();
vi.mock("@/lib/bookings/availability", () => ({
  getClubAvailability: (...a: unknown[]) => getClubAvailability(...a),
}));

import { interpretarFranja, buscarDisponibilidad } from "@/lib/bot/search";
import type { Intent } from "@/lib/bot/intent";

const intent = (over: Partial<Intent> = {}): Intent => ({
  date: "2026-06-27",
  time: null,
  zone: null,
  sport: "padel",
  ...over,
});

// Patrón de ciudad (los de ciudad usan `%...%`; el de sport es el slug pelado).
const cityPatterns = () => state.ilikePatterns.filter((p) => p.includes("%"));

describe("interpretarFranja", () => {
  it("'a la tarde' → franja desde las 16:00 (no hora exacta)", () => {
    expect(interpretarFranja("quiero a la tarde", intent({ time: null }))).toEqual({ start: "16:00", end: null });
  });
  it("'a la noche' → desde las 20:00", () => {
    expect(interpretarFranja("a la noche", intent({ time: null }))).toEqual({ start: "20:00", end: null });
  });
  it("'a la mañana' → hasta las 13:00", () => {
    expect(interpretarFranja("dale a la mañana", intent({ time: null }))).toEqual({ start: null, end: "13:00" });
  });
  it("hora exacta → todo el día (ofrecemos lo más cercano)", () => {
    expect(interpretarFranja("a las 18", intent({ time: "18:00" }))).toEqual({ start: null, end: null });
  });
  it("sin referencia horaria → todo el día", () => {
    expect(interpretarFranja("el sábado", intent({ time: null }))).toEqual({ start: null, end: null });
  });
});

describe("buscarDisponibilidad", () => {
  beforeEach(() => {
    getClubAvailability.mockReset();
    getClubAvailability.mockResolvedValue({ window: {}, slots: [] });
    state.sportLookups = 0;
    state.ilikePatterns = [];
    state.sports = [{ id: "sport-padel" }];
    state.clubs = [
      { id: "pc", name: "Pádel Central", neighborhood: "Belgrano", city: "Buenos Aires" },
      { id: "c2", name: "La Bombonera", neighborhood: null, city: "Rosario" },
    ];
    delete process.env.BOT_CITY;
  });
  afterEach(() => {
    delete process.env.BOT_CITY;
  });

  it("sin BOT_CITY → busca en TODOS los clubs (incluye Pádel Central de Buenos Aires)", async () => {
    getClubAvailability.mockImplementation(async (clubId: string) =>
      clubId === "pc"
        ? { window: {}, slots: [{ start: "20:00", end: "21:30", freeCourts: [{ id: "x", name: "Cancha 1" }], totalCourts: 1 }] }
        : { window: {}, slots: [] },
    );

    const res = await buscarDisponibilidad(intent(), "mañana sábado en cualquier lugar");

    // No se aplicó ningún filtro de ciudad.
    expect(cityPatterns()).toEqual([]);
    // Se consultaron las dos canchas (todos los clubs).
    expect(getClubAvailability).toHaveBeenCalledTimes(2);
    // Pádel Central (Buenos Aires) aparece con su hueco real.
    expect(res).toEqual([
      { lugar: "Pádel Central", barrio: "Belgrano", slots: [{ start: "20:00", end: "21:30", canchas: ["Cancha 1"] }] },
    ]);
  });

  it("con BOT_CITY definida → filtra por esa ciudad (ilike)", async () => {
    process.env.BOT_CITY = "Rosario";

    await buscarDisponibilidad(intent(), "el sábado");

    expect(cityPatterns()).toContain("%Rosario%");
  });

  it("BOT_CITY con espacios → se usa trim", async () => {
    process.env.BOT_CITY = "  Funes  ";
    await buscarDisponibilidad(intent(), "el sábado");
    expect(cityPatterns()).toContain("%Funes%");
  });

  it("pasa el sportId resuelto y la franja a la búsqueda", async () => {
    await buscarDisponibilidad(intent({ time: null }), "a la tarde");
    expect(getClubAvailability).toHaveBeenCalledWith("pc", "2026-06-27", { start: "16:00", end: null, sportId: "sport-padel" });
  });

  it("agrupa por lugar y solo incluye lugares con turnos (datos reales)", async () => {
    getClubAvailability.mockImplementation(async (clubId: string) =>
      clubId === "pc"
        ? { window: {}, slots: [{ start: "17:00", end: "18:30", freeCourts: [{ id: "y", name: "Cancha 2" }], totalCourts: 1 }] }
        : { window: {}, slots: [] }, // c2 sin turnos → excluido
    );
    const res = await buscarDisponibilidad(intent(), "el sábado");
    expect(res).toHaveLength(1);
    expect(res[0].lugar).toBe("Pádel Central");
    expect(res[0].slots[0].canchas).toEqual(["Cancha 2"]);
  });

  it("un deporte inexistente → sin disponibilidad, sin crash y sin consultar canchas", async () => {
    state.sports = [];
    const res = await buscarDisponibilidad(intent({ sport: "curling" }), "el sábado");
    expect(res).toEqual([]);
    expect(getClubAvailability).not.toHaveBeenCalled();
  });

  it("resuelve el deporte UNA sola vez aunque haya varios clubs", async () => {
    await buscarDisponibilidad(intent(), "el sábado");
    expect(state.sportLookups).toBe(1);
    expect(getClubAvailability).toHaveBeenCalledTimes(2);
  });
});
