import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addCredits: vi.fn(),
  createPreference: vi.fn(),
  ensureUserProfile: vi.fn(),
  getPayment: vi.fn(),
  getUser: vi.fn(),
  validateSignature: vi.fn()
}));

vi.mock("@/lib/db/queries", () => ({
  addCredits: mocks.addCredits,
  ensureUserProfile: mocks.ensureUserProfile
}));

vi.mock("@/lib/mercadopago/client", () => ({
  getMercadoPagoPayment: () => ({ get: mocks.getPayment }),
  getMercadoPagoPreference: () => ({ create: mocks.createPreference })
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser }
  })
}));

vi.mock("mercadopago", () => ({
  InvalidWebhookSignatureError: class InvalidWebhookSignatureError extends Error {
    reason: string;

    constructor(reason: string) {
      super(reason);
      this.reason = reason;
    }
  },
  WebhookSignatureValidator: {
    validate: mocks.validateSignature
  }
}));

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
  });

  it("validates the signature, fetches approved payments, and grants credits once per payment id", async () => {
    const { POST } = await import("./webhook/route");
    const request = new Request("https://example.com/api/mercadopago/webhook?data.id=123", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "request_123",
        "x-signature": "ts=1,v1=signature"
      },
      body: JSON.stringify({ type: "payment", data: { id: "123" } })
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.validateSignature).toHaveBeenCalledWith({
      xSignature: "ts=1,v1=signature",
      xRequestId: "request_123",
      dataId: "123",
      secret: "webhook_secret",
      toleranceSeconds: 300
    });
    expect(mocks.addCredits).toHaveBeenCalledWith(
      "user_123",
      10,
      expect.objectContaining({
        provider: "mercadopago",
        paymentId: 123,
        packId: "credits_10",
        amountCents: 100
      }),
      "mp_payment:123"
    );
  });

  it("does not grant credits for pending payments", async () => {
    mocks.getPayment.mockResolvedValue({ id: 123, status: "pending" });
    const { POST } = await import("./webhook/route");
    const request = new Request("https://example.com/api/mercadopago/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: "123" } })
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, status: "pending" });
    expect(mocks.addCredits).not.toHaveBeenCalled();
  });

  it("ignores non-payment webhook events", async () => {
    const { POST } = await import("./webhook/route");
    const request = new Request("https://example.com/api/mercadopago/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "merchant_order", data: { id: "123" } })
    });

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
    expect(mocks.validateSignature).not.toHaveBeenCalled();
  });
});
