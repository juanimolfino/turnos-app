import { redirect } from "next/navigation";
import { createSupabaseReadOnlyServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, getClubCourts, getWeekAgenda, getClubOpeningWindow } from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import { clubs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { todayInTz } from "@/lib/tz";
import { AgendaWeekClient } from "@/components/dashboard/agenda-week-client";

export const metadata = { title: "Agenda semanal" };

// Lunes de la semana que contiene `dateStr` (YYYY-MM-DD)
function mondayOf(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const js = d.getDay(); // 0=Dom … 6=Sáb
  const diff = js === 0 ? -6 : 1 - js; // retroceder hasta lunes
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
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
          Agenda semanal
        </div>
        <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: "36px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#6B6660", marginBottom: 8 }}>
            Tu cuenta aún no tiene una cancha asignada.
          </div>
          <div style={{ fontSize: 14, color: "#928B7E" }}>
            Completá tu registro o pedile al Super Admin que te asigne un club.
          </div>
        </div>
      </div>
    );
  }

  const db = getDb();
  const [club] = await db.select().from(clubs).where(eq(clubs.id, profile.clubId));
  const tz = club?.timezone ?? "America/Argentina/Buenos_Aires";

  const { week } = await searchParams;
  const today = todayInTz(tz);
  const weekStart = mondayOf(week ?? today);
  const weekEnd = addDays(weekStart, 6);

  const [courts, blocks, openingWindow] = await Promise.all([
    getClubCourts(profile.clubId),
    getWeekAgenda(profile.clubId, weekStart, weekEnd),
    getClubOpeningWindow(profile.clubId),
  ]);

  return (
    <AgendaWeekClient
      courts={courts.map((c) => ({ id: c.id, name: c.name }))}
      blocks={blocks}
      weekStart={weekStart}
      today={today}
      openingWindow={openingWindow}
    />
  );
}
