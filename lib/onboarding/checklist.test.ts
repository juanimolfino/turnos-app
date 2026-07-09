import { describe, expect, it } from "vitest";
import { computeOnboardingChecklist, computeOnboardingDetail } from "./checklist";

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

describe("computeOnboardingDetail", () => {
  it("desglosa cada campo del paso 1 con su estado done", () => {
    const detail = computeOnboardingDetail({ ...base, address: null, activeCourtPrices: [5000, 0] });
    const byLabel = Object.fromEntries(detail.clubInfoItems.map((i) => [i.label, i.done]));
    expect(byLabel["Dirección"]).toBe(false);
    expect(byLabel["Teléfono"]).toBe(true);
    expect(byLabel["Precio de las canchas"]).toBe(false); // hay una cancha en 0
    expect(byLabel["Método de pago (sin cobro online)"]).toBe(true);
    expect(detail.clubInfoDone).toBe(false);
  });

  it("el item de pago refleja Mercado Pago cuando el modo es partial/full", () => {
    const sinMp = computeOnboardingDetail({ ...base, paymentMode: "partial", mercadoPagoConnected: false });
    expect(sinMp.clubInfoItems.find((i) => i.label === "Mercado Pago conectado")?.done).toBe(false);
    const conMp = computeOnboardingDetail({ ...base, paymentMode: "partial", mercadoPagoConnected: true });
    expect(conMp.clubInfoItems.find((i) => i.label === "Mercado Pago conectado")?.done).toBe(true);
  });

  it("el paso 2 tiene un solo item: cantidad de canchas", () => {
    expect(computeOnboardingDetail(base).courtsItems).toEqual([{ label: "Cantidad de canchas", done: true }]);
    expect(computeOnboardingDetail({ ...base, activeCourtPrices: [] }).courtsItems).toEqual([
      { label: "Cantidad de canchas", done: false },
    ]);
  });
});
