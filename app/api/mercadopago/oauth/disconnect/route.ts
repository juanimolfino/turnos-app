import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { disconnectClubMercadoPago, getUserByAuthId } from "@/lib/db/queries";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) return NextResponse.json({ error: "Sin club" }, { status: 403 });

  await disconnectClubMercadoPago(profile.clubId);

  return NextResponse.json({
    mercadoPago: { connected: false },
    club: {
      paymentMode: "none",
      requiresPayment: false,
    },
  });
}
