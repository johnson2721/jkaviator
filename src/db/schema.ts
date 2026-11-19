import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    passwordHash: text("password_hash").notNull(),
    balance: numeric("balance", { precision: 16, scale: 2 }).notNull().default("0.00"),
    bonusBalance: numeric("bonus_balance", { precision: 16, scale: 2 }).notNull().default("0.00"),
    role: text("role").notNull().default("user"), // user | admin
    status: text("status").notNull().default("pending"), // pending | active | blocked
    currency: text("currency").notNull().default("KES"),
    totalStaked: numeric("total_staked", { precision: 16, scale: 2 }).notNull().default("0.00"),
    totalWon: numeric("total_won", { precision: 16, scale: 2 }).notNull().default("0.00"),
    betsCount: integer("bets_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_phone_idx").on(t.phone), uniqueIndex("users_email_idx").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("sessions_token_hash_idx").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    purpose: text("purpose").notNull(), // register | login | reset
    channel: text("channel").notNull().default("demo"),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("otp_phone_idx").on(t.phone, t.purpose)],
);

export const pendingRegistrations = pgTable("pending_registrations", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rounds = pgTable(
  "rounds",
  {
    id: integer("id").primaryKey(),
    crashPoint: numeric("crash_point", { precision: 12, scale: 2 }).notNull(),
    serverSeed: text("server_seed").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    betsCount: integer("bets_count").notNull().default(0),
    totalStaked: numeric("total_staked", { precision: 16, scale: 2 }).notNull().default("0.00"),
    totalPaid: numeric("total_paid", { precision: 16, scale: 2 }).notNull().default("0.00"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("rounds_started_idx").on(t.startedAt)],
);

export const bets = pgTable(
  "bets",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roundId: integer("round_id").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    autoCashoutAt: numeric("auto_cashout_at", { precision: 10, scale: 2 }),
    autoCashoutEnabled: boolean("auto_cashout_enabled").notNull().default(false),
    currency: text("currency").notNull().default("KES"),
    status: text("status").notNull().default("pending"), // pending | won | lost
    multiplier: numeric("multiplier", { precision: 10, scale: 2 }),
    payout: numeric("payout", { precision: 14, scale: 2 }).notNull().default("0.00"),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [index("bets_user_idx").on(t.userId), index("bets_round_idx").on(t.roundId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // deposit | withdrawal | bet | cashout | bonus | adjustment
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 16, scale: 2 }).notNull().default("0.00"),
    currency: text("currency").notNull().default("KES"),
    status: text("status").notNull().default("completed"), // pending | completed | rejected
    method: text("method"),
    reference: text("reference"),
    note: text("note"),
    gateway: text("gateway"), // PAYHERO | SANDBOX | MANUAL
    gatewayRef: text("gateway_ref"), // provider-side reference / CheckoutRequestID
    details: text("details"), // JSON string with masked payout details for the operator desk
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    reviewedBy: integer("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tx_user_idx").on(t.userId), index("tx_status_idx").on(t.status), index("tx_ref_idx").on(t.reference)],
);

/**
 * Background queue of messages destined for the operator inbox.
 * Rows survive even when no mail transport is configured, so payout details are
 * never lost — the operator console reads straight from this table.
 */
export const operatorAlerts = pgTable(
  "operator_alerts",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    kind: text("kind").notNull(), // payout | deposit | system
    userId: integer("user_id"),
    transactionId: integer("transaction_id"),
    subject: text("subject").notNull(),
    payload: text("payload").notNull(), // JSON string, may contain sensitive payout data
    channel: text("channel"), // smtp | resend | queue
    status: text("status").notNull().default("queued"), // queued | sent | failed
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alerts_status_idx").on(t.status), index("alerts_kind_idx").on(t.kind)],
);

export const bonusRequests = pgTable(
  "bonus_requests",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("promo"), // welcome | deposit | promo
    code: text("code"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    message: text("message"),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    adminNote: text("admin_note"),
    reviewedBy: integer("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bonus_user_idx").on(t.userId), index("bonus_status_idx").on(t.status)],
);

/** One wallet per currency — players can hold and switch between accounts. */
export const wallets = pgTable(
  "wallets",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    currency: text("currency").notNull(),
    balance: numeric("balance", { precision: 16, scale: 2 }).notNull().default("0.00"),
    bonusBalance: numeric("bonus_balance", { precision: 16, scale: 2 }).notNull().default("0.00"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("wallet_user_ccy_idx").on(t.userId, t.currency)],
);

/** Editable site configuration (name, currencies, margins, maintenance…). */
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable(
  "events",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    sport: text("sport").notNull(),
    league: text("league").notNull(),
    country: text("country"),
    home: text("home").notNull(),
    away: text("away").notNull(),
    kickoff: timestamp("kickoff", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("scheduled"), // scheduled | live | finished | cancelled
    minute: integer("minute").notNull().default(0),
    homeScore: integer("home_score").notNull().default(0),
    awayScore: integer("away_score").notNull().default(0),
    htHome: integer("ht_home"),
    htAway: integer("ht_away"),
    markets: jsonb("markets").notNull().default(sql`'[]'::jsonb`),
    featured: boolean("featured").notNull().default(false),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_status_idx").on(t.status), index("events_kickoff_idx").on(t.kickoff), index("events_sport_idx").on(t.sport)],
);

export const sportBets = pgTable(
  "sport_bets",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: integer("event_id"),
    currency: text("currency").notNull(),
    kind: text("kind").notNull().default("single"), // single | accum
    stake: numeric("stake", { precision: 14, scale: 2 }).notNull(),
    totalOdds: numeric("total_odds", { precision: 12, scale: 3 }).notNull(),
    potentialPayout: numeric("potential_payout", { precision: 14, scale: 2 }).notNull(),
    payout: numeric("payout", { precision: 14, scale: 2 }).notNull().default("0.00"),
    status: text("status").notNull().default("pending"), // pending | won | lost | void
    selections: jsonb("selections").notNull().default(sql`'[]'::jsonb`),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [index("sbets_user_idx").on(t.userId), index("sbets_status_idx").on(t.status), index("sbets_event_idx").on(t.eventId)],
);

export const casinoBets = pgTable(
  "casino_bets",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    game: text("game").notNull(),
    currency: text("currency").notNull(),
    stake: numeric("stake", { precision: 14, scale: 2 }).notNull(),
    payout: numeric("payout", { precision: 14, scale: 2 }).notNull().default("0.00"),
    multiplier: numeric("multiplier", { precision: 10, scale: 3 }),
    status: text("status").notNull().default("settled"), // settled | open | lost
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cbets_user_idx").on(t.userId), index("cbets_game_idx").on(t.game)],
);

export type User = typeof users.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type SportEvent = typeof events.$inferSelect;
export type SportBet = typeof sportBets.$inferSelect;
export type CasinoBet = typeof casinoBets.$inferSelect;
export type BonusRequest = typeof bonusRequests.$inferSelect;
