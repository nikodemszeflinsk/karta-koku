import { Hono } from "hono";
import { originCheck, securityHeaders } from "./middleware/security";
import { context, loadSession } from "./middleware/session";
import { academyRoutes } from "./modules/academy/routes";
import { adminRoutes } from "./modules/admin/routes";
import { dashboardRoutes } from "./modules/dashboard/routes";
import { meRoutes } from "./modules/me/routes";
import { setupRoutes } from "./modules/setup/routes";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", securityHeaders);
app.use("*", originCheck);
app.use("*", context);

app.get("/health", (c) => c.json({ ok: true }));

// Better Auth owns /api/auth/* (sign-in, sign-out, session, passkeys).
app.on(["GET", "POST"], "/auth/*", (c) => c.var.auth.handler(c.req.raw));

app.use("*", loadSession);
app.route("/setup", setupRoutes);
app.route("/me", meRoutes);
app.route("/academy", academyRoutes);
app.route("/dashboard", dashboardRoutes);
app.route("/admin", adminRoutes);

app.notFound((c) => c.json({ error: { code: "not_found", message: "Nie znaleziono." } }, 404));

app.onError((err, c) => {
  // Log only the error type/message; never request bodies (may contain confidential text).
  console.error("unhandled_error", err.name, err.message);
  return c.json({ error: { code: "internal_error", message: "Wystąpił błąd serwera." } }, 500);
});

export default app;
