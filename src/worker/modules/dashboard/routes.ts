import { Hono } from "hono";
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
  const body: DashboardResponse = {
    greetingName: profile.displayName ?? user.name,
    targetLevel: levels.find((l) => l.key === profile.targetLevelKey) ?? null,
    categories,
    ai: aiStatus(c.env),
  };
  return c.json(body);
});
