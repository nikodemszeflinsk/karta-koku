import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, schema } from "../db/client";
import { writeAudit } from "../lib/audit";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export function createAuth(env: Env) {
  const db = getDb(env.DB);
  const appUrl = new URL(env.APP_URL);

  return betterAuth({
    appName: "Kuchnia formularze",
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [appUrl.origin],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        passkey: schema.passkeys,
        rateLimit: schema.rateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // Public registration is off. Accounts come from /setup (owner) or invitations.
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    session: {
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
      },
    },
    advanced: {
      cookiePrefix: "scl",
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
      database: { generateId: () => crypto.randomUUID() },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            await writeAudit(db, { actorId: session.userId, action: "auth.sign_in", entityType: "session" });
          },
        },
      },
    },
    plugins: [
      passkey({
        rpID: appUrl.hostname,
        rpName: "Kuchnia formularze",
        origin: appUrl.origin,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
