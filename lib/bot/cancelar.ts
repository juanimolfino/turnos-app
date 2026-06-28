import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, clubs, courts } from "@/lib/db/schema";

type BookingStatus = "confirmado" | "pendiente" | "cancelado";

export type ReservaCancelacion = {
  id: string;
  bookingCode: string;
  customerPhone: string | null;
  status: BookingStatus;
  date: string;
  startTime: string;
  endTime: string;
  clubName: string;
  clubTimezone: string;
  courtName: string;
};

export type CancelarReservaResult =
  | { ok: true; status: "cancelada"; reserva: ReservaCancelacion }
  | { ok: false; error: "NO_ENCONTRADA" | "CODIGO_INVALIDO" | "YA_CANCELADA" | "TURNO_PASADO"; reserva?: ReservaCancelacion };

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

export async function cancelarReservaBotPorCodigo(input: {
  bookingCode: string;
  customerPhone: string;
  now?: Date;
}): Promise<CancelarReservaResult> {
  const bookingCode = input.bookingCode.trim().toUpperCase();
  if (!bookingCodeValido(bookingCode)) return { ok: false, error: "CODIGO_INVALIDO" };

  const db = getDb();
  const rows = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerPhone: bookings.customerPhone,
      status: bookings.status,
      date: bookings.date,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      clubName: clubs.name,
      clubTimezone: clubs.timezone,
      courtName: courts.name,
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
  if (turnoYaPaso(reserva, input.now ?? new Date())) return { ok: false, error: "TURNO_PASADO", reserva };

  await db.update(bookings).set({ status: "cancelado" }).where(eq(bookings.id, reserva.id));
  return { ok: true, status: "cancelada", reserva: { ...reserva, status: "cancelado" } };
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
    return `Listo, cancelé tu reserva ${r.bookingCode} en ${r.clubName} (${r.courtName}) el ${fechaHumana(r.date)} a las ${r.startTime}. El turno quedó liberado.`;
  }

  if (result.error === "YA_CANCELADA") return "Esa reserva ya estaba cancelada.";
  if (result.error === "TURNO_PASADO") return "Ese turno ya pasó, así que no puedo cancelarlo desde el bot.";
  if (result.error === "CODIGO_INVALIDO") {
    return "El código de reserva tiene 3 letras y 3 números (por ejemplo HYS324). Pasámelo así y lo busco.";
  }
  return CANCELACION_NO_ENCONTRADA_TEXTO;
}
