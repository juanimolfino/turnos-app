import { redirect } from "next/navigation";
import { createSupabaseReadOnlyServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, listClubCustomers } from "@/lib/db/queries";
import { ClientesClient } from "@/components/dashboard/clientes-client";

export const metadata = { title: "Clientes" };

export default async function ClientesPage() {
  const supabase = await createSupabaseReadOnlyServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) redirect("/login");

  const customers = await listClubCustomers(profile.clubId);

  return <ClientesClient initialCustomers={customers} />;
}
