import { sql } from "drizzle-orm";
import {
  COMPONENT_ROLES,
  CURRENCY_STATUSES,
  INGREDIENT_ASPECTS,
  MENU_KINDS,
  MENU_TIERS,
  NOTE_KINDS,
  NOTE_TARGETS,
  RECIPE_LINE_ROLES,
  SOURCE_TYPES,
  VERIFICATION_STATUSES,
} from "../../shared/knowledge";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

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

// ---------------------------------------------------------------------------
// Stage 2: knowledge base
// ---------------------------------------------------------------------------

const verificationStatus = () =>
  text("status", { enum: VERIFICATION_STATUSES }).notNull().default("needs_verification");


export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: SOURCE_TYPES }).notNull(),
    title: text("title").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    retrievedAt: text("retrieved_at"),
    isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sources_owner_idx").on(t.ownerId)],
);

const sourceRef = () => text("source_id").references(() => sources.id, { onDelete: "set null" });
const userRef = (name: string) => text(name).references(() => users.id, { onDelete: "set null" });

export const ingredients = sqliteTable(
  "ingredients",
  {
    id: text("id").primaryKey(),
    namePl: text("name_pl").notNull(),
    /** foldText(namePl): case- and diacritic-insensitive uniqueness ("Ryż" = "RYZ"). */
    nameKey: text("name_key").notNull(),
    nameOriginal: text("name_original"),
    transliteration: text("transliteration"),
    categoryId: text("category_id").references(() => knowledgeCategories.id, { onDelete: "set null" }),
    origin: text("origin"),
    description: text("description"),
    status: verificationStatus(),
    sourceId: sourceRef(),
    version: integer("version").notNull().default(1),
    createdBy: userRef("created_by"),
    updatedBy: userRef("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("ingredients_name_key_uq").on(t.nameKey),
    index("ingredients_category_idx").on(t.categoryId),
  ],
);


export const ingredientProperties = sqliteTable(
  "ingredient_properties",
  {
    id: text("id").primaryKey(),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    aspect: text("aspect", { enum: INGREDIENT_ASPECTS }).notNull(),
    content: text("content").notNull(),
    status: verificationStatus(),
    sourceId: sourceRef(),
    version: integer("version").notNull().default(1),
    createdBy: userRef("created_by"),
    updatedBy: userRef("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ingredient_properties_ingredient_idx").on(t.ingredientId, t.aspect)],
);

export const ingredientSubstitutes = sqliteTable(
  "ingredient_substitutes",
  {
    id: text("id").primaryKey(),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    substituteId: text("substitute_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    context: text("context"),
    consequences: text("consequences"),
    status: verificationStatus(),
    sourceId: sourceRef(),
    createdBy: userRef("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ingredient_substitutes_uq").on(t.ingredientId, t.substituteId)],
);

/** The 14 allergens of EU Regulation 1169/2011, Annex II. */
export const allergens = sqliteTable("allergens", {
  id: text("id").primaryKey(),
  namePl: text("name_pl").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const ingredientAllergens = sqliteTable(
  "ingredient_allergens",
  {
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    allergenId: text("allergen_id")
      .notNull()
      .references(() => allergens.id),
    status: verificationStatus(),
    sourceId: sourceRef(),
  },
  (t) => [primaryKey({ columns: [t.ingredientId, t.allergenId] })],
);

export const techniques = sqliteTable(
  "techniques",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    categoryId: text("category_id").references(() => knowledgeCategories.id, { onDelete: "set null" }),
    description: text("description"),
    status: verificationStatus(),
    sourceId: sourceRef(),
    version: integer("version").notNull().default(1),
    createdBy: userRef("created_by"),
    updatedBy: userRef("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("techniques_name_key_uq").on(t.nameKey)],
);

// ---- Menu (Karta KOKU) ----

export const menuVersions = sqliteTable("menu_versions", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
  isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  createdBy: userRef("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});


export const menuCategories = sqliteTable(
  "menu_categories",
  {
    id: text("id").primaryKey(),
    menuVersionId: text("menu_version_id")
      .notNull()
      .references(() => menuVersions.id, { onDelete: "cascade" }),
    tier: text("tier", { enum: MENU_TIERS }).notNull(),
    kind: text("kind", { enum: MENU_KINDS }).notNull(),
  },
  (t) => [uniqueIndex("menu_categories_uq").on(t.menuVersionId, t.tier, t.kind)],
);


export const menuItems = sqliteTable(
  "menu_items",
  {
    id: text("id").primaryKey(),
    menuCategoryId: text("menu_category_id")
      .notNull()
      .references(() => menuCategories.id, { onDelete: "cascade" }),
    code: text("code"),
    name: text("name").notNull(),
    description: text("description"),
    technique: text("technique"),
    texture: text("texture"),
    flavor: text("flavor"),
    portion: text("portion"),
    priceGrosze: integer("price_grosze"),
    componentsComplete: integer("components_complete", { mode: "boolean" }).notNull().default(false),
    currencyStatus: text("currency_status", { enum: CURRENCY_STATUSES }).notNull().default("to_check"),
    status: verificationStatus(),
    sourceId: sourceRef(),
    version: integer("version").notNull().default(1),
    createdBy: userRef("created_by"),
    updatedBy: userRef("updated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("menu_items_category_idx").on(t.menuCategoryId)],
);


export const menuItemComponents = sqliteTable(
  "menu_item_components",
  {
    id: text("id").primaryKey(),
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    role: text("role", { enum: COMPONENT_ROLES }).notNull().default("ingredient"),
    ingredientId: text("ingredient_id").references(() => ingredients.id, { onDelete: "set null" }),
    /** Wording exactly as in the source (e.g. "jabłko w tempurze"). */
    label: text("label").notNull(),
    status: verificationStatus(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("menu_item_components_item_idx").on(t.menuItemId), index("menu_item_components_ingredient_idx").on(t.ingredientId)],
);

export const menuItemAllergens = sqliteTable(
  "menu_item_allergens",
  {
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    allergenId: text("allergen_id")
      .notNull()
      .references(() => allergens.id),
    status: verificationStatus(),
    sourceId: sourceRef(),
  },
  (t) => [primaryKey({ columns: [t.menuItemId, t.allergenId] })],
);

// ---- Private recipes ----

export const recipes = sqliteTable(
  "recipes",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    yieldText: text("yield_text"),
    method: text("method"),
    confidential: integer("confidential", { mode: "boolean" }).notNull().default(true),
    status: verificationStatus(),
    sourceId: sourceRef(),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("recipes_owner_idx").on(t.ownerId, t.updatedAt)],
);


export const recipeIngredients = sqliteTable(
  "recipe_ingredients",
  {
    id: text("id").primaryKey(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id").references(() => ingredients.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    amount: real("amount"),
    unit: text("unit"),
    role: text("role", { enum: RECIPE_LINE_ROLES }).notNull().default("base"),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("recipe_ingredients_recipe_idx").on(t.recipeId)],
);

export const recipeComponents = sqliteTable(
  "recipe_components",
  {
    id: text("id").primaryKey(),
    parentRecipeId: text("parent_recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    childRecipeId: text("child_recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    amount: real("amount"),
    unit: text("unit"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("recipe_components_uq").on(t.parentRecipeId, t.childRecipeId)],
);

// ---- Private notebook ----


export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: NOTE_KINDS }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("notes_owner_idx").on(t.ownerId, t.updatedAt)],
);


export const noteLinks = sqliteTable(
  "note_links",
  {
    id: text("id").primaryKey(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    targetType: text("target_type", { enum: NOTE_TARGETS }).notNull(),
    targetId: text("target_id").notNull(),
  },
  (t) => [uniqueIndex("note_links_uq").on(t.noteId, t.targetType, t.targetId), index("note_links_target_idx").on(t.targetType, t.targetId)],
);

// ---- Versioning ----

export const contentRevisions = sqliteTable(
  "content_revisions",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    version: integer("version").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    changedBy: userRef("changed_by"),
    changedAt: createdAt(),
  },
  (t) => [uniqueIndex("content_revisions_uq").on(t.entityType, t.entityId, t.version)],
);
