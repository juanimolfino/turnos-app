import { describe, expect, it } from "vitest";
import { deriveInvitationStatus } from "./invitation-status";

const now = new Date("2026-07-07T12:00:00Z");
const future = new Date("2026-07-14T12:00:00Z");
const past = new Date("2026-07-01T12:00:00Z");

describe("deriveInvitationStatus", () => {
  it("pendiente: no aceptada, no reemplazada, no vencida", () => {
    expect(deriveInvitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: future }, now))
      .toBe("pendiente");
  });

  it("expirada: no aceptada, no reemplazada, vencida", () => {
    expect(deriveInvitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: past }, now))
      .toBe("expirada");
  });

  it("el límite exacto (expiresAt === now) cuenta como expirada", () => {
    expect(deriveInvitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: now }, now))
      .toBe("expirada");
  });

  it("aceptada: acceptedAt tiene prioridad aunque también esté vencida o reemplazada", () => {
    expect(deriveInvitationStatus({ acceptedAt: past, revokedAt: past, expiresAt: past }, now))
      .toBe("aceptada");
  });

  it("reemplazada: revokedAt sin aceptar, aunque no haya vencido todavía", () => {
    expect(deriveInvitationStatus({ acceptedAt: null, revokedAt: past, expiresAt: future }, now))
      .toBe("reemplazada");
  });
});
