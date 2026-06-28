import { and, eq, ne, lt, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import type { LugarDisponibilidad } from "@/lib/bot/search";

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
  customerPhone: string; // sale del canal (Telegram: userId); no se pide por chat
};

export type ReservaResult =
  | { ok: true; bookingId: string; bookingCode: string }
  | { ok: false; error: "SLOT_NO_DISPONIBLE" };

// Alfabeto sin caracteres ambiguos (sin I/O en letras, sin 0/1 en números).
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const MAX_CODE_RETRIES = 5;

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
 * FASE 7 (pago 25%/100%): cuando haya pago, acá se insertará un paso intermedio
 * de "hold" (status='pendiente' esperando el pago) ANTES de pasar a confirmado.
 * Hoy el club del MVP requiere 0% → la reserva se crea directo como
 * status='confirmado', payment_status='impago'. La firma y el manejo de errores
 * no cambian cuando se agregue ese paso.
 */
export async function crearReservaBot(input: ReservaInput): Promise<ReservaResult> {
  const db = getDb();

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
          status: "confirmado",
          paymentStatus: "impago",
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          bookingCode,
        })
        .returning({ id: bookings.id, bookingCode: bookings.bookingCode });

      return { ok: true, bookingId: booking.id, bookingCode: booking.bookingCode! };
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
export function confirmarReservaTexto(turno: Turno, nombre: string, bookingCode: string): string {
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
  return `¡Listo, ${nombre}! Te reservé en ${turno.clubName} (${turno.courtName}) el ${fecha} a las ${turno.startTime}. Tu código de reserva es ${bookingCode} — guardalo para cancelar (la cancelación se habilita en la próxima etapa).`;
}
