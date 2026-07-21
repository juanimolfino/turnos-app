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

  it("no confunde una confirmación de reserva con un pedido de código para cancelar", () => {
    const history = [
      {
        role: "assistant" as const,
        content: "¡Listo! Te reservé. Tu código de reserva es VCB675 — guardalo para cancelar.",
      },
      { role: "user" as const, content: "Quiero reservar otro" },
    ];

    expect(extraerAccionCancelacion(history)).toEqual({ tipo: "ninguna" });
  });

  it("un código suelto no cancela si no pidió cancelar ni el bot pidió código", () => {
    expect(extraerAccionCancelacion([{ role: "user", content: "HYS324" }])).toEqual({ tipo: "ninguna" });
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

  it("si no encontró el código anterior, sigue esperando cancelación y acepta la corrección", () => {
    const history = [
      { role: "assistant" as const, content: "No encontré una reserva con ese código. Revisá que esté bien escrito y pasámelo de nuevo." },
      { role: "user" as const, content: "Perdón es dtx356" },
    ];

    expect(extraerAccionCancelacion(history)).toEqual({ tipo: "cancelar", bookingCode: "DTX356" });
  });

  it("si estaba esperando código y el usuario cambia a pedir turnos, sigue en cancelación", () => {
    const history = [
      { role: "assistant" as const, content: "Pasame tu código de reserva y la cancelo." },
      { role: "user" as const, content: "Me mostrás qué turnos hay para el lunes 29?" },
    ];

    expect(extraerAccionCancelacion(history)).toEqual({ tipo: "pedir_codigo" });
  });

  it("si estaba esperando código pero el usuario cancela explícitamente la operación, sale de cancelación", () => {
    const history = [
      { role: "assistant" as const, content: "Pasame tu código de reserva y la cancelo." },
      { role: "user" as const, content: "Mejor no cancelo, quiero reservar" },
    ];

    expect(extraerAccionCancelacion(history)).toEqual({ tipo: "ninguna" });
  });
});
