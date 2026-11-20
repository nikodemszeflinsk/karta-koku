import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MeResponse } from "../src/shared/schemas";
import { api } from "./helpers";

/* Prototype mode: without a session, kitchen routes act as the shared guest; nothing else opens up. */
const mutableEnv = env as unknown as { OPEN_ACCESS: string };

beforeAll(() => {
  mutableEnv.OPEN_ACCESS = "true";
});
afterAll(() => {
  mutableEnv.OPEN_ACCESS = "false";
});

describe("guest mode (OPEN_ACCESS)", () => {
  it("opens /me and the kitchen without signing in", async () => {
    const me = (await (await api("/api/me")).json()) as MeResponse;
    expect(me).toMatchObject({ guest: true, user: { id: "guest", name: "Gość" }, roles: [{ role: "trainer" }] });
    expect((await api("/api/kitchen/summary")).status).toBe(200);
    expect((await api("/api/kitchen/stock/shopping/items", { body: { name: "Imbir" } })).status).toBe(201);
  });

  it("lets the shared guest write a handover and acknowledge it", async () => {
    const r = await api("/api/kitchen/handovers", { body: { shiftDate: "2026-11-20", prep: [], shortages: [], hasFailure: false } });
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    expect((await api(`/api/kitchen/handovers/${id}/ack`, { body: {} })).status).toBe(200);
  });

  it("keeps everything else behind a login", async () => {
    for (const path of ["/api/notes", "/api/vault/status", "/api/team/members", "/api/academy/categories", "/api/recipes"]) {
      expect((await api(path)).status, path).toBe(401);
    }
  });

  it("still blocks cross-site writes", async () => {
    expect((await api("/api/kitchen/stock/shopping/items", { body: { name: "X" }, origin: "https://evil.example" })).status).toBe(403);
  });

  it("does not count the guest as an existing owner for setup", async () => {
    const s = (await (await api("/api/setup/status")).json()) as { needsSetup: boolean };
    expect(s.needsSetup).toBe(true);
  });
});
