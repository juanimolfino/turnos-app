import { describe, expect, it, vi, beforeEach } from "vitest";

const telegramSend = vi.hoisted(() => vi.fn());
const whatsappSend = vi.hoisted(() => vi.fn());

vi.mock("@/lib/bot/channels/telegram", () => ({
  telegramAdapter: { send: (...args: unknown[]) => telegramSend(...args) },
}));

vi.mock("@/lib/bot/channels/whatsapp", () => ({
  whatsappAdapter: { send: (...args: unknown[]) => whatsappSend(...args) },
}));

import { avisarPagoAcreditadoPorCanal, pagoAcreditadoTexto, type PaidBookingForNotification } from "@/lib/bot/payment-confirmation";

const booking = (overrides: Partial<PaidBookingForNotification> = {}): PaidBookingForNotification => ({
  clubName: "Pádel Central",
  courtName: "Cancha 1",
  date: "2026-07-10",
  startTime: "19:00",
  bookingCode: "HYS324",
  customerPhone: "123",
  clubPaymentMode: "partial",
  refundEnabled: true,
  refundCutoffHours: 24,
  ...overrides,
});

describe("pagoAcreditadoTexto", () => {
  beforeEach(() => {
    telegramSend.mockReset();
    whatsappSend.mockReset();
  });

  it("incluye la política de cancelación del club cuando se confirma el pago", () => {
    const txt = pagoAcreditadoTexto(booking());

    expect(txt).toContain("Pago acreditado");
    expect(txt).toContain("HYS324");
    expect(txt).toContain("24 horas");
    expect(txt).toContain("recuperar tu seña");
  });

  it("avisa por WhatsApp cuando la reserva tiene identidad de WhatsApp", async () => {
    const result = await avisarPagoAcreditadoPorCanal(booking({
      customerPhone: "50672448449",
      customerChannel: "whatsapp",
      customerChannelUserId: "50672448449",
    }));

    expect(result).toBe(true);
    expect(whatsappSend).toHaveBeenCalledWith("50672448449", expect.stringContaining("Pago acreditado"));
    expect(telegramSend).not.toHaveBeenCalled();
  });

  it("mantiene fallback Telegram para reservas viejas sin canal explícito", async () => {
    const result = await avisarPagoAcreditadoPorCanal(booking({
      customerPhone: "123",
      customerChannel: null,
      customerChannelUserId: null,
    }));

    expect(result).toBe(true);
    expect(telegramSend).toHaveBeenCalledWith("123", expect.stringContaining("Pago acreditado"));
    expect(whatsappSend).not.toHaveBeenCalled();
  });

  it("no avisa si no hay destino posible", async () => {
    const result = await avisarPagoAcreditadoPorCanal(booking({
      customerPhone: null,
      customerChannel: null,
      customerChannelUserId: null,
    }));

    expect(result).toBe(false);
    expect(telegramSend).not.toHaveBeenCalled();
    expect(whatsappSend).not.toHaveBeenCalled();
  });
});
