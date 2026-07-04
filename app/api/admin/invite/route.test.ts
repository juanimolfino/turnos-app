import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  cleanupIncompleteInvite: vi.fn(),
  deleteUser: vi.fn(),
  getUser: vi.fn(),
  getUserByAuthId: vi.fn(),
  getUserByEmail: vi.fn(),
  inviteUserByEmail: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        listUsers: mocks.listUsers,
        deleteUser: mocks.deleteUser,
        inviteUserByEmail: mocks.inviteUserByEmail,
      },
    },
  }),
}));

vi.mock("@/lib/db/queries", () => ({
  cleanupIncompleteInvite: mocks.cleanupIncompleteInvite,
  getUserByAuthId: mocks.getUserByAuthId,
  getUserByEmail: mocks.getUserByEmail,
}));

function inviteRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/admin/invite", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.com" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-super" } } });
    mocks.getUserByAuthId.mockResolvedValue({ id: "u1", role: "superadmin" });
    mocks.getUserByEmail.mockResolvedValue(null);
    mocks.listUsers.mockResolvedValue({ data: { users: [] } });
    mocks.deleteUser.mockResolvedValue({ error: null });
    mocks.inviteUserByEmail.mockResolvedValue({ error: null });
  });

  it("invita admin sin precrear club; el club se crea al completar onboarding", async () => {
    const { POST } = await import("./route");

    const response = await POST(inviteRequest({
      email: "agos@example.com",
      role: "admin",
      venueName: "Canchita de Agos",
    }));

    expect(response.status).toBe(200);
    expect(mocks.inviteUserByEmail).toHaveBeenCalledWith("agos@example.com", {
      redirectTo: "https://example.com/invite/callback",
      data: {
        invited_role: "admin",
        venue_name: "Canchita de Agos",
      },
    });
    expect(JSON.stringify(mocks.inviteUserByEmail.mock.calls[0][1])).not.toContain("club_id");
  });

  it("si Auth existe pero no hay perfil interno, limpia y permite reenviar invitación", async () => {
    mocks.listUsers.mockResolvedValue({
      data: {
        users: [{
          id: "auth-incomplete",
          email: "agos@example.com",
          email_confirmed_at: "2026-07-01T00:00:00Z",
          user_metadata: { club_id: "club-orphan" },
        }],
      },
    });
    const { POST } = await import("./route");

    const response = await POST(inviteRequest({
      email: "agos@example.com",
      role: "admin",
      venueName: "Canchita de Agos",
    }));

    expect(response.status).toBe(200);
    expect(mocks.cleanupIncompleteInvite).toHaveBeenCalledWith("agos@example.com", "club-orphan");
    expect(mocks.deleteUser).toHaveBeenCalledWith("auth-incomplete");
    expect(mocks.inviteUserByEmail).toHaveBeenCalled();
  });

  it("si existe Auth y perfil interno, bloquea como cuenta activa", async () => {
    mocks.listUsers.mockResolvedValue({
      data: { users: [{ id: "auth-active", email: "active@example.com", user_metadata: {} }] },
    });
    mocks.getUserByEmail.mockResolvedValue({ id: "u-active", email: "active@example.com" });
    const { POST } = await import("./route");

    const response = await POST(inviteRequest({
      email: "active@example.com",
      role: "admin",
      venueName: "Club Activo",
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Ese email ya tiene una cuenta activa." });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.inviteUserByEmail).not.toHaveBeenCalled();
  });
});
