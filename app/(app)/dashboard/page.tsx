import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, getClubCourts, getWeekAgenda } from "@/lib/db/queries";
import { AgendaDayClient } from "@/components/dashboard/agenda-day-client";

export const metadata = { title: "Agenda del día" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
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

  const { date: dateParam } = await searchParams;
  const date = dateParam ?? new Date().toISOString().slice(0, 10);

  const [courts, blocks] = await Promise.all([
    getClubCourts(profile.clubId),
    getWeekAgenda(profile.clubId, date, date),
  ]);

  return (
    <AgendaDayClient
      courts={courts.map((c) => ({ id: c.id, name: c.name }))}
      blocks={blocks}
      date={date}
    />
  );
}
