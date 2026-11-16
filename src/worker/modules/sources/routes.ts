import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { sourceInputSchema, type SourceRow } from "../../../shared/knowledge";
import { sources } from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { HttpError } from "../../lib/errors";
import { notFound, sourceVisibleTo } from "../../lib/knowledge";
import { indexStatements, unindexStatement } from "../../lib/search";
import { validationHook } from "../../lib/validation";
import { requireAuth } from "../../middleware/session";
import type { AppEnv } from "../../types";

/** Tables that may reference a source (used for "in use" checks). */
const SOURCE_USAGE_SQL = sql`(
  (SELECT count(*) FROM ingredients WHERE source_id = "sources"."id") +
  (SELECT count(*) FROM ingredient_properties WHERE source_id = "sources"."id") +
  (SELECT count(*) FROM ingredient_substitutes WHERE source_id = "sources"."id") +
  (SELECT count(*) FROM ingredient_allergens WHERE source_id = "sources"."id") +
  (SELECT count(*) FROM techniques WHERE source_id = "sources"."id") +
  (SELECT count(*) FROM menu_items WHERE source_id = "sources"."id") +
  (SELECT count(*) FROM menu_item_allergens WHERE source_id = "sources"."id") +
  (SELECT count(*) FROM recipes WHERE source_id = "sources"."id")
)`;

export const sourceRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", async (c) => {
    const userId = c.var.user!.id;
    const rows = await c.var.db
      .select({
        id: sources.id,
        type: sources.type,
        title: sources.title,
        reference: sources.reference,
        notes: sources.notes,
        retrievedAt: sources.retrievedAt,
        isPrivate: sources.isPrivate,
        ownerId: sources.ownerId,
        usageCount: sql<number>`${SOURCE_USAGE_SQL}`,
      })
      .from(sources)
      .where(sourceVisibleTo(userId))
      .orderBy(asc(sources.title));
    const out: SourceRow[] = rows.map(({ ownerId, ...r }) => ({ ...r, isMine: ownerId === userId }));
    return c.json({ sources: out });
  })
  .post("/", zValidator("json", sourceInputSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const user = c.var.user!;
    // Only editors may create shared sources; anyone may create private ones.
    const isEditor = c.var.globalRoles.some((r) => r === "owner" || r === "admin" || r === "trainer");
    if (!input.isPrivate && !isEditor) {
      throw new HttpError(403, "forbidden", "Możesz dodawać tylko prywatne źródła.");
    }
    const id = crypto.randomUUID();
    const db = c.var.db;
    await db.batch([
      db.insert(sources).values({ id, ...input, ownerId: user.id }),
      ...indexStatements(db, {
        type: "source",
        id,
        ownerId: input.isPrivate ? user.id : null,
        title: input.title,
        body: [input.reference, input.notes].filter(Boolean).join(" "),
      }),
    ]);
    return c.json({ id }, 201);
  })
  .patch("/:id", zValidator("json", sourceInputSchema.partial(), validationHook), async (c) => {
    const input = c.req.valid("json");
    const user = c.var.user!;
    const db = c.var.db;
    const [src] = await db.select().from(sources).where(and(eq(sources.id, c.req.param("id")), sourceVisibleTo(user.id)));
    if (!src) notFound("Nie znaleziono źródła.");
    const isOwnerRole = c.var.globalRoles.includes("owner") || c.var.globalRoles.includes("admin");
    if (src.ownerId !== user.id && !isOwnerRole) throw new HttpError(403, "forbidden", "Możesz edytować tylko własne źródła.");
    const next = { ...src, ...input };
    await db.batch([
      db.update(sources).set({ ...input, updatedAt: new Date() }).where(eq(sources.id, src.id)),
      ...indexStatements(db, {
        type: "source",
        id: src.id,
        ownerId: next.isPrivate ? next.ownerId : null,
        title: next.title,
        body: [next.reference, next.notes].filter(Boolean).join(" "),
      }),
    ]);
    return c.json({ ok: true });
  })
  .delete("/:id", async (c) => {
    const user = c.var.user!;
    const db = c.var.db;
    const [src] = await db
      .select({ id: sources.id, ownerId: sources.ownerId, title: sources.title, usage: sql<number>`${SOURCE_USAGE_SQL}` })
      .from(sources)
      .where(and(eq(sources.id, c.req.param("id")), sourceVisibleTo(user.id)));
    if (!src) notFound("Nie znaleziono źródła.");
    const isOwnerRole = c.var.globalRoles.includes("owner") || c.var.globalRoles.includes("admin");
    if (src.ownerId !== user.id && !isOwnerRole) throw new HttpError(403, "forbidden", "Możesz usuwać tylko własne źródła.");
    if (src.usage > 0) {
      throw new HttpError(409, "in_use", `Źródło jest używane w ${src.usage} wpisach. Najpierw zmień je w tych wpisach.`);
    }
    await db.batch([db.delete(sources).where(eq(sources.id, src.id)), unindexStatement(db, "source", src.id)]);
    await writeAudit(db, { actorId: user.id, action: "source.deleted", entityType: "source", entityId: src.id, metadata: { title: src.title } });
    return c.json({ ok: true });
  });
