import { and, eq, inArray, or } from "drizzle-orm";
import { CONFIRMING_SOURCE_TYPES, type SourceSummary, type VerificationStatus } from "../../shared/knowledge";
import type { Db } from "../db/client";
import { contentRevisions, knowledgeCategories, sources } from "../db/schema";
import { requireRole } from "../middleware/session";
import { HttpError } from "./errors";

/** Shared knowledge (ingredients, techniques, menu, sources) is edited by owner/admin/trainer. */
export const requireEditor = requireRole("admin", "trainer");

export function notFound(what = "Nie znaleziono."): never {
  throw new HttpError(404, "not_found", what);
}

export function versionConflict(): never {
  throw new HttpError(409, "version_conflict", "Ktoś zmienił ten wpis w międzyczasie. Odśwież i spróbuj ponownie.");
}

export function validation(field: string, message: string): never {
  throw new HttpError(400, "validation_error", "Nieprawidłowe dane.", { [field]: message });
}

/** Visible = public, or private but owned by the user. */
export function sourceVisibleTo(userId: string) {
  return or(eq(sources.isPrivate, false), eq(sources.ownerId, userId));
}

/**
 * Enforces the data-reliability rules:
 * - a referenced source must exist and be visible to the user;
 * - "confirmed" requires a user/official material source (never an AI draft).
 */
export async function checkProvenance(
  db: Db,
  userId: string,
  status: VerificationStatus | undefined,
  sourceId: string | null | undefined,
): Promise<void> {
  let sourceType: string | null = null;
  if (sourceId) {
    const [src] = await db
      .select({ type: sources.type })
      .from(sources)
      .where(and(eq(sources.id, sourceId), sourceVisibleTo(userId)));
    if (!src) validation("sourceId", "Nieznane źródło");
    sourceType = src.type;
  }
  if (status === "confirmed" && !(sourceType && (CONFIRMING_SOURCE_TYPES as readonly string[]).includes(sourceType))) {
    validation("status", "Status „potwierdzone” wymaga źródła: materiał użytkownika lub oficjalny");
  }
}

export async function resolveCategoryId(db: Db, slug: string | null | undefined): Promise<string | null | undefined> {
  if (slug === undefined) return undefined;
  if (slug === null || slug === "") return null;
  const [c] = await db.select({ id: knowledgeCategories.id }).from(knowledgeCategories).where(eq(knowledgeCategories.slug, slug));
  if (!c) validation("categorySlug", "Nieznana kategoria");
  return c.id;
}

export async function loadSources(db: Db, ids: (string | null | undefined)[]): Promise<Map<string, SourceSummary>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (unique.length === 0) return new Map();
  const rows = await db.select({ id: sources.id, type: sources.type, title: sources.title }).from(sources).where(inArray(sources.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

export function revisionInsert(
  db: Db,
  entityType: string,
  entityId: string,
  version: number,
  snapshot: Record<string, unknown>,
  userId: string,
) {
  return db.insert(contentRevisions).values({
    id: crypto.randomUUID(),
    entityType,
    entityId,
    version,
    snapshot: JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>,
    changedBy: userId,
  });
}

export function iso(d: Date | null | undefined): string {
  return d ? d.toISOString() : "";
}

