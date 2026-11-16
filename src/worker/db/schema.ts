import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/*
 * Conventions
 * - IDs are TEXT (UUID).
 * - Better Auth tables keep Better Auth's camelCase property names (required by the
 *   Drizzle adapter); SQL column names are snake_case.
 * - Timestamps: integer milliseconds (Drizzle `timestamp_ms`).
 */

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(now);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(now)
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Better Auth (authentication)
// ---------------------------------------------------------------------------

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const passkeys = sqliteTable(
  "passkeys",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    transports: text("transports"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    aaguid: text("aaguid"),
  },
  (t) => [index("passkeys_user_id_idx").on(t.userId), index("passkeys_credential_id_idx").on(t.credentialID)],
);

export const rateLimits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request").notNull(),
});

// ---------------------------------------------------------------------------
// Authorization and organisation
// ---------------------------------------------------------------------------

export const roles = sqliteTable("roles", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  rank: integer("rank").notNull(),
});

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A user's role, either global (location_id IS NULL) or scoped to one location. */
export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    locationId: text("location_id").references(() => locations.id, { onDelete: "cascade" }),
    roleKey: text("role_key")
      .notNull()
      .references(() => roles.key),
    createdAt: createdAt(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("memberships_user_location_uq").on(t.userId, t.locationId),
    uniqueIndex("memberships_user_global_uq").on(t.userId).where(sql`location_id IS NULL`),
    index("memberships_location_idx").on(t.locationId),
  ],
);

export const levels = sqliteTable("levels", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull(),
  /** Minimum mastery score (0–100) every competency of the level must reach. */
  masteryThreshold: integer("mastery_threshold").notNull(),
  /** Minimum number of graded answers per competency before mastery counts. */
  minEvidence: integer("min_evidence").notNull(),
});

export const competencies = sqliteTable(
  "competencies",
  {
    id: text("id").primaryKey(),
    levelId: text("level_id")
      .notNull()
      .references(() => levels.id, { onDelete: "cascade" }),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [index("competencies_level_idx").on(t.levelId)],
);

export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  position: text("position"),
  targetLevelId: text("target_level_id").references(() => levels.id, { onDelete: "set null" }),
  theme: text("theme", { enum: ["system", "light", "dark"] })
    .notNull()
    .default("system"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    roleKey: text("role_key")
      .notNull()
      .references(() => roles.key),
    locationId: text("location_id").references(() => locations.id, { onDelete: "cascade" }),
    /** SHA-256 of the invitation token; the token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    acceptedUserId: text("accepted_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_email_idx").on(t.email)],
);

/** Append-only. Never store confidential content (recipes, prompts) in metadata. */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_actor_idx").on(t.actorId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Knowledge structure (content tables arrive in Stage 2)
// ---------------------------------------------------------------------------

export const knowledgeCategories = sqliteTable(
  "knowledge_categories",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    parentId: text("parent_id").references((): AnySQLiteColumn => knowledgeCategories.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("knowledge_categories_parent_idx").on(t.parentId)],
);
