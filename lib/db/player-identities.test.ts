import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  identityRows: [] as Record<string, unknown>[],
  customerByIdentityRows: [] as Record<string, unknown>[],
  customerByChannelRows: [] as Record<string, unknown>[],
  customerByPhoneRows: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  customerFindCalls: 0,
}));

vi.mock("@/lib/db", () => {
  const tx = {
    query: {
      playerIdentities: {
        findFirst: vi.fn(() => Promise.resolve(state.identityRows[0] ?? null)),
      },
      customers: {
        findFirst: vi.fn(() => {
          state.customerFindCalls += 1;
          if (state.customerFindCalls === 1 && state.customerByIdentityRows.length) return Promise.resolve(state.customerByIdentityRows[0]);
          if (state.customerFindCalls === 2 && state.customerByChannelRows.length) return Promise.resolve(state.customerByChannelRows[0]);
          if (state.customerFindCalls === 3 && state.customerByPhoneRows.length) return Promise.resolve(state.customerByPhoneRows[0]);
          return Promise.resolve(null);
        }),
      },
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push(values);
        const row = values.clubId ? { ...values, id: "cust-new" } : { ...values, id: "pid-new" };
        return {
          onConflictDoUpdate: () => ({ returning: () => Promise.resolve([row]) }),
          returning: () => Promise.resolve([row]),
        };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.updates.push(values);
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: "cust-existing", ...values }]),
          }),
        };
      },
    }),
  };

  return {
    getDb: () => ({
      query: tx.query,
      insert: tx.insert,
      update: tx.update,
      transaction: (cb: (trx: typeof tx) => unknown) => cb(tx),
    }),
  };
});

import { findOrCreateBotCustomer } from "@/lib/db/queries";

describe("player identities", () => {
  beforeEach(() => {
    state.identityRows = [];
    state.customerByIdentityRows = [];
    state.customerByChannelRows = [];
    state.customerByPhoneRows = [];
    state.updates = [];
    state.inserts = [];
    state.customerFindCalls = 0;
  });

  it("si el admin ya creó el cliente manual por teléfono, el bot lo vincula a la identidad global", async () => {
    state.customerByPhoneRows = [{ id: "cust-existing", clubId: "club1", name: "Carlos viejo", phone: "2314 555555" }];

    await findOrCreateBotCustomer({
      clubId: "club1",
      name: "Carlos Gómez",
      phone: "2314 555555",
      channel: "telegram",
      channelUserId: "123",
    });

    expect(state.inserts[0]).toMatchObject({ channel: "telegram", channelUserId: "123" });
    expect(state.updates[0]).toMatchObject({
      name: "Carlos Gómez",
      channel: "telegram",
      channelUserId: "123",
      playerIdentityId: "pid-new",
    });
  });
});
