import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  buildAuthorizationUrl: vi.fn(),
  disconnectCredentials: vi.fn(),
  exchangeCode: vi.fn(),
  getUser: vi.fn(),
  getUserByAuthId: vi.fn(),
  upsertCredentials: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/db/queries", () => ({
  disconnectClubMercadoPago: mocks.disconnectCredentials,
  getUserByAuthId: mocks.getUserByAuthId,
  upsertClubMercadoPagoCredentials: mocks.upsertCredentials,
}));

vi.mock("@/lib/mercadopago/oauth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/mercadopago/oauth")>();
  return {
    ...original,
    buildMercadoPagoAuthorizationUrl: mocks.buildAuthorizationUrl,
    exchangeMercadoPagoAuthorizationCode: mocks.exchangeCode,
  };
});

describe("Mercado Pago OAuth onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth_admin" } } });
    mocks.getUserByAuthId.mockResolvedValue({ id: "admin_1", clubId: "club_123" });
    mocks.disconnectCredentials.mockResolvedValue({
      disconnected: true,
      club: { id: "club_123", paymentMode: "none", requiresPayment: false },
    });
    mocks.buildAuthorizationUrl.mockReturnValue("https://auth.mercadopago.com/authorization?state=abc");
    mocks.exchangeCode.mockResolvedValue({
      accessToken: "APP_USR-secret-access-token",
      refreshToken: "secret-refresh-token",
      expiresAt: new Date("2026-07-01T00:00:00.000Z"),
      scope: "offline_access",
      mercadoPagoUserId: "seller_789",
      publicKey: "APP_USR-public-key",
      liveMode: true,
    });
  });

  it("start redirige a Mercado Pago y setea state en cookie httpOnly", async () => {
    const { GET } = await import("./oauth/start/route");
    const response = await GET(new Request("https://example.com/api/mercadopago/oauth/start"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://auth.mercadopago.com/authorization?state=abc");
    expect(response.headers.get("set-cookie")).toContain("mp_oauth_state=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("callback canjea code por tokens y los guarda en el club correcto", async () => {
    const { GET } = await import("./oauth/callback/route");
    const request = new NextRequest("https://example.com/api/mercadopago/oauth/callback?code=code_123&state=state_123", {
      headers: { cookie: "mp_oauth_state=state_123" },
    });

    const response = await GET(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.com/ajustes?mp=connected");
    expect(mocks.exchangeCode).toHaveBeenCalledWith("code_123");
    expect(mocks.upsertCredentials).toHaveBeenCalledWith("club_123", {
      accessToken: "APP_USR-secret-access-token",
      refreshToken: "secret-refresh-token",
      expiresAt: new Date("2026-07-01T00:00:00.000Z"),
      scope: "offline_access",
      mercadoPagoUserId: "seller_789",
      publicKey: "APP_USR-public-key",
      liveMode: true,
    });
  });

  it("callback no expone tokens en la respuesta al cliente", async () => {
    const { GET } = await import("./oauth/callback/route");
    const request = new NextRequest("https://example.com/api/mercadopago/oauth/callback?code=code_123&state=state_123", {
      headers: { cookie: "mp_oauth_state=state_123" },
    });

    const response = await GET(request);
    const responseText = `${response.headers.get("location") ?? ""}\n${response.headers.get("set-cookie") ?? ""}`;

    expect(responseText).not.toContain("APP_USR-secret-access-token");
    expect(responseText).not.toContain("secret-refresh-token");
  });

  it("error o denegación de OAuth redirige a ajustes con error y no guarda tokens", async () => {
    const { GET } = await import("./oauth/callback/route");
    const request = new NextRequest("https://example.com/api/mercadopago/oauth/callback?error=access_denied&state=state_123", {
      headers: { cookie: "mp_oauth_state=state_123" },
    });

    const response = await GET(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.com/ajustes?mp=error");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.upsertCredentials).not.toHaveBeenCalled();
  });

  it("desvincular borra credenciales y devuelve estado no conectado sin dejar pagos activos", async () => {
    const { POST } = await import("./oauth/disconnect/route");

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.disconnectCredentials).toHaveBeenCalledWith("club_123");
    expect(body).toEqual({
      mercadoPago: { connected: false },
      club: { paymentMode: "none", requiresPayment: false },
    });
    expect(JSON.stringify(body)).not.toContain("APP_USR");
  });
});
