import { NextResponse } from "next/server";
import { InvalidWebhookSignatureError, WebhookSignatureValidator } from "mercadopago";
import { addCredits } from "@/lib/db/queries";
import { getMercadoPagoPayment } from "@/lib/mercadopago/client";
import { getCreditPack } from "@/lib/stripe/pricing";

type MercadoPagoWebhookBody = {
  type?: string;
  action?: string;
  data?: { id?: string | number };
};

function parseExternalReference(externalReference?: string | null) {
  const [kind, userId, packId] = String(externalReference ?? "").split(":");
  if (kind !== "credits" || !userId || !packId) return null;
  return { userId, packId };
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as MercadoPagoWebhookBody;
  const dataId = url.searchParams.get("data.id") ?? String(body.data?.id ?? "");

  if (!dataId) return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
  if (!process.env.MERCADOPAGO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "MERCADOPAGO_WEBHOOK_SECRET is required" }, { status: 500 });
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId,
      secret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
      toleranceSeconds: 300
    });
  } catch (error) {
    const message = error instanceof InvalidWebhookSignatureError ? error.reason : "Invalid webhook signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (body.type !== "payment" && !body.action?.startsWith("payment.")) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const payment = await getMercadoPagoPayment().get({ id: dataId });
  if (payment.status !== "approved") {
    return NextResponse.json({ received: true, status: payment.status ?? "unknown" });
  }

  const reference = parseExternalReference(payment.external_reference);
  const metadata = payment.metadata ?? {};
  const userId = String(metadata.user_id ?? metadata.userId ?? reference?.userId ?? "");
  const packId = String(metadata.pack_id ?? metadata.packId ?? reference?.packId ?? "");
  const pack = getCreditPack(packId);

  if (!userId || !pack) {
    return NextResponse.json({ error: "Missing payment metadata" }, { status: 400 });
  }

  await addCredits(userId, pack.credits, {
    provider: "mercadopago",
    kind: "credits",
    paymentId: payment.id,
    packId: pack.id,
    currency: payment.currency_id,
    amountCents: typeof payment.transaction_amount === "number" ? Math.round(payment.transaction_amount * 100) : null,
    status: payment.status,
    statusDetail: payment.status_detail
  }, `mp_payment:${payment.id}`);

  return NextResponse.json({ received: true });
}
