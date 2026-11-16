/**
 * Client-side vault cryptography. Nothing here ever sends a password, key or
 * plaintext to the server.
 *
 * Key hierarchy
 *   password ──Argon2id(salt, params)──▶ KEK (AES-GCM-256, non-extractable)
 *   recovery key (32 random bytes) ──HKDF-SHA-256(salt)──▶ RKEK (AES-GCM-256)
 *   DEK (random AES-GCM-256) is stored only wrapped by KEK and by RKEK.
 *   Every item: AES-GCM with a fresh 96-bit IV and AAD binding it to its
 *   item id and field, so ciphertexts cannot be swapped between records.
 */
import { argon2id } from "hash-wasm";

export const VAULT_FORMAT = 1;

export interface KdfParams {
  alg: "argon2id";
  /** Memory in KiB. */
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  salt: string; // base64
  v: number;
}

export interface KdfCost {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

/** OWASP-recommended Argon2id baseline: 64 MiB, 3 passes. */
export const DEFAULT_KDF: Readonly<KdfCost> = { memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 };

export interface WrappedKeys {
  kdf: KdfParams;
  wrappedDek: string;
  wrappedDekIv: string;
  recoveryWrappedDek: string;
  recoveryWrappedDekIv: string;
}

export interface Envelope {
  iv: string;
  ciphertext: Uint8Array<ArrayBuffer>;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function random(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
}

export function aad(itemId: string, field: "meta" | "content"): Uint8Array<ArrayBuffer> {
  return enc.encode(`scl-vault:v${VAULT_FORMAT}:${itemId}:${field}`) as Uint8Array<ArrayBuffer>;
}

const WRAP_AAD = enc.encode(`scl-vault:v${VAULT_FORMAT}:dek`) as Uint8Array<ArrayBuffer>;

async function aesKey(raw: Uint8Array<ArrayBuffer>, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, usages);
}

export async function deriveKek(password: string, kdf: KdfParams): Promise<CryptoKey> {
  if (kdf.alg !== "argon2id") throw new Error("Nieobsługiwany algorytm KDF");
  const raw = await argon2id({
    password: password.normalize("NFKC"),
    salt: fromB64(kdf.salt),
    parallelism: kdf.parallelism,
    iterations: kdf.iterations,
    memorySize: kdf.memoryKiB,
    hashLength: 32,
    outputType: "binary",
  });
  return aesKey(new Uint8Array(raw), ["wrapKey", "unwrapKey"]);
}

async function deriveRecoveryKek(recovery: Uint8Array<ArrayBuffer>, salt: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", recovery, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: fromB64(salt), info: enc.encode("scl-vault-recovery-v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

async function wrap(dek: CryptoKey, kek: CryptoKey): Promise<{ ct: string; iv: string }> {
  const iv = random(12);
  const ct = await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv, additionalData: WRAP_AAD });
  return { ct: toB64(new Uint8Array(ct)), iv: toB64(iv) };
}

async function unwrap(ct: string, iv: string, kek: CryptoKey): Promise<CryptoKey> {
  // The unwrapped DEK is non-extractable: it can encrypt/decrypt but never be exported by page scripts.
  return crypto.subtle.unwrapKey("raw", fromB64(ct), kek, { name: "AES-GCM", iv: fromB64(iv), additionalData: WRAP_AAD }, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 32 bytes → 52 Crockford base32 characters in groups of 4 (human-copyable). */
export function formatRecoveryKey(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join("-");
}

export function parseRecoveryKey(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (!/^[0-9A-HJKMNP-TV-Z]{52}$/.test(clean)) throw new Error("Nieprawidłowy format klucza odzyskiwania");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | CROCKFORD.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out.slice(0, 32));
}

/** Creates a new vault: returns material to store on the server + the recovery key to show ONCE. */
export async function createVault(password: string, kdfOverride?: Partial<KdfCost>): Promise<{ keys: WrappedKeys; recoveryKey: string; dek: CryptoKey }> {
  const kdf: KdfParams = { alg: "argon2id", ...DEFAULT_KDF, ...kdfOverride, salt: toB64(random(16)), v: VAULT_FORMAT };
  const dekExtractable = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const recovery = random(32);
  const [kek, rkek] = await Promise.all([deriveKek(password, kdf), deriveRecoveryKek(recovery, kdf.salt)]);
  const [w, rw] = await Promise.all([wrap(dekExtractable, kek), wrap(dekExtractable, rkek)]);
  const keys: WrappedKeys = { kdf, wrappedDek: w.ct, wrappedDekIv: w.iv, recoveryWrappedDek: rw.ct, recoveryWrappedDekIv: rw.iv };
  // Use a non-extractable copy from here on.
  const dek = await unwrap(w.ct, w.iv, kek);
  return { keys, recoveryKey: formatRecoveryKey(recovery), dek };
}

export class WrongSecretError extends Error {
  constructor() {
    super("Nieprawidłowe hasło lub klucz odzyskiwania.");
  }
}

export async function unlockWithPassword(password: string, keys: WrappedKeys): Promise<CryptoKey> {
  const kek = await deriveKek(password, keys.kdf);
  try {
    return await unwrap(keys.wrappedDek, keys.wrappedDekIv, kek);
  } catch {
    throw new WrongSecretError();
  }
}

/** Re-wraps the DEK under a new password. Needs the DEK in extractable form, recovered via the old secret. */
async function rewrap(oldKek: CryptoKey, oldCt: string, oldIv: string, keys: WrappedKeys, newPassword: string, kdfOverride?: Partial<KdfCost>): Promise<WrappedKeys> {
  let dek: CryptoKey;
  try {
    dek = await crypto.subtle.unwrapKey("raw", fromB64(oldCt), oldKek, { name: "AES-GCM", iv: fromB64(oldIv), additionalData: WRAP_AAD }, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  } catch {
    throw new WrongSecretError();
  }
  // Keep the salt so the recovery wrap (HKDF over the same salt) stays valid.
  const kdf: KdfParams = { ...keys.kdf, ...DEFAULT_KDF, ...kdfOverride };
  const w = await wrap(dek, await deriveKek(newPassword, kdf));
  return { ...keys, kdf, wrappedDek: w.ct, wrappedDekIv: w.iv };
}

export async function changePassword(oldPassword: string, newPassword: string, keys: WrappedKeys, kdfOverride?: Partial<KdfCost>): Promise<WrappedKeys> {
  return rewrap(await deriveKek(oldPassword, keys.kdf), keys.wrappedDek, keys.wrappedDekIv, keys, newPassword, kdfOverride);
}

export async function resetPasswordWithRecovery(recoveryKey: string, newPassword: string, keys: WrappedKeys, kdfOverride?: Partial<KdfCost>): Promise<WrappedKeys> {
  const rkek = await deriveRecoveryKek(parseRecoveryKey(recoveryKey), keys.kdf.salt);
  return rewrap(rkek, keys.recoveryWrappedDek, keys.recoveryWrappedDekIv, keys, newPassword, kdfOverride);
}

export async function encryptBytes(dek: CryptoKey, plaintext: Uint8Array<ArrayBuffer>, additionalData: Uint8Array<ArrayBuffer>): Promise<Envelope> {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, dek, plaintext);
  return { iv: toB64(iv), ciphertext: new Uint8Array(ct) };
}

export async function decryptBytes(dek: CryptoKey, env: { iv: string; ciphertext: Uint8Array<ArrayBuffer> }, additionalData: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(env.iv), additionalData }, dek, env.ciphertext));
  } catch {
    throw new Error("Nie można odszyfrować danych (uszkodzone lub podmienione).");
  }
}

export interface ItemMeta {
  title: string;
  fileName?: string;
  mime?: string;
}

export async function encryptMeta(dek: CryptoKey, itemId: string, meta: ItemMeta): Promise<{ iv: string; ciphertext: string }> {
  const e = await encryptBytes(dek, enc.encode(JSON.stringify(meta)) as Uint8Array<ArrayBuffer>, aad(itemId, "meta"));
  return { iv: e.iv, ciphertext: toB64(e.ciphertext) };
}

export async function decryptMeta(dek: CryptoKey, itemId: string, iv: string, ciphertext: string): Promise<ItemMeta> {
  return JSON.parse(dec.decode(await decryptBytes(dek, { iv, ciphertext: fromB64(ciphertext) }, aad(itemId, "meta")))) as ItemMeta;
}

export const textEncoder = enc;
export const textDecoder = dec;
