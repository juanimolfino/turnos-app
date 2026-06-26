import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { clubs } from "@/lib/db/schema";
import { eq, ilike } from "drizzle-orm";
import { getClubAvailability, DEFAULT_WINDOW } from "@/lib/bookings/availability";

// Endpoint público (lo consume el bot). Auth opcional por API key del club.
// El cálculo de disponibilidad vive en lib/bookings/availability.ts (fuente de
// verdad única): ventana del club (opening_hours o default) menos los bookings
// no cancelados que se superponen.

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

  const results = await Promise.all(
    clubList.map(async (club) => {
      const avail = await getClubAvailability(club.id, date, {
        start: startTime,
        end: endTime,
        slotMinutes: slotParam ? Number(slotParam) : null,
      });
      const window = avail?.window ?? {
        open: DEFAULT_WINDOW.open,
        close: DEFAULT_WINDOW.close,
        slotMinutes: DEFAULT_WINDOW.slot,
      };

      return {
        club: {
          id: club.id, name: club.name,
          city: club.city, neighborhood: club.neighborhood, address: club.address,
          phone: club.phone, requiresPayment: club.requiresPayment,
        },
        date,
        openingWindow: window,
        availableSlots: avail?.slots ?? [],
      };
    }),
  );

  return NextResponse.json({ clubs: results });
}
