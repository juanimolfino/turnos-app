import { describe, expect, it, vi, beforeEach } from "vitest";

// Espiamos todas las dependencias del flujo: adaptador, memoria, intención,
// búsqueda, redacción y charla. Sin red, sin OpenAI, sin DB.
const send = vi.fn();
vi.mock("@/lib/bot/channels/telegram", () => ({
  telegramAdapter: { send: (...a: unknown[]) => send(...a) },
}));

const getHistory = vi.fn();
const appendTurns = vi.fn();
vi.mock("@/lib/bot/memory", () => ({
  getHistory: (...a: unknown[]) => getHistory(...a),
  appendTurns: (...a: unknown[]) => appendTurns(...a),
}));

const extraerIntencion = vi.fn();
vi.mock("@/lib/bot/intent", () => ({
  extraerIntencion: (...a: unknown[]) => extraerIntencion(...a),
}));

const buscarDisponibilidad = vi.fn();
vi.mock("@/lib/bot/search", () => ({
  buscarDisponibilidad: (...a: unknown[]) => buscarDisponibilidad(...a),
}));

const redactarRespuesta = vi.fn();
vi.mock("@/lib/bot/reply", () => ({
  redactarRespuesta: (...a: unknown[]) => redactarRespuesta(...a),
}));

const generarRespuesta = vi.fn();
vi.mock("@/lib/bot/brain", () => ({
  generarRespuesta: (...a: unknown[]) => generarRespuesta(...a),
}));

// Guard: el flujo de Fase 5 no debe escribir reservas.
const createBooking = vi.fn();
vi.mock("@/lib/db/queries", () => ({ createBooking: (...a: unknown[]) => createBooking(...a) }));

import { handleIncomingMessage } from "@/lib/bot/handle";

const msg = (text: string) => ({ channel: "telegram" as const, userId: "123", text });

describe("handleIncomingMessage (Fase 5)", () => {
  beforeEach(() => {
    send.mockReset();
    getHistory.mockReset().mockResolvedValue([]);
    appendTurns.mockReset().mockResolvedValue(undefined);
    extraerIntencion.mockReset();
    buscarDisponibilidad.mockReset();
    redactarRespuesta.mockReset();
    generarRespuesta.mockReset();
    createBooking.mockReset();
  });

  it("sin date → repregunta (charla) y NO busca", async () => {
    extraerIntencion.mockResolvedValue({ date: null, time: null, zone: null, sport: "padel" });
    generarRespuesta.mockResolvedValue("¿Para qué día buscás?");

    await handleIncomingMessage(msg("quiero jugar"));

    expect(generarRespuesta).toHaveBeenCalledWith("quiero jugar", []);
    expect(buscarDisponibilidad).not.toHaveBeenCalled();
    expect(redactarRespuesta).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("123", "¿Para qué día buscás?");
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("con date+sport → busca y deja que la IA redacte sobre los hechos", async () => {
    const intent = { date: "2026-06-27", time: "18:00", zone: "Bolívar", sport: "padel" };
    const lugares = [{ lugar: "El Corralón", barrio: "Centro", slots: [{ start: "16:30", end: "18:00", canchas: ["Cancha 1"] }] }];
    extraerIntencion.mockResolvedValue(intent);
    buscarDisponibilidad.mockResolvedValue(lugares);
    redactarRespuesta.mockResolvedValue("Para el sábado, en El Corralón hay 16:30…");

    await handleIncomingMessage(msg("el sábado a las 18"));

    expect(buscarDisponibilidad).toHaveBeenCalledWith(intent, "el sábado a las 18");
    expect(redactarRespuesta).toHaveBeenCalledWith({
      history: [],
      userText: "el sábado a las 18",
      intent,
      lugares,
    });
    expect(generarRespuesta).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("123", "Para el sábado, en El Corralón hay 16:30…");
  });

  it("sin disponibilidad → igual redacta (lugares vacíos) para el 'no hay'", async () => {
    const intent = { date: "2026-06-27", time: null, zone: "Bolívar", sport: "padel" };
    extraerIntencion.mockResolvedValue(intent);
    buscarDisponibilidad.mockResolvedValue([]);
    redactarRespuesta.mockResolvedValue("Para ese día no hay nada, ¿probamos otro?");

    await handleIncomingMessage(msg("el sábado"));

    expect(redactarRespuesta).toHaveBeenCalledWith(expect.objectContaining({ lugares: [] }));
    expect(send).toHaveBeenCalledWith("123", "Para ese día no hay nada, ¿probamos otro?");
  });

  it("al elegir una opción → confirma (redacta) sin escribir en bookings", async () => {
    const intent = { date: "2026-06-27", time: "16:30", zone: "Bolívar", sport: "padel" };
    extraerIntencion.mockResolvedValue(intent);
    buscarDisponibilidad.mockResolvedValue([
      { lugar: "El Corralón", barrio: "Centro", slots: [{ start: "16:30", end: "18:00", canchas: ["Cancha 1"] }] },
    ]);
    redactarRespuesta.mockResolvedValue("Genial, El Corralón 16:30. La reserva se habilita en el próximo paso.");

    await handleIncomingMessage(msg("dale, el de las 16:30 en El Corralón"));

    expect(redactarRespuesta).toHaveBeenCalled();
    expect(createBooking).not.toHaveBeenCalled(); // NO reserva todavía
    expect(send).toHaveBeenCalledWith("123", expect.stringContaining("próximo paso"));
  });

  it("guarda ambos turnos en memoria", async () => {
    extraerIntencion.mockResolvedValue({ date: null, time: null, zone: null, sport: "padel" });
    generarRespuesta.mockResolvedValue("¿Qué día?");

    await handleIncomingMessage(msg("hola"));

    expect(appendTurns).toHaveBeenCalledWith("telegram:123", [
      { role: "user", content: "hola" },
      { role: "assistant", content: "¿Qué día?" },
    ]);
  });
});
