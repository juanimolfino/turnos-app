import { and, eq, ne, lt, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, clubs, courts, type PaymentMode } from "@/lib/db/schema";
import type { LugarDisponibilidad } from "@/lib/bot/search";
import { calculateBookingPaymentAmount } from "@/lib/payments/amount";
import { createBookingPaymentPreference } from "@/lib/payments/mercadopago-booking";
import { cancelBotHoldAfterPaymentError, findOrCreateBotCustomer } from "@/lib/db/queries";
import { cancellationPolicyText } from "@/lib/bot/cancellation-policy-text";
import type { Channel } from "@/lib/bot/types";

// Motor de reserva del bot (Fase 6). Crea bookings type='simple', origin='bot'.
// Anti-doble-booking en DOS capas:
//  - CAPA B (software): re-chequea que el turno siga libre antes de escribir.
//  - CAPA A (constraint EXCLUDE en Postgres): última línea; ante una carrera
//    concurrente, la base rechaza la 2ª inserción y la traducimos a SLOT_NO_DISPONIBLE.

export type ReservaInput = {
  clubId: string;
  courtId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  customerName: string;
  customerContactPhone: string; // teléfono real de contacto, pedido por chat
  channel: Channel;
  channelUserId: string; // id del usuario en el canal; se guarda en booking.customerPhone para seguridad de cancelación
  now?: Date;
};

export type ReservaResult =
  | {
      ok: true;
      bookingId: string;
      bookingCode: string;
      status: "confirmado" | "pendiente";
      paymentMode: PaymentMode;
      amountToCharge: number;
      heldUntil: Date | null;
      paymentInitPoint: string | null;
      mpPreferenceId: string | null;
      refundEnabled: boolean;
      refundCutoffHours: number;
    }
  | { ok: false; error: "SLOT_NO_DISPONIBLE" | "PAGO_NO_DISPONIBLE" };

// Alfabeto sin caracteres ambiguos (sin I/O en letras, sin 0/1 en números).
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const MAX_CODE_RETRIES = 5;
export const HOLD_MINUTES = 10;

/** Código tipo aerolínea: 3 letras + 3 números (ej "HYS324"), sin ambiguos. */
export function generarBookingCode(): string {
  const pick = (chars: string, n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return pick(LETTERS, 3) + pick(DIGITS, 3);
}

function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code ?? e?.cause?.code;
}
const EXCLUSION_VIOLATION = "23P01"; // constraint EXCLUDE (capa A)
const UNIQUE_VIOLATION = "23505"; // colisión de booking_code

/**
 * Crea una reserva del bot de forma atómica y protegida contra doble-booking.
 *
 * Si el club no pide pago online (`payment_mode='none'`), mantiene el flujo del MVP:
 * reserva confirmada directa. Si pide seña o pago completo, crea un hold
 * (`status='pendiente'`) que bloquea el turno hasta que un paso posterior genere el
 * link de pago y el webhook confirme o libere la reserva.
 */
export async function crearReservaBot(input: ReservaInput): Promise<ReservaResult> {
  const db = getDb();

  const [settings] = await db
    .select({
      paymentMode: clubs.paymentMode,
      depositPct: clubs.depositPct,
      courtPrice: courts.price,
      clubName: clubs.name,
      courtName: courts.name,
      refundEnabled: clubs.refundEnabled,
      refundCutoffHours: clubs.refundCutoffHours,
    })
    .from(courts)
    .innerJoin(clubs, eq(courts.clubId, clubs.id))
    .where(and(eq(courts.id, input.courtId), eq(courts.clubId, input.clubId)));

  if (!settings) return { ok: false, error: "SLOT_NO_DISPONIBLE" };

  const amountToCharge = calculateBookingPaymentAmount({
    courtPrice: settings.courtPrice,
    paymentMode: settings.paymentMode,
    depositPct: settings.depositPct,
  });
  const status = settings.paymentMode === "none" ? "confirmado" : "pendiente";
  const heldUntil =
    status === "pendiente"
      ? new Date((input.now?.getTime() ?? Date.now()) + HOLD_MINUTES * 60 * 1000)
      : null;

  // ── CAPA B: re-verificar que el turno sigue libre (half-open, != cancelado) ──
  const solapados = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.courtId, input.courtId),
        eq(bookings.date, input.date),
        ne(bookings.status, "cancelado"),
        lt(bookings.startTime, input.endTime),
        gt(bookings.endTime, input.startTime),
      ),
    );
  if (solapados.length > 0) return { ok: false, error: "SLOT_NO_DISPONIBLE" };

  const customer = await findOrCreateBotCustomer({
    clubId: input.clubId,
    name: input.customerName,
    phone: input.customerContactPhone,
    channel: input.channel,
    channelUserId: input.channelUserId,
  });

  // ── Inserción protegida por la constraint EXCLUDE (CAPA A) ──
  for (let intento = 0; intento < MAX_CODE_RETRIES; intento++) {
    const bookingCode = generarBookingCode();
    try {
      const [booking] = await db
        .insert(bookings)
        .values({
          clubId: input.clubId,
          courtId: input.courtId,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          type: "simple",
          origin: "bot",
          status,
          paymentStatus: "impago",
          heldUntil,
          price: amountToCharge > 0 ? amountToCharge : null,
          customerId: customer.id,
          customerName: input.customerName,
          customerPhone: input.channelUserId,
          bookingCode,
        })
        .returning({ id: bookings.id, bookingCode: bookings.bookingCode });

      const result: Extract<ReservaResult, { ok: true }> = {
        ok: true,
        bookingId: booking.id,
        bookingCode: booking.bookingCode!,
        status,
        paymentMode: settings.paymentMode,
        amountToCharge,
        heldUntil,
        paymentInitPoint: null,
        mpPreferenceId: null,
        refundEnabled: settings.refundEnabled,
        refundCutoffHours: settings.refundCutoffHours,
      };

      if (status === "pendiente" && settings.paymentMode !== "none") {
        try {
          const payment = await createBookingPaymentPreference({
            bookingId: booking.id,
            bookingCode: booking.bookingCode!,
            clubId: input.clubId,
            clubName: settings.clubName,
            courtName: settings.courtName,
            date: input.date,
            startTime: input.startTime,
            amount: amountToCharge,
            paymentMode: settings.paymentMode,
            heldUntil: heldUntil!,
          });
          result.paymentInitPoint = payment.initPoint;
          result.mpPreferenceId = payment.preferenceId;
        } catch (err) {
          await cancelBotHoldAfterPaymentError(booking.id).catch((cancelErr) => {
            console.error("[bot] no se pudo cancelar hold tras error de Mercado Pago", {
              bookingId: booking.id,
              error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
            });
          });
          console.error("[bot] no se pudo generar preferencia de Mercado Pago", {
            bookingId: booking.id,
            clubId: input.clubId,
            error: err instanceof Error ? err.message : String(err),
          });
          return { ok: false, error: "PAGO_NO_DISPONIBLE" };
        }
      }

      return result;
    } catch (err) {
      const code = pgErrorCode(err);
      if (code === EXCLUSION_VIOLATION) return { ok: false, error: "SLOT_NO_DISPONIBLE" }; // capa A
      if (code === UNIQUE_VIOLATION) continue; // booking_code repetido → reintentar
      throw err;
    }
  }
  throw new Error("No se pudo generar un booking_code único tras varios intentos");
}

// ── Resolución del turno elegido (texto del usuario → coordenadas reservables) ──
export type Turno = {
  clubId: string;
  courtId: string;
  clubName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
};

function normHora(t: string): string {
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

/**
 * Mapea la elección del usuario (lugar + hora [+ cancha]) a un turno concreto y
 * reservable, usando las opciones REALES devueltas por la búsqueda. Devuelve null
 * si no matchea ninguna (el bot vuelve a ofrecer en vez de reservar algo inventado).
 */
export function resolverTurno(
  lugares: LugarDisponibilidad[],
  eleccion: { lugar: string | null; hora: string | null; cancha: string | null },
  date: string,
): Turno | null {
  if (!eleccion.lugar || !eleccion.hora) return null;
  const norm = (s: string) => s.toLowerCase().trim();
  const pedidoLugar = norm(eleccion.lugar);

  const lugar = lugares.find(
    (l) => norm(l.lugar).includes(pedidoLugar) || pedidoLugar.includes(norm(l.lugar)),
  );
  if (!lugar) return null;

  const slot = lugar.slots.find((s) => normHora(s.start) === normHora(eleccion.hora!));
  if (!slot || slot.canchas.length === 0) return null;

  const court =
    (eleccion.cancha && slot.canchas.find((c) => norm(c.name).includes(norm(eleccion.cancha!)))) ||
    slot.canchas[0];

  return {
    clubId: lugar.clubId,
    courtId: court.id,
    clubName: lugar.lugar,
    courtName: court.name,
    date,
    startTime: slot.start,
    endTime: slot.end,
  };
}

/** Confirmación al usuario con el código de reserva (template determinístico,
 * para no depender de la IA en la parte crítica: el código). */
export function confirmarReservaTexto(turno: Turno, nombre: string, reserva: Extract<ReservaResult, { ok: true }>): string {
  let fecha = turno.date;
  try {
    fecha = new Date(turno.date + "T12:00:00").toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    /* si la locale no está, queda la fecha ISO */
  }

  if (reserva.status === "pendiente") {
    const tipoPago = reserva.paymentMode === "partial" ? "seña" : "total";
    const monto = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(reserva.amountToCharge);
    const politica = cancellationPolicyText({
      paymentMode: reserva.paymentMode,
      refundEnabled: reserva.refundEnabled,
      refundCutoffHours: reserva.refundCutoffHours,
    });

    return `¡Listo, ${nombre}! Te reservé provisoriamente en ${turno.clubName} (${turno.courtName}) el ${fecha} a las ${turno.startTime}. Para confirmarla tenés que pagar ${monto} (${tipoPago}) acá: ${reserva.paymentInitPoint}. Tenés aproximadamente ${HOLD_MINUTES} minutos; si no pagás, el turno se libera. Tu código de reserva es ${reserva.bookingCode}. ${politica}`;
  }

  const politica = cancellationPolicyText({
    paymentMode: reserva.paymentMode,
    refundEnabled: reserva.refundEnabled,
    refundCutoffHours: reserva.refundCutoffHours,
  });

  return `¡Listo, ${nombre}! Te reservé en ${turno.clubName} (${turno.courtName}) el ${fecha} a las ${turno.startTime}. Tu código de reserva es ${reserva.bookingCode} — guardalo para cancelar. ${politica}`;
}
