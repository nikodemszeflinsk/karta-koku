import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  INVITE_TTL_DAYS,
  invitationAcceptSchema,
  invitationCreateSchema,
  locationInputSchema,
  membershipInputSchema,
  type InvitationRow,
  type LocationRow,
  type TeamMember,
} from "../../../shared/team";
import type { RoleKey } from "../../../shared/roles";
import type { Db } from "../../db/client";
import { invitations, locations, memberships, userProfiles, users } from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { HttpError } from "../../lib/errors";
import { iso, notFound, validation } from "../../lib/knowledge";
import { validationHook } from "../../lib/validation";
import { requireRole } from "../../middleware/session";
import type { AppEnv } from "../../types";

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function invitationStatus(r: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }): InvitationRow["status"] {
  if (r.acceptedAt) return "accepted";
  if (r.revokedAt) return "revoked";
  if (r.expiresAt.getTime() < Date.now()) return "expired";
  return "pending";
}

async function assertLocation(db: Db, id: string | null | undefined) {
  if (!id) return;
  const [l] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, id));
  if (!l) validation("locationId", "Nieznany lokal");
}

/** Only the owner may grant or change the admin role. */
function assertCanGrant(actorRoles: RoleKey[], role: RoleKey) {
  if (role === "admin" && !actorRoles.includes("owner")) throw new HttpError(403, "forbidden", "Tylko właściciel może nadać rolę administratora.");
}

/** Users visible to the caller: owner/admin see everyone; a trainer sees members of their locations. */
async function visibleUserIds(db: Db, userId: string, roles: RoleKey[]): Promise<string[] | "all"> {
  if (roles.includes("owner") || roles.includes("admin")) return "all";
  const mine = (await db.select({ loc: memberships.locationId }).from(memberships).where(eq(memberships.userId, userId))).map((r) => r.loc).filter((x): x is string => Boolean(x));
  if (mine.length === 0) return [userId];
  const rows = await db.select({ u: memberships.userId }).from(memberships).where(inArray(memberships.locationId, mine));
  return [...new Set([userId, ...rows.map((r) => r.u)])];
}

// ---- public: accept an invitation (no session yet) ----
export const invitePublicRoutes = new Hono<AppEnv>()
  .get("/:token", async (c) => {
    const hash = await sha256Hex(c.req.param("token"));
    const [inv] = await c.var.db
      .select({ email: invitations.email, roleKey: invitations.roleKey, expiresAt: invitations.expiresAt, acceptedAt: invitations.acceptedAt, revokedAt: invitations.revokedAt, locationName: locations.name })
      .from(invitations)
      .leftJoin(locations, eq(locations.id, invitations.locationId))
      .where(eq(invitations.tokenHash, hash));
    if (!inv || invitationStatus(inv) !== "pending") notFound("Zaproszenie jest nieważne, wygasło albo zostało już użyte.");
    return c.json({ email: inv.email, roleKey: inv.roleKey, locationName: inv.locationName });
  })
  .post("/accept", zValidator("json", invitationAcceptSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const hash = await sha256Hex(input.token);
    const [inv] = await db.select().from(invitations).where(eq(invitations.tokenHash, hash));
    if (!inv || invitationStatus(inv) !== "pending") notFound("Zaproszenie jest nieważne, wygasło albo zostało już użyte.");
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, inv.email));
    if (existing) throw new HttpError(409, "already_registered", "Konto z tym adresem już istnieje.");

    // Mark as used FIRST (single use even under concurrent requests).
    const claimed = await db
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(and(eq(invitations.id, inv.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .returning({ id: invitations.id });
    if (claimed.length === 0) notFound("Zaproszenie zostało już użyte.");

    const ctx = await c.var.auth.$context;
    const user = await ctx.internalAdapter.createUser({ email: inv.email, name: input.name, emailVerified: true }, { method: "admin" });
    await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(input.password) });
    await db.batch([
      db.insert(memberships).values({ id: crypto.randomUUID(), userId: user.id, roleKey: inv.roleKey, locationId: null, createdBy: inv.invitedBy }),
      ...(inv.locationId ? [db.insert(memberships).values({ id: crypto.randomUUID(), userId: user.id, roleKey: inv.roleKey, locationId: inv.locationId, createdBy: inv.invitedBy })] : []),
      db.insert(userProfiles).values({ userId: user.id, displayName: input.name }),
      db.update(invitations).set({ acceptedUserId: user.id }).where(eq(invitations.id, inv.id)),
    ]);
    await writeAudit(db, { actorId: user.id, action: "invitation.accepted", entityType: "invitation", entityId: inv.id, metadata: { role: inv.roleKey } });
    return c.json({ ok: true, email: inv.email }, 201);
  });

// ---- team management ----
export const teamRoutes = new Hono<AppEnv>()
  // Trainers can view their team's progress; everything else needs owner/admin.
  .get("/members", requireRole("admin", "trainer"), async (c) => {
    const db = c.var.db;
    const visible = await visibleUserIds(db, c.var.user!.id, c.var.globalRoles);
    const us = await db
      .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
      .from(users)
      .where(visible === "all" ? undefined : inArray(users.id, visible))
      .orderBy(asc(users.createdAt));
    const ids = us.map((u) => u.id);
    if (ids.length === 0) return c.json({ members: [] });
    const [mems, stats, achieved] = await Promise.all([
      db
        .select({ id: memberships.id, userId: memberships.userId, role: memberships.roleKey, locationId: memberships.locationId, locationName: locations.name })
        .from(memberships)
        .leftJoin(locations, eq(locations.id, memberships.locationId))
        .where(inArray(memberships.userId, ids)),
      db.all<{ user_id: string; n: number; a: number | null; last: number | null }>(sql`
        SELECT user_id, sum(CASE WHEN created_at >= ${Date.now() - 30 * 86400_000} THEN 1 ELSE 0 END) AS n,
               avg(CASE WHEN created_at >= ${Date.now() - 30 * 86400_000} THEN evidence END) AS a, max(created_at) AS last
        FROM attempt_answers GROUP BY user_id`),
      db.all<{ user_id: string; name: string }>(sql`
        SELECT qa.user_id, l.name FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id JOIN levels l ON l.id = q.level_id
        WHERE q.kind = 'level_exam' AND qa.passed = 1 GROUP BY qa.user_id, l.id`),
    ]);
    // Progress only — never private notes, recipes, chats or vault data.
    const members: TeamMember[] = us.map((u) => {
      const s = stats.find((x) => x.user_id === u.id);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        createdAt: iso(u.createdAt),
        roles: mems.filter((m) => m.userId === u.id).map((m) => ({ id: m.id, role: m.role as RoleKey, locationId: m.locationId, locationName: m.locationName })),
        progress: {
          answers30d: s?.n ?? 0,
          avgEvidence30d: s?.a === null || s?.a === undefined ? null : Math.round(s.a),
          levelsAchieved: achieved.filter((a) => a.user_id === u.id).map((a) => a.name),
          lastActivityAt: s?.last ? new Date(s.last).toISOString() : null,
        },
      };
    });
    return c.json({ members });
  })
  .post("/members/:id/roles", requireRole("admin"), zValidator("json", membershipInputSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const actor = c.var.user!;
    assertCanGrant(c.var.globalRoles, input.roleKey);
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, c.req.param("id")));
    if (!target) notFound("Nie znaleziono użytkownika.");
    const [targetOwner] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.userId, target.id), eq(memberships.roleKey, "owner")));
    if (targetOwner) throw new HttpError(403, "forbidden", "Ról właściciela nie można zmieniać.");
    await assertLocation(db, input.locationId);
    // One role per (user, location): replace the existing one.
    await db.batch([
      db.delete(memberships).where(and(eq(memberships.userId, target.id), input.locationId ? eq(memberships.locationId, input.locationId) : isNull(memberships.locationId))),
      db.insert(memberships).values({ id: crypto.randomUUID(), userId: target.id, roleKey: input.roleKey, locationId: input.locationId, createdBy: actor.id }),
    ]);
    await writeAudit(db, { actorId: actor.id, action: "role.assigned", entityType: "user", entityId: target.id, metadata: { role: input.roleKey, locationId: input.locationId } });
    return c.json({ ok: true });
  })
  .delete("/members/:id/roles/:membershipId", requireRole("admin"), async (c) => {
    const db = c.var.db;
    const [m] = await db.select().from(memberships).where(and(eq(memberships.id, c.req.param("membershipId")), eq(memberships.userId, c.req.param("id"))));
    if (!m) notFound("Nie znaleziono przypisania.");
    if (m.roleKey === "owner") throw new HttpError(403, "forbidden", "Roli właściciela nie można usunąć.");
    if (m.roleKey === "admin") assertCanGrant(c.var.globalRoles, "admin");
    await db.delete(memberships).where(eq(memberships.id, m.id));
    await writeAudit(db, { actorId: c.var.user!.id, action: "role.removed", entityType: "user", entityId: m.userId, metadata: { role: m.roleKey, locationId: m.locationId } });
    return c.json({ ok: true });
  })

  // ---- invitations ----
  .get("/invitations", requireRole("admin"), async (c) => {
    const rows = await c.var.db
      .select({ i: invitations, locationName: locations.name })
      .from(invitations)
      .leftJoin(locations, eq(locations.id, invitations.locationId))
      .orderBy(desc(invitations.createdAt))
      .limit(100);
    const out: InvitationRow[] = rows.map(({ i, locationName }) => ({
      id: i.id,
      email: i.email,
      roleKey: i.roleKey as RoleKey,
      locationId: i.locationId,
      locationName,
      expiresAt: iso(i.expiresAt),
      acceptedAt: i.acceptedAt ? iso(i.acceptedAt) : null,
      revokedAt: i.revokedAt ? iso(i.revokedAt) : null,
      createdAt: iso(i.createdAt),
      status: invitationStatus(i),
    }));
    return c.json({ invitations: out });
  })
  .post("/invitations", requireRole("admin"), zValidator("json", invitationCreateSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const actor = c.var.user!;
    assertCanGrant(c.var.globalRoles, input.roleKey);
    await assertLocation(db, input.locationId);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existing) throw new HttpError(409, "already_registered", "Ten adres ma już konto.", { email: "Ten adres ma już konto" });
    const token = newToken();
    const id = crypto.randomUUID();
    await db.insert(invitations).values({
      id,
      email: input.email,
      roleKey: input.roleKey,
      locationId: input.locationId ?? null,
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400_000),
      invitedBy: actor.id,
    });
    await writeAudit(db, { actorId: actor.id, action: "invitation.created", entityType: "invitation", entityId: id, metadata: { role: input.roleKey } });
    // The token is returned exactly once; only its hash is stored.
    return c.json({ id, url: `${new URL(c.env.APP_URL).origin}/zaproszenie/${token}` }, 201);
  })
  .post("/invitations/:id/revoke", requireRole("admin"), async (c) => {
    const db = c.var.db;
    const res = await db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.id, c.req.param("id")), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .returning({ id: invitations.id });
    if (res.length === 0) notFound("Nie znaleziono aktywnego zaproszenia.");
    await writeAudit(db, { actorId: c.var.user!.id, action: "invitation.revoked", entityType: "invitation", entityId: res[0]!.id });
    return c.json({ ok: true });
  })

  // ---- locations ----
  .get("/locations", requireRole("admin", "trainer"), async (c) => {
    const rows = await c.var.db
      .select({ id: locations.id, name: locations.name, city: locations.city, memberCount: sql<number>`(SELECT count(DISTINCT m.user_id) FROM memberships m WHERE m.location_id = "locations"."id")` })
      .from(locations)
      .orderBy(asc(locations.name));
    return c.json({ locations: rows satisfies LocationRow[] });
  })
  .post("/locations", requireRole("admin"), zValidator("json", locationInputSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const id = crypto.randomUUID();
    await c.var.db.insert(locations).values({ id, ...input });
    await writeAudit(c.var.db, { actorId: c.var.user!.id, action: "location.created", entityType: "location", entityId: id, metadata: { name: input.name } });
    return c.json({ id }, 201);
  })
  .delete("/locations/:id", requireRole("admin"), async (c) => {
    const db = c.var.db;
    const res = await db.delete(locations).where(eq(locations.id, c.req.param("id"))).returning({ id: locations.id, name: locations.name });
    if (res.length === 0) notFound("Nie znaleziono lokalu.");
    await writeAudit(db, { actorId: c.var.user!.id, action: "location.deleted", entityType: "location", entityId: res[0]!.id, metadata: { name: res[0]!.name } });
    return c.json({ ok: true });
  });

