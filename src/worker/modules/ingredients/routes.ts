import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  allergenSetSchema,
  ingredientInputSchema,
  ingredientUpdateSchema,
  propertyInputSchema,
  propertyUpdateSchema,
  substituteInputSchema,
  VERIFICATION_STATUSES,
  type IngredientDetail,
  type IngredientListItem,
  type Revision,
} from "../../../shared/knowledge";
import { foldText } from "../../../shared/text";
import type { Db } from "../../db/client";
import {
  allergens,
  contentRevisions,
  ingredientAllergens,
  ingredientProperties,
  ingredients,
  ingredientSubstitutes,
  knowledgeCategories,
  menuCategories,
  menuItemComponents,
  menuItems,
} from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { HttpError } from "../../lib/errors";
import { checkProvenance, iso, loadSources, notFound, requireEditor, resolveCategoryId, revisionInsert, validation, versionConflict } from "../../lib/knowledge";
import { indexStatements, unindexStatement } from "../../lib/search";
import { validationHook } from "../../lib/validation";
import { requireAuth } from "../../middleware/session";
import type { AppEnv } from "../../types";

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(60).optional(),
  status: z.enum(VERIFICATION_STATUSES).optional(),
});

function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? "")}` : String(e);
  return msg.includes("UNIQUE constraint failed");
}

async function getIngredient(db: Db, id: string) {
  const [row] = await db.select().from(ingredients).where(eq(ingredients.id, id));
  if (!row) notFound("Nie znaleziono składnika.");
  return row;
}

/** Rebuilds the search entry from the current DB state. */
async function reindexIngredient(db: Db, id: string) {
  const [row] = await db.select().from(ingredients).where(eq(ingredients.id, id));
  if (!row) return;
  const props = await db.select({ content: ingredientProperties.content }).from(ingredientProperties).where(eq(ingredientProperties.ingredientId, id));
  await db.batch(
    indexStatements(db, {
      type: "ingredient",
      id,
      ownerId: null,
      title: row.namePl,
      body: [row.nameOriginal, row.transliteration, row.origin, row.description, ...props.map((p) => p.content)].filter(Boolean).join("\n"),
    }),
  );
}

async function buildDetail(db: Db, id: string): Promise<IngredientDetail> {
  const row = await getIngredient(db, id);
  const [cat] = row.categoryId
    ? await db.select({ slug: knowledgeCategories.slug, name: knowledgeCategories.name }).from(knowledgeCategories).where(eq(knowledgeCategories.id, row.categoryId))
    : [];
  const [props, algs, subs, used] = await Promise.all([
    db.select().from(ingredientProperties).where(eq(ingredientProperties.ingredientId, id)).orderBy(asc(ingredientProperties.aspect), asc(ingredientProperties.createdAt)),
    db
      .select({ allergenId: ingredientAllergens.allergenId, name: allergens.namePl, status: ingredientAllergens.status, sourceId: ingredientAllergens.sourceId })
      .from(ingredientAllergens)
      .innerJoin(allergens, eq(allergens.id, ingredientAllergens.allergenId))
      .where(eq(ingredientAllergens.ingredientId, id))
      .orderBy(asc(allergens.sortOrder)),
    db
      .select({
        id: ingredientSubstitutes.id,
        substituteId: ingredientSubstitutes.substituteId,
        substituteName: ingredients.namePl,
        context: ingredientSubstitutes.context,
        consequences: ingredientSubstitutes.consequences,
        status: ingredientSubstitutes.status,
        sourceId: ingredientSubstitutes.sourceId,
      })
      .from(ingredientSubstitutes)
      .innerJoin(ingredients, eq(ingredients.id, ingredientSubstitutes.substituteId))
      .where(eq(ingredientSubstitutes.ingredientId, id)),
    db
      .selectDistinct({ menuItemId: menuItems.id, name: menuItems.name, tier: menuCategories.tier })
      .from(menuItemComponents)
      .innerJoin(menuItems, eq(menuItems.id, menuItemComponents.menuItemId))
      .innerJoin(menuCategories, eq(menuCategories.id, menuItems.menuCategoryId))
      .where(eq(menuItemComponents.ingredientId, id)),
  ]);
  const srcs = await loadSources(db, [row.sourceId, ...props.map((p) => p.sourceId), ...algs.map((a) => a.sourceId), ...subs.map((s) => s.sourceId)]);
  const src = (sid: string | null) => (sid ? (srcs.get(sid) ?? null) : null);
  return {
    id: row.id,
    namePl: row.namePl,
    nameOriginal: row.nameOriginal,
    transliteration: row.transliteration,
    categorySlug: cat?.slug ?? null,
    categoryName: cat?.name ?? null,
    origin: row.origin,
    description: row.description,
    status: row.status,
    source: src(row.sourceId),
    version: row.version,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    properties: props.map((p) => ({
      id: p.id,
      aspect: p.aspect,
      content: p.content,
      status: p.status,
      source: src(p.sourceId),
      version: p.version,
      updatedAt: iso(p.updatedAt),
    })),
    allergens: algs.map((a) => ({ allergenId: a.allergenId, name: a.name, status: a.status, source: src(a.sourceId) })),
    substitutes: subs.map((s) => ({ ...s, source: src(s.sourceId) })),
    usedIn: used,
  };
}

export const ingredientRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", zValidator("query", listQuery, validationHook), async (c) => {
    const { q, category, status } = c.req.valid("query");
    const db = c.var.db;
    const conds = [];
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      conds.push(
        or(
          sql`${ingredients.namePl} LIKE ${pattern} ESCAPE '\\'`,
          sql`${ingredients.nameOriginal} LIKE ${pattern} ESCAPE '\\'`,
          sql`${ingredients.transliteration} LIKE ${pattern} ESCAPE '\\'`,
        ),
      );
    }
    if (category) conds.push(eq(knowledgeCategories.slug, category));
    if (status) conds.push(eq(ingredients.status, status));
    const rows = await db
      .select({
        id: ingredients.id,
        namePl: ingredients.namePl,
        nameOriginal: ingredients.nameOriginal,
        categorySlug: knowledgeCategories.slug,
        categoryName: knowledgeCategories.name,
        status: ingredients.status,
        propertyCount: sql<number>`(SELECT count(*) FROM ingredient_properties p WHERE p.ingredient_id = "ingredients"."id")`,
      })
      .from(ingredients)
      .leftJoin(knowledgeCategories, eq(knowledgeCategories.id, ingredients.categoryId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(sql`lower(${ingredients.namePl})`)
      .limit(500);
    return c.json({ ingredients: rows satisfies IngredientListItem[] });
  })
  .get("/:id", async (c) => c.json(await buildDetail(c.var.db, c.req.param("id"))))
  .get("/:id/revisions", async (c) => {
    const db = c.var.db;
    const id = c.req.param("id");
    await getIngredient(db, id);
    const propIds = (await db.select({ id: ingredientProperties.id }).from(ingredientProperties).where(eq(ingredientProperties.ingredientId, id))).map((p) => p.id);
    const rows = await db
      .select()
      .from(contentRevisions)
      .where(
        or(
          and(eq(contentRevisions.entityType, "ingredient"), eq(contentRevisions.entityId, id)),
          propIds.length ? and(eq(contentRevisions.entityType, "ingredient_property"), inArray(contentRevisions.entityId, propIds)) : undefined,
        ),
      )
      .orderBy(desc(contentRevisions.changedAt))
      .limit(100);
    const out: (Revision & { entityType: string; entityId: string })[] = rows.map((r) => ({
      entityType: r.entityType,
      entityId: r.entityId,
      version: r.version,
      changedAt: iso(r.changedAt),
      changedBy: r.changedBy,
      snapshot: r.snapshot,
    }));
    return c.json({ revisions: out });
  })

  // ---- editor-only writes ----
  .post("/", requireEditor, zValidator("json", ingredientInputSchema, validationHook), async (c) => {
    const { categorySlug, ...input } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    await checkProvenance(db, user.id, input.status, input.sourceId);
    const categoryId = await resolveCategoryId(db, categorySlug);
    const id = crypto.randomUUID();
    try {
      await db.insert(ingredients).values({ id, ...input, nameKey: foldText(input.namePl), categoryId: categoryId ?? null, createdBy: user.id, updatedBy: user.id });
    } catch (e) {
      if (isUniqueViolation(e)) throw new HttpError(409, "duplicate", "Składnik o tej nazwie już istnieje.", { namePl: "Taka nazwa już istnieje" });
      throw e;
    }
    await reindexIngredient(db, id);
    return c.json({ id }, 201);
  })
  .patch("/:id", requireEditor, zValidator("json", ingredientUpdateSchema, validationHook), async (c) => {
    const { expectedVersion, categorySlug, ...input } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const old = await getIngredient(db, c.req.param("id"));
    if (old.version !== expectedVersion) versionConflict();
    await checkProvenance(db, user.id, input.status ?? old.status, input.sourceId === undefined ? old.sourceId : input.sourceId);
    const categoryId = await resolveCategoryId(db, categorySlug);
    try {
      const [, updated] = await db.batch([
        revisionInsert(db, "ingredient", old.id, old.version, old, user.id),
        db
          .update(ingredients)
          .set({
            ...input,
            ...(input.namePl !== undefined && { nameKey: foldText(input.namePl) }),
            ...(categoryId !== undefined && { categoryId }),
            version: old.version + 1,
            updatedBy: user.id,
            updatedAt: new Date(),
          })
          .where(and(eq(ingredients.id, old.id), eq(ingredients.version, expectedVersion)))
          .returning({ id: ingredients.id }),
      ]);
      if (updated.length === 0) versionConflict();
    } catch (e) {
      if (isUniqueViolation(e)) throw new HttpError(409, "duplicate", "Składnik o tej nazwie już istnieje.", { namePl: "Taka nazwa już istnieje" });
      throw e;
    }
    await reindexIngredient(db, old.id);
    return c.json(await buildDetail(db, old.id));
  })
  .delete("/:id", requireEditor, async (c) => {
    const db = c.var.db;
    const old = await getIngredient(db, c.req.param("id"));
    await db.batch([
      revisionInsert(db, "ingredient", old.id, old.version, { ...old, deleted: true }, c.var.user!.id),
      db.delete(ingredients).where(eq(ingredients.id, old.id)),
      unindexStatement(db, "ingredient", old.id),
    ]);
    await writeAudit(db, { actorId: c.var.user!.id, action: "ingredient.deleted", entityType: "ingredient", entityId: old.id, metadata: { name: old.namePl } });
    return c.json({ ok: true });
  })

  // ---- properties ----
  .post("/:id/properties", requireEditor, zValidator("json", propertyInputSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const ing = await getIngredient(db, c.req.param("id"));
    await checkProvenance(db, user.id, input.status, input.sourceId);
    const id = crypto.randomUUID();
    await db.insert(ingredientProperties).values({ id, ingredientId: ing.id, ...input, createdBy: user.id, updatedBy: user.id });
    await reindexIngredient(db, ing.id);
    return c.json({ id }, 201);
  })
  .patch("/:id/properties/:pid", requireEditor, zValidator("json", propertyUpdateSchema, validationHook), async (c) => {
    const { expectedVersion, ...input } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const [old] = await db
      .select()
      .from(ingredientProperties)
      .where(and(eq(ingredientProperties.id, c.req.param("pid")), eq(ingredientProperties.ingredientId, c.req.param("id"))));
    if (!old) notFound("Nie znaleziono właściwości.");
    if (old.version !== expectedVersion) versionConflict();
    await checkProvenance(db, user.id, input.status ?? old.status, input.sourceId === undefined ? old.sourceId : input.sourceId);
    const [, updated] = await db.batch([
      revisionInsert(db, "ingredient_property", old.id, old.version, old, user.id),
      db
        .update(ingredientProperties)
        .set({ ...input, version: old.version + 1, updatedBy: user.id, updatedAt: new Date() })
        .where(and(eq(ingredientProperties.id, old.id), eq(ingredientProperties.version, expectedVersion)))
        .returning({ id: ingredientProperties.id }),
    ]);
    if (updated.length === 0) versionConflict();
    await reindexIngredient(db, old.ingredientId);
    return c.json({ ok: true });
  })
  .delete("/:id/properties/:pid", requireEditor, async (c) => {
    const db = c.var.db;
    const [old] = await db
      .select()
      .from(ingredientProperties)
      .where(and(eq(ingredientProperties.id, c.req.param("pid")), eq(ingredientProperties.ingredientId, c.req.param("id"))));
    if (!old) notFound("Nie znaleziono właściwości.");
    await db.batch([
      revisionInsert(db, "ingredient_property", old.id, old.version, { ...old, deleted: true }, c.var.user!.id),
      db.delete(ingredientProperties).where(eq(ingredientProperties.id, old.id)),
    ]);
    await reindexIngredient(db, old.ingredientId);
    return c.json({ ok: true });
  })

  // ---- allergens (replace the whole set) ----
  .put("/:id/allergens", requireEditor, zValidator("json", allergenSetSchema, validationHook), async (c) => {
    const { allergens: list } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const ing = await getIngredient(db, c.req.param("id"));
    const known = new Set((await db.select({ id: allergens.id }).from(allergens)).map((a) => a.id));
    const seen = new Set<string>();
    for (const a of list) {
      if (!known.has(a.allergenId)) validation("allergens", `Nieznany alergen: ${a.allergenId}`);
      if (seen.has(a.allergenId)) validation("allergens", "Alergen powtórzony");
      seen.add(a.allergenId);
      await checkProvenance(db, user.id, a.status, a.sourceId);
    }
    await db.batch([
      db.delete(ingredientAllergens).where(eq(ingredientAllergens.ingredientId, ing.id)),
      ...list.map((a) =>
        db.insert(ingredientAllergens).values({ ingredientId: ing.id, allergenId: a.allergenId, status: a.status, sourceId: a.sourceId ?? null }),
      ),
    ]);
    return c.json({ ok: true });
  })

  // ---- substitutes ----
  .post("/:id/substitutes", requireEditor, zValidator("json", substituteInputSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const ing = await getIngredient(db, c.req.param("id"));
    if (input.substituteId === ing.id) validation("substituteId", "Składnik nie może zastępować sam siebie");
    const [sub] = await db.select({ id: ingredients.id }).from(ingredients).where(eq(ingredients.id, input.substituteId));
    if (!sub) validation("substituteId", "Nieznany składnik");
    await checkProvenance(db, user.id, input.status, input.sourceId);
    const id = crypto.randomUUID();
    try {
      await db.insert(ingredientSubstitutes).values({ id, ingredientId: ing.id, ...input, createdBy: user.id });
    } catch (e) {
      if (isUniqueViolation(e)) throw new HttpError(409, "duplicate", "Ten zamiennik już jest dodany.");
      throw e;
    }
    return c.json({ id }, 201);
  })
  .delete("/:id/substitutes/:sid", requireEditor, async (c) => {
    const db = c.var.db;
    const res = await db
      .delete(ingredientSubstitutes)
      .where(and(eq(ingredientSubstitutes.id, c.req.param("sid")), eq(ingredientSubstitutes.ingredientId, c.req.param("id"))))
      .returning({ id: ingredientSubstitutes.id });
    if (res.length === 0) notFound("Nie znaleziono zamiennika.");
    return c.json({ ok: true });
  });

export const allergenRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", async (c) => c.json({ allergens: await c.var.db.select({ id: allergens.id, namePl: allergens.namePl }).from(allergens).orderBy(asc(allergens.sortOrder)) }));
