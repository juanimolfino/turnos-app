import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { clubs, openingHours, courts, bookings } from "@/lib/db/schema";
import { and, eq, ilike } from "drizzle-orm";

// Public endpoint — authenticated by club API key or city search (no Supabase session)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city");
  const date = searchParams.get("date");
  const startTime = searchParams.get("start");
  const endTime = searchParams.get("end");
  const apiKey = request.headers.get("x-api-key") ?? searchParams.get("api_key");

  if (!date) return NextResponse.json({ error: "date requerido (YYYY-MM-DD)" }, { status: 400 });

  const db = getDb();

  let clubList;
  if (apiKey) {
    const club = await db.query.clubs.findFirst({ where: eq(clubs.apiKey, apiKey) });
    clubList = club ? [club] : [];
  } else if (city) {
    clubList = await db.select().from(clubs).where(ilike(clubs.city, `%${city}%`));
  } else {
    return NextResponse.json({ error: "Proporcionar api_key o city" }, { status: 400 });
  }

  if (!clubList.length) return NextResponse.json({ clubs: [] });

  const dateObj = new Date(date + "T12:00:00");
  const weekday = (dateObj.getDay() + 6) % 7;

  const results = await Promise.all(clubList.map(async (club) => {
    const [hours] = await db.select().from(openingHours).where(
      and(eq(openingHours.clubId, club.id), eq(openingHours.weekday, weekday))
    );
    if (!hours) return null;

    const allCourts = await db.select().from(courts).where(
      and(eq(courts.clubId, club.id), eq(courts.active, true))
    );
    const dayBookings = await db.select().from(bookings).where(
      and(eq(bookings.clubId, club.id), eq(bookings.date, date), eq(bookings.status, "confirmado"))
    );

    const [openH, openM] = hours.openTime.split(":").map(Number);
    const [closeH, closeM] = hours.closeTime.split(":").map(Number);
    const slotMin = hours.slotMinutes;

    const slots = [];
    let cur = openH * 60 + openM;
    const closeTotal = closeH * 60 + closeM;

    while (cur + slotMin <= closeTotal) {
      const slotStart = `${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`;
      const slotEnd = `${String(Math.floor((cur + slotMin) / 60)).padStart(2, "0")}:${String((cur + slotMin) % 60).padStart(2, "0")}`;

      if (startTime && slotStart < startTime) { cur += slotMin; continue; }
      if (endTime && slotEnd > endTime) { cur += slotMin; continue; }

      const freeCourts = allCourts.filter(c =>
        !dayBookings.some(b => b.courtId === c.id && b.startTime < slotEnd && b.endTime > slotStart)
      );

      if (freeCourts.length > 0) {
        slots.push({
          start: slotStart,
          end: slotEnd,
          freeCourts: freeCourts.map(c => ({ id: c.id, name: c.name })),
          totalCourts: allCourts.length,
        });
      }

      cur += slotMin;
    }

    return {
      club: {
        id: club.id,
        name: club.name,
        city: club.city,
        neighborhood: club.neighborhood,
        address: club.address,
        phone: club.phone,
        requiresPayment: club.requiresPayment,
      },
      date,
      availableSlots: slots,
    };
  }));

  return NextResponse.json({ clubs: results.filter(Boolean) });
}
