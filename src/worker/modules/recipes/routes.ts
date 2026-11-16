import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { recipeInputSchema, recipeLinesSchema, recipeUpdateSchema, type RecipeDetail, type RecipeSummary } from "../../../shared/knowledge";
import type { Db } from "../../db/client";
import { ingredients, recipeComponents, recipeIngredients, recipes } from "../../db/schema";
import { checkProvenance, iso, loadSources, notFound, revisionInsert, validation, versionConflict } from "../../lib/knowledge";
import { indexStatements, unindexStatement } from "../../lib/search";
import { validationHook } from "../../lib/validation";
import { requireAuth } from "../../middleware/session";
import type { AppEnv } from "../../types";

/*
 * Recipes are PRIVATE: every query is scoped to owner_id = current user, and a
 * recipe owned by someone else is reported as 404 (its existence is not revealed).
 */

async function getOwnRecipe(db: Db, userId: string, id: string) {
  const [row] = await db.select().from(recipes).where(and(eq(recipes.id, id), eq(recipes.ownerId, userId)));
  if (!row) notFound("Nie znaleziono receptury.");
  return row;
}

/** Confidential recipes are searchable by name only, never by method or amounts. */
function recipeIndex(db: Db, r: { id: string; ownerId: string; name: string; description: string | null; confidential: boolean }) {
  return indexStatements(db, { type: "recipe", id: r.id, ownerId: r.ownerId, title: r.name, body: r.confidential ? "" : (r.description ?? "") });
}

async function buildDetail(db: Db, userId: string, id: string): Promise<RecipeDetail> {
  const r = await getOwnRecipe(db, userId, id);
  const [lines, comps] = await Promise.all([
    db
      .select({
        id: recipeIngredients.id,
        label: recipeIngredients.label,
        ingredientId: recipeIngredients.ingredientId,
        ingredientName: ingredients.namePl,
        amount: recipeIngredients.amount,
        unit: recipeIngredients.unit,
        role: recipeIngredients.role,
        note: recipeIngredients.note,
      })
      .from(recipeIngredients)
      .leftJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
      .where(eq(recipeIngredients.recipeId, id))
      .orderBy(asc(recipeIngredients.sortOrder)),
    db
      .select({ id: recipeComponents.id, childRecipeId: recipeComponents.childRecipeId, childName: recipes.name, amount: recipeComponents.amount, unit: recipeComponents.unit })
      .from(recipeComponents)
      .innerJoin(recipes, eq(recipes.id, recipeComponents.childRecipeId))
      .where(eq(recipeComponents.parentRecipeId, id))
      .orderBy(asc(recipeComponents.sortOrder)),
  ]);
  const srcs = await loadSources(db, [r.sourceId]);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    yieldText: r.yieldText,
    method: r.method,
    confidential: r.confidential,
    status: r.status,
    source: r.sourceId ? (srcs.get(r.sourceId) ?? null) : null,
    version: r.version,
    updatedAt: iso(r.updatedAt),
    ingredients: lines,
    components: comps,
  };
}

/** True if `childId` (transitively) contains `parentId` — adding it would create a cycle. */
async function wouldCycle(db: Db, parentId: string, childIds: string[]): Promise<boolean> {
  const seen = new Set<string>();
  let frontier = childIds;
  while (frontier.length) {
    if (frontier.includes(parentId)) return true;
    frontier.forEach((f) => seen.add(f));
    const next = await db
      .select({ id: recipeComponents.childRecipeId })
      .from(recipeComponents)
      .where(inArray(recipeComponents.parentRecipeId, frontier));
    frontier = next.map((n) => n.id).filter((n) => !seen.has(n));
  }
  return false;
}

export const recipeRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", async (c) => {
    const rows = await c.var.db
      .select({ id: recipes.id, name: recipes.name, confidential: recipes.confidential, status: recipes.status, updatedAt: recipes.updatedAt })
      .from(recipes)
      .where(eq(recipes.ownerId, c.var.user!.id))
      .orderBy(desc(recipes.updatedAt));
    const out: RecipeSummary[] = rows.map((r) => ({ ...r, updatedAt: iso(r.updatedAt) }));
    return c.json({ recipes: out });
  })
  .get("/:id", async (c) => c.json(await buildDetail(c.var.db, c.var.user!.id, c.req.param("id"))))
  .post("/", zValidator("json", recipeInputSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id;
    await checkProvenance(db, userId, input.status, input.sourceId);
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(recipes).values({ id, ownerId: userId, ...input }),
      ...recipeIndex(db, { id, ownerId: userId, name: input.name, description: input.description ?? null, confidential: input.confidential }),
    ]);
    return c.json({ id }, 201);
  })
  .patch("/:id", zValidator("json", recipeUpdateSchema, validationHook), async (c) => {
    const { expectedVersion, ...input } = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id;
    const old = await getOwnRecipe(db, userId, c.req.param("id"));
    if (old.version !== expectedVersion) versionConflict();
    await checkProvenance(db, userId, input.status ?? old.status, input.sourceId === undefined ? old.sourceId : input.sourceId);
    const next = { ...old, ...input };
    const [, updated] = await db.batch([
      revisionInsert(db, "recipe", old.id, old.version, old, userId),
      db
        .update(recipes)
        .set({ ...input, version: old.version + 1, updatedAt: new Date() })
        .where(and(eq(recipes.id, old.id), eq(recipes.ownerId, userId), eq(recipes.version, expectedVersion)))
        .returning({ id: recipes.id }),
      ...recipeIndex(db, next),
    ]);
    if (updated.length === 0) versionConflict();
    return c.json(await buildDetail(db, userId, old.id));
  })
  .put("/:id/lines", zValidator("json", recipeLinesSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id;
    const r = await getOwnRecipe(db, userId, c.req.param("id"));

    const ingIds = [...new Set(input.ingredients.map((l) => l.ingredientId).filter((v): v is string => Boolean(v)))];
    if (ingIds.length) {
      const found = await db.select({ id: ingredients.id }).from(ingredients).where(inArray(ingredients.id, ingIds));
      if (found.length !== ingIds.length) validation("ingredients", "Nieznany składnik");
    }
    const childIds = [...new Set(input.components.map((x) => x.childRecipeId))];
    if (childIds.length !== input.components.length) validation("components", "Komponent powtórzony");
    if (childIds.length) {
      const own = await db.select({ id: recipes.id }).from(recipes).where(and(inArray(recipes.id, childIds), eq(recipes.ownerId, userId)));
      if (own.length !== childIds.length) validation("components", "Nieznana receptura komponentu");
      if (await wouldCycle(db, r.id, childIds)) validation("components", "Receptura nie może zawierać samej siebie (pośrednio lub bezpośrednio)");
    }
    const [prevLines, prevComps] = await Promise.all([
      db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, r.id)),
      db.select().from(recipeComponents).where(eq(recipeComponents.parentRecipeId, r.id)),
    ]);
    await db.batch([
      revisionInsert(db, "recipe_lines", r.id, r.version, { ingredients: prevLines, components: prevComps }, userId),
      db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, r.id)),
      db.delete(recipeComponents).where(eq(recipeComponents.parentRecipeId, r.id)),
      ...input.ingredients.map((l, i) =>
        db.insert(recipeIngredients).values({
          id: crypto.randomUUID(),
          recipeId: r.id,
          label: l.label,
          ingredientId: l.ingredientId ?? null,
          amount: l.amount ?? null,
          unit: l.unit ?? null,
          role: l.role,
          note: l.note ?? null,
          sortOrder: i,
        }),
      ),
      ...input.components.map((x, i) =>
        db.insert(recipeComponents).values({ id: crypto.randomUUID(), parentRecipeId: r.id, childRecipeId: x.childRecipeId, amount: x.amount ?? null, unit: x.unit ?? null, sortOrder: i }),
      ),
      db.update(recipes).set({ version: r.version + 1, updatedAt: new Date() }).where(eq(recipes.id, r.id)),
    ]);
    return c.json(await buildDetail(db, userId, r.id));
  })
  .delete("/:id", async (c) => {
    const db = c.var.db;
    const userId = c.var.user!.id;
    const r = await getOwnRecipe(db, userId, c.req.param("id"));
    await db.batch([db.delete(recipes).where(eq(recipes.id, r.id)), unindexStatement(db, "recipe", r.id)]);
    return c.json({ ok: true });
  });
