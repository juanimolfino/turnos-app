import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, getClubCourts, setClubCourtCount, renameCourt } from "@/lib/db/queries";

async function requireClub() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) return { error: NextResponse.json({ error: "Sin club asignado" }, { status: 403 }) };
  return { clubId: profile.clubId };
}

export async function GET() {
  const { clubId, error } = await requireClub();
  if (error) return error;
  const courts = await getClubCourts(clubId!);
  return NextResponse.json({ courts });
}

const countSchema = z.object({ count: z.number().int().min(0).max(40) });

export async function POST(request: NextRequest) {
  const { clubId, error } = await requireClub();
  if (error) return error;
  const parsed = countSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });
  const courts = await setClubCourtCount(clubId!, parsed.data.count);
  return NextResponse.json({ courts });
}

const renameSchema = z.object({ courtId: z.string().uuid(), name: z.string().trim().min(1).max(60) });

export async function PATCH(request: NextRequest) {
  const { clubId, error } = await requireClub();
  if (error) return error;
  const parsed = renameSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const court = await renameCourt(clubId!, parsed.data.courtId, parsed.data.name);
  return NextResponse.json({ court });
}
