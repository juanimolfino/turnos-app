import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  class MockAdminInvitationError extends Error {
    constructor(
      public code: "INVITE_INVALID" | "ACCOUNT_ACTIVE" | "CLUB_NAME_REQUIRED",
      message: string
    ) {
      super(message);
    }
  }

  return {
    acceptAdminInvitation: vi.fn(),
    AdminInvitationError: MockAdminInvitationError,
    createUser: vi.fn(),
    getUserByAuthId: vi.fn(),
    getUserByEmail: vi.fn(),
    getValidAdminInvitationByToken: vi.fn(),
    listUsers: vi.fn(),
    updateUserById: vi.fn(),
  };
});

vi.mock("@/lib/auth/admin-invitations", () => ({
  acceptAdminInvitation: mocks.acceptAdminInvitation,
  AdminInvitationError: mocks.AdminInvitationError,
  getValidAdminInvitationByToken: mocks.getValidAdminInvitationByToken,
}));

vi.mock("@/lib/db/queries", () => ({
  getUserByAuthId: mocks.getUserByAuthId,
  getUserByEmail: mocks.getUserByEmail,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        createUser: mocks.createUser,
        listUsers: mocks.listUsers,
        updateUserById: mocks.updateUserById,
      },
    },
  }),
}));

function request(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/auth/accept-invite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/accept-invite", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getValidAdminInvitationByToken.mockResolvedValue({
      id: "invite-1",
      email: "agos@example.com",
      role: "admin",
      venueName: "Canchita",
    });
    mocks.getUserByEmail.mockResolvedValue(null);
    mocks.getUserByAuthId.mockResolvedValue(null);
    mocks.listUsers.mockResolvedValue({ data: { users: [] } });
    mocks.createUser.mockResolvedValue({ data: { user: { id: "auth-new" } }, error: null });
    mocks.updateUserById.mockResolvedValue({ data: { user: { id: "auth-existing" } }, error: null });
    mocks.acceptAdminInvitation.mockResolvedValue({
      invitation: { role: "admin" },
      profile: { id: "profile-1" },
    });
  });

  it("rechaza token inválido o expirado", async () => {
    mocks.getValidAdminInvitationByToken.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(request({ token: "token-largo-invalido-123", password: "password123", clubName: "Club" }));

    expect(response.status).toBe(400);
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.acceptAdminInvitation).not.toHaveBeenCalled();
  });

  it("crea usuario Auth nuevo y acepta la invitación", async () => {
    const { POST } = await import("./route");

    const response = await POST(request({ token: "token-largo-valido-123", password: "password123", clubName: "Club" }));

    expect(response.status).toBe(200);
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: "agos@example.com",
      password: "password123",
      email_confirm: true,
      user_metadata: {
        invited_role: "admin",
        venue_name: "Canchita",
      },
    });
    expect(mocks.acceptAdminInvitation).toHaveBeenCalledWith({
      token: "token-largo-valido-123",
      authUserId: "auth-new",
      passwordEmail: "agos@example.com",
      clubName: "Club",
    });
    expect(await response.json()).toEqual({
      ok: true,
      email: "agos@example.com",
      role: "admin",
      redirectTo: "/dashboard",
    });
  });

  it("si existe Auth huérfano sin perfil, lo reutiliza actualizando contraseña", async () => {
    mocks.listUsers.mockResolvedValue({
      data: { users: [{ id: "auth-old", email: "agos@example.com" }] },
    });
    const { POST } = await import("./route");

    const response = await POST(request({ token: "token-largo-valido-123", password: "password123", clubName: "Club" }));

    expect(response.status).toBe(200);
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.updateUserById).toHaveBeenCalledWith("auth-old", {
      password: "password123",
      email_confirm: true,
      user_metadata: {
        invited_role: "admin",
        venue_name: "Canchita",
      },
    });
    expect(mocks.acceptAdminInvitation).toHaveBeenCalledWith(expect.objectContaining({
      authUserId: "auth-existing",
    }));
  });

  it("si el email ya tiene perfil activo, no toca Auth", async () => {
    mocks.getUserByEmail.mockResolvedValue({ id: "profile-active" });
    const { POST } = await import("./route");

    const response = await POST(request({ token: "token-largo-valido-123", password: "password123", clubName: "Club" }));

    expect(response.status).toBe(409);
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(mocks.acceptAdminInvitation).not.toHaveBeenCalled();
  });
});
