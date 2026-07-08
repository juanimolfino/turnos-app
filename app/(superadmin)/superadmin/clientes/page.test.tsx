import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSuperadminBotPlayerById: vi.fn(),
  getSuperadminBotPlayerReservations: vi.fn(),
  getSuperadminBotPlayers: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  getSuperadminBotPlayerById: mocks.getSuperadminBotPlayerById,
  getSuperadminBotPlayerReservations: mocks.getSuperadminBotPlayerReservations,
  getSuperadminBotPlayers: mocks.getSuperadminBotPlayers,
}));

describe("SuperadminClientesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const player = {
      id: "pid-1",
      channel: "telegram",
      channelUserId: "123",
      names: ["Carlos Gómez"],
      phones: ["2314 555555"],
      emails: [],
      clubs: ["Pádel Central"],
      clubCount: 1,
      bookingCount: 12,
      lastBookingAt: new Date("2026-07-08T12:00:00Z"),
      createdAt: new Date("2026-07-01T12:00:00Z"),
    };
    mocks.getSuperadminBotPlayers.mockResolvedValue([player]);
    mocks.getSuperadminBotPlayerById.mockResolvedValue(player);
    mocks.getSuperadminBotPlayerReservations.mockResolvedValue({
      total: 12,
      limit: 10,
      offset: 0,
      reservations: [
        {
          id: "bk-1",
          date: "2026-07-08",
          startTime: "16:00",
          endTime: "17:30",
          status: "confirmado",
          paymentStatus: "impago",
          origin: "bot",
          bookingCode: "HYS324",
          createdAt: new Date("2026-07-08T12:00:00Z"),
          clubName: "Pádel Central",
          courtName: "Cancha 1",
          customerName: "Carlos Gómez",
          customerPhone: "2314 555555",
        },
      ],
    });
  });

  it("renderiza buscador, datos del cliente e historial paginado", async () => {
    const { default: Page } = await import("./page");

    const html = renderToStaticMarkup(await Page({
      searchParams: Promise.resolve({ q: "Carlos", player: "pid-1", offset: "0" }),
    }));

    expect(mocks.getSuperadminBotPlayers).toHaveBeenCalledWith("Carlos");
    expect(mocks.getSuperadminBotPlayerReservations).toHaveBeenCalledWith("pid-1", 0, 10);
    expect(html).toContain("Clientes del bot");
    expect(html).toContain("Carlos Gómez");
    expect(html).toContain("2314 555555");
    expect(html).toContain("Pádel Central");
    expect(html).toContain("Cancha 1");
    expect(html).toContain("HYS324");
    expect(html).toContain("Ver 10 más");
  });
});
