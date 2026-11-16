import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { MeResponse } from "../src/shared/schemas";
import type { InvitationRow, TeamMember } from "../src/shared/team";
import { api, createUserWithRole, loginCookie, OWNER, setupOwner, signIn } from "./helpers";

let owner = "";
let admin = "";
let learner = "";
let locA = "";
let locB = "";

const tokenOf = (url: string) => url.split("/zaproszenie/")[1]!;

beforeAll(async () => {
  await setupOwner();
  owner = await loginCookie(OWNER.email, OWNER.password);
  await createUserWithRole("t-admin@example.test", "admin password 1234", "admin");
  admin = await loginCookie("t-admin@example.test", "admin password 1234");
  await createUserWithRole("t-learner@example.test", "learner password 123", "learner");
  learner = await loginCookie("t-learner@example.test", "learner password 123");
});

describe("locations", () => {
  it("lets admins create locations, not learners", async () => {
    expect((await api("/api/team/locations", { cookie: learner, body: { name: "Lokal X" } })).status).toBe(403);
    locA = ((await (await api("/api/team/locations", { cookie: owner, body: { name: "KOKU Centrum", city: "Łódź" } })).json()) as { id: string }).id;
    locB = ((await (await api("/api/team/locations", { cookie: admin, body: { name: "KOKU Galeria" } })).json()) as { id: string }).id;
    expect(locA && locB).toBeTruthy();
  });
});

describe("invitations", () => {
  let trainerUrl = "";

  it("restricts who can invite whom", async () => {
    expect((await api("/api/team/invitations", { cookie: learner, body: { email: "a@example.test", roleKey: "learner" } })).status).toBe(403);
    expect((await api("/api/team/invitations", { cookie: admin, body: { email: "a@example.test", roleKey: "admin" } })).status).toBe(403);
    expect((await api("/api/team/invitations", { cookie: owner, body: { email: "t-learner@example.test", roleKey: "learner" } })).status).toBe(409);
    expect((await api("/api/team/invitations", { cookie: owner, body: { email: "x@example.test", roleKey: "owner" } })).status).toBe(400);
  });

  it("creates a single-use invitation whose token is stored only as a hash", async () => {
    const res = await api("/api/team/invitations", { cookie: admin, body: { email: "Trener@Example.test", roleKey: "trainer", locationId: locA } });
    expect(res.status).toBe(201);
    trainerUrl = ((await res.json()) as { url: string }).url;
    const token = tokenOf(trainerUrl);
    expect(token.length).toBeGreaterThanOrEqual(40);
    const row = await env.DB.prepare("SELECT token_hash, email FROM invitations WHERE email = 'trener@example.test'").first<{ token_hash: string; email: string }>();
    expect(row!.token_hash).not.toBe(token);
    expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    const dump = await env.DB.prepare("SELECT * FROM invitations").all();
    expect(JSON.stringify(dump.results)).not.toContain(token);
  });

  it("shows invitation details publicly by token and accepts it once", async () => {
    const token = tokenOf(trainerUrl);
    const info = (await (await api(`/api/invitations/${token}`)).json()) as { email: string; roleKey: string; locationName: string };
    expect(info).toEqual({ email: "trener@example.test", roleKey: "trainer", locationName: "KOKU Centrum" });

    const bad = await api("/api/invitations/accept", { body: { token, name: "T", password: "short" } });
    expect(bad.status).toBe(400);
    const ok = await api("/api/invitations/accept", { body: { token, name: "Trener Jan", password: "trener password 123" } });
    expect(ok.status).toBe(201);
    expect((await api("/api/invitations/accept", { body: { token, name: "Ktoś", password: "inne haslo 12345" } })).status).toBe(404);
    expect((await api(`/api/invitations/${token}`)).status).toBe(404);

    const login = await signIn("trener@example.test", "trener password 123");
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const me = (await (await api("/api/me", { cookie })).json()) as MeResponse;
    expect(me.roles.map((r) => r.role).sort()).toEqual(["trainer", "trainer"]);
    expect(me.roles.some((r) => r.locationId === locA)).toBe(true);
  });

  it("rejects revoked, expired and unknown tokens", async () => {
    const r1 = (await (await api("/api/team/invitations", { cookie: owner, body: { email: "rev@example.test", roleKey: "learner" } })).json()) as { id: string; url: string };
    expect((await api(`/api/team/invitations/${r1.id}/revoke`, { cookie: owner, body: {} })).status).toBe(200);
    expect((await api("/api/invitations/accept", { body: { token: tokenOf(r1.url), name: "Rev", password: "revoked password 1" } })).status).toBe(404);

    const r2 = (await (await api("/api/team/invitations", { cookie: owner, body: { email: "exp@example.test", roleKey: "learner" } })).json()) as { id: string; url: string };
    await env.DB.prepare("UPDATE invitations SET expires_at = 1 WHERE id = ?").bind(r2.id).run();
    expect((await api("/api/invitations/accept", { body: { token: tokenOf(r2.url), name: "Exp", password: "expired password 1" } })).status).toBe(404);
    expect((await api("/api/invitations/accept", { body: { token: "x".repeat(43), name: "Nobody", password: "nobody password 1" } })).status).toBe(404);

    const list = (await (await api("/api/team/invitations", { cookie: owner })).json()) as { invitations: InvitationRow[] };
    const st = Object.fromEntries(list.invitations.map((i) => [i.email, i.status]));
    expect(st).toMatchObject({ "trener@example.test": "accepted", "rev@example.test": "revoked", "exp@example.test": "expired" });
  });
});

describe("roles and team visibility", () => {
  it("protects the owner and the admin role", async () => {
    const ownerId = (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(OWNER.email).first<{ id: string }>())!.id;
    expect((await api(`/api/team/members/${ownerId}/roles`, { cookie: admin, body: { roleKey: "learner", locationId: null } })).status).toBe(403);
    const learnerId = (await env.DB.prepare("SELECT id FROM users WHERE email = 't-learner@example.test'").first<{ id: string }>())!.id;
    expect((await api(`/api/team/members/${learnerId}/roles`, { cookie: admin, body: { roleKey: "admin", locationId: null } })).status).toBe(403);
    expect((await api(`/api/team/members/${learnerId}/roles`, { cookie: admin, body: { roleKey: "learner", locationId: locB } })).status).toBe(200);
    expect((await api(`/api/team/members/${learnerId}/roles`, { cookie: learner, body: { roleKey: "trainer", locationId: null } })).status).toBe(403);
  });

  it("shows a trainer only people from their locations, with progress but no private data", async () => {
    expect((await api("/api/team/members", { cookie: learner })).status).toBe(403);
    const trainer = await loginCookie("trener@example.test", "trener password 123");
    // Put the learner into the trainer's location.
    const learnerId = (await env.DB.prepare("SELECT id FROM users WHERE email = 't-learner@example.test'").first<{ id: string }>())!.id;
    await api(`/api/team/members/${learnerId}/roles`, { cookie: owner, body: { roleKey: "learner", locationId: locA } });
    const { members } = (await (await api("/api/team/members", { cookie: trainer })).json()) as { members: TeamMember[] };
    expect(members.map((m) => m.email).sort()).toEqual(["t-learner@example.test", "trener@example.test"]);
    expect(Object.keys(members[0]!).sort()).toEqual(["createdAt", "email", "id", "name", "progress", "roles"]);

    const all = (await (await api("/api/team/members", { cookie: owner })).json()) as { members: TeamMember[] };
    expect(all.members.length).toBeGreaterThanOrEqual(4);
  });

  it("audits team operations", async () => {
    const rows = await env.DB.prepare("SELECT DISTINCT action FROM audit_logs").all<{ action: string }>();
    const actions = rows.results.map((r) => r.action);
    for (const a of ["location.created", "invitation.created", "invitation.accepted", "invitation.revoked", "role.assigned"]) expect(actions).toContain(a);
  });
});
