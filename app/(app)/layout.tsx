import { redirect } from "next/navigation";
import { createSupabaseReadOnlyServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, getOnboardingChecklistInput } from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import { courts, clubs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

    const checklistInput = await getOnboardingChecklistInput(profile.clubId);
    ({ clubInfoDone, courtsDone } = computeOnboardingChecklist(checklistInput));
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
