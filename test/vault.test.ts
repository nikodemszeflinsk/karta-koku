import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { VaultItemContent, VaultItemRow, VaultKeysRow } from "../src/shared/vault";
import { api, createUserWithRole, loginCookie, OWNER, setupOwner } from "./helpers";

const b64 = (n: number) => {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(bytes.subarray(i, Math.min(n, i + 65536)));
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const keys = () => ({
  kdf: { alg: "argon2id", memoryKiB: 65536, iterations: 3, parallelism: 1, salt: b64(16), v: 1 },
  wrappedDek: b64(48),
  wrappedDekIv: b64(12),
  recoveryWrappedDek: b64(48),
  recoveryWrappedDekIv: b64(12),
});

let owner = "";
let other = "";
let admin = "";
let k: ReturnType<typeof keys>;

beforeAll(async () => {
  await setupOwner();
  owner = await loginCookie(OWNER.email, OWNER.password);
  await createUserWithRole("v-other@example.test", "other password 1234", "learner");
  other = await loginCookie("v-other@example.test", "other password 1234");
  await createUserWithRole("v-admin@example.test", "admin password 1234", "admin");
  admin = await loginCookie("v-admin@example.test", "admin password 1234");
});

describe("vault keys", () => {
  it("validates key material and rejects weak KDF settings", async () => {
    const bad = [
      { ...keys(), kdf: { ...keys().kdf, memoryKiB: 1024 } },
      { ...keys(), wrappedDek: "to nie jest szyfrogram" },
      { ...keys(), wrappedDekIv: b64(16) },
      { ...keys(), kdf: { ...keys().kdf, alg: "pbkdf2" } },
    ];
    for (const body of bad) expect((await api("/api/vault/keys", { cookie: owner, body })).status).toBe(400);
  });

  it("creates the vault once and keeps it private", async () => {
    k = keys();
    expect((await api("/api/vault/keys", { cookie: owner, body: k })).status).toBe(201);
    expect((await api("/api/vault/keys", { cookie: owner, body: keys() })).status).toBe(409);
    const mine = (await (await api("/api/vault/keys", { cookie: owner })).json()) as { keys: VaultKeysRow };
    expect(mine.keys.wrappedDek).toBe(k.wrappedDek);
    const theirs = (await (await api("/api/vault/keys", { cookie: other })).json()) as { keys: null };
    expect(theirs.keys).toBeNull();
  });

  it("changes the wrapped key with optimistic locking, never the recovery wrap", async () => {
    const next = { ...k, wrappedDek: b64(48), wrappedDekIv: b64(12) };
    expect((await api("/api/vault/keys", { method: "PUT", cookie: owner, body: { ...next, expectedVersion: 5 } })).status).toBe(409);
    expect((await api("/api/vault/keys", { method: "PUT", cookie: owner, body: { ...next, recoveryWrappedDek: b64(48), expectedVersion: 1 } })).status).toBe(400);
    const ok = await api("/api/vault/keys", { method: "PUT", cookie: owner, body: { ...next, expectedVersion: 1 } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { version: number }).version).toBe(2);
  });
});

describe("vault items", () => {
  const id = crypto.randomUUID();
  const content = b64(2_500_000);

  it("requires a vault before storing items", async () => {
    const res = await api("/api/vault/items", { cookie: other, body: { id: crypto.randomUUID(), kind: "text", metaCiphertext: b64(40), metaIv: b64(12), contentIv: b64(12), content: b64(40) } });
    expect(res.status).toBe(409);
  });

  it("stores ciphertext in chunks and returns it byte-identical", async () => {
    const res = await api("/api/vault/items", { cookie: owner, body: { id, kind: "file", metaCiphertext: b64(60), metaIv: b64(12), contentIv: b64(12), content } });
    expect(res.status).toBe(201);
    const chunks = await env.DB.prepare("SELECT count(*) AS n FROM vault_chunks WHERE item_id = ?").bind(id).first<{ n: number }>();
    expect(chunks!.n).toBe(3);
    const got = (await (await api(`/api/vault/items/${id}`, { cookie: owner })).json()) as VaultItemContent;
    expect(got.content).toBe(content);
    expect(got.size).toBe(2_500_000);
    const list = (await (await api("/api/vault/items", { cookie: owner })).json()) as { items: VaultItemRow[] };
    expect(list.items.map((i) => i.id)).toEqual([id]);
    expect(JSON.stringify(list)).not.toContain(content.slice(0, 50));
  });

  it("rejects non-ciphertext input and oversized items", async () => {
    const plain = await api("/api/vault/items", { cookie: owner, body: { id: crypto.randomUUID(), kind: "text", metaCiphertext: "Tytuł: tajny sos", metaIv: b64(12), contentIv: b64(12), content: "38 g cukru" } });
    expect(plain.status).toBe(400);
    const big = await api("/api/vault/items", { cookie: owner, body: { id: crypto.randomUUID(), kind: "file", metaCiphertext: b64(40), metaIv: b64(12), contentIv: b64(12), content: b64(8 * 1024 * 1024 + 1) } });
    expect(big.status).toBe(413);
  });

  it("hides items from every other user, including admins", async () => {
    for (const cookie of [other, admin]) {
      expect((await api(`/api/vault/items/${id}`, { cookie })).status).toBe(404);
      expect((await api(`/api/vault/items/${id}`, { method: "DELETE", cookie })).status).toBe(404);
      const list = (await (await api("/api/vault/items", { cookie })).json()) as { items: unknown[] };
      expect(list.items).toHaveLength(0);
    }
  });

  it("deletes items (with chunks) and audits without content", async () => {
    expect((await api(`/api/vault/items/${id}`, { method: "DELETE", cookie: owner })).status).toBe(200);
    const chunks = await env.DB.prepare("SELECT count(*) AS n FROM vault_chunks WHERE item_id = ?").bind(id).first<{ n: number }>();
    expect(chunks!.n).toBe(0);
    const audit = await env.DB.prepare("SELECT action, metadata FROM audit_logs WHERE action LIKE 'vault.%' ORDER BY created_at").all<{ action: string; metadata: string | null }>();
    expect(audit.results.map((a) => a.action)).toEqual(["vault.created", "vault.password_changed", "vault.item_deleted"]);
    expect(audit.results.every((a) => a.metadata === null)).toBe(true);
  });
});
