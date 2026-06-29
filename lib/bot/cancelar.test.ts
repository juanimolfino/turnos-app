import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeAvailability } from "@/lib/bookings/availability";

type BookingStatus = "confirmado" | "pendiente" | "cancelado";
type Row = {
  id: string;
  bookingCode: string;
  customerPhone: string | null;
  status: BookingStatus;
  date: string;
  startTime: string;
  endTime: string;
  clubName: string;
  clubTimezone: string;
  courtName: string;
};

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => ({
  getDb: () => {
    const query = {
      innerJoin: () => query,
      where: () => ({ limit: () => Promise.resolve(state.rows) }),
    };
    return {
      select: () => ({ from: () => query }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          state.updates.push(values);
          return {
            where: () => {
              if (state.rows[0]) state.rows[0].status = values.status as BookingStatus;
              return Promise.resolve([]);
            },
          };
        },
      }),
    };
  },
}));

import {
  CANCELACION_NO_ENCONTRADA_TEXTO,
  cancelarReservaBotPorCodigo,
  respuestaCancelacionTexto,
} from "@/lib/bot/cancelar";

const futureRow = (): Row => ({
  id: "bk1",
  bookingCode: "HYS324",
  customerPhone: "123",
  status: "confirmado",
  date: "2026-07-10",
  startTime: "19:00",
  endTime: "20:30",
  clubName: "Pádel Central",
  clubTimezone: "America/Argentina/Buenos_Aires",
  courtName: "Cancha 1",
});

describe("cancelarReservaBotPorCodigo", () => {
  beforeEach(() => {
    state.rows = [];
    state.updates = [];
  });

  it("cancelación exitosa: código válido + teléfono coincide → status cancelado y turno liberado", async () => {
    const row = futureRow();
    state.rows = [row];

    const antes = computeAvailability({
      courts: [{ id: "ct1", name: "Cancha 1", sortOrder: 0, sportId: "padel" }],
      bookings: [{ courtId: "ct1", startTime: row.startTime, endTime: row.endTime, status: row.status }],
      window: { open: "19:00", close: "20:30", slotMinutes: 90 },
    });
    expect(antes).toEqual([]);

    const result = await cancelarReservaBotPorCodigo({
      bookingCode: "HYS324",
      customerPhone: "123",
      now: new Date("2026-07-01T12:00:00-03:00"),
    });

    expect(result).toEqual({ ok: true, status: "cancelada", reserva: expect.objectContaining({ status: "cancelado" }) });
    expect(state.updates).toEqual([{ status: "cancelado" }]);
    expect(row.status).toBe("cancelado");

    const despues = computeAvailability({
      courts: [{ id: "ct1", name: "Cancha 1", sortOrder: 0, sportId: "padel" }],
      bookings: [{ courtId: "ct1", startTime: row.startTime, endTime: row.endTime, status: row.status }],
      window: { open: "19:00", close: "20:30", slotMinutes: 90 },
    });
    expect(despues).toEqual([
      { start: "19:00", end: "20:30", freeCourts: [{ id: "ct1", name: "Cancha 1" }], totalCourts: 1 },
    ]);
  });

  it("un hold pendiente se puede cancelar por booking_code y libera el turno", async () => {
    const row = { ...futureRow(), status: "pendiente" as const };
    state.rows = [row];

    const antes = computeAvailability({
      courts: [{ id: "ct1", name: "Cancha 1", sortOrder: 0, sportId: "padel" }],
      bookings: [{ courtId: "ct1", startTime: row.startTime, endTime: row.endTime, status: row.status }],
      window: { open: "19:00", close: "20:30", slotMinutes: 90 },
    });
    expect(antes).toEqual([]);

    const result = await cancelarReservaBotPorCodigo({
      bookingCode: "HYS324",
      customerPhone: "123",
      now: new Date("2026-07-01T12:00:00-03:00"),
    });

    expect(result).toEqual({ ok: true, status: "cancelada", reserva: expect.objectContaining({ status: "cancelado" }) });
    expect(state.updates).toEqual([{ status: "cancelado" }]);

    const despues = computeAvailability({
      courts: [{ id: "ct1", name: "Cancha 1", sortOrder: 0, sportId: "padel" }],
      bookings: [{ courtId: "ct1", startTime: row.startTime, endTime: row.endTime, status: row.status }],
      window: { open: "19:00", close: "20:30", slotMinutes: 90 },
    });
    expect(despues).toEqual([
      { start: "19:00", end: "20:30", freeCourts: [{ id: "ct1", name: "Cancha 1" }], totalCourts: 1 },
    ]);
  });

  it("seguridad: código válido + teléfono distinto → NO cancela y devuelve mensaje neutro idéntico a no encontrado", async () => {
    state.rows = [futureRow()];
    const distinto = await cancelarReservaBotPorCodigo({
      bookingCode: "HYS324",
      customerPhone: "999",
      now: new Date("2026-07-01T12:00:00-03:00"),
    });

    state.rows = [];
    const inexistente = await cancelarReservaBotPorCodigo({
      bookingCode: "ZZZ999",
      customerPhone: "999",
      now: new Date("2026-07-01T12:00:00-03:00"),
    });

    expect(distinto).toEqual({ ok: false, error: "NO_ENCONTRADA" });
    expect(inexistente).toEqual({ ok: false, error: "NO_ENCONTRADA" });
    expect(respuestaCancelacionTexto(distinto)).toBe(CANCELACION_NO_ENCONTRADA_TEXTO);
    expect(respuestaCancelacionTexto(inexistente)).toBe(CANCELACION_NO_ENCONTRADA_TEXTO);
    expect(state.updates).toEqual([]);
  });

  it("código inexistente → mensaje neutro y no cancela", async () => {
    const result = await cancelarReservaBotPorCodigo({
      bookingCode: "HYS324",
      customerPhone: "123",
      now: new Date("2026-07-01T12:00:00-03:00"),
    });
    expect(result).toEqual({ ok: false, error: "NO_ENCONTRADA" });
    expect(respuestaCancelacionTexto(result)).toBe(CANCELACION_NO_ENCONTRADA_TEXTO);
    expect(state.updates).toEqual([]);
  });

  it("reserva ya cancelada → no hace nada y avisa", async () => {
    state.rows = [{ ...futureRow(), status: "cancelado" }];
    const result = await cancelarReservaBotPorCodigo({
      bookingCode: "HYS324",
      customerPhone: "123",
      now: new Date("2026-07-01T12:00:00-03:00"),
    });
    expect(result).toEqual({ ok: false, error: "YA_CANCELADA", reserva: expect.objectContaining({ id: "bk1" }) });
    expect(respuestaCancelacionTexto(result)).toBe("Esa reserva ya estaba cancelada.");
    expect(state.updates).toEqual([]);
  });

  it("turno pasado → no permite cancelar", async () => {
    state.rows = [{ ...futureRow(), date: "2026-01-10" }];
    const result = await cancelarReservaBotPorCodigo({
      bookingCode: "HYS324",
      customerPhone: "123",
      now: new Date("2026-07-01T12:00:00-03:00"),
    });
    expect(result).toEqual({ ok: false, error: "TURNO_PASADO", reserva: expect.objectContaining({ id: "bk1" }) });
    expect(respuestaCancelacionTexto(result)).toContain("ya pasó");
    expect(state.updates).toEqual([]);
  });
});
