import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUserByAuthId, getUserByEmail, deleteAdminCascade, DeleteAdminError } from "@/lib/db/queries";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = (await getUserByAuthId(user.id)) ?? (user.email ? await getUserByEmail(user.email) : null);
  if (!profile || profile.role !== "superadmin") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  if (id === profile.id) {
    return NextResponse.json({ error: "No podés borrarte a vos mismo." }, { status: 400 });
  }

  try {
    const result = await deleteAdminCascade(id);

    const { error: authErr } = await getSupabaseAdmin().auth.admin.deleteUser(result.authUserId);
    if (authErr) {
      console.warn("[admin delete] no se pudo borrar el usuario de Supabase Auth", {
        authUserId: result.authUserId,
        error: authErr.message,
      });
    }

    return NextResponse.json({ ok: true, clubDeleted: result.clubDeleted });
  } catch (err) {
    if (err instanceof DeleteAdminError) {
      const status = err.code === "ADMIN_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.message }, { status });
    }
    console.error("[admin delete] error inesperado", err);
    return NextResponse.json({ error: "No se pudo borrar el admin." }, { status: 500 });
  }
}
