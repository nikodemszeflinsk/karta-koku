import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Typed handle for the FTS5 virtual table created in migrations/0003.
 * Kept OUT of schema.ts on purpose: drizzle-kit must not try to create it as a
 * normal table. Using a table object (instead of raw SQL) keeps the statements
 * batchable, so content writes and index updates commit atomically.
 */
export const searchIndex = sqliteTable("search_index", {
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  ownerId: text("owner_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  folded: text("folded").notNull(),
});
