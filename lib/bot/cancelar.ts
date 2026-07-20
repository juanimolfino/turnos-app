import { and, eq, isNull, ne, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, clubs, courts } from "@/lib/db/schema";
import { createBookingCancellationNotification, getClubMercadoPagoCredentialsForServer } from "@/lib/db/queries";
import { decideBookingRefund } from "@/lib/payments/refund-policy";
import { refundMercadoPagoPayment } from "@/lib/payments/mercadopago-refund";

type BookingStatus = "confirmado" | "pendiente" | "cancelado";
type PaymentStatus = "pagado" | "senado" | "impago" | null;

export type ReservaCancelacion = {
  id: string;
  clubId: string;
  bookingCode: string;
  customerPhone: string | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  mpPaymentId: string | null;
  mpRefundId: string | null;
  refundStatus: string | null;
  date: string;
  startTime: string;
  endTime: string;
  clubName: string;
  clubTimezone: string;
  courtName: string;
  refundEnabled: boolean;
  refundCutoffHours: number;
};

export type CancelarReservaResult =
  | { ok: true; status: "cancelada" | "cancelada_con_refund" | "cancelada_sin_refund"; reserva: ReservaCancelacion; refundId?: string }
  | {
      ok: false;
      error:
        | "NO_ENCONTRADA"
        | "CODIGO_INVALIDO"
        | "YA_CANCELADA"
        | "TURNO_PASADO"
        | "CONFIRMACION_REQUERIDA_SIN_REFUND"
        | "REFUND_FALLIDO"
        | "REFUND_EN_PROCESO";
      reserva?: ReservaCancelacion;
    };

export const CANCELACION_NO_ENCONTRADA_TEXTO =
  "No encontré una reserva con ese código. Revisá que esté bien escrito y pasámelo de nuevo.";

const BOOKING_CODE_RE = /^[A-Z]{3}[0-9]{3}$/;

function samePhone(a: string | null, b: string): boolean {
  return (a ?? "").trim() === b.trim();
}

function localDateTimeKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

function turnoYaPaso(reserva: ReservaCancelacion, now: Date): boolean {
  const nowKey = localDateTimeKey(now, reserva.clubTimezone);
  return `${reserva.date} ${reserva.startTime}` <= nowKey;
}

export function bookingCodeValido(bookingCode: string): boolean {
  return BOOKING_CODE_RE.test(bookingCode);
}

async function notifyCancellation(reserva: ReservaCancelacion) {
  await createBookingCancellationNotification(reserva.clubId, reserva.id).catch((err) => {
    console.error("[bot] no se pudo crear la notificación de cancelación", {
      bookingId: reserva.id,
      clubId: reserva.clubId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export async function cancelarReservaBotPorCodigo(input: {
  bookingCode: string;
  customerPhone: string;
  confirmCancelWithoutRefund?: boolean;
  now?: Date;
}): Promise<CancelarReservaResult> {
  const bookingCode = input.bookingCode.trim().toUpperCase();
  if (!bookingCodeValido(bookingCode)) return { ok: false, error: "CODIGO_INVALIDO" };

  const db = getDb();
  const rows = await db
    .select({
      id: bookings.id,
      clubId: bookings.clubId,
      bookingCode: bookings.bookingCode,
      customerPhone: bookings.customerPhone,
      status: bookings.status,
      paymentStatus: bookings.paymentStatus,
      mpPaymentId: bookings.mpPaymentId,
      mpRefundId: bookings.mpRefundId,
      refundStatus: bookings.refundStatus,
      date: bookings.date,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      clubName: clubs.name,
      clubTimezone: clubs.timezone,
      courtName: courts.name,
      refundEnabled: clubs.refundEnabled,
      refundCutoffHours: clubs.refundCutoffHours,
    })
    .from(bookings)
    .innerJoin(clubs, eq(bookings.clubId, clubs.id))
    .innerJoin(courts, eq(bookings.courtId, courts.id))
    .where(and(eq(bookings.bookingCode, bookingCode), eq(bookings.origin, "bot"), eq(bookings.type, "simple")))
    .limit(1);

  const reserva = rows[0] as ReservaCancelacion | undefined;
  if (!reserva || !samePhone(reserva.customerPhone, input.customerPhone)) {
    return { ok: false, error: "NO_ENCONTRADA" };
  }

  if (reserva.status === "cancelado") return { ok: false, error: "YA_CANCELADA", reserva };
  const now = input.now ?? new Date();
  if (turnoYaPaso(reserva, now)) return { ok: false, error: "TURNO_PASADO", reserva };

  const pagada = (reserva.paymentStatus === "senado" || reserva.paymentStatus === "pagado") && Boolean(reserva.mpPaymentId);
  if (!pagada) {
    await db.update(bookings).set({ status: "cancelado" }).where(eq(bookings.id, reserva.id));
    await notifyCancellation(reserva);
    return { ok: true, status: "cancelada", reserva: { ...reserva, status: "cancelado" } };
  }

  const decision = decideBookingRefund({
    refundEnabled: reserva.refundEnabled,
    refundCutoffHours: reserva.refundCutoffHours,
    bookingDate: reserva.date,
    bookingStartTime: reserva.startTime,
    timezone: reserva.clubTimezone,
    cancelledAt: now,
  });

  if (!decision.corresponde) {
    if (!input.confirmCancelWithoutRefund) {
      return { ok: false, error: "CONFIRMACION_REQUERIDA_SIN_REFUND", reserva };
    }

    await db.update(bookings).set({ status: "cancelado" }).where(eq(bookings.id, reserva.id));
    await notifyCancellation(reserva);
    return { ok: true, status: "cancelada_sin_refund", reserva: { ...reserva, status: "cancelado" } };
  }

  if (reserva.mpRefundId || reserva.refundStatus === "refunded") {
    await db.update(bookings).set({ status: "cancelado" }).where(eq(bookings.id, reserva.id));
    await notifyCancellation(reserva);
    return {
      ok: true,
      status: "cancelada_con_refund",
      refundId: reserva.mpRefundId ?? undefined,
      reserva: { ...reserva, status: "cancelado", refundStatus: "refunded" },
    };
  }

  const [claimed] = await db
    .update(bookings)
    .set({ refundStatus: "processing", paymentReviewReason: null })
    .where(
      and(
        eq(bookings.id, reserva.id),
        isNull(bookings.mpRefundId),
        or(isNull(bookings.refundStatus), ne(bookings.refundStatus, "processing")),
      ),
    )
    .returning({ id: bookings.id });
  if (!claimed) return { ok: false, error: "REFUND_EN_PROCESO", reserva };

  const credentials = await getClubMercadoPagoCredentialsForServer(reserva.clubId);
  if (!credentials?.accessToken) {
    await db
      .update(bookings)
      .set({ refundStatus: "failed", paymentReviewReason: "refund_missing_credentials" })
      .where(eq(bookings.id, reserva.id));
    return { ok: false, error: "REFUND_FALLIDO", reserva };
  }

  try {
    const refund = await refundMercadoPagoPayment({
      accessToken: credentials.accessToken,
      paymentId: reserva.mpPaymentId!,
    });
    if (refund.status && refund.status !== "approved") {
      await db
        .update(bookings)
        .set({
          mpRefundId: refund.refundId,
          refundStatus: refund.status,
          paymentReviewReason: "refund_not_approved",
        })
        .where(eq(bookings.id, reserva.id));
      return { ok: false, error: "REFUND_FALLIDO", reserva };
    }

    await db
      .update(bookings)
      .set({
        status: "cancelado",
        mpRefundId: refund.refundId,
        refundStatus: "refunded",
        paymentReviewReason: null,
        refundedAt: new Date(),
      })
      .where(eq(bookings.id, reserva.id));
    await notifyCancellation(reserva);
    return {
      ok: true,
      status: "cancelada_con_refund",
      refundId: refund.refundId,
      reserva: { ...reserva, status: "cancelado", mpRefundId: refund.refundId, refundStatus: "refunded" },
    };
  } catch (err) {
    await db
      .update(bookings)
      .set({ refundStatus: "failed", paymentReviewReason: "refund_failed" })
      .where(eq(bookings.id, reserva.id));
    console.error("[bot] falló refund de Mercado Pago al cancelar reserva", {
      bookingId: reserva.id,
      clubId: reserva.clubId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "REFUND_FALLIDO", reserva };
  }
}

function fechaHumana(date: string): string {
  try {
    return new Date(`${date}T12:00:00`).toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return date;
  }
}

export function respuestaCancelacionTexto(result: CancelarReservaResult): string {
  if (result.ok) {
    const r = result.reserva;
    if (result.status === "cancelada_con_refund") {
      const pago = r.paymentStatus === "senado" ? "seña" : "pago";
      return `Listo, cancelé tu reserva ${r.bookingCode} en ${r.clubName} (${r.courtName}) el ${fechaHumana(r.date)} a las ${r.startTime}. El turno quedó liberado y se procesa la devolución de tu ${pago}.`;
    }
    if (result.status === "cancelada_sin_refund") {
      return `Listo, cancelé tu reserva ${r.bookingCode} en ${r.clubName} (${r.courtName}) el ${fechaHumana(r.date)} a las ${r.startTime}. El turno quedó liberado. Según la política del club, no se realiza devolución del pago.`;
    }
    return `Listo, cancelé tu reserva ${r.bookingCode} en ${r.clubName} (${r.courtName}) el ${fechaHumana(r.date)} a las ${r.startTime}. El turno quedó liberado.`;
  }

  if (result.error === "YA_CANCELADA") return "Esa reserva ya estaba cancelada.";
  if (result.error === "TURNO_PASADO") return "Ese turno ya pasó, así que no puedo cancelarlo desde el bot.";
  if (result.error === "CONFIRMACION_REQUERIDA_SIN_REFUND" && result.reserva) {
    return `Podemos cancelar tu reserva ${result.reserva.bookingCode}, pero por la política de ${result.reserva.clubName} no se realiza la devolución del dinero. Si querés cancelarla igual, respondé: confirmo ${result.reserva.bookingCode}`;
  }
  if (result.error === "REFUND_EN_PROCESO") {
    return "Ya estoy procesando la devolución de esa reserva. Esperá un momento y volvé a consultar si no recibís confirmación.";
  }
  if (result.error === "REFUND_FALLIDO") {
    return "No pude procesar la devolución en Mercado Pago, así que no cancelé la reserva. Dejé el caso marcado para revisión manual.";
  }
  if (result.error === "CODIGO_INVALIDO") {
    return "El código de reserva tiene 3 letras y 3 números (por ejemplo HYS324). Pasámelo así y lo busco.";
  }
  return CANCELACION_NO_ENCONTRADA_TEXTO;
}
