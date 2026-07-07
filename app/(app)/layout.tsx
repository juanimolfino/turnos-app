import { redirect } from "next/navigation";
import { createSupabaseReadOnlyServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, getClubMercadoPagoConnectionStatus } from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import { courts, clubs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AppShell } from "@/components/layout/app-shell";
import { computeOnboardingChecklist } from "@/lib/onboarding/checklist";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseReadOnlyServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getUserByAuthId(user.id);
  if (!profile) redirect("/login");
  if (profile.role === "superadmin") redirect("/superadmin");

  const db = getDb();
  let clubName = "Mi Club";
  let courtCount = 3;
  let initials = "MC";
  let clubInfoDone = false;
  let courtsDone = false;

  if (profile.clubId) {
    const [club] = await db.select().from(clubs).where(eq(clubs.id, profile.clubId));
    if (club) {
      clubName = club.name;
      initials = club.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
    }
    const allCourts = await db.select({ id: courts.id }).from(courts).where(eq(courts.clubId, profile.clubId));
    courtCount = allCourts.length;

    const activeCourts = await db
      .select({ id: courts.id, price: courts.price })
      .from(courts)
      .where(and(eq(courts.clubId, profile.clubId), eq(courts.active, true)));
    const mpStatus = await getClubMercadoPagoConnectionStatus(profile.clubId);

    ({ clubInfoDone, courtsDone } = computeOnboardingChecklist({
      address: club?.address,
      phone: club?.phone,
      paymentMode: club?.paymentMode,
      mercadoPagoConnected: mpStatus.connected,
      activeCourtPrices: activeCourts.map((c) => c.price),
    }));
  }

  return (
    <AppShell
      clubId={profile.clubId ?? null}
      clubName={clubName}
      courtCount={courtCount}
      initials={initials}
      clubInfoDone={clubInfoDone}
      courtsDone={courtsDone}
    >
      {children}
    </AppShell>
  );
}
