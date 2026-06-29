import { telegramAdapter } from "@/lib/bot/channels/telegram";

export type PaidBookingForNotification = {
  clubName: string;
  courtName: string;
  date: string;
  startTime: string;
  bookingCode: string | null;
  customerPhone: string | null;
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

  return `Pago acreditado. Tu reserva en ${booking.clubName} (${booking.courtName}) para el ${fecha} a las ${booking.startTime} quedó confirmada.${code} Si necesitás cancelar, escribime "cancelar" y tu código de reserva.`;
}

export async function avisarPagoAcreditadoPorTelegram(booking: PaidBookingForNotification) {
  if (!booking.customerPhone) return false;
  await telegramAdapter.send(booking.customerPhone, pagoAcreditadoTexto(booking));
  return true;
}
