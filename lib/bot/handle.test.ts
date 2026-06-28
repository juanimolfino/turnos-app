import { describe, expect, it, vi, beforeEach } from "vitest";

// Espiamos todas las dependencias del flujo: adaptador, memoria, intención,
// búsqueda, redacción, charla, extractor de reserva y motor de reserva.
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
vi.mock("@/lib/bot/intent", () => ({ extraerIntencion: (...a: unknown[]) => extraerIntencion(...a) }));

const buscarDisponibilidad = vi.fn();
vi.mock("@/lib/bot/search", () => ({ buscarDisponibilidad: (...a: unknown[]) => buscarDisponibilidad(...a) }));

const redactarRespuesta = vi.fn();
vi.mock("@/lib/bot/reply", () => ({ redactarRespuesta: (...a: unknown[]) => redactarRespuesta(...a) }));

const generarRespuesta = vi.fn();
vi.mock("@/lib/bot/brain", () => ({ generarRespuesta: (...a: unknown[]) => generarRespuesta(...a) }));

const extraerAccionReserva = vi.fn();
vi.mock("@/lib/bot/extraer-reserva", () => ({ extraerAccionReserva: (...a: unknown[]) => extraerAccionReserva(...a) }));

const extraerAccionCancelacion = vi.fn();
vi.mock("@/lib/bot/extraer-cancelacion", () => ({ extraerAccionCancelacion: (...a: unknown[]) => extraerAccionCancelacion(...a) }));

const cancelarReservaBotPorCodigo = vi.fn();
const respuestaCancelacionTexto = vi.fn();
vi.mock("@/lib/bot/cancelar", () => ({
  cancelarReservaBotPorCodigo: (...a: unknown[]) => cancelarReservaBotPorCodigo(...a),
  respuestaCancelacionTexto: (...a: unknown[]) => respuestaCancelacionTexto(...a),
}));

const crearReservaBot = vi.fn();
const resolverTurno = vi.fn();
const confirmarReservaTexto = vi.fn();
vi.mock("@/lib/bot/reservar", () => ({
  crearReservaBot: (...a: unknown[]) => crearReservaBot(...a),
  resolverTurno: (...a: unknown[]) => resolverTurno(...a),
  confirmarReservaTexto: (...a: unknown[]) => confirmarReservaTexto(...a),
}));

import { handleIncomingMessage } from "@/lib/bot/handle";

const msg = (text: string) => ({ channel: "telegram" as const, userId: "123", text });
const conIntencion = { date: "2026-06-27", time: "19:00", zone: "Bolívar", sport: "padel" };
const lugares = [
  { clubId: "cl1", lugar: "Pádel Central", barrio: "Centro", slots: [{ start: "19:00", end: "20:30", canchas: [{ id: "ct1", name: "Cancha 1" }] }] },
];
const turno = { clubId: "cl1", courtId: "ct1", clubName: "Pádel Central", courtName: "Cancha 1", date: "2026-06-27", startTime: "19:00", endTime: "20:30" };

const accionNinguna = { tipo: "ninguna", lugar: null, hora: null, cancha: null, nombre: null };

describe("handleIncomingMessage (Fase 6 — reservar)", () => {
  beforeEach(() => {
    send.mockReset();
    getHistory.mockReset().mockResolvedValue([]);
    appendTurns.mockReset().mockResolvedValue(undefined);
    extraerIntencion.mockReset();
    buscarDisponibilidad.mockReset().mockResolvedValue(lugares);
    redactarRespuesta.mockReset().mockResolvedValue("texto oferta");
    generarRespuesta.mockReset().mockResolvedValue("¿qué día?");
    extraerAccionReserva.mockReset().mockResolvedValue(accionNinguna);
    extraerAccionCancelacion.mockReset().mockReturnValue({ tipo: "ninguna" });
    cancelarReservaBotPorCodigo.mockReset();
    respuestaCancelacionTexto.mockReset().mockReturnValue("CANCELADA");
    crearReservaBot.mockReset();
    resolverTurno.mockReset().mockReturnValue(turno);
    confirmarReservaTexto.mockReset().mockReturnValue("CONFIRMADA HYS324");
  });

  it("sin date → repregunta (charla) y NO busca ni reserva", async () => {
    extraerIntencion.mockResolvedValue({ date: null, time: null, zone: null, sport: "padel" });
    await handleIncomingMessage(msg("quiero jugar"));
    expect(generarRespuesta).toHaveBeenCalled();
    expect(buscarDisponibilidad).not.toHaveBeenCalled();
    expect(crearReservaBot).not.toHaveBeenCalled();
  });

  it("explorando (acción 'ninguna') → redacta la oferta, no reserva", async () => {
    extraerIntencion.mockResolvedValue(conIntencion);
    await handleIncomingMessage(msg("el sábado a las 19"));
    expect(redactarRespuesta).toHaveBeenCalled();
    expect(crearReservaBot).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("123", "texto oferta");
  });

  it("eligió turno sin nombre → pide nombre, no reserva", async () => {
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({ tipo: "elegir", lugar: "Pádel Central", hora: "19:00", cancha: null, nombre: null });
    await handleIncomingMessage(msg("dale ese"));
    expect(crearReservaBot).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("123", expect.stringContaining("nombre"));
  });

  it("eligió turno + nombre → reserva y confirma con código (teléfono = id del canal)", async () => {
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({ tipo: "reservar", lugar: "Pádel Central", hora: "19:00", cancha: null, nombre: "Juan Pérez" });
    crearReservaBot.mockResolvedValue({ ok: true, bookingId: "bk1", bookingCode: "HYS324" });

    await handleIncomingMessage(msg("Juan Pérez"));

    expect(crearReservaBot).toHaveBeenCalledWith({
      clubId: "cl1", courtId: "ct1", date: "2026-06-27",
      startTime: "19:00", endTime: "20:30",
      customerName: "Juan Pérez", customerPhone: "123",
    });
    expect(confirmarReservaTexto).toHaveBeenCalledWith(turno, "Juan Pérez", "HYS324");
    expect(send).toHaveBeenCalledWith("123", "CONFIRMADA HYS324");
  });

  it("CAPA B/A: si el turno se ocupó → no confirma, avisa y re-ofrece", async () => {
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({ tipo: "reservar", lugar: "Pádel Central", hora: "19:00", cancha: null, nombre: "Juan Pérez" });
    crearReservaBot.mockResolvedValue({ ok: false, error: "SLOT_NO_DISPONIBLE" });

    await handleIncomingMessage(msg("Juan Pérez"));

    expect(confirmarReservaTexto).not.toHaveBeenCalled();
    expect(redactarRespuesta).toHaveBeenCalled(); // re-ofrece opciones
    expect(send).toHaveBeenCalledWith("123", expect.stringContaining("se acaba de ocupar"));
  });

  it("eligió pero el turno no resuelve (ya no está en la oferta) → re-ofrece, no reserva", async () => {
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({ tipo: "reservar", lugar: "Inexistente", hora: "19:00", cancha: null, nombre: "Juan" });
    resolverTurno.mockReturnValue(null);

    await handleIncomingMessage(msg("Juan"));

    expect(crearReservaBot).not.toHaveBeenCalled();
    expect(redactarRespuesta).toHaveBeenCalled();
  });

  it("cancelación con código → cancela antes de buscar disponibilidad (teléfono = id del canal)", async () => {
    extraerAccionCancelacion.mockReturnValue({ tipo: "cancelar", bookingCode: "HYS324" });
    cancelarReservaBotPorCodigo.mockResolvedValue({ ok: true, status: "cancelada", reserva: { bookingCode: "HYS324" } });

    await handleIncomingMessage(msg("quiero cancelar HYS324"));

    expect(cancelarReservaBotPorCodigo).toHaveBeenCalledWith({ bookingCode: "HYS324", customerPhone: "123" });
    expect(extraerIntencion).not.toHaveBeenCalled();
    expect(buscarDisponibilidad).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("123", "CANCELADA");
  });

  it("cancelación sin código → pide el código y no busca disponibilidad", async () => {
    extraerAccionCancelacion.mockReturnValue({ tipo: "pedir_codigo" });

    await handleIncomingMessage(msg("quiero cancelar mi turno"));

    expect(cancelarReservaBotPorCodigo).not.toHaveBeenCalled();
    expect(extraerIntencion).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("123", expect.stringContaining("código de reserva"));
  });
});
