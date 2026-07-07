import { afterEach, describe, expect, it } from "vitest";
import {
  buildAdminInviteUrl,
  DEFAULT_PUBLIC_APP_URL,
  resolvePublicAppUrl,
} from "./admin-invitations";

describe("admin invitation URLs", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("normaliza el dominio de Vercel aunque venga sin protocolo", () => {
    expect(resolvePublicAppUrl("turnos-app-nine-tau.vercel.app")).toBe(
      "https://turnos-app-nine-tau.vercel.app"
    );
  });

  it("usa la URL pública de Vercel como fallback canónico", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    expect(buildAdminInviteUrl(null, "abc123")).toBe(
      `${DEFAULT_PUBLIC_APP_URL}/invite/accept?token=abc123`
    );
  });
});
