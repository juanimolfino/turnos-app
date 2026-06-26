import { describe, expect, it, vi, beforeEach } from "vitest";

// Capa de datos mockeada: getDb (clubs por ciudad) y getClubAvailability.
const state = vi.hoisted(() => ({ clubs: [] as unknown[] }));
vi.mock("@/lib/db", () => ({
  getDb: () => ({ select: () => ({ from: () => ({ where: () => Promise.resolve(state.clubs) }) }) }),
}));

const getClubAvailability = vi.fn();
vi.mock("@/lib/bookings/availability", () => ({
  getClubAvailability: (...a: unknown[]) => getClubAvailability(...a),
}));

import { interpretarFranja, buscarDisponibilidad, CITY } from "@/lib/bot/search";
import type { Intent } from "@/lib/bot/intent";

const intent = (over: Partial<Intent> = {}): Intent => ({
  date: "2026-06-27",
  time: null,
  zone: "Bolívar",
  sport: "padel",
  ...over,
});

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
    state.clubs = [
      { id: "c1", name: "El Corralón", neighborhood: "Centro", city: "Bolívar" },
      { id: "c2", name: "La Bombonera", neighborhood: null, city: "Bolívar" },
    ];
  });

  it("filtra Bolívar, agrupa por lugar y solo incluye lugares con turnos", async () => {
    getClubAvailability.mockImplementation(async (clubId: string) =>
      clubId === "c1"
        ? { window: {}, slots: [{ start: "16:30", end: "18:00", freeCourts: [{ id: "x", name: "Cancha 1" }], totalCourts: 2 }] }
        : { window: {}, slots: [] }, // c2 sin turnos → se excluye
    );

    const res = await buscarDisponibilidad(intent({ time: "18:00" }), "el sábado a las 18");

    expect(CITY).toBe("Bolívar");
    expect(res).toEqual([
      { lugar: "El Corralón", barrio: "Centro", slots: [{ start: "16:30", end: "18:00", canchas: ["Cancha 1"] }] },
    ]);
    // hora exacta → ventana de todo el día
    expect(getClubAvailability).toHaveBeenCalledWith("c1", "2026-06-27", { start: null, end: null });
  });

  it("pasa la franja 'tarde' (start 16:00) a la búsqueda", async () => {
    getClubAvailability.mockResolvedValue({ window: {}, slots: [] });

    await buscarDisponibilidad(intent({ time: null }), "a la tarde");

    expect(getClubAvailability).toHaveBeenCalledWith("c1", "2026-06-27", { start: "16:00", end: null });
  });

  it("solo expone datos reales (nombres de cancha de la búsqueda)", async () => {
    getClubAvailability.mockImplementation(async (clubId: string) =>
      clubId === "c1"
        ? { window: {}, slots: [{ start: "17:00", end: "18:30", freeCourts: [{ id: "y", name: "Cancha 2" }], totalCourts: 1 }] }
        : { window: {}, slots: [] },
    );

    const res = await buscarDisponibilidad(intent(), "el sábado");
    expect(res[0].slots[0].canchas).toEqual(["Cancha 2"]);
  });
});
