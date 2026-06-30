import { telegramAdapter } from "@/lib/bot/channels/telegram";
import { cancellationPolicyText } from "@/lib/bot/cancellation-policy-text";
import type { PaymentMode } from "@/lib/db/schema";

export type PaidBookingForNotification = {
  clubName: string;
  courtName: string;
  date: string;
  startTime: string;
  bookingCode: string | null;
  customerPhone: string | null;
  clubPaymentMode: PaymentMode;
  refundEnabled: boolean;
  refundCutoffHours: number;
};

function formatBookingDate(date: string) {
  try {
    return new Date(date + "T12:00:00").toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return date;
  }
}

export function pagoAcreditadoTexto(booking: PaidBookingForNotification) {
  const fecha = formatBookingDate(booking.date);
  const code = booking.bookingCode ? ` Tu código de reserva es ${booking.bookingCode}; guardalo para cancelar.` : "";
  const politica = cancellationPolicyText({
    paymentMode: booking.clubPaymentMode,
    refundEnabled: booking.refundEnabled,
    refundCutoffHours: booking.refundCutoffHours,
  });

  return `Pago acreditado. Tu reserva en ${booking.clubName} (${booking.courtName}) para el ${fecha} a las ${booking.startTime} quedó confirmada.${code} ${politica}`;
}

export async function avisarPagoAcreditadoPorTelegram(booking: PaidBookingForNotification) {
  if (!booking.customerPhone) return false;
  await telegramAdapter.send(booking.customerPhone, pagoAcreditadoTexto(booking));
  return true;
}
