import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AiStatus, ChatMessageRow, EvaluationRow } from "../src/shared/ai";
import { aiConfig, estimateCostMicroUsd, warsawDay } from "../src/worker/ai/config";
import { trimHistory } from "../src/worker/ai/context";
import { COACH_SYSTEM_PROMPT } from "../src/worker/ai/prompts";
import { setAiProviderFactory, type AiProvider, type AiRequest } from "../src/worker/ai/provider";
import { HttpError } from "../src/worker/lib/errors";
import { api, createUserWithRole, loginCookie, OWNER, setupOwner } from "./helpers";

const calls: AiRequest[] = [];
let failNext: Error | null = null;
const REPLY = "Ryż twardnieje przez retrogradację skrobi. Co się dzieje z amylozą w niskiej temperaturze?";

const fake: AiProvider = {
  async streamText(req, onText) {
    calls.push(req);
    if (failNext) {
      const e = failNext;
      failNext = null;
      throw e;
    }
    const text = req.maxTokens <= 60 ? "Retrogradacja ryżu" : REPLY;
    for (const chunk of text.match(/.{1,20}/g) ?? []) onText(chunk);
    return { text, stopReason: "end_turn", model: req.model, usage: { input: 1200, output: 300, cacheRead: 0, cacheWrite: 0 } };
  },
  async structured(req) {
    calls.push(req);
    const isDraft = req.system[0]?.includes("szkic karty składnika");
    const data = isDraft
      ? { properties: [{ aspect: "texture", content: "Szkic: tekstura testowa." }, { aspect: "heating", content: "Szkic: podgrzewanie testowe." }] }
      : {
          verdict: "partially_correct",
          correctness: 70,
          reasoning_quality: 35,
          feedback: "Wynik dobry, brak uzasadnienia mechanizmu.",
          misconceptions: ["myli żelatynizację z retrogradacją"],
          follow_up_question: "Dlaczego ryż w lodówce twardnieje szybciej niż w temperaturze pokojowej?",
          competency_keys: ["ac_raw_materials", "not_a_real_key"],
        };
    return { text: JSON.stringify(data), stopReason: "end_turn", model: req.model, usage: { input: 800, output: 200, cacheRead: 0, cacheWrite: 0 }, data: data as never };
  },
};

function parseSse(body: string): { event: string; data: Record<string, unknown> }[] {
  return body
    .split("\n\n")
    .filter((b) => b.trim())
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "{}") as Record<string, unknown>;
      return { event, data };
    });
}

let owner = "";
let other = "";
let learner = "";
let sessionId = "";

beforeAll(async () => {
  setAiProviderFactory(() => fake);
  await setupOwner();
  owner = await loginCookie(OWNER.email, OWNER.password);
  await createUserWithRole("other@example.test", "other password 1234", "learner");
  other = await loginCookie("other@example.test", "other password 1234");
  await createUserWithRole("learner3@example.test", "learner password 123", "learner");
  learner = await loginCookie("learner3@example.test", "learner password 123");
});
afterAll(() => setAiProviderFactory(() => ({ streamText: () => Promise.reject(new Error("no")), structured: () => Promise.reject(new Error("no")) })));

describe("configuration", () => {
  it("disables AI without a key or when switched off, with a reason", () => {
    const base = { ...env } as Env;
    expect(aiConfig({ ...base, ANTHROPIC_API_KEY: "" }).enabled).toBe(false);
    expect(aiConfig({ ...base, ANTHROPIC_API_KEY: "" }).disabledReason).toContain("ANTHROPIC_API_KEY");
    expect(aiConfig({ ...base, AI_ENABLED: "false" }).enabled).toBe(false);
    expect(aiConfig(base).model).toBe("claude-sonnet-5-5");
    expect(aiConfig(base).modelLight).toBe("claude-haiku-5-5");
    expect(aiConfig({ ...base, AI_EFFORT: "max" }).effort).toBe("low");
  });

  it("estimates cost and never under-prices unknown models", () => {
    const u = { input: 1_000_000, output: 100_000, cacheRead: 0, cacheWrite: 0 };
    expect(estimateCostMicroUsd("claude-sonnet-5-5", u)).toBe(3_000_000);
    expect(estimateCostMicroUsd("claude-haiku-5-5", u)).toBe(150_000);
    expect(estimateCostMicroUsd("some-future-model", u)).toBeGreaterThan(3_000_000);
  });

  it("trims history to budget and keeps alternating roles starting with user", () => {
    const h = trimHistory(
      [
        { role: "assistant", content: "a" },
        { role: "user", content: "x".repeat(50) },
        { role: "user", content: "y" },
        { role: "assistant", content: "z" },
        { role: "user", content: "q" },
      ],
      1000,
    );
    expect(h.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(h[0]!.content).toContain("y");
    expect(trimHistory([{ role: "user", content: "x".repeat(5000) }, { role: "assistant", content: "b" }, { role: "user", content: "c" }], 100).map((m) => m.content)).toEqual(["c"]);
  });
});

describe("chat", () => {
  it("reports status", async () => {
    const s = (await (await api("/api/ai/status", { cookie: owner })).json()) as AiStatus;
    expect(s.enabled).toBe(true);
    expect(s.usage.todayUsd).toBe(0);
  });

  it("creates a session about a KOKU item and rejects unknown topics", async () => {
    const bad = await api("/api/ai/sessions", { cookie: owner, body: { mode: "lesson", topicType: "ingredient", topicId: "nope" } });
    expect(bad.status).toBe(400);
    const res = await api("/api/ai/sessions", { cookie: owner, body: { mode: "conversation", topicType: "menu_item", topicId: "mi_jz26_futomaki_losos_miso" } });
    expect(res.status).toBe(201);
    sessionId = ((await res.json()) as { id: string }).id;
  });

  it("streams a reply over SSE, stores both turns and records usage", async () => {
    calls.length = 0;
    const res = await api(`/api/ai/sessions/${sessionId}/messages`, { cookie: owner, body: { content: "Dlaczego ryż twardnieje w lodówce?" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = parseSse(await res.text());
    const text = events.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
    expect(text).toBe(REPLY);
    expect(events.at(-1)?.event).toBe("done");

    // Context passed to the model: static prompt first, statuses and the incomplete-composition warning.
    const req = calls.find((c) => c.maxTokens > 60)!;
    expect(req.model).toBe("claude-sonnet-5-5");
    expect(req.effort).toBe("low");
    expect(req.system[0]).toBe(COACH_SYSTEM_PROMPT);
    expect(req.system[1]).toContain("[do weryfikacji]");
    expect(req.system[1]).toContain("skład NIEPEŁNY");
    expect(req.system[1]).toContain("tykwa");

    const { messages } = (await (await api(`/api/ai/sessions/${sessionId}`, { cookie: owner })).json()) as { messages: ChatMessageRow[] };
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1]!.content).toBe(REPLY);

    const usage = await env.DB.prepare("SELECT sum(cost_micro_usd) AS c, sum(requests) AS r FROM ai_usage WHERE day = ?").bind(warsawDay()).first<{ c: number; r: number }>();
    expect(usage!.c).toBeGreaterThan(0);
  });

  it("names the conversation with the light model after the first turn", async () => {
    const titleCall = calls.find((c) => c.maxTokens <= 60);
    expect(titleCall?.model).toBe("claude-haiku-5-5");
  });

  it("requires explicit confirmation for confidential fragments and does not store them by default", async () => {
    const unconfirmed = await api(`/api/ai/sessions/${sessionId}/messages`, { cookie: owner, body: { content: "TAJNE: 40 g cukru", confidential: true } });
    expect(unconfirmed.status).toBe(400);

    calls.length = 0;
    const res = await api(`/api/ai/sessions/${sessionId}/messages`, {
      cookie: owner,
      body: { content: "TAJNE: 40 g cukru na 1 kg ryżu", confidential: true, confirmedSend: true },
    });
    await res.text();
    expect(calls[0]!.messages.at(-1)!.content).toContain("TAJNE: 40 g cukru");
    expect(calls.some((c) => c.maxTokens <= 60)).toBe(false); // no title call for confidential turns

    const row = await env.DB.prepare("SELECT count(*) AS n FROM chat_messages WHERE content LIKE '%TAJNE%'").first<{ n: number }>();
    expect(row!.n).toBe(0);
    const { messages } = (await (await api(`/api/ai/sessions/${sessionId}`, { cookie: owner })).json()) as { messages: ChatMessageRow[] };
    expect(messages.slice(-2).every((m) => m.redacted && m.content === "")).toBe(true);

    // The next turn sends a placeholder instead of the fragment.
    calls.length = 0;
    await (await api(`/api/ai/sessions/${sessionId}/messages`, { cookie: owner, body: { content: "A co z octem?" } })).text();
    const sent = calls[0]!.messages.map((m) => m.content).join("\n");
    expect(sent).not.toContain("TAJNE");
    expect(sent).toContain("Poufny fragment");
  });

  it("keeps sessions private", async () => {
    expect((await api(`/api/ai/sessions/${sessionId}`, { cookie: other })).status).toBe(404);
    expect((await api(`/api/ai/sessions/${sessionId}/messages`, { cookie: other, body: { content: "hej" } })).status).toBe(404);
    expect((await api(`/api/ai/sessions/${sessionId}`, { method: "DELETE", cookie: other })).status).toBe(404);
    const list = (await (await api("/api/ai/sessions", { cookie: other })).json()) as { sessions: unknown[] };
    expect(list.sessions).toHaveLength(0);
  });

  it("reports provider failures as an SSE error and stores no reply", async () => {
    failNext = new HttpError(502, "ai_error", "Usługa AI zwróciła błąd (500).");
    const res = await api(`/api/ai/sessions/${sessionId}/messages`, { cookie: owner, body: { content: "Pytanie przy awarii" } });
    const events = parseSse(await res.text());
    expect(events.at(-1)?.event).toBe("error");
    expect(String(events.at(-1)?.data.message)).toContain("Usługa AI");
    const { messages } = (await (await api(`/api/ai/sessions/${sessionId}`, { cookie: owner })).json()) as { messages: ChatMessageRow[] };
    expect(messages.at(-1)?.role).toBe("user");
  });
});

describe("evaluation, drafts, limits", () => {
  it("evaluates an answer with structured output and filters unknown competencies", async () => {
    const res = await api("/api/ai/evaluate", { cookie: learner, body: { question: "Dlaczego ryż twardnieje w lodówce?", answer: "Bo jest zimny." } });
    expect(res.status).toBe(201);
    const ev = (await res.json()) as EvaluationRow;
    expect(ev.verdict).toBe("partially_correct");
    expect(ev.reasoningQuality).toBe(35);
    expect(ev.competencyKeys).toEqual(["ac_raw_materials"]);
    const list = (await (await api("/api/ai/evaluations", { cookie: learner })).json()) as { evaluations: EvaluationRow[] };
    expect(list.evaluations).toHaveLength(1);
    const otherList = (await (await api("/api/ai/evaluations", { cookie: other })).json()) as { evaluations: EvaluationRow[] };
    expect(otherList.evaluations).toHaveLength(0);
  });

  it("feeds weak areas back into the coach context", async () => {
    const s = await api("/api/ai/sessions", { cookie: learner, body: { mode: "oral_exam" } });
    const id = ((await s.json()) as { id: string }).id;
    calls.length = 0;
    await (await api(`/api/ai/sessions/${id}/messages`, { cookie: learner, body: { content: "Zaczynajmy" } })).text();
    expect(calls[0]!.system[1]).toContain("myli żelatynizację z retrogradacją");
  });

  it("drafts ingredient properties as 'needs verification' with an AI source (editors only)", async () => {
    const ing = await api("/api/ingredients", { cookie: owner, body: { namePl: "Kombu", status: "general_knowledge" } });
    const ingId = ((await ing.json()) as { id: string }).id;
    expect((await api("/api/ai/drafts/ingredient", { cookie: learner, body: { ingredientId: ingId } })).status).toBe(403);
    const res = await api("/api/ai/drafts/ingredient", { cookie: owner, body: { ingredientId: ingId } });
    expect(res.status).toBe(201);
    const props = await env.DB.prepare(
      "SELECT p.status, s.type FROM ingredient_properties p JOIN sources s ON s.id = p.source_id WHERE p.ingredient_id = ?",
    )
      .bind(ingId)
      .all<{ status: string; type: string }>();
    expect(props.results).toHaveLength(2);
    expect(props.results.every((p) => p.status === "needs_verification" && p.type === "ai_draft")).toBe(true);
  });

  it("enforces the per-minute rate limit", async () => {
    await createUserWithRole("rate@example.test", "rate password 12345", "learner");
    const cookie = await loginCookie("rate@example.test", "rate password 12345");
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      statuses.push((await api("/api/ai/evaluate", { cookie, body: { question: "Pytanie testowe?", answer: "x" } })).status);
    }
    expect(statuses.slice(0, 6).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(6)).toEqual([429, 429]);
  });

  it("enforces the daily budget", async () => {
    await createUserWithRole("budget@example.test", "budget password 1234", "learner");
    const cookie = await loginCookie("budget@example.test", "budget password 1234");
    const uid = (await env.DB.prepare("SELECT id FROM users WHERE email = 'budget@example.test'").first<{ id: string }>())!.id;
    await env.DB.prepare("INSERT INTO ai_usage (id, user_id, day, model, cost_micro_usd) VALUES (?, ?, ?, 'claude-sonnet-5-5', 600000)")
      .bind(crypto.randomUUID(), uid, warsawDay())
      .run();
    const res = await api("/api/ai/evaluate", { cookie, body: { question: "Pytanie testowe?", answer: "x" } });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("ai_daily_budget");
  });
});
