import { z } from "zod";

const AUTH_URL = "https://auth.mercadopago.com/authorization";
const TOKEN_URL = "https://api.mercadopago.com/oauth/token";
export const MERCADOPAGO_OAUTH_STATE_COOKIE = "mp_oauth_state";

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().nullable().optional(),
  user_id: z.union([z.string(), z.number()]).nullable().optional(),
  public_key: z.string().nullable().optional(),
  live_mode: z.boolean().nullable().optional(),
});

export type MercadoPagoOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  scope: string | null;
  mercadoPagoUserId: string | null;
  publicKey: string | null;
  liveMode: boolean | null;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function getMercadoPagoOAuthConfig() {
  return {
    clientId: requiredEnv("MERCADOPAGO_CLIENT_ID"),
    clientSecret: requiredEnv("MERCADOPAGO_CLIENT_SECRET"),
    redirectUri: requiredEnv("MERCADOPAGO_OAUTH_REDIRECT_URI"),
  };
}

export function buildMercadoPagoAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = getMercadoPagoOAuthConfig();
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export async function exchangeMercadoPagoAuthorizationCode(code: string): Promise<MercadoPagoOAuthTokens> {
  const { clientId, clientSecret, redirectUri } = getMercadoPagoOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    // Debug: MP devuelve el motivo real en el body (ej. invalid_client, invalid_grant,
    // redirect_uri mismatch). Lo capturamos para diagnosticar sin exponer secretos.
    const detail = await response.text().catch(() => "");
    throw new Error(`Mercado Pago OAuth token exchange failed (HTTP ${response.status}): ${detail.slice(0, 800)}`);
  }

  const raw = await response.json();
  const parsed = TokenResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Mercado Pago OAuth token response is invalid");

  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    expiresAt: parsed.data.expires_in ? new Date(Date.now() + parsed.data.expires_in * 1000) : null,
    scope: parsed.data.scope ?? null,
    mercadoPagoUserId: parsed.data.user_id == null ? null : String(parsed.data.user_id),
    publicKey: parsed.data.public_key ?? null,
    liveMode: parsed.data.live_mode ?? null,
  };
}

// En el refresh, MP normalmente devuelve un refresh_token nuevo, pero por las
// dudas lo hacemos opcional y caemos al anterior si no viene.
const RefreshTokenResponseSchema = TokenResponseSchema.extend({
  refresh_token: z.string().min(1).optional(),
});

/**
 * Renueva el access_token de un club usando su refresh_token (grant_type=refresh_token).
 * MP rota el refresh_token: si devuelve uno nuevo lo usamos, si no conservamos el viejo.
 */
export async function refreshMercadoPagoAccessToken(refreshToken: string): Promise<MercadoPagoOAuthTokens> {
  const { clientId, clientSecret } = getMercadoPagoOAuthConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Mercado Pago token refresh failed (HTTP ${response.status}): ${detail.slice(0, 500)}`);
  }

  const raw = await response.json();
  const parsed = RefreshTokenResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Mercado Pago token refresh response is invalid");

  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token ?? refreshToken,
    expiresAt: parsed.data.expires_in ? new Date(Date.now() + parsed.data.expires_in * 1000) : null,
    scope: parsed.data.scope ?? null,
    mercadoPagoUserId: parsed.data.user_id == null ? null : String(parsed.data.user_id),
    publicKey: parsed.data.public_key ?? null,
    liveMode: parsed.data.live_mode ?? null,
  };
}
