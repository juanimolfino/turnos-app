import { describe, expect, it } from "vitest";
import { decideBookingRefund, zonedDateTimeToUtc } from "./refund-policy";

describe("decideBookingRefund", () => {
  const booking = {
    bookingDate: "2026-07-01",
    bookingStartTime: "20:00",
    timezone: "America/Argentina/Buenos_Aires",
    refundCutoffHours: 24,
  };

  it("refund_enabled=false → nunca corresponde", () => {
    const decision = decideBookingRefund({
      ...booking,
      refundEnabled: false,
      cancelledAt: new Date("2026-06-29T20:00:00.000Z"),
    });

    expect(decision.corresponde).toBe(false);
    expect(decision.motivo).toBe("refund_disabled");
  });

  it("refund_enabled=true y cancelación con más de cutoff horas → corresponde", () => {
    const decision = decideBookingRefund({
      ...booking,
      refundEnabled: true,
      cancelledAt: new Date("2026-06-30T20:30:00.000Z"),
    });

    expect(decision.corresponde).toBe(true);
    expect(decision.motivo).toBe("cutoff_met");
  });

  it("refund_enabled=true y cancelación con menos de cutoff horas → no corresponde", () => {
    const decision = decideBookingRefund({
      ...booking,
      refundEnabled: true,
      cancelledAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(decision.corresponde).toBe(false);
    expect(decision.motivo).toBe("cutoff_not_met");
  });

  it("en el límite exacto del cutoff corresponde refund", () => {
    const decision = decideBookingRefund({
      ...booking,
      refundEnabled: true,
      cancelledAt: new Date("2026-06-30T23:00:00.000Z"),
    });

    expect(decision.hoursUntilStart).toBe(24);
    expect(decision.corresponde).toBe(true);
    expect(decision.motivo).toBe("cutoff_met");
  });

  it("calcula la hora del turno respetando la timezone del club", () => {
    const startsAt = zonedDateTimeToUtc("2026-07-01", "20:00", "America/Argentina/Buenos_Aires");

    expect(startsAt.toISOString()).toBe("2026-07-01T23:00:00.000Z");

    const decision = decideBookingRefund({
      ...booking,
      refundEnabled: true,
      cancelledAt: new Date("2026-06-30T23:00:00.000Z"),
    });

    expect(decision.hoursUntilStart).toBe(24);
    expect(decision.corresponde).toBe(true);
  });
});
