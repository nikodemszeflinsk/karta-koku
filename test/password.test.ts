import { describe, expect, it } from "vitest";
import { hashPassword, PBKDF2_ITERATIONS, safeStringEqual, verifyPassword } from "../src/worker/auth/password";

describe("password hashing (PBKDF2-SHA-256)", () => {
  it("produces a versioned hash that verifies", async () => {
    const hash = await hashPassword("Zażółć gęślą jaźń 123");
    expect(hash).toMatch(new RegExp(`^pbkdf2-sha256\\$${PBKDF2_ITERATIONS}\\$[A-Za-z0-9+/=]+\\$[A-Za-z0-9+/=]+$`));
    expect(await verifyPassword({ hash, password: "Zażółć gęślą jaźń 123" })).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct password 1");
    expect(await verifyPassword({ hash, password: "correct password 2" })).toBe(false);
  });

  it("uses a random salt (same password -> different hashes)", async () => {
    const [a, b] = await Promise.all([hashPassword("same password"), hashPassword("same password")]);
    expect(a).not.toBe(b);
  });

  it("rejects malformed or foreign hashes without throwing", async () => {
    for (const hash of ["", "plain", "bcrypt$10$x$y", "pbkdf2-sha256$999999999$AAAA$AAAA", "pbkdf2-sha256$100$***$***"]) {
      expect(await verifyPassword({ hash, password: "x" })).toBe(false);
    }
  });

  it("detects a tampered hash", async () => {
    const hash = await hashPassword("abc def ghi jkl");
    const parts = hash.split("$");
    const tampered = [...parts.slice(0, 3), btoa("x".repeat(32))].join("$");
    expect(await verifyPassword({ hash: tampered, password: "abc def ghi jkl" })).toBe(false);
  });

  it("compares tokens safely", async () => {
    expect(await safeStringEqual("abc", "abc")).toBe(true);
    expect(await safeStringEqual("abc", "abd")).toBe(false);
    expect(await safeStringEqual("abc", "abcd")).toBe(false);
  });
});
