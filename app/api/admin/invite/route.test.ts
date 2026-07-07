import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  cleanupIncompleteInvite: vi.fn(),
  createAdminInvitation: vi.fn(),
  deleteUser: vi.fn(),
  getUser: vi.fn(),
  getUserByAuthId: vi.fn(),
  getUserByEmail: vi.fn(),
  listUsers: vi.fn(),
  sendAdminInviteEmail: vi.fn(),
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
      },
    },
  }),
}));

vi.mock("@/lib/email/send", () => ({
  sendAdminInviteEmail: mocks.sendAdminInviteEmail,
}));

vi.mock("@/lib/auth/admin-invitations", () => ({
  buildAdminInviteUrl: (origin: string, token: string) => `${origin}/invite/accept?token=${token}`,
  createAdminInvitation: mocks.createAdminInvitation,
  normalizeInviteEmail: (email: string) => email.trim().toLowerCase(),
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
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-super" } } });
    mocks.getUserByAuthId.mockResolvedValue({ id: "u1", role: "superadmin" });
    mocks.getUserByEmail.mockResolvedValue(null);
    mocks.listUsers.mockResolvedValue({ data: { users: [] } });
    mocks.deleteUser.mockResolvedValue({ error: null });
    mocks.createAdminInvitation.mockResolvedValue({ token: "invite-token" });
    mocks.sendAdminInviteEmail.mockResolvedValue(undefined);
  });

  it("invita admin sin precrear Auth/club; el club se crea al aceptar la invitación", async () => {
    const { POST } = await import("./route");

    const response = await POST(inviteRequest({
      email: "agos@example.com",
      role: "admin",
      venueName: "Canchita de Agos",
    }));

    expect(response.status).toBe(200);
    expect(mocks.createAdminInvitation).toHaveBeenCalledWith({
      email: "agos@example.com",
      role: "admin",
      venueName: "Canchita de Agos",
      invitedByUserId: "u1",
    });
    expect(mocks.sendAdminInviteEmail).toHaveBeenCalledWith({
      email: "agos@example.com",
      inviteLink: "https://example.com/invite/accept?token=invite-token",
      role: "admin",
      venueName: "Canchita de Agos",
    });
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
    expect(mocks.createAdminInvitation).toHaveBeenCalled();
    expect(mocks.sendAdminInviteEmail).toHaveBeenCalled();
  });

  it("si el auth_user_id no matchea pero el email es superadmin activo, permite invitar", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-rotated", email: "kevin@example.com" } } });
    mocks.getUserByAuthId.mockResolvedValue(null);
    mocks.getUserByEmail
      .mockResolvedValueOnce({ id: "u-super", email: "kevin@example.com", role: "superadmin" })
      .mockResolvedValueOnce(null);
    const { POST } = await import("./route");

    const response = await POST(inviteRequest({
      email: "agos@example.com",
      role: "admin",
      venueName: "Canchita de Agos",
    }));

    expect(response.status).toBe(200);
    expect(mocks.createAdminInvitation).toHaveBeenCalledWith(expect.objectContaining({
      invitedByUserId: "u-super",
    }));
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
    expect(mocks.createAdminInvitation).not.toHaveBeenCalled();
    expect(mocks.sendAdminInviteEmail).not.toHaveBeenCalled();
  });

  it("si Resend falla, devuelve el link manual sin borrar la invitación generada", async () => {
    mocks.sendAdminInviteEmail.mockRejectedValue(new Error("Resend down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { POST } = await import("./route");

    const response = await POST(inviteRequest({
      email: "agos@example.com",
      role: "admin",
      venueName: "Canchita de Agos",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      emailSent: false,
      inviteLink: "https://example.com/invite/accept?token=invite-token",
      warning: "Resend down",
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.cleanupIncompleteInvite).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
