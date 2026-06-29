import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCredentials: vi.fn(),
  savePreference: vi.fn(),
  createPreference: vi.fn(),
  usedAccessToken: "",
}));

vi.mock("@/lib/db/queries", () => ({
  getClubMercadoPagoCredentialsForServer: (...a: unknown[]) => mocks.getCredentials(...a),
  saveBookingMercadoPagoPreference: (...a: unknown[]) => mocks.savePreference(...a),
}));

vi.mock("@/lib/mercadopago/client", () => ({
  getMercadoPagoPreferenceForAccessToken: (accessToken: string) => {
    mocks.usedAccessToken = accessToken;
    return { create: mocks.createPreference };
  },
}));

import { createBookingPaymentPreference } from "@/lib/payments/mercadopago-booking";
import { calculateMarketplaceFee } from "@/lib/payments/marketplace-fee";

const input = {
  bookingId: "bk-1",
  bookingCode: "HYS324",
  clubId: "club-1",
  clubName: "Pádel Central",
  courtName: "Cancha 1",
  date: "2026-06-29",
  startTime: "16:00",
  amount: 250,
  paymentMode: "partial" as const,
  heldUntil: new Date("2026-06-29T19:10:00.000Z"),
};

describe("createBookingPaymentPreference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usedAccessToken = "";
    process.env.NEXT_PUBLIC_APP_URL = "https://turnos.example";
    process.env.MERCADOPAGO_CURRENCY = "ARS";
    delete process.env.PLATFORM_FEE_PCT;
    mocks.getCredentials.mockResolvedValue({
      clubId: "club-1",
      accessToken: "APP_USR-club-token",
      refreshToken: "refresh-token",
      expiresAt: null,
    });
    mocks.createPreference.mockResolvedValue({
      id: "pref-123",
      init_point: "https://mp.example/init",
      sandbox_init_point: "https://sandbox.mp.example/init",
    });
    mocks.savePreference.mockResolvedValue({ id: "bk-1", mpPreferenceId: "pref-123" });
  });

  it("crea la preferencia con el token del club, monto correcto y external_reference de la reserva", async () => {
    const result = await createBookingPaymentPreference(input);

    expect(mocks.getCredentials).toHaveBeenCalledWith("club-1");
    expect(mocks.usedAccessToken).toBe("APP_USR-club-token");
    expect(mocks.createPreference).toHaveBeenCalledWith({
      body: expect.objectContaining({
        external_reference: "booking:bk-1",
        notification_url: "https://turnos.example/api/mercadopago/webhook?source_news=webhooks&booking_id=bk-1",
        back_urls: {
          success: "https://turnos.example/pago/resultado?status=success",
          failure: "https://turnos.example/pago/resultado?status=failure",
          pending: "https://turnos.example/pago/resultado?status=pending",
        },
        expires: true,
        expiration_date_to: "2026-06-29T19:10:00.000Z",
        items: [
          expect.objectContaining({
            id: "bk-1",
            title: "Seña reserva pádel - Pádel Central - 2026-06-29 16:00",
            currency_id: "ARS",
            unit_price: 250,
          }),
        ],
        metadata: expect.objectContaining({
          kind: "booking",
          booking_id: "bk-1",
          booking_code: "HYS324",
          club_id: "club-1",
        }),
      }),
    });
    expect(mocks.savePreference).toHaveBeenCalledWith("bk-1", "pref-123");
    expect(result).toEqual({ preferenceId: "pref-123", initPoint: "https://mp.example/init" });
    expect(JSON.stringify(result)).not.toContain("APP_USR-club-token");
  });

  it("aplica marketplace_fee cuando PLATFORM_FEE_PCT es mayor a cero", async () => {
    process.env.PLATFORM_FEE_PCT = "10";

    await createBookingPaymentPreference({ ...input, amount: 1000 });

    expect(calculateMarketplaceFee(1000)).toBe(100);
    expect(mocks.createPreference).toHaveBeenCalledWith({
      body: expect.objectContaining({ marketplace_fee: 100 }),
    });
  });

  it("con PLATFORM_FEE_PCT en 0 no agrega comisión", async () => {
    process.env.PLATFORM_FEE_PCT = "0";

    await createBookingPaymentPreference(input);

    expect(mocks.createPreference).toHaveBeenCalledWith({
      body: expect.not.objectContaining({ marketplace_fee: expect.anything() }),
    });
  });

  it("usa sandbox_init_point para credenciales de test", async () => {
    mocks.getCredentials.mockResolvedValue({
      clubId: "club-1",
      accessToken: "TEST-club-token",
      refreshToken: "refresh-token",
      expiresAt: null,
    });

    const result = await createBookingPaymentPreference(input);

    expect(result.initPoint).toBe("https://sandbox.mp.example/init");
    expect(JSON.stringify(result)).not.toContain("TEST-club-token");
  });
});
