import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId } from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import { clubs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AgendaGrid } from "@/components/dashboard/agenda-grid";

export const metadata = { title: "Agenda del día" };

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string }>
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

  const db = getDb();
  const [club] = await db.select().from(clubs).where(eq(clubs.id, profile.clubId));

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/agenda?date=${date}&clubId=${profile.clubId}`, { cache: "no-store" });
  const data = res.ok ? await res.json() : { courts: [], slots: [], hasMorningClasses: false };

  return (
    <AgendaGrid
      courts={data.courts}
      slots={data.slots}
      hasMorningClasses={data.hasMorningClasses}
      date={date}
      clubName={club?.name ?? "Mi Club"}
    />
  );
}
