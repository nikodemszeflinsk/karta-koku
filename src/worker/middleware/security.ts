import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

/** Headers for API responses. Static assets get theirs from public/_headers. */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("X-Frame-Options", "DENY");
  h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  h.set("Cache-Control", "no-store");
  if (new URL(c.req.url).protocol === "https:") {
    h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF protection: state-changing requests must come from the app's own origin.
 * Cookies are SameSite=Lax as a second layer.
 */
export const originCheck: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const allowed = new URL(c.env.APP_URL).origin;
  const origin = c.req.header("Origin");
  if (origin !== allowed) {
    return c.json({ error: { code: "forbidden_origin", message: "Niedozwolone źródło żądania." } }, 403);
  }
  return next();
};
