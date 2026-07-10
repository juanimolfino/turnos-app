import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureUserProfile, setOnboardingClubName } from "@/lib/db/queries";

const schema = z.object({
  clubName: z.string().trim().min(1, "El nombre de la cancha es requerido").max(120),
});

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  try {
    // Aseguramos que el perfil exista antes de actualizar el club.
    const profile = await ensureUserProfile(user);
    // SEGURIDAD: solo un admin (rol asignado por el flujo de invitación) puede
    // nombrar/crear su club. Sin esto, cualquier usuario auto-registrado (signup
    // abierto) podría auto-proveerse un club y colarse al panel.
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }
    const { clubId } = await setOnboardingClubName(user.id, parsed.data.clubName);
    return NextResponse.json({ ok: true, clubId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("onboarding failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
