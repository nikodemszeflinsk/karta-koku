import { and, count, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { notes } from "../../db/schema";
import type { DashboardResponse } from "../../../shared/schemas";
import { requireAuth } from "../../middleware/session";
import type { AppEnv } from "../../types";
import { listCategories, listLevels } from "../academy/repo";
import { getProfile } from "../me/routes";

export function aiStatus(env: Env): DashboardResponse["ai"] {
  if (env.AI_ENABLED !== "true") return { enabled: false, reason: "Trener AI jest wyłączony w konfiguracji." };
  return { enabled: false, reason: "Trener AI zostanie uruchomiony w Etapie 3." };
}

export const dashboardRoutes = new Hono<AppEnv>().use(requireAuth).get("/", async (c) => {
  const db = c.var.db;
  const user = c.var.user!;
  const [profile, levels, categories] = await Promise.all([
    getProfile(db, user.id),
    listLevels(db),
    listCategories(db),
  ]);
  const counts = await db.all<{ slug: string; n: number }>(sql`
    SELECT kc.slug AS slug,
      (SELECT count(*) FROM ingredients i WHERE i.category_id = kc.id) +
      (SELECT count(*) FROM techniques t WHERE t.category_id = kc.id) AS n
    FROM knowledge_categories kc`);
  const bySlug = new Map(counts.map((r) => [r.slug, r.n]));
  const [open] = await db.select({ n: count() }).from(notes).where(and(eq(notes.ownerId, user.id), isNull(notes.resolvedAt)));
  const menuCount = await db.get<{ n: number }>(sql`SELECT count(*) AS n FROM menu_items`);
  const body: DashboardResponse = {
    greetingName: profile.displayName ?? user.name,
    targetLevel: levels.find((l) => l.key === profile.targetLevelKey) ?? null,
    categories: categories.map((c) => ({ ...c, materialCount: (bySlug.get(c.slug) ?? 0) + (c.slug === "karta-koku" ? (menuCount?.n ?? 0) : 0) })),
    openNotes: open?.n ?? 0,
    ai: aiStatus(c.env),
  };
  return c.json(body);
});
