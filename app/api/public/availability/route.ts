import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { clubs, openingHours, courts, bookings } from "@/lib/db/schema";
import { and, eq, ne, ilike } from "drizzle-orm";

// Endpoint público (lo consume el bot). Auth opcional por API key del club.
// La disponibilidad se calcula con: ventana horaria del club (opening_hours si
// existe, si no un default) menos los bloques cargados en la agenda (cualquier
// booking que no esté cancelado ocupa la cancha).

const DEFAULT_WINDOW = { open: "08:00", close: "23:00", slot: 90 };

function toMin(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function fmt(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city");
  const date = searchParams.get("date");
  const startTime = searchParams.get("start");
  const endTime = searchParams.get("end");
  const slotParam = searchParams.get("slot");
  const apiKey = request.headers.get("x-api-key") ?? searchParams.get("api_key");

  if (!date) return NextResponse.json({ error: "date requerido (YYYY-MM-DD)" }, { status: 400 });

  const db = getDb();

  // Selección de clubs: por api_key (uno), por ciudad (varios), o todos.
  let clubList;
  if (apiKey) {
    const club = await db.query.clubs.findFirst({ where: eq(clubs.apiKey, apiKey) });
    clubList = club ? [club] : [];
  } else if (city) {
    clubList = await db.select().from(clubs).where(ilike(clubs.city, `%${city}%`));
  } else {
    clubList = await db.select().from(clubs);
  }

  if (!clubList.length) return NextResponse.json({ clubs: [] });

  const weekday = (new Date(date + "T12:00:00").getDay() + 6) % 7; // Lun=0..Dom=6

  const results = await Promise.all(clubList.map(async (club) => {
    const [hours] = await db.select().from(openingHours).where(
      and(eq(openingHours.clubId, club.id), eq(openingHours.weekday, weekday))
    );
    const open = hours?.openTime ?? DEFAULT_WINDOW.open;
    const close = hours?.closeTime ?? DEFAULT_WINDOW.close;
    const slotMin = slotParam ? Number(slotParam) : (hours?.slotMinutes ?? DEFAULT_WINDOW.slot);

    const allCourts = (await db.select().from(courts).where(
      and(eq(courts.clubId, club.id), eq(courts.active, true))
    )).sort((a, b) => a.sortOrder - b.sortOrder);

    // Cualquier booking no cancelado ocupa (clase/fijo/flex/americano/torneo/bloqueo/simple/pendiente)
    const dayBookings = await db.select().from(bookings).where(
      and(eq(bookings.clubId, club.id), eq(bookings.date, date), ne(bookings.status, "cancelado"))
    );

    const slots = [];
    const closeMin = toMin(close);
    for (let cur = toMin(open); cur + slotMin <= closeMin; cur += slotMin) {
      const s = fmt(cur);
      const e = fmt(cur + slotMin);
      if (startTime && s < startTime) continue;
      if (endTime && e > endTime) continue;

      const freeCourts = allCourts.filter((c) =>
        !dayBookings.some((b) => b.courtId === c.id && b.startTime < e && b.endTime > s)
      );
      if (freeCourts.length > 0) {
        slots.push({
          start: s, end: e,
          freeCourts: freeCourts.map((c) => ({ id: c.id, name: c.name })),
          totalCourts: allCourts.length,
        });
      }
    }

    return {
      club: {
        id: club.id, name: club.name,
        city: club.city, neighborhood: club.neighborhood, address: club.address,
        phone: club.phone, requiresPayment: club.requiresPayment,
      },
      date,
      openingWindow: { open, close, slotMinutes: slotMin },
      availableSlots: slots,
    };
  }));

  return NextResponse.json({ clubs: results });
}
