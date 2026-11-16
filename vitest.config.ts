import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    test: {
      projects: [
        {
          // Worker + API tests run inside the Workers runtime with real D1 migrations.
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
                  SETUP_TOKEN: "test-setup-token-0123456789",
                  // Not a real key: tests replace the AI provider with a fake (see test/apply-migrations.ts).
                  ANTHROPIC_API_KEY: "test-not-a-real-key",
                },
              },
            }),
          ],
          test: {
            name: "worker",
            include: ["test/**/*.test.ts"],
            setupFiles: ["./test/apply-migrations.ts"],
          },
        },
        {
          // Browser-side code (vault cryptography) runs in Node: real Web Crypto + WebAssembly.
          test: { name: "client", environment: "node", include: ["src/client/**/*.test.ts"] },
        },
      ],
    },
  };
});
