import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PaymentResultPage, { resolvePaymentResultStatus } from "./page";

describe("/pago/resultado", () => {
  it("muestra un mensaje neutro de confirmación para el retorno exitoso", async () => {
    const element = await PaymentResultPage({
      searchParams: Promise.resolve({ status: "success" }),
    });

    const html = renderToStaticMarkup(element);

    expect(html).toContain("¡Pago recibido!");
    expect(html).toContain("Estamos confirmando tu reserva");
    expect(html).not.toContain("Pago pendiente");
    expect(html).not.toContain("todavía está procesando");
  });

  it("trata approved de Mercado Pago como retorno exitoso", () => {
    expect(resolvePaymentResultStatus({ status: "approved" })).toBe("success");
    expect(resolvePaymentResultStatus({ collection_status: "approved" })).toBe("success");
  });

  it("prioriza success si Mercado Pago agrega un status duplicado", () => {
    expect(resolvePaymentResultStatus({ status: ["success", "approved"] })).toBe("success");
  });

  it("mantiene mensajes diferenciados para pending y failure reales", () => {
    expect(resolvePaymentResultStatus({ status: "pending" })).toBe("pending");
    expect(resolvePaymentResultStatus({ status: "rejected" })).toBe("failure");
  });
});
