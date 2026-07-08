import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  deleteManualCustomer: vi.fn(),
  getUser: vi.fn(),
  getUserByAuthId: vi.fn(),
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
    deleteManualCustomer: mocks.deleteManualCustomer,
    getUserByAuthId: mocks.getUserByAuthId,
    updateManualCustomer: mocks.updateManualCustomer,
  };
});

describe("customer detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth_admin" } } });
    mocks.getUserByAuthId.mockResolvedValue({ id: "admin_1", clubId: "club_123" });
  });

  it("actualiza cliente manual", async () => {
    mocks.updateManualCustomer.mockResolvedValue({ id: "cust_admin", name: "Agos", playerIdentityId: null, channel: null, channelUserId: null });
    const { PATCH } = await import("./route");
    const request = new NextRequest("https://example.com/api/customers/cust_admin", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Agos", phone: "2314 555555", email: "", notes: "" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "cust_admin" }) });

    expect(response.status).toBe(200);
    expect(mocks.updateManualCustomer).toHaveBeenCalledWith({
      clubId: "club_123",
      customerId: "cust_admin",
      name: "Agos",
      phone: "2314 555555",
      email: null,
      notes: null,
    });
  });

  it("bloquea edición de clientes creados por el bot", async () => {
    const { CustomerMutationError } = await import("@/lib/db/queries");
    mocks.updateManualCustomer.mockRejectedValue(new CustomerMutationError("BOT_CUSTOMER_LOCKED", "Los clientes creados por el bot no se editan desde el panel."));
    const { PATCH } = await import("./route");
    const request = new NextRequest("https://example.com/api/customers/cust_bot", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Carlos", phone: "2314 555555" }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "cust_bot" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("BOT_CUSTOMER_LOCKED");
  });

  it("borra clientes manuales del club", async () => {
    mocks.deleteManualCustomer.mockResolvedValue({ id: "cust_admin" });
    const { DELETE } = await import("./route");
    const request = new NextRequest("https://example.com/api/customers/cust_admin", { method: "DELETE" });

    const response = await DELETE(request, { params: Promise.resolve({ id: "cust_admin" }) });

    expect(response.status).toBe(200);
    expect(mocks.deleteManualCustomer).toHaveBeenCalledWith("club_123", "cust_admin");
  });

  it("bloquea borrado de clientes creados por el bot", async () => {
    const { CustomerMutationError } = await import("@/lib/db/queries");
    mocks.deleteManualCustomer.mockRejectedValue(new CustomerMutationError("BOT_CUSTOMER_LOCKED", "Los clientes creados por el bot no se borran desde el panel."));
    const { DELETE } = await import("./route");
    const request = new NextRequest("https://example.com/api/customers/cust_bot", { method: "DELETE" });

    const response = await DELETE(request, { params: Promise.resolve({ id: "cust_bot" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("BOT_CUSTOMER_LOCKED");
  });
});
