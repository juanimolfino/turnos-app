import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, upsertClubMercadoPagoCredentials } from "@/lib/db/queries";
import { MERCADOPAGO_OAUTH_STATE_COOKIE, exchangeMercadoPagoAuthorizationCode } from "@/lib/mercadopago/oauth";

function settingsUrl(status: "connected" | "error", requestUrl: string) {
  return new URL(`/ajustes?mp=${status}`, requestUrl);
}

function redirectClearingState(status: "connected" | "error", request: NextRequest) {
  const response = NextResponse.redirect(settingsUrl(status, request.url), 303);
  response.cookies.delete({ name: MERCADOPAGO_OAUTH_STATE_COOKIE, path: "/api/mercadopago/oauth" });
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return redirectClearingState("error", request);

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get(MERCADOPAGO_OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectClearingState("error", request);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) return redirectClearingState("error", request);

  try {
    const tokens = await exchangeMercadoPagoAuthorizationCode(code);
    await upsertClubMercadoPagoCredentials(profile.clubId, tokens);
    return redirectClearingState("connected", request);
  } catch {
    return redirectClearingState("error", request);
  }
}
