import { zValidator } from "@hono/zod-validator";
import { count } from "drizzle-orm";
import { Hono } from "hono";
import { ownerSetupSchema } from "../../../shared/schemas";
import { safeStringEqual } from "../../auth/password";
import { memberships, userProfiles, users } from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { validationHook } from "../../lib/validation";
import type { AppEnv } from "../../types";

/**
 * One-time owner bootstrap. Works only while the database has no users and only
 * with the SETUP_TOKEN secret, so a stranger who finds the URL cannot claim it.
 */
export const setupRoutes = new Hono<AppEnv>()
  .get("/status", async (c) => {
    const [row] = await c.var.db.select({ n: count() }).from(users);
    return c.json({ needsSetup: (row?.n ?? 0) === 0, setupEnabled: Boolean(c.env.SETUP_TOKEN) });
  })
  .post("/owner", zValidator("json", ownerSetupSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    if (!c.env.SETUP_TOKEN || !(await safeStringEqual(input.token, c.env.SETUP_TOKEN))) {
      return c.json({ error: { code: "invalid_setup_token", message: "Nieprawidłowy token konfiguracji." } }, 403);
    }
    const db = c.var.db;
    const [row] = await db.select({ n: count() }).from(users);
    if ((row?.n ?? 0) > 0) {
      return c.json({ error: { code: "already_configured", message: "Konto właściciela już istnieje." } }, 409);
    }

    const ctx = await c.var.auth.$context;
    const user = await ctx.internalAdapter.createUser({
      email: input.email,
      name: input.name,
      emailVerified: true,
    }, { method: "admin" });
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await ctx.password.hash(input.password),
    });
    await db.insert(memberships).values({ id: crypto.randomUUID(), userId: user.id, roleKey: "owner", locationId: null });
    await db.insert(userProfiles).values({ userId: user.id, displayName: input.name });
    await writeAudit(db, { actorId: user.id, action: "setup.owner_created", entityType: "user", entityId: user.id });

    return c.json({ ok: true }, 201);
  });
