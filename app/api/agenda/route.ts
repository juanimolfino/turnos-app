import { NextResponse, type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { courts, openingHours, bookings, customers, professors, events } from "@/lib/db/schema";

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(m: number) {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const min = (m % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) &&
    timeToMinutes(aEnd) > timeToMinutes(bStart);
}

const WEEKDAY_MAP: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0 };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const clubId = searchParams.get("clubId");

  if (!clubId) return NextResponse.json({ error: "clubId required" }, { status: 400 });

  const db = getDb();

  // Get active courts ordered
  const courtList = await db.select().from(courts).where(and(eq(courts.clubId, clubId), eq(courts.active, true)));
  courtList.sort((a, b) => a.sortOrder - b.sortOrder);

  // Get weekday (JS: 0=Sun, need 0=Lun)
  const d = new Date(date + "T12:00:00");
  const jsDay = d.getDay(); // 0=Sun
  const weekday = WEEKDAY_MAP[jsDay] ?? 0;

  // Get opening hours for this weekday
  const [oh] = await db.select().from(openingHours)
    .where(and(eq(openingHours.clubId, clubId), eq(openingHours.weekday, weekday)));

  if (!oh) return NextResponse.json({ courts: courtList, slots: [], morningBookings: [] });

  // Get all bookings for the date
  const dayBookings = await db.select({
    id: bookings.id, courtId: bookings.courtId, startTime: bookings.startTime,
    endTime: bookings.endTime, type: bookings.type, status: bookings.status,
    price: bookings.price, paymentStatus: bookings.paymentStatus, notes: bookings.notes,
    customerId: bookings.customerId, professorId: bookings.professorId, eventId: bookings.eventId,
  }).from(bookings)
    .where(and(eq(bookings.clubId, clubId), eq(bookings.date, date)));

  // Load related names
  const customerIds = [...new Set(dayBookings.map(b => b.customerId).filter(Boolean))] as string[];
  const professorIds = [...new Set(dayBookings.map(b => b.professorId).filter(Boolean))] as string[];
  const eventIds = [...new Set(dayBookings.map(b => b.eventId).filter(Boolean))] as string[];

  const customerMap: Record<string, { name: string; phone: string | null }> = {};
  const professorMap: Record<string, { name: string }> = {};
  const eventMap: Record<string, { name: string; capacity: number; registeredCount: number; category: string | null }> = {};

  if (customerIds.length) {
    const rows = await db.select({ id: customers.id, name: customers.name, phone: customers.phone })
      .from(customers).where(eq(customers.clubId, clubId));
    rows.forEach(r => { if (customerIds.includes(r.id)) customerMap[r.id] = r; });
  }
  if (professorIds.length) {
    const rows = await db.select({ id: professors.id, name: professors.name }).from(professors).where(eq(professors.clubId, clubId));
    rows.forEach(r => { if (professorIds.includes(r.id)) professorMap[r.id] = r; });
  }
  if (eventIds.length) {
    const rows = await db.select({ id: events.id, name: events.name, capacity: events.capacity, registeredCount: events.registeredCount, category: events.category })
      .from(events).where(eq(events.clubId, clubId));
    rows.forEach(r => { if (eventIds.includes(r.id)) eventMap[r.id] = r; });
  }

  // Separate morning bookings (before 16:00 - classes)
  const morningBookings = dayBookings.filter(b => timeToMinutes(b.startTime) < timeToMinutes("16:00") && b.status !== "cancelado");

  // Generate evening slots from 16:00
  const slotStart = timeToMinutes("16:00");
  const closeMin = timeToMinutes(oh.closeTime);
  const step = oh.slotMinutes;
  const slots = [];

  for (let t = slotStart; t < closeMin; t += step) {
    const start = minutesToTime(t);
    const end = minutesToTime(Math.min(t + step, closeMin));

    const cells = courtList.map(court => {
      const booking = dayBookings.find(b =>
        b.courtId === court.id &&
        b.status !== "cancelado" &&
        overlaps(b.startTime, b.endTime, start, end)
      );

      if (!booking) return { courtId: court.id, courtName: court.name, status: "libre" as const };

      const customer = booking.customerId ? customerMap[booking.customerId] : null;
      const professor = booking.professorId ? professorMap[booking.professorId] : null;
      const event = booking.eventId ? eventMap[booking.eventId] : null;

      let who = "";
      let sub = "";
      let tel = "";

      if (booking.type === "simple" || booking.type === "fijo") {
        who = customer?.name ?? "";
        tel = customer?.phone ?? "";
        const typeLabel = booking.type === "fijo" ? "Turno fijo" : "Turno simple";
        const payLabel = booking.paymentStatus === "pagado" ? "pagado" : booking.paymentStatus === "senado" ? "seña" : "";
        sub = payLabel ? `${typeLabel} · ${payLabel}` : typeLabel;
      } else if (booking.type === "clase") {
        who = professor ? `Prof. ${professor.name.split(" ")[0]}` : "Clase";
        sub = booking.notes ?? "Clase";
      } else if (booking.type === "evento") {
        who = event?.name ?? "Evento";
        sub = event ? `${event.registeredCount}/${event.capacity} inscriptos` : "";
      }

      return {
        courtId: court.id, courtName: court.name, status: booking.type as "simple" | "clase" | "fijo" | "evento" | "bloqueo",
        bookingId: booking.id, who, sub, tel, notes: booking.notes,
        customer: customer ? { name: customer.name, phone: customer.phone } : null,
        professor: professor ? { name: professor.name } : null,
        event: event ? { name: event.name, capacity: event.capacity, registeredCount: event.registeredCount, category: event.category } : null,
      };
    });

    const freeCount = cells.filter(c => c.status === "libre").length;
    const total = cells.length;
    const level = freeCount === total ? "green" : freeCount === 0 ? "red" : "amber";

    // Find event label for this slot
    const eventBooking = dayBookings.find(b =>
      b.type === "evento" && b.eventId && b.status !== "cancelado" &&
      overlaps(b.startTime, b.endTime, start, end)
    );
    const eventLabel = eventBooking?.eventId ? eventMap[eventBooking.eventId]?.name : undefined;

    slots.push({ start, end, cells, summary: { free: freeCount, total, level, eventLabel } });
  }

  // Morning info
  const hasMorningClasses = morningBookings.some(b => b.type === "clase");

  return NextResponse.json({ courts: courtList, slots, hasMorningClasses, morningBookings: [] });
}
