import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const profile = await ensureUserProfile(user);
  if (profile?.role === "superadmin") {
    return NextResponse.redirect(new URL("/superadmin", request.url));
  }
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
