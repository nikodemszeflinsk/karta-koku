// Runs in Node (vitest "client" project): real Web Crypto + real Argon2id (WASM).
import { describe, expect, it } from "vitest";
import {
  aad,
  changePassword,
  createVault,
  decryptBytes,
  decryptMeta,
  encryptBytes,
  encryptMeta,
  formatRecoveryKey,
  fromB64,
  parseRecoveryKey,
  resetPasswordWithRecovery,
  toB64,
  unlockWithPassword,
  WrongSecretError,
} from "./vault-crypto";

// Small Argon2 parameters keep tests fast; production uses DEFAULT_KDF (64 MiB, t=3).
const FAST = { memoryKiB: 1024, iterations: 1, parallelism: 1 };
const bytes = (s: string) => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;

describe("vault crypto", () => {
  it("round-trips data and never stores the DEK or password in plain form", async () => {
    const { keys, recoveryKey, dek } = await createVault("hasło sejfu 123", FAST);
    const serialized = JSON.stringify(keys);
    expect(serialized).not.toContain("hasło");
    expect(keys.kdf.alg).toBe("argon2id");
    expect(recoveryKey).toMatch(/^([0-9A-Z]{4}-){12}[0-9A-Z]{4}$/);

    const env = await encryptBytes(dek, bytes("Sos: 38 g cukru"), aad("item-1", "content"));
    expect(new TextDecoder().decode(env.ciphertext)).not.toContain("cukru");
    const again = await unlockWithPassword("hasło sejfu 123", keys);
    expect(new TextDecoder().decode(await decryptBytes(again, env, aad("item-1", "content")))).toBe("Sos: 38 g cukru");
  });

  it("uses a fresh IV for every encryption", async () => {
    const { dek } = await createVault("abcdefghij", FAST);
    const ivs = new Set<string>();
    for (let i = 0; i < 50; i++) ivs.add((await encryptBytes(dek, bytes("x"), aad("i", "content"))).iv);
    expect(ivs.size).toBe(50);
    expect(fromB64([...ivs][0]!).length).toBe(12);
  });

  it("rejects a wrong password", async () => {
    const { keys } = await createVault("poprawne hasło", FAST);
    await expect(unlockWithPassword("złe hasło", keys)).rejects.toBeInstanceOf(WrongSecretError);
  });

  it("detects tampered ciphertext and swapped records (AAD)", async () => {
    const { dek } = await createVault("abcdefghij", FAST);
    const env = await encryptBytes(dek, bytes("tajne"), aad("item-A", "content"));
    const tampered = new Uint8Array(env.ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    await expect(decryptBytes(dek, { iv: env.iv, ciphertext: tampered }, aad("item-A", "content"))).rejects.toThrow();
    await expect(decryptBytes(dek, env, aad("item-B", "content"))).rejects.toThrow();
    await expect(decryptBytes(dek, env, aad("item-A", "meta"))).rejects.toThrow();
  });

  it("encrypts metadata (titles) too", async () => {
    const { dek } = await createVault("abcdefghij", FAST);
    const m = await encryptMeta(dek, "it-1", { title: "Ryż KOKU", mime: "text/plain" });
    expect(m.ciphertext).not.toContain("KOKU");
    expect(await decryptMeta(dek, "it-1", m.iv, m.ciphertext)).toEqual({ title: "Ryż KOKU", mime: "text/plain" });
  });

  it("changes the password without re-encrypting data", async () => {
    const { keys, dek } = await createVault("stare hasło 1", FAST);
    const env = await encryptBytes(dek, bytes("dane"), aad("x", "content"));
    const next = await changePassword("stare hasło 1", "nowe hasło 2", keys, FAST);
    await expect(unlockWithPassword("stare hasło 1", next)).rejects.toBeInstanceOf(WrongSecretError);
    const k2 = await unlockWithPassword("nowe hasło 2", next);
    expect(new TextDecoder().decode(await decryptBytes(k2, env, aad("x", "content")))).toBe("dane");
    await expect(changePassword("złe", "x", keys, FAST)).rejects.toBeInstanceOf(WrongSecretError);
  });

  it("recovers access with the recovery key and rejects a wrong one", async () => {
    const { keys, recoveryKey, dek } = await createVault("zapomniane hasło", FAST);
    const env = await encryptBytes(dek, bytes("przepis"), aad("r", "content"));
    const reset = await resetPasswordWithRecovery(recoveryKey.toLowerCase(), "nowe hasło", keys, FAST);
    const k = await unlockWithPassword("nowe hasło", reset);
    expect(new TextDecoder().decode(await decryptBytes(k, env, aad("r", "content")))).toBe("przepis");
    const wrong = formatRecoveryKey(crypto.getRandomValues(new Uint8Array(32)));
    await expect(resetPasswordWithRecovery(wrong, "x", keys, FAST)).rejects.toBeInstanceOf(WrongSecretError);
    expect(() => parseRecoveryKey("ABC")).toThrow();
  });

  it("formats and parses recovery keys losslessly", () => {
    const b = crypto.getRandomValues(new Uint8Array(32));
    expect(toB64(parseRecoveryKey(formatRecoveryKey(b)))).toBe(toB64(b));
  });

  it("keeps the unlocked DEK non-extractable", async () => {
    const { keys } = await createVault("abcdefghij", FAST);
    const k = await unlockWithPassword("abcdefghij", keys);
    expect(k.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", k)).rejects.toThrow();
  });
});
