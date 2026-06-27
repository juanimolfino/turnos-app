import { and, count, desc, eq, isNotNull, sql, lt, gt, gte, lte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clubs, courts, sports, professors, credits, jobs, subscriptions, transactions, users, bookings, customers, type JobType, type Role } from "@/lib/db/schema";
import { sendPurchaseConfirmationEmail, sendWelcomeEmail } from "@/lib/email/send";
import type { User } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "crypto";

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
    endTime: data.endTime,
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
  }).from(bookings).where(and(
    eq(bookings.clubId, clubId),
    gte(bookings.date, startDate),
    lte(bookings.date, endDate),
  ));

  const profIds = [...new Set(rows.map((r) => r.professorId).filter(Boolean))] as string[];
  const custIds = [...new Set(rows.map((r) => r.customerId).filter(Boolean))] as string[];
  const profMap: Record<string, string> = {};
  const custMap: Record<string, string> = {};
  if (profIds.length) {
    const ps = await db.select({ id: professors.id, name: professors.name }).from(professors).where(inArray(professors.id, profIds));
    ps.forEach((p) => { profMap[p.id] = p.name; });
  }
  if (custIds.length) {
    const cs = await db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, custIds));
    cs.forEach((c) => { custMap[c.id] = c.name; });
  }

  return rows
    .filter((r) => r.status !== "cancelado")
    .map((r) => ({
      id: r.id, courtId: r.courtId, date: r.date,
      startTime: r.startTime, endTime: r.endTime, type: r.type,
      blockGroupId: r.blockGroupId, notes: r.notes,
      label: r.professorId ? profMap[r.professorId] ?? null : r.customerId ? custMap[r.customerId] ?? null : null,
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

  for (const courtId of input.courtIds) {
    for (const date of input.dates) {
      // Borrar bloques superpuestos (nunca reservas "simple": esas se protegen)
      await db.delete(bookings).where(and(
        eq(bookings.clubId, input.clubId),
        eq(bookings.courtId, courtId),
        eq(bookings.date, date),
        inArray(bookings.type, OVERLAP_REPLACE_TYPES as unknown as BlockType[]),
        lt(bookings.startTime, input.endTime),
        gt(bookings.endTime, input.startTime),
      ));

      await db.insert(bookings).values({
        clubId: input.clubId,
        courtId,
        date,
        startTime: input.startTime,
        endTime: input.endTime,
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

export async function confirmBookingPayment(bookingId: string) {
  const db = getDb();
  const [updated] = await db
    .update(bookings)
    .set({ status: "confirmado", paymentStatus: "pagado" })
    .where(eq(bookings.id, bookingId))
    .returning();
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
