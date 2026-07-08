import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClientesClient, type PanelCustomer } from "@/components/dashboard/clientes-client";

const baseDate = "2026-07-07T12:00:00Z";

describe("ClientesClient", () => {
  it("muestra clientes del bot como solo lectura y manuales con acciones", () => {
    const customers: PanelCustomer[] = [
      {
        id: "bot-1",
        name: "Carlos Gómez",
        phone: "2314 555555",
        email: null,
        notes: null,
        channel: "telegram",
        channelUserId: "123",
        source: "bot",
        editable: false,
        createdAt: baseDate,
        updatedAt: baseDate,
      },
      {
        id: "admin-1",
        name: "Agos Castellani",
        phone: "2314 999999",
        email: "agos@example.com",
        notes: "frecuente",
        channel: null,
        channelUserId: null,
        source: "admin",
        editable: true,
        createdAt: baseDate,
        updatedAt: baseDate,
      },
    ];

    const html = renderToStaticMarkup(<ClientesClient initialCustomers={customers} />);

    expect(html).toContain("Carlos Gómez");
    expect(html).toContain("Bot · telegram");
    expect(html).toContain("Solo lectura");
    expect(html).toContain("Agos Castellani");
    expect(html).toContain("Agregado por admin");
    expect(html).toContain("Editar");
    expect(html).toContain("Borrar");
  });
});
