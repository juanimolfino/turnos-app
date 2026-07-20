import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");

function functionSource(name: string, nextName: string) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf(`export async function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("confirmBotHoldPayment query shape", () => {
  it("bloquea bookings sin LEFT JOIN nullable a credenciales MP", () => {
    const body = functionSource("confirmBotHoldPayment", "saveBookingMercadoPagoPreference");

    expect(body).toContain('.for("update")');
    const lockedQuery = body.slice(0, body.indexOf('.for("update")'));

    expect(lockedQuery).not.toContain(".leftJoin(clubMercadoPagoCredentials");
    expect(lockedQuery).not.toContain("clubMercadoPagoCredentials.accessToken");
    expect(lockedQuery).not.toContain(".leftJoin(customers");
  });

  it("lee el token de Mercado Pago en un lookup separado sin FOR UPDATE", () => {
    const body = functionSource("getBookingPaymentContext", "confirmBotHoldPayment");

    expect(body).toContain(".leftJoin(clubMercadoPagoCredentials");
    expect(body).toContain("clubMercadoPagoCredentials.accessToken");
    expect(body).not.toContain('.for("update")');
  });
});
