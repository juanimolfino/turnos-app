import { getMercadoPagoPaymentRefundForAccessToken } from "@/lib/mercadopago/client";

export type MercadoPagoRefundResult = {
  refundId: string;
  status: string | null;
};

export async function refundMercadoPagoPayment(input: {
  accessToken: string;
  paymentId: string;
}): Promise<MercadoPagoRefundResult> {
  const refund = await getMercadoPagoPaymentRefundForAccessToken(input.accessToken).total({
    payment_id: input.paymentId,
  });
  if (refund.id == null) throw new Error("Mercado Pago no devolvió refund_id");
  return {
    refundId: String(refund.id),
    status: refund.status ?? null,
  };
}
