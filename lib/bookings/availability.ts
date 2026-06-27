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
 * Turnos libres de UNA cancha (en minutos): "pegados a la ocupación".
 * Cada turno arranca donde termina la ocupación previa (o en la apertura), y
 * dentro de cada hueco se ofrecen turnos consecutivos de `slotMin` mientras
 * entren COMPLETOS (un hueco de 60 con slot 90 → ningún turno; 180 → dos). Un
 * turno nunca excede el cierre. El cálculo de ocupación (overlap, half-open) no
 * cambia: solo cambia de dónde salen los candidatos.
 */
function turnosLibresCancha(
  courtId: string,
  occupying: AvailabilityBooking[],
  openMin: number,
  closeMin: number,
  slotMin: number,
): Array<[number, number]> {
  // Intervalos ocupados de esta cancha, recortados a la ventana y fusionados.
  const ocupados = occupying
    .filter((b) => b.courtId === courtId)
    .map((b): [number, number] => [Math.max(openMin, toMin(b.startTime)), Math.min(closeMin, toMin(b.endTime))])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const iv of ocupados) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([...iv]);
  }

  // Recorre los huecos libres y genera turnos de slotMin que entren completos.
  const turnos: Array<[number, number]> = [];
  const emitir = (desde: number, hasta: number) => {
    for (let t = desde; t + slotMin <= hasta; t += slotMin) turnos.push([t, t + slotMin]);
  };

  let cur = openMin;
  for (const [s, e] of merged) {
    emitir(cur, s); // hueco antes de esta ocupación
    cur = Math.max(cur, e);
  }
  emitir(cur, closeMin); // hueco final hasta el cierre
  return turnos;
}

/**
 * Cálculo puro de disponibilidad: dados las canchas, los bookings del día y la
 * ventana horaria, devuelve los turnos libres agrupados por horario (qué canchas
 * están libres en cada turno). Solo incluye turnos con al menos una cancha libre.
 * Sin lógica de UI.
 *
 * - Los turnos se generan "pegados a la ocupación" (no en una grilla fija): así
 *   se aprovechan los huecos reales aunque no caigan en múltiplos de slotMin.
 * - `slotMin` sale de la ventana (default 90). TODO: a futuro, por deporte.
 * - `sportId`: si se pasa, filtra las canchas por deporte; si no, todas.
 * - `start`/`end`: acotan los turnos ofrecidos (turno.start >= start, turno.end <= end).
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

  const openMin = toMin(window.open);
  const closeMin = toMin(window.close);
  const slotMin = window.slotMinutes;
  // Filtro de franja (acota los turnos a [start, end]).
  const minStart = start ? toMin(start) : openMin;
  const maxEnd = end ? toMin(end) : closeMin;

  // Agrupamos por (inicio, fin) las canchas libres. Recorremos courtsInScope en
  // orden de sortOrder para preservar ese orden dentro de cada turno.
  const porTurno = new Map<string, { start: number; end: number; courts: { id: string; name: string }[] }>();

  for (const court of courtsInScope) {
    for (const [tStart, tEnd] of turnosLibresCancha(court.id, occupying, openMin, closeMin, slotMin)) {
      if (tStart < minStart || tEnd > maxEnd) continue; // fuera de la franja pedida
      const key = `${tStart}-${tEnd}`;
      const entry = porTurno.get(key) ?? { start: tStart, end: tEnd, courts: [] };
      entry.courts.push({ id: court.id, name: court.name });
      porTurno.set(key, entry);
    }
  }

  return [...porTurno.values()]
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((t) => ({
      start: fmt(t.start),
      end: fmt(t.end),
      freeCourts: t.courts,
      totalCourts: courtsInScope.length,
    }));
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
