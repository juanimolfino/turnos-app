import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createManualCustomer: vi.fn(),
  deleteManualCustomer: vi.fn(),
  getUser: vi.fn(),
  getUserByAuthId: vi.fn(),
  listClubCustomers: vi.fn(),
  updateManualCustomer: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/db/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/queries")>("@/lib/db/queries");
  return {
    CustomerMutationError: actual.CustomerMutationError,
    createManualCustomer: mocks.createManualCustomer,
    deleteManualCustomer: mocks.deleteManualCustomer,
    getUserByAuthId: mocks.getUserByAuthId,
    listClubCustomers: mocks.listClubCustomers,
    updateManualCustomer: mocks.updateManualCustomer,
  };
});

describe("customers API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth_admin" } } });
    mocks.getUserByAuthId.mockResolvedValue({ id: "admin_1", clubId: "club_123" });
  });

  it("lista clientes sin exponer edición como decisión del cliente", async () => {
    mocks.listClubCustomers.mockResolvedValue([
      {
        id: "cust_bot",
        name: "Carlos Gómez",
        phone: "2314 555555",
        email: null,
        notes: null,
        playerIdentityId: "pid_1",
        channel: "telegram",
        channelUserId: "123",
        source: "bot",
        editable: false,
        createdAt: new Date("2026-07-01T00:00:00Z"),
        updatedAt: new Date("2026-07-01T00:00:00Z"),
      },
    ]);
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.customers[0]).toMatchObject({ source: "bot", editable: false });
    expect(mocks.listClubCustomers).toHaveBeenCalledWith("club_123");
  });

  it("crea cliente manual asociado al club del admin y sanea tags", async () => {
    mocks.createManualCustomer.mockResolvedValue({ id: "cust_admin", name: "Agos Castellani", phone: "2314 555555", playerIdentityId: null, channel: null, channelUserId: null });
    const { POST } = await import("./route");
    const request = new NextRequest("https://example.com/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "<b>Agos Castellani</b>",
        phone: "2314 <img> 555555",
        email: "AGOS@example.com",
        notes: "<script>alert(1)</script> jugadora frecuente",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mocks.createManualCustomer).toHaveBeenCalledWith({
      clubId: "club_123",
      name: "Agos Castellani",
      phone: "2314 555555",
      email: "agos@example.com",
      notes: "jugadora frecuente",
    });
  });

  it("rechaza sin sesión", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.listClubCustomers).not.toHaveBeenCalled();
  });
});
