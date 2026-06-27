import { describe, expect, it } from "vitest";
import {
  computeAvailability,
  DEFAULT_WINDOW,
  type AvailabilityCourt,
  type AvailabilityBooking,
} from "@/lib/bookings/availability";

const courtsBase: AvailabilityCourt[] = [
  { id: "c1", name: "Cancha 1", sortOrder: 0, sportId: "padel" },
  { id: "c2", name: "Cancha 2", sortOrder: 1, sportId: "padel" },
];

const window3h = { open: "08:00", close: "11:00", slotMinutes: 90 }; // 08:00-09:30, 09:30-11:00

describe("computeAvailability", () => {
  it("marca libres/ocupados según solapamiento half-open", () => {
    const bookings: AvailabilityBooking[] = [
      { courtId: "c1", startTime: "08:00", endTime: "09:30", status: "confirmado" },
    ];
    const slots = computeAvailability({ courts: courtsBase, bookings, window: window3h });

    expect(slots).toHaveLength(2);
    // 08:00-09:30 → c1 ocupada, c2 libre
    expect(slots[0]).toEqual({
      start: "08:00",
      end: "09:30",
      freeCourts: [{ id: "c2", name: "Cancha 2" }],
      totalCourts: 2,
    });
    // 09:30-11:00 → ambas libres (el booking termina justo a las 09:30, half-open no solapa)
    expect(slots[1].freeCourts.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("un booking 'pendiente' cuenta como ocupado", () => {
    const bookings: AvailabilityBooking[] = [
      { courtId: "c1", startTime: "08:00", endTime: "09:30", status: "pendiente" },
    ];
    const slots = computeAvailability({ courts: courtsBase, bookings, window: window3h });
    expect(slots[0].freeCourts.map((c) => c.id)).toEqual(["c2"]); // c1 ocupada por pendiente
  });

  it("un booking 'cancelado' NO ocupa", () => {
    const bookings: AvailabilityBooking[] = [
      { courtId: "c1", startTime: "08:00", endTime: "09:30", status: "cancelado" },
    ];
    const slots = computeAvailability({ courts: courtsBase, bookings, window: window3h });
    expect(slots[0].freeCourts.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("omite slots sin ninguna cancha libre", () => {
    const bookings: AvailabilityBooking[] = [
      { courtId: "c1", startTime: "08:00", endTime: "09:30", status: "confirmado" },
      { courtId: "c2", startTime: "08:00", endTime: "09:30", status: "confirmado" },
    ];
    const slots = computeAvailability({ courts: courtsBase, bookings, window: window3h });
    expect(slots).toHaveLength(1); // solo 09:30-11:00
    expect(slots[0].start).toBe("09:30");
  });

  it("respeta la ventana default (08:00–23:00, slot 90 → 10 slots)", () => {
    const window = {
      open: DEFAULT_WINDOW.open,
      close: DEFAULT_WINDOW.close,
      slotMinutes: DEFAULT_WINDOW.slot,
    };
    const slots = computeAvailability({ courts: courtsBase, bookings: [], window });
    expect(slots).toHaveLength(10);
    expect(slots[0].start).toBe("08:00");
    expect(slots.at(-1)!.end).toBe("23:00");
  });

  it("filtra por sport cuando se pasa sportId", () => {
    const mixed: AvailabilityCourt[] = [
      { id: "p1", name: "Pádel 1", sortOrder: 0, sportId: "padel" },
      { id: "t1", name: "Tenis 1", sortOrder: 1, sportId: "tenis" },
    ];
    const slots = computeAvailability({ courts: mixed, bookings: [], window: window3h, sportId: "padel" });
    expect(slots[0].totalCourts).toBe(1);
    expect(slots[0].freeCourts).toEqual([{ id: "p1", name: "Pádel 1" }]);
  });

  it("sin sportId considera todas las canchas", () => {
    const mixed: AvailabilityCourt[] = [
      { id: "p1", name: "Pádel 1", sortOrder: 0, sportId: "padel" },
      { id: "t1", name: "Tenis 1", sortOrder: 1, sportId: "tenis" },
    ];
    const slots = computeAvailability({ courts: mixed, bookings: [], window: window3h });
    expect(slots[0].totalCourts).toBe(2);
  });

  it("acota por start/end", () => {
    const slots = computeAvailability({
      courts: courtsBase,
      bookings: [],
      window: { open: "08:00", close: "14:00", slotMinutes: 90 },
      start: "09:30",
      end: "12:30",
    });
    // 09:30-11:00 y 11:00-12:30 (el 08:00 queda fuera por start; >12:30 por end)
    expect(slots.map((s) => `${s.start}-${s.end}`)).toEqual(["09:30-11:00", "11:00-12:30"]);
  });

  it("equivale al algoritmo inline original (JSON idéntico)", () => {
    // Réplica EXACTA del cálculo inline que tenía app/api/public/availability/route.ts
    function legacy(courts: AvailabilityCourt[], bookings: AvailabilityBooking[], win: typeof window3h) {
      const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
      const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const allCourts = [...courts].sort((a, b) => a.sortOrder - b.sortOrder);
      const day = bookings.filter((b) => b.status !== "cancelado");
      const out = [];
      const closeMin = toMin(win.close);
      for (let cur = toMin(win.open); cur + win.slotMinutes <= closeMin; cur += win.slotMinutes) {
        const s = fmt(cur), e = fmt(cur + win.slotMinutes);
        const freeCourts = allCourts.filter((c) => !day.some((b) => b.courtId === c.id && b.startTime < e && b.endTime > s));
        if (freeCourts.length > 0) {
          out.push({ start: s, end: e, freeCourts: freeCourts.map((c) => ({ id: c.id, name: c.name })), totalCourts: allCourts.length });
        }
      }
      return out;
    }

    const bookings: AvailabilityBooking[] = [
      { courtId: "c1", startTime: "08:00", endTime: "09:30", status: "confirmado" },
      { courtId: "c2", startTime: "09:30", endTime: "11:00", status: "pendiente" },
      { courtId: "c1", startTime: "12:00", endTime: "13:30", status: "cancelado" },
    ];
    const win = { open: "08:00", close: "14:00", slotMinutes: 90 };

    expect(computeAvailability({ courts: courtsBase, bookings, window: win })).toEqual(
      legacy(courtsBase, bookings, win),
    );
  });
});

// ── Turnos "pegados a la ocupación" (opción A) ───────────────────────────────
describe("computeAvailability — huecos pegados a la ocupación", () => {
  const oneCourt: AvailabilityCourt[] = [{ id: "c1", name: "Cancha 1", sortOrder: 0, sportId: "padel" }];
  const startsOf = (slots: { start: string }[]) => slots.map((s) => s.start);

  it("CASO REAL: evento 08:00–19:00 + torneo 20:30–23:59 → ofrece 19:00–20:30 (antes daba 0)", () => {
    const slots = computeAvailability({
      courts: oneCourt,
      bookings: [
        { courtId: "c1", startTime: "08:00", endTime: "19:00", status: "confirmado" }, // evento
        { courtId: "c1", startTime: "20:30", endTime: "23:59", status: "confirmado" }, // torneo
      ],
      window: { open: "08:00", close: "23:00", slotMinutes: 90 },
    });
    expect(slots).toEqual([
      { start: "19:00", end: "20:30", freeCourts: [{ id: "c1", name: "Cancha 1" }], totalCourts: 1 },
    ]);
  });

  it("hueco de 90 → un turno", () => {
    const slots = computeAvailability({
      courts: oneCourt,
      bookings: [
        { courtId: "c1", startTime: "08:00", endTime: "19:00", status: "confirmado" },
        { courtId: "c1", startTime: "20:30", endTime: "23:00", status: "confirmado" },
      ],
      window: { open: "08:00", close: "23:00", slotMinutes: 90 },
    });
    expect(startsOf(slots)).toEqual(["19:00"]); // hueco 19:00–20:30 = 90
  });

  it("hueco de 180 → dos turnos consecutivos", () => {
    const slots = computeAvailability({
      courts: oneCourt,
      bookings: [
        { courtId: "c1", startTime: "08:00", endTime: "18:00", status: "confirmado" },
        { courtId: "c1", startTime: "21:00", endTime: "23:00", status: "confirmado" },
      ],
      window: { open: "08:00", close: "23:00", slotMinutes: 90 },
    });
    // hueco 18:00–21:00 = 180 → 18:00–19:30 y 19:30–21:00
    expect(slots.map((s) => `${s.start}-${s.end}`)).toEqual(["18:00-19:30", "19:30-21:00"]);
  });

  it("hueco de 60 → ningún turno (no entra un turno de 90)", () => {
    const slots = computeAvailability({
      courts: oneCourt,
      bookings: [
        { courtId: "c1", startTime: "08:00", endTime: "19:00", status: "confirmado" },
        { courtId: "c1", startTime: "20:00", endTime: "23:00", status: "confirmado" },
      ],
      window: { open: "08:00", close: "23:00", slotMinutes: 90 },
    });
    expect(slots).toEqual([]); // hueco 19:00–20:00 = 60 < 90
  });

  it("cancha sin bookings → turnos desde la apertura", () => {
    const slots = computeAvailability({
      courts: oneCourt,
      bookings: [],
      window: { open: "08:00", close: "12:30", slotMinutes: 90 },
    });
    expect(slots.map((s) => `${s.start}-${s.end}`)).toEqual(["08:00-09:30", "09:30-11:00", "11:00-12:30"]);
  });

  it("cancha llena → 0 turnos", () => {
    const slots = computeAvailability({
      courts: oneCourt,
      bookings: [{ courtId: "c1", startTime: "08:00", endTime: "23:00", status: "confirmado" }],
      window: { open: "08:00", close: "23:00", slotMinutes: 90 },
    });
    expect(slots).toEqual([]);
  });

  it("BORDE 1: bloqueo 08:00–23:59 (día entero) → 0 turnos (no ofrece turno de 1 min ni que arranque 23:59)", () => {
    const slots = computeAvailability({
      courts: oneCourt,
      bookings: [{ courtId: "c1", startTime: "08:00", endTime: "23:59", status: "confirmado" }],
      window: { open: "08:00", close: "23:59", slotMinutes: 90 },
    });
    expect(slots).toEqual([]);
  });

  it("ningún turno excede el cierre de la ventana", () => {
    const slots = computeAvailability({
      courts: oneCourt,
      bookings: [],
      window: { open: "08:00", close: "23:00", slotMinutes: 90 },
    });
    const closeMin = 23 * 60;
    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    expect(slots.every((s) => toMin(s.end) <= closeMin)).toBe(true);
  });

  it("BORDE 2: Pádel Central (día normal) sigue mostrando 08:00 … 21:30 (sin regresión)", () => {
    const courts: AvailabilityCourt[] = [
      { id: "c1", name: "Cancha 1", sortOrder: 0, sportId: "padel" },
      { id: "c2", name: "Cancha 2", sortOrder: 1, sportId: "padel" },
      { id: "c3", name: "Cancha 3", sortOrder: 2, sportId: "padel" },
    ];
    const slots = computeAvailability({
      courts,
      bookings: [
        { courtId: "c1", startTime: "08:00", endTime: "20:00", status: "confirmado" }, // torneo
        { courtId: "c1", startTime: "22:00", endTime: "23:30", status: "confirmado" }, // simple
      ],
      window: { open: "08:00", close: "23:30", slotMinutes: 90 },
    });
    expect(startsOf(slots)).toEqual([
      "08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30", "20:00", "21:30",
    ]);
  });
});
