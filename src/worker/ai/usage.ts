import { and, eq, like, sql, sum } from "drizzle-orm";
import type { Db } from "../db/client";
import { aiUsage, rateLimits } from "../db/schema";
import { HttpError } from "../lib/errors";
import { estimateCostMicroUsd, warsawDay, type AiConfig, type TokenUsage } from "./config";

export async function spentMicroUsd(db: Db, userId: string): Promise<{ today: number; month: number }> {
  const day = warsawDay();
  const month = day.slice(0, 7);
  const [[t], [m]] = await Promise.all([
    db.select({ v: sum(aiUsage.costMicroUsd) }).from(aiUsage).where(and(eq(aiUsage.userId, userId), eq(aiUsage.day, day))),
    // Monthly budget is global (all users together) — it caps the owner's bill.
    db.select({ v: sum(aiUsage.costMicroUsd) }).from(aiUsage).where(like(aiUsage.day, `${month}-%`)),
  ]);
  return { today: Number(t?.v ?? 0), month: Number(m?.v ?? 0) };
}

/** Throws 429 when the per-minute rate or the daily/monthly budget is exhausted. */
export async function guardAiRequest(db: Db, cfg: AiConfig, userId: string): Promise<void> {
  const spent = await spentMicroUsd(db, userId);
  if (spent.today >= cfg.dailyBudgetUsd * 1_000_000) {
    throw new HttpError(429, "ai_daily_budget", `Wykorzystano dzienny budżet AI (${cfg.dailyBudgetUsd.toFixed(2)} USD). Spróbuj jutro albo zmień limit w konfiguracji.`);
  }
  if (spent.month >= cfg.monthlyBudgetUsd * 1_000_000) {
    throw new HttpError(429, "ai_monthly_budget", `Wykorzystano miesięczny budżet AI (${cfg.monthlyBudgetUsd.toFixed(2)} USD).`);
  }

  // Fixed 60-second window per user, stored in the rate_limits table.
  const key = `ai:${userId}`;
  const now = Date.now();
  const [row] = await db
    .insert(rateLimits)
    .values({ id: crypto.randomUUID(), key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${now} - ${rateLimits.lastRequest} > 60000 THEN 1 ELSE ${rateLimits.count} + 1 END`,
        lastRequest: sql`CASE WHEN ${now} - ${rateLimits.lastRequest} > 60000 THEN ${now} ELSE ${rateLimits.lastRequest} END`,
      },
    })
    .returning({ count: rateLimits.count });
  if ((row?.count ?? 0) > cfg.ratePerMinute) {
    throw new HttpError(429, "ai_rate_limited", "Za dużo zapytań do trenera w ciągu minuty. Odczekaj chwilę.");
  }
}

export async function recordUsage(db: Db, userId: string, model: string, u: TokenUsage): Promise<number> {
  const cost = estimateCostMicroUsd(model, u);
  await db
    .insert(aiUsage)
    .values({
      id: crypto.randomUUID(),
      userId,
      day: warsawDay(),
      model,
      requests: 1,
      inputTokens: u.input,
      outputTokens: u.output,
      cacheReadTokens: u.cacheRead,
      cacheWriteTokens: u.cacheWrite,
      costMicroUsd: cost,
    })
    .onConflictDoUpdate({
      target: [aiUsage.userId, aiUsage.day, aiUsage.model],
      set: {
        requests: sql`${aiUsage.requests} + 1`,
        inputTokens: sql`${aiUsage.inputTokens} + ${u.input}`,
        outputTokens: sql`${aiUsage.outputTokens} + ${u.output}`,
        cacheReadTokens: sql`${aiUsage.cacheReadTokens} + ${u.cacheRead}`,
        cacheWriteTokens: sql`${aiUsage.cacheWriteTokens} + ${u.cacheWrite}`,
        costMicroUsd: sql`${aiUsage.costMicroUsd} + ${cost}`,
      },
    });
  return cost;
}
