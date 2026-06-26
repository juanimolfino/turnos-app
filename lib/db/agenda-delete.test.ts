import { describe, expect, it, vi } from "vitest";

// Mockeamos getDb con un cliente Drizzle falso que registra si se usó UPDATE
// (cancelación suave) o DELETE (borrado duro), sin tocar la base real.
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));

import { deleteAgendaBlock, deleteAgendaBlockGroup } from "@/lib/db/queries";

function makeDb(selectRows: { type: string }[]) {
  const calls = { sets: [] as unknown[], deletes: 0, updates: 0 };
  const db = {
    select: () => ({ from: () => ({ where: () => Promise.resolve(selectRows) }) }),
    update: () => {
      calls.updates++;
      return {
        set: (v: unknown) => {
          calls.sets.push(v);
          return { where: () => Promise.resolve() };
        },
      };
    },
    delete: () => {
      calls.deletes++;
      return { where: () => Promise.resolve() };
    },
  };
  return { db, calls };
}

describe("deleteAgendaBlock", () => {
  it("cancela (no borra) una reserva type='simple'", async () => {
    const m = makeDb([{ type: "simple" }]);
    state.db = m.db;

    await deleteAgendaBlock("club1", "bk1");

    expect(m.calls.deletes).toBe(0); // sin borrado duro
    expect(m.calls.updates).toBe(1);
    expect(m.calls.sets).toContainEqual({ status: "cancelado" });
  });

  it("borra en duro un bloqueo real (type='bloqueo')", async () => {
    const m = makeDb([{ type: "bloqueo" }]);
    state.db = m.db;

    await deleteAgendaBlock("club1", "bk2");

    expect(m.calls.deletes).toBe(1); // borrado duro como antes
    expect(m.calls.updates).toBe(0); // sin cancelación
  });

  it("no hace nada si el booking no existe", async () => {
    const m = makeDb([]);
    state.db = m.db;

    await deleteAgendaBlock("club1", "noexiste");

    expect(m.calls.deletes).toBe(0);
    expect(m.calls.updates).toBe(0);
  });
});

describe("deleteAgendaBlockGroup", () => {
  it("cancela los 'simple' de la serie y borra el resto", async () => {
    const m = makeDb([]);
    state.db = m.db;

    await deleteAgendaBlockGroup("club1", "grp1");

    // Un UPDATE que cancela los simple + un DELETE para el resto de los bloques.
    expect(m.calls.updates).toBe(1);
    expect(m.calls.sets).toContainEqual({ status: "cancelado" });
    expect(m.calls.deletes).toBe(1);
  });
});
