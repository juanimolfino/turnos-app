import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clubs, openingHours, courts, bookings } from "@/lib/db/schema";

// Fuente de verdad ÚNICA para "qué canchas están libres" (solo lectura).
// Regla: una cancha está libre en una franja si NO existe booking con
// status != 'cancelado' que se superponga (half-open: bStart < end && bEnd > start).

export const DEFAULT_WINDOW = { open: "08:00", close: "23:00", slot: 90 };

// ── Tipos (mínimos, sin acoplar a Drizzle) ───────────────────────────────────
export type AvailabilityCourt = {
  id: string;
  name: string;
  sortOrder: number;
  sportId: string;
};

export type AvailabilityBooking = {
  courtId: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  status: string; // confirmado | pendiente | cancelado
};

export type OpeningWindow = { open: string; close: string; slotMinutes: number };

export type AvailabilitySlot = {
  start: string;
  end: string;
  freeCourts: { id: string; name: string }[];
  totalCourts: number;
};

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function fmt(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Cálculo puro de disponibilidad: dados las canchas, los bookings del día y la
 * ventana horaria, devuelve los slots con las canchas libres en cada uno.
 * Solo se incluyen los slots con al menos una cancha libre (igual que el
 * endpoint público original). Sin lógica de UI.
 *
 * - `sportId`: si se pasa, filtra las canchas por deporte; si no, todas.
 * - `start`/`end`: acotan la ventana (slot.start >= start y slot.end <= end).
 * - Un booking cuenta como ocupado salvo que su status sea 'cancelado'.
 */
export function computeAvailability(input: {
  courts: AvailabilityCourt[];
  bookings: AvailabilityBooking[];
  window: OpeningWindow;
  start?: string | null;
  end?: string | null;
  sportId?: string | null;
}): AvailabilitySlot[] {
  const { window, start, end, sportId } = input;

  const courtsInScope = [...input.courts]
    .filter((c) => (sportId ? c.sportId === sportId : true))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Solo ocupan los bookings no cancelados.
  const occupying = input.bookings.filter((b) => b.status !== "cancelado");

  const slots: AvailabilitySlot[] = [];
  const closeMin = toMin(window.close);
  const slotMin = window.slotMinutes;

  for (let cur = toMin(window.open); cur + slotMin <= closeMin; cur += slotMin) {
    const s = fmt(cur);
    const e = fmt(cur + slotMin);
    if (start && s < start) continue;
    if (end && e > end) continue;

    const freeCourts = courtsInScope.filter(
      (c) => !occupying.some((b) => b.courtId === c.id && b.startTime < e && b.endTime > s),
    );

    if (freeCourts.length > 0) {
      slots.push({
        start: s,
        end: e,
        freeCourts: freeCourts.map((c) => ({ id: c.id, name: c.name })),
        totalCourts: courtsInScope.length,
      });
    }
  }

  return slots;
}

/**
 * Versión que consulta la base: resuelve la ventana del club (opening_hours del
 * día o el default 08:00–23:00 / slot 90), las canchas activas y los bookings no
 * cancelados, y delega el cálculo en computeAvailability.
 */
export async function getClubAvailability(
  clubId: string,
  date: string,
  opts: { start?: string | null; end?: string | null; slotMinutes?: number | null; sportId?: string | null } = {},
): Promise<{ window: OpeningWindow; slots: AvailabilitySlot[] } | null> {
  const db = getDb();

  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) return null;

  const weekday = (new Date(date + "T12:00:00").getDay() + 6) % 7; // Lun=0..Dom=6
  const [hours] = await db
    .select()
    .from(openingHours)
    .where(and(eq(openingHours.clubId, clubId), eq(openingHours.weekday, weekday)));

  const open = hours?.openTime ?? DEFAULT_WINDOW.open;
  const close = hours?.closeTime ?? DEFAULT_WINDOW.close;
  const slotMinutes = opts.slotMinutes ?? hours?.slotMinutes ?? DEFAULT_WINDOW.slot;
  const window: OpeningWindow = { open, close, slotMinutes };

  const courtRows = await db
    .select()
    .from(courts)
    .where(and(eq(courts.clubId, clubId), eq(courts.active, true)));

  // Cualquier booking no cancelado ocupa la cancha.
  const bookingRows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.clubId, clubId), eq(bookings.date, date), ne(bookings.status, "cancelado")));

  const slots = computeAvailability({
    courts: courtRows.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder, sportId: c.sportId })),
    bookings: bookingRows.map((b) => ({ courtId: b.courtId, startTime: b.startTime, endTime: b.endTime, status: b.status })),
    window,
    start: opts.start,
    end: opts.end,
    sportId: opts.sportId,
  });

  return { window, slots };
}
