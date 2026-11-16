import { z } from "zod";

/** Max ciphertext size per item (bytes). Stored in D1 in 1 MiB chunks. */
export const VAULT_MAX_ITEM_BYTES = 8 * 1024 * 1024;
export const VAULT_MAX_ITEMS = 500;
export const VAULT_CHUNK_BYTES = 1024 * 1024;

const b64 = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Oczekiwano danych zaszyfrowanych (base64)");
/** AES-GCM IV: 12 bytes = 16 base64 chars. */
const iv = z.string().regex(/^[A-Za-z0-9+/]{16}$/, "Nieprawidłowy wektor IV");

export const vaultKeysSchema = z.object({
  kdf: z.object({
    alg: z.literal("argon2id"),
    memoryKiB: z.number().int().min(19 * 1024).max(1024 * 1024),
    iterations: z.number().int().min(2).max(20),
    parallelism: z.number().int().min(1).max(8),
    salt: b64(22, 64),
    v: z.literal(1),
  }),
  // Wrapped 256-bit key + 16-byte GCM tag = 48 bytes = 64 base64 chars.
  wrappedDek: b64(64, 64),
  wrappedDekIv: iv,
  recoveryWrappedDek: b64(64, 64),
  recoveryWrappedDekIv: iv,
});
export type VaultKeysInput = z.infer<typeof vaultKeysSchema>;

export const vaultKeysUpdateSchema = vaultKeysSchema.extend({ expectedVersion: z.number().int().positive() });

export const vaultItemCreateSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["text", "file"]),
  metaCiphertext: b64(24, 8000),
  metaIv: iv,
  contentIv: iv,
  /** Ciphertext as base64; at least the 16-byte GCM tag. */
  content: b64(24, Math.ceil((VAULT_MAX_ITEM_BYTES * 4) / 3) + 4),
});

export interface VaultKeysRow extends VaultKeysInput {
  version: number;
}

export interface VaultItemRow {
  id: string;
  kind: "text" | "file";
  metaCiphertext: string;
  metaIv: string;
  size: number;
  createdAt: string;
}

export interface VaultItemContent extends VaultItemRow {
  contentIv: string;
  content: string;
}
