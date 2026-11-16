import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { NOTE_KINDS, noteInputSchema, noteUpdateSchema, type NoteRow, type NoteTarget } from "../../../shared/knowledge";
import type { Db } from "../../db/client";
import { ingredients, knowledgeCategories, menuItems, noteLinks, notes, recipes, techniques } from "../../db/schema";
import { iso, notFound, validation } from "../../lib/knowledge";
import { indexStatements, unindexStatement } from "../../lib/search";
import { validationHook } from "../../lib/validation";
import { requireAuth } from "../../middleware/session";
import type { AppEnv } from "../../types";

/* Notes are PRIVATE: scoped to owner_id; other users' notes are reported as 404. */

type Link = { targetType: NoteTarget; targetId: string };

/** Resolves labels for link targets; also verifies they exist and (for recipes) belong to the user. */
async function resolveLinks(db: Db, userId: string, links: Link[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const by = (t: NoteTarget) => [...new Set(links.filter((l) => l.targetType === t).map((l) => l.targetId))];
  const put = (t: NoteTarget, rows: { id: string; label: string }[]) => rows.forEach((r) => labels.set(`${t}:${r.id}`, r.label));
  const ids = { ingredient: by("ingredient"), menu_item: by("menu_item"), technique: by("technique"), category: by("category"), recipe: by("recipe") };
  if (ids.ingredient.length) put("ingredient", await db.select({ id: ingredients.id, label: ingredients.namePl }).from(ingredients).where(inArray(ingredients.id, ids.ingredient)));
  if (ids.menu_item.length) put("menu_item", await db.select({ id: menuItems.id, label: menuItems.name }).from(menuItems).where(inArray(menuItems.id, ids.menu_item)));
  if (ids.technique.length) put("technique", await db.select({ id: techniques.id, label: techniques.name }).from(techniques).where(inArray(techniques.id, ids.technique)));
  if (ids.category.length)
    put("category", await db.select({ id: knowledgeCategories.slug, label: knowledgeCategories.name }).from(knowledgeCategories).where(inArray(knowledgeCategories.slug, ids.category)));
  if (ids.recipe.length)
    put("recipe", await db.select({ id: recipes.id, label: recipes.name }).from(recipes).where(and(inArray(recipes.id, ids.recipe), eq(recipes.ownerId, userId))));
  return labels;
}

async function assertLinks(db: Db, userId: string, links: Link[]) {
  const labels = await resolveLinks(db, userId, links);
  for (const l of links) if (!labels.has(`${l.targetType}:${l.targetId}`)) validation("links", "Nieznany powiązany element");
}

async function loadNotes(db: Db, userId: string, where: ReturnType<typeof and>): Promise<NoteRow[]> {
  const rows = await db.select().from(notes).where(and(eq(notes.ownerId, userId), where)).orderBy(desc(notes.updatedAt)).limit(300);
  if (rows.length === 0) return [];
  const links = await db.select().from(noteLinks).where(inArray(noteLinks.noteId, rows.map((r) => r.id)));
  const labels = await resolveLinks(db, userId, links);
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    resolved: n.resolvedAt !== null,
    createdAt: iso(n.createdAt),
    updatedAt: iso(n.updatedAt),
    links: links
      .filter((l) => l.noteId === n.id)
      .map((l) => ({ targetType: l.targetType, targetId: l.targetId, label: labels.get(`${l.targetType}:${l.targetId}`) ?? "(usunięty element)" })),
  }));
}

const listQuery = z.object({
  kind: z.enum(NOTE_KINDS).optional(),
  resolved: z.enum(["true", "false"]).optional(),
  targetType: z.string().max(20).optional(),
  targetId: z.string().max(100).optional(),
});

export const noteRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", zValidator("query", listQuery, validationHook), async (c) => {
    const q = c.req.valid("query");
    const db = c.var.db;
    const userId = c.var.user!.id;
    let idFilter: string[] | undefined;
    if (q.targetType && q.targetId) {
      idFilter = (
        await db
          .select({ id: noteLinks.noteId })
          .from(noteLinks)
          .where(and(eq(noteLinks.targetType, q.targetType as NoteTarget), eq(noteLinks.targetId, q.targetId)))
      ).map((r) => r.id);
      if (idFilter.length === 0) return c.json({ notes: [] });
    }
    const list = await loadNotes(
      db,
      userId,
      and(
        q.kind ? eq(notes.kind, q.kind) : undefined,
        q.resolved === "true" ? isNotNull(notes.resolvedAt) : q.resolved === "false" ? isNull(notes.resolvedAt) : undefined,
        idFilter ? inArray(notes.id, idFilter) : undefined,
      ),
    );
    return c.json({ notes: list });
  })
  .get("/:id", async (c) => {
    const [n] = await loadNotes(c.var.db, c.var.user!.id, and(eq(notes.id, c.req.param("id"))));
    if (!n) notFound("Nie znaleziono notatki.");
    return c.json(n);
  })
  .post("/", zValidator("json", noteInputSchema, validationHook), async (c) => {
    const { links, resolved, ...input } = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id;
    await assertLinks(db, userId, links);
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(notes).values({ id, ownerId: userId, ...input, resolvedAt: resolved ? new Date() : null }),
      ...links.map((l) => db.insert(noteLinks).values({ id: crypto.randomUUID(), noteId: id, ...l }).onConflictDoNothing()),
      ...indexStatements(db, { type: "note", id, ownerId: userId, title: input.title, body: input.body }),
    ]);
    return c.json({ id }, 201);
  })
  .patch("/:id", zValidator("json", noteUpdateSchema, validationHook), async (c) => {
    const { links, resolved, ...input } = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id;
    const [old] = await db.select().from(notes).where(and(eq(notes.id, c.req.param("id")), eq(notes.ownerId, userId)));
    if (!old) notFound("Nie znaleziono notatki.");
    if (links) await assertLinks(db, userId, links);
    const next = { ...old, ...input };
    await db.batch([
      db
        .update(notes)
        .set({
          ...input,
          ...(resolved !== undefined && { resolvedAt: resolved ? (old.resolvedAt ?? new Date()) : null }),
          updatedAt: new Date(),
        })
        .where(and(eq(notes.id, old.id), eq(notes.ownerId, userId))),
      ...(links
        ? [
            db.delete(noteLinks).where(eq(noteLinks.noteId, old.id)),
            ...links.map((l) => db.insert(noteLinks).values({ id: crypto.randomUUID(), noteId: old.id, ...l }).onConflictDoNothing()),
          ]
        : []),
      ...indexStatements(db, { type: "note", id: old.id, ownerId: userId, title: next.title, body: next.body }),
    ]);
    const [n] = await loadNotes(db, userId, and(eq(notes.id, old.id)));
    return c.json(n);
  })
  .delete("/:id", async (c) => {
    const db = c.var.db;
    const userId = c.var.user!.id;
    const res = await db.delete(notes).where(and(eq(notes.id, c.req.param("id")), eq(notes.ownerId, userId))).returning({ id: notes.id });
    if (res.length === 0) notFound("Nie znaleziono notatki.");
    await db.batch([unindexStatement(db, "note", res[0]!.id)]);
    return c.json({ ok: true });
  });
