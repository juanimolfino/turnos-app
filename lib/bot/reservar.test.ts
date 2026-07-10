import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock de getDb. preCheck = filas que devuelve la capa B (overlap). insertQueue =
// comportamiento de cada insert: "ok" | "23P01" (exclusión) | "23505" (unique).
const state = vi.hoisted(() => ({
  settings: {
    paymentMode: "none",
    depositPct: 25,
    courtPrice: 1000,
    clubName: "Pádel Central",
    courtName: "Cancha 1",
    refundEnabled: false,
    refundCutoffHours: 24,
  },
  preCheck: [] as { id: string }[],
  insertQueue: [] as ("ok" | "23P01" | "23505")[],
  insertedValues: [] as Record<string, unknown>[],
  cancelledHolds: [] as string[],
  createPreference: vi.fn(),
}));

function pgError(code: string) {
  return Object.assign(new Error(`pg ${code}`), { code });
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: (fields?: Record<string, unknown>) => {
      const isSettingsQuery = Boolean(fields?.paymentMode);
      const query = {
        innerJoin: () => query,
        where: () => Promise.resolve(isSettingsQuery ? [state.settings] : state.preCheck),
      };
      return { from: () => query };
    },
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        state.insertedValues.push(v);
        const behavior = state.insertQueue.shift() ?? "ok";
        return {
          returning: () =>
            behavior === "ok"
              ? Promise.resolve([{ id: "bk-1", bookingCode: v.bookingCode }])
              : Promise.reject(pgError(behavior)),
        };
      },
    }),
  }),
}));

vi.mock("@/lib/payments/mercadopago-booking", () => ({
  createBookingPaymentPreference: (...a: unknown[]) => state.createPreference(...a),
}));

vi.mock("@/lib/db/queries", () => ({
  cancelBotHoldAfterPaymentError: (bookingId: string) => {
    state.cancelledHolds.push(bookingId);
    return Promise.resolve({ id: bookingId, status: "cancelado" });
  },
  findOrCreateBotCustomer: vi.fn().mockResolvedValue({ id: "customer-1", name: "Juan Pérez", phone: "2314 555555" }),
  createNewBookingNotification: vi.fn().mockResolvedValue(undefined),
}));

import { crearReservaBot, generarBookingCode, resolverTurno, confirmarReservaTexto } from "@/lib/bot/reservar";

const input = {
  clubId: "club1", courtId: "court1", date: "2026-06-27",
  startTime: "19:00", endTime: "20:30",
  customerName: "Juan Pérez",
  customerContactPhone: "2314 555555",
  channel: "telegram" as const,
  channelUserId: "12345",
};

describe("generarBookingCode", () => {
  it("formato 3 letras + 3 números, sin caracteres ambiguos (I/O/0/1)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generarBookingCode();
      expect(code).toMatch(/^[A-Z]{3}[0-9]{3}$/);
      expect(code).not.toMatch(/[IO01]/);
    }
  });
});

describe("crearReservaBot", () => {
  beforeEach(() => {
    state.settings = { paymentMode: "none", depositPct: 25, courtPrice: 1000, clubName: "Pádel Central", courtName: "Cancha 1", refundEnabled: false, refundCutoffHours: 24 };
    state.preCheck = [];
    state.insertQueue = [];
    state.insertedValues = [];
    state.cancelledHolds = [];
    state.createPreference.mockReset().mockResolvedValue({
      preferenceId: "pref-1",
      initPoint: "https://mp.example/pay",
    });
  });

  it("reserva exitosa: simple/bot/confirmado/impago + code + nombre/teléfono", async () => {
    const res = await crearReservaBot(input);
    expect(res).toEqual({
      ok: true,
      bookingId: "bk-1",
      bookingCode: expect.stringMatching(/^[A-Z]{3}[0-9]{3}$/),
      status: "confirmado",
      paymentMode: "none",
      amountToCharge: 0,
      heldUntil: null,
      paymentInitPoint: null,
      mpPreferenceId: null,
      refundEnabled: false,
      refundCutoffHours: 24,
    });
    expect(state.createPreference).not.toHaveBeenCalled();

    const v = state.insertedValues[0];
    expect(v).toMatchObject({
      type: "simple", origin: "bot", status: "confirmado", paymentStatus: "impago",
      clubId: "club1", courtId: "court1", date: "2026-06-27",
      startTime: "19:00", endTime: "20:30",
      customerId: "customer-1",
      customerName: "Juan Pérez",
      customerPhone: "12345",
    });
    expect(v.heldUntil).toBeNull();
    expect(v.price).toBeNull();
    expect(v.bookingCode).toMatch(/^[A-Z]{3}[0-9]{3}$/);
  });

  it("club partial: crea hold pendiente con held_until y monto de seña", async () => {
    state.settings = { paymentMode: "partial", depositPct: 25, courtPrice: 1000, clubName: "Pádel Central", courtName: "Cancha 1", refundEnabled: true, refundCutoffHours: 24 };
    const now = new Date("2026-06-27T15:00:00.000Z");

    const res = await crearReservaBot({ ...input, now });

    expect(res).toEqual({
      ok: true,
      bookingId: "bk-1",
      bookingCode: expect.stringMatching(/^[A-Z]{3}[0-9]{3}$/),
      status: "pendiente",
      paymentMode: "partial",
      amountToCharge: 250,
      heldUntil: new Date("2026-06-27T15:10:00.000Z"),
      paymentInitPoint: "https://mp.example/pay",
      mpPreferenceId: "pref-1",
      refundEnabled: true,
      refundCutoffHours: 24,
    });
    expect(state.createPreference).toHaveBeenCalledWith({
      bookingId: "bk-1",
      bookingCode: expect.stringMatching(/^[A-Z]{3}[0-9]{3}$/),
      clubId: "club1",
      clubName: "Pádel Central",
      courtName: "Cancha 1",
      date: "2026-06-27",
      startTime: "19:00",
      amount: 250,
      paymentMode: "partial",
      heldUntil: new Date("2026-06-27T15:10:00.000Z"),
    });
    expect(state.insertedValues[0]).toMatchObject({
      status: "pendiente",
      paymentStatus: "impago",
      price: 250,
      heldUntil: new Date("2026-06-27T15:10:00.000Z"),
    });
  });

  it("club full: crea hold pendiente con monto total", async () => {
    state.settings = { paymentMode: "full", depositPct: 25, courtPrice: 1200, clubName: "Pádel Central", courtName: "Cancha 1", refundEnabled: false, refundCutoffHours: 24 };

    const res = await crearReservaBot({ ...input, now: new Date("2026-06-27T15:00:00.000Z") });

    expect(res).toMatchObject({
      ok: true,
      status: "pendiente",
      paymentMode: "full",
      amountToCharge: 1200,
      heldUntil: new Date("2026-06-27T15:10:00.000Z"),
      paymentInitPoint: "https://mp.example/pay",
      mpPreferenceId: "pref-1",
      refundEnabled: false,
      refundCutoffHours: 24,
    });
    expect(state.insertedValues[0]).toMatchObject({ status: "pendiente", price: 1200 });
  });

  it("booking_code: si colisiona (unique), reintenta con otro", async () => {
    state.insertQueue = ["23505", "ok"];
    const res = await crearReservaBot(input);
    expect(res.ok).toBe(true);
    expect(state.insertedValues).toHaveLength(2);
    expect(state.insertedValues[0].bookingCode).not.toBe(state.insertedValues[1].bookingCode);
  });

  it("CAPA B: si el turno ya está ocupado, NO escribe y devuelve SLOT_NO_DISPONIBLE", async () => {
    state.preCheck = [{ id: "existente" }];
    const res = await crearReservaBot(input);
    expect(res).toEqual({ ok: false, error: "SLOT_NO_DISPONIBLE" });
    expect(state.insertedValues).toHaveLength(0); // no intentó escribir
  });

  it("un hold existente bloquea el turno en capa B", async () => {
    state.preCheck = [{ id: "hold-existente" }];
    const res = await crearReservaBot(input);
    expect(res).toEqual({ ok: false, error: "SLOT_NO_DISPONIBLE" });
    expect(state.insertedValues).toHaveLength(0);
  });

  it("CAPA A: la constraint EXCLUDE (23P01) se traduce a SLOT_NO_DISPONIBLE", async () => {
    state.insertQueue = ["23P01"];
    const res = await crearReservaBot(input);
    expect(res).toEqual({ ok: false, error: "SLOT_NO_DISPONIBLE" });
  });

  it("CAPA A: la constraint EXCLUDE sigue aplicando cuando el nuevo booking es hold", async () => {
    state.settings = { paymentMode: "partial", depositPct: 25, courtPrice: 1000, clubName: "Pádel Central", courtName: "Cancha 1", refundEnabled: false, refundCutoffHours: 24 };
    state.insertQueue = ["23P01"];
    const res = await crearReservaBot(input);
    expect(res).toEqual({ ok: false, error: "SLOT_NO_DISPONIBLE" });
    expect(state.insertedValues[0]).toMatchObject({ status: "pendiente" });
    expect(state.createPreference).not.toHaveBeenCalled();
  });

  it("si Mercado Pago falla, cancela el hold y devuelve error controlado", async () => {
    state.settings = { paymentMode: "partial", depositPct: 25, courtPrice: 1000, clubName: "Pádel Central", courtName: "Cancha 1", refundEnabled: false, refundCutoffHours: 24 };
    state.createPreference.mockRejectedValue(new Error("MP down"));

    const res = await crearReservaBot(input);

    expect(res).toEqual({ ok: false, error: "PAGO_NO_DISPONIBLE" });
    expect(state.insertedValues[0]).toMatchObject({ status: "pendiente" });
    expect(state.cancelledHolds).toEqual(["bk-1"]);
  });

  it("CONCURRENCIA: dos inserciones del mismo turno → una gana, la otra SLOT_NO_DISPONIBLE", async () => {
    // Ambas pasan la capa B (preCheck vacío); la 2ª choca con la constraint.
    state.insertQueue = ["ok", "23P01"];
    const [a, b] = await Promise.all([crearReservaBot(input), crearReservaBot(input)]);
    const oks = [a, b].filter((r) => r.ok);
    const fails = [a, b].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toEqual({ ok: false, error: "SLOT_NO_DISPONIBLE" });
  });

  it("una reserva cancelada NO bloquea (la capa B la filtra) → se puede reservar", async () => {
    // Sólo existe una cancelada solapada → la query (ne status cancelado) la excluye
    // → preCheck vacío → reserva ok.
    state.preCheck = [];
    const res = await crearReservaBot(input);
    expect(res.ok).toBe(true);
  });
});

const lugares = [
  {
    clubId: "cl1", lugar: "Pádel Central", barrio: "Centro",
    slots: [
      { start: "19:00", end: "20:30", canchas: [{ id: "ct1", name: "Cancha 1" }, { id: "ct2", name: "Cancha 2" }] },
      { start: "21:00", end: "22:30", canchas: [{ id: "ct3", name: "Cancha 3" }] },
    ],
  },
];

describe("resolverTurno", () => {
  it("matchea lugar + hora y toma la primera cancha libre si no se especifica", () => {
    const t = resolverTurno(lugares, { lugar: "pádel central", hora: "19:00", cancha: null }, "2026-06-27");
    expect(t).toEqual({
      clubId: "cl1", courtId: "ct1", clubName: "Pádel Central", courtName: "Cancha 1",
      date: "2026-06-27", startTime: "19:00", endTime: "20:30",
    });
  });

  it("respeta la cancha pedida si está libre en ese turno", () => {
    const t = resolverTurno(lugares, { lugar: "Pádel Central", hora: "19:00", cancha: "Cancha 2" }, "2026-06-27");
    expect(t?.courtId).toBe("ct2");
  });

  it("devuelve null si el lugar/hora no corresponde a una opción real", () => {
    expect(resolverTurno(lugares, { lugar: "Otro", hora: "19:00", cancha: null }, "2026-06-27")).toBeNull();
    expect(resolverTurno(lugares, { lugar: "Pádel Central", hora: "07:00", cancha: null }, "2026-06-27")).toBeNull();
    expect(resolverTurno(lugares, { lugar: null, hora: "19:00", cancha: null }, "2026-06-27")).toBeNull();
  });
});

describe("confirmarReservaTexto", () => {
  it("incluye lugar, cancha, hora y el código de reserva", () => {
    const turno = {
      clubId: "cl1", courtId: "ct1", clubName: "Pádel Central", courtName: "Cancha 1",
      date: "2026-06-27", startTime: "19:00", endTime: "20:30",
    };
    const txt = confirmarReservaTexto(turno, "Juan Pérez", {
      ok: true,
      bookingId: "bk1",
      bookingCode: "HYS324",
      status: "confirmado",
      paymentMode: "none",
      amountToCharge: 0,
      heldUntil: null,
      paymentInitPoint: null,
      mpPreferenceId: null,
      refundEnabled: false,
      refundCutoffHours: 24,
    });
    expect(txt).toContain("Pádel Central");
    expect(txt).toContain("Cancha 1");
    expect(txt).toContain("19:00");
    expect(txt).toContain("HYS324");
    expect(txt).toContain("Juan Pérez");
    expect(txt).toContain("cancelar");
  });

  it("para hold muestra monto, link real y ventana de pago", () => {
    const turno = {
      clubId: "cl1", courtId: "ct1", clubName: "Pádel Central", courtName: "Cancha 1",
      date: "2026-06-27", startTime: "19:00", endTime: "20:30",
    };
    const txt = confirmarReservaTexto(turno, "Juan Pérez", {
      ok: true,
      bookingId: "bk1",
      bookingCode: "HYS324",
      status: "pendiente",
      paymentMode: "partial",
      amountToCharge: 250,
      heldUntil: new Date("2026-06-27T15:10:00.000Z"),
      paymentInitPoint: "https://mp.example/pay",
      mpPreferenceId: "pref-1",
      refundEnabled: true,
      refundCutoffHours: 24,
    });

    expect(txt).toContain("provisoriamente");
    expect(txt).toContain("$");
    expect(txt).toContain("250");
    expect(txt).toContain("seña");
    expect(txt).toContain("https://mp.example/pay");
    expect(txt).toContain("10 minutos");
    expect(txt).toContain("24 horas");
    expect(txt).toContain("recuperar tu seña");
  });
});
