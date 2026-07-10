import { describe, expect, it } from "vitest";
import { formatRelativeTime, formatBookingWhen } from "./format";

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-12T20:00:00");

  it("menos de 1 min → 'recién'", () => {
    expect(formatRelativeTime(new Date("2026-07-12T19:59:30"), now)).toBe("recién");
  });

  it("minutos", () => {
    expect(formatRelativeTime(new Date("2026-07-12T19:55:00"), now)).toBe("hace 5 min");
  });

  it("horas", () => {
    expect(formatRelativeTime(new Date("2026-07-12T17:00:00"), now)).toBe("hace 3 h");
  });

  it("ayer", () => {
    expect(formatRelativeTime(new Date("2026-07-11T18:00:00"), now)).toBe("ayer");
  });

  it("varios días", () => {
    expect(formatRelativeTime(new Date("2026-07-09T18:00:00"), now)).toBe("hace 3 días");
  });

  it("acepta string ISO", () => {
    expect(formatRelativeTime("2026-07-12T19:55:00", now)).toBe("hace 5 min");
  });
});

describe("formatBookingWhen", () => {
  it("arma 'día dd/mm hora' con el día de semana correcto", () => {
    // 2026-07-12 es domingo.
    expect(formatBookingWhen("2026-07-12", "20:00")).toBe("dom 12/07 20:00");
  });

  it("otro día de la semana", () => {
    // 2026-07-11 es sábado.
    expect(formatBookingWhen("2026-07-11", "18:30")).toBe("sáb 11/07 18:30");
  });

  it("fecha inválida cae a un fallback legible", () => {
    expect(formatBookingWhen("", "20:00")).toBe("20:00");
  });
});
