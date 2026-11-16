import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { AUTO_GRADED, type AnswerResult, type QuestionForLearner, type QuestionType, type SelfRating } from "../../shared/learning";
import { aiConfig } from "../ai/config";
import { getAiProvider } from "../ai/provider";
import { guardAiRequest, recordUsage } from "../ai/usage";
import type { Db } from "../db/client";
import { attemptAnswers, competencies, masteryRecords, questionCompetencies, questionOptions, questions, reviewLogs, reviewSchedule } from "../db/schema";
import { notFound } from "../lib/knowledge";
import { autoCorrectness, evidenceScore, fsrsRating, justificationOf, nextMastery, SELF_RATING_CORRECTNESS, type GradeOption } from "./grading";
import { review } from "./srs";

export async function loadQuestion(db: Db, id: string) {
  const [q] = await db.select().from(questions).where(eq(questions.id, id));
  if (!q) notFound("Nie znaleziono pytania.");
  const options = await db.select().from(questionOptions).where(eq(questionOptions.questionId, id)).orderBy(asc(questionOptions.sortOrder));
  return { q, options };
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Learner-facing view: never reveals which option is correct. */
export async function questionsForLearner(db: Db, ids: string[]): Promise<QuestionForLearner[]> {
  if (ids.length === 0) return [];
  const [qs, opts] = await Promise.all([
    db.select().from(questions).where(inArray(questions.id, ids)),
    db.select().from(questionOptions).where(inArray(questionOptions.questionId, ids)).orderBy(asc(questionOptions.sortOrder)),
  ]);
  const byId = new Map(qs.map((q) => [q.id, q]));
  return ids
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => {
      const o = opts.filter((x) => x.questionId === q.id);
      const pickable = q.type === "single" || q.type === "multi" || q.type === "match";
      return {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        difficulty: q.difficulty,
        status: q.status,
        options: pickable ? (q.type === "match" ? o : shuffled(o)).map((x) => ({ id: x.id, text: x.text })) : [],
        matchTargets: q.type === "match" ? shuffled(o.map((x) => x.matchTarget ?? "")) : [],
        autoGraded: (AUTO_GRADED as readonly string[]).includes(q.type),
      };
    });
}

const aiGradeSchema = z.object({
  correctness: z.number().int().min(0).max(100),
  reasoning_quality: z.number().int().min(0).max(100),
  feedback: z.string(),
});

const GRADER_PROMPT = `Oceniasz odpowiedź kucharza sushi na pytanie egzaminacyjne. Piszesz po polsku, zwięźle (2–4 zdania w feedback).
- correctness (0–100): zgodność z wzorcową odpowiedzią i faktami. Jeśli poprawność została już ustalona automatycznie, przepisz ją bez zmian.
- reasoning_quality (0–100): czy uzasadnienie pokazuje zrozumienie mechanizmu. Brak uzasadnienia lub samo powtórzenie odpowiedzi = maks. 20. Trafienie bez zrozumienia nie może dostać wysokiej oceny.
- feedback: co dobrze, co źle i dlaczego; wskaż brakujący mechanizm.
Wzorcowa odpowiedź pochodzi z bazy aplikacji i może mieć status „do weryfikacji” — jeśli widzisz w niej oczywisty błąd merytoryczny, zaznacz to w feedback.`;

type AiGrade = { correctness: number; reasoningQuality: number; feedback: string } | null;

async function aiGrade(db: Db, env: Env, userId: string, prompt: string, modelAnswer: string, answer: string, autoCorrect: number | null): Promise<AiGrade> {
  const cfg = aiConfig(env);
  if (!cfg.enabled) return null;
  try {
    await guardAiRequest(db, cfg, userId);
    const res = await getAiProvider(cfg).structured(
      {
        model: cfg.model,
        system: [GRADER_PROMPT],
        messages: [
          {
            role: "user",
            content: `PYTANIE:\n${prompt}\n\nWZORCOWA ODPOWIEDŹ / KRYTERIA:\n${modelAnswer}\n\n${autoCorrect !== null ? `POPRAWNOŚĆ USTALONA AUTOMATYCZNIE: ${autoCorrect}\n\n` : ""}ODPOWIEDŹ UCZNIA${autoCorrect !== null ? " (uzasadnienie)" : ""}:\n${answer || "(brak)"}`,
          },
        ],
        maxTokens: Math.min(cfg.maxOutputTokens, 1500),
        effort: cfg.effort,
      },
      aiGradeSchema,
    );
    await recordUsage(db, userId, res.model, res.usage);
    if (!res.data) return null;
    return { correctness: res.data.correctness, reasoningQuality: res.data.reasoning_quality, feedback: res.data.feedback };
  } catch {
    // Limits reached or AI failure: fall back to auto / self grading.
    return null;
  }
}

export interface SubmitInput {
  questionId: string;
  answerText: string;
  selectedOptionIds: string[];
  matches: Record<string, string>;
  selfConfidence?: number | undefined;
  selfRating?: SelfRating | undefined;
}

/**
 * Grades an answer, stores it, updates competency mastery and the review schedule.
 * Returns needsSelfRating (and stores nothing) when an open question cannot be graded by AI.
 */
export async function gradeAndRecord(db: Db, env: Env, userId: string, input: SubmitInput, attemptId: string | null): Promise<AnswerResult> {
  const { q, options } = await loadQuestion(db, input.questionId);
  const gradeOpts: GradeOption[] = options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, matchTarget: o.matchTarget }));
  const type = q.type as QuestionType;
  const auto = autoCorrectness(type, gradeOpts, input);
  const justification = justificationOf(type, input.answerText);

  let correctness: number;
  let reasoningQuality: number | null = null;
  let feedback = "";
  let gradedBy: "auto" | "ai" | "self";

  const correctOptionIds = options.filter((o) => o.isCorrect).map((o) => o.id);
  const correctMatches = Object.fromEntries(options.filter((o) => o.matchTarget).map((o) => [o.id, o.matchTarget!]));

  if (auto !== null) {
    correctness = auto;
    gradedBy = "auto";
    if (justification.length >= 10) {
      const g = await aiGrade(db, env, userId, q.prompt, q.explanation, justification, auto);
      if (g) {
        reasoningQuality = Math.max(0, Math.min(100, g.reasoningQuality));
        feedback = g.feedback;
        gradedBy = "ai";
      }
    }
    if (!feedback) {
      feedback =
        auto === 100
          ? justification.length >= 10
            ? "Odpowiedź poprawna. Uzasadnienie nie zostało ocenione (trener AI niedostępny)."
            : "Odpowiedź poprawna. Bez uzasadnienia liczy się do opanowania tylko częściowo — dopisz „dlaczego”."
          : "Odpowiedź niepełna lub błędna — sprawdź wzorcową odpowiedź poniżej.";
    }
  } else {
    const g = input.selfRating ? null : await aiGrade(db, env, userId, q.prompt, q.explanation, input.answerText, null);
    if (g) {
      correctness = Math.max(0, Math.min(100, g.correctness));
      reasoningQuality = Math.max(0, Math.min(100, g.reasoningQuality));
      feedback = g.feedback;
      gradedBy = "ai";
    } else if (input.selfRating) {
      correctness = SELF_RATING_CORRECTNESS[input.selfRating];
      feedback = "Samoocena (bez oceny trenera AI).";
      gradedBy = "self";
    } else {
      return {
        answerId: "",
        questionId: q.id,
        correctness: 0,
        reasoningQuality: null,
        evidence: 0,
        gradedBy: "self",
        feedback: "Trener AI jest niedostępny. Porównaj swoją odpowiedź z wzorcem i oceń się sam.",
        explanation: q.explanation,
        correctOptionIds,
        correctMatches,
        needsSelfRating: true,
        nextReviewAt: null,
      };
    }
  }

  const evidence = evidenceScore(correctness, reasoningQuality, input.selfConfidence);
  const answerId = crypto.randomUUID();

  // Mastery for every competency linked to the question.
  const compIds = (await db.select({ id: questionCompetencies.competencyId }).from(questionCompetencies).where(eq(questionCompetencies.questionId, q.id))).map((r) => r.id);
  const prev = compIds.length
    ? await db.select().from(masteryRecords).where(and(eq(masteryRecords.userId, userId), inArray(masteryRecords.competencyId, compIds)))
    : [];

  // Spaced repetition.
  const [sched] = await db.select().from(reviewSchedule).where(and(eq(reviewSchedule.userId, userId), eq(reviewSchedule.questionId, q.id)));
  const rating = fsrsRating(evidence);
  const next = await review(sched?.card ?? null, rating);

  await db.batch([
    db.insert(attemptAnswers).values({
      id: answerId,
      userId,
      attemptId,
      questionId: q.id,
      answerText: input.answerText,
      selectedOptionIds: input.selectedOptionIds,
      matches: input.matches,
      selfConfidence: input.selfConfidence ?? null,
      correctness,
      reasoningQuality,
      evidence,
      feedback,
      gradedBy,
    }),
    db
      .insert(reviewSchedule)
      .values({ userId, questionId: q.id, dueAt: next.dueAt, reps: next.reps, lapses: next.lapses, card: next.card, lastResult: evidence })
      .onConflictDoUpdate({
        target: [reviewSchedule.userId, reviewSchedule.questionId],
        set: { dueAt: next.dueAt, reps: next.reps, lapses: next.lapses, card: next.card, lastResult: evidence, updatedAt: new Date() },
      }),
    db.insert(reviewLogs).values({
      id: crypto.randomUUID(),
      userId,
      questionId: q.id,
      answerId,
      rating,
      evidence,
      selfConfidence: input.selfConfidence ?? null,
      nextDueAt: next.dueAt,
    }),
    ...compIds.map((cid) => {
      const m = nextMastery(prev.find((p) => p.competencyId === cid), evidence);
      return db
        .insert(masteryRecords)
        .values({ userId, competencyId: cid, score: m.score, evidenceCount: m.evidenceCount })
        .onConflictDoUpdate({ target: [masteryRecords.userId, masteryRecords.competencyId], set: { score: m.score, evidenceCount: m.evidenceCount, updatedAt: new Date() } });
    }),
  ]);

  return {
    answerId,
    questionId: q.id,
    correctness,
    reasoningQuality,
    evidence,
    gradedBy,
    feedback,
    explanation: q.explanation,
    correctOptionIds,
    correctMatches,
    needsSelfRating: false,
    nextReviewAt: next.dueAt.toISOString(),
  };
}

export async function competencyIdsByKeys(db: Db, keys: string[]): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const rows = await db.select({ id: competencies.id, key: competencies.key }).from(competencies).where(inArray(competencies.key, keys));
  return new Map(rows.map((r) => [r.key, r.id]));
}
