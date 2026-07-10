import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

// ── Legacy SaaS enums ──────────────────────────────────────────────────────────
export const jobStatusEnum = pgEnum("job_status", ["pending", "processing", "done", "failed"]);
export const jobTypeEnum = pgEnum("job_type", ["image", "tts"]);
export const transactionTypeEnum = pgEnum("transaction_type", [
  "credit_purchase",
  "subscription_payment",
  "credit_spend",
  "credit_refund",
  "signup_bonus"
]);
export const roleEnum = pgEnum("role", ["superadmin", "admin"]);

// ── Cancha enums ───────────────────────────────────────────────────────────────
export const bookingTypeEnum = pgEnum("booking_type", ["simple", "clase", "fijo", "evento", "americano", "torneo", "bloqueo"]);
export const bookingStatusEnum = pgEnum("booking_status", ["confirmado", "cancelado", "pendiente"]);
export const eventKindEnum = pgEnum("event_kind", ["americano", "torneo", "clinica"]);
export const eventStatusEnum = pgEnum("event_status", ["inscripcion_abierta", "programado", "finalizado", "cancelado"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pagado", "senado", "impago"]);
export const paymentModeEnum = pgEnum("payment_mode", ["none", "partial", "full"]);
// Origen de la reserva: cargada desde el panel del admin, o creada por el bot (Fase 6).
export const bookingOriginEnum = pgEnum("booking_origin", ["admin", "bot"]);
export const notifChannelEnum = pgEnum("notif_channel", ["whatsapp", "email"]);
export const notifKindEnum = pgEnum("notif_kind", ["cancelacion", "recordatorio", "confirmacion"]);
export const notifStatusEnum = pgEnum("notif_status", ["pendiente", "enviado", "error"]);
export const recurringTypeEnum = pgEnum("recurring_type", ["clase", "fijo"]);
// Avisos IN-APP para el admin (campana del panel). Distinto de `notifications`,
// que son avisos salientes a clientes por whatsapp/email. Hoy solo "nueva_reserva"
// del bot; pensado para sumar tipos (cancelación, etc.) sin rehacer el modelo.
export const adminNotificationKindEnum = pgEnum("admin_notification_kind", ["nueva_reserva"]);

// ── Cancha core tables ─────────────────────────────────────────────────────────
export const clubs = pgTable("clubs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").default("America/Argentina/Buenos_Aires").notNull(),
  plan: text("plan").default("club").notNull(),
  address: text("address"),
  city: text("city"),
  neighborhood: text("neighborhood"),
  phone: text("phone"),
  requiresPayment: boolean("requires_payment").default(false).notNull(),
  paymentMode: paymentModeEnum("payment_mode").default("none").notNull(),
  depositPct: integer("deposit_pct").default(25).notNull(),
  refundEnabled: boolean("refund_enabled").default(false).notNull(),
  refundCutoffHours: integer("refund_cutoff_hours").default(24).notNull(),
  paymentDeadlineHours: integer("payment_deadline_hours").default(24).notNull(),
  apiKey: text("api_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  depositPctRange: check("clubs_deposit_pct_range", sql`${table.depositPct} >= 1 AND ${table.depositPct} <= 100`),
  refundCutoffHoursRange: check("clubs_refund_cutoff_hours_range", sql`${table.refundCutoffHours} >= 1 AND ${table.refundCutoffHours} <= 720`),
}));

export const clubMercadoPagoCredentials = pgTable("club_mercadopago_credentials", {
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).primaryKey(),
  mercadoPagoUserId: text("mercadopago_user_id"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  publicKey: text("public_key"),
  scope: text("scope"),
  liveMode: boolean("live_mode"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sports = pgTable("sports", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const courts = pgTable("courts", {
  id: uuid("id").defaultRandom().primaryKey(),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
  sportId: uuid("sport_id").references(() => sports.id).notNull(),
  name: text("name").notNull(),
  surface: text("surface"),
  price: integer("price").default(0).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
}, (table) => ({
  priceNonNegative: check("courts_price_non_negative", sql`${table.price} >= 0`),
}));

export const playerIdentities = pgTable("player_identities", {
  id: uuid("id").defaultRandom().primaryKey(),
  channel: text("channel").notNull(),
  channelUserId: text("channel_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  channelIdentityUnique: uniqueIndex("player_identities_channel_identity_unique")
    .on(table.channel, table.channelUserId),
}));

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
  playerIdentityId: uuid("player_identity_id").references(() => playerIdentities.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  channel: text("channel"),
  channelUserId: text("channel_user_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  playerIdentityIdx: index("customers_player_identity_id_idx").on(table.playerIdentityId),
  botIdentityUnique: uniqueIndex("customers_bot_identity_unique")
    .on(table.clubId, table.channel, table.channelUserId)
    .where(sql`${table.channel} IS NOT NULL AND ${table.channelUserId} IS NOT NULL`),
}));

export const professors = pgTable("professors", {
  id: uuid("id").defaultRandom().primaryKey(),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  active: boolean("active").default(true).notNull(),
});

export const openingHours = pgTable("opening_hours", {
  id: uuid("id").defaultRandom().primaryKey(),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
  weekday: integer("weekday").notNull(),
  openTime: text("open_time").notNull(),
  closeTime: text("close_time").notNull(),
  slotMinutes: integer("slot_minutes").default(90).notNull(),
});

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  kind: eventKindEnum("kind").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  courtIds: text("court_ids").array().notNull().default(sql`'{}'::text[]`),
  category: text("category"),
  pricePerPlayer: integer("price_per_player"),
  capacity: integer("capacity").default(16).notNull(),
  registeredCount: integer("registered_count").default(0).notNull(),
  status: eventStatusEnum("status").default("programado").notNull(),
  signupLink: text("signup_link"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recurringRules = pgTable("recurring_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
  type: recurringTypeEnum("type").notNull(),
  courtId: uuid("court_id").references(() => courts.id),
  customerId: uuid("customer_id").references(() => customers.id),
  professorId: uuid("professor_id").references(() => professors.id),
  weekday: integer("weekday").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  validFrom: text("valid_from").notNull(),
  validUntil: text("valid_until"),
  active: boolean("active").default(true).notNull(),
  notes: text("notes"),
});

export const bookings = pgTable("bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
  courtId: uuid("court_id").references(() => courts.id).notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  type: bookingTypeEnum("type").notNull(),
  status: bookingStatusEnum("status").default("confirmado").notNull(),
  // Quién originó la reserva. 'admin' = panel; 'bot' = creada por el bot (Fase 6).
  origin: bookingOriginEnum("origin").default("admin").notNull(),
  customerId: uuid("customer_id").references(() => customers.id),
  professorId: uuid("professor_id").references(() => professors.id),
  eventId: uuid("event_id").references(() => events.id),
  recurringRuleId: uuid("recurring_rule_id").references(() => recurringRules.id),
  // Agrupa bloques creados juntos (multi-cancha / repetidos por semana) para poder
  // editar o desbloquear todo el grupo de una.
  blockGroupId: uuid("block_group_id"),
  price: integer("price"),
  paymentStatus: paymentStatusEnum("payment_status"),
  heldUntil: timestamp("held_until", { withTimezone: true }),
  mpPreferenceId: text("mp_preference_id"),
  mpPaymentId: text("mp_payment_id").unique(),
  mpRefundId: text("mp_refund_id").unique(),
  refundStatus: text("refund_status"),
  paymentReviewReason: text("payment_review_reason"),
  // Trazabilidad de dinero: cuándo se acreditó el pago y cuándo se procesó el
  // refund (para responder quejas), y el monto real cobrado que devolvió MP
  // (transaction_amount). Nullable: reservas sin pago no los usan.
  paidAt: timestamp("paid_at", { withTimezone: true }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  paidAmount: integer("paid_amount"),
  notes: text("notes"),
  // Reservas del bot (sin login): nombre/teléfono se guardan en el propio booking
  // (la tabla customers global queda para una etapa posterior). Nullable porque
  // las reservas del admin pueden no tenerlos.
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  // Código tipo aerolínea (3 letras + 3 números) para que el cliente cancele.
  // Único en la tabla (ver constraint en migración).
  bookingCode: text("booking_code").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
  customerId: uuid("customer_id").references(() => customers.id).notNull(),
  bookingId: uuid("booking_id").references(() => bookings.id),
  channel: notifChannelEnum("channel").notNull(),
  kind: notifKindEnum("kind").notNull(),
  status: notifStatusEnum("status").default("pendiente").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

// Campana del panel: un aviso in-app por cada reserva del bot que se confirma.
// Se lee siempre server-side (Drizzle/owner, bypassea RLS); la data "de quién y
// cuándo" se joinea desde `bookings` al leer, no se duplica acá.
export const adminNotifications = pgTable("admin_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
  bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }).notNull(),
  kind: adminNotificationKindEnum("kind").default("nueva_reserva").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, (table) => ({
  clubCreatedIdx: index("admin_notifications_club_created_idx").on(table.clubId, table.createdAt),
  // Idempotencia: una sola notificación por (reserva, tipo). Si el webhook de MP
  // reintenta o el flujo corre dos veces, el insert cae en onConflictDoNothing.
  bookingKindUnique: uniqueIndex("admin_notifications_booking_kind_unique").on(table.bookingId, table.kind),
}));

// ── Legacy SaaS tables ─────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  authUserId: uuid("auth_user_id").notNull().unique(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  role: roleEnum("role"),
  venueName: text("venue_name"),
  clubId: uuid("club_id").references(() => clubs.id),
  stripeCustomerId: text("stripe_customer_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const adminInvitations = pgTable("admin_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  role: roleEnum("role").notNull(),
  venueName: text("venue_name"),
  tokenHash: text("token_hash").notNull().unique(),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("admin_invitations_email_idx").on(table.email),
  pendingEmailIdx: index("admin_invitations_pending_email_idx")
    .on(table.email)
    .where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
}));

export const credits = pgTable("credits", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  balance: integer("balance").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  plan: text("plan").default("free").notNull(),
  status: text("status").default("inactive").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: jobTypeEnum("type").notNull(),
  status: jobStatusEnum("status").default("pending").notNull(),
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  resultUrl: text("result_url"),
  error: text("error"),
  creditsUsed: integer("credits_used").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: transactionTypeEnum("type").notNull(),
  credits: integer("credits").notNull(),
  amountCents: integer("amount_cents"),
  stripeEventId: text("stripe_event_id").unique(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

// ── Bot: memoria de conversación ─────────────────────────────────────────────────
// Una fila por hilo. conversation_key = `${channel}:${userId}` (ej. "telegram:12345"),
// así Telegram y el futuro WhatsApp no se mezclan.
export const botConversations = pgTable("bot_conversations", {
  conversationKey: text("conversation_key").primaryKey(),
  messages: jsonb("messages")
    .$type<{ role: "user" | "assistant"; content: string }[]>()
    .default(sql`'[]'::jsonb`)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// ── Relations ──────────────────────────────────────────────────────────────────
export const userRelations = relations(users, ({ one, many }) => ({
  club: one(clubs, { fields: [users.clubId], references: [clubs.id] }),
  credits: one(credits),
  jobs: many(jobs),
  subscriptions: many(subscriptions),
  transactions: many(transactions),
  sentInvitations: many(adminInvitations),
}));

export const adminInvitationRelations = relations(adminInvitations, ({ one }) => ({
  invitedBy: one(users, { fields: [adminInvitations.invitedByUserId], references: [users.id] }),
}));

export const clubRelations = relations(clubs, ({ one, many }) => ({
  courts: many(courts),
  customers: many(customers),
  professors: many(professors),
  openingHours: many(openingHours),
  events: many(events),
  recurringRules: many(recurringRules),
  bookings: many(bookings),
  mercadoPagoCredentials: one(clubMercadoPagoCredentials, {
    fields: [clubs.id],
    references: [clubMercadoPagoCredentials.clubId],
  }),
}));

export const playerIdentityRelations = relations(playerIdentities, ({ many }) => ({
  customers: many(customers),
}));

export const clubMercadoPagoCredentialsRelations = relations(clubMercadoPagoCredentials, ({ one }) => ({
  club: one(clubs, { fields: [clubMercadoPagoCredentials.clubId], references: [clubs.id] }),
}));

export const courtRelations = relations(courts, ({ one, many }) => ({
  club: one(clubs, { fields: [courts.clubId], references: [clubs.id] }),
  sport: one(sports, { fields: [courts.sportId], references: [sports.id] }),
  bookings: many(bookings),
  recurringRules: many(recurringRules),
}));

export const bookingRelations = relations(bookings, ({ one }) => ({
  club: one(clubs, { fields: [bookings.clubId], references: [clubs.id] }),
  court: one(courts, { fields: [bookings.courtId], references: [courts.id] }),
  customer: one(customers, { fields: [bookings.customerId], references: [customers.id] }),
  professor: one(professors, { fields: [bookings.professorId], references: [professors.id] }),
  event: one(events, { fields: [bookings.eventId], references: [events.id] }),
  recurringRule: one(recurringRules, { fields: [bookings.recurringRuleId], references: [recurringRules.id] }),
}));

export const customerRelations = relations(customers, ({ one, many }) => ({
  club: one(clubs, { fields: [customers.clubId], references: [clubs.id] }),
  playerIdentity: one(playerIdentities, { fields: [customers.playerIdentityId], references: [playerIdentities.id] }),
  bookings: many(bookings),
  recurringRules: many(recurringRules),
  notifications: many(notifications),
}));

export const adminNotificationRelations = relations(adminNotifications, ({ one }) => ({
  club: one(clubs, { fields: [adminNotifications.clubId], references: [clubs.id] }),
  booking: one(bookings, { fields: [adminNotifications.bookingId], references: [bookings.id] }),
}));

// ── Types ──────────────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type AdminInvitation = typeof adminInvitations.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobType = typeof jobTypeEnum.enumValues[number];
export type JobStatus = typeof jobStatusEnum.enumValues[number];
export type Role = typeof roleEnum.enumValues[number];
export type Club = typeof clubs.$inferSelect;
export type ClubMercadoPagoCredentials = typeof clubMercadoPagoCredentials.$inferSelect;
export type Court = typeof courts.$inferSelect;
export type PlayerIdentity = typeof playerIdentities.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingType = typeof bookingTypeEnum.enumValues[number];
export type BookingStatus = typeof bookingStatusEnum.enumValues[number];
export type BookingOrigin = typeof bookingOriginEnum.enumValues[number];
export type PaymentMode = typeof paymentModeEnum.enumValues[number];
export type Event = typeof events.$inferSelect;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type BotConversation = typeof botConversations.$inferSelect;
export type AdminNotification = typeof adminNotifications.$inferSelect;
export type AdminNotificationKind = typeof adminNotificationKindEnum.enumValues[number];
