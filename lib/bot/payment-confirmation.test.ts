import { describe, expect, it } from "vitest";
import { pagoAcreditadoTexto } from "@/lib/bot/payment-confirmation";

describe("pagoAcreditadoTexto", () => {
  it("incluye la política de cancelación del club cuando se confirma el pago", () => {
    const txt = pagoAcreditadoTexto({
      clubName: "Pádel Central",
      courtName: "Cancha 1",
      date: "2026-07-10",
      startTime: "19:00",
      bookingCode: "HYS324",
      customerPhone: "123",
      clubPaymentMode: "partial",
      refundEnabled: true,
      refundCutoffHours: 24,
    });

    expect(txt).toContain("Pago acreditado");
    expect(txt).toContain("HYS324");
    expect(txt).toContain("24 horas");
    expect(txt).toContain("recuperar tu seña");
  });
});
