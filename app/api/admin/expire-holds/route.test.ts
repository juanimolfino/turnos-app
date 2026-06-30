import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  expireBotHolds: vi.fn(),
}));

vi.mock("@/lib/bookings/expire-holds", () => ({
  expireBotHolds: mocks.expireBotHolds,
}));

describe("POST /api/admin/expire-holds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXPIRE_HOLDS_SECRET = "manual-secret";
    mocks.expireBotHolds.mockResolvedValue({ released: 2, bookingIds: ["bk-1", "bk-2"] });
  });

  it("rechaza llamadas sin secret", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("https://example.com/api/admin/expire-holds", { method: "POST" });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(mocks.expireBotHolds).not.toHaveBeenCalled();
  });

  it("permite disparar manualmente la expiración con header protegido", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("https://example.com/api/admin/expire-holds", {
      method: "POST",
      headers: { "x-expire-holds-secret": "manual-secret" },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, released: 2, bookingIds: ["bk-1", "bk-2"] });
    expect(mocks.expireBotHolds).toHaveBeenCalledTimes(1);
  });
});
