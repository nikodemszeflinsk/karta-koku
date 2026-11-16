import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  allergenSetSchema,
  KIND_LABELS,
  menuComponentsSchema,
  menuItemInputSchema,
  menuItemUpdateSchema,
  menuVersionInputSchema,
  TIER_LABELS,
  type MenuItemDetail,
  type MenuItemSummary,
  type MenuVersion,
} from "../../../shared/knowledge";
import type { Db } from "../../db/client";
import { allergens, ingredients, menuCategories, menuItemAllergens, menuItemComponents, menuItems, menuVersions } from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { checkProvenance, iso, loadSources, notFound, requireEditor, revisionInsert, validation, versionConflict } from "../../lib/knowledge";
import { indexStatements, unindexStatement } from "../../lib/search";
import { validationHook } from "../../lib/validation";
import { requireAuth } from "../../middleware/session";
import type { AppEnv } from "../../types";

async function getItemRow(db: Db, id: string) {
  const [row] = await db
    .select({ item: menuItems, tier: menuCategories.tier, kind: menuCategories.kind, menuVersionId: menuCategories.menuVersionId, menuVersionLabel: menuVersions.label })
    .from(menuItems)
    .innerJoin(menuCategories, eq(menuCategories.id, menuItems.menuCategoryId))
    .innerJoin(menuVersions, eq(menuVersions.id, menuCategories.menuVersionId))
    .where(eq(menuItems.id, id));
  if (!row) notFound("Nie znaleziono pozycji karty.");
  return row;
}

/** Finds or creates the (version, tier, kind) category. */
async function categoryFor(db: Db, menuVersionId: string, tier: MenuItemSummary["tier"], kind: MenuItemSummary["kind"]): Promise<string> {
  const [v] = await db.select({ id: menuVersions.id }).from(menuVersions).where(eq(menuVersions.id, menuVersionId));
  if (!v) validation("menuVersionId", "Nieznana wersja karty");
  await db
    .insert(menuCategories)
    .values({ id: crypto.randomUUID(), menuVersionId, tier, kind })
    .onConflictDoNothing();
  const [cat] = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(and(eq(menuCategories.menuVersionId, menuVersionId), eq(menuCategories.tier, tier), eq(menuCategories.kind, kind)));
  return cat!.id;
}

async function reindexItem(db: Db, id: string) {
  const { item, tier, kind } = await getItemRow(db, id);
  const comps = await db.select({ label: menuItemComponents.label }).from(menuItemComponents).where(eq(menuItemComponents.menuItemId, id));
  await db.batch(
    indexStatements(db, {
      type: "menu_item",
      id,
      ownerId: null,
      title: item.name,
      body: [TIER_LABELS[tier], KIND_LABELS[kind], item.description, item.technique, item.texture, item.flavor, comps.map((c) => c.label).join(", ")]
        .filter(Boolean)
        .join("\n"),
    }),
  );
}

async function buildDetail(db: Db, id: string): Promise<MenuItemDetail> {
  const { item, tier, kind, menuVersionId, menuVersionLabel } = await getItemRow(db, id);
  const [comps, algs] = await Promise.all([
    db
      .select({
        id: menuItemComponents.id,
        role: menuItemComponents.role,
        label: menuItemComponents.label,
        ingredientId: menuItemComponents.ingredientId,
        ingredientName: ingredients.namePl,
        status: menuItemComponents.status,
      })
      .from(menuItemComponents)
      .leftJoin(ingredients, eq(ingredients.id, menuItemComponents.ingredientId))
      .where(eq(menuItemComponents.menuItemId, id))
      .orderBy(asc(menuItemComponents.sortOrder)),
    db
      .select({ allergenId: menuItemAllergens.allergenId, name: allergens.namePl, status: menuItemAllergens.status, sourceId: menuItemAllergens.sourceId })
      .from(menuItemAllergens)
      .innerJoin(allergens, eq(allergens.id, menuItemAllergens.allergenId))
      .where(eq(menuItemAllergens.menuItemId, id))
      .orderBy(asc(allergens.sortOrder)),
  ]);
  const srcs = await loadSources(db, [item.sourceId, ...algs.map((a) => a.sourceId)]);
  const src = (sid: string | null) => (sid ? (srcs.get(sid) ?? null) : null);
  return {
    id: item.id,
    tier,
    kind,
    menuVersionId,
    menuVersionLabel,
    code: item.code,
    name: item.name,
    description: item.description,
    technique: item.technique,
    texture: item.texture,
    flavor: item.flavor,
    portion: item.portion,
    priceGrosze: item.priceGrosze,
    componentsComplete: item.componentsComplete,
    currencyStatus: item.currencyStatus,
    status: item.status,
    source: src(item.sourceId),
    version: item.version,
    updatedAt: iso(item.updatedAt),
    components: comps,
    allergens: algs.map((a) => ({ allergenId: a.allergenId, name: a.name, status: a.status, source: src(a.sourceId) })),
  };
}

export const menuRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/versions", async (c) => {
    const rows = await c.var.db
      .select({
        id: menuVersions.id,
        label: menuVersions.label,
        validFrom: menuVersions.validFrom,
        validTo: menuVersions.validTo,
        isCurrent: menuVersions.isCurrent,
        notes: menuVersions.notes,
        itemCount: sql<number>`(SELECT count(*) FROM menu_items mi JOIN menu_categories mc ON mc.id = mi.menu_category_id WHERE mc.menu_version_id = "menu_versions"."id")`,
      })
      .from(menuVersions)
      .orderBy(desc(menuVersions.isCurrent), desc(menuVersions.createdAt));
    return c.json({ versions: rows satisfies MenuVersion[] });
  })
  .get("/versions/:id/items", async (c) => {
    const db = c.var.db;
    const rows = await db
      .select({
        id: menuItems.id,
        tier: menuCategories.tier,
        kind: menuCategories.kind,
        code: menuItems.code,
        name: menuItems.name,
        portion: menuItems.portion,
        priceGrosze: menuItems.priceGrosze,
        status: menuItems.status,
        currencyStatus: menuItems.currencyStatus,
        componentsComplete: menuItems.componentsComplete,
      })
      .from(menuItems)
      .innerJoin(menuCategories, eq(menuCategories.id, menuItems.menuCategoryId))
      .where(eq(menuCategories.menuVersionId, c.req.param("id")))
      .orderBy(asc(menuCategories.tier), asc(menuCategories.kind), sql`cast(${menuItems.code} as integer)`, asc(menuItems.name));
    const ids = rows.map((r) => r.id);
    const comps = ids.length
      ? await db
          .select({ itemId: menuItemComponents.menuItemId, label: menuItemComponents.label })
          .from(menuItemComponents)
          .where(inArray(menuItemComponents.menuItemId, ids))
          .orderBy(asc(menuItemComponents.sortOrder))
      : [];
    const byItem = new Map<string, string[]>();
    for (const cmp of comps) byItem.set(cmp.itemId, [...(byItem.get(cmp.itemId) ?? []), cmp.label]);
    const items: MenuItemSummary[] = rows.map((r) => ({ ...r, componentLabels: byItem.get(r.id) ?? [] }));
    return c.json({ items });
  })
  .get("/items/:id", async (c) => c.json(await buildDetail(c.var.db, c.req.param("id"))))

  // ---- editor-only writes ----
  .post("/versions", requireEditor, zValidator("json", menuVersionInputSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const id = crypto.randomUUID();
    await db.batch([
      db.update(menuVersions).set({ isCurrent: false }).where(input.isCurrent ? sql`1 = 1` : sql`0 = 1`),
      db.insert(menuVersions).values({ id, ...input, createdBy: c.var.user!.id }),
    ]);
    return c.json({ id }, 201);
  })
  .patch("/versions/:id", requireEditor, zValidator("json", menuVersionInputSchema.partial(), validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const id = c.req.param("id");
    const [v] = await db.select({ id: menuVersions.id }).from(menuVersions).where(eq(menuVersions.id, id));
    if (!v) notFound("Nie znaleziono wersji karty.");
    await db.batch([
      db.update(menuVersions).set({ isCurrent: false }).where(input.isCurrent ? sql`1 = 1` : sql`0 = 1`),
      db.update(menuVersions).set({ ...input, updatedAt: new Date() }).where(eq(menuVersions.id, id)),
    ]);
    return c.json({ ok: true });
  })
  .post("/items", requireEditor, zValidator("json", menuItemInputSchema, validationHook), async (c) => {
    const { menuVersionId, tier, kind, ...input } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    await checkProvenance(db, user.id, input.status, input.sourceId);
    const menuCategoryId = await categoryFor(db, menuVersionId, tier, kind);
    const id = crypto.randomUUID();
    await db.insert(menuItems).values({ id, menuCategoryId, ...input, createdBy: user.id, updatedBy: user.id });
    await reindexItem(db, id);
    return c.json({ id }, 201);
  })
  .patch("/items/:id", requireEditor, zValidator("json", menuItemUpdateSchema, validationHook), async (c) => {
    const { expectedVersion, tier, kind, ...input } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const old = await getItemRow(db, c.req.param("id"));
    if (old.item.version !== expectedVersion) versionConflict();
    await checkProvenance(db, user.id, input.status ?? old.item.status, input.sourceId === undefined ? old.item.sourceId : input.sourceId);
    const menuCategoryId = tier || kind ? await categoryFor(db, old.menuVersionId, tier ?? old.tier, kind ?? old.kind) : undefined;
    const [, updated] = await db.batch([
      revisionInsert(db, "menu_item", old.item.id, old.item.version, { ...old.item, tier: old.tier, kind: old.kind }, user.id),
      db
        .update(menuItems)
        .set({ ...input, ...(menuCategoryId && { menuCategoryId }), version: old.item.version + 1, updatedBy: user.id, updatedAt: new Date() })
        .where(and(eq(menuItems.id, old.item.id), eq(menuItems.version, expectedVersion)))
        .returning({ id: menuItems.id }),
    ]);
    if (updated.length === 0) versionConflict();
    await reindexItem(db, old.item.id);
    return c.json(await buildDetail(db, old.item.id));
  })
  .put("/items/:id/components", requireEditor, zValidator("json", menuComponentsSchema, validationHook), async (c) => {
    const { components } = c.req.valid("json");
    const db = c.var.db;
    const old = await getItemRow(db, c.req.param("id"));
    const ingIds = [...new Set(components.map((x) => x.ingredientId).filter((v): v is string => Boolean(v)))];
    if (ingIds.length) {
      const found = await db.select({ id: ingredients.id }).from(ingredients).where(inArray(ingredients.id, ingIds));
      if (found.length !== ingIds.length) validation("components", "Nieznany składnik w komponentach");
    }
    const prev = await db.select().from(menuItemComponents).where(eq(menuItemComponents.menuItemId, old.item.id));
    await db.batch([
      revisionInsert(db, "menu_item_components", old.item.id, old.item.version, { components: prev }, c.var.user!.id),
      db.delete(menuItemComponents).where(eq(menuItemComponents.menuItemId, old.item.id)),
      ...components.map((x, i) =>
        db.insert(menuItemComponents).values({
          id: crypto.randomUUID(),
          menuItemId: old.item.id,
          role: x.role,
          label: x.label,
          ingredientId: x.ingredientId ?? null,
          status: x.status,
          sortOrder: i,
        }),
      ),
      db.update(menuItems).set({ version: old.item.version + 1, updatedAt: new Date(), updatedBy: c.var.user!.id }).where(eq(menuItems.id, old.item.id)),
    ]);
    await reindexItem(db, old.item.id);
    return c.json(await buildDetail(db, old.item.id));
  })
  .put("/items/:id/allergens", requireEditor, zValidator("json", allergenSetSchema, validationHook), async (c) => {
    const { allergens: list } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const old = await getItemRow(db, c.req.param("id"));
    const known = new Set((await db.select({ id: allergens.id }).from(allergens)).map((a) => a.id));
    const seen = new Set<string>();
    for (const a of list) {
      if (!known.has(a.allergenId)) validation("allergens", `Nieznany alergen: ${a.allergenId}`);
      if (seen.has(a.allergenId)) validation("allergens", "Alergen powtórzony");
      seen.add(a.allergenId);
      await checkProvenance(db, user.id, a.status, a.sourceId);
    }
    await db.batch([
      db.delete(menuItemAllergens).where(eq(menuItemAllergens.menuItemId, old.item.id)),
      ...list.map((a) => db.insert(menuItemAllergens).values({ menuItemId: old.item.id, allergenId: a.allergenId, status: a.status, sourceId: a.sourceId ?? null })),
    ]);
    return c.json(await buildDetail(db, old.item.id));
  })
  .delete("/items/:id", requireEditor, async (c) => {
    const db = c.var.db;
    const old = await getItemRow(db, c.req.param("id"));
    await db.batch([
      revisionInsert(db, "menu_item", old.item.id, old.item.version, { ...old.item, deleted: true }, c.var.user!.id),
      db.delete(menuItems).where(eq(menuItems.id, old.item.id)),
      unindexStatement(db, "menu_item", old.item.id),
    ]);
    await writeAudit(db, { actorId: c.var.user!.id, action: "menu_item.deleted", entityType: "menu_item", entityId: old.item.id, metadata: { name: old.item.name } });
    return c.json({ ok: true });
  });
