import { NextResponse } from "next/server";
import { avisarPagoAcreditadoPorCanal } from "@/lib/bot/payment-confirmation";
import {
  addCredits,
  confirmBotHoldPayment,
  createOperationalIncident,
  createPaymentReviewNotification,
  getBookingPaymentContext,
} from "@/lib/db/queries";
import { getMercadoPagoPayment, getMercadoPagoPaymentForAccessToken } from "@/lib/mercadopago/client";
import { inspectMercadoPagoWebhookSignature } from "@/lib/mercadopago/webhook-signature";
import { getCreditPack } from "@/lib/stripe/pricing";

type MercadoPagoWebhookBody = {
  id?: string | number;
  type?: string;
  action?: string;
  data?: { id?: string | number };
};

function parseExternalReference(externalReference?: string | null) {
  const [kind, userId, packId] = String(externalReference ?? "").split(":");
  if (kind !== "credits" || !userId || !packId) return null;
  return { userId, packId };
}

function parseBookingReference(externalReference?: string | null) {
  const [kind, bookingId] = String(externalReference ?? "").split(":");
  if (kind !== "booking" || !bookingId) return null;
  return { bookingId };
}

function isPaymentEvent(body: MercadoPagoWebhookBody) {
  return body.type === "payment" || Boolean(body.action?.startsWith("payment."));
}

function bookingPaymentStatus(paymentMode: unknown, fallbackMode: string) {
  const mode = paymentMode === "partial" || paymentMode === "full" ? paymentMode : fallbackMode;
  return mode === "partial" ? "senado" : "pagado";
}

async function recordMpIncident(input: {
  type: string;
  message: string;
  severity?: "warning" | "critical";
  bookingId?: string | null;
  clubId?: string | null;
  customerId?: string | null;
  paymentId?: string | number | null;
  requestPath: string;
  details?: Record<string, unknown>;
}) {
  try {
    await createOperationalIncident({
      source: "mercadopago_webhook",
      type: input.type,
      severity: input.severity ?? "warning",
      bookingId: input.bookingId,
      clubId: input.clubId,
      customerId: input.customerId,
      paymentId: input.paymentId,
      requestPath: input.requestPath,
      message: input.message,
      details: input.details ?? null,
    });
  } catch (error) {
    console.error("[mp webhook] no se pudo guardar incidente operativo", {
      type: input.type,
      bookingId: input.bookingId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as MercadoPagoWebhookBody;
  const dataId = url.searchParams.get("data.id") ?? String(body.data?.id ?? "");

  if (!dataId) return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
  if (!process.env.MERCADOPAGO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "MERCADOPAGO_WEBHOOK_SECRET is required" }, { status: 500 });
  }

  const signatureInspection = inspectMercadoPagoWebhookSignature({
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
    secret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
  });
  if (!signatureInspection.valid) {
    console.warn("[mp webhook] firma inválida", {
      manifest: "manifest" in signatureInspection ? signatureInspection.manifest : null,
      receivedV1: "receivedV1" in signatureInspection ? signatureInspection.receivedV1 : null,
      expectedHash: "expectedHash" in signatureInspection ? signatureInspection.expectedHash : null,
      reason: "reason" in signatureInspection ? signatureInspection.reason : "hash_mismatch",
      dataId,
      notificationId: "id" in body ? body.id : null,
    });
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  if (!isPaymentEvent(body)) return NextResponse.json({ received: true, ignored: true });

  try {
  const bookingIdHint = url.searchParams.get("booking_id");
  let booking = bookingIdHint ? await getBookingPaymentContext(bookingIdHint) : null;
  let payment = null as Awaited<ReturnType<ReturnType<typeof getMercadoPagoPayment>["get"]>> | null;

  if (bookingIdHint) {
    if (!booking) {
      console.warn("[mp webhook] booking_id de notification_url no existe", { bookingId: bookingIdHint, paymentId: dataId });
      await recordMpIncident({
        type: "booking_missing",
        severity: "critical",
        message: "Webhook de Mercado Pago llego con booking_id inexistente",
        paymentId: dataId,
        requestPath: url.pathname,
        details: { missingBookingId: bookingIdHint },
      });
      return NextResponse.json({ received: true, kind: "booking", missingBooking: true });
    }
    if (!booking.mercadoPagoAccessToken) {
      console.warn("[mp webhook] booking sin credencial de Mercado Pago", { bookingId: bookingIdHint, paymentId: dataId });
      await recordMpIncident({
        type: "missing_mercadopago_credentials",
        severity: "critical",
        message: "Webhook de Mercado Pago no pudo consultar el pago por falta de credenciales del club",
        bookingId: booking.id,
        clubId: booking.clubId,
        paymentId: dataId,
        requestPath: url.pathname,
      });
      return NextResponse.json({ received: true, kind: "booking", missingCredentials: true });
    }
    payment = await getMercadoPagoPaymentForAccessToken(booking.mercadoPagoAccessToken).get({ id: dataId });
  } else {
    payment = await getMercadoPagoPayment().get({ id: dataId });
  }

  const bookingReference = parseBookingReference(payment.external_reference);
  if (bookingReference) {
    if (booking && booking.id !== bookingReference.bookingId) {
      console.warn("[mp webhook] external_reference no coincide con booking_id de notification_url", {
        bookingId: booking.id,
        externalReference: payment.external_reference,
        paymentId: payment.id ?? dataId,
      });
      await recordMpIncident({
        type: "reference_mismatch",
        severity: "critical",
        message: "Webhook de Mercado Pago no coincide con la reserva esperada",
        bookingId: booking.id,
        clubId: booking.clubId,
        paymentId: payment.id ?? dataId,
        requestPath: url.pathname,
        details: { externalReference: payment.external_reference },
      });
      return NextResponse.json({ received: true, kind: "booking", referenceMismatch: true });
    }

    if (!booking) {
      booking = await getBookingPaymentContext(bookingReference.bookingId);
      if (!booking) {
        console.warn("[mp webhook] external_reference apunta a reserva inexistente", {
          bookingId: bookingReference.bookingId,
          paymentId: payment.id ?? dataId,
        });
        await recordMpIncident({
          type: "booking_missing",
          severity: "critical",
          message: "Pago de Mercado Pago apunta a una reserva inexistente",
          paymentId: payment.id ?? dataId,
          requestPath: url.pathname,
          details: { missingBookingId: bookingReference.bookingId },
        });
        return NextResponse.json({ received: true, kind: "booking", missingBooking: true });
      }
      if (!booking.mercadoPagoAccessToken) {
        console.warn("[mp webhook] reserva sin credencial de Mercado Pago", {
          bookingId: bookingReference.bookingId,
          paymentId: payment.id ?? dataId,
        });
        await recordMpIncident({
          type: "missing_mercadopago_credentials",
          severity: "critical",
          message: "Pago de Mercado Pago apunta a una reserva sin credenciales del club",
          bookingId: booking.id,
          clubId: booking.clubId,
          paymentId: payment.id ?? dataId,
          requestPath: url.pathname,
        });
        return NextResponse.json({ received: true, kind: "booking", missingCredentials: true });
      }

      payment = await getMercadoPagoPaymentForAccessToken(booking.mercadoPagoAccessToken).get({ id: dataId });
      const verifiedReference = parseBookingReference(payment.external_reference);
      if (verifiedReference?.bookingId !== booking.id) {
        console.warn("[mp webhook] pago verificado con token del club no coincide con la reserva", {
          bookingId: booking.id,
          externalReference: payment.external_reference,
          paymentId: payment.id ?? dataId,
        });
        await recordMpIncident({
          type: "reference_mismatch",
          severity: "critical",
          message: "Pago verificado con token del club no coincide con la reserva",
          bookingId: booking.id,
          clubId: booking.clubId,
          paymentId: payment.id ?? dataId,
          requestPath: url.pathname,
          details: { externalReference: payment.external_reference },
        });
        return NextResponse.json({ received: true, kind: "booking", referenceMismatch: true });
      }
    }

    if (payment.status !== "approved") {
      return NextResponse.json({ received: true, kind: "booking", status: payment.status ?? "unknown" });
    }

    const result = await confirmBotHoldPayment({
      bookingId: booking.id,
      mpPaymentId: String(payment.id ?? dataId),
      paymentStatus: bookingPaymentStatus(payment.metadata?.payment_mode, booking.clubPaymentMode),
      paidAmount: typeof payment.transaction_amount === "number" ? payment.transaction_amount : null,
    });

    if (result.status === "confirmed") {
      const { mercadoPagoAccessToken: _token, ...safeBooking } = result.booking;
      await avisarPagoAcreditadoPorCanal(safeBooking).catch(async (error) => {
        console.error("[mp webhook] reserva confirmada pero falló el aviso al cliente", {
          bookingId: result.booking.id,
          paymentId: payment?.id ?? dataId,
          error: error instanceof Error ? error.message : String(error),
        });
        await recordMpIncident({
          type: "customer_notification_failed",
          severity: "critical",
          message: "Reserva confirmada pero fallo el aviso final al cliente",
          bookingId: result.booking.id,
          clubId: result.booking.clubId,
          customerId: result.booking.customerId,
          paymentId: payment?.id ?? dataId,
          requestPath: url.pathname,
          details: { error: error instanceof Error ? error.message : String(error) },
        });
        await createPaymentReviewNotification(result.booking.clubId, result.booking.id).catch((notificationError) => {
          console.error("[mp webhook] no se pudo crear alerta de pago para revisión", {
            bookingId: result.booking.id,
            error: notificationError instanceof Error ? notificationError.message : String(notificationError),
          });
        });
      });
      return NextResponse.json({ received: true, kind: "booking", confirmed: true });
    }

    if (result.status === "not_confirmed") {
      console.warn("[mp webhook] pago aprobado no confirmó la reserva; requiere revisión/refund", {
        bookingId: result.booking.id,
        paymentId: payment.id ?? dataId,
        reason: result.reason,
      });
      await recordMpIncident({
        type: "approved_payment_not_confirmed",
        severity: "critical",
        message: "Pago aprobado no confirmo la reserva",
        bookingId: result.booking.id,
        clubId: result.booking.clubId,
        customerId: result.booking.customerId,
        paymentId: payment.id ?? dataId,
        requestPath: url.pathname,
        details: { reason: result.reason },
      });
      await createPaymentReviewNotification(result.booking.clubId, result.booking.id).catch((notificationError) => {
        console.error("[mp webhook] no se pudo crear alerta de pago para revisión", {
          bookingId: result.booking.id,
          error: notificationError instanceof Error ? notificationError.message : String(notificationError),
        });
      });
      return NextResponse.json({ received: true, kind: "booking", confirmed: false, reason: result.reason });
    }

    return NextResponse.json({
      received: true,
      kind: "booking",
      alreadyProcessed: result.status === "already_processed",
    });
  }

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
    statusDetail: payment.status_detail,
  }, `mp_payment:${payment.id}`);

  return NextResponse.json({ received: true });
  } catch (error) {
    await recordMpIncident({
      type: "webhook_processing_error",
      severity: "critical",
      message: "Error inesperado procesando webhook de Mercado Pago",
      paymentId: dataId,
      requestPath: url.pathname,
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
