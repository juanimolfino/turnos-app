import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
// Origen de la reserva: cargada desde el panel del admin, o creada por el bot (Fase 6).
export const bookingOriginEnum = pgEnum("booking_origin", ["admin", "bot"]);
export const notifChannelEnum = pgEnum("notif_channel", ["whatsapp", "email"]);
export const notifKindEnum = pgEnum("notif_kind", ["cancelacion", "recordatorio", "confirmacion"]);
export const notifStatusEnum = pgEnum("notif_status", ["pendiente", "enviado", "error"]);
export const recurringTypeEnum = pgEnum("recurring_type", ["clase", "fijo"]);

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
  paymentDeadlineHours: integer("payment_deadline_hours").default(24).notNull(),
  mercadopagoAccessToken: text("mercadopago_access_token"),
  apiKey: text("api_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
  sortOrder: integer("sort_order").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
});

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  clubId: uuid("club_id").references(() => clubs.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
  transactions: many(transactions)
}));

export const clubRelations = relations(clubs, ({ many }) => ({
  courts: many(courts),
  customers: many(customers),
  professors: many(professors),
  openingHours: many(openingHours),
  events: many(events),
  recurringRules: many(recurringRules),
  bookings: many(bookings),
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

// ── Types ──────────────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobType = typeof jobTypeEnum.enumValues[number];
export type JobStatus = typeof jobStatusEnum.enumValues[number];
export type Role = typeof roleEnum.enumValues[number];
export type Club = typeof clubs.$inferSelect;
export type Court = typeof courts.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingType = typeof bookingTypeEnum.enumValues[number];
export type BookingStatus = typeof bookingStatusEnum.enumValues[number];
export type BookingOrigin = typeof bookingOriginEnum.enumValues[number];
export type Event = typeof events.$inferSelect;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type BotConversation = typeof botConversations.$inferSelect;
