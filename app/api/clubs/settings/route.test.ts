import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  generateApiKey: vi.fn(),
  getClubById: vi.fn(),
  getClubMercadoPagoConnectionStatus: vi.fn(),
  getUser: vi.fn(),
  getUserByAuthId: vi.fn(),
  replaceClubOpeningHours: vi.fn(),
  updateClub: vi.fn(),
  updateClubCourtPrices: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/db/queries", () => ({
  generateApiKey: mocks.generateApiKey,
  getClubById: mocks.getClubById,
  getClubMercadoPagoConnectionStatus: mocks.getClubMercadoPagoConnectionStatus,
  getUserByAuthId: mocks.getUserByAuthId,
  replaceClubOpeningHours: mocks.replaceClubOpeningHours,
  updateClub: mocks.updateClub,
  updateClubCourtPrices: mocks.updateClubCourtPrices,
}));

const clubRow = {
  id: "club_123",
  name: "Pádel Central",
  address: "Av. 1",
  city: "Bolívar",
  neighborhood: "Centro",
  phone: "123",
  requiresPayment: false,
  paymentMode: "none",
  depositPct: 25,
  refundEnabled: false,
  refundCutoffHours: 24,
  paymentDeadlineHours: 24,
  apiKey: "ck_public_admin_value",
};

describe("club settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth_admin" } } });
    mocks.getUserByAuthId.mockResolvedValue({ id: "admin_1", clubId: "club_123" });
    mocks.getClubById.mockResolvedValue(clubRow);
    mocks.getClubMercadoPagoConnectionStatus.mockResolvedValue({ connected: false });
    mocks.updateClub.mockResolvedValue(clubRow);
  });

  it("GET no expone tokens de Mercado Pago", async () => {
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(JSON.stringify(body)).not.toContain("accessToken");
    expect(JSON.stringify(body)).not.toContain("APP_USR");
  });

  it("POST ignora tokens y tampoco los expone en la respuesta", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("https://example.com/api/clubs/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: "456",
        accessToken: "APP_USR-client-should-not-set-this",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(mocks.updateClub).toHaveBeenCalledWith("club_123", { phone: "456" });
    expect(body.club.accessToken).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("APP_USR");
  });

  it("rechaza pedir pago online si Mercado Pago no está conectado", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("https://example.com/api/clubs/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentMode: "full" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Conectá Mercado Pago antes de pedir pago online.");
    expect(mocks.updateClub).not.toHaveBeenCalled();
  });

  it("guarda modo de pago y precios cuando Mercado Pago está conectado", async () => {
    mocks.getClubMercadoPagoConnectionStatus.mockResolvedValue({ connected: true });
    mocks.updateClub.mockResolvedValue({ ...clubRow, paymentMode: "partial", depositPct: 25, requiresPayment: true });
    const { POST } = await import("./route");
    const request = new NextRequest("https://example.com/api/clubs/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paymentMode: "partial",
        depositPct: 25,
        courtPrices: [{ courtId: "11111111-1111-4111-8111-111111111111", price: 100 }],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.updateClub).toHaveBeenCalledWith("club_123", {
      paymentMode: "partial",
      depositPct: 25,
      requiresPayment: true,
    });
    expect(mocks.updateClubCourtPrices).toHaveBeenCalledWith("club_123", [
      { courtId: "11111111-1111-4111-8111-111111111111", price: 100 },
    ]);
  });

  it("guarda la política de cancelación/refund del club", async () => {
    mocks.updateClub.mockResolvedValue({ ...clubRow, refundEnabled: true, refundCutoffHours: 48 });
    const { POST } = await import("./route");
    const request = new NextRequest("https://example.com/api/clubs/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        refundEnabled: true,
        refundCutoffHours: 48,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.updateClub).toHaveBeenCalledWith("club_123", {
      refundEnabled: true,
      refundCutoffHours: 48,
    });
    expect(body.club.refundEnabled).toBe(true);
    expect(body.club.refundCutoffHours).toBe(48);
  });

  it("guarda horarios de apertura del club", async () => {
    const openingHours = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      openTime: "08:00",
      closeTime: weekday === 5 ? "23:59" : "23:00",
      slotMinutes: 90,
    }));
    const { POST } = await import("./route");
    const request = new NextRequest("https://example.com/api/clubs/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ openingHours }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.replaceClubOpeningHours).toHaveBeenCalledWith("club_123", openingHours);
  });

  it("rechaza horarios con 24:00 para evitar confusión con medianoche", async () => {
    const openingHours = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      openTime: "08:00",
      closeTime: weekday === 0 ? "24:00" : "23:00",
      slotMinutes: 90,
    }));
    const { POST } = await import("./route");
    const request = new NextRequest("https://example.com/api/clubs/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ openingHours }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.replaceClubOpeningHours).not.toHaveBeenCalled();
  });

  it("rechaza horarios donde el cierre no es posterior a la apertura", async () => {
    const openingHours = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      openTime: "20:00",
      closeTime: weekday === 0 ? "20:00" : "23:00",
      slotMinutes: 90,
    }));
    const { POST } = await import("./route");
    const request = new NextRequest("https://example.com/api/clubs/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ openingHours }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.replaceClubOpeningHours).not.toHaveBeenCalled();
  });
});
