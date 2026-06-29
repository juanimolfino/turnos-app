import { describe, expect, it } from "vitest";
import { calculateBookingPaymentAmount } from "./amount";

describe("calculateBookingPaymentAmount", () => {
  it("devuelve 0 cuando el modo es none", () => {
    expect(calculateBookingPaymentAmount({ courtPrice: 1000, paymentMode: "none", depositPct: 25 })).toBe(0);
  });

  it("calcula una seña parcial sobre el precio de la cancha", () => {
    expect(calculateBookingPaymentAmount({ courtPrice: 1000, paymentMode: "partial", depositPct: 25 })).toBe(250);
  });

  it("cobra el precio completo cuando el modo es full", () => {
    expect(calculateBookingPaymentAmount({ courtPrice: 1000, paymentMode: "full", depositPct: 25 })).toBe(1000);
  });
});
