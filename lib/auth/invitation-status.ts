export type InvitationStatus = "pendiente" | "expirada" | "aceptada" | "reemplazada";

export type InvitationStatusInput = {
  acceptedAt: Date | string | null;
  revokedAt: Date | string | null;
  expiresAt: Date | string;
};

/**
 * Deriva el estado visible de una invitación a partir de sus timestamps.
 * `revokedAt` hoy solo lo pone `createAdminInvitation` al reemplazar una
 * invitación pendiente por una nueva (reenvío) — de ahí "reemplazada" y no
 * "revocada": no existe (todavía) una revocación manual del superadmin.
 */
export function deriveInvitationStatus(
  input: InvitationStatusInput,
  now: Date = new Date(),
): InvitationStatus {
  if (input.acceptedAt) return "aceptada";
  if (input.revokedAt) return "reemplazada";
  return new Date(input.expiresAt).getTime() <= now.getTime() ? "expirada" : "pendiente";
}
