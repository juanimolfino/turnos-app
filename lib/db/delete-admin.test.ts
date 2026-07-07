import { describe, expect, it, vi } from "vitest";

// Mockeamos getDb con un cliente Drizzle falso que registra qué tabla se borró
// (users/clubs), sin tocar la base real.
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));

import { deleteAdminCascade, DeleteAdminError } from "@/lib/db/queries";
import { users, clubs } from "@/lib/db/schema";

type AdminRow = {
  id: string;
  authUserId: string;
  email: string;
  role: string | null;
  clubId: string | null;
};

function makeDb({ admin, clubHasOtherUsers = false }: { admin: AdminRow | undefined; clubHasOtherUsers?: boolean }) {
  const calls = { userDeletes: 0, clubDeletes: 0 };
  let userFindFirstCalls = 0;

  const tx = {
    query: {
      users: {
        findFirst: () => {
          userFindFirstCalls++;
          if (userFindFirstCalls === 1) return Promise.resolve(admin);
          return Promise.resolve(clubHasOtherUsers ? { id: "otro-admin" } : undefined);
        },
      },
    },
    delete: (table: unknown) => {
      if (table === users) calls.userDeletes++;
      else if (table === clubs) calls.clubDeletes++;
      return { where: () => Promise.resolve() };
    },
  };

  const db = { transaction: (fn: (tx: unknown) => unknown) => fn(tx) };
  return { db, calls };
}

describe("deleteAdminCascade", () => {
  it("admin inexistente: tira ADMIN_NOT_FOUND y no borra nada", async () => {
    const m = makeDb({ admin: undefined });
    state.db = m.db;

    await expect(deleteAdminCascade("no-existe")).rejects.toThrow(DeleteAdminError);
    expect(m.calls.userDeletes).toBe(0);
    expect(m.calls.clubDeletes).toBe(0);
  });

  it("no deja borrar un superadmin desde esta ruta", async () => {
    const m = makeDb({
      admin: { id: "u1", authUserId: "auth1", email: "s@x.com", role: "superadmin", clubId: null },
    });
    state.db = m.db;

    await expect(deleteAdminCascade("u1")).rejects.toThrow(DeleteAdminError);
    expect(m.calls.userDeletes).toBe(0);
  });

  it("admin con club exclusivo: borra el usuario y en cascada el club", async () => {
    const m = makeDb({
      admin: { id: "u1", authUserId: "auth1", email: "a@x.com", role: "admin", clubId: "club1" },
      clubHasOtherUsers: false,
    });
    state.db = m.db;

    const result = await deleteAdminCascade("u1");

    expect(m.calls.userDeletes).toBe(1);
    expect(m.calls.clubDeletes).toBe(1);
    expect(result).toEqual({ authUserId: "auth1", email: "a@x.com", clubId: "club1", clubDeleted: true });
  });

  it("admin cuyo club todavía usa otro usuario: NO borra el club", async () => {
    const m = makeDb({
      admin: { id: "u1", authUserId: "auth1", email: "a@x.com", role: "admin", clubId: "club1" },
      clubHasOtherUsers: true,
    });
    state.db = m.db;

    const result = await deleteAdminCascade("u1");

    expect(m.calls.userDeletes).toBe(1);
    expect(m.calls.clubDeletes).toBe(0);
    expect(result.clubDeleted).toBe(false);
  });

  it("admin sin club asignado: borra el usuario y no intenta tocar clubs", async () => {
    const m = makeDb({
      admin: { id: "u1", authUserId: "auth1", email: "a@x.com", role: "admin", clubId: null },
    });
    state.db = m.db;

    const result = await deleteAdminCascade("u1");

    expect(m.calls.userDeletes).toBe(1);
    expect(m.calls.clubDeletes).toBe(0);
    expect(result.clubDeleted).toBe(false);
  });
});
