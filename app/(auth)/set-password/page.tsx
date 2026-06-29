import { redirect } from "next/navigation";
import { createSupabaseReadOnlyServerClient } from "@/lib/supabase/server";
import { getUserByAuthId } from "@/lib/db/queries";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const metadata = { title: "Crear contraseña" };

export default async function SetPasswordPage() {
  const supabase = await createSupabaseReadOnlyServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getUserByAuthId(user.id);
  const invitedRole = (user.user_metadata?.invited_role as string | undefined) ?? null;
  const role = profile?.role ?? invitedRole;
  const isAdmin = role === "admin";

  const venueName =
    profile?.venueName ??
    (user.user_metadata?.venue_name as string | undefined) ??
    "";

  return (
    <SetPasswordForm askClubName={isAdmin} initialClubName={venueName} />
  );
}
