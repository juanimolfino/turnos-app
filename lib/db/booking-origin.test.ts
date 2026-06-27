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

import { createBooking, createAgendaBlocks } from "@/lib/db/queries";

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
