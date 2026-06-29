import { describe, expect, it } from "vitest";
import { extraerAccionCancelacion } from "@/lib/bot/extraer-cancelacion";

describe("extraerAccionCancelacion", () => {
  it("detecta intención de cancelar con código y normaliza a mayúsculas", () => {
    expect(extraerAccionCancelacion([{ role: "user", content: "quiero cancelar hys324" }])).toEqual({
      tipo: "cancelar",
      bookingCode: "HYS324",
    });
  });

  it("si quiere cancelar pero no dio código, lo pide", () => {
    expect(extraerAccionCancelacion([{ role: "user", content: "quiero cancelar mi turno" }])).toEqual({
      tipo: "pedir_codigo",
    });
  });

  it("si el bot pidió código, acepta un mensaje que trae solo el código", () => {
    const history = [
      { role: "assistant" as const, content: "Pasame tu código de reserva y la cancelo." },
      { role: "user" as const, content: "HYS324" },
    ];
    expect(extraerAccionCancelacion(history)).toEqual({ tipo: "cancelar", bookingCode: "HYS324" });
  });

  it("marca código inválido cuando está intentando cancelar", () => {
    expect(extraerAccionCancelacion([{ role: "user", content: "cancelar HYS32" }])).toEqual({
      tipo: "codigo_invalido",
    });
  });

  it("sin intención de cancelación no interfiere con la reserva", () => {
    expect(extraerAccionCancelacion([{ role: "user", content: "quiero jugar mañana a las 19" }])).toEqual({
      tipo: "ninguna",
    });
  });

  it("si estaba esperando código pero el usuario cambia a reservar, no insiste con cancelación", () => {
    const history = [
      { role: "assistant" as const, content: "Pasame tu código de reserva y la cancelo." },
      { role: "user" as const, content: "Nono, no quiero cancelar, quiero reservar" },
    ];

    expect(extraerAccionCancelacion(history)).toEqual({ tipo: "ninguna" });
  });

  it("si estaba esperando código pero el usuario pregunta turnos, vuelve al flujo de búsqueda", () => {
    const history = [
      { role: "assistant" as const, content: "Pasame tu código de reserva y la cancelo." },
      { role: "user" as const, content: "Me mostrás qué turnos hay para el lunes 29?" },
    ];

    expect(extraerAccionCancelacion(history)).toEqual({ tipo: "ninguna" });
  });
});
