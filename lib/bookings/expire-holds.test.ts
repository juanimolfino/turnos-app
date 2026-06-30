import { describe, expect, it } from "vitest";
import { computeAvailability, type AvailabilityBooking, type AvailabilityCourt } from "@/lib/bookings/availability";
import { expireBotHolds, isExpiredBotHold, type ExpirableBotHold } from "./expire-holds";

type TestBooking = ExpirableBotHold & {
  id: string;
  courtId: string;
  startTime: string;
  endTime: string;
};

function makeDb(rows: TestBooking[], now: Date) {
  return {
    update: () => ({
      set: (patch: Partial<TestBooking>) => ({
        where: () => ({
          returning: async () => {
            const released: Array<{ id: string }> = [];
            for (const row of rows) {
              if (!isExpiredBotHold(row, now)) continue;
              Object.assign(row, patch);
              released.push({ id: row.id });
            }
            return released;
          },
        }),
      }),
    }),
  };
}

const now = new Date("2026-06-29T20:00:00.000Z");
const past = new Date("2026-06-29T19:59:00.000Z");
const future = new Date("2026-06-29T20:01:00.000Z");

function row(input: Partial<TestBooking> & { id: string }): TestBooking {
  return {
    id: input.id,
    courtId: input.courtId ?? "court-1",
    startTime: input.startTime ?? "08:00",
    endTime: input.endTime ?? "09:30",
    origin: input.origin ?? "bot",
    status: input.status ?? "pendiente",
    heldUntil: input.heldUntil ?? past,
  };
}

describe("expireBotHolds", () => {
  it("libera un hold vencido del bot y el turno queda disponible", async () => {
    const rows = [row({ id: "hold-expired" })];
    const db = makeDb(rows, now);
    const courts: AvailabilityCourt[] = [{ id: "court-1", name: "Cancha 1", sortOrder: 0, sportId: "padel" }];
    const window = { open: "08:00", close: "09:30", slotMinutes: 90 };

    expect(computeAvailability({
      courts,
      bookings: rows as AvailabilityBooking[],
      window,
    })).toEqual([]);

    const result = await expireBotHolds({ db, now });

    expect(result).toEqual({ released: 1, bookingIds: ["hold-expired"] });
    expect(rows[0].status).toBe("cancelado");
    expect(computeAvailability({
      courts,
      bookings: rows as AvailabilityBooking[],
      window,
    })[0].freeCourts).toEqual([{ id: "court-1", name: "Cancha 1" }]);
  });

  it("no toca holds vigentes", async () => {
    const rows = [row({ id: "hold-active", heldUntil: future })];

    const result = await expireBotHolds({ db: makeDb(rows, now), now });

    expect(result.released).toBe(0);
    expect(rows[0].status).toBe("pendiente");
  });

  it("nunca toca reservas confirmadas", async () => {
    const rows = [row({ id: "confirmed", status: "confirmado" })];

    const result = await expireBotHolds({ db: makeDb(rows, now), now });

    expect(result.released).toBe(0);
    expect(rows[0].status).toBe("confirmado");
  });

  it("nunca toca reservas del admin", async () => {
    const rows = [row({ id: "admin-hold", origin: "admin" })];

    const result = await expireBotHolds({ db: makeDb(rows, now), now });

    expect(result.released).toBe(0);
    expect(rows[0].status).toBe("pendiente");
  });

  it("devuelve el conteo correcto de liberados", async () => {
    const rows = [
      row({ id: "expired-1" }),
      row({ id: "expired-2" }),
      row({ id: "active", heldUntil: future }),
      row({ id: "confirmed", status: "confirmado" }),
      row({ id: "admin", origin: "admin" }),
    ];

    const result = await expireBotHolds({ db: makeDb(rows, now), now });

    expect(result).toEqual({ released: 2, bookingIds: ["expired-1", "expired-2"] });
    expect(rows.map((booking) => [booking.id, booking.status])).toEqual([
      ["expired-1", "cancelado"],
      ["expired-2", "cancelado"],
      ["active", "pendiente"],
      ["confirmed", "confirmado"],
      ["admin", "pendiente"],
    ]);
  });

  it("es idempotente si corre dos veces seguidas", async () => {
    const rows = [row({ id: "expired" })];
    const db = makeDb(rows, now);

    expect(await expireBotHolds({ db, now })).toEqual({ released: 1, bookingIds: ["expired"] });
    expect(await expireBotHolds({ db, now })).toEqual({ released: 0, bookingIds: [] });
    expect(rows[0].status).toBe("cancelado");
  });
});
