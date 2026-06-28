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
 * Cálculo puro de disponibilidad, a nivel CLUB. Devuelve una grilla de turnos del
 * club (cada turno con las canchas libres en ese horario), DINÁMICA y SIN solapes
 * entre sí. Solo incluye turnos con al menos una cancha libre. Sin lógica de UI.
 *
 * Cómo se generan los turnos (un solo barrido del día, no una grilla por cancha):
 * - Se barre con un cursor desde la apertura, emitiendo turnos consecutivos de
 *   `slotMin` que NO se solapan entre sí.
 * - La grilla es "pegada a la ocupación": cuando dentro de un turno candidato una
 *   cancha se LIBERA (borde de ocupación), se re-ancla el cursor a ese borde y se
 *   descarta el resto sub-turno. Así, p.ej., si la clase termina 16:00 el primer
 *   turno de la tarde arranca 16:00 (y si termina 16:30, arranca 16:30: dinámico,
 *   no una grilla rígida anclada a la apertura).
 * - Si en un turno no hay ninguna cancha libre, el cursor salta al próximo borde
 *   donde algo se libera (no pierde huecos reales, ej. 19:00–20:30 entre bloques).
 * - Resultado: turnos del club mutuamente excluyentes; cada uno con sus canchas.
 *
 * `slotMin` sale de la ventana (default 90; TODO a futuro: por deporte). `sportId`
 * filtra canchas por deporte. `start`/`end` acotan los turnos a esa franja. Un
 * booking ocupa salvo que su status sea 'cancelado' (overlap half-open).
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

  const openMin = toMin(window.open);
  const closeMin = toMin(window.close);
  const slotMin = window.slotMinutes;
  if (slotMin <= 0) return [];

  // Filtro de franja (acota los turnos a [start, end]).
  const minStart = start ? toMin(start) : openMin;
  const maxEnd = end ? toMin(end) : closeMin;

  // Anclas dinámicas: la apertura + cada FIN de ocupación dentro de la ventana
  // (los momentos donde una cancha se libera). No incluye los inicios de ocupación.
  const anchors = new Set<number>([openMin]);
  for (const b of occupying) {
    const e = Math.min(closeMin, toMin(b.endTime));
    if (e > openMin && e < closeMin) anchors.add(e);
  }
  const sortedAnchors = [...anchors].sort((a, b) => a - b);

  // Canchas libres para [s, e) (overlap half-open, mismo cálculo de siempre).
  const freeCourtsFor = (s: number, e: number) =>
    courtsInScope.filter(
      (c) => !occupying.some((b) => b.courtId === c.id && toMin(b.startTime) < e && toMin(b.endTime) > s),
    );

  const slots: AvailabilitySlot[] = [];
  let t = openMin;
  while (t + slotMin <= closeMin) {
    const e = t + slotMin;
    const free = freeCourtsFor(t, e);

    // ¿Hay un borde (una cancha que se libera) estrictamente dentro del turno?
    // Si re-anclar ahí suma una cancha que ahora está ocupada, cortamos y nos
    // re-anclamos a ese borde (turnos "pegados a la ocupación", sin solapar).
    const innerAnchor = sortedAnchors.find((a) => a > t && a < e);
    if (innerAnchor !== undefined) {
      const freeIds = new Set(free.map((c) => c.id));
      const sumaCancha = freeCourtsFor(innerAnchor, innerAnchor + slotMin).some((c) => !freeIds.has(c.id));
      if (free.length === 0 || sumaCancha) {
        t = innerAnchor;
        continue;
      }
    }

    if (free.length > 0) {
      slots.push({
        start: fmt(t),
        end: fmt(e),
        freeCourts: free.map((c) => ({ id: c.id, name: c.name })),
        totalCourts: courtsInScope.length,
      });
      t = e;
    } else {
      // Nada libre y sin borde adentro → saltar al próximo borde donde algo se libera.
      const next = sortedAnchors.find((a) => a > t);
      if (next === undefined) break;
      t = next;
    }
  }

  // Acotar a la franja pedida (turnos completamente dentro de [minStart, maxEnd]).
  return slots.filter((s) => toMin(s.start) >= minStart && toMin(s.end) <= maxEnd);
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
