import { and, count, desc, eq, isNotNull, isNull, ne, or, sql, lt, gt, gte, lte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clubs, courts, sports, professors, openingHours, credits, jobs, subscriptions, transactions, users, bookings, customers, notifications, adminNotifications, recurringRules, playerIdentities, clubMercadoPagoCredentials, adminInvitations, operationalIncidents, type JobType, type PaymentMode, type Role, type AdminNotificationKind } from "@/lib/db/schema";
import { sendPurchaseConfirmationEmail, sendWelcomeEmail } from "@/lib/email/send";
import type { User } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "crypto";

export async function getUserByAuthId(authUserId: string) {
  return getDb().query.users.findFirst({ where: eq(users.authUserId, authUserId) });
}

export async function getUserByEmail(email: string) {
  return getDb().query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) });
}

/**
 * Borra cualquier perfil DB con ese email (invitación pendiente que nunca se completó)
 * y, si el club asociado no tiene otros usuarios, lo borra también.
 * Las tablas dependientes (credits, subscriptions, transactions) caen por cascade.
 */
export async function deleteDbUserByEmail(email: string) {
  const db = getDb();
  const rows = await db
    .delete(users)
    .where(eq(users.email, email))
    .returning({ clubId: users.clubId });

  for (const row of rows) {
    if (!row.clubId) continue;
    const remaining = await db.query.users.findFirst({ where: eq(users.clubId, row.clubId) });
    if (!remaining) {
      await db.delete(clubs).where(eq(clubs.id, row.clubId)).catch(() => {});
    }
  }
}

export async function cleanupIncompleteInvite(email: string, clubId?: string | null) {
  const db = getDb();
  await deleteDbUserByEmail(email);

  if (!clubId) return;
  const remaining = await db.query.users.findFirst({ where: eq(users.clubId, clubId) });
  if (!remaining) {
    await db.delete(clubs).where(eq(clubs.id, clubId)).catch(() => {});
  }
}

export async function setUserRole(authUserId: string, role: Role, venueName?: string) {
  const db = getDb();
  await db
    .update(users)
    .set({ role, venueName: venueName ?? null, updatedAt: new Date() })
    .where(eq(users.authUserId, authUserId));
}

export async function getAllAdmins() {
  return getDb().query.users.findMany({
    where: isNotNull(users.role),
    columns: { id: true, email: true, role: true, venueName: true, clubId: true, createdAt: true }
  });
}

export class DeleteAdminError extends Error {
  constructor(
    public code: "ADMIN_NOT_FOUND" | "CANNOT_DELETE_SUPERADMIN",
    message: string
  ) {
    super(message);
  }
}

/**
 * Borra un admin y, en cascada, TODO lo de su club (canchas, agenda, reservas,
 * clientes, credenciales de MP: todas esas tablas tienen onDelete: "cascade"
 * sobre club_id). Así el club deja de existir para el bot de una.
 * No borra el club si todavía queda otro usuario apuntando a ese club_id
 * (co-admin del mismo lugar).
 * No borra el usuario de Supabase Auth: eso lo hace el caller (server-side,
 * con el client de service role) una vez que esta transacción confirma.
 */
export async function deleteAdminCascade(adminUserId: string) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const admin = await tx.query.users.findFirst({ where: eq(users.id, adminUserId) });
    if (!admin) {
      throw new DeleteAdminError("ADMIN_NOT_FOUND", "El admin no existe.");
    }
    if (admin.role === "superadmin") {
      throw new DeleteAdminError("CANNOT_DELETE_SUPERADMIN", "No se puede borrar un superadmin desde acá.");
    }

    await tx.delete(users).where(eq(users.id, adminUserId));

    let clubDeleted = false;
    if (admin.clubId) {
      const stillUsed = await tx.query.users.findFirst({ where: eq(users.clubId, admin.clubId) });
      if (!stillUsed) {
        await tx.delete(clubs).where(eq(clubs.id, admin.clubId));
        clubDeleted = true;
      }
    }

    return { authUserId: admin.authUserId, email: admin.email, clubId: admin.clubId, clubDeleted };
  });
}

/**
 * Trazabilidad de invitaciones para el panel de superadmin: todas las
 * invitaciones alguna vez creadas (pendientes, expiradas, aceptadas o
 * reemplazadas por un reenvío), más el email de quién invitó.
 */
export async function getAdminInvitations() {
  return getDb().query.adminInvitations.findMany({
    orderBy: desc(adminInvitations.createdAt),
    with: { invitedBy: { columns: { email: true } } },
  });
}

export async function ensureUserProfile(authUser: User) {
  const db = getDb();
  const email = authUser.email ?? "";
  const existing = await db.query.users.findFirst({ where: eq(users.authUserId, authUser.id) });
  if (existing) return existing;

  const signupCredits = Number(process.env.FREE_SIGNUP_CREDITS ?? 5);

  // SEGURIDAD: NUNCA derivar rol/club/venue del user_metadata. En Supabase, el
  // user_metadata (raw_user_meta_data) lo puede escribir el propio usuario desde
  // el cliente con la anon key pública (signUp/updateUser). Confiar en él permitía
  // auto-asignarse role="superadmin". El rol legítimo se asigna SOLO server-side en
  // el flujo de invitación (acceptAdminInvitation, que valida el token firmado).
  // Este fallback crea siempre un perfil sin privilegios (role/clubId/venueName null).
  const { profile, createdProfile } = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        authUserId: authUser.id,
        email,
        fullName: authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? null,
        role: null,
        venueName: null,
        clubId: null,
      })
      .onConflictDoNothing({ target: users.authUserId })
      .returning();

    const profile = created ?? (await tx.query.users.findFirst({ where: eq(users.authUserId, authUser.id) }));
    if (!profile) throw new Error("Could not create user profile");

    if (created) {
      await tx.insert(credits).values({ userId: profile.id, balance: signupCredits }).onConflictDoNothing();
      await tx.insert(subscriptions).values({ userId: profile.id, plan: "free", status: "active" });
      await tx.insert(transactions).values({
        userId: profile.id,
        type: "signup_bonus",
        credits: signupCredits,
        metadata: { source: "first_login" }
      });
    }

    return { profile, createdProfile: Boolean(created) };
  });
  if (createdProfile) await sendWelcomeEmail(email, signupCredits);

  return profile;
}

export async function getDashboard(userId: string) {
  const db = getDb();
  const [creditRow, subscriptionRows, jobRows] = await Promise.all([
    db.query.credits.findFirst({ where: eq(credits.userId, userId) }),
    db.query.subscriptions.findMany({ where: eq(subscriptions.userId, userId), orderBy: desc(subscriptions.createdAt), limit: 1 }),
    db.query.jobs.findMany({ where: eq(jobs.userId, userId), orderBy: desc(jobs.createdAt), limit: 50 })
  ]);

  return {
    credits: creditRow?.balance ?? 0,
    subscription: subscriptionRows[0] ?? null,
    jobs: jobRows
  };
}

export async function createPendingJob(input: {
  userId: string;
  type: JobType;
  payload: Record<string, unknown>;
  creditsUsed: number;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [creditRow] = await tx
      .select()
      .from(credits)
      .where(and(eq(credits.userId, input.userId), sql`${credits.balance} >= ${input.creditsUsed}`))
      .for("update");

    if (!creditRow) throw new Error("INSUFFICIENT_CREDITS");

    await tx
      .update(credits)
      .set({ balance: sql`${credits.balance} - ${input.creditsUsed}`, updatedAt: new Date() })
      .where(eq(credits.userId, input.userId));

    const [job] = await tx
      .insert(jobs)
      .values({
        userId: input.userId,
        type: input.type,
        input: input.payload,
        creditsUsed: input.creditsUsed
      })
      .returning();

    await tx.insert(transactions).values({
      userId: input.userId,
      type: "credit_spend",
      credits: -input.creditsUsed,
      metadata: { jobId: job.id, jobType: input.type }
    });

    return job;
  });
}

export async function refundJobCredits(jobId: string, reason: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for("update");
    if (!job) throw new Error("Job not found");
    if (job.status === "done") return;

    const refundKey = `job_refund:${jobId}`;
    const [refund] = await tx.insert(transactions).values({
      userId: job.userId,
      type: "credit_refund",
      credits: job.creditsUsed,
      stripeEventId: refundKey,
      metadata: { jobId, reason }
    }).onConflictDoNothing({ target: transactions.stripeEventId }).returning({ id: transactions.id });

    if (refund) {
      await tx
        .update(credits)
        .set({ balance: sql`${credits.balance} + ${job.creditsUsed}`, updatedAt: new Date() })
        .where(eq(credits.userId, job.userId));
    }

    await tx.update(jobs).set({ status: "failed", error: reason, updatedAt: new Date() }).where(eq(jobs.id, jobId));
  });
}

export async function markJobProcessing(jobId: string) {
  return getDb()
    .update(jobs)
    .set({ status: "processing", updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "pending")));
}

export async function markJobDone(jobId: string, resultUrl: string) {
  return getDb()
    .update(jobs)
    .set({ status: "done", resultUrl, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "processing")));
}

export async function getJobForUser(jobId: string, userId: string) {
  return getDb().query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.userId, userId)) });
}

export async function addCredits(userId: string, amount: number, metadata: Record<string, unknown>, stripeEventId?: string) {
  const db = getDb();
  const profile = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const applied = await db.transaction(async (tx) => {
    const [transaction] = await tx.insert(transactions).values({
      userId,
      type: metadata.kind === "subscription" ? "subscription_payment" : "credit_purchase",
      credits: amount,
      amountCents: typeof metadata.amountCents === "number" ? metadata.amountCents : null,
      stripeEventId,
      metadata
    }).onConflictDoNothing().returning({ id: transactions.id });

    if (!transaction) return false;

    await tx
      .insert(credits)
      .values({ userId, balance: amount })
      .onConflictDoUpdate({
        target: credits.userId,
        set: { balance: sql`${credits.balance} + ${amount}`, updatedAt: new Date() }
      });

    return true;
  });
  if (applied && profile?.email && amount > 0) await sendPurchaseConfirmationEmail(profile.email, amount);
}

// ── Superadmin queries ─────────────────────────────────────────────────────────

export async function getSuperadminStats() {
  const db = getDb();
  const [clubCount, courtCount, adminCount] = await Promise.all([
    db.select({ n: count() }).from(clubs),
    db.select({ n: count() }).from(courts),
    db.select({ n: count() }).from(users).where(isNotNull(users.role)),
  ]);
  return {
    clubs: clubCount[0]?.n ?? 0,
    courts: courtCount[0]?.n ?? 0,
    admins: adminCount[0]?.n ?? 0,
  };
}

export type SuperadminBotPlayer = {
  id: string;
  channel: string;
  channelUserId: string;
  names: string[];
  phones: string[];
  emails: string[];
  clubs: string[];
  clubCount: number;
  bookingCount: number;
  lastBookingAt: Date | null;
  createdAt: Date;
};

export type SuperadminBotPlayerReservation = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string | null;
  origin: string;
  bookingCode: string | null;
  createdAt: Date;
  clubName: string;
  courtName: string;
  customerName: string;
  customerPhone: string | null;
};

function normalizeSearch(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function getSuperadminBotPlayers(search?: string | null) {
  const db = getDb();
  const q = normalizeSearch(search);
  const pattern = q ? `%${q}%` : null;

  const rows = await db.execute(sql`
    select
      pi.id,
      pi.channel,
      pi.channel_user_id as "channelUserId",
      coalesce(array_remove(array_agg(distinct c.name), null), '{}'::text[]) as names,
      coalesce(array_remove(array_agg(distinct c.phone), null), '{}'::text[]) as phones,
      coalesce(array_remove(array_agg(distinct c.email), null), '{}'::text[]) as emails,
      coalesce(array_remove(array_agg(distinct cl.name), null), '{}'::text[]) as clubs,
      count(distinct c.club_id)::int as "clubCount",
      count(distinct b.id)::int as "bookingCount",
      max(b.created_at) as "lastBookingAt",
      pi.created_at as "createdAt"
    from player_identities pi
    left join customers c on c.player_identity_id = pi.id
    left join clubs cl on cl.id = c.club_id
    left join bookings b on b.customer_id = c.id
    where ${pattern ? sql`
      exists (
        select 1
        from customers sc
        where sc.player_identity_id = pi.id
          and (
            sc.name ilike ${pattern}
            or sc.phone ilike ${pattern}
            or coalesce(sc.email, '') ilike ${pattern}
            or pi.channel_user_id ilike ${pattern}
          )
      )
    ` : sql`true`}
    group by pi.id, pi.channel, pi.channel_user_id, pi.created_at
    order by max(b.created_at) desc nulls last, pi.created_at desc
    limit 100
  `);

  return rows as unknown as SuperadminBotPlayer[];
}

export async function getSuperadminBotPlayerById(playerIdentityId: string) {
  const rows = await getDb().execute(sql`
    select
      pi.id,
      pi.channel,
      pi.channel_user_id as "channelUserId",
      coalesce(array_remove(array_agg(distinct c.name), null), '{}'::text[]) as names,
      coalesce(array_remove(array_agg(distinct c.phone), null), '{}'::text[]) as phones,
      coalesce(array_remove(array_agg(distinct c.email), null), '{}'::text[]) as emails,
      coalesce(array_remove(array_agg(distinct cl.name), null), '{}'::text[]) as clubs,
      count(distinct c.club_id)::int as "clubCount",
      count(distinct b.id)::int as "bookingCount",
      max(b.created_at) as "lastBookingAt",
      pi.created_at as "createdAt"
    from player_identities pi
    left join customers c on c.player_identity_id = pi.id
    left join clubs cl on cl.id = c.club_id
    left join bookings b on b.customer_id = c.id
    where pi.id = ${playerIdentityId}
    group by pi.id, pi.channel, pi.channel_user_id, pi.created_at
  `);
  return (rows as unknown as SuperadminBotPlayer[])[0] ?? null;
}

export async function getSuperadminBotPlayerReservations(playerIdentityId: string, offset = 0, limit = 10) {
  const db = getDb();
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(1, Math.min(50, limit));

  const [reservations, totals] = await Promise.all([
    db.execute(sql`
      select
        b.id,
        b.date,
        b.start_time as "startTime",
        b.end_time as "endTime",
        b.status,
        b.payment_status as "paymentStatus",
        b.origin,
        b.booking_code as "bookingCode",
        b.created_at as "createdAt",
        cl.name as "clubName",
        co.name as "courtName",
        c.name as "customerName",
        c.phone as "customerPhone"
      from bookings b
      inner join customers c on c.id = b.customer_id
      inner join clubs cl on cl.id = b.club_id
      inner join courts co on co.id = b.court_id
      where c.player_identity_id = ${playerIdentityId}
      order by b.date desc, b.start_time desc, b.created_at desc
      limit ${safeLimit}
      offset ${safeOffset}
    `),
    db.execute(sql`
      select count(*)::int as total
      from bookings b
      inner join customers c on c.id = b.customer_id
      where c.player_identity_id = ${playerIdentityId}
    `),
  ]);

  return {
    reservations: reservations as unknown as SuperadminBotPlayerReservation[],
    total: ((totals as unknown as { total: number }[])[0]?.total ?? 0),
    limit: safeLimit,
    offset: safeOffset,
  };
}

export async function getAllClubs() {
  const db = getDb();
  const allClubs = await db.select().from(clubs).orderBy(clubs.createdAt);
  const allCourts = await db.select({ clubId: courts.clubId, id: courts.id }).from(courts);
  const allAdmins = await db
    .select({ clubId: users.clubId, email: users.email, role: users.role })
    .from(users)
    .where(isNotNull(users.clubId));
  // Estado de conexión de MP por club: conectado + cuándo vence el token (no
  // exponemos el token en sí, solo el vencimiento para avisar antes de que caiga).
  const mpRows = await db
    .select({ clubId: clubMercadoPagoCredentials.clubId, expiresAt: clubMercadoPagoCredentials.expiresAt })
    .from(clubMercadoPagoCredentials);

  return allClubs.map((club) => {
    const mp = mpRows.find((m) => m.clubId === club.id);
    return {
      ...club,
      courtCount: allCourts.filter((c) => c.clubId === club.id).length,
      admins: allAdmins.filter((a) => a.clubId === club.id),
      mercadoPagoConnected: Boolean(mp),
      mercadoPagoExpiresAt: mp?.expiresAt ?? null,
    };
  });
}

export async function createClub(name: string) {
  const db = getDb();
  const [club] = await db.insert(clubs).values({ name }).returning();
  return club;
}

export async function getClubById(id: string) {
  return getDb().query.clubs.findFirst({ where: eq(clubs.id, id) });
}

export async function updateClub(id: string, data: {
  name?: string;
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  phone?: string | null;
  requiresPayment?: boolean;
  paymentMode?: PaymentMode;
  depositPct?: number;
  refundEnabled?: boolean;
  refundCutoffHours?: number;
  paymentDeadlineHours?: number;
}) {
  const db = getDb();
  const [updated] = await db.update(clubs).set(data).where(eq(clubs.id, id)).returning();
  return updated;
}

export async function updateClubCourtPrices(clubId: string, courtPrices: { courtId: string; price: number }[]) {
  const db = getDb();
  return db.transaction(async (tx) => {
    for (const courtPrice of courtPrices) {
      await tx
        .update(courts)
        .set({ price: courtPrice.price })
        .where(and(eq(courts.id, courtPrice.courtId), eq(courts.clubId, clubId)));
    }
  });
}

export type ClubOpeningHourInput = {
  weekday: number;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
};

export async function getClubOpeningHours(clubId: string) {
  return getDb()
    .select({
      weekday: openingHours.weekday,
      openTime: openingHours.openTime,
      closeTime: openingHours.closeTime,
      slotMinutes: openingHours.slotMinutes,
    })
    .from(openingHours)
    .where(eq(openingHours.clubId, clubId));
}

export async function replaceClubOpeningHours(clubId: string, rows: ClubOpeningHourInput[]) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.delete(openingHours).where(eq(openingHours.clubId, clubId));
    if (!rows.length) return;
    await tx.insert(openingHours).values(rows.map((row) => ({ clubId, ...row })));
  });
}

export async function getClubMercadoPagoConnectionStatus(clubId: string) {
  const row = await getDb().query.clubMercadoPagoCredentials.findFirst({
    where: eq(clubMercadoPagoCredentials.clubId, clubId),
    columns: {
      clubId: true,
      mercadoPagoUserId: true,
      liveMode: true,
      expiresAt: true,
      connectedAt: true,
      updatedAt: true,
    },
  });

  return row
    ? {
        connected: true as const,
        mercadoPagoUserId: row.mercadoPagoUserId,
        liveMode: row.liveMode,
        expiresAt: row.expiresAt,
        connectedAt: row.connectedAt,
        updatedAt: row.updatedAt,
      }
    : { connected: false as const };
}

/**
 * Datos crudos para el checklist de onboarding de un club (dirección, teléfono,
 * modo de pago, conexión de MP y precios de canchas activas). Fuente única que
 * consumen el layout (SSR) y el endpoint /api/onboarding/status (refresco vivo).
 */
export async function getOnboardingChecklistInput(clubId: string) {
  const db = getDb();
  const [club] = await db
    .select({ address: clubs.address, phone: clubs.phone, paymentMode: clubs.paymentMode })
    .from(clubs)
    .where(eq(clubs.id, clubId));
  const activeCourts = await db
    .select({ price: courts.price })
    .from(courts)
    .where(and(eq(courts.clubId, clubId), eq(courts.active, true)));
  const mpStatus = await getClubMercadoPagoConnectionStatus(clubId);

  return {
    address: club?.address ?? null,
    phone: club?.phone ?? null,
    paymentMode: club?.paymentMode ?? null,
    mercadoPagoConnected: mpStatus.connected,
    activeCourtPrices: activeCourts.map((c) => c.price ?? 0),
  };
}

export async function getClubMercadoPagoCredentialsForServer(clubId: string) {
  return getDb().query.clubMercadoPagoCredentials.findFirst({
    where: eq(clubMercadoPagoCredentials.clubId, clubId),
    columns: {
      clubId: true,
      accessToken: true,
    },
  });
}

export async function upsertClubMercadoPagoCredentials(clubId: string, data: {
  mercadoPagoUserId?: string | null;
  accessToken: string;
  refreshToken: string;
  publicKey?: string | null;
  scope?: string | null;
  liveMode?: boolean | null;
  expiresAt?: Date | null;
}) {
  const db = getDb();
  const values = {
    clubId,
    mercadoPagoUserId: data.mercadoPagoUserId ?? null,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    publicKey: data.publicKey ?? null,
    scope: data.scope ?? null,
    liveMode: data.liveMode ?? null,
    expiresAt: data.expiresAt ?? null,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(clubMercadoPagoCredentials)
    .values(values)
    .onConflictDoUpdate({
      target: clubMercadoPagoCredentials.clubId,
      set: values,
    })
    .returning({
      clubId: clubMercadoPagoCredentials.clubId,
      mercadoPagoUserId: clubMercadoPagoCredentials.mercadoPagoUserId,
      liveMode: clubMercadoPagoCredentials.liveMode,
      expiresAt: clubMercadoPagoCredentials.expiresAt,
      connectedAt: clubMercadoPagoCredentials.connectedAt,
      updatedAt: clubMercadoPagoCredentials.updatedAt,
    });

  return row;
}

/** Credenciales cuyo access_token vence antes de `before` (para renovarlas). Solo
 * las que tienen expires_at y refresh_token. Devuelve el refresh_token porque es
 * server-side (esta función solo se llama desde el job de refresh). */
export async function getClubMercadoPagoCredentialsNeedingRefresh(before: Date) {
  return getDb()
    .select({
      clubId: clubMercadoPagoCredentials.clubId,
      refreshToken: clubMercadoPagoCredentials.refreshToken,
      expiresAt: clubMercadoPagoCredentials.expiresAt,
    })
    .from(clubMercadoPagoCredentials)
    .where(and(
      isNotNull(clubMercadoPagoCredentials.expiresAt),
      isNotNull(clubMercadoPagoCredentials.refreshToken),
      lte(clubMercadoPagoCredentials.expiresAt, before),
    ));
}

/** Actualiza SOLO los campos de token tras un refresh (no toca user_id ni connected_at). */
export async function updateClubMercadoPagoCredentialsTokens(clubId: string, tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  publicKey?: string | null;
  scope?: string | null;
  liveMode?: boolean | null;
}) {
  const [row] = await getDb()
    .update(clubMercadoPagoCredentials)
    .set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      publicKey: tokens.publicKey ?? null,
      scope: tokens.scope ?? null,
      liveMode: tokens.liveMode ?? null,
      updatedAt: new Date(),
    })
    .where(eq(clubMercadoPagoCredentials.clubId, clubId))
    .returning({ clubId: clubMercadoPagoCredentials.clubId, expiresAt: clubMercadoPagoCredentials.expiresAt });
  return row;
}

export async function disconnectClubMercadoPago(clubId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(clubMercadoPagoCredentials)
      .where(eq(clubMercadoPagoCredentials.clubId, clubId))
      .returning({ clubId: clubMercadoPagoCredentials.clubId });

    const [club] = await tx
      .update(clubs)
      .set({
        requiresPayment: false,
        paymentMode: "none",
      })
      .where(eq(clubs.id, clubId))
      .returning({
        id: clubs.id,
        paymentMode: clubs.paymentMode,
        requiresPayment: clubs.requiresPayment,
      });

    return { disconnected: deleted.length > 0, club };
  });
}

/**
 * Onboarding del admin: crea el club si no existe y le pone el nombre de la cancha,
 * dejando al usuario asociado. Idempotente.
 */
export async function setOnboardingClubName(authUserId: string, clubName: string) {
  const db = getDb();
  const profile = await db.query.users.findFirst({ where: eq(users.authUserId, authUserId) });
  if (!profile) throw new Error("Perfil no encontrado");

  let clubId = profile.clubId;
  if (clubId) {
    await db.update(clubs).set({ name: clubName }).where(eq(clubs.id, clubId));
  } else {
    const [club] = await db.insert(clubs).values({ name: clubName }).returning();
    clubId = club.id;
  }

  await db
    .update(users)
    .set({ clubId, venueName: clubName, updatedAt: new Date() })
    .where(eq(users.authUserId, authUserId));

  return { clubId };
}

export async function generateApiKey(clubId: string) {
  const key = "ck_" + randomBytes(24).toString("hex");
  const db = getDb();
  const [updated] = await db.update(clubs).set({ apiKey: key }).where(eq(clubs.id, clubId)).returning();
  return updated.apiKey;
}

/**
 * Normaliza la hora de fin de un booking. El selector del panel ofrece "24:00"
 * (medianoche), pero el formato es HH:MM 24h (máx 23:59) y toda la comparación de
 * horas es lexicográfica/cronológica DENTRO del día. Guardamos "24:00" → "23:59"
 * (no "00:00", que al ser < cualquier start rompería el overlap).
 */
export function normalizeEndTime(endTime: string): string {
  return endTime === "24:00" ? "23:59" : endTime;
}

export async function findOrCreateCustomer(clubId: string, name: string, phone: string) {
  const db = getDb();
  const existing = await db.query.customers.findFirst({
    where: and(eq(customers.clubId, clubId), eq(customers.phone, phone))
  });
  if (existing) return existing;
  const [created] = await db.insert(customers).values({ clubId, name, phone }).returning();
  return created;
}

export async function getKnownBotCustomer(channel: string, channelUserId: string) {
  const db = getDb();
  const identity = await db.query.playerIdentities.findFirst({
    where: and(eq(playerIdentities.channel, channel), eq(playerIdentities.channelUserId, channelUserId)),
  });

  if (identity) {
    const customer = await db.query.customers.findFirst({
      where: eq(customers.playerIdentityId, identity.id),
      orderBy: desc(customers.updatedAt),
    });
    if (customer) return customer;
  }

  return db.query.customers.findFirst({
    where: and(eq(customers.channel, channel), eq(customers.channelUserId, channelUserId)),
    orderBy: desc(customers.createdAt),
  });
}

type PlayerIdentityDb = Pick<ReturnType<typeof getDb>, "query" | "insert">;

async function findOrCreatePlayerIdentity(tx: PlayerIdentityDb, channel: string, channelUserId: string) {
  const existing = await tx.query.playerIdentities.findFirst({
    where: and(eq(playerIdentities.channel, channel), eq(playerIdentities.channelUserId, channelUserId)),
  });
  if (existing) return existing;

  const [created] = await tx
    .insert(playerIdentities)
    .values({ channel, channelUserId })
    .onConflictDoUpdate({
      target: [playerIdentities.channel, playerIdentities.channelUserId],
      set: { updatedAt: new Date() },
    })
    .returning();

  return created;
}

export async function findOrCreateBotCustomer(input: {
  clubId: string;
  name: string;
  phone: string;
  channel: string;
  channelUserId: string;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const identity = await findOrCreatePlayerIdentity(tx, input.channel, input.channelUserId);

    const existingByIdentity = await tx.query.customers.findFirst({
      where: and(eq(customers.clubId, input.clubId), eq(customers.playerIdentityId, identity.id)),
    });

    if (existingByIdentity) {
      const [updated] = await tx
        .update(customers)
        .set({
          name: input.name,
          phone: input.phone,
          channel: input.channel,
          channelUserId: input.channelUserId,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, existingByIdentity.id))
        .returning();
      return updated ?? existingByIdentity;
    }

    const existingByChannel = await tx.query.customers.findFirst({
      where: and(
        eq(customers.clubId, input.clubId),
        eq(customers.channel, input.channel),
        eq(customers.channelUserId, input.channelUserId),
      ),
    });

    if (existingByChannel) {
      const [updated] = await tx
        .update(customers)
        .set({ playerIdentityId: identity.id, name: input.name, phone: input.phone, updatedAt: new Date() })
        .where(eq(customers.id, existingByChannel.id))
        .returning();
      return updated ?? existingByChannel;
    }

    const existingByPhone = await tx.query.customers.findFirst({
      where: and(eq(customers.clubId, input.clubId), eq(customers.phone, input.phone)),
    });
    if (existingByPhone) {
      const [updated] = await tx
        .update(customers)
        .set({
          name: input.name,
          channel: input.channel,
          channelUserId: input.channelUserId,
          playerIdentityId: identity.id,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, existingByPhone.id))
        .returning();
      return updated ?? existingByPhone;
    }

    const [created] = await tx.insert(customers).values({
      clubId: input.clubId,
      playerIdentityId: identity.id,
      name: input.name,
      phone: input.phone,
      channel: input.channel,
      channelUserId: input.channelUserId,
    }).returning();
    return created;
  });
}

export async function linkExistingCustomersToPlayerIdentity(input: {
  channel: string;
  channelUserId: string;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const identity = await findOrCreatePlayerIdentity(tx, input.channel, input.channelUserId);
    const linked = await tx
      .update(customers)
      .set({ playerIdentityId: identity.id, updatedAt: new Date() })
      .where(and(eq(customers.channel, input.channel), eq(customers.channelUserId, input.channelUserId), isNull(customers.playerIdentityId)))
      .returning();
    return { identity, linkedCount: linked.length };
  });
}

function normalizeOptionalText(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export class CustomerMutationError extends Error {
  constructor(
    public code: "CUSTOMER_NOT_FOUND" | "BOT_CUSTOMER_LOCKED",
    message: string,
  ) {
    super(message);
  }
}

export async function listClubCustomers(clubId: string) {
  const rows = await getDb()
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      notes: customers.notes,
      playerIdentityId: customers.playerIdentityId,
      channel: customers.channel,
      channelUserId: customers.channelUserId,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
    })
    .from(customers)
    .where(eq(customers.clubId, clubId))
    .orderBy(desc(customers.updatedAt), desc(customers.createdAt));

  // Cantidad de turnos que reservó cada cliente en el club: reservas reales
  // (type 'simple') que no estén canceladas. No cuenta bloques ni holds vencidos.
  const ids = rows.map((r) => r.id);
  const bookingCounts: Record<string, number> = {};
  if (ids.length) {
    const counts = await getDb()
      .select({ customerId: bookings.customerId, n: count() })
      .from(bookings)
      .where(and(
        eq(bookings.clubId, clubId),
        inArray(bookings.customerId, ids),
        eq(bookings.type, "simple"),
        ne(bookings.status, "cancelado"),
      ))
      .groupBy(bookings.customerId);
    for (const c of counts) if (c.customerId) bookingCounts[c.customerId] = Number(c.n);
  }

  return rows.map((customer) => ({
    ...customer,
    bookingCount: bookingCounts[customer.id] ?? 0,
    source: customer.playerIdentityId || (customer.channel && customer.channelUserId) ? "bot" as const : "admin" as const,
    editable: !(customer.playerIdentityId || (customer.channel && customer.channelUserId)),
  }));
}

export async function createManualCustomer(input: {
  clubId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}) {
  const [created] = await getDb()
    .insert(customers)
    .values({
      clubId: input.clubId,
      playerIdentityId: null,
      name: input.name.trim(),
      phone: normalizeOptionalText(input.phone),
      email: normalizeOptionalText(input.email)?.toLowerCase() ?? null,
      notes: normalizeOptionalText(input.notes),
      channel: null,
      channelUserId: null,
      updatedAt: new Date(),
    })
    .returning();
  return created;
}

export async function updateManualCustomer(input: {
  clubId: string;
  customerId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}) {
  const db = getDb();
  const existing = await db.query.customers.findFirst({
    where: and(eq(customers.id, input.customerId), eq(customers.clubId, input.clubId)),
  });
  if (!existing) throw new CustomerMutationError("CUSTOMER_NOT_FOUND", "El cliente no existe.");
  if (existing.playerIdentityId || existing.channel || existing.channelUserId) {
    throw new CustomerMutationError("BOT_CUSTOMER_LOCKED", "Los clientes creados por el bot no se editan desde el panel.");
  }

  const [updated] = await db
    .update(customers)
    .set({
      name: input.name.trim(),
      phone: normalizeOptionalText(input.phone),
      email: normalizeOptionalText(input.email)?.toLowerCase() ?? null,
      notes: normalizeOptionalText(input.notes),
      updatedAt: new Date(),
    })
    .where(and(eq(customers.id, input.customerId), eq(customers.clubId, input.clubId), isNull(customers.playerIdentityId), isNull(customers.channel), isNull(customers.channelUserId)))
    .returning();

  return updated;
}

export async function deleteManualCustomer(clubId: string, customerId: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const existing = await tx.query.customers.findFirst({
      where: and(eq(customers.id, customerId), eq(customers.clubId, clubId)),
    });
    if (!existing) throw new CustomerMutationError("CUSTOMER_NOT_FOUND", "El cliente no existe.");
    if (existing.playerIdentityId || existing.channel || existing.channelUserId) {
      throw new CustomerMutationError("BOT_CUSTOMER_LOCKED", "Los clientes creados por el bot no se borran desde el panel.");
    }

    await tx.update(bookings).set({ customerId: null }).where(and(eq(bookings.clubId, clubId), eq(bookings.customerId, customerId)));
    await tx.update(recurringRules).set({ customerId: null }).where(and(eq(recurringRules.clubId, clubId), eq(recurringRules.customerId, customerId)));
    await tx.delete(notifications).where(and(eq(notifications.clubId, clubId), eq(notifications.customerId, customerId)));
    const [deleted] = await tx
      .delete(customers)
      .where(and(eq(customers.id, customerId), eq(customers.clubId, clubId), isNull(customers.playerIdentityId), isNull(customers.channel), isNull(customers.channelUserId)))
      .returning({ id: customers.id });

    return deleted;
  });
}

export async function createBooking(data: {
  clubId: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: "simple" | "clase" | "fijo" | "evento" | "americano" | "torneo" | "bloqueo";
  status?: "confirmado" | "pendiente" | "cancelado";
  customerId?: string | null;
  professorId?: string | null;
  eventId?: string | null;
  price?: number | null;
  paymentStatus?: "pagado" | "senado" | "impago" | null;
  notes?: string | null;
  // Origen de la reserva. Default 'admin' (panel). En Fase 6, el bot creará
  // reservas pasando origin: 'bot' por acá.
  origin?: "admin" | "bot";
}) {
  const db = getDb();
  const [booking] = await db.insert(bookings).values({
    clubId: data.clubId,
    courtId: data.courtId,
    date: data.date,
    startTime: data.startTime,
    endTime: normalizeEndTime(data.endTime),
    type: data.type,
    status: data.status ?? "confirmado",
    origin: data.origin ?? "admin",
    customerId: data.customerId ?? null,
    professorId: data.professorId ?? null,
    eventId: data.eventId ?? null,
    price: data.price ?? null,
    paymentStatus: data.paymentStatus ?? null,
    notes: data.notes ?? null,
  }).returning();
  return booking;
}

// ── Canchas (courts) ────────────────────────────────────────────────────────
// Tipos gestionables como "bloque" desde el panel del admin (crear/editar/borrar).
// 'simple' es además el tipo de las reservas reales y de las que generará el bot.
const BLOCK_TYPES = ["simple", "clase", "fijo", "evento", "americano", "torneo", "bloqueo"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

// Tipos que un bloque nuevo REEMPLAZA al solaparse (se borran antes de insertar).
// Excluimos 'simple' a propósito: una reserva real / del bot NO debe borrarse
// silenciosamente al crear un bloque en una franja que se superpone.
const OVERLAP_REPLACE_TYPES = BLOCK_TYPES.filter((t) => t !== "simple");

export async function ensurePadelSport() {
  const db = getDb();
  const existing = await db.query.sports.findFirst({ where: eq(sports.slug, "padel") });
  if (existing) return existing;
  await db.insert(sports).values({ name: "Pádel", slug: "padel" }).onConflictDoNothing();
  return db.query.sports.findFirst({ where: eq(sports.slug, "padel") });
}

export async function getClubCourts(clubId: string, includeInactive = false) {
  const db = getDb();
  const list = includeInactive
    ? await db.select().from(courts).where(eq(courts.clubId, clubId))
    : await db.select().from(courts).where(and(eq(courts.clubId, clubId), eq(courts.active, true)));
  return list.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Ajusta la cantidad de canchas ACTIVAS del club al número pedido.
 * No borra canchas (preserva historial): desactiva las sobrantes y
 * reactiva/crea según haga falta. Devuelve las canchas activas resultantes.
 */
export async function setClubCourtCount(clubId: string, count: number) {
  const db = getDb();
  const sport = await ensurePadelSport();
  if (!sport) throw new Error("No se pudo crear el deporte por defecto");

  const all = (await db.select().from(courts).where(eq(courts.clubId, clubId)))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const active = all.filter((c) => c.active);
  const inactive = all.filter((c) => !c.active);

  if (active.length > count) {
    // Desactivar las sobrantes (de mayor orden)
    const toOff = active.slice(count);
    if (toOff.length) {
      await db.update(courts).set({ active: false }).where(inArray(courts.id, toOff.map((c) => c.id)));
    }
  } else if (active.length < count) {
    let need = count - active.length;
    // Reactivar inactivas primero
    const toOn = inactive.slice(0, need);
    if (toOn.length) {
      await db.update(courts).set({ active: true }).where(inArray(courts.id, toOn.map((c) => c.id)));
      need -= toOn.length;
    }
    // Crear nuevas
    for (let i = 0; i < need; i++) {
      const order = all.length + i;
      await db.insert(courts).values({
        clubId,
        sportId: sport.id,
        name: `Cancha ${order + 1}`,
        sortOrder: order,
      });
    }
  }

  return getClubCourts(clubId);
}

export async function renameCourt(clubId: string, courtId: string, name: string) {
  const db = getDb();
  const [updated] = await db.update(courts)
    .set({ name })
    .where(and(eq(courts.id, courtId), eq(courts.clubId, clubId)))
    .returning();
  return updated;
}

// ── Agenda semanal / bloques ─────────────────────────────────────────────────
/** Bloques + reservas de un rango de fechas (inclusive), con nombre resuelto. */
export async function getWeekAgenda(clubId: string, startDate: string, endDate: string) {
  const db = getDb();
  const rows = await db.select({
    id: bookings.id, courtId: bookings.courtId, date: bookings.date,
    startTime: bookings.startTime, endTime: bookings.endTime, type: bookings.type,
    status: bookings.status, notes: bookings.notes, blockGroupId: bookings.blockGroupId,
    customerId: bookings.customerId, professorId: bookings.professorId,
    customerName: bookings.customerName,
    origin: bookings.origin,
  }).from(bookings).where(and(
    eq(bookings.clubId, clubId),
    gte(bookings.date, startDate),
    lte(bookings.date, endDate),
  ));

  const profIds = [...new Set(rows.map((r) => r.professorId).filter(Boolean))] as string[];
  const custIds = [...new Set(rows.map((r) => r.customerId).filter(Boolean))] as string[];
  const profMap: Record<string, string> = {};
  const custMap: Record<string, { name: string; phone: string | null }> = {};
  if (profIds.length) {
    const ps = await db.select({ id: professors.id, name: professors.name }).from(professors).where(inArray(professors.id, profIds));
    ps.forEach((p) => { profMap[p.id] = p.name; });
  }
  if (custIds.length) {
    const cs = await db.select({ id: customers.id, name: customers.name, phone: customers.phone }).from(customers).where(inArray(customers.id, custIds));
    cs.forEach((c) => { custMap[c.id] = { name: c.name, phone: c.phone }; });
  }

  return rows
    .filter((r) => r.status !== "cancelado")
    .map((r) => ({
      id: r.id, courtId: r.courtId, date: r.date,
      startTime: r.startTime, endTime: r.endTime, type: r.type,
      status: r.status, blockGroupId: r.blockGroupId, notes: r.notes,
      label: r.professorId ? profMap[r.professorId] ?? null : r.customerId ? custMap[r.customerId]?.name ?? null : r.customerName ?? null,
      customerPhone: r.customerId ? custMap[r.customerId]?.phone ?? null : null,
      origin: r.origin,
    }));
}

/**
 * Crea bloques de agenda como bookings. Para cada cancha × fecha:
 * borra primero cualquier bloque (no reserva "simple") que se superponga,
 * y luego inserta el nuevo. Todos comparten un blockGroupId.
 */
export async function createAgendaBlocks(input: {
  clubId: string;
  type: BlockType;
  courtIds: string[];
  dates: string[];
  startTime: string;
  endTime: string;
  notes?: string | null;
}) {
  const db = getDb();
  const blockGroupId = randomUUID();
  const endTime = normalizeEndTime(input.endTime); // "24:00" → "23:59"

  for (const courtId of input.courtIds) {
    for (const date of input.dates) {
      // Borrar bloques superpuestos (nunca reservas "simple": esas se protegen)
      await db.delete(bookings).where(and(
        eq(bookings.clubId, input.clubId),
        eq(bookings.courtId, courtId),
        eq(bookings.date, date),
        inArray(bookings.type, OVERLAP_REPLACE_TYPES as unknown as BlockType[]),
        lt(bookings.startTime, endTime),
        gt(bookings.endTime, input.startTime),
      ));

      await db.insert(bookings).values({
        clubId: input.clubId,
        courtId,
        date,
        startTime: input.startTime,
        endTime,
        type: input.type,
        status: "confirmado",
        origin: "admin", // bloques cargados desde el panel del admin
        notes: input.notes ?? null,
        blockGroupId,
      });
    }
  }

  return { blockGroupId, count: input.courtIds.length * input.dates.length };
}

/**
 * Quita un único bloque (una celda). Las reservas type='simple' (de cliente o,
 * a futuro, del bot) NO se borran en duro: se CANCELAN (status='cancelado'),
 * igual que en la vista del día. El resto de los bloques (bloqueo/torneo/
 * americano/clase/fijo/evento) sí se eliminan.
 */
export async function deleteAgendaBlock(clubId: string, bookingId: string) {
  const db = getDb();
  const [b] = await db
    .select({ type: bookings.type })
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.clubId, clubId)));
  if (!b) return;

  if (b.type === "simple") {
    await db
      .update(bookings)
      .set({ status: "cancelado" })
      .where(and(eq(bookings.id, bookingId), eq(bookings.clubId, clubId)));
    return;
  }

  await db.delete(bookings).where(and(
    eq(bookings.id, bookingId),
    eq(bookings.clubId, clubId),
    inArray(bookings.type, OVERLAP_REPLACE_TYPES as unknown as BlockType[]),
  ));
}

/**
 * Quita toda la serie de un bloque (todas las canchas/semanas), opcionalmente
 * desde una fecha. Las reservas 'simple' de la serie se cancelan (no se borran);
 * el resto de los bloques se eliminan en duro.
 */
export async function deleteAgendaBlockGroup(clubId: string, blockGroupId: string, fromDate?: string) {
  const db = getDb();
  const base = [
    eq(bookings.clubId, clubId),
    eq(bookings.blockGroupId, blockGroupId),
  ];
  if (fromDate) base.push(gte(bookings.date, fromDate));

  // 'simple' → cancelación suave (nunca borrado duro).
  await db.update(bookings).set({ status: "cancelado" })
    .where(and(...base, eq(bookings.type, "simple")));

  // Resto de los bloques → borrado duro.
  await db.delete(bookings)
    .where(and(...base, inArray(bookings.type, OVERLAP_REPLACE_TYPES as unknown as BlockType[])));
}

export async function cancelBooking(bookingId: string, clubId: string) {
  const db = getDb();
  const [updated] = await db
    .update(bookings)
    .set({ status: "cancelado" })
    .where(and(eq(bookings.id, bookingId), eq(bookings.clubId, clubId)))
    .returning();
  return updated;
}

export async function getBookingById(bookingId: string) {
  return getDb().query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: { customer: true, professor: true, court: true, event: true }
  });
}

export async function getBookingPaymentContext(bookingId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: bookings.id,
      clubId: bookings.clubId,
      courtId: bookings.courtId,
      date: bookings.date,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      status: bookings.status,
      origin: bookings.origin,
      price: bookings.price,
      paymentStatus: bookings.paymentStatus,
      heldUntil: bookings.heldUntil,
      mpPreferenceId: bookings.mpPreferenceId,
      mpPaymentId: bookings.mpPaymentId,
      mpRefundId: bookings.mpRefundId,
      refundStatus: bookings.refundStatus,
      paymentReviewReason: bookings.paymentReviewReason,
      customerId: bookings.customerId,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      bookingCode: bookings.bookingCode,
      clubName: clubs.name,
      clubPaymentMode: clubs.paymentMode,
      refundEnabled: clubs.refundEnabled,
      refundCutoffHours: clubs.refundCutoffHours,
      courtName: courts.name,
      mercadoPagoAccessToken: clubMercadoPagoCredentials.accessToken,
    })
    .from(bookings)
    .innerJoin(clubs, eq(bookings.clubId, clubs.id))
    .innerJoin(courts, eq(bookings.courtId, courts.id))
    .leftJoin(clubMercadoPagoCredentials, eq(bookings.clubId, clubMercadoPagoCredentials.clubId))
    .where(eq(bookings.id, bookingId));

  return row ?? null;
}

type BookingPaymentConfirmationBooking = NonNullable<Awaited<ReturnType<typeof getBookingPaymentContext>>> & {
  customerChannel?: string | null;
  customerChannelUserId?: string | null;
};

export type BookingPaymentConfirmationResult =
  | { status: "confirmed"; booking: BookingPaymentConfirmationBooking }
  | { status: "already_processed"; booking: BookingPaymentConfirmationBooking }
  | { status: "not_found" }
  | { status: "not_confirmed"; reason: "not_pending" | "hold_expired" | "amount_mismatch"; booking: BookingPaymentConfirmationBooking };

export async function confirmBotHoldPayment(input: {
  bookingId: string;
  mpPaymentId: string;
  paymentStatus: "senado" | "pagado";
  paidAmount: number | null;
  now?: Date;
}): Promise<BookingPaymentConfirmationResult> {
  const db = getDb();
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: bookings.id,
        clubId: bookings.clubId,
        courtId: bookings.courtId,
        date: bookings.date,
        startTime: bookings.startTime,
        endTime: bookings.endTime,
        status: bookings.status,
        origin: bookings.origin,
        price: bookings.price,
        paymentStatus: bookings.paymentStatus,
        heldUntil: bookings.heldUntil,
        mpPreferenceId: bookings.mpPreferenceId,
        mpPaymentId: bookings.mpPaymentId,
        mpRefundId: bookings.mpRefundId,
        refundStatus: bookings.refundStatus,
        paymentReviewReason: bookings.paymentReviewReason,
        customerId: bookings.customerId,
        customerName: bookings.customerName,
        customerPhone: bookings.customerPhone,
        bookingCode: bookings.bookingCode,
        clubName: clubs.name,
        clubPaymentMode: clubs.paymentMode,
        refundEnabled: clubs.refundEnabled,
        refundCutoffHours: clubs.refundCutoffHours,
        courtName: courts.name,
      })
      .from(bookings)
      .innerJoin(clubs, eq(bookings.clubId, clubs.id))
      .innerJoin(courts, eq(bookings.courtId, courts.id))
      .where(eq(bookings.id, input.bookingId))
      .for("update");

    if (!current) return { status: "not_found" };

    const [customerIdentity] = current.customerId
      ? await tx
          .select({ channel: customers.channel, channelUserId: customers.channelUserId })
          .from(customers)
          .where(eq(customers.id, current.customerId))
      : [];

    const currentWithToken = {
      ...current,
      customerChannel: customerIdentity?.channel ?? null,
      customerChannelUserId: customerIdentity?.channelUserId ?? null,
      mercadoPagoAccessToken: null,
    };
    if (current.mpPaymentId === input.mpPaymentId) return { status: "already_processed", booking: currentWithToken };
    if (current.mpPaymentId) return { status: "already_processed", booking: currentWithToken };

    const expectedAmount = current.price ?? 0;
    if (input.paidAmount != null && expectedAmount > 0 && Math.round(input.paidAmount) < expectedAmount) {
      const [updated] = await tx
        .update(bookings)
        .set({ mpPaymentId: input.mpPaymentId, paymentReviewReason: "amount_mismatch" })
        .where(eq(bookings.id, input.bookingId))
        .returning();
      return {
        status: "not_confirmed",
        reason: "amount_mismatch",
        booking: {
          ...currentWithToken,
          ...updated,
          clubName: current.clubName,
          courtName: current.courtName,
          customerChannel: currentWithToken.customerChannel,
          customerChannelUserId: currentWithToken.customerChannelUserId,
        },
      };
    }

    if (current.status !== "pendiente") {
      const [updated] = await tx
        .update(bookings)
        .set({ mpPaymentId: input.mpPaymentId, paymentReviewReason: "not_pending" })
        .where(eq(bookings.id, input.bookingId))
        .returning();
      return {
        status: "not_confirmed",
        reason: "not_pending",
        booking: {
          ...currentWithToken,
          ...updated,
          clubName: current.clubName,
          courtName: current.courtName,
          customerChannel: currentWithToken.customerChannel,
          customerChannelUserId: currentWithToken.customerChannelUserId,
        },
      };
    }

    if (!current.heldUntil || current.heldUntil.getTime() <= now.getTime()) {
      const [updated] = await tx
        .update(bookings)
        .set({ mpPaymentId: input.mpPaymentId, paymentReviewReason: "hold_expired" })
        .where(eq(bookings.id, input.bookingId))
        .returning();
      return {
        status: "not_confirmed",
        reason: "hold_expired",
        booking: {
          ...currentWithToken,
          ...updated,
          clubName: current.clubName,
          courtName: current.courtName,
          customerChannel: currentWithToken.customerChannel,
          customerChannelUserId: currentWithToken.customerChannelUserId,
        },
      };
    }

    const [updated] = await tx
      .update(bookings)
      .set({
        status: "confirmado",
        paymentStatus: input.paymentStatus,
        mpPaymentId: input.mpPaymentId,
        paymentReviewReason: null,
        // Trazabilidad: cuándo acreditó y monto real cobrado por MP.
        paidAt: now,
        paidAmount: input.paidAmount != null ? Math.round(input.paidAmount) : (current.price ?? null),
      })
      .where(eq(bookings.id, input.bookingId))
      .returning();

    // Campana del panel: el hold pagado recién ahora se vuelve una reserva real
    // para el club. Idempotente (unique booking+kind) por si el webhook reintenta.
    if (current.origin === "bot") {
      await tx
        .insert(adminNotifications)
        .values({ clubId: current.clubId, bookingId: current.id, kind: "nueva_reserva" })
        .onConflictDoNothing({ target: [adminNotifications.bookingId, adminNotifications.kind] });
    }

    return {
      status: "confirmed",
      booking: {
        ...currentWithToken,
        ...updated,
        clubName: current.clubName,
        courtName: current.courtName,
        customerChannel: currentWithToken.customerChannel,
        customerChannelUserId: currentWithToken.customerChannelUserId,
      },
    };
  });
}

export type PaymentRow = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  paymentStatus: string | null;
  amount: number | null;
  origin: string;
  bookingCode: string | null;
  clubName: string;
  courtName: string;
  customerName: string | null;
  customerPhone: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  mpPaymentId: string | null;
  mpRefundId: string | null;
  refundStatus: string | null;
  paymentReviewReason: string | null;
};

/**
 * Movimientos de dinero para trazabilidad. Trae las reservas que TOCARON plata:
 * pagadas/señadas, con id de pago o refund, o con estado de refund. Si se pasa
 * `clubId`, filtra a ese club (vista del admin); sin él, es global (superadmin).
 * Solo lectura. No expone tokens.
 */
export async function getPayments(clubId?: string | null, limit = 200): Promise<PaymentRow[]> {
  const db = getDb();
  const moneyActivity = or(
    isNotNull(bookings.mpPaymentId),
    isNotNull(bookings.mpRefundId),
    isNotNull(bookings.refundStatus),
    inArray(bookings.paymentStatus, ["pagado", "senado"]),
  );
  const where = clubId ? and(eq(bookings.clubId, clubId), moneyActivity) : moneyActivity;

  const rows = await db
    .select({
      id: bookings.id,
      date: bookings.date,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      status: bookings.status,
      paymentStatus: bookings.paymentStatus,
      price: bookings.price,
      paidAmount: bookings.paidAmount,
      origin: bookings.origin,
      bookingCode: bookings.bookingCode,
      clubName: clubs.name,
      courtName: courts.name,
      custName: customers.name,
      snapshotName: bookings.customerName,
      customerPhone: customers.phone,
      paidAt: bookings.paidAt,
      refundedAt: bookings.refundedAt,
      mpPaymentId: bookings.mpPaymentId,
      mpRefundId: bookings.mpRefundId,
      refundStatus: bookings.refundStatus,
      paymentReviewReason: bookings.paymentReviewReason,
    })
    .from(bookings)
    .innerJoin(clubs, eq(clubs.id, bookings.clubId))
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .leftJoin(customers, eq(customers.id, bookings.customerId))
    .where(where)
    .orderBy(desc(bookings.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    paymentStatus: r.paymentStatus,
    amount: r.paidAmount ?? r.price ?? null,
    origin: r.origin,
    bookingCode: r.bookingCode,
    clubName: r.clubName,
    courtName: r.courtName,
    customerName: r.custName ?? r.snapshotName ?? null,
    customerPhone: r.customerPhone ?? null,
    paidAt: r.paidAt,
    refundedAt: r.refundedAt,
    mpPaymentId: r.mpPaymentId,
    mpRefundId: r.mpRefundId,
    refundStatus: r.refundStatus,
    paymentReviewReason: r.paymentReviewReason,
  }));
}

export async function saveBookingMercadoPagoPreference(bookingId: string, preferenceId: string) {
  const db = getDb();
  const [updated] = await db
    .update(bookings)
    .set({ mpPreferenceId: preferenceId })
    .where(eq(bookings.id, bookingId))
    .returning({ id: bookings.id, mpPreferenceId: bookings.mpPreferenceId });
  return updated;
}

export async function cancelBotHoldAfterPaymentError(bookingId: string) {
  const db = getDb();
  const [updated] = await db
    .update(bookings)
    .set({ status: "cancelado" })
    .where(and(eq(bookings.id, bookingId), eq(bookings.origin, "bot"), eq(bookings.status, "pendiente")))
    .returning({ id: bookings.id, status: bookings.status });
  return updated;
}

/**
 * Slots con canchas libres de un club/fecha. Delega en la fuente de verdad
 * (lib/bookings/availability), que aplica la regla correcta (status != 'cancelado')
 * y la ventana default. Nota: a diferencia de la versión vieja, solo devuelve
 * slots con al menos una cancha libre.
 */
export async function getAvailableSlots(clubId: string, date: string, requestedStart?: string, requestedEnd?: string) {
  const { getClubAvailability } = await import("@/lib/bookings/availability");
  const avail = await getClubAvailability(clubId, date, { start: requestedStart, end: requestedEnd });
  return (avail?.slots ?? []).map((s) => ({ start: s.start, end: s.end, freeCourts: s.freeCourts }));
}

export async function getClubByApiKey(apiKey: string) {
  return getDb().query.clubs.findFirst({ where: eq(clubs.apiKey, apiKey) });
}

// ── Campana del panel: notificaciones in-app de reservas nuevas del bot ──────────

/**
 * Registra un aviso in-app para el club cuando una reserva del bot se vuelve real
 * (club sin pago: al crearse confirmada; club con pago: al acreditar el webhook).
 * Idempotente por (booking, kind): reintentos no duplican. Best-effort desde el
 * caller: una reserva NUNCA debe fallar porque falle su notificación.
 */
export async function createAdminBookingNotification(clubId: string, bookingId: string, kind: AdminNotificationKind) {
  await getDb()
    .insert(adminNotifications)
    .values({ clubId, bookingId, kind })
    .onConflictDoNothing({ target: [adminNotifications.bookingId, adminNotifications.kind] });
}

export async function createNewBookingNotification(clubId: string, bookingId: string) {
  await createAdminBookingNotification(clubId, bookingId, "nueva_reserva");
}

export async function createBookingCancellationNotification(clubId: string, bookingId: string) {
  await createAdminBookingNotification(clubId, bookingId, "cancelacion_reserva");
}

export async function createPaymentReviewNotification(clubId: string, bookingId: string) {
  await createAdminBookingNotification(clubId, bookingId, "pago_requiere_revision");
}

export type AdminNotificationRow = {
  id: string;
  bookingId: string;
  kind: AdminNotificationKind;
  createdAt: Date;
  readAt: Date | null;
  customerName: string | null;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  bookingStatus: string;
  paymentStatus: string | null;
};

/**
 * Feed de la campana para un club: últimas notificaciones (con los datos de la
 * reserva joineados: quién y cuándo) + total sin leer. Solo lectura, server-side.
 */
export async function getClubNotifications(
  clubId: string,
  limit = 20,
): Promise<{ items: AdminNotificationRow[]; unread: number }> {
  const db = getDb();

  const [items, [unreadRow]] = await Promise.all([
    db
      .select({
        id: adminNotifications.id,
        bookingId: adminNotifications.bookingId,
        kind: adminNotifications.kind,
        createdAt: adminNotifications.createdAt,
        readAt: adminNotifications.readAt,
        customerName: bookings.customerName,
        courtName: courts.name,
        date: bookings.date,
        startTime: bookings.startTime,
        endTime: bookings.endTime,
        bookingStatus: bookings.status,
        paymentStatus: bookings.paymentStatus,
      })
      .from(adminNotifications)
      .innerJoin(bookings, eq(adminNotifications.bookingId, bookings.id))
      .innerJoin(courts, eq(bookings.courtId, courts.id))
      .where(eq(adminNotifications.clubId, clubId))
      .orderBy(desc(adminNotifications.createdAt))
      .limit(limit),
    db
      .select({ value: count() })
      .from(adminNotifications)
      .where(and(eq(adminNotifications.clubId, clubId), isNull(adminNotifications.readAt))),
  ]);

  return { items, unread: unreadRow?.value ?? 0 };
}

/**
 * Marca como leídas todas las notificaciones sin leer del club (al abrir la campana).
 * Devuelve cuántas se marcaron.
 */
export async function markClubNotificationsRead(clubId: string): Promise<number> {
  const updated = await getDb()
    .update(adminNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(adminNotifications.clubId, clubId), isNull(adminNotifications.readAt)))
    .returning({ id: adminNotifications.id });
  return updated.length;
}

export type OperationalIncidentInput = {
  source: string;
  type: string;
  severity?: "info" | "warning" | "critical";
  status?: "open" | "resolved";
  clubId?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  paymentId?: string | number | null;
  requestPath?: string | null;
  message: string;
  details?: Record<string, unknown> | null;
};

export async function createOperationalIncident(input: OperationalIncidentInput) {
  const values = {
    source: input.source,
    type: input.type,
    severity: input.severity ?? "warning",
    status: input.status ?? "open",
    clubId: input.clubId ?? null,
    bookingId: input.bookingId ?? null,
    customerId: input.customerId ?? null,
    paymentId: input.paymentId == null ? null : String(input.paymentId),
    requestPath: input.requestPath ?? null,
    message: input.message,
    details: input.details ?? null,
  };

  const insert = getDb().insert(operationalIncidents).values(values);
  if (values.bookingId) {
    await insert.onConflictDoNothing({ target: [operationalIncidents.bookingId, operationalIncidents.type] });
    return;
  }
  await insert;
}

export type OperationalIncidentRow = {
  id: string;
  source: string;
  type: string;
  severity: string;
  status: string;
  message: string;
  details: unknown;
  paymentId: string | null;
  requestPath: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  clubName: string | null;
  bookingCode: string | null;
  bookingStatus: string | null;
  paymentStatus: string | null;
  paymentReviewReason: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerChannel: string | null;
};

export async function getOperationalIncidents(limit = 100): Promise<OperationalIncidentRow[]> {
  const rows = await getDb()
    .select({
      id: operationalIncidents.id,
      source: operationalIncidents.source,
      type: operationalIncidents.type,
      severity: operationalIncidents.severity,
      status: operationalIncidents.status,
      message: operationalIncidents.message,
      details: operationalIncidents.details,
      paymentId: operationalIncidents.paymentId,
      requestPath: operationalIncidents.requestPath,
      createdAt: operationalIncidents.createdAt,
      resolvedAt: operationalIncidents.resolvedAt,
      clubName: clubs.name,
      bookingCode: bookings.bookingCode,
      bookingStatus: bookings.status,
      paymentStatus: bookings.paymentStatus,
      paymentReviewReason: bookings.paymentReviewReason,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerChannel: customers.channel,
    })
    .from(operationalIncidents)
    .leftJoin(clubs, eq(clubs.id, operationalIncidents.clubId))
    .leftJoin(bookings, eq(bookings.id, operationalIncidents.bookingId))
    .leftJoin(customers, eq(customers.id, operationalIncidents.customerId))
    .orderBy(desc(operationalIncidents.createdAt))
    .limit(limit);

  return rows;
}

export async function auditPaymentOperationalIncidents(limit = 100) {
  const rows = await getDb()
    .select({
      bookingId: bookings.id,
      clubId: bookings.clubId,
      customerId: bookings.customerId,
      paymentId: bookings.mpPaymentId,
      bookingCode: bookings.bookingCode,
      status: bookings.status,
      paymentStatus: bookings.paymentStatus,
      paidAt: bookings.paidAt,
      paymentReviewReason: bookings.paymentReviewReason,
      customerChannel: customers.channel,
    })
    .from(bookings)
    .leftJoin(customers, eq(customers.id, bookings.customerId))
    .where(and(
      eq(bookings.origin, "bot"),
      isNotNull(bookings.mpPaymentId),
      or(
        ne(bookings.status, "confirmado"),
        isNull(bookings.paidAt),
        isNull(bookings.paymentStatus),
        eq(bookings.paymentStatus, "impago"),
        isNotNull(bookings.paymentReviewReason),
      ),
    ))
    .orderBy(desc(bookings.createdAt))
    .limit(limit);

  for (const row of rows) {
    await createOperationalIncident({
      source: "audit",
      type: "payment_inconsistency",
      severity: "critical",
      clubId: row.clubId,
      bookingId: row.bookingId,
      customerId: row.customerId,
      paymentId: row.paymentId,
      message: "Pago del bot requiere revision operativa",
      details: {
        bookingCode: row.bookingCode,
        status: row.status,
        paymentStatus: row.paymentStatus,
        paidAt: row.paidAt?.toISOString?.() ?? null,
        paymentReviewReason: row.paymentReviewReason,
        customerChannel: row.customerChannel,
      },
    });
  }

  return { scanned: rows.length, createdOrExisting: rows.length };
}
