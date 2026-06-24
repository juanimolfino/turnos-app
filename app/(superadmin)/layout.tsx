import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId } from "@/lib/db/queries";
import { SuperadminSidebar } from "@/components/layout/superadmin-sidebar";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getUserByAuthId(user.id);
  if (!profile || profile.role !== "superadmin") redirect("/dashboard");

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <SuperadminSidebar adminEmail={profile.email} />
      <div style={{ flex: 1, minWidth: 0, height: "100vh", overflowY: "auto", background: "#F4F1EA" }}>
        {children}
      </div>
    </div>
  );
}
