import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { setAiProviderFactory } from "../src/worker/ai/provider";

// Applies the real migrations (incl. reference data) before tests run.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Safety net: no test may ever reach the real Anthropic API.
setAiProviderFactory(() => ({
  streamText: () => Promise.reject(new Error("Real AI provider must not be used in tests")),
  structured: () => Promise.reject(new Error("Real AI provider must not be used in tests")),
}));
