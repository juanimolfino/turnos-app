import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeAvailability } from "@/lib/bookings/availability";

type BookingStatus = "confirmado" | "pendiente" | "cancelado";
type Row = {
  id: string;
  clubId: string;
  bookingCode: string;
  customerPhone: string | null;
  status: BookingStatus;
  paymentStatus: "pagado" | "senado" | "impago" | null;
  mpPaymentId: string | null;
  mpRefundId: string | null;
  refundStatus: string | null;
  date: string;
  startTime: string;
  endTime: string;
  clubName: string;
  clubTimezone: string;
  courtName: string;
  refundEnabled: boolean;
  refundCutoffHours: number;
};

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  updates: [] as Record<string, unknown>[],
  credentials: { accessToken: "club-token" } as { accessToken: string } | null,
  refundPayment: vi.fn(),
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
              if (state.rows[0]) Object.assign(state.rows[0], values);
              return Object.assign(Promise.resolve([]), {
                returning: () => Promise.resolve(state.rows[0] ? [{ id: state.rows[0].id }] : []),
              });
            },
          };
        },
      }),
    };
  },
}));

vi.mock("@/lib/db/queries", () => ({
  getClubMercadoPagoCredentialsForServer: () => Promise.resolve(state.credentials),
}));

vi.mock("@/lib/payments/mercadopago-refund", () => ({
  refundMercadoPagoPayment: (...a: unknown[]) => state.refundPayment(...a),
}));

import {
  CANCELACION_NO_ENCONTRADA_TEXTO,
  cancelarReservaBotPorCodigo,
  respuestaCancelacionTexto,
} from "@/lib/bot/cancelar";

const futureRow = (): Row => ({
  id: "bk1",
  clubId: "club1",
  bookingCode: "HYS324",
  customerPhone: "123",
  status: "confirmado",
  paymentStatus: "impago",
  mpPaymentId: null,
  mpRefundId: null,
  refundStatus: null,
  date: "2026-07-10",
  startTime: "19:00",
  endTime: "20:30",
  clubName: "Pádel Central",
  clubTimezone: "America/Argentina/Buenos_Aires",
  courtName: "Cancha 1",
  refundEnabled: false,
  refundCutoffHours: 24,
});

describe("cancelarReservaBotPorCodigo", () => {
  beforeEach(() => {
    state.rows = [];
    state.updates = [];
    state.credentials = { accessToken: "club-token" };
    state.refundPayment.mockReset().mockResolvedValue({ refundId: "refund-1", status: "approved" });
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

  it("reserva pagada + corresponde refund → procesa refund en MP, cancela y avisa devolución", async () => {
    state.rows = [{
      ...futureRow(),
      paymentStatus: "senado",
      mpPaymentId: "pay-1",
      refundEnabled: true,
      refundCutoffHours: 24,
    }];

    const result = await cancelarReservaBotPorCodigo({
      bookingCode: "HYS324",
      customerPhone: "123",
      now: new Date("2026-07-01T12:00:00-03:00"),
    });

    expect(state.refundPayment).toHaveBeenCalledWith({ accessToken: "club-token", paymentId: "pay-1" });
    expect(result).toEqual({
      ok: true,
      status: "cancelada_con_refund",
      refundId: "refund-1",
      reserva: expect.objectContaining({ status: "cancelado", mpRefundId: "refund-1", refundStatus: "refunded" }),
    });
    expect(state.updates).toContainEqual({ refundStatus: "processing", paymentReviewReason: null });
    expect(state.updates).toContainEqual({
      status: "cancelado",
      mpRefundId: "refund-1",
      refundStatus: "refunded",
      paymentReviewReason: null,
    });
    expect(respuestaCancelacionTexto(result)).toContain("devolución de tu seña");
  });

  it("reserva pagada + NO corresponde refund → pide confirmación y no cancela", async () => {
    state.rows = [{
      ...futureRow(),
      paymentStatus: "pagado",
      mpPaymentId: "pay-1",
      refundEnabled: false,
    }];

    const result = await cancelarReservaBotPorCodigo({
      bookingCode: "HYS324",
      customerPhone: "123",
      now: new Date("2026-07-01T12:00:00-03:00"),
    });

    expect(result).toEqual({
      ok: false,
      error: "CONFIRMACION_REQUERIDA_SIN_REFUND",
      reserva: expect.objectContaining({ id: "bk1" }),
    });
    expect(state.refundPayment).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
    expect(respuestaCancelacionTexto(result)).toContain("no se realiza la devolución");
  });

  it("reserva pagada + confirmación explícita sin refund → cancela sin reembolsar", async () => {
    state.rows = [{
      ...futureRow(),
      paymentStatus: "pagado",
      mpPaymentId: "pay-1",
      refundEnabled: false,
    }];

    const result = await cancelarReservaBotPorCodigo({
      bookingCode: "HYS324",
      customerPhone: "123",
      confirmCancelWithoutRefund: true,
      now: new Date("2026-07-01T12:00:00-03:00"),
    });

    expect(result).toEqual({
      ok: true,
      status: "cancelada_sin_refund",
      reserva: expect.objectContaining({ status: "cancelado" }),
    });
    expect(state.refundPayment).not.toHaveBeenCalled();
    expect(state.updates).toEqual([{ status: "cancelado" }]);
  });

  it("idempotencia: si ya tiene refund_id no reembolsa dos veces", async () => {
    state.rows = [{
      ...futureRow(),
      paymentStatus: "senado",
      mpPaymentId: "pay-1",
      mpRefundId: "refund-previo",
      refundStatus: "refunded",
      refundEnabled: true,
      refundCutoffHours: 24,
    }];

    const result = await cancelarReservaBotPorCodigo({
      bookingCode: "HYS324",
      customerPhone: "123",
      now: new Date("2026-07-01T12:00:00-03:00"),
    });

    expect(state.refundPayment).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      status: "cancelada_con_refund",
      refundId: "refund-previo",
      reserva: expect.objectContaining({ status: "cancelado" }),
    });
    expect(state.updates).toEqual([{ status: "cancelado" }]);
  });

  it("refund falla en MP → no cancela ni marca como reembolsada; queda para revisión", async () => {
    state.rows = [{
      ...futureRow(),
      paymentStatus: "senado",
      mpPaymentId: "pay-1",
      refundEnabled: true,
      refundCutoffHours: 24,
    }];
    state.refundPayment.mockRejectedValueOnce(new Error("MP error"));

    const result = await cancelarReservaBotPorCodigo({
      bookingCode: "HYS324",
      customerPhone: "123",
      now: new Date("2026-07-01T12:00:00-03:00"),
    });

    expect(result).toEqual({ ok: false, error: "REFUND_FALLIDO", reserva: expect.objectContaining({ id: "bk1" }) });
    expect(state.rows[0].status).toBe("confirmado");
    expect(state.rows[0].refundStatus).toBe("failed");
    expect(state.rows[0].mpRefundId).toBeNull();
    expect(state.updates).toContainEqual({ refundStatus: "failed", paymentReviewReason: "refund_failed" });
    expect(respuestaCancelacionTexto(result)).toContain("no cancelé la reserva");
  });
});
