import { zValidator } from "@hono/zod-validator";
import { and, asc, avg, count, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  answerInputSchema,
  lessonInputSchema,
  lessonUpdateSchema,
  moduleInputSchema,
  QUIZ_KIND_LABELS,
  questionInputSchema,
  questionUpdateSchema,
  startQuizSchema,
  type AnswerResult,
  type AttemptRow,
  type AttemptView,
  type LessonDetail,
  type ModuleRow,
  type NextLessons,
  type ProgressResponse,
  type QuestionFull,
} from "../../../shared/learning";
import type { Db } from "../../db/client";
import {
  attemptAnswers,
  competencies,
  knowledgeCategories,
  learningModules,
  learningProgress,
  lessonCompetencies,
  lessons,
  levels,
  masteryRecords,
  questionCompetencies,
  questionOptions,
  questions,
  quizAttempts,
  quizQuestions,
  quizzes,
  reviewSchedule,
} from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { HttpError } from "../../lib/errors";
import { checkProvenance, iso, loadSources, notFound, requireEditor, resolveCategoryId, revisionInsert, validation, versionConflict } from "../../lib/knowledge";
import { indexStatements, unindexStatement } from "../../lib/search";
import { validationHook } from "../../lib/validation";
import { requireAuth } from "../../middleware/session";
import type { AppEnv } from "../../types";
import { competencyIdsByKeys, gradeAndRecord, questionsForLearner } from "../../learning/service";
import { listLevels } from "../academy/repo";

async function levelIdByKey(db: Db, key: string | null | undefined): Promise<string | null | undefined> {
  if (key === undefined) return undefined;
  if (key === null) return null;
  const [l] = await db.select({ id: levels.id }).from(levels).where(eq(levels.key, key));
  if (!l) validation("levelKey", "Nieznany poziom");
  return l.id;
}

async function competencyLinks(db: Db, keys: string[]): Promise<string[]> {
  const map = await competencyIdsByKeys(db, keys);
  const missing = keys.filter((k) => !map.has(k));
  if (missing.length) validation("competencyKeys", `Nieznane kompetencje: ${missing.join(", ")}`);
  return [...map.values()];
}

async function lessonDetail(db: Db, userId: string, id: string): Promise<LessonDetail> {
  const [row] = await db
    .select({ l: lessons, moduleTitle: learningModules.title, categorySlug: knowledgeCategories.slug })
    .from(lessons)
    .innerJoin(learningModules, eq(learningModules.id, lessons.moduleId))
    .innerJoin(knowledgeCategories, eq(knowledgeCategories.id, learningModules.categoryId))
    .where(eq(lessons.id, id));
  if (!row) notFound("Nie znaleziono lekcji.");
  const [comps, [qc], [prog], srcs] = await Promise.all([
    db
      .select({ key: competencies.key, name: competencies.name })
      .from(lessonCompetencies)
      .innerJoin(competencies, eq(competencies.id, lessonCompetencies.competencyId))
      .where(eq(lessonCompetencies.lessonId, id)),
    db.select({ n: count() }).from(questions).where(eq(questions.lessonId, id)),
    db.select().from(learningProgress).where(and(eq(learningProgress.userId, userId), eq(learningProgress.lessonId, id))),
    loadSources(db, [row.l.sourceId]),
  ]);
  return {
    id: row.l.id,
    moduleId: row.l.moduleId,
    moduleTitle: row.moduleTitle,
    categorySlug: row.categorySlug,
    title: row.l.title,
    body: row.l.body,
    status: row.l.status,
    source: row.l.sourceId ? (srcs.get(row.l.sourceId) ?? null) : null,
    version: row.l.version,
    competencies: comps,
    questionCount: qc?.n ?? 0,
    completed: Boolean(prog?.completedAt),
  };
}

async function questionFull(db: Db, id: string): Promise<QuestionFull> {
  const [q] = await db.select({ q: questions, categorySlug: knowledgeCategories.slug }).from(questions).leftJoin(knowledgeCategories, eq(knowledgeCategories.id, questions.categoryId)).where(eq(questions.id, id));
  if (!q) notFound("Nie znaleziono pytania.");
  const [learner] = await questionsForLearner(db, [id]);
  const [opts, comps, srcs] = await Promise.all([
    db.select().from(questionOptions).where(eq(questionOptions.questionId, id)).orderBy(asc(questionOptions.sortOrder)),
    db.select({ key: competencies.key }).from(questionCompetencies).innerJoin(competencies, eq(competencies.id, questionCompetencies.competencyId)).where(eq(questionCompetencies.questionId, id)),
    loadSources(db, [q.q.sourceId]),
  ]);
  return {
    ...learner!,
    explanation: q.q.explanation,
    categorySlug: q.categorySlug,
    lessonId: q.q.lessonId,
    competencyKeys: comps.map((c) => c.key),
    fullOptions: opts.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, matchTarget: o.matchTarget })),
    source: q.q.sourceId ? (srcs.get(q.q.sourceId) ?? null) : null,
    version: q.q.version,
  };
}

async function attemptView(db: Db, userId: string, id: string): Promise<AttemptView> {
  const [row] = await db
    .select({ a: quizAttempts, quiz: quizzes })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(and(eq(quizAttempts.id, id), eq(quizAttempts.userId, userId)));
  if (!row) notFound("Nie znaleziono podejścia.");
  const qIds = (await db.select({ id: quizQuestions.questionId }).from(quizQuestions).where(eq(quizQuestions.quizId, row.quiz.id)).orderBy(asc(quizQuestions.sortOrder))).map((r) => r.id);
  const [qs, ans] = await Promise.all([
    questionsForLearner(db, qIds),
    db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, id)),
  ]);
  const answered = ans.length ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, ans.map((a) => a.questionId))) : [];
  const explanations = ans.length ? await db.select({ id: questions.id, explanation: questions.explanation }).from(questions).where(inArray(questions.id, ans.map((a) => a.questionId))) : [];
  const answers: AnswerResult[] = ans.map((a) => {
    const opts = answered.filter((o) => o.questionId === a.questionId);
    return {
      answerId: a.id,
      questionId: a.questionId,
      correctness: a.correctness,
      reasoningQuality: a.reasoningQuality,
      evidence: a.evidence,
      gradedBy: a.gradedBy,
      feedback: a.feedback,
      explanation: explanations.find((e) => e.id === a.questionId)?.explanation ?? "",
      correctOptionIds: opts.filter((o) => o.isCorrect).map((o) => o.id),
      correctMatches: Object.fromEntries(opts.filter((o) => o.matchTarget).map((o) => [o.id, o.matchTarget!])),
      needsSelfRating: false,
      nextReviewAt: null,
    };
  });
  return {
    id: row.a.id,
    quiz: { id: row.quiz.id, title: row.quiz.title, kind: row.quiz.kind, passThreshold: row.quiz.passThreshold },
    startedAt: iso(row.a.startedAt),
    finishedAt: row.a.finishedAt ? iso(row.a.finishedAt) : null,
    score: row.a.score,
    passed: row.a.passed,
    questions: qs,
    answers,
  };
}

/** Replaces options, competencies and the search entry of a question (for a batch). */
export function questionWrites(db: Db, id: string, q: z.infer<typeof questionInputSchema>, compIds: string[]) {
  return [
    db.delete(questionOptions).where(eq(questionOptions.questionId, id)),
    db.delete(questionCompetencies).where(eq(questionCompetencies.questionId, id)),
    ...q.options.map((o, i) =>
      db.insert(questionOptions).values({ id: crypto.randomUUID(), questionId: id, text: o.text, isCorrect: o.isCorrect, matchTarget: o.matchTarget ?? null, sortOrder: i }),
    ),
    ...compIds.map((cid) => db.insert(questionCompetencies).values({ questionId: id, competencyId: cid })),
    ...indexStatements(db, { type: "question", id, ownerId: null, title: q.prompt.slice(0, 160), body: q.explanation }),
  ];
}

export const learningRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  // ---------- modules & lessons ----------
  .get("/modules", zValidator("query", z.object({ category: z.string().max(60).optional() }), validationHook), async (c) => {
    const { category } = c.req.valid("query");
    const db = c.var.db;
    const userId = c.var.user!.id;
    const mods = await db
      .select({ m: learningModules, categorySlug: knowledgeCategories.slug, categoryName: knowledgeCategories.name, levelKey: levels.key, levelName: levels.name })
      .from(learningModules)
      .innerJoin(knowledgeCategories, eq(knowledgeCategories.id, learningModules.categoryId))
      .leftJoin(levels, eq(levels.id, learningModules.levelId))
      .where(category ? eq(knowledgeCategories.slug, category) : undefined)
      .orderBy(asc(knowledgeCategories.sortOrder), asc(learningModules.sortOrder), asc(learningModules.createdAt));
    const ids = mods.map((m) => m.m.id);
    const ls = ids.length
      ? await db
          .select({
            id: lessons.id,
            moduleId: lessons.moduleId,
            title: lessons.title,
            status: lessons.status,
            completedAt: learningProgress.completedAt,
            questionCount: sql<number>`(SELECT count(*) FROM questions q WHERE q.lesson_id = "lessons"."id")`,
          })
          .from(lessons)
          .leftJoin(learningProgress, and(eq(learningProgress.lessonId, lessons.id), eq(learningProgress.userId, userId)))
          .where(inArray(lessons.moduleId, ids))
          .orderBy(asc(lessons.sortOrder), asc(lessons.createdAt))
      : [];
    const out: ModuleRow[] = mods.map((m) => ({
      id: m.m.id,
      categorySlug: m.categorySlug,
      categoryName: m.categoryName,
      levelKey: m.levelKey,
      levelName: m.levelName,
      title: m.m.title,
      description: m.m.description,
      lessons: ls.filter((l) => l.moduleId === m.m.id).map((l) => ({ id: l.id, title: l.title, status: l.status, completed: Boolean(l.completedAt), questionCount: l.questionCount })),
    }));
    return c.json({ modules: out });
  })
  .post("/modules", requireEditor, zValidator("json", moduleInputSchema, validationHook), async (c) => {
    const { categorySlug, levelKey, ...input } = c.req.valid("json");
    const db = c.var.db;
    const categoryId = await resolveCategoryId(db, categorySlug);
    if (!categoryId) validation("categorySlug", "Wybierz kategorię");
    const levelId = await levelIdByKey(db, levelKey ?? null);
    const id = crypto.randomUUID();
    await db.insert(learningModules).values({ id, ...input, categoryId, levelId: levelId ?? null, createdBy: c.var.user!.id });
    return c.json({ id }, 201);
  })
  .delete("/modules/:id", requireEditor, async (c) => {
    const db = c.var.db;
    const res = await db.delete(learningModules).where(eq(learningModules.id, c.req.param("id"))).returning({ id: learningModules.id, title: learningModules.title });
    if (!res.length) notFound("Nie znaleziono modułu.");
    await writeAudit(db, { actorId: c.var.user!.id, action: "module.deleted", entityType: "learning_module", entityId: res[0]!.id, metadata: { title: res[0]!.title } });
    return c.json({ ok: true });
  })
  .get("/lessons/:id", async (c) => c.json(await lessonDetail(c.var.db, c.var.user!.id, c.req.param("id"))))
  .post("/lessons/:id/open", async (c) => {
    const db = c.var.db;
    const [l] = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.id, c.req.param("id")));
    if (!l) notFound("Nie znaleziono lekcji.");
    await db
      .insert(learningProgress)
      .values({ userId: c.var.user!.id, lessonId: l.id, lastOpenedAt: new Date() })
      .onConflictDoUpdate({ target: [learningProgress.userId, learningProgress.lessonId], set: { lastOpenedAt: new Date() } });
    return c.json({ ok: true });
  })
  .post("/lessons/:id/complete", async (c) => {
    const db = c.var.db;
    const [l] = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.id, c.req.param("id")));
    if (!l) notFound("Nie znaleziono lekcji.");
    const now = new Date();
    await db
      .insert(learningProgress)
      .values({ userId: c.var.user!.id, lessonId: l.id, lastOpenedAt: now, completedAt: now })
      .onConflictDoUpdate({ target: [learningProgress.userId, learningProgress.lessonId], set: { lastOpenedAt: now, completedAt: now } });
    return c.json({ ok: true });
  })
  .post("/lessons", requireEditor, zValidator("json", lessonInputSchema, validationHook), async (c) => {
    const { competencyKeys, ...input } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const [m] = await db.select({ id: learningModules.id }).from(learningModules).where(eq(learningModules.id, input.moduleId));
    if (!m) validation("moduleId", "Nieznany moduł");
    await checkProvenance(db, user.id, input.status, input.sourceId);
    const compIds = await competencyLinks(db, competencyKeys);
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(lessons).values({ id, ...input, createdBy: user.id, updatedBy: user.id }),
      ...compIds.map((cid) => db.insert(lessonCompetencies).values({ lessonId: id, competencyId: cid })),
      ...indexStatements(db, { type: "lesson", id, ownerId: null, title: input.title, body: input.body }),
    ]);
    return c.json({ id }, 201);
  })
  .patch("/lessons/:id", requireEditor, zValidator("json", lessonUpdateSchema, validationHook), async (c) => {
    const { expectedVersion, competencyKeys, ...input } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const [old] = await db.select().from(lessons).where(eq(lessons.id, c.req.param("id")));
    if (!old) notFound("Nie znaleziono lekcji.");
    if (old.version !== expectedVersion) versionConflict();
    await checkProvenance(db, user.id, input.status ?? old.status, input.sourceId === undefined ? old.sourceId : input.sourceId);
    const compIds = competencyKeys ? await competencyLinks(db, competencyKeys) : null;
    const next = { ...old, ...input };
    const [, updated] = await db.batch([
      revisionInsert(db, "lesson", old.id, old.version, old, user.id),
      db
        .update(lessons)
        .set({ ...input, version: old.version + 1, updatedBy: user.id, updatedAt: new Date() })
        .where(and(eq(lessons.id, old.id), eq(lessons.version, expectedVersion)))
        .returning({ id: lessons.id }),
      ...(compIds
        ? [db.delete(lessonCompetencies).where(eq(lessonCompetencies.lessonId, old.id)), ...compIds.map((cid) => db.insert(lessonCompetencies).values({ lessonId: old.id, competencyId: cid }))]
        : []),
      ...indexStatements(db, { type: "lesson", id: old.id, ownerId: null, title: next.title, body: next.body }),
    ]);
    if (updated.length === 0) versionConflict();
    return c.json(await lessonDetail(db, user.id, old.id));
  })
  .delete("/lessons/:id", requireEditor, async (c) => {
    const db = c.var.db;
    const [old] = await db.select().from(lessons).where(eq(lessons.id, c.req.param("id")));
    if (!old) notFound("Nie znaleziono lekcji.");
    await db.batch([
      revisionInsert(db, "lesson", old.id, old.version, { ...old, deleted: true }, c.var.user!.id),
      db.delete(lessons).where(eq(lessons.id, old.id)),
      unindexStatement(db, "lesson", old.id),
    ]);
    return c.json({ ok: true });
  })

  // ---------- questions (editors see answers) ----------
  .get("/questions", requireEditor, zValidator("query", z.object({ category: z.string().max(60).optional(), lesson: z.string().max(100).optional() }), validationHook), async (c) => {
    const { category, lesson } = c.req.valid("query");
    const db = c.var.db;
    const rows = await db
      .select({ id: questions.id })
      .from(questions)
      .leftJoin(knowledgeCategories, eq(knowledgeCategories.id, questions.categoryId))
      .where(and(category ? eq(knowledgeCategories.slug, category) : undefined, lesson ? eq(questions.lessonId, lesson) : undefined))
      .orderBy(desc(questions.createdAt))
      .limit(200);
    return c.json({ questions: await Promise.all(rows.map((r) => questionFull(db, r.id))) });
  })
  .post("/questions", requireEditor, zValidator("json", questionInputSchema, validationHook), async (c) => {
    const q = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    await checkProvenance(db, user.id, q.status, q.sourceId);
    const categoryId = (await resolveCategoryId(db, q.categorySlug ?? null)) ?? null;
    if (q.lessonId) {
      const [l] = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.id, q.lessonId));
      if (!l) validation("lessonId", "Nieznana lekcja");
    }
    const compIds = await competencyLinks(db, q.competencyKeys);
    const id = crypto.randomUUID();
    await db.batch([
      db.insert(questions).values({
        id,
        type: q.type,
        prompt: q.prompt,
        explanation: q.explanation,
        difficulty: q.difficulty,
        categoryId,
        lessonId: q.lessonId ?? null,
        status: q.status,
        sourceId: q.sourceId ?? null,
        createdBy: user.id,
        updatedBy: user.id,
      }),
      ...questionWrites(db, id, q, compIds),
    ]);
    return c.json({ id }, 201);
  })
  .put("/questions/:id", requireEditor, zValidator("json", questionUpdateSchema, validationHook), async (c) => {
    const { expectedVersion, question: q } = c.req.valid("json");
    const db = c.var.db;
    const user = c.var.user!;
    const [old] = await db.select().from(questions).where(eq(questions.id, c.req.param("id")));
    if (!old) notFound("Nie znaleziono pytania.");
    if (old.version !== expectedVersion) versionConflict();
    await checkProvenance(db, user.id, q.status, q.sourceId);
    const categoryId = (await resolveCategoryId(db, q.categorySlug ?? null)) ?? null;
    const compIds = await competencyLinks(db, q.competencyKeys);
    const prevOpts = await db.select().from(questionOptions).where(eq(questionOptions.questionId, old.id));
    const [, updated] = await db.batch([
      revisionInsert(db, "question", old.id, old.version, { ...old, options: prevOpts }, user.id),
      db
        .update(questions)
        .set({ type: q.type, prompt: q.prompt, explanation: q.explanation, difficulty: q.difficulty, categoryId, lessonId: q.lessonId ?? null, status: q.status, sourceId: q.sourceId ?? null, version: old.version + 1, updatedBy: user.id, updatedAt: new Date() })
        .where(and(eq(questions.id, old.id), eq(questions.version, expectedVersion)))
        .returning({ id: questions.id }),
      ...questionWrites(db, old.id, q, compIds),
    ]);
    if (updated.length === 0) versionConflict();
    return c.json(await questionFull(db, old.id));
  })
  .delete("/questions/:id", requireEditor, async (c) => {
    const db = c.var.db;
    const [old] = await db.select().from(questions).where(eq(questions.id, c.req.param("id")));
    if (!old) notFound("Nie znaleziono pytania.");
    await db.batch([
      revisionInsert(db, "question", old.id, old.version, { ...old, deleted: true }, c.var.user!.id),
      db.delete(questions).where(eq(questions.id, old.id)),
      unindexStatement(db, "question", old.id),
    ]);
    return c.json({ ok: true });
  })

  // ---------- quizzes & exams ----------
  .post("/quizzes", zValidator("json", startQuizSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id;
    let title: string;
    let categoryId: string | null = null;
    let levelId: string | null = null;
    let pass = 70;
    let where;
    if (input.kind === "level_exam") {
      const lv = (await listLevels(db)).find((l) => l.key === input.levelKey);
      if (!lv) validation("levelKey", "Nieznany poziom");
      const [lrow] = await db.select({ id: levels.id }).from(levels).where(eq(levels.key, lv.key));
      levelId = lrow!.id;
      pass = lv.masteryThreshold;
      title = `${QUIZ_KIND_LABELS.level_exam}: ${lv.name}`;
      const compIds = (await db.select({ id: competencies.id }).from(competencies).where(eq(competencies.levelId, levelId))).map((r) => r.id);
      where = inArray(questions.id, db.select({ id: questionCompetencies.questionId }).from(questionCompetencies).where(inArray(questionCompetencies.competencyId, compIds)));
    } else if (input.lessonId) {
      const [l] = await db.select({ id: lessons.id, title: lessons.title }).from(lessons).where(eq(lessons.id, input.lessonId));
      if (!l) validation("lessonId", "Nieznana lekcja");
      title = `${QUIZ_KIND_LABELS[input.kind]}: ${l.title}`;
      where = eq(questions.lessonId, l.id);
    } else {
      categoryId = (await resolveCategoryId(db, input.categorySlug)) ?? null;
      const [cat] = await db.select({ name: knowledgeCategories.name }).from(knowledgeCategories).where(eq(knowledgeCategories.id, categoryId!));
      title = `${QUIZ_KIND_LABELS[input.kind]}: ${cat!.name}`;
      where = eq(questions.categoryId, categoryId!);
    }
    const size = input.size ?? (input.kind === "practice" ? 5 : input.kind === "exam" ? 12 : 20);
    // Questions with "unknown" status are excluded from exams.
    const picked = await db
      .select({ id: questions.id })
      .from(questions)
      .where(and(where, sql`${questions.status} != 'unknown'`))
      .orderBy(sql`random()`)
      .limit(size);
    if (picked.length === 0) throw new HttpError(409, "no_questions", "Brak pytań w tym zakresie. Dodaj pytania (ręcznie lub szkicem AI).");
    const quizId = crypto.randomUUID();
    const attemptId = crypto.randomUUID();
    await db.batch([
      db.insert(quizzes).values({ id: quizId, title, kind: input.kind, levelId, categoryId, passThreshold: pass, ownerId: userId, createdBy: userId }),
      ...picked.map((p, i) => db.insert(quizQuestions).values({ quizId, questionId: p.id, sortOrder: i })),
      db.insert(quizAttempts).values({ id: attemptId, userId, quizId }),
    ]);
    return c.json({ attemptId }, 201);
  })
  .get("/attempts", async (c) => {
    const db = c.var.db;
    const rows = await db
      .select({
        id: quizAttempts.id,
        title: quizzes.title,
        kind: quizzes.kind,
        startedAt: quizAttempts.startedAt,
        finishedAt: quizAttempts.finishedAt,
        score: quizAttempts.score,
        passed: quizAttempts.passed,
        answered: sql<number>`(SELECT count(*) FROM attempt_answers aa WHERE aa.attempt_id = "quiz_attempts"."id")`,
        total: sql<number>`(SELECT count(*) FROM quiz_questions qq WHERE qq.quiz_id = "quizzes"."id")`,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
      .where(eq(quizAttempts.userId, c.var.user!.id))
      .orderBy(desc(quizAttempts.startedAt))
      .limit(50);
    const out: AttemptRow[] = rows.map((r) => ({ ...r, startedAt: iso(r.startedAt), finishedAt: r.finishedAt ? iso(r.finishedAt) : null }));
    return c.json({ attempts: out });
  })
  .get("/attempts/:id", async (c) => c.json(await attemptView(c.var.db, c.var.user!.id, c.req.param("id"))))
  .post("/attempts/:id/answers", zValidator("json", answerInputSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id;
    const [a] = await db.select().from(quizAttempts).where(and(eq(quizAttempts.id, c.req.param("id")), eq(quizAttempts.userId, userId)));
    if (!a) notFound("Nie znaleziono podejścia.");
    if (a.finishedAt) throw new HttpError(409, "finished", "To podejście jest już zakończone.");
    const [inQuiz] = await db.select().from(quizQuestions).where(and(eq(quizQuestions.quizId, a.quizId), eq(quizQuestions.questionId, input.questionId)));
    if (!inQuiz) validation("questionId", "Pytanie nie należy do tego podejścia");
    const [dup] = await db.select({ id: attemptAnswers.id }).from(attemptAnswers).where(and(eq(attemptAnswers.attemptId, a.id), eq(attemptAnswers.questionId, input.questionId)));
    if (dup) throw new HttpError(409, "already_answered", "Na to pytanie już odpowiedziano.");
    return c.json(await gradeAndRecord(db, c.env, userId, input, a.id));
  })
  .post("/attempts/:id/finish", async (c) => {
    const db = c.var.db;
    const userId = c.var.user!.id;
    const view = await attemptView(db, userId, c.req.param("id"));
    if (view.finishedAt) return c.json(view);
    // Unanswered questions count as 0. Score = mean evidence (understanding, not just hits).
    const total = view.questions.length;
    const sum = view.answers.reduce((s, x) => s + x.evidence, 0);
    const score = total ? Math.round(sum / total) : 0;
    const passed = score >= view.quiz.passThreshold;
    await db.update(quizAttempts).set({ finishedAt: new Date(), score, passed }).where(eq(quizAttempts.id, view.id));
    return c.json(await attemptView(db, userId, view.id));
  })

  // ---------- spaced repetition ----------
  .get("/reviews/due", async (c) => {
    const db = c.var.db;
    const userId = c.var.user!.id;
    const due = await db
      .select({ questionId: reviewSchedule.questionId, lapses: reviewSchedule.lapses, lastResult: reviewSchedule.lastResult, dueAt: reviewSchedule.dueAt })
      .from(reviewSchedule)
      .where(and(eq(reviewSchedule.userId, userId), lte(reviewSchedule.dueAt, new Date())))
      .limit(200);
    if (due.length === 0) return c.json({ questions: [], total: 0 });
    // Priority: weakest competencies first, then most lapses, then worst last result.
    const qc = await db
      .select({ questionId: questionCompetencies.questionId, score: masteryRecords.score })
      .from(questionCompetencies)
      .leftJoin(masteryRecords, and(eq(masteryRecords.competencyId, questionCompetencies.competencyId), eq(masteryRecords.userId, userId)))
      .where(inArray(questionCompetencies.questionId, due.map((d) => d.questionId)));
    const weakest = (qid: string) => Math.min(100, ...qc.filter((r) => r.questionId === qid).map((r) => r.score ?? 0));
    const ranked = [...due].sort((a, b) => weakest(a.questionId) - weakest(b.questionId) || b.lapses - a.lapses || (a.lastResult ?? 0) - (b.lastResult ?? 0)).slice(0, 20);
    return c.json({ questions: await questionsForLearner(db, ranked.map((r) => r.questionId)), total: due.length });
  })
  .post("/reviews/answer", zValidator("json", answerInputSchema, validationHook), async (c) => {
    const input = c.req.valid("json");
    const db = c.var.db;
    const userId = c.var.user!.id;
    const [s] = await db.select().from(reviewSchedule).where(and(eq(reviewSchedule.userId, userId), eq(reviewSchedule.questionId, input.questionId)));
    if (!s) validation("questionId", "To pytanie nie jest zaplanowane do powtórki");
    return c.json(await gradeAndRecord(db, c.env, userId, input, null));
  })

  // ---------- what to learn next ----------
  .get("/next", async (c) => {
    const db = c.var.db;
    const userId = c.var.user!.id;
    const [last] = await db
      .select({ id: lessons.id, title: lessons.title, moduleTitle: learningModules.title, completedAt: learningProgress.completedAt })
      .from(learningProgress)
      .innerJoin(lessons, eq(lessons.id, learningProgress.lessonId))
      .innerJoin(learningModules, eq(learningModules.id, lessons.moduleId))
      .where(eq(learningProgress.userId, userId))
      .orderBy(desc(learningProgress.lastOpenedAt))
      .limit(1);
    // Recommended: an unfinished lesson that trains the user's weakest competency (target level first).
    const profileRows = await db.all<{ target_level_id: string | null }>(sql`SELECT target_level_id FROM user_profiles WHERE user_id = ${userId}`);
    const targetLevelId = profileRows[0]?.target_level_id ?? null;
    const candidates = await db.all<{ id: string; title: string; module_title: string; min_score: number | null; comp_name: string | null; level_match: number }>(sql`
      SELECT l.id, l.title, m.title AS module_title,
             min(coalesce(mr.score, 0)) AS min_score,
             (SELECT c2.name FROM lesson_competencies lc2 JOIN competencies c2 ON c2.id = lc2.competency_id
                LEFT JOIN mastery_records mr2 ON mr2.competency_id = c2.id AND mr2.user_id = ${userId}
              WHERE lc2.lesson_id = l.id ORDER BY coalesce(mr2.score, 0) LIMIT 1) AS comp_name,
             CASE WHEN m.level_id = ${targetLevelId} THEN 1 ELSE 0 END AS level_match
      FROM lessons l
      JOIN learning_modules m ON m.id = l.module_id
      LEFT JOIN learning_progress lp ON lp.lesson_id = l.id AND lp.user_id = ${userId}
      LEFT JOIN lesson_competencies lc ON lc.lesson_id = l.id
      LEFT JOIN mastery_records mr ON mr.competency_id = lc.competency_id AND mr.user_id = ${userId}
      WHERE lp.completed_at IS NULL
      GROUP BY l.id
      ORDER BY level_match DESC, min_score ASC, m.sort_order ASC, l.sort_order ASC
      LIMIT 1`);
    const rec = candidates[0];
    const body: NextLessons = {
      last: last ? { id: last.id, title: last.title, moduleTitle: last.moduleTitle, completed: Boolean(last.completedAt) } : null,
      recommended: rec
        ? { id: rec.id, title: rec.title, moduleTitle: rec.module_title, reason: rec.comp_name ? `Rozwija najsłabszą kompetencję: ${rec.comp_name}` : "Następna nieukończona lekcja" }
        : null,
    };
    return c.json(body);
  })

  // ---------- progress ----------
  .get("/progress", async (c) => {
    const db = c.var.db;
    const userId = c.var.user!.id;
    const lv = await listLevels(db);
    const [mastery, exams, catStats, [tot], [recent], [dueN], [done]] = await Promise.all([
      db.select({ key: competencies.key, score: masteryRecords.score, n: masteryRecords.evidenceCount }).from(masteryRecords).innerJoin(competencies, eq(competencies.id, masteryRecords.competencyId)).where(eq(masteryRecords.userId, userId)),
      db
        .select({ levelKey: levels.key })
        .from(quizAttempts)
        .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
        .innerJoin(levels, eq(levels.id, quizzes.levelId))
        .where(and(eq(quizAttempts.userId, userId), eq(quizzes.kind, "level_exam"), eq(quizAttempts.passed, true))),
      db
        .select({ slug: knowledgeCategories.slug, name: knowledgeCategories.name, answers: count(attemptAnswers.id), avgEvidence: avg(attemptAnswers.evidence) })
        .from(knowledgeCategories)
        .leftJoin(questions, eq(questions.categoryId, knowledgeCategories.id))
        .leftJoin(attemptAnswers, and(eq(attemptAnswers.questionId, questions.id), eq(attemptAnswers.userId, userId)))
        .groupBy(knowledgeCategories.id)
        .orderBy(asc(knowledgeCategories.sortOrder)),
      db.select({ n: count() }).from(attemptAnswers).where(eq(attemptAnswers.userId, userId)),
      db
        .select({ n: count(), a: avg(attemptAnswers.evidence) })
        .from(attemptAnswers)
        .where(and(eq(attemptAnswers.userId, userId), gte(attemptAnswers.createdAt, new Date(Date.now() - 30 * 86400_000)))),
      db.select({ n: count() }).from(reviewSchedule).where(and(eq(reviewSchedule.userId, userId), lte(reviewSchedule.dueAt, new Date()))),
      db.select({ n: count() }).from(learningProgress).where(and(eq(learningProgress.userId, userId), isNotNull(learningProgress.completedAt))),
    ]);
    const passedLevels = new Set(exams.map((e) => e.levelKey));
    const body: ProgressResponse = {
      levels: lv.map((l) => {
        const comps = l.competencies.map((cmp) => {
          const m = mastery.find((x) => x.key === cmp.key);
          const met = Boolean(m && m.score >= l.masteryThreshold && m.n >= l.minEvidence);
          return { key: cmp.key, name: cmp.name, score: m?.score ?? null, evidenceCount: m?.n ?? 0, met };
        });
        const examPassed = passedLevels.has(l.key);
        return { key: l.key, name: l.name, masteryThreshold: l.masteryThreshold, minEvidence: l.minEvidence, examPassed, achieved: examPassed && comps.every((x) => x.met), competencies: comps };
      }),
      categories: catStats.map((r) => ({ slug: r.slug, name: r.name, answers: r.answers, avgEvidence: r.avgEvidence === null ? null : Math.round(Number(r.avgEvidence)) })),
      stats: {
        answersTotal: tot?.n ?? 0,
        answers30d: recent?.n ?? 0,
        avgEvidence30d: recent?.a === null || recent?.a === undefined ? null : Math.round(Number(recent.a)),
        dueReviews: dueN?.n ?? 0,
        lessonsCompleted: done?.n ?? 0,
      },
    };
    return c.json(body);
  });
