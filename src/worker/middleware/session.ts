import { and, eq, isNull } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { GUEST_USER_ID, ROLE_KEYS, type RoleKey } from "../../shared/roles";
import { createAuth } from "../auth/auth";
import { getDb } from "../db/client";
import { memberships } from "../db/schema";
import type { AppEnv } from "../types";

/** Creates per-request db/auth instances (Workers bindings are request-scoped). */
export const context: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("db", getDb(c.env.DB));
  c.set("auth", createAuth(c.env));
  c.set("user", null);
  c.set("globalRoles", []);
  await next();
};

/** Loads the session (if any). Does not reject anonymous requests. */
export const loadSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const result = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (result) {
    c.set("user", { id: result.user.id, name: result.user.name, email: result.user.email });
    const rows = await c.var.db
      .select({ roleKey: memberships.roleKey })
      .from(memberships)
      .where(and(eq(memberships.userId, result.user.id), isNull(memberships.locationId)));
    c.set(
      "globalRoles",
      rows.map((r) => r.roleKey).filter((r): r is RoleKey => (ROLE_KEYS as readonly string[]).includes(r)),
    );
  }
  await next();
};

/**
 * Prototype mode (OPEN_ACCESS="true"): requests without a session act as the shared guest
 * account. Mounted only on the routes that should work without login (kitchen, /me).
 * The guest manages kitchen catalogs (trainer-level), nothing else.
 */
export const guestAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user && c.env.OPEN_ACCESS === "true") {
    c.set("user", { id: GUEST_USER_ID, name: "Gość", email: "guest@guest.invalid" });
    c.set("globalRoles", ["trainer"]);
  }
  await next();
};

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) {
    return c.json({ error: { code: "unauthorized", message: "Zaloguj się, aby kontynuować." } }, 401);
  }
  return next();
};

/** Requires one of the given global roles. Owner always passes. */
export function requireRole(...allowed: RoleKey[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!c.var.user) {
      return c.json({ error: { code: "unauthorized", message: "Zaloguj się, aby kontynuować." } }, 401);
    }
    const roles = c.var.globalRoles;
    if (!roles.includes("owner") && !roles.some((r) => allowed.includes(r))) {
      return c.json({ error: { code: "forbidden", message: "Brak uprawnień." } }, 403);
    }
    return next();
  };
}
