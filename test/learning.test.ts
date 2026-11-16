import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { AnswerResult, AttemptView, ModuleRow, ProgressResponse, QuestionForLearner, QuestionFull } from "../src/shared/learning";
import { setAiProviderFactory, type AiProvider } from "../src/worker/ai/provider";
import { autoCorrectness, evidenceScore, fsrsRating, nextMastery } from "../src/worker/learning/grading";
import { review } from "../src/worker/learning/srs";
import { api, createUserWithRole, loginCookie, OWNER, setupOwner } from "./helpers";

let aiMode: "ok" | "fail" = "ok";
const fake: AiProvider = {
  streamText: () => Promise.reject(new Error("not used")),
  async structured(req) {
    if (aiMode === "fail") throw new Error("AI down");
    const sys = req.system[0] ?? "";
    let data: unknown;
    if (sys.includes("pytanie egzaminacyjne")) data = { correctness: 80, reasoning_quality: 60, feedback: "Dobrze, brakuje mechanizmu." };
    else
      data = {
        title: "Retrogradacja skrobi w ryżu do sushi",
        body: "Treść lekcji testowej o retrogradacji.",
        competency_keys: ["ac_raw_materials", "bogus"],
        questions: [
          { type: "single", prompt: "Co powoduje twardnienie ryżu w chłodzie?", explanation: "Retrogradacja skrobi.", difficulty: 2, options: [{ text: "Retrogradacja", isCorrect: true, matchTarget: null }, { text: "Fermentacja", isCorrect: false, matchTarget: null }], competency_keys: ["ac_raw_materials"] },
          { type: "single", prompt: "Pytanie bez poprawnej opcji?", explanation: "Nieprawidłowe pytanie.", difficulty: 2, options: [{ text: "A", isCorrect: false, matchTarget: null }], competency_keys: [] },
          { type: "explain_process", prompt: "Wyjaśnij żelatynizację skrobi.", explanation: "Woda + temperatura → pęcznienie ziaren.", difficulty: 3, options: [], competency_keys: ["ac_processes"] },
        ],
      };
    return { text: "", stopReason: "end_turn", model: req.model, usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 }, data: data as never };
  },
};

describe("grading rules (unit)", () => {
  const opts = [
    { id: "a", text: "Ryż", isCorrect: true, matchTarget: "baza" },
    { id: "b", text: "Nori", isCorrect: true, matchTarget: "owinięcie" },
    { id: "c", text: "Cukier puder", isCorrect: false, matchTarget: null },
  ];
  it("grades closed types", () => {
    expect(autoCorrectness("single", opts, { answerText: "", selectedOptionIds: ["a"], matches: {} })).toBe(100);
    expect(autoCorrectness("single", opts, { answerText: "", selectedOptionIds: ["a", "b"], matches: {} })).toBe(0);
    expect(autoCorrectness("multi", opts, { answerText: "", selectedOptionIds: ["a", "c"], matches: {} })).toBe(0);
    expect(autoCorrectness("multi", opts, { answerText: "", selectedOptionIds: ["a"], matches: {} })).toBe(50);
    expect(autoCorrectness("match", opts, { answerText: "", selectedOptionIds: [], matches: { a: "BAZA", b: "baza" } })).toBe(50);
    expect(autoCorrectness("fill_composition", opts, { answerText: "ryz, NORI", selectedOptionIds: [], matches: {} })).toBe(100);
    expect(autoCorrectness("fill_composition", opts, { answerText: "ryż, sezam", selectedOptionIds: [], matches: {} })).toBe(25);
    expect(autoCorrectness("identify", opts, { answerText: "Nori\n---\nbo to alga", selectedOptionIds: [], matches: {} })).toBe(100);
    expect(autoCorrectness("open", opts, { answerText: "x", selectedOptionIds: [], matches: {} })).toBeNull();
  });
  it("never gives full evidence for an unjustified or unsure answer", () => {
    expect(evidenceScore(100, null)).toBe(70);
    expect(evidenceScore(100, 100)).toBe(100);
    expect(evidenceScore(100, 20)).toBe(68);
    expect(evidenceScore(100, null, 1)).toBe(60);
  });
  it("maps evidence to FSRS ratings and averages mastery", () => {
    expect([10, 50, 70, 95].map(fsrsRating)).toEqual([1, 2, 3, 4]);
    let m = nextMastery(undefined, 80);
    m = nextMastery(m, 40);
    expect(m).toEqual({ score: 60, evidenceCount: 2 });
  });
  it("schedules a good answer later than a failed one", async () => {
    const now = new Date("2026-11-16T10:00:00Z");
    const good = await review(null, 3, now);
    const bad = await review(null, 1, now);
    expect(good.dueAt.getTime()).toBeGreaterThan(bad.dueAt.getTime());
    const again = await review(good.card, 1, good.dueAt);
    expect(again.lapses).toBe(1);
  });
});

describe("lessons, quizzes, mastery and reviews", () => {
  let owner = "";
  let learner = "";
  let other = "";
  let moduleId = "";
  let lessonId = "";
  let qSingle = "";
  let qOpen = "";
  let attemptId = "";

  beforeAll(async () => {
    setAiProviderFactory(() => fake);
    await setupOwner();
    owner = await loginCookie(OWNER.email, OWNER.password);
    await createUserWithRole("l4@example.test", "learner password 123", "learner");
    learner = await loginCookie("l4@example.test", "learner password 123");
    await createUserWithRole("o4@example.test", "other password 1234", "learner");
    other = await loginCookie("o4@example.test", "other password 1234");
  });

  it("lets editors build modules, lessons and validated questions", async () => {
    expect((await api("/api/learning/modules", { cookie: learner, body: { categorySlug: "ryz", title: "Nope" } })).status).toBe(403);
    const m = await api("/api/learning/modules", { cookie: owner, body: { categorySlug: "ryz", levelKey: "advanced_cook", title: "Technologia ryżu" } });
    moduleId = ((await m.json()) as { id: string }).id;
    const l = await api("/api/learning/lessons", {
      cookie: owner,
      body: { moduleId, title: "Skrobia w ryżu", body: "Amyloza i amylopektyna…", competencyKeys: ["ac_raw_materials"], status: "general_knowledge" },
    });
    expect(l.status).toBe(201);
    lessonId = ((await l.json()) as { id: string }).id;

    const bad = await api("/api/learning/questions", { cookie: owner, body: { type: "single", prompt: "Pytanie bez poprawnej?", explanation: "xxxxx", options: [{ text: "A" }, { text: "B" }] } });
    expect(bad.status).toBe(400);

    const s = await api("/api/learning/questions", {
      cookie: owner,
      body: {
        type: "single",
        prompt: "Która frakcja skrobi odpowiada głównie za kleistość ryżu?",
        explanation: "Amylopektyna — rozgałęziona, słabo retrograduje.",
        categorySlug: "ryz",
        lessonId,
        competencyKeys: ["ac_raw_materials"],
        options: [{ text: "Amylopektyna", isCorrect: true }, { text: "Amyloza" }, { text: "Gluten" }],
        status: "general_knowledge",
      },
    });
    expect(s.status).toBe(201);
    qSingle = ((await s.json()) as { id: string }).id;
    const o = await api("/api/learning/questions", {
      cookie: owner,
      body: { type: "explain_process", prompt: "Wyjaśnij, dlaczego ryż twardnieje w lodówce.", explanation: "Retrogradacja amylozy w niskiej temperaturze.", categorySlug: "ryz", lessonId, competencyKeys: ["ac_processes"] },
    });
    qOpen = ((await o.json()) as { id: string }).id;

    expect((await api("/api/learning/questions?category=ryz", { cookie: learner })).status).toBe(403);
    const list = (await (await api("/api/learning/questions?category=ryz", { cookie: owner })).json()) as { questions: QuestionFull[] };
    expect(list.questions).toHaveLength(2);

    const mods = (await (await api("/api/learning/modules?category=ryz", { cookie: learner })).json()) as { modules: ModuleRow[] };
    expect(mods.modules[0]!.lessons[0]!.questionCount).toBe(2);
  });

  it("starts a practice quiz without leaking correct answers", async () => {
    const r = await api("/api/learning/quizzes", { cookie: learner, body: { kind: "practice", lessonId } });
    expect(r.status).toBe(201);
    attemptId = ((await r.json()) as { attemptId: string }).attemptId;
    const view = (await (await api(`/api/learning/attempts/${attemptId}`, { cookie: learner })).json()) as AttemptView;
    expect(view.questions).toHaveLength(2);
    const raw = JSON.stringify(view.questions);
    expect(raw).not.toContain("isCorrect");
    expect(raw).not.toContain("Retrogradacja amylozy");
    expect((await api(`/api/learning/attempts/${attemptId}`, { cookie: other })).status).toBe(404);
  });

  it("grades a correct guess without justification at most 70", async () => {
    const view = (await (await api(`/api/learning/attempts/${attemptId}`, { cookie: learner })).json()) as AttemptView;
    const q = view.questions.find((x) => x.id === qSingle) as QuestionForLearner;
    const correct = q.options.find((o) => o.text === "Amylopektyna")!;
    const res = (await (await api(`/api/learning/attempts/${attemptId}/answers`, { cookie: learner, body: { questionId: qSingle, selectedOptionIds: [correct.id] } })).json()) as AnswerResult;
    expect(res.correctness).toBe(100);
    expect(res.evidence).toBe(70);
    expect(res.gradedBy).toBe("auto");
    expect(res.correctOptionIds).toEqual([correct.id]);
    const dup = await api(`/api/learning/attempts/${attemptId}/answers`, { cookie: learner, body: { questionId: qSingle, selectedOptionIds: [correct.id] } });
    expect(dup.status).toBe(409);
  });

  it("falls back to self-assessment when the AI is unavailable, then records it", async () => {
    aiMode = "fail";
    const first = (await (await api(`/api/learning/attempts/${attemptId}/answers`, { cookie: learner, body: { questionId: qOpen, answerText: "Bo zimno." } })).json()) as AnswerResult;
    expect(first.needsSelfRating).toBe(true);
    expect(first.explanation).toContain("Retrogradacja");
    const n = await env.DB.prepare("SELECT count(*) AS n FROM attempt_answers WHERE question_id = ?").bind(qOpen).first<{ n: number }>();
    expect(n!.n).toBe(0);
    const second = (await (await api(`/api/learning/attempts/${attemptId}/answers`, { cookie: learner, body: { questionId: qOpen, answerText: "Bo zimno.", selfRating: "hard" } })).json()) as AnswerResult;
    expect(second.gradedBy).toBe("self");
    expect(second.correctness).toBe(40);
    aiMode = "ok";
  });

  it("finishes the attempt with a score based on understanding", async () => {
    const fin = (await (await api(`/api/learning/attempts/${attemptId}/finish`, { cookie: learner, body: {} })).json()) as AttemptView;
    expect(fin.score).toBe(Math.round((70 + 28) / 2));
    expect(fin.passed).toBe(false);
    const late = await api(`/api/learning/attempts/${attemptId}/answers`, { cookie: learner, body: { questionId: qSingle } });
    expect(late.status).toBe(409);
  });

  it("uses the AI to grade reasoning on a review and schedules the next one", async () => {
    expect(((await (await api("/api/learning/reviews/due", { cookie: learner })).json()) as { total: number }).total).toBe(0);
    await env.DB.prepare("UPDATE review_schedule SET due_at = 0 WHERE question_id = ?").bind(qSingle).run();
    const due = (await (await api("/api/learning/reviews/due", { cookie: learner })).json()) as { questions: QuestionForLearner[]; total: number };
    expect(due.total).toBe(1);
    const correct = due.questions[0]!.options.find((o) => o.text === "Amylopektyna")!;
    const res = (await (
      await api("/api/learning/reviews/answer", { cookie: learner, body: { questionId: qSingle, selectedOptionIds: [correct.id], answerText: "Amylopektyna jest rozgałęziona i słabo retrograduje.", selfConfidence: 4 } })
    ).json()) as AnswerResult;
    expect(res.gradedBy).toBe("ai");
    expect(res.reasoningQuality).toBe(60);
    expect(res.evidence).toBe(84);
    expect(new Date(res.nextReviewAt!).getTime()).toBeGreaterThan(Date.now());
    const logs = await env.DB.prepare("SELECT count(*) AS n FROM review_logs WHERE question_id = ?").bind(qSingle).first<{ n: number }>();
    expect(logs!.n).toBe(2);
    expect((await api("/api/learning/reviews/answer", { cookie: other, body: { questionId: qSingle } })).status).toBe(400);
  });

  it("tracks mastery, lessons and level achievement (competencies AND exam)", async () => {
    await api(`/api/learning/lessons/${lessonId}/complete`, { cookie: learner, body: {} });
    let p = (await (await api("/api/learning/progress", { cookie: learner })).json()) as ProgressResponse;
    expect(p.stats.lessonsCompleted).toBe(1);
    expect(p.stats.answersTotal).toBe(3);
    const ac = p.levels.find((l) => l.key === "advanced_cook")!;
    const raw = ac.competencies.find((c) => c.key === "ac_raw_materials")!;
    expect(raw.evidenceCount).toBe(2);
    expect(raw.score).toBe(77);
    expect(ac.achieved).toBe(false);
    expect(p.categories.find((c) => c.slug === "ryz")!.answers).toBe(3);

    // Simulate full competency mastery: still not achieved without a passed level exam.
    const uid = (await env.DB.prepare("SELECT id FROM users WHERE email = 'l4@example.test'").first<{ id: string }>())!.id;
    await env.DB.prepare(
      "INSERT OR REPLACE INTO mastery_records (user_id, competency_id, score, evidence_count) SELECT ?, id, 90, 10 FROM competencies WHERE level_id = 'lvl_advanced_cook'",
    )
      .bind(uid)
      .run();
    p = (await (await api("/api/learning/progress", { cookie: learner })).json()) as ProgressResponse;
    expect(p.levels.find((l) => l.key === "advanced_cook")!.competencies.every((c) => c.met)).toBe(true);
    expect(p.levels.find((l) => l.key === "advanced_cook")!.achieved).toBe(false);

    const ex = await api("/api/learning/quizzes", { cookie: learner, body: { kind: "level_exam", levelKey: "advanced_cook" } });
    expect(ex.status).toBe(201);
    const exId = ((await ex.json()) as { attemptId: string }).attemptId;
    await env.DB.prepare("UPDATE quiz_attempts SET finished_at = 1, score = 90, passed = 1 WHERE id = ?").bind(exId).run();
    p = (await (await api("/api/learning/progress", { cookie: learner })).json()) as ProgressResponse;
    expect(p.levels.find((l) => l.key === "advanced_cook")!.achieved).toBe(true);
  });

  it("refuses quizzes with no questions in scope", async () => {
    const r = await api("/api/learning/quizzes", { cookie: learner, body: { kind: "exam", categorySlug: "desery-nieistniejace" } });
    expect(r.status).toBe(400);
    const empty = await api("/api/learning/quizzes", { cookie: learner, body: { kind: "exam", categorySlug: "nori-algi" } });
    expect(empty.status).toBe(409);
  });

  it("drafts a lesson with only valid questions via AI (needs verification)", async () => {
    const r = await api("/api/ai/drafts/lesson", { cookie: owner, body: { categorySlug: "ryz", levelKey: "advanced_cook", topic: "Retrogradacja skrobi" } });
    expect(r.status).toBe(201);
    const { lessonId: lid, questions } = (await r.json()) as { lessonId: string; questions: number };
    expect(questions).toBe(2);
    const row = await env.DB.prepare("SELECT l.status, s.type, m.title FROM lessons l JOIN sources s ON s.id = l.source_id JOIN learning_modules m ON m.id = l.module_id WHERE l.id = ?")
      .bind(lid)
      .first<{ status: string; type: string; title: string }>();
    expect(row).toEqual({ status: "needs_verification", type: "ai_draft", title: "Szkice AI" });
    expect((await api("/api/ai/drafts/lesson", { cookie: learner, body: { categorySlug: "ryz", topic: "x y z" } })).status).toBe(403);
  });
});

describe("next lesson", () => {
  it("returns the last opened and a recommended unfinished lesson", async () => {
    const cookie = await loginCookie("o4@example.test", "other password 1234");
    const mods = (await (await api("/api/learning/modules?category=ryz", { cookie })).json()) as { modules: ModuleRow[] };
    const lesson = mods.modules.flatMap((m) => m.lessons)[0]!;
    await api(`/api/learning/lessons/${lesson.id}/open`, { cookie, body: {} });
    const next = (await (await api("/api/learning/next", { cookie })).json()) as { last: { id: string } | null; recommended: { id: string; reason: string } | null };
    expect(next.last?.id).toBe(lesson.id);
    expect(next.recommended).not.toBeNull();
  });
});

describe("search does not leak answers", () => {
  it("indexes question prompts but not model answers", async () => {
    const cookie = await loginCookie("o4@example.test", "other password 1234");
    const hits = (await (await api("/api/search?q=rozgalęziona", { cookie })).json()) as { results: { type: string }[] };
    expect(hits.results.filter((h) => h.type === "question")).toHaveLength(0);
    const byPrompt = (await (await api("/api/search?q=kleistosc", { cookie })).json()) as { results: { type: string }[] };
    expect(byPrompt.results.some((h) => h.type === "question")).toBe(true);
  });
});
