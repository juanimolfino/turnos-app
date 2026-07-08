import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, upsertClubMercadoPagoCredentials } from "@/lib/db/queries";
import { MERCADOPAGO_OAUTH_STATE_COOKIE, exchangeMercadoPagoAuthorizationCode } from "@/lib/mercadopago/oauth";

function settingsUrl(status: "connected" | "error", requestUrl: string, reason?: string) {
  const url = new URL(`/ajustes?mp=${status}`, requestUrl);
  if (reason) url.searchParams.set("mp_reason", reason);
  return url;
}

function redirectClearingState(status: "connected" | "error", request: NextRequest, reason?: string) {
  const response = NextResponse.redirect(settingsUrl(status, request.url, reason), 303);
  response.cookies.delete({ name: MERCADOPAGO_OAUTH_STATE_COOKIE, path: "/api/mercadopago/oauth" });
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Debug: MP puede volver con ?error / ?error_description. Antes lo descartábamos.
  const mpError = params.get("error");
  if (mpError) {
    const desc = params.get("error_description");
    console.error("[mp-oauth] callback: MP devolvió error", { error: mpError, error_description: desc });
    return redirectClearingState("error", request, "mp_denied");
  }

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get(MERCADOPAGO_OAUTH_STATE_COOKIE)?.value;
  if (!code) {
    console.error("[mp-oauth] callback: falta 'code' en el retorno de MP");
    return redirectClearingState("error", request, "no_code");
  }
  if (!state || !expectedState || state !== expectedState) {
    console.error("[mp-oauth] callback: state inválido", { hasState: !!state, hasCookie: !!expectedState, match: state === expectedState });
    return redirectClearingState("error", request, "state_mismatch");
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) {
    console.error("[mp-oauth] callback: usuario sin clubId");
    return redirectClearingState("error", request, "no_club");
  }

  try {
    const tokens = await exchangeMercadoPagoAuthorizationCode(code);
    await upsertClubMercadoPagoCredentials(profile.clubId, tokens);
    return redirectClearingState("connected", request);
  } catch (err) {
    // Debug: acá cae el detalle real del canje de token / persistencia.
    console.error("[mp-oauth] callback: fallo en canje o guardado de tokens", err instanceof Error ? err.message : err);
    return redirectClearingState("error", request, "token_exchange");
  }
}
