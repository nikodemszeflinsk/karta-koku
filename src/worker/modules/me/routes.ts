import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { ROLE_KEYS, type RoleKey } from "../../../shared/roles";
import { profileUpdateSchema, type MeResponse } from "../../../shared/schemas";
import type { Db } from "../../db/client";
import { levels, memberships, userProfiles } from "../../db/schema";
import { validationHook } from "../../lib/validation";
import { requireAuth } from "../../middleware/session";
import type { AppEnv, CurrentUser } from "../../types";

export async function getProfile(db: Db, userId: string): Promise<MeResponse["profile"]> {
  const [p] = await db
    .select({
      displayName: userProfiles.displayName,
      position: userProfiles.position,
      theme: userProfiles.theme,
      targetLevelKey: levels.key,
    })
    .from(userProfiles)
    .leftJoin(levels, eq(levels.id, userProfiles.targetLevelId))
    .where(eq(userProfiles.userId, userId));
  return {
    displayName: p?.displayName ?? null,
    position: p?.position ?? null,
    targetLevelKey: p?.targetLevelKey ?? null,
    theme: p?.theme ?? "system",
  };
}

async function buildMe(db: Db, user: CurrentUser): Promise<MeResponse> {
  const roleRows = await db
    .select({ role: memberships.roleKey, locationId: memberships.locationId })
    .from(memberships)
    .where(eq(memberships.userId, user.id));
  return {
    user: { id: user.id, name: user.name, email: user.email },
    roles: roleRows
      .filter((r): r is { role: RoleKey; locationId: string | null } => (ROLE_KEYS as readonly string[]).includes(r.role)),
    profile: await getProfile(db, user.id),
  };
}

export const meRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/", async (c) => c.json(await buildMe(c.var.db, c.var.user!)))
  .patch("/profile", zValidator("json", profileUpdateSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id; // always the caller: users can only edit their own profile

    let targetLevelId: string | null | undefined;
    if (input.targetLevelKey !== undefined) {
      if (input.targetLevelKey === null) {
        targetLevelId = null;
      } else {
        const [lvl] = await db.select({ id: levels.id }).from(levels).where(eq(levels.key, input.targetLevelKey));
        if (!lvl) {
          return c.json(
            { error: { code: "validation_error", message: "Nieznany poziom.", details: { targetLevelKey: "Nieznany poziom" } } },
            400,
          );
        }
        targetLevelId = lvl.id;
      }
    }

    const values = {
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(input.position !== undefined && { position: input.position }),
      ...(input.theme !== undefined && { theme: input.theme }),
      ...(targetLevelId !== undefined && { targetLevelId }),
    };
    await db
      .insert(userProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: userProfiles.userId, set: { ...values, updatedAt: new Date() } });

    return c.json({ profile: await getProfile(db, userId) });
  });
