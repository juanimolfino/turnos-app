import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, getClubNotifications, markClubNotificationsRead } from "@/lib/db/queries";

// Campana del panel. GET: feed de notificaciones del club (con "de quién y cuándo"
// joineado) + total sin leer. POST: marca todo como leído al abrir la campana.
// Ambos scopeados al club del admin autenticado; nunca reciben un clubId del cliente.

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId || profile.role !== "admin") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { items, unread } = await getClubNotifications(profile.clubId);
  return NextResponse.json({ items, unread });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId || profile.role !== "admin") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  if (body?.action !== "markRead") {
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  }

  const marked = await markClubNotificationsRead(profile.clubId);
  return NextResponse.json({ ok: true, marked });
}
