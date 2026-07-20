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
  avisarPagoAcreditadoPorCanal: (...a: unknown[]) => mocks.avisarPagoAcreditado(...a),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser }
  })
}));

function signedPaymentRequest(url: string, body: Record<string, unknown> = { type: "payment", data: { id: "123" } }) {
  const payload = body as { data?: { id?: string | number } };
  const dataId = new URL(url).searchParams.get("data.id") ?? String(payload.data?.id ?? "");
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

describe("Mercado Pago checkout route (LEGACY — deshabilitado)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ENABLE_LEGACY_SAAS;
  });

  // El checkout de créditos es boilerplate SaaS que Cancha no usa. Queda cerrado
  // (404) para no exponer la cuenta central de MP ni una superficie de gasto.
  it("está deshabilitado: devuelve 404 y no crea ninguna preferencia", async () => {
    const { POST } = await import("./checkout/route");
    const response = await POST(new Request("https://example.com/api/mercadopago/checkout", {
      method: "POST",
      body: new URLSearchParams({ packId: "credits_50" }),
    }));

    expect(response.status).toBe(404);
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
    mpRefundId: null,
    refundStatus: null,
    paymentReviewReason: null,
    customerName: "Juan Pérez",
    customerPhone: "12345",
    customerChannel: "telegram",
    customerChannelUserId: "12345",
    bookingCode: "HYS324",
    clubName: "Pádel Central",
    clubPaymentMode: "partial",
    refundEnabled: true,
    refundCutoffHours: 24,
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
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
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
    expect(warn).toHaveBeenCalledWith("[mp webhook] firma inválida", expect.objectContaining({
      manifest: "id:123;request-id:request_123;ts:1700000000;",
      receivedV1: "bad",
      expectedHash: expect.any(String),
      dataId: "123",
    }));
    expect(mocks.getPaymentForAccessToken).not.toHaveBeenCalled();
    expect(mocks.confirmBotHoldPayment).not.toHaveBeenCalled();
    expect(mocks.avisarPagoAcreditado).not.toHaveBeenCalled();
    warn.mockRestore();
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

  it("payload real de MP: usa body.data.id del pago, no el id de la notificación", async () => {
    mocks.getPaymentForAccessToken.mockResolvedValue({
      id: 166282222956,
      status: "approved",
      external_reference: "booking:bk-1",
      metadata: { payment_mode: "partial" },
      currency_id: "ARS",
      transaction_amount: 250,
      status_detail: "accredited",
    });
    const { POST } = await import("./webhook/route");
    const payload = {
      action: "payment.created",
      api_version: "v1",
      data: { id: "166282222956" },
      date_created: "2026-06-29T19:53:17Z",
      id: 134112211690,
      live_mode: true,
      type: "payment",
      user_id: "3340802168",
    };
    const request = signedPaymentRequest(
      "https://example.com/api/mercadopago/webhook?booking_id=bk-1",
      payload,
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, kind: "booking", confirmed: true });
    expect(mocks.getPaymentForAccessToken).toHaveBeenCalledWith("APP_USR-club-token", { id: "166282222956" });
    expect(mocks.confirmBotHoldPayment).toHaveBeenCalledWith(expect.objectContaining({
      mpPaymentId: "166282222956",
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
