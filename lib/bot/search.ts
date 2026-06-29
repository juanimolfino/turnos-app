import { eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clubs, sports } from "@/lib/db/schema";
import { getClubAvailability } from "@/lib/bookings/availability";
import type { Intent } from "@/lib/bot/intent";

// Búsqueda de disponibilidad para el bot. Reúne los HECHOS (lugares y horarios
// libres reales) que después se formatean de manera determinística.
//
// Filtro de ciudad: configurable por la env var BOT_CITY.
//  - Sin definir (MVP single-pueblo, ej. Bolívar) → busca en TODOS los clubs.
//  - Con valor (multi-ciudad) → filtra clubs por ese city (ilike, case-insensitive).
// canchas con id+nombre: el id se usa para reservar (Fase 6); el nombre, para mostrar.
export type SlotLibre = { start: string; end: string; canchas: { id: string; name: string }[] };
export type LugarDisponibilidad = { clubId: string; lugar: string; barrio: string | null; slots: SlotLibre[] };

/**
 * Traduce la hora pedida a una ventana de búsqueda.
 * - Hora exacta (intent.time) → todo el día (sin acotar): después ofrecemos lo
 *   más cercano a esa hora, no exigimos match exacto.
 * - Sin hora exacta, según la franja mencionada: "tarde" desde 16:00, "noche"
 *   desde 20:00, "mediodía" 12–15, "mañana" hasta 13:00.
 * - Si no se menciona nada → todo el día.
 */
export function interpretarFranja(text: string, intent: Intent): { start: string | null; end: string | null } {
  if (intent.time) return { start: null, end: null };

  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/\bnoche\b/.test(t)) return { start: "20:00", end: null };
  if (/\btarde\b/.test(t)) return { start: "16:00", end: null };
  if (/\bmediodia\b/.test(t)) return { start: "12:00", end: "15:00" };
  if (/(la|de|por)\s+manana/.test(t)) return { start: null, end: "13:00" };
  return { start: null, end: null };
}

/** Resuelve un deporte (slug o nombre, ej "padel"/"futbol") a su id en la tabla
 * sports. Devuelve null si no existe ninguno con ese slug/nombre. */
async function resolverSportId(db: ReturnType<typeof getDb>, sport: string | null): Promise<string | null> {
  if (!sport) return null;
  const s = sport.trim().toLowerCase();
  const [row] = await db
    .select({ id: sports.id })
    .from(sports)
    .where(or(eq(sports.slug, s), ilike(sports.name, s)));
  return row?.id ?? null;
}

/**
 * Devuelve la disponibilidad real agrupada POR LUGAR (club) para la fecha y el
 * deporte pedidos. Reusa getClubAvailability (no reimplementa el cálculo). Solo
 * incluye lugares con al menos un horario libre.
 */
export async function buscarDisponibilidad(intent: Intent, userText: string): Promise<LugarDisponibilidad[]> {
  if (!intent.date) return [];

  const db = getDb();

  // El deporte se resuelve UNA sola vez por búsqueda (no por club).
  const sportId = await resolverSportId(db, intent.sport);
  // Deporte que no se ofrece → sin disponibilidad (no devolvemos otros deportes).
  if (!sportId) return [];

  // Si BOT_CITY está definida, filtramos por esa ciudad; si no, todos los clubs.
  const botCity = process.env.BOT_CITY?.trim();
  const clubList = botCity
    ? await db.select().from(clubs).where(ilike(clubs.city, `%${botCity}%`))
    : await db.select().from(clubs);

  const { start, end } = interpretarFranja(userText, intent);

  const out: LugarDisponibilidad[] = [];
  for (const club of clubList) {
    const avail = await getClubAvailability(club.id, intent.date, { start, end, sportId });
    const slots = (avail?.slots ?? []).map((s) => ({
      start: s.start,
      end: s.end,
      canchas: s.freeCourts.map((c) => ({ id: c.id, name: c.name })),
    }));
    if (slots.length) out.push({ clubId: club.id, lugar: club.name, barrio: club.neighborhood ?? null, slots });
  }
  return out;
}
