import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/db/queries";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const profile = await ensureUserProfile(user);
    return NextResponse.json({ ok: true, role: profile?.role ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("ensure-profile failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
