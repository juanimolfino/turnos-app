import { redirect } from "next/navigation";
import { createSupabaseReadOnlyServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, getPayments } from "@/lib/db/queries";
import { PaymentsView } from "@/components/dashboard/payments-view";

export const metadata = { title: "Pagos" };

export default async function PagosPage() {
  const supabase = await createSupabaseReadOnlyServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) redirect("/login");

  const rows = await getPayments(profile.clubId);

  return (
    <PaymentsView
      rows={rows}
      showClub={false}
      subtitle="Movimientos de dinero de tu club: pagos acreditados y devoluciones, con la fecha exacta y el id de Mercado Pago para trazabilidad ante cualquier consulta."
    />
  );
}
