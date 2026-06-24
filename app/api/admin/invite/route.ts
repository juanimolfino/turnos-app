import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUserByAuthId, createClub, deleteDbUserByEmail } from "@/lib/db/queries";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["superadmin", "admin"]),
  venueName: z.string().min(1).optional()
});

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = await getUserByAuthId(user.id);
  if (!profile || profile.role !== "superadmin") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { email, role, venueName } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
  const adminClient = getSupabaseAdmin();

  // Si ya existe un usuario en Auth con ese email, decidimos según su estado:
  //  - confirmado (cuenta real, ya creó su contraseña) → no se puede reinvitar.
  //  - pendiente (invitación que nunca se completó) → lo borramos y reinvitamos limpio.
  const { data: list } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  const existing = (list?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === normalizedEmail
  );

  if (existing) {
    if (existing.email_confirmed_at) {
      return NextResponse.json(
        { error: "Ese email ya tiene una cuenta activa." },
        { status: 409 }
      );
    }
    // Invitación pendiente: limpiamos para poder reinvitar sin el error "ya registrado".
    await deleteDbUserByEmail(normalizedEmail);
    const { error: delErr } = await adminClient.auth.admin.deleteUser(existing.id);
    if (delErr) {
      return NextResponse.json(
        { error: `No se pudo reiniciar la invitación: ${delErr.message}` },
        { status: 400 }
      );
    }
  }

  // El nombre de la cancha es opcional: si el superadmin lo carga, se pre-crea el club;
  // si no, el admin lo define en su onboarding (set-password).
  let clubId: string | undefined;
  if (role === "admin" && venueName) {
    const club = await createClub(venueName);
    clubId = club.id;
  }

  const { error } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo: `${origin}/invite/callback`,
    data: {
      invited_role: role,
      ...(venueName ? { venue_name: venueName } : {}),
      ...(clubId ? { club_id: clubId } : {}),
    }
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
