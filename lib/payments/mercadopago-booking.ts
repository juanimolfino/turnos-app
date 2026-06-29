import type { PaymentMode } from "@/lib/db/schema";
import {
  getClubMercadoPagoCredentialsForServer,
  saveBookingMercadoPagoPreference,
} from "@/lib/db/queries";
import { getMercadoPagoPreferenceForAccessToken } from "@/lib/mercadopago/client";
import { calculateMarketplaceFee } from "@/lib/payments/marketplace-fee";

type PreferenceCreateBody = Parameters<ReturnType<typeof getMercadoPagoPreferenceForAccessToken>["create"]>[0]["body"];

type BookingPaymentPreferenceInput = {
  bookingId: string;
  bookingCode: string;
  clubId: string;
  clubName: string;
  courtName: string;
  date: string;
  startTime: string;
  amount: number;
  paymentMode: Exclude<PaymentMode, "none">;
  heldUntil: Date;
};

export type BookingPaymentPreferenceResult = {
  preferenceId: string;
  initPoint: string;
};

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function formatDescription(input: BookingPaymentPreferenceInput) {
  const tipo = input.paymentMode === "partial" ? "Seña" : "Pago total";
  return `${tipo} reserva pádel - ${input.clubName} - ${input.date} ${input.startTime}`;
}

export async function createBookingPaymentPreference(
  input: BookingPaymentPreferenceInput,
): Promise<BookingPaymentPreferenceResult> {
  const credentials = await getClubMercadoPagoCredentialsForServer(input.clubId);
  if (!credentials?.accessToken) throw new Error("Mercado Pago no conectado para el club");

  const baseUrl = appUrl();
  const currency = process.env.MERCADOPAGO_CURRENCY ?? "ARS";
  const marketplaceFee = calculateMarketplaceFee(input.amount);
  const title = formatDescription(input);
  const externalReference = `booking:${input.bookingId}`;

  const preferenceBody: PreferenceCreateBody = {
    items: [
      {
        id: input.bookingId,
        title,
        description: `${input.clubName} (${input.courtName}) ${input.date} ${input.startTime}`,
        quantity: 1,
        currency_id: currency,
        unit_price: input.amount,
      },
    ],
    back_urls: {
      success: `${baseUrl}/pago/resultado?status=success`,
      failure: `${baseUrl}/pago/resultado?status=failure`,
      pending: `${baseUrl}/pago/resultado?status=pending`,
    },
    auto_return: "approved",
    external_reference: externalReference,
    metadata: {
      provider: "mercadopago",
      kind: "booking",
      booking_id: input.bookingId,
      booking_code: input.bookingCode,
      club_id: input.clubId,
      payment_mode: input.paymentMode,
    },
    notification_url: `${baseUrl}/api/mercadopago/webhook?source_news=webhooks`,
    expires: true,
    expiration_date_to: input.heldUntil.toISOString(),
  };

  if (marketplaceFee > 0) preferenceBody.marketplace_fee = marketplaceFee;

  const preference = await getMercadoPagoPreferenceForAccessToken(credentials.accessToken).create({
    body: preferenceBody,
  });

  const initPoint = credentials.accessToken.startsWith("TEST-")
    ? preference.sandbox_init_point ?? preference.init_point
    : preference.init_point ?? preference.sandbox_init_point;
  const preferenceId = preference.id ? String(preference.id) : "";

  if (!preferenceId) throw new Error("Mercado Pago no devolvió preference id");
  if (!initPoint) throw new Error("Mercado Pago no devolvió link de pago");

  await saveBookingMercadoPagoPreference(input.bookingId, preferenceId);

  return { preferenceId, initPoint };
}
