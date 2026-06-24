import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUserByAuthId } from "@/lib/db/queries";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["superadmin", "admin"]),
  venueName: z.string().min(1).optional()
});

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const profile = await getUserByAuthId(user.id);
  if (!profile || profile.role !== "superadmin") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const { email, role, venueName } = parsed.data;

  if (role === "admin" && !venueName) {
    return NextResponse.json({ error: "El nombre de la cancha es requerido para admins" }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
  const admin = getSupabaseAdmin();

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/invite/callback`,
    data: {
      invited_role: role,
      ...(venueName ? { venue_name: venueName } : {})
    }
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
