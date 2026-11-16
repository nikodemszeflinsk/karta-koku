import { and, eq, sql } from "drizzle-orm";
import type { SearchHit, SearchType } from "../../shared/knowledge";
import type { Db } from "../db/client";
import { searchIndex } from "../db/search-table";
import { foldText } from "../../shared/text";

export interface IndexEntry {
  type: SearchType;
  id: string;
  /** null = shared content visible to every signed-in user. */
  ownerId: string | null;
  title: string;
  body: string;
}

/** Statements that (re)index one entity. Run them in the same batch as the write. */
export function indexStatements(db: Db, e: IndexEntry) {
  return [
    unindexStatement(db, e.type, e.id),
    db.insert(searchIndex).values({
      entityType: e.type,
      entityId: e.id,
      ownerId: e.ownerId,
      title: e.title,
      body: e.body,
      folded: foldText(`${e.title} ${e.body}`),
    }),
  ] as const;
}

export function unindexStatement(db: Db, type: SearchType, id: string) {
  return db.delete(searchIndex).where(and(eq(searchIndex.entityType, type), eq(searchIndex.entityId, id)));
}

/**
 * Turns free text into a safe FTS5 query: every word becomes a quoted prefix term,
 * so FTS operators typed by the user (AND, NEAR, *, ", :, -) are treated as text.
 */
export function toFtsQuery(input: string): string | null {
  const words = foldText(input)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .slice(0, 8);
  if (words.length === 0) return null;
  return words.map((w) => `"${w}"*`).join(" ");
}

export async function search(db: Db, userId: string, q: string, types: SearchType[], limit = 30): Promise<SearchHit[]> {
  const fts = toFtsQuery(q);
  if (!fts) return [];
  const typeFilter =
    types.length > 0
      ? sql` AND entity_type IN (${sql.join(
          types.map((t) => sql`${t}`),
          sql`, `,
        )})`
      : sql``;
  const rows = await db.all<{ type: SearchType; id: string; title: string; snippet: string }>(sql`
    SELECT entity_type AS type, entity_id AS id, title,
           snippet(search_index, 4, '«', '»', '…', 12) AS snippet
    FROM search_index
    WHERE search_index MATCH ${fts}
      AND (owner_id IS NULL OR owner_id = ${userId})
      ${typeFilter}
    ORDER BY bm25(search_index, 0, 0, 0, 5.0, 1.0, 1.0)
    LIMIT ${limit}
  `);
  return rows;
}
