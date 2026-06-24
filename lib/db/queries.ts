import { and, count, desc, eq, isNotNull, sql, lt, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clubs, courts, credits, jobs, subscriptions, transactions, users, bookings, customers, type JobType, type Role } from "@/lib/db/schema";
import { sendPurchaseConfirmationEmail, sendWelcomeEmail } from "@/lib/email/send";
import type { User } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

export async function getUserByAuthId(authUserId: string) {
  return getDb().query.users.findFirst({ where: eq(users.authUserId, authUserId) });
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

export async function ensureUserProfile(authUser: User) {
  const db = getDb();
  const email = authUser.email ?? "";
  const existing = await db.query.users.findFirst({ where: eq(users.authUserId, authUser.id) });
  if (existing) return existing;

  const signupCredits = Number(process.env.FREE_SIGNUP_CREDITS ?? 5);

  const invitedRole = authUser.user_metadata?.invited_role as Role | undefined;
  const invitedVenueName = authUser.user_metadata?.venue_name as string | undefined;
  const invitedClubId = authUser.user_metadata?.club_id as string | undefined;

  const { profile, createdProfile } = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        authUserId: authUser.id,
        email,
        fullName: authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? null,
        role: invitedRole ?? null,
        venueName: invitedVenueName ?? null,
        clubId: invitedClubId ?? null,
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

export async function getAllClubs() {
  const db = getDb();
  const allClubs = await db.select().from(clubs).orderBy(clubs.createdAt);
  const allCourts = await db.select({ clubId: courts.clubId, id: courts.id }).from(courts);
  const allAdmins = await db
    .select({ clubId: users.clubId, email: users.email, role: users.role })
    .from(users)
    .where(isNotNull(users.clubId));

  return allClubs.map((club) => ({
    ...club,
    courtCount: allCourts.filter((c) => c.clubId === club.id).length,
    admins: allAdmins.filter((a) => a.clubId === club.id),
  }));
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
  paymentDeadlineHours?: number;
  mercadopagoAccessToken?: string | null;
}) {
  const db = getDb();
  const [updated] = await db.update(clubs).set(data).where(eq(clubs.id, id)).returning();
  return updated;
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

export async function findOrCreateCustomer(clubId: string, name: string, phone: string) {
  const db = getDb();
  const existing = await db.query.customers.findFirst({
    where: and(eq(customers.clubId, clubId), eq(customers.phone, phone))
  });
  if (existing) return existing;
  const [created] = await db.insert(customers).values({ clubId, name, phone }).returning();
  return created;
}

export async function createBooking(data: {
  clubId: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: "simple" | "clase" | "fijo" | "evento" | "bloqueo";
  status?: "confirmado" | "pendiente" | "cancelado";
  customerId?: string | null;
  professorId?: string | null;
  eventId?: string | null;
  price?: number | null;
  paymentStatus?: "pagado" | "senado" | "impago" | null;
  notes?: string | null;
}) {
  const db = getDb();
  const [booking] = await db.insert(bookings).values({
    clubId: data.clubId,
    courtId: data.courtId,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    type: data.type,
    status: data.status ?? "confirmado",
    customerId: data.customerId ?? null,
    professorId: data.professorId ?? null,
    eventId: data.eventId ?? null,
    price: data.price ?? null,
    paymentStatus: data.paymentStatus ?? null,
    notes: data.notes ?? null,
  }).returning();
  return booking;
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

export async function confirmBookingPayment(bookingId: string) {
  const db = getDb();
  const [updated] = await db
    .update(bookings)
    .set({ status: "confirmado", paymentStatus: "pagado" })
    .where(eq(bookings.id, bookingId))
    .returning();
  return updated;
}

export async function getAvailableSlots(clubId: string, date: string, requestedStart?: string, requestedEnd?: string) {
  const db = getDb();
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) return [];

  const { openingHours } = await import("@/lib/db/schema");
  const dateObj = new Date(date + "T12:00:00");
  const weekday = (dateObj.getDay() + 6) % 7; // Mon=0..Sun=6

  const [hours] = await db.select().from(openingHours).where(
    and(eq(openingHours.clubId, clubId), eq(openingHours.weekday, weekday))
  );
  if (!hours) return [];

  const allCourts = await db.select().from(courts).where(and(eq(courts.clubId, clubId), eq(courts.active, true)));
  const dayBookings = await db.select().from(bookings).where(
    and(eq(bookings.clubId, clubId), eq(bookings.date, date), eq(bookings.status, "confirmado"))
  );

  const [openH, openM] = hours.openTime.split(":").map(Number);
  const [closeH, closeM] = hours.closeTime.split(":").map(Number);
  const slotMin = hours.slotMinutes;

  const slots = [];
  let cur = openH * 60 + openM;
  const end = closeH * 60 + closeM;

  while (cur + slotMin <= end) {
    const slotStart = `${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`;
    const slotEnd = `${String(Math.floor((cur + slotMin) / 60)).padStart(2, "0")}:${String((cur + slotMin) % 60).padStart(2, "0")}`;

    if (requestedStart && requestedEnd) {
      if (slotStart !== requestedStart) { cur += slotMin; continue; }
    }

    const freeCourts = allCourts.filter(c => {
      return !dayBookings.some(b =>
        b.courtId === c.id && b.startTime < slotEnd && b.endTime > slotStart
      );
    });

    slots.push({ start: slotStart, end: slotEnd, freeCourts: freeCourts.map(c => ({ id: c.id, name: c.name })) });
    cur += slotMin;
  }

  return slots;
}

export async function getClubByApiKey(apiKey: string) {
  return getDb().query.clubs.findFirst({ where: eq(clubs.apiKey, apiKey) });
}
