import type { Channel, ChannelAdapter } from "@/lib/bot/types";
import { telegramAdapter } from "@/lib/bot/channels/telegram";
import { whatsappAdapter } from "@/lib/bot/channels/whatsapp";
import { cancellationPolicyText } from "@/lib/bot/cancellation-policy-text";
import type { PaymentMode } from "@/lib/db/schema";

const adapters: Record<Channel, ChannelAdapter> = {
  telegram: telegramAdapter,
  whatsapp: whatsappAdapter,
};

export type PaidBookingForNotification = {
  clubName: string;
  courtName: string;
  date: string;
  startTime: string;
  bookingCode: string | null;
  customerPhone: string | null;
  customerChannel?: string | null;
  customerChannelUserId?: string | null;
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

function isChannel(value: string | null | undefined): value is Channel {
  return value === "telegram" || value === "whatsapp";
}

function resolvePaymentNotificationTarget(booking: PaidBookingForNotification): { channel: Channel; userId: string } | null {
  if (isChannel(booking.customerChannel) && booking.customerChannelUserId) {
    return { channel: booking.customerChannel, userId: booking.customerChannelUserId };
  }

  // Backward compatibility: old bot bookings only stored the Telegram chat id in customerPhone.
  if (booking.customerPhone) {
    return { channel: "telegram", userId: booking.customerPhone };
  }

  return null;
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

export async function avisarPagoAcreditadoPorCanal(booking: PaidBookingForNotification) {
  const target = resolvePaymentNotificationTarget(booking);
  if (!target) return false;

  await adapters[target.channel].send(target.userId, pagoAcreditadoTexto(booking));
  return true;
}

export const avisarPagoAcreditadoPorTelegram = avisarPagoAcreditadoPorCanal;
