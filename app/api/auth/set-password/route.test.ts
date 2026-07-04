import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
    },
  }),
}));

function request(password: string) {
  return new NextRequest("https://example.com/api/auth/set-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

describe("POST /api/auth/set-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-1" } } });
    mocks.updateUser.mockResolvedValue({ error: null });
  });

  it("actualiza la contraseña desde el servidor con la sesión actual", async () => {
    const { POST } = await import("./route");

    const response = await POST(request("password123"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "password123" });
  });

  it("si no hay sesión devuelve un mensaje accionable", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("./route");

    const response = await POST(request("password123"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Sesión expirada. Pedí que te reenvíen la invitación.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
