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
  if (!profile?.clubId) redirect("/login");

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
