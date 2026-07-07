import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserByAuthId: vi.fn(),
  getUserByEmail: vi.fn(),
  deleteAdminCascade: vi.fn(),
  deleteAuthUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    auth: { admin: { deleteUser: mocks.deleteAuthUser } },
  }),
}));

vi.mock("@/lib/db/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/queries")>("@/lib/db/queries");
  return {
    getUserByAuthId: mocks.getUserByAuthId,
    getUserByEmail: mocks.getUserByEmail,
    deleteAdminCascade: mocks.deleteAdminCascade,
    DeleteAdminError: actual.DeleteAdminError,
  };
});

function deleteRequest() {
  return new NextRequest("https://example.com/api/admin/target-id", { method: "DELETE" });
}

async function callDelete(id: string) {
  const { DELETE } = await import("./route");
  return DELETE(deleteRequest(), { params: Promise.resolve({ id }) });
}

describe("DELETE /api/admin/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-super" } } });
    mocks.getUserByAuthId.mockResolvedValue({ id: "super-1", role: "superadmin" });
    mocks.getUserByEmail.mockResolvedValue(null);
    mocks.deleteAuthUser.mockResolvedValue({ error: null });
  });

  it("rechaza sin sesión", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await callDelete("admin-1");
    expect(response.status).toBe(401);
    expect(mocks.deleteAdminCascade).not.toHaveBeenCalled();
  });

  it("rechaza si el usuario logueado no es superadmin", async () => {
    mocks.getUserByAuthId.mockResolvedValue({ id: "u1", role: "admin" });
    const response = await callDelete("admin-1");
    expect(response.status).toBe(403);
    expect(mocks.deleteAdminCascade).not.toHaveBeenCalled();
  });

  it("no deja que el superadmin se borre a sí mismo", async () => {
    const response = await callDelete("super-1");
    expect(response.status).toBe(400);
    expect(mocks.deleteAdminCascade).not.toHaveBeenCalled();
  });

  it("borra el admin, borra el usuario de Auth y devuelve si el club se borró", async () => {
    mocks.deleteAdminCascade.mockResolvedValue({
      authUserId: "auth-target", email: "a@x.com", clubId: "club1", clubDeleted: true,
    });

    const response = await callDelete("admin-1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, clubDeleted: true });
    expect(mocks.deleteAdminCascade).toHaveBeenCalledWith("admin-1");
    expect(mocks.deleteAuthUser).toHaveBeenCalledWith("auth-target");
  });

  it("si falla el borrado en Supabase Auth, igual responde ok (la DB ya quedó limpia)", async () => {
    mocks.deleteAdminCascade.mockResolvedValue({
      authUserId: "auth-target", email: "a@x.com", clubId: null, clubDeleted: false,
    });
    mocks.deleteAuthUser.mockResolvedValue({ error: { message: "boom" } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await callDelete("admin-1");

    expect(response.status).toBe(200);
    warn.mockRestore();
  });

  it("propaga 404 si el admin no existe", async () => {
    const { DeleteAdminError } = await vi.importActual<typeof import("@/lib/db/queries")>("@/lib/db/queries");
    mocks.deleteAdminCascade.mockRejectedValue(new DeleteAdminError("ADMIN_NOT_FOUND", "El admin no existe."));

    const response = await callDelete("no-existe");

    expect(response.status).toBe(404);
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("propaga 400 si se intenta borrar un superadmin", async () => {
    const { DeleteAdminError } = await vi.importActual<typeof import("@/lib/db/queries")>("@/lib/db/queries");
    mocks.deleteAdminCascade.mockRejectedValue(
      new DeleteAdminError("CANNOT_DELETE_SUPERADMIN", "No se puede borrar un superadmin desde acá."),
    );

    const response = await callDelete("otro-super");

    expect(response.status).toBe(400);
  });
});
