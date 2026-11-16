import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Applies the real migrations (incl. reference data) before tests run.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
