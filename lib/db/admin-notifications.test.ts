import { describe, expect, it, vi } from "vitest";

// Mock de getDb: cliente Drizzle falso que registra las operaciones sobre
// admin_notifications sin tocar la base real.
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));

import { createBookingCancellationNotification, createNewBookingNotification, createPaymentReviewNotification, markClubNotificationsRead } from "@/lib/db/queries";

describe("createNewBookingNotification", () => {
  it("inserta con onConflictDoNothing (idempotente por booking+kind)", async () => {
    const calls = { values: null as unknown, conflict: false };
    state.db = {
      insert: () => ({
        values: (v: unknown) => {
          calls.values = v;
          return {
            onConflictDoNothing: () => {
              calls.conflict = true;
              return Promise.resolve();
            },
          };
        },
      }),
    };

    await createNewBookingNotification("club-1", "booking-1");

    expect(calls.values).toEqual({ clubId: "club-1", bookingId: "booking-1", kind: "nueva_reserva" });
    expect(calls.conflict).toBe(true);
  });

  it("inserta cancelación con kind propio", async () => {
    const calls = { values: null as unknown, conflict: false };
    state.db = {
      insert: () => ({
        values: (v: unknown) => {
          calls.values = v;
          return {
            onConflictDoNothing: () => {
              calls.conflict = true;
              return Promise.resolve();
            },
          };
        },
      }),
    };

    await createBookingCancellationNotification("club-1", "booking-1");

    expect(calls.values).toEqual({ clubId: "club-1", bookingId: "booking-1", kind: "cancelacion_reserva" });
    expect(calls.conflict).toBe(true);
  });

  it("inserta alerta de pago para revisión con kind propio", async () => {
    const calls = { values: null as unknown, conflict: false };
    state.db = {
      insert: () => ({
        values: (v: unknown) => {
          calls.values = v;
          return {
            onConflictDoNothing: () => {
              calls.conflict = true;
              return Promise.resolve();
            },
          };
        },
      }),
    };

    await createPaymentReviewNotification("club-1", "booking-1");

    expect(calls.values).toEqual({ clubId: "club-1", bookingId: "booking-1", kind: "pago_requiere_revision" });
    expect(calls.conflict).toBe(true);
  });
});

describe("markClubNotificationsRead", () => {
  it("marca las no leídas como leídas y devuelve cuántas", async () => {
    let setArg: Record<string, unknown> | null = null;
    state.db = {
      update: () => ({
        set: (v: Record<string, unknown>) => {
          setArg = v;
          return {
            where: () => ({
              returning: () => Promise.resolve([{ id: "n1" }, { id: "n2" }]),
            }),
          };
        },
      }),
    };

    const marked = await markClubNotificationsRead("club-1");

    expect(marked).toBe(2);
    expect(setArg).not.toBeNull();
    expect(setArg!.readAt).toBeInstanceOf(Date);
  });
});
