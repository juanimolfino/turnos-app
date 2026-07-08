import { redirect } from "next/navigation";
import { createSupabaseReadOnlyServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, getClubCourts, getWeekAgenda } from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import { clubs, openingHours } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { todayInTz } from "@/lib/tz";
import { AgendaDayClient } from "@/components/dashboard/agenda-day-client";
import { DEFAULT_WINDOW } from "@/lib/bookings/availability";

export const metadata = { title: "Agenda del día" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createSupabaseReadOnlyServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getUserByAuthId(user.id);
  if (!profile) redirect("/login");

  if (!profile.clubId) {
    return (
      <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 28, color: "#221F1B" }}>
          Agenda del día
        </div>
        <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: "36px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#6B6660", marginBottom: 8 }}>
            Tu cuenta aún no tiene una cancha asignada.
          </div>
          <div style={{ fontSize: 14, color: "#928B7E" }}>
            Pedile al Super Admin que te asigne a un club para poder ver la agenda.
          </div>
        </div>
      </div>
    );
  }

  const db = getDb();
  const [club] = await db.select().from(clubs).where(eq(clubs.id, profile.clubId));
  const tz = club?.timezone ?? "America/Argentina/Buenos_Aires";

  const { date: dateParam } = await searchParams;
  const date = dateParam ?? todayInTz(tz);
  const weekday = (new Date(date + "T12:00:00").getDay() + 6) % 7;

  const [courts, blocks, opening] = await Promise.all([
    getClubCourts(profile.clubId),
    getWeekAgenda(profile.clubId, date, date),
    db.select().from(openingHours).where(and(eq(openingHours.clubId, profile.clubId), eq(openingHours.weekday, weekday))),
  ]);
  const openingWindow = {
    open: opening[0]?.openTime ?? DEFAULT_WINDOW.open,
    close: opening[0]?.closeTime ?? DEFAULT_WINDOW.close,
  };

  return (
    <AgendaDayClient
      courts={courts.map((c) => ({ id: c.id, name: c.name }))}
      blocks={blocks}
      date={date}
      clubName={club?.name ?? "Mi Club"}
      timezone={tz}
      openingWindow={openingWindow}
    />
  );
}
