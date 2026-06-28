import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId } from "@/lib/db/queries";
import { MERCADOPAGO_OAUTH_STATE_COOKIE, buildMercadoPagoAuthorizationUrl } from "@/lib/mercadopago/oauth";

const STATE_TTL_SECONDS = 10 * 60;

function settingsUrl(status: "error", requestUrl: string) {
  return new URL(`/ajustes?mp=${status}`, requestUrl);
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) return NextResponse.redirect(settingsUrl("error", request.url), 303);

  try {
    const state = randomBytes(24).toString("hex");
    const response = NextResponse.redirect(buildMercadoPagoAuthorizationUrl(state), 303);
    response.cookies.set(MERCADOPAGO_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/mercadopago/oauth",
      maxAge: STATE_TTL_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.redirect(settingsUrl("error", request.url), 303);
  }
}
