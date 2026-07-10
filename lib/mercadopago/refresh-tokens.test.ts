import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = {
  getNeeding: vi.fn(),
  update: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("@/lib/db/queries", () => ({
  getClubMercadoPagoCredentialsNeedingRefresh: (...a: unknown[]) => mocks.getNeeding(...a),
  updateClubMercadoPagoCredentialsTokens: (...a: unknown[]) => mocks.update(...a),
}));
vi.mock("@/lib/mercadopago/oauth", () => ({
  refreshMercadoPagoAccessToken: (...a: unknown[]) => mocks.refresh(...a),
}));

import { refreshExpiringMercadoPagoTokens } from "./refresh-tokens";

const tokens = (n: string) => ({
  accessToken: `at-${n}`, refreshToken: `rt-${n}`, expiresAt: new Date("2027-01-01T00:00:00Z"),
  scope: "offline_access", mercadoPagoUserId: "u", publicKey: "pk", liveMode: true,
});

describe("refreshExpiringMercadoPagoTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({ clubId: "x", expiresAt: null });
  });

  it("consulta la ventana correcta (now + withinDays) y renueva cada club por vencer", async () => {
    const now = new Date("2026-07-09T00:00:00Z");
    mocks.getNeeding.mockResolvedValue([{ clubId: "c1", refreshToken: "old-1", expiresAt: new Date() }]);
    mocks.refresh.mockResolvedValue(tokens("1"));

    const result = await refreshExpiringMercadoPagoTokens({ withinDays: 30, now });

    // before = now + 30 días
    const before = mocks.getNeeding.mock.calls[0][0] as Date;
    expect(before.toISOString()).toBe(new Date("2026-08-08T00:00:00Z").toISOString());
    expect(mocks.refresh).toHaveBeenCalledWith("old-1");
    expect(mocks.update).toHaveBeenCalledWith("c1", expect.objectContaining({ accessToken: "at-1", refreshToken: "rt-1" }));
    expect(result).toEqual({ checked: 1, refreshed: ["c1"], failed: [] });
  });

  it("un club que falla NO frena a los demás y queda en failed", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getNeeding.mockResolvedValue([
      { clubId: "c1", refreshToken: "bad", expiresAt: new Date() },
      { clubId: "c2", refreshToken: "ok", expiresAt: new Date() },
    ]);
    mocks.refresh.mockImplementation(async (rt: string) => {
      if (rt === "bad") throw new Error("MP rechazó el refresh");
      return tokens("2");
    });

    const result = await refreshExpiringMercadoPagoTokens({ now: new Date() });

    expect(result.refreshed).toEqual(["c2"]);
    expect(result.failed).toEqual([{ clubId: "c1", error: "MP rechazó el refresh" }]);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith("c2", expect.objectContaining({ accessToken: "at-2" }));
    err.mockRestore();
  });

  it("sin clubs por vencer no hace nada", async () => {
    mocks.getNeeding.mockResolvedValue([]);
    const result = await refreshExpiringMercadoPagoTokens();
    expect(result).toEqual({ checked: 0, refreshed: [], failed: [] });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
