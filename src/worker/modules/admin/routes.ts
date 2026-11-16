import { zValidator } from "@hono/zod-validator";
import { asc, desc, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AuditLogEntry } from "../../../shared/schemas";
import { auditLogs, memberships, users } from "../../db/schema";
import { validationHook } from "../../lib/validation";
import { requireRole } from "../../middleware/session";
import type { AppEnv } from "../../types";

const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.coerce.number().int().positive().optional(),
});

export const adminRoutes = new Hono<AppEnv>()
  .use(requireRole("admin"))
  .get("/users", async (c) => {
    const db = c.var.db;
    const [userRows, roleRows] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt }).from(users).orderBy(asc(users.createdAt)),
      db.select({ userId: memberships.userId, role: memberships.roleKey, locationId: memberships.locationId }).from(memberships),
    ]);
    return c.json({
      users: userRows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: u.createdAt.toISOString(),
        roles: roleRows.filter((r) => r.userId === u.id).map((r) => ({ role: r.role, locationId: r.locationId })),
      })),
    });
  })
  .get("/audit-logs", zValidator("query", auditQuery, validationHook), async (c) => {
    const { limit, before } = c.req.valid("query");
    const rows = await c.var.db
      .select()
      .from(auditLogs)
      .where(before ? lt(auditLogs.createdAt, new Date(before)) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
    const entries: AuditLogEntry[] = rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorId: r.actorId,
      createdAt: r.createdAt.toISOString(),
    }));
    return c.json({ entries });
  });
