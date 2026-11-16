import { Hono } from "hono";
import { HttpError } from "./lib/errors";
import { originCheck, securityHeaders } from "./middleware/security";
import { context, loadSession } from "./middleware/session";
import { aiRoutes } from "./modules/ai/routes";
import { learningRoutes } from "./modules/learning/routes";
import { vaultRoutes } from "./modules/vault/routes";
import { academyRoutes } from "./modules/academy/routes";
import { adminRoutes } from "./modules/admin/routes";
import { dashboardRoutes } from "./modules/dashboard/routes";
import { meRoutes } from "./modules/me/routes";
import { setupRoutes } from "./modules/setup/routes";
import { allergenRoutes, ingredientRoutes } from "./modules/ingredients/routes";
import { menuRoutes } from "./modules/menu/routes";
import { noteRoutes } from "./modules/notes/routes";
import { recipeRoutes } from "./modules/recipes/routes";
import { searchRoutes } from "./modules/search/routes";
import { sourceRoutes } from "./modules/sources/routes";
import { techniqueRoutes } from "./modules/techniques/routes";
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
app.route("/sources", sourceRoutes);
app.route("/ingredients", ingredientRoutes);
app.route("/allergens", allergenRoutes);
app.route("/techniques", techniqueRoutes);
app.route("/menu", menuRoutes);
app.route("/recipes", recipeRoutes);
app.route("/notes", noteRoutes);
app.route("/search", searchRoutes);
app.route("/ai", aiRoutes);
app.route("/learning", learningRoutes);
app.route("/vault", vaultRoutes);

app.notFound((c) => c.json({ error: { code: "not_found", message: "Nie znaleziono." } }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(
      { error: { code: err.code, message: err.message, ...(err.details === undefined ? {} : { details: err.details }) } },
      err.status,
    );
  }
  // Log only the error type/message; never request bodies (may contain confidential text).
  console.error("unhandled_error", err.name, err.message);
  return c.json({ error: { code: "internal_error", message: "Wystąpił błąd serwera." } }, 500);
});

export default app;
