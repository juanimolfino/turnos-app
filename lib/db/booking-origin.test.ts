import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock de getDb: captura los values() de cada insert para verificar `origin`.
const state = vi.hoisted(() => ({ inserts: [] as Record<string, unknown>[] }));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        state.inserts.push(v);
        const p = Promise.resolve([{ ...v, id: "bk" }]);
        return Object.assign(p, { returning: () => Promise.resolve([{ ...v, id: "bk" }]) });
      },
    }),
    delete: () => ({ where: () => Promise.resolve() }),
  }),
}));

import { createBooking, createAgendaBlocks, normalizeEndTime } from "@/lib/db/queries";
import { computeAvailability } from "@/lib/bookings/availability";

describe("origin en creación de bookings", () => {
  beforeEach(() => {
    state.inserts = [];
  });

  it("createBooking (panel) setea origin='admin' por defecto", async () => {
    await createBooking({
      clubId: "club1", courtId: "court1", date: "2026-06-27",
      startTime: "18:00", endTime: "19:30", type: "simple",
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].origin).toBe("admin");
  });

  it("createBooking permite origin='bot' (lo usará la Fase 6)", async () => {
    await createBooking({
      clubId: "club1", courtId: "court1", date: "2026-06-27",
      startTime: "18:00", endTime: "19:30", type: "simple", origin: "bot",
    });
    expect(state.inserts[0].origin).toBe("bot");
  });

  it("createAgendaBlocks (panel) setea origin='admin'", async () => {
    await createAgendaBlocks({
      clubId: "club1", type: "clase", courtIds: ["court1"], dates: ["2026-06-27"],
      startTime: "08:00", endTime: "09:30",
    });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].origin).toBe("admin");
  });
});

describe("normalizeEndTime", () => {
  it("'24:00' (medianoche) → '23:59'", () => {
    expect(normalizeEndTime("24:00")).toBe("23:59");
  });
  it("no toca horas válidas", () => {
    expect(normalizeEndTime("23:00")).toBe("23:00");
    expect(normalizeEndTime("09:30")).toBe("09:30");
  });
});

describe("end_time='24:00' nunca se persiste", () => {
  beforeEach(() => { state.inserts = []; });

  it("createBooking que termina a medianoche guarda '23:59'", async () => {
    await createBooking({
      clubId: "c", courtId: "ct", date: "2026-06-27",
      startTime: "22:30", endTime: "24:00", type: "simple",
    });
    expect(state.inserts[0].endTime).toBe("23:59");
  });

  it("createAgendaBlocks hasta medianoche guarda '23:59'", async () => {
    await createAgendaBlocks({
      clubId: "c", type: "bloqueo", courtIds: ["ct"], dates: ["2026-06-27"],
      startTime: "20:00", endTime: "24:00",
    });
    expect(state.inserts[0].endTime).toBe("23:59");
  });
});

describe("overlap con un booking que termina 23:59 sigue funcionando", () => {
  it("un bloqueo …-23:59 ocupa el último slot del día", () => {
    const courts = [{ id: "c1", name: "Cancha 1", sortOrder: 0, sportId: "padel" }];
    const bookings = [{ courtId: "c1", startTime: "20:00", endTime: "23:59", status: "confirmado" }];
    const slots = computeAvailability({
      courts,
      bookings,
      window: { open: "20:00", close: "23:00", slotMinutes: 90 }, // slot 20:00-21:30, 21:30-23:00
    });
    // Ambos slots solapan el bloqueo (23:59 > sus starts) → cancha ocupada → sin slots libres
    expect(slots).toEqual([]);
  });
});
