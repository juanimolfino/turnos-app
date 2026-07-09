import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentsView } from "@/components/dashboard/payments-view";
import type { PaymentRow } from "@/lib/db/queries";

const base: PaymentRow = {
  id: "b1", date: "2026-07-08", startTime: "15:00", endTime: "16:30",
  status: "confirmado", paymentStatus: "pagado", amount: 4000, origin: "bot",
  bookingCode: "HYS324", clubName: "Pádel Central", courtName: "Cancha 3",
  customerName: "Juan Pérez", customerPhone: "2314 555555",
  paidAt: new Date("2026-07-08T18:04:00Z"), refundedAt: null,
  mpPaymentId: "1663090", mpRefundId: null, refundStatus: null, paymentReviewReason: null,
};

const refunded: PaymentRow = {
  ...base, id: "b2", paymentStatus: "senado", amount: 2000, customerName: "Agos Gómez",
  courtName: "Cancha 1", status: "cancelado",
  refundedAt: new Date("2026-07-09T13:22:00Z"), mpRefundId: "998877", refundStatus: "refunded",
};

describe("PaymentsView", () => {
  it("muestra totales, pago acreditado y devolución con sus ids de MP", () => {
    const html = renderToStaticMarkup(<PaymentsView rows={[base, refunded]} showClub={false} subtitle="test" />);
    expect(html).toContain("Juan Pérez");
    expect(html).toContain("MP 1663090");        // id de pago
    expect(html).toContain("Devuelto");
    expect(html).toContain("MP 998877");          // id de refund
    expect(html).toContain("Acreditado");
    // Totales: cobrado 4000 + 2000 = 6000; devuelto 2000; neto 4000.
    expect(html).toContain("$6.000");
    expect(html).toContain("$2.000");
    expect(html).toContain("$4.000");
  });

  it("con showClub muestra la columna de club", () => {
    const html = renderToStaticMarkup(<PaymentsView rows={[base]} showClub subtitle="test" />);
    expect(html).toContain("Pádel Central");
  });

  it("traduce el motivo de revisión a texto legible", () => {
    const conRevision: PaymentRow = { ...base, paymentReviewReason: "amount_mismatch" };
    const html = renderToStaticMarkup(<PaymentsView rows={[conRevision]} showClub={false} subtitle="test" />);
    expect(html).toContain("Monto no coincide");
  });

  it("sin movimientos muestra un vacío claro", () => {
    const html = renderToStaticMarkup(<PaymentsView rows={[]} showClub={false} subtitle="test" />);
    expect(html).toMatch(/Todavía no hay movimientos/i);
  });
});
