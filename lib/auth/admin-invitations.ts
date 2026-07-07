import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  adminInvitations,
  clubs,
  credits,
  subscriptions,
  transactions,
  users,
  type AdminInvitation,
  type Role,
  type User,
} from "@/lib/db/schema";

export const ADMIN_INVITE_TTL_HOURS = Number(process.env.ADMIN_INVITE_TTL_HOURS ?? 168);
export const DEFAULT_PUBLIC_APP_URL = "https://turnos-app-nine-tau.vercel.app";

export class AdminInvitationError extends Error {
  constructor(
    public code: "INVITE_INVALID" | "ACCOUNT_ACTIVE" | "CLUB_NAME_REQUIRED",
    message: string
  ) {
    super(message);
  }
}

export function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function expiresFrom(now: Date) {
  return new Date(now.getTime() + ADMIN_INVITE_TTL_HOURS * 60 * 60 * 1000);
}

export function resolvePublicAppUrl(value?: string | null) {
  const raw = (value ?? process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_PUBLIC_APP_URL).trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, "");
}

export function buildAdminInviteUrl(origin: string | null | undefined, token: string) {
  const url = new URL("/invite/accept", resolvePublicAppUrl(origin));
  url.searchParams.set("token", token);
  return url.toString();
}

export async function createAdminInvitation(input: {
  email: string;
  role: Role;
  venueName?: string;
  invitedByUserId: string;
  now?: Date;
}) {
  const db = getDb();
  const now = input.now ?? new Date();
  const email = normalizeInviteEmail(input.email);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInviteToken(token);

  const [invitation] = await db.transaction(async (tx) => {
    await tx
      .update(adminInvitations)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(
        eq(adminInvitations.email, email),
        isNull(adminInvitations.acceptedAt),
        isNull(adminInvitations.revokedAt)
      ));

    return tx
      .insert(adminInvitations)
      .values({
        email,
        role: input.role,
        venueName: input.venueName ?? null,
        tokenHash,
        invitedByUserId: input.invitedByUserId,
        expiresAt: expiresFrom(now),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
  });

  return { invitation, token };
}

export async function getValidAdminInvitationByToken(token: string, now = new Date()) {
  const tokenHash = hashInviteToken(token);
  return getDb().query.adminInvitations.findFirst({
    where: and(
      eq(adminInvitations.tokenHash, tokenHash),
      isNull(adminInvitations.acceptedAt),
      isNull(adminInvitations.revokedAt),
      gt(adminInvitations.expiresAt, now)
    ),
  });
}

export async function acceptAdminInvitation(input: {
  token: string;
  authUserId: string;
  passwordEmail: string;
  clubName?: string;
  now?: Date;
}) {
  const db = getDb();
  const now = input.now ?? new Date();
  const tokenHash = hashInviteToken(input.token);
  const signupCredits = Number(process.env.FREE_SIGNUP_CREDITS ?? 5);

  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(adminInvitations)
      .where(and(
        eq(adminInvitations.tokenHash, tokenHash),
        isNull(adminInvitations.acceptedAt),
        isNull(adminInvitations.revokedAt),
        gt(adminInvitations.expiresAt, now)
      ))
      .for("update");

    if (!invitation) {
      throw new AdminInvitationError(
        "INVITE_INVALID",
        "La invitación es inválida o expiró. Pedí que te la reenvíen."
      );
    }

    const email = normalizeInviteEmail(invitation.email);
    if (normalizeInviteEmail(input.passwordEmail) !== email) {
      throw new AdminInvitationError(
        "INVITE_INVALID",
        "La invitación no coincide con el usuario creado."
      );
    }

    const existingProfile = await tx.query.users.findFirst({
      where: or(eq(users.email, email), eq(users.authUserId, input.authUserId)),
    });
    if (existingProfile) {
      throw new AdminInvitationError("ACCOUNT_ACTIVE", "Ese email ya tiene una cuenta activa.");
    }

    let clubId: string | null = null;
    let venueName = invitation.venueName;
    if (invitation.role === "admin") {
      venueName = input.clubName?.trim() || invitation.venueName;
      if (!venueName) {
        throw new AdminInvitationError("CLUB_NAME_REQUIRED", "El nombre de la cancha es requerido.");
      }
      const [club] = await tx.insert(clubs).values({ name: venueName }).returning({ id: clubs.id });
      clubId = club.id;
    }

    const [profile] = await tx
      .insert(users)
      .values({
        authUserId: input.authUserId,
        email,
        role: invitation.role,
        venueName,
        clubId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await tx.insert(credits).values({ userId: profile.id, balance: signupCredits }).onConflictDoNothing();
    await tx.insert(subscriptions).values({ userId: profile.id, plan: "free", status: "active" });
    await tx.insert(transactions).values({
      userId: profile.id,
      type: "signup_bonus",
      credits: signupCredits,
      metadata: { source: "admin_invite" },
    });

    await tx
      .update(adminInvitations)
      .set({ acceptedAt: now, updatedAt: now })
      .where(eq(adminInvitations.id, invitation.id));

    return { invitation: invitation as AdminInvitation, profile: profile as User };
  });
}
