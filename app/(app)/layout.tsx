import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId } from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import { courts, clubs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Sidebar } from "@/components/layout/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getUserByAuthId(user.id);
  if (!profile) redirect("/login");
  if (profile.role === "superadmin") redirect("/superadmin");

  const db = getDb();
  let clubName = "Mi Club";
  let courtCount = 3;
  let initials = "MC";

  if (profile.clubId) {
    const [club] = await db.select().from(clubs).where(eq(clubs.id, profile.clubId));
    if (club) {
      clubName = club.name;
      initials = club.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
    }
    const allCourts = await db.select({ id: courts.id }).from(courts).where(eq(courts.clubId, profile.clubId));
    courtCount = allCourts.length;
  }

  return (
    <div className="app-layout" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar clubName={clubName} courtCount={courtCount} initials={initials} />
      <div className="main-content" style={{ flex: 1, minWidth: 0, height: "100vh", overflowY: "auto", background: "#F4F1EA" }}>
        {children}
      </div>
    </div>
  );
}
