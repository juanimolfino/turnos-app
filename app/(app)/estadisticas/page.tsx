import { redirect } from "next/navigation";
import { createSupabaseReadOnlyServerClient } from "@/lib/supabase/server";
import { getUserByAuthId } from "@/lib/db/queries";
import { EstadisticasClient } from "@/components/dashboard/estadisticas-client";

export const metadata = { title: "Estadísticas" };

export default async function EstadisticasPage() {
  const supabase = await createSupabaseReadOnlyServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) redirect("/login");

  return <EstadisticasClient />;
}
