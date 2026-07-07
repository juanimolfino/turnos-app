import { describe, expect, it } from "vitest";
import { computeOnboardingChecklist } from "./checklist";

const base = {
  address: "Calle Falsa 123",
  phone: "+5491111111111",
  paymentMode: "none" as const,
  mercadoPagoConnected: false,
  activeCourtPrices: [5000, 6000],
};

describe("computeOnboardingChecklist", () => {
  it("camino feliz: club completo sin pago online", () => {
    expect(computeOnboardingChecklist(base)).toEqual({ clubInfoDone: true, courtsDone: true });
  });

  it("sin canchas activas: ambos pasos incompletos", () => {
    const result = computeOnboardingChecklist({ ...base, activeCourtPrices: [] });
    expect(result).toEqual({ clubInfoDone: false, courtsDone: false });
  });

  it("cancha con precio en 0: club info incompleto aunque haya canchas", () => {
    const result = computeOnboardingChecklist({ ...base, activeCourtPrices: [5000, 0] });
    expect(result).toEqual({ clubInfoDone: false, courtsDone: true });
  });

  it("falta dirección o teléfono: club info incompleto", () => {
    expect(computeOnboardingChecklist({ ...base, address: null }).clubInfoDone).toBe(false);
    expect(computeOnboardingChecklist({ ...base, phone: "" }).clubInfoDone).toBe(false);
  });

  it("pago partial/full sin Mercado Pago conectado: club info incompleto", () => {
    const result = computeOnboardingChecklist({ ...base, paymentMode: "partial", mercadoPagoConnected: false });
    expect(result.clubInfoDone).toBe(false);
  });

  it("pago partial/full con Mercado Pago conectado: club info completo", () => {
    const result = computeOnboardingChecklist({ ...base, paymentMode: "full", mercadoPagoConnected: true });
    expect(result.clubInfoDone).toBe(true);
  });
});
