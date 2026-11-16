import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { techniqueInputSchema, techniqueUpdateSchema, type TechniqueRow } from "../../../shared/knowledge";
import { foldText } from "../../../shared/text";
import type { Db } from "../../db/client";
import { knowledgeCategories, techniques } from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { HttpError } from "../../lib/errors";
import { checkProvenance, loadSources, notFound, requireEditor, resolveCategoryId, revisionInsert, versionConflict } from "../../lib/knowledge";
import { indexStatements, unindexStatement } from "../../lib/search";
import { validationHook } from "../../lib/validation";
import { requireAuth } from "../../middleware/session";
import type { AppEnv } from "../../types";

async function listTechniques(db: Db, id?: string): Promise<TechniqueRow[]> {
  const rows = await db
    .select({
      id: techniques.id,
      name: techniques.name,
      categorySlug: knowledgeCategories.slug,
      categoryName: knowledgeCategories.name,
      description: techniques.description,
      status: techniques.status,
      sourceId: techniques.sourceId,
      version: techniques.version,
    })
    .from(techniques)
    .leftJoin(knowledgeCategories, eq(knowledgeCategories.id, techniques.categoryId))
    .where(id ? eq(techniques.id, id) : undefined)
    .orderBy(sql`lower(${techniques.name})`);
  const srcs = await loadSources(db, rows.map((r) => r.sourceId));
  return rows.map(({ sourceId, ...r }) => ({ ...r, source: sourceId ? (srcs.get(sourceId) ?? null) : null }));
}

function techniqueIndex(db: Db, t: { id: string; name: string; description: string | null }) {
  return indexStatements(db, { type: "technique", id: t.id, ownerId: null, title: t.name, body: t.description ?? "" });
}

const duplicate = () => new HttpError(409, "duplicate", "Technika o tej nazwie już istnieje.", { name: "Taka nazwa już istnieje" });
const isUnique = (e: unknown) => String(e instanceof Error ? `${e.message} ${String(e.cause ?? "")}` : e).includes("UNIQUE constraint failed");

export const techniqueRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", async (c) => c.json({ techniques: await listTechniques(c.var.db) }))
  .get("/:id", async (c) => {
    const [t] = await listTechniques(c.var.db, c.req.param("id"));
    if (!t) notFound("Nie znaleziono techniki.");
    return c.json(t);
  })
  .post("/", requireEditor, zValidator("json", techniqueInputSchema, validationHook), async (c) => {
    const { categorySlug, ...input } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    await checkProvenance(db, user.id, input.status, input.sourceId);
    const categoryId = await resolveCategoryId(db, categorySlug);
    const id = crypto.randomUUID();
    try {
      await db.batch([
        db.insert(techniques).values({ id, ...input, nameKey: foldText(input.name), categoryId: categoryId ?? null, createdBy: user.id, updatedBy: user.id }),
        ...techniqueIndex(db, { id, name: input.name, description: input.description ?? null }),
      ]);
    } catch (e) {
      if (isUnique(e)) throw duplicate();
      throw e;
    }
    return c.json({ id }, 201);
  })
  .patch("/:id", requireEditor, zValidator("json", techniqueUpdateSchema, validationHook), async (c) => {
    const { expectedVersion, categorySlug, ...input } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const [old] = await db.select().from(techniques).where(eq(techniques.id, c.req.param("id")));
    if (!old) notFound("Nie znaleziono techniki.");
    if (old.version !== expectedVersion) versionConflict();
    await checkProvenance(db, user.id, input.status ?? old.status, input.sourceId === undefined ? old.sourceId : input.sourceId);
    const categoryId = await resolveCategoryId(db, categorySlug);
    const next = { ...old, ...input };
    try {
      const [, updated] = await db.batch([
        revisionInsert(db, "technique", old.id, old.version, old, user.id),
        db
          .update(techniques)
          .set({
            ...input,
            ...(input.name !== undefined && { nameKey: foldText(input.name) }),
            ...(categoryId !== undefined && { categoryId }),
            version: old.version + 1,
            updatedBy: user.id,
            updatedAt: new Date(),
          })
          .where(and(eq(techniques.id, old.id), eq(techniques.version, expectedVersion)))
          .returning({ id: techniques.id }),
        ...techniqueIndex(db, next),
      ]);
      if (updated.length === 0) versionConflict();
    } catch (e) {
      if (isUnique(e)) throw duplicate();
      throw e;
    }
    return c.json({ ok: true });
  })
  .delete("/:id", requireEditor, async (c) => {
    const db = c.var.db;
    const [old] = await db.select().from(techniques).where(eq(techniques.id, c.req.param("id")));
    if (!old) notFound("Nie znaleziono techniki.");
    await db.batch([
      revisionInsert(db, "technique", old.id, old.version, { ...old, deleted: true }, c.var.user!.id),
      db.delete(techniques).where(eq(techniques.id, old.id)),
      unindexStatement(db, "technique", old.id),
    ]);
    await writeAudit(db, { actorId: c.var.user!.id, action: "technique.deleted", entityType: "technique", entityId: old.id, metadata: { name: old.name } });
    return c.json({ ok: true });
  });
