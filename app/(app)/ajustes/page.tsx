import { redirect } from "next/navigation";
import { createSupabaseReadOnlyServerClient } from "@/lib/supabase/server";
import { getClubMercadoPagoConnectionStatus, getClubOpeningHours, getUserByAuthId } from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import { courts, clubs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AjustesClient } from "@/components/dashboard/ajustes-client";

export const metadata = { title: "Ajustes" };

export default async function AjustesPage() {
  const supabase = await createSupabaseReadOnlyServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) redirect("/login");

  const db = getDb();
  const clubId = profile.clubId;

  const [allCourts, clubRow, mercadoPagoStatus, openingHourRows] = await Promise.all([
    db.select().from(courts).where(and(eq(courts.clubId, clubId), eq(courts.active, true))),
    db.select().from(clubs).where(eq(clubs.id, clubId)),
    getClubMercadoPagoConnectionStatus(clubId),
    getClubOpeningHours(clubId),
  ]);

  const club = clubRow[0];

  return <AjustesClient club={{
    address: club?.address,
    city: club?.city,
    neighborhood: club?.neighborhood,
    phone: club?.phone,
    requiresPayment: club?.requiresPayment,
    paymentMode: club?.paymentMode,
    depositPct: club?.depositPct,
    refundEnabled: club?.refundEnabled,
    refundCutoffHours: club?.refundCutoffHours,
    paymentDeadlineHours: club?.paymentDeadlineHours,
    courts: allCourts.map((court) => ({ id: court.id, name: court.name, price: court.price })),
    openingHours: openingHourRows,
    mercadoPago: mercadoPagoStatus,
  }} />;
}
