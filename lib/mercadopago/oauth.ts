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

  if (!response.ok) throw new Error("Mercado Pago OAuth token exchange failed");

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
