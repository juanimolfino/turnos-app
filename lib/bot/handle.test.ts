import { describe, expect, it, vi, beforeEach } from "vitest";

// Espiamos todas las dependencias del flujo: adaptador, memoria, intención,
// búsqueda, redacción, charla, extractor de reserva y motor de reserva.
const send = vi.fn();
const whatsappSend = vi.fn();
vi.mock("@/lib/bot/channels/telegram", () => ({
  telegramAdapter: { send: (...a: unknown[]) => send(...a) },
}));
vi.mock("@/lib/bot/channels/whatsapp", () => ({
  whatsappAdapter: { send: (...a: unknown[]) => whatsappSend(...a) },
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

const getKnownBotCustomer = vi.fn();
vi.mock("@/lib/db/queries", () => ({
  getKnownBotCustomer: (...a: unknown[]) => getKnownBotCustomer(...a),
}));

import { handleIncomingMessage } from "@/lib/bot/handle";

const msg = (text: string) => ({ channel: "telegram" as const, userId: "123", text });
const whatsappMsg = (text: string) => ({ channel: "whatsapp" as const, userId: "50672448449", text });
const conIntencion = { date: "2026-06-27", time: "19:00", zone: "Bolívar", sport: "padel" };
const lugares = [
  { clubId: "cl1", lugar: "Pádel Central", barrio: "Centro", slots: [{ start: "19:00", end: "20:30", canchas: [{ id: "ct1", name: "Cancha 1" }] }] },
];
const turno = { clubId: "cl1", courtId: "ct1", clubName: "Pádel Central", courtName: "Cancha 1", date: "2026-06-27", startTime: "19:00", endTime: "20:30" };

const accionNinguna = { tipo: "ninguna", lugar: null, hora: null, cancha: null, nombre: null };

describe("handleIncomingMessage (Fase 6 — reservar)", () => {
  beforeEach(() => {
    send.mockReset();
    whatsappSend.mockReset();
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
    getKnownBotCustomer.mockReset().mockResolvedValue(null);
  });

  it("sin date → repregunta (charla) y NO busca ni reserva", async () => {
    extraerIntencion.mockResolvedValue({ date: null, time: null, zone: null, sport: "padel" });
    await handleIncomingMessage(msg("quiero jugar"));
    expect(generarRespuesta).toHaveBeenCalled();
    expect(buscarDisponibilidad).not.toHaveBeenCalled();
    expect(crearReservaBot).not.toHaveBeenCalled();
  });

  it("si el cliente ya existe y abre conversación, lo saluda por nombre", async () => {
    getKnownBotCustomer.mockResolvedValue({ clubId: "cl1", name: "Carlos Gómez", phone: "2314 444444" });
    extraerIntencion.mockResolvedValue({ date: null, time: null, zone: null, sport: "padel" });

    await handleIncomingMessage(msg("hola"));

    expect(generarRespuesta).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("123", "Hola Carlos. ¿Cuándo te gustaría jugar?");
  });

  it("un hola después de una reserva vieja no reutiliza turno ni crea otro hold", async () => {
    getHistory.mockResolvedValue([
      { role: "user", content: "Si" },
      { role: "assistant", content: "¡Listo, Juan! Te reservé provisoriamente el sábado 25 de julio a las 21:30. Link de pago..." },
      { role: "assistant", content: "Pago acreditado. Tu reserva quedó confirmada. Código JXE389." },
    ]);
    getKnownBotCustomer.mockResolvedValue({ clubId: "cl1", name: "Juan Molfino", phone: "50672448449" });
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({
      tipo: "reservar",
      lugar: "Pádel Central",
      hora: "19:00",
      cancha: null,
      nombre: "Juan Molfino",
      telefono: null,
    });

    await handleIncomingMessage(whatsappMsg("Hola"));

    expect(extraerIntencion).not.toHaveBeenCalled();
    expect(buscarDisponibilidad).not.toHaveBeenCalled();
    expect(extraerAccionReserva).not.toHaveBeenCalled();
    expect(crearReservaBot).not.toHaveBeenCalled();
    expect(whatsappSend).toHaveBeenCalledWith("50672448449", "Hola Juan. ¿Cuándo te gustaría jugar?");
  });

  it("después de una confirmación final, un nuevo pedido se interpreta sin datos viejos", async () => {
    getHistory.mockResolvedValue([
      { role: "user", content: "Si" },
      { role: "assistant", content: "Pago acreditado. Tu reserva en Padel entro para el sábado, 25 de julio a las 21:30 quedó confirmada. Tu código de reserva es JXE389." },
    ]);
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue(accionNinguna);

    await handleIncomingMessage(whatsappMsg("quiero jugar mañana a las 20"));

    expect(extraerIntencion).toHaveBeenCalledWith([
      { role: "user", content: "quiero jugar mañana a las 20" },
    ], expect.any(Date));
    expect(buscarDisponibilidad).toHaveBeenCalled();
    expect(extraerAccionReserva).toHaveBeenCalledWith([
      { role: "user", content: "quiero jugar mañana a las 20" },
    ], lugares);
    expect(crearReservaBot).not.toHaveBeenCalled();
  });

  it("si nombra un club pero falta día → pregunta el día conservando ese club", async () => {
    extraerIntencion.mockResolvedValue({ date: null, time: null, zone: null, club: "Pádel Central", sport: "padel" });

    await handleIncomingMessage(msg("qué hay en Pádel Central"));

    expect(generarRespuesta).not.toHaveBeenCalled();
    expect(buscarDisponibilidad).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("123", "¿Para qué día querés ver turnos en Pádel Central?");
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

  it("WhatsApp eligió turno sin nombre → pide solo nombre y apellido", async () => {
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({ tipo: "elegir", lugar: "Pádel Central", hora: "19:00", cancha: null, nombre: null });

    await handleIncomingMessage(whatsappMsg("dale ese"));

    expect(crearReservaBot).not.toHaveBeenCalled();
    expect(whatsappSend).toHaveBeenCalledWith("50672448449", "¡Buenísimo! ¿A nombre de quién hago la reserva? Pasame nombre y apellido.");
    expect(whatsappSend.mock.calls[0][1]).not.toMatch(/teléfono de contacto/i);
  });

  it("WhatsApp eligió turno + nombre → usa el número de WhatsApp como teléfono de contacto y canal", async () => {
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({
      tipo: "reservar",
      lugar: "Pádel Central",
      hora: "19:00",
      cancha: null,
      nombre: "Juan Pérez",
      telefono: null,
    });
    const reservaOk = {
      ok: true,
      bookingId: "bk1",
      bookingCode: "HYS324",
      status: "confirmado",
      paymentMode: "none",
      amountToCharge: 0,
      heldUntil: null,
      paymentInitPoint: null,
      mpPreferenceId: null,
    };
    crearReservaBot.mockResolvedValue(reservaOk);

    await handleIncomingMessage(whatsappMsg("Juan Pérez"));

    expect(crearReservaBot).toHaveBeenCalledWith({
      clubId: "cl1", courtId: "ct1", date: "2026-06-27",
      startTime: "19:00", endTime: "20:30",
      customerName: "Juan Pérez",
      customerContactPhone: "50672448449",
      channel: "whatsapp",
      channelUserId: "50672448449",
    });
    expect(confirmarReservaTexto).toHaveBeenCalledWith(turno, "Juan Pérez", reservaOk);
    expect(whatsappSend).toHaveBeenCalledWith("50672448449", "CONFIRMADA HYS324");
  });

  it("eligió turno + nombre pero sin teléfono → pide teléfono y no reserva", async () => {
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({ tipo: "reservar", lugar: "Pádel Central", hora: "19:00", cancha: null, nombre: "Juan Pérez" });

    await handleIncomingMessage(msg("Juan Pérez"));

    expect(crearReservaBot).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("123", expect.stringContaining("teléfono"));
  });

  it("eligió turno + nombre + teléfono → guarda cliente, reserva y conserva id del canal para cancelación", async () => {
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({
      tipo: "reservar",
      lugar: "Pádel Central",
      hora: "19:00",
      cancha: null,
      nombre: "Juan Pérez",
      telefono: "2314 555555",
    });
    const reservaOk = {
      ok: true,
      bookingId: "bk1",
      bookingCode: "HYS324",
      status: "confirmado",
      paymentMode: "none",
      amountToCharge: 0,
      heldUntil: null,
      paymentInitPoint: null,
      mpPreferenceId: null,
    };
    crearReservaBot.mockResolvedValue(reservaOk);

    await handleIncomingMessage(msg("Juan Pérez"));

    expect(crearReservaBot).toHaveBeenCalledWith({
      clubId: "cl1", courtId: "ct1", date: "2026-06-27",
      startTime: "19:00", endTime: "20:30",
      customerName: "Juan Pérez",
      customerContactPhone: "2314 555555",
      channel: "telegram",
      channelUserId: "123",
    });
    expect(confirmarReservaTexto).toHaveBeenCalledWith(turno, "Juan Pérez", reservaOk);
    expect(send).toHaveBeenCalledWith("123", "CONFIRMADA HYS324");
  });

  it("si el cliente ya existe para ese club, pide confirmar los datos antes de reservar", async () => {
    getKnownBotCustomer.mockResolvedValue({ clubId: "cl1", name: "Carlos Gómez", phone: "2314 444444" });
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({ tipo: "elegir", lugar: "Pádel Central", hora: "19:00", cancha: null, nombre: null, telefono: null });

    await handleIncomingMessage(msg("quiero ese"));

    expect(crearReservaBot).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("123", expect.stringContaining("Nombre: Carlos Gómez"));
    expect(send).toHaveBeenCalledWith("123", expect.stringContaining("Teléfono: 2314 444444"));
    expect(send).toHaveBeenCalledWith("123", expect.stringContaining("Confirmás que son correctos"));
  });

  it("si el cliente confirma los datos guardados, reserva con esos datos", async () => {
    getHistory.mockResolvedValue([
      {
        role: "assistant",
        content:
          'Tengo estos datos para reservar en Pádel Central (Cancha 1) a las 19:00:\nNombre: Carlos Gómez\nTeléfono: 2314 444444\n\n¿Confirmás que son correctos para reservar? Si está bien, respondé "sí". Si querés cambiarlos, mandame nombre y teléfono nuevos.',
      },
    ]);
    getKnownBotCustomer.mockResolvedValue({ clubId: "cl1", name: "Carlos Gómez", phone: "2314 444444" });
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({ tipo: "elegir", lugar: "Pádel Central", hora: "19:00", cancha: null, nombre: null, telefono: null });
    const reservaOk = {
      ok: true,
      bookingId: "bk1",
      bookingCode: "HYS324",
      status: "confirmado",
      paymentMode: "none",
      amountToCharge: 0,
      heldUntil: null,
      paymentInitPoint: null,
      mpPreferenceId: null,
    };
    crearReservaBot.mockResolvedValue(reservaOk);

    await handleIncomingMessage(msg("sí"));

    expect(crearReservaBot).toHaveBeenCalledWith({
      clubId: "cl1", courtId: "ct1", date: "2026-06-27",
      startTime: "19:00", endTime: "20:30",
      customerName: "Carlos Gómez",
      customerContactPhone: "2314 444444",
      channel: "telegram",
      channelUserId: "123",
    });
    expect(confirmarReservaTexto).toHaveBeenCalledWith(turno, "Carlos Gómez", reservaOk);
  });

  it("si el cliente niega los datos guardados, pide datos nuevos y no reserva", async () => {
    getHistory.mockResolvedValue([
      {
        role: "assistant",
        content:
          'Tengo estos datos para reservar en Pádel Central (Cancha 1) a las 19:00:\nNombre: Carlos Gómez\nTeléfono: 2314 444444\n\n¿Confirmás que son correctos para reservar? Si está bien, respondé "sí". Si querés cambiarlos, mandame nombre y teléfono nuevos.',
      },
    ]);
    getKnownBotCustomer.mockResolvedValue({ clubId: "cl1", name: "Carlos Gómez", phone: "2314 444444" });
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({ tipo: "elegir", lugar: "Pádel Central", hora: "19:00", cancha: null, nombre: null, telefono: null });

    await handleIncomingMessage(msg("no, está mal"));

    expect(crearReservaBot).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("123", expect.stringContaining("nombre y apellido"));
    expect(send).toHaveBeenCalledWith("123", expect.stringContaining("teléfono"));
  });

  it("si el cliente corrige los datos guardados, reserva con los nuevos datos", async () => {
    getHistory.mockResolvedValue([
      {
        role: "assistant",
        content:
          'Tengo estos datos para reservar en Pádel Central (Cancha 1) a las 19:00:\nNombre: Carlos Gómez\nTeléfono: 2314 444444\n\n¿Confirmás que son correctos para reservar? Si está bien, respondé "sí". Si querés cambiarlos, mandame nombre y teléfono nuevos.',
      },
    ]);
    getKnownBotCustomer.mockResolvedValue({ clubId: "cl1", name: "Carlos Gómez", phone: "2314 444444" });
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({
      tipo: "reservar",
      lugar: "Pádel Central",
      hora: "19:00",
      cancha: null,
      nombre: "Luis García",
      telefono: "2314 999999",
    });
    crearReservaBot.mockResolvedValue({
      ok: true,
      bookingId: "bk1",
      bookingCode: "HYS324",
      status: "confirmado",
      paymentMode: "none",
      amountToCharge: 0,
      heldUntil: null,
      paymentInitPoint: null,
      mpPreferenceId: null,
    });

    await handleIncomingMessage(msg("no, soy Luis García, 2314 999999"));

    expect(crearReservaBot).toHaveBeenCalledWith({
      clubId: "cl1", courtId: "ct1", date: "2026-06-27",
      startTime: "19:00", endTime: "20:30",
      customerName: "Luis García",
      customerContactPhone: "2314 999999",
      channel: "telegram",
      channelUserId: "123",
    });
  });

  it("sanea nombre y teléfono antes de persistir datos enviados por el chat", async () => {
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({
      tipo: "reservar",
      lugar: "Pádel Central",
      hora: "19:00",
      cancha: null,
      nombre: '<script>alert("x")</script> Juan Pérez',
      telefono: "+54 <img> 2314 555555",
    });
    crearReservaBot.mockResolvedValue({
      ok: true,
      bookingId: "bk1",
      bookingCode: "HYS324",
      status: "confirmado",
      paymentMode: "none",
      amountToCharge: 0,
      heldUntil: null,
      paymentInitPoint: null,
      mpPreferenceId: null,
    });

    await handleIncomingMessage(msg('soy <script>alert("x")</script> Juan Pérez, +54 <img> 2314 555555'));

    expect(crearReservaBot).toHaveBeenCalledWith(expect.objectContaining({
      customerName: "Juan Pérez",
      customerContactPhone: "+54 2314 555555",
    }));
    expect(crearReservaBot.mock.calls[0][0].customerName).not.toMatch(/[<>`{}[\]]/);
    expect(crearReservaBot.mock.calls[0][0].customerContactPhone).not.toMatch(/[<>`{}[\]]/);
  });

  it("CAPA B/A: si el turno se ocupó → no confirma, avisa y re-ofrece", async () => {
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({ tipo: "reservar", lugar: "Pádel Central", hora: "19:00", cancha: null, nombre: "Juan Pérez", telefono: "2314 555555" });
    crearReservaBot.mockResolvedValue({ ok: false, error: "SLOT_NO_DISPONIBLE" });

    await handleIncomingMessage(msg("Juan Pérez"));

    expect(confirmarReservaTexto).not.toHaveBeenCalled();
    expect(redactarRespuesta).toHaveBeenCalled(); // re-ofrece opciones
    expect(send).toHaveBeenCalledWith("123", expect.stringContaining("se acaba de ocupar"));
  });

  it("si falla Mercado Pago, avisa y no deja el hold como reservado", async () => {
    extraerIntencion.mockResolvedValue(conIntencion);
    extraerAccionReserva.mockResolvedValue({ tipo: "reservar", lugar: "Pádel Central", hora: "19:00", cancha: null, nombre: "Juan Pérez", telefono: "2314 555555" });
    crearReservaBot.mockResolvedValue({ ok: false, error: "PAGO_NO_DISPONIBLE" });

    await handleIncomingMessage(msg("Juan Pérez"));

    expect(confirmarReservaTexto).not.toHaveBeenCalled();
    expect(redactarRespuesta).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("123", expect.stringContaining("liberé el turno"));
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

  it("confirmación explícita de cancelación sin refund → cancela con flag explícito", async () => {
    getHistory.mockResolvedValue([
      {
        role: "assistant",
        content:
          "Podemos cancelar tu reserva HYS324, pero por la política de Pádel Central no se realiza la devolución del dinero. Si querés cancelarla igual, respondé: confirmo HYS324",
      },
    ]);
    cancelarReservaBotPorCodigo.mockResolvedValue({ ok: true, status: "cancelada_sin_refund", reserva: { bookingCode: "HYS324" } });

    await handleIncomingMessage(msg("confirmo"));

    expect(cancelarReservaBotPorCodigo).toHaveBeenCalledWith({
      bookingCode: "HYS324",
      customerPhone: "123",
      confirmCancelWithoutRefund: true,
    });
    expect(extraerAccionCancelacion).not.toHaveBeenCalled();
    expect(extraerIntencion).not.toHaveBeenCalled();
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
