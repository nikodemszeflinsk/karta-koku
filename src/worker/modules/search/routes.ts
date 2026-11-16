import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { searchQuerySchema } from "../../../shared/knowledge";
import { search } from "../../lib/search";
import { validationHook } from "../../lib/validation";
import { requireAuth } from "../../middleware/session";
import type { AppEnv } from "../../types";

export const searchRoutes = new Hono<AppEnv>().use(requireAuth).get("/", zValidator("query", searchQuerySchema, validationHook), async (c) => {
  const { q, types } = c.req.valid("query");
  return c.json({ results: await search(c.var.db, c.var.user!.id, q, types) });
});
