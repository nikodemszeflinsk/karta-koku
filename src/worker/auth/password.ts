/**
 * Password hashing with PBKDF2-HMAC-SHA-256 via Web Crypto (native in Workers).
 *
 * Why not Better Auth's default scrypt: it runs in JavaScript and can exceed the
 * CPU-time limit of the Workers Free plan. PBKDF2 runs natively. Workers caps
 * PBKDF2 at 100 000 iterations, which is used here. The format is versioned so
 * the algorithm can be upgraded later.
 *
 * Format: pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>
 */
const ALGO = "pbkdf2-sha256";
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, KEY_BITS);
  return new Uint8Array(bits);
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(SALT_BYTES)));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `${ALGO}$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 4 || parts[0] !== ALGO) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return false;
  try {
    const salt = fromB64(parts[2] ?? "");
    const expected = fromB64(parts[3] ?? "");
    const actual = await derive(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Constant-time comparison of two strings (for tokens). */
export async function safeStringEqual(a: string, b: string): Promise<boolean> {
  // Hash both so lengths are equal and comparison time does not leak length.
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return timingSafeEqual(new Uint8Array(ha), new Uint8Array(hb));
}
