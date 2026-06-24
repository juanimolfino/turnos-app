import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, getBookingById, cancelBooking } from "@/lib/db/queries";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) return NextResponse.json({ error: "Sin club" }, { status: 403 });

  const { id } = await params;
  const booking = await getBookingById(id);
  if (!booking || booking.clubId !== profile.clubId) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json({ booking });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) return NextResponse.json({ error: "Sin club" }, { status: 403 });

  const { id } = await params;
  const booking = await cancelBooking(id, profile.clubId);
  if (!booking) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json({ booking });
}
