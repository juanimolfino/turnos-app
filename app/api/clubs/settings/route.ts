import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, updateClub, generateApiKey, getClubById } from "@/lib/db/queries";

const schema = z.object({
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  requiresPayment: z.boolean().optional(),
  paymentDeadlineHours: z.number().int().min(1).max(168).optional(),
  generateApiKey: z.boolean().optional(),
});

function publicClubSettings(club: Awaited<ReturnType<typeof getClubById>>) {
  if (!club) return null;
  return {
    id: club.id,
    name: club.name,
    address: club.address,
    city: club.city,
    neighborhood: club.neighborhood,
    phone: club.phone,
    requiresPayment: club.requiresPayment,
    paymentDeadlineHours: club.paymentDeadlineHours,
    apiKey: club.apiKey,
  };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) return NextResponse.json({ error: "Sin club" }, { status: 403 });

  const club = await getClubById(profile.clubId);
  return NextResponse.json({ club: publicClubSettings(club) });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) return NextResponse.json({ error: "Sin club" }, { status: 403 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { generateApiKey: genKey, ...updateData } = parsed.data;

  const club = await updateClub(profile.clubId, updateData);

  let apiKey = club.apiKey;
  if (genKey) {
    apiKey = await generateApiKey(profile.clubId);
  }

  return NextResponse.json({ club: { ...publicClubSettings(club), apiKey } });
}
