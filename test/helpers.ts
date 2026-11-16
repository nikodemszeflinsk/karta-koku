import { env, exports } from "cloudflare:workers";
import { createAuth } from "../src/worker/auth/auth";
import { getDb } from "../src/worker/db/client";
import { memberships, userProfiles } from "../src/worker/db/schema";
import type { RoleKey } from "../src/shared/roles";

export const ORIGIN = new URL(env.APP_URL).origin;
export const SETUP_TOKEN = env.SETUP_TOKEN;

let ipCounter = 0;
/** Distinct client IP per call site so Better Auth's rate limiter does not couple tests. */
export function freshIp(): string {
  ipCounter++;
  return `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

export interface ReqOpts {
  method?: string;
  body?: unknown;
  cookie?: string;
  origin?: string | null;
  ip?: string;
}

export function api(path: string, opts: ReqOpts = {}): Promise<Response> {
  const headers = new Headers();
  if (opts.body !== undefined) headers.set("Content-Type", "application/json");
  if (opts.cookie) headers.set("Cookie", opts.cookie);
  const origin = opts.origin === undefined ? ORIGIN : opts.origin;
  if (origin) headers.set("Origin", origin);
  headers.set("cf-connecting-ip", opts.ip ?? "10.255.0.1");
  return exports.default.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
  );
}

/** Turns Set-Cookie headers into a Cookie request header. */
export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

export const OWNER = { name: "Właściciel Testowy", email: "owner@example.test", password: "correct horse battery 1" };

export async function setupOwner(): Promise<Response> {
  return api("/api/setup/owner", { body: { token: SETUP_TOKEN, ...OWNER } });
}

export async function signIn(email: string, password: string): Promise<Response> {
  return api("/api/auth/sign-in/email", { body: { email, password }, ip: freshIp() });
}

/** Creates a user directly (bypasses disabled sign-up, as invitations will in Stage 6). */
export async function createUserWithRole(email: string, password: string, role: RoleKey): Promise<string> {
  const auth = createAuth(env);
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email, name: email.split("@")[0] ?? "user", emailVerified: true }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  const db = getDb(env.DB);
  await db.insert(memberships).values({ id: crypto.randomUUID(), userId: user.id, roleKey: role, locationId: null });
  await db.insert(userProfiles).values({ userId: user.id });
  return user.id;
}

export async function loginCookie(email: string, password: string): Promise<string> {
  const res = await signIn(email, password);
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  return cookieFrom(res);
}
