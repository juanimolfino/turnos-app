import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshMercadoPagoAccessToken } from "./oauth";

function mockFetchOnce(status: number, json: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  });
}

describe("refreshMercadoPagoAccessToken", () => {
  beforeEach(() => {
    process.env.MERCADOPAGO_CLIENT_ID = "cid";
    process.env.MERCADOPAGO_CLIENT_SECRET = "csecret";
    process.env.MERCADOPAGO_OAUTH_REDIRECT_URI = "https://app.example/api/mercadopago/oauth/callback";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("usa grant_type=refresh_token con el refresh_token del club y mapea la respuesta", async () => {
    const fetchMock = mockFetchOnce(200, {
      access_token: "NEW-AT", refresh_token: "NEW-RT", expires_in: 15552000, scope: "offline_access", live_mode: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await refreshMercadoPagoAccessToken("OLD-RT");

    const body = (fetchMock.mock.calls[0][1] as { body: URLSearchParams }).body.toString();
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=OLD-RT");
    expect(tokens.accessToken).toBe("NEW-AT");
    expect(tokens.refreshToken).toBe("NEW-RT");
    expect(tokens.expiresAt).toBeInstanceOf(Date);
  });

  it("si MP no devuelve refresh_token nuevo, conserva el anterior", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(200, { access_token: "NEW-AT", expires_in: 100 }));
    const tokens = await refreshMercadoPagoAccessToken("OLD-RT");
    expect(tokens.refreshToken).toBe("OLD-RT");
  });

  it("si MP responde con error, tira (no rompe la credencial en silencio)", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(400, { error: "invalid_grant" }));
    await expect(refreshMercadoPagoAccessToken("OLD-RT")).rejects.toThrow(/token refresh failed/i);
  });
});
