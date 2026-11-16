import { Hono } from "hono";
import { requireAuth } from "../../middleware/session";
import type { AppEnv } from "../../types";
import { listCategories, listLevels } from "./repo";

export const academyRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/categories", async (c) => c.json({ categories: await listCategories(c.var.db) }))
  .get("/levels", async (c) => c.json({ levels: await listLevels(c.var.db) }));
