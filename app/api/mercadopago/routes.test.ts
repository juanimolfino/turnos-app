import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addCredits: vi.fn(),
  avisarPagoAcreditado: vi.fn(),
  confirmBotHoldPayment: vi.fn(),
  createPreference: vi.fn(),
  ensureUserProfile: vi.fn(),
  getBookingPaymentContext: vi.fn(),
  getPayment: vi.fn(),
  getPaymentForAccessToken: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  addCredits: mocks.addCredits,
  confirmBotHoldPayment: mocks.confirmBotHoldPayment,
  getBookingPaymentContext: mocks.getBookingPaymentContext,
  ensureUserProfile: mocks.ensureUserProfile
}));

vi.mock("@/lib/mercadopago/client", () => ({
  getMercadoPagoPayment: () => ({ get: mocks.getPayment }),
  getMercadoPagoPaymentForAccessToken: (accessToken: string) => ({
    get: (input: unknown) => mocks.getPaymentForAccessToken(accessToken, input),
  }),
  getMercadoPagoPreference: () => ({ create: mocks.createPreference })
}));

vi.mock("@/lib/bot/payment-confirmation", () => ({
  avisarPagoAcreditadoPorTelegram: (...a: unknown[]) => mocks.avisarPagoAcreditado(...a),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser }
  })
}));

function signedPaymentRequest(url: string, body: Record<string, unknown> = { type: "payment", data: { id: "123" } }) {
  const dataId = new URL(url).searchParams.get("data.id") ?? "";
  const requestId = "request_123";
  const ts = "1700000000";
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const signature = createHmac("sha256", "webhook_secret").update(manifest).digest("hex");

  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      "x-signature": `ts=${ts},v1=${signature}`,
    },
    body: JSON.stringify(body),
  });
}

describe("Mercado Pago checkout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-production-token";
    process.env.MERCADOPAGO_CURRENCY = "ARS";
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth_user", email: "buyer@example.com" } } });
    mocks.ensureUserProfile.mockResolvedValue({ id: "user_123", email: "buyer@example.com" });
    mocks.createPreference.mockResolvedValue({ init_point: "https://mp.example/checkout" });
  });

  it("creates a credit pack preference and redirects to Checkout Pro", async () => {
    const { POST } = await import("./checkout/route");
    const request = new Request("https://example.com/api/mercadopago/checkout", {
      method: "POST",
      body: new URLSearchParams({ packId: "credits_50" })
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mp.example/checkout");
    expect(mocks.createPreference).toHaveBeenCalledWith({
      body: expect.objectContaining({
        external_reference: "credits:user_123:credits_50",
        notification_url: "https://example.com/api/mercadopago/webhook?source_news=webhooks",
        items: [
          expect.objectContaining({
            id: "credits_50",
            currency_id: "ARS",
            unit_price: 200
          })
        ],
        metadata: expect.objectContaining({
          provider: "mercadopago",
          user_id: "user_123",
          pack_id: "credits_50",
          credits: 50
        })
      })
    });
    expect(mocks.createPreference).toHaveBeenCalledWith({
      body: expect.not.objectContaining({
        payer: expect.anything()
      })
    });
  });

  it("uses the sandbox checkout URL for test credentials", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-access-token";
    mocks.createPreference.mockResolvedValue({
      init_point: "https://mp.example/checkout",
      sandbox_init_point: "https://sandbox.mp.example/checkout"
    });
    const { POST } = await import("./checkout/route");
    const request = new Request("https://example.com/api/mercadopago/checkout", {
      method: "POST",
      body: new URLSearchParams({ packId: "credits_10" })
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://sandbox.mp.example/checkout");
    expect(mocks.createPreference).toHaveBeenCalledWith({
      body: expect.not.objectContaining({
        payer: expect.anything()
      })
    });
  });

  it("redirects anonymous users to login", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("./checkout/route");

    const response = await POST(new Request("https://example.com/api/mercadopago/checkout", { method: "POST" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.com/login");
    expect(mocks.createPreference).not.toHaveBeenCalled();
  });

  it("rejects unknown credit packs", async () => {
    const { POST } = await import("./checkout/route");
    const request = new Request("https://example.com/api/mercadopago/checkout", {
      method: "POST",
      body: new URLSearchParams({ packId: "missing" })
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid credit pack" });
    expect(mocks.createPreference).not.toHaveBeenCalled();
  });
});

describe("Mercado Pago webhook route", () => {
  const bookingContext = {
    id: "bk-1",
    clubId: "club-1",
    courtId: "court-1",
    date: "2026-06-29",
    startTime: "16:00",
    endTime: "17:30",
    status: "pendiente",
    origin: "bot",
    price: 250,
    paymentStatus: "impago",
    heldUntil: new Date("2026-06-29T19:10:00.000Z"),
    mpPreferenceId: "pref-1",
    mpPaymentId: null,
    paymentReviewReason: null,
    customerName: "Juan Pérez",
    customerPhone: "12345",
    bookingCode: "HYS324",
    clubName: "Pádel Central",
    clubPaymentMode: "partial",
    courtName: "Cancha 1",
    mercadoPagoAccessToken: "APP_USR-club-token",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERCADOPAGO_WEBHOOK_SECRET = "webhook_secret";
    mocks.getPayment.mockResolvedValue({
      id: 123,
      status: "approved",
      external_reference: "credits:user_123:credits_10",
      metadata: {},
      currency_id: "ARS",
      transaction_amount: 1,
      status_detail: "accredited"
    });
    mocks.getPaymentForAccessToken.mockResolvedValue({
      id: 123,
      status: "approved",
      external_reference: "booking:bk-1",
      metadata: { payment_mode: "partial" },
      currency_id: "ARS",
      transaction_amount: 250,
      status_detail: "accredited",
    });
    mocks.getBookingPaymentContext.mockResolvedValue(bookingContext);
    mocks.confirmBotHoldPayment.mockResolvedValue({ status: "confirmed", booking: bookingContext });
    mocks.avisarPagoAcreditado.mockResolvedValue(true);
  });

  it("firma inválida → 401 y no procesa", async () => {
    const { POST } = await import("./webhook/route");
    const request = new Request("https://example.com/api/mercadopago/webhook?data.id=123&booking_id=bk-1", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "request_123",
        "x-signature": "ts=1700000000,v1=bad",
      },
      body: JSON.stringify({ type: "payment", data: { id: "123" } }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(mocks.getPaymentForAccessToken).not.toHaveBeenCalled();
    expect(mocks.confirmBotHoldPayment).not.toHaveBeenCalled();
    expect(mocks.avisarPagoAcreditado).not.toHaveBeenCalled();
  });

  it("firma válida + pago approved + hold vigente → confirma como seña y avisa al cliente", async () => {
    const { POST } = await import("./webhook/route");
    const request = signedPaymentRequest("https://example.com/api/mercadopago/webhook?data.id=123&booking_id=bk-1");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, kind: "booking", confirmed: true });
    expect(mocks.getBookingPaymentContext).toHaveBeenCalledWith("bk-1");
    expect(mocks.getPaymentForAccessToken).toHaveBeenCalledWith("APP_USR-club-token", { id: "123" });
    expect(mocks.confirmBotHoldPayment).toHaveBeenCalledWith({
      bookingId: "bk-1",
      mpPaymentId: "123",
      paymentStatus: "senado",
      paidAmount: 250,
    });
    expect(mocks.avisarPagoAcreditado).toHaveBeenCalledWith(expect.not.objectContaining({
      mercadoPagoAccessToken: expect.anything(),
    }));
    expect(mocks.avisarPagoAcreditado).toHaveBeenCalledWith(expect.objectContaining({
      id: "bk-1",
      bookingCode: "HYS324",
      customerPhone: "12345",
    }));
  });

  it("pago full aprobado → confirma como pagado", async () => {
    mocks.getPaymentForAccessToken.mockResolvedValue({
      id: 123,
      status: "approved",
      external_reference: "booking:bk-1",
      metadata: { payment_mode: "full" },
      transaction_amount: 1000,
    });
    const { POST } = await import("./webhook/route");
    const request = signedPaymentRequest("https://example.com/api/mercadopago/webhook?data.id=123&booking_id=bk-1");

    await POST(request);

    expect(mocks.confirmBotHoldPayment).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: "pagado" }));
  });

  it("idempotencia: el mismo pago dos veces no vuelve a confirmar ni avisa", async () => {
    mocks.confirmBotHoldPayment.mockResolvedValue({ status: "already_processed", booking: { ...bookingContext, mpPaymentId: "123" } });
    const { POST } = await import("./webhook/route");
    const request = signedPaymentRequest("https://example.com/api/mercadopago/webhook?data.id=123&booking_id=bk-1");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, kind: "booking", alreadyProcessed: true });
    expect(mocks.confirmBotHoldPayment).toHaveBeenCalledTimes(1);
    expect(mocks.avisarPagoAcreditado).not.toHaveBeenCalled();
  });

  it("pago approved pero hold expirado → no confirma y queda flaggeado para refund", async () => {
    mocks.confirmBotHoldPayment.mockResolvedValue({
      status: "not_confirmed",
      reason: "hold_expired",
      booking: { ...bookingContext, paymentReviewReason: "hold_expired", mpPaymentId: "123" },
    });
    const { POST } = await import("./webhook/route");
    const request = signedPaymentRequest("https://example.com/api/mercadopago/webhook?data.id=123&booking_id=bk-1");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, kind: "booking", confirmed: false, reason: "hold_expired" });
    expect(mocks.avisarPagoAcreditado).not.toHaveBeenCalled();
  });

  it("pago pending/rejected → no confirma", async () => {
    mocks.getPaymentForAccessToken.mockResolvedValue({
      id: 123,
      status: "rejected",
      external_reference: "booking:bk-1",
    });
    const { POST } = await import("./webhook/route");
    const request = signedPaymentRequest("https://example.com/api/mercadopago/webhook?data.id=123&booking_id=bk-1");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, kind: "booking", status: "rejected" });
    expect(mocks.confirmBotHoldPayment).not.toHaveBeenCalled();
    expect(mocks.avisarPagoAcreditado).not.toHaveBeenCalled();
  });

  it("external_reference inexistente → 200 sin romper", async () => {
    mocks.getPaymentForAccessToken.mockResolvedValue({
      id: 123,
      status: "approved",
      external_reference: "booking:missing",
    });
    const { POST } = await import("./webhook/route");
    const request = signedPaymentRequest("https://example.com/api/mercadopago/webhook?data.id=123&booking_id=bk-1");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, kind: "booking", referenceMismatch: true });
    expect(mocks.confirmBotHoldPayment).not.toHaveBeenCalled();
  });

  it("ignores non-payment webhook events", async () => {
    const { POST } = await import("./webhook/route");
    const request = signedPaymentRequest(
      "https://example.com/api/mercadopago/webhook?data.id=123",
      { type: "merchant_order", data: { id: "123" } },
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, ignored: true });
    expect(mocks.getPayment).not.toHaveBeenCalled();
    expect(mocks.addCredits).not.toHaveBeenCalled();
  });

  it("rejects webhook calls without a payment id", async () => {
    const { POST } = await import("./webhook/route");

    const response = await POST(new Request("https://example.com/api/mercadopago/webhook", { method: "POST" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing payment id" });
    expect(mocks.getPayment).not.toHaveBeenCalled();
  });

  it("mantiene compatibilidad con pagos legacy de créditos", async () => {
    const { POST } = await import("./webhook/route");
    const request = signedPaymentRequest("https://example.com/api/mercadopago/webhook?data.id=123");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.addCredits).toHaveBeenCalledWith(
      "user_123",
      10,
      expect.objectContaining({
        provider: "mercadopago",
        paymentId: 123,
        packId: "credits_10",
        amountCents: 100,
      }),
      "mp_payment:123",
    );
  });
});
