import { zValidator } from "@hono/zod-validator";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  VAULT_CHUNK_BYTES,
  VAULT_MAX_ITEM_BYTES,
  VAULT_MAX_ITEMS,
  vaultItemCreateSchema,
  vaultKeysSchema,
  vaultKeysUpdateSchema,
  type VaultItemContent,
  type VaultItemRow,
  type VaultKeysRow,
} from "../../../shared/vault";
import { vaultChunks, vaultItems, vaultKeys } from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { HttpError } from "../../lib/errors";
import { iso, notFound, versionConflict } from "../../lib/knowledge";
import { validationHook } from "../../lib/validation";
import { requireAuth } from "../../middleware/session";
import type { AppEnv } from "../../types";

/*
 * The vault is end-to-end encrypted in the browser. This API stores and returns
 * opaque ciphertext only: it has no plaintext fields, never logs content, and every
 * query is scoped to the owner (other users — including admins — get 404).
 * Nothing here is ever sent to the AI.
 */

function decodeB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function encodeB64(parts: Uint8Array[]): string {
  let s = "";
  for (const p of parts) for (let i = 0; i < p.length; i += 0x8000) s += String.fromCharCode(...p.subarray(i, i + 0x8000));
  return btoa(s);
}

export const vaultRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .get("/keys", async (c) => {
    const [k] = await c.var.db.select().from(vaultKeys).where(eq(vaultKeys.ownerId, c.var.user!.id));
    if (!k) return c.json({ keys: null });
    const out: VaultKeysRow = {
      kdf: k.kdf as VaultKeysRow["kdf"],
      wrappedDek: k.wrappedDek,
      wrappedDekIv: k.wrappedDekIv,
      recoveryWrappedDek: k.recoveryWrappedDek,
      recoveryWrappedDekIv: k.recoveryWrappedDekIv,
      version: k.version,
    };
    return c.json({ keys: out });
  })
  .post("/keys", zValidator("json", vaultKeysSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id;
    const [existing] = await db.select({ v: vaultKeys.version }).from(vaultKeys).where(eq(vaultKeys.ownerId, userId));
    if (existing) throw new HttpError(409, "vault_exists", "Sejf już istnieje.");
    await db.insert(vaultKeys).values({ ownerId: userId, ...input });
    await writeAudit(db, { actorId: userId, action: "vault.created", entityType: "vault" });
    return c.json({ ok: true }, 201);
  })
  .put("/keys", zValidator("json", vaultKeysUpdateSchema, validationHook), async (c) => {
    const { expectedVersion, ...input } = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id;
    const [k] = await db.select().from(vaultKeys).where(eq(vaultKeys.ownerId, userId));
    if (!k) notFound("Sejf nie istnieje.");
    if (k.version !== expectedVersion) versionConflict();
    // The recovery wrap and salt never change on a password change (the client keeps them).
    if (input.recoveryWrappedDek !== k.recoveryWrappedDek || input.kdf.salt !== (k.kdf as { salt: string }).salt) {
      throw new HttpError(400, "validation_error", "Zmiana hasła nie może zmieniać klucza odzyskiwania.");
    }
    const res = await db
      .update(vaultKeys)
      .set({ ...input, version: k.version + 1, updatedAt: new Date() })
      .where(and(eq(vaultKeys.ownerId, userId), eq(vaultKeys.version, expectedVersion)))
      .returning({ v: vaultKeys.version });
    if (res.length === 0) versionConflict();
    await writeAudit(db, { actorId: userId, action: "vault.password_changed", entityType: "vault" });
    return c.json({ ok: true, version: res[0]!.v });
  })
  .get("/items", async (c) => {
    const rows = await c.var.db
      .select({ id: vaultItems.id, kind: vaultItems.kind, metaCiphertext: vaultItems.metaCiphertext, metaIv: vaultItems.metaIv, size: vaultItems.size, createdAt: vaultItems.createdAt })
      .from(vaultItems)
      .where(eq(vaultItems.ownerId, c.var.user!.id))
      .orderBy(desc(vaultItems.createdAt));
    const out: VaultItemRow[] = rows.map((r) => ({ ...r, createdAt: iso(r.createdAt) }));
    return c.json({ items: out });
  })
  .post("/items", zValidator("json", vaultItemCreateSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id;
    const [k] = await db.select({ v: vaultKeys.version }).from(vaultKeys).where(eq(vaultKeys.ownerId, userId));
    if (!k) throw new HttpError(409, "no_vault", "Najpierw utwórz sejf.");
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(vaultItems).where(eq(vaultItems.ownerId, userId));
    if (n >= VAULT_MAX_ITEMS) throw new HttpError(409, "vault_full", `Limit ${VAULT_MAX_ITEMS} wpisów w sejfie.`);
    const bytes = decodeB64(input.content);
    if (bytes.length > VAULT_MAX_ITEM_BYTES) throw new HttpError(413, "too_large", "Plik jest za duży (maks. 8 MB).");
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for (let i = 0; i < bytes.length; i += VAULT_CHUNK_BYTES) chunks.push(bytes.slice(i, i + VAULT_CHUNK_BYTES));
    try {
      await db.batch([
        db.insert(vaultItems).values({
          id: input.id,
          ownerId: userId,
          kind: input.kind,
          metaCiphertext: input.metaCiphertext,
          metaIv: input.metaIv,
          contentIv: input.contentIv,
          size: bytes.length,
          chunks: chunks.length,
        }),
        ...chunks.map((data, idx) => db.insert(vaultChunks).values({ itemId: input.id, idx, data: Buffer.from(data) })),
      ]);
    } catch (e) {
      if (String(e instanceof Error ? `${e.message} ${String(e.cause ?? "")}` : e).includes("UNIQUE constraint failed")) {
        throw new HttpError(409, "duplicate", "Wpis o tym identyfikatorze już istnieje.");
      }
      throw e;
    }
    return c.json({ id: input.id, size: bytes.length }, 201);
  })
  .get("/items/:id", async (c) => {
    const db = c.var.db;
    const [it] = await db.select().from(vaultItems).where(and(eq(vaultItems.id, c.req.param("id")), eq(vaultItems.ownerId, c.var.user!.id)));
    if (!it) notFound("Nie znaleziono wpisu.");
    const parts = await db.select({ data: vaultChunks.data }).from(vaultChunks).where(eq(vaultChunks.itemId, it.id)).orderBy(asc(vaultChunks.idx));
    const out: VaultItemContent = {
      id: it.id,
      kind: it.kind,
      metaCiphertext: it.metaCiphertext,
      metaIv: it.metaIv,
      size: it.size,
      createdAt: iso(it.createdAt),
      contentIv: it.contentIv,
      content: encodeB64(parts.map((p) => new Uint8Array(p.data))),
    };
    return c.json(out);
  })
  .delete("/items/:id", async (c) => {
    const db = c.var.db;
    const userId = c.var.user!.id;
    const res = await db.delete(vaultItems).where(and(eq(vaultItems.id, c.req.param("id")), eq(vaultItems.ownerId, userId))).returning({ id: vaultItems.id });
    if (res.length === 0) notFound("Nie znaleziono wpisu.");
    await writeAudit(db, { actorId: userId, action: "vault.item_deleted", entityType: "vault_item", entityId: res[0]!.id });
    return c.json({ ok: true });
  });
