import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  generateApiKey: vi.fn(),
  getClubById: vi.fn(),
  getUser: vi.fn(),
  getUserByAuthId: vi.fn(),
  updateClub: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/db/queries", () => ({
  generateApiKey: mocks.generateApiKey,
  getClubById: mocks.getClubById,
  getUserByAuthId: mocks.getUserByAuthId,
  updateClub: mocks.updateClub,
}));

const clubRow = {
  id: "club_123",
  name: "Pádel Central",
  address: "Av. 1",
  city: "Bolívar",
  neighborhood: "Centro",
  phone: "123",
  requiresPayment: false,
  paymentDeadlineHours: 24,
  apiKey: "ck_public_admin_value",
  mercadopagoAccessToken: "APP_USR-secret-token",
};

describe("club settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth_admin" } } });
    mocks.getUserByAuthId.mockResolvedValue({ id: "admin_1", clubId: "club_123" });
    mocks.getClubById.mockResolvedValue(clubRow);
    mocks.updateClub.mockResolvedValue(clubRow);
  });

  it("GET no expone el access token de Mercado Pago", async () => {
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(body.club.mercadopagoAccessToken).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("APP_USR-secret-token");
  });

  it("POST ignora tokens y tampoco los expone en la respuesta", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("https://example.com/api/clubs/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: "456",
        mercadopagoAccessToken: "APP_USR-client-should-not-set-this",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(mocks.updateClub).toHaveBeenCalledWith("club_123", { phone: "456" });
    expect(body.club.mercadopagoAccessToken).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("APP_USR");
  });
});
