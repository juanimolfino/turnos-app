import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateApiKey,
  getClubById,
  getClubMercadoPagoConnectionStatus,
  getClubOpeningWindow,
  getUserByAuthId,
  setClubOpeningWindow,
  updateClub,
  updateClubCourtPrices,
} from "@/lib/db/queries";
import { validateOpeningWindow } from "@/lib/agenda/opening-hours";

const schema = z.object({
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  requiresPayment: z.boolean().optional(),
  paymentMode: z.enum(["none", "partial", "full"]).optional(),
  depositPct: z.number().int().min(1).max(100).optional(),
  refundEnabled: z.boolean().optional(),
  refundCutoffHours: z.number().int().min(1).max(720).optional(),
  paymentDeadlineHours: z.number().int().min(1).max(168).optional(),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
  courtPrices: z.array(z.object({
    courtId: z.string().uuid(),
    price: z.number().int().min(0).max(10_000_000),
  })).optional(),
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
    paymentMode: club.paymentMode,
    depositPct: club.depositPct,
    refundEnabled: club.refundEnabled,
    refundCutoffHours: club.refundCutoffHours,
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

  const [club, openingWindow] = await Promise.all([
    getClubById(profile.clubId),
    getClubOpeningWindow(profile.clubId),
  ]);
  return NextResponse.json({ club: { ...publicClubSettings(club), openingWindow } });
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

  const existingClub = await getClubById(profile.clubId);
  if (!existingClub) return NextResponse.json({ error: "Sin club" }, { status: 403 });

  const { generateApiKey: genKey, courtPrices, openTime, closeTime, ...updateData } = parsed.data;

  // Horario de atención: si vino open/close, validar y guardar (7 filas de opening_hours).
  if (openTime !== undefined || closeTime !== undefined) {
    const current = await getClubOpeningWindow(profile.clubId);
    const validated = validateOpeningWindow({
      open: openTime ?? current.open,
      close: closeTime ?? current.close,
    });
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    await setClubOpeningWindow(profile.clubId, validated.value.open, validated.value.close);
  }

  const nextPaymentMode =
    updateData.paymentMode ??
    (updateData.requiresPayment === true ? "full" : updateData.requiresPayment === false ? "none" : existingClub.paymentMode);
  if (nextPaymentMode !== "none") {
    const mercadoPago = await getClubMercadoPagoConnectionStatus(profile.clubId);
    if (!mercadoPago.connected) {
      return NextResponse.json({ error: "Conectá Mercado Pago antes de pedir pago online." }, { status: 409 });
    }
  }

  if (updateData.paymentMode) {
    updateData.requiresPayment = updateData.paymentMode !== "none";
  } else if (updateData.requiresPayment === true) {
    updateData.paymentMode = "full";
  } else if (updateData.requiresPayment === false) {
    updateData.paymentMode = "none";
  }

  let club = existingClub;
  if (Object.keys(updateData).length > 0) {
    club = await updateClub(profile.clubId, updateData);
  }

  if (courtPrices?.length) {
    await updateClubCourtPrices(profile.clubId, courtPrices);
  }

  let apiKey = club.apiKey;
  if (genKey) {
    apiKey = await generateApiKey(profile.clubId);
  }

  const openingWindow = await getClubOpeningWindow(profile.clubId);
  return NextResponse.json({ club: { ...publicClubSettings(club), apiKey, openingWindow } });
}
