import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ensureUserProfile } from "@/lib/db/queries";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
  const loginUrl = new URL("/login", request.url);
  const setPasswordUrl = new URL("/set-password", request.url);

  if (error || !code) {
    loginUrl.searchParams.set("error", error ?? "Enlace de invitación inválido");
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.redirect(setPasswordUrl);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, { ...options, path: "/" });
          });
        }
      }
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    loginUrl.searchParams.set("error", exchangeError.message);
    return NextResponse.redirect(loginUrl);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    loginUrl.searchParams.set("error", "No se pudo cargar el usuario");
    return NextResponse.redirect(loginUrl);
  }

  try {
    await ensureUserProfile(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear el perfil";
    console.error("Invite callback profile setup failed", { message });
    loginUrl.searchParams.set("error", message);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
