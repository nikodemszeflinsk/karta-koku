export type Effort = "low" | "medium" | "high";

export interface AiConfig {
  enabled: boolean;
  disabledReason: string | null;
  apiKey: string;
  baseUrl: string | undefined;
  model: string;
  modelLight: string;
  effort: Effort;
  maxOutputTokens: number;
  maxContextChars: number;
  ratePerMinute: number;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
}

function num(v: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function aiConfig(env: Env): AiConfig {
  const apiKey = env.ANTHROPIC_API_KEY ?? "";
  const effort = (["low", "medium", "high"] as const).find((e) => e === env.AI_EFFORT) ?? "low";
  let disabledReason: string | null = null;
  if (env.AI_ENABLED !== "true") disabledReason = "Trener AI jest wyłączony w konfiguracji (AI_ENABLED).";
  else if (!apiKey) disabledReason = "Brak klucza API Anthropic (sekret ANTHROPIC_API_KEY). Reszta aplikacji działa normalnie.";
  return {
    enabled: disabledReason === null,
    disabledReason,
    apiKey,
    baseUrl: env.AI_BASE_URL || undefined,
    model: env.AI_MODEL || "claude-sonnet-5-5",
    modelLight: env.AI_MODEL_LIGHT || "claude-haiku-5-5",
    effort,
    maxOutputTokens: num(env.AI_MAX_OUTPUT_TOKENS, 3000, 256, 16000),
    maxContextChars: num(env.AI_MAX_CONTEXT_CHARS, 24000, 2000, 200000),
    ratePerMinute: num(env.AI_RATE_PER_MINUTE, 6, 1, 120),
    dailyBudgetUsd: num(env.AI_DAILY_BUDGET_USD, 0.5, 0, 1000),
    monthlyBudgetUsd: num(env.AI_MONTHLY_BUDGET_USD, 5, 0, 10000),
  };
}

/**
 * USD per million tokens (Anthropic list prices, checked 2026-11). Used only to
 * ESTIMATE spend for the budget guard — the Anthropic console is authoritative.
 * Unknown models are priced like the most expensive known one (safe side).
 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};
const FALLBACK_PRICE = { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 };

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export function estimateCostMicroUsd(model: string, u: TokenUsage): number {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  // tokens * $/MTok = micro-dollars
  return Math.ceil(u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite);
}

/** Server-side refusal fallback is offered for these model families (not Haiku). */
export function supportsServerFallback(model: string): boolean {
  return /^claude-(sonnet-5-5|opus-5|fable-5)/.test(model);
}

export function warsawDay(d = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(d);
}
