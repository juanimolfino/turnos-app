import { describe, expect, it } from "vitest";
import { mpExpiryWarning } from "./ajustes-client";

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

describe("mpExpiryWarning", () => {
  it("sin fecha de vencimiento no avisa", () => {
    expect(mpExpiryWarning(null)).toBeNull();
    expect(mpExpiryWarning(undefined)).toBeNull();
  });

  it("con más de 30 días por delante no avisa", () => {
    expect(mpExpiryWarning(inDays(60))).toBeNull();
  });

  it("dentro de los 30 días avisa (amarillo) con el conteo de días", () => {
    const warn = mpExpiryWarning(inDays(10));
    expect(warn).not.toBeNull();
    expect(warn!.title).toMatch(/vence en 10 días/i);
    expect(warn!.fg).toBe("#8A6415"); // ámbar
  });

  it("vencido avisa (rojo) que no se puede cobrar", () => {
    const warn = mpExpiryWarning(inDays(-1));
    expect(warn).not.toBeNull();
    expect(warn!.title).toMatch(/venció/i);
    expect(warn!.subtitle).toMatch(/no se van a poder cobrar/i);
    expect(warn!.fg).toBe("#B0492E"); // rojo
  });
});
