import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgendaDayClient } from "@/components/dashboard/agenda-day-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("AgendaDayClient", () => {
  const courts = [{ id: "court-1", name: "Cancha 1" }];

  it("muestra las franjas libres hasta el cierre del club aunque el último bloque termine antes", () => {
    const html = renderToStaticMarkup(
      <AgendaDayClient
        courts={courts}
        blocks={[
          {
            id: "bk-1",
            courtId: "court-1",
            date: "2026-07-08",
            startTime: "20:00",
            endTime: "21:30",
            type: "fijo",
            status: "confirmado",
            blockGroupId: null,
            notes: "jesus",
            label: "jesus",
            customerPhone: null,
            origin: "admin",
          },
        ]}
        date="2026-07-08"
        clubName="Cancha test"
        timezone="America/Argentina/Buenos_Aires"
        openingWindow={{ open: "08:00", close: "23:30" }}
      />,
    );

    expect(html).toContain("21:30");
    expect(html).toContain("23:30");
    expect(html).toContain("Disponible");
  });

  it("distingue reservas creadas por bot y por admin", () => {
    const html = renderToStaticMarkup(
      <AgendaDayClient
        courts={courts}
        blocks={[
          {
            id: "bk-bot",
            courtId: "court-1",
            date: "2026-07-08",
            startTime: "17:00",
            endTime: "18:30",
            type: "simple",
            status: "confirmado",
            blockGroupId: null,
            notes: null,
            label: "Carlos",
            customerPhone: "2314 555555",
            origin: "bot",
          },
        ]}
        date="2026-07-08"
        clubName="Cancha test"
        timezone="America/Argentina/Buenos_Aires"
        openingWindow={{ open: "16:00", close: "20:00" }}
      />,
    );

    expect(html).toContain("Reservado por bot");
    expect(html).not.toContain("Reservado por admin");
  });
});
