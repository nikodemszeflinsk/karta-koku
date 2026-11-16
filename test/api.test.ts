import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { DashboardResponse, MeResponse } from "../src/shared/schemas";
import { api, cookieFrom, createUserWithRole, loginCookie, OWNER, setupOwner, signIn, SETUP_TOKEN } from "./helpers";

describe("public endpoints and security baseline", () => {
  it("health responds with security headers", async () => {
    const res = await api("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("unknown API routes return JSON 404", async () => {
    const res = await api("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it.each(["/api/me", "/api/dashboard", "/api/academy/categories", "/api/admin/users"])(
    "%s requires a session",
    async (path) => {
      const res = await api(path);
      expect(res.status).toBe(401);
    },
  );

  it("rejects state-changing requests from a foreign or missing Origin (CSRF)", async () => {
    for (const origin of ["https://evil.example", null]) {
      const res = await api("/api/setup/owner", { body: { token: SETUP_TOKEN, ...OWNER }, origin });
      expect(res.status).toBe(403);
    }
  });

  it("public sign-up is disabled", async () => {
    const res = await api("/api/auth/sign-up/email", {
      body: { email: "stranger@example.test", password: "some long password 1", name: "Stranger" },
    });
    expect(res.ok).toBe(false);
    const n = await env.DB.prepare("SELECT count(*) AS n FROM users").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });
});

describe("owner setup, sign-in and RBAC", () => {
  let ownerCookie = "";
  let learnerCookie = "";
  let learnerId = "";

  beforeAll(async () => {
    const status = await (await api("/api/setup/status")).json();
    expect(status).toEqual({ needsSetup: true, setupEnabled: true });
  });

  it("validates setup input", async () => {
    const res = await api("/api/setup/owner", { body: { token: SETUP_TOKEN, name: "A", email: "nope", password: "short" } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { details: Record<string, string> } };
    expect(Object.keys(body.error.details).sort()).toEqual(["email", "name", "password"]);
  });

  it("rejects a wrong setup token", async () => {
    const res = await api("/api/setup/owner", { body: { ...OWNER, token: "wrong-token" } });
    expect(res.status).toBe(403);
  });

  it("creates the owner exactly once", async () => {
    expect((await setupOwner()).status).toBe(201);
    expect((await setupOwner()).status).toBe(409);
    expect(await (await api("/api/setup/status")).json()).toMatchObject({ needsSetup: false });
  });

  it("stores the password as a PBKDF2 hash, never in plain text", async () => {
    const row = await env.DB.prepare("SELECT password FROM accounts WHERE provider_id = 'credential'").first<{
      password: string;
    }>();
    expect(row?.password).toMatch(/^pbkdf2-sha256\$/);
    expect(row?.password).not.toContain(OWNER.password);
  });

  it("rejects a wrong password", async () => {
    const res = await signIn(OWNER.email, "definitely wrong password");
    expect(res.status).toBe(401);
    expect(cookieFrom(res)).not.toContain("session_token=");
  });

  it("signs in with HttpOnly SameSite=Lax session cookie", async () => {
    const res = await signIn(OWNER.email, OWNER.password);
    expect(res.status).toBe(200);
    const setCookie = res.headers.getSetCookie().find((c) => c.includes("session_token="));
    expect(setCookie).toBeDefined();
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    ownerCookie = cookieFrom(res);
  });

  it("returns the owner's identity and role", async () => {
    const res = await api("/api/me", { cookie: ownerCookie });
    expect(res.status).toBe(200);
    const me = (await res.json()) as MeResponse;
    expect(me.user.email).toBe(OWNER.email);
    expect(me.roles).toEqual([{ role: "owner", locationId: null }]);
    expect(me.profile.displayName).toBe(OWNER.name);
  });

  it("serves the seeded academy structure", async () => {
    const cats = (await (await api("/api/academy/categories", { cookie: ownerCookie })).json()) as {
      categories: { name: string }[];
    };
    expect(cats.categories).toHaveLength(17);
    expect(cats.categories.at(-1)?.name).toBe("Karta KOKU");

    const lv = (await (await api("/api/academy/levels", { cookie: ownerCookie })).json()) as {
      levels: { key: string; competencies: unknown[] }[];
    };
    expect(lv.levels.map((l) => l.key)).toEqual(["advanced_cook", "chef", "sous_chef", "head_chef"]);
    expect(lv.levels.every((l) => l.competencies.length >= 5)).toBe(true);
  });

  it("updates the profile and reflects the target level on the dashboard", async () => {
    const bad = await api("/api/me/profile", { method: "PATCH", cookie: ownerCookie, body: { targetLevelKey: "nope" } });
    expect(bad.status).toBe(400);
    const extra = await api("/api/me/profile", { method: "PATCH", cookie: ownerCookie, body: { userId: "someone-else" } });
    expect(extra.status).toBe(400);

    const ok = await api("/api/me/profile", {
      method: "PATCH",
      cookie: ownerCookie,
      body: { targetLevelKey: "sous_chef", theme: "dark", position: "Kucharz sushi" },
    });
    expect(ok.status).toBe(200);

    const dash = (await (await api("/api/dashboard", { cookie: ownerCookie })).json()) as DashboardResponse;
    expect(dash.targetLevel?.key).toBe("sous_chef");
    expect(dash.ai.enabled).toBe(false);
    expect(dash.categories).toHaveLength(17);
    expect(dash.categories.find((c) => c.slug === "karta-koku")?.materialCount).toBe(37);
    expect(dash.openNotes).toBe(0);
  });

  it("lets the owner read users and the audit log", async () => {
    const users = await api("/api/admin/users", { cookie: ownerCookie });
    expect(users.status).toBe(200);
    const audit = (await (await api("/api/admin/audit-logs", { cookie: ownerCookie })).json()) as {
      entries: { action: string }[];
    };
    const actions = audit.entries.map((e) => e.action);
    expect(actions).toContain("setup.owner_created");
    expect(actions).toContain("auth.sign_in");
  });

  it("forbids a learner from admin endpoints", async () => {
    learnerId = await createUserWithRole("learner@example.test", "learner password 123", "learner");
    learnerCookie = await loginCookie("learner@example.test", "learner password 123");
    expect((await api("/api/admin/users", { cookie: learnerCookie })).status).toBe(403);
    expect((await api("/api/admin/audit-logs", { cookie: learnerCookie })).status).toBe(403);
  });

  it("isolates profiles: a learner sees and edits only their own data", async () => {
    const me = (await (await api("/api/me", { cookie: learnerCookie })).json()) as MeResponse;
    expect(me.user.id).toBe(learnerId);
    expect(me.roles).toEqual([{ role: "learner", locationId: null }]);

    await api("/api/me/profile", { method: "PATCH", cookie: learnerCookie, body: { displayName: "Uczeń" } });
    const owner = (await (await api("/api/me", { cookie: ownerCookie })).json()) as MeResponse;
    expect(owner.profile.displayName).toBe(OWNER.name);
    expect(owner.profile.targetLevelKey).toBe("sous_chef");
  });

  it("signs out and invalidates the session", async () => {
    const out = await api("/api/auth/sign-out", { body: {}, cookie: learnerCookie });
    expect(out.status).toBe(200);
    expect((await api("/api/me", { cookie: learnerCookie })).status).toBe(401);
  });

  it("rate-limits repeated failed sign-ins from one IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await api("/api/auth/sign-in/email", {
        body: { email: OWNER.email, password: `wrong password ${i}` },
        ip: "10.200.0.1",
      });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});
