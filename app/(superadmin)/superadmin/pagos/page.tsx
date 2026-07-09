import { getPayments } from "@/lib/db/queries";
import { PaymentsView } from "@/components/dashboard/payments-view";

export const metadata = { title: "Pagos · Super Admin" };

export default async function SuperadminPagosPage() {
  const rows = await getPayments(null);

  return (
    <PaymentsView
      rows={rows}
      showClub
      subtitle="Vista global de movimientos de dinero de todos los clubs: pagos acreditados y devoluciones, con fecha exacta e id de Mercado Pago para trazabilidad."
    />
  );
}
