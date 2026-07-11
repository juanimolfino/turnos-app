import { describe, expect, it } from "vitest";
import { parseHHMM, normalizeCloseTime, validateOpeningWindow } from "./opening-hours";

describe("parseHHMM", () => {
  it("convierte HH:MM a minutos", () => {
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("08:30")).toBe(510);
    expect(parseHHMM("23:59")).toBe(1439);
  });
  it("rechaza valores inválidos", () => {
    expect(parseHHMM("24:00")).toBeNull();
    expect(parseHHMM("7:00")).toBeNull();
    expect(parseHHMM("aa:bb")).toBeNull();
    expect(parseHHMM("12:60")).toBeNull();
  });
});

describe("normalizeCloseTime", () => {
  it("24:00 (medianoche) → 23:59", () => {
    expect(normalizeCloseTime("24:00")).toBe("23:59");
  });
  it("deja el resto igual", () => {
    expect(normalizeCloseTime("22:00")).toBe("22:00");
  });
});

describe("validateOpeningWindow", () => {
  it("camino feliz: abre antes de cerrar", () => {
    const r = validateOpeningWindow({ open: "07:00", close: "22:00" });
    expect(r).toEqual({ ok: true, value: { open: "07:00", close: "22:00" } });
  });

  it("acepta cierre casi a medianoche (23:59)", () => {
    const r = validateOpeningWindow({ open: "09:00", close: "23:59" });
    expect(r.ok).toBe(true);
  });

  it("normaliza 24:00 → 23:59", () => {
    const r = validateOpeningWindow({ open: "09:00", close: "24:00" });
    expect(r).toEqual({ ok: true, value: { open: "09:00", close: "23:59" } });
  });

  it("rechaza cierre <= apertura", () => {
    expect(validateOpeningWindow({ open: "22:00", close: "10:00" }).ok).toBe(false);
    expect(validateOpeningWindow({ open: "10:00", close: "10:00" }).ok).toBe(false);
  });

  it("rechaza formato inválido", () => {
    expect(validateOpeningWindow({ open: "7", close: "22:00" }).ok).toBe(false);
  });
});
