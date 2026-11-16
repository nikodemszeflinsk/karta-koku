import { z } from "zod";
import { VERIFICATION_STATUSES, type SourceSummary, type VerificationStatus } from "./knowledge";

export const QUESTION_TYPES = [
  "open",
  "single",
  "multi",
  "fill_composition",
  "identify",
  "match",
  "error_analysis",
  "scenario",
  "explain_process",
  "compare",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  open: "Pytanie otwarte",
  single: "Jednokrotny wybór",
  multi: "Wielokrotny wybór",
  fill_composition: "Uzupełnij skład",
  identify: "Rozpoznaj składnik",
  match: "Dopasuj surowiec do zastosowania",
  error_analysis: "Analiza błędu",
  scenario: "Scenariusz kuchenny",
  explain_process: "Wyjaśnij proces",
  compare: "Porównaj produkty",
};
/** Types graded automatically from options; others need the AI (or self-assessment). */
export const AUTO_GRADED: readonly QuestionType[] = ["single", "multi", "fill_composition", "identify", "match"];
export const NEEDS_OPTIONS: readonly QuestionType[] = ["single", "multi", "fill_composition", "identify", "match"];

export const QUIZ_KINDS = ["practice", "exam", "level_exam"] as const;
export type QuizKind = (typeof QUIZ_KINDS)[number];
export const QUIZ_KIND_LABELS: Record<QuizKind, string> = {
  practice: "Ćwiczenie",
  exam: "Egzamin z kategorii",
  level_exam: "Egzamin na poziom",
};

export const SELF_RATINGS = ["again", "hard", "good", "easy"] as const;
export type SelfRating = (typeof SELF_RATINGS)[number];
export const SELF_RATING_LABELS: Record<SelfRating, string> = {
  again: "Nie wiedziałem",
  hard: "Z trudem / częściowo",
  good: "Wiedziałem",
  easy: "Bez problemu",
};

// ---- input schemas ----

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));

export const moduleInputSchema = z.object({
  categorySlug: z.string().max(60),
  levelKey: z.string().max(40).nullable().optional(),
  title: z.string().trim().min(2, "Tytuł: min. 2 znaki").max(160),
  description: optText(2000),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const lessonInputSchema = z.object({
  moduleId: z.string().min(1).max(100),
  title: z.string().trim().min(2, "Tytuł: min. 2 znaki").max(160),
  body: z.string().trim().min(1, "Wpisz treść lekcji").max(50000),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  competencyKeys: z.array(z.string().max(60)).max(20).default([]),
  status: z.enum(VERIFICATION_STATUSES).default("needs_verification"),
  sourceId: z.string().max(100).nullable().optional(),
});
export const lessonUpdateSchema = lessonInputSchema.omit({ moduleId: true }).partial().extend({ expectedVersion: z.number().int().positive() });

export const questionInputSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(5, "Treść pytania: min. 5 znaków").max(3000),
    explanation: z.string().trim().min(5, "Podaj wzorcową odpowiedź / kryteria").max(5000),
    difficulty: z.number().int().min(1).max(3).default(2),
    categorySlug: z.string().max(60).nullable().optional(),
    lessonId: z.string().max(100).nullable().optional(),
    competencyKeys: z.array(z.string().max(60)).max(10).default([]),
    options: z
      .array(z.object({ text: z.string().trim().min(1).max(500), isCorrect: z.boolean().default(false), matchTarget: optText(500) }))
      .max(12)
      .default([]),
    status: z.enum(VERIFICATION_STATUSES).default("needs_verification"),
    sourceId: z.string().max(100).nullable().optional(),
  })
  .superRefine((q, ctx) => {
    const correct = q.options.filter((o) => o.isCorrect).length;
    const issue = (message: string) => ctx.addIssue({ code: "custom", path: ["options"], message });
    switch (q.type) {
      case "single":
        if (q.options.length < 2 || correct !== 1) issue("Jednokrotny wybór: min. 2 opcje, dokładnie 1 poprawna");
        break;
      case "multi":
        if (q.options.length < 2 || correct < 1) issue("Wielokrotny wybór: min. 2 opcje, co najmniej 1 poprawna");
        break;
      case "fill_composition":
      case "identify":
        if (correct < 1) issue("Podaj co najmniej jedną poprawną odpowiedź");
        break;
      case "match":
        if (q.options.length < 2 || q.options.some((o) => !o.matchTarget)) issue("Dopasowanie: min. 2 pary, każda z odpowiednikiem");
        break;
      default:
        break;
    }
  });
export const questionUpdateSchema = z.object({ expectedVersion: z.number().int().positive(), question: questionInputSchema });

export const startQuizSchema = z
  .object({
    kind: z.enum(QUIZ_KINDS),
    categorySlug: z.string().max(60).optional(),
    lessonId: z.string().max(100).optional(),
    levelKey: z.string().max(40).optional(),
    size: z.number().int().min(1).max(30).optional(),
  })
  .refine((v) => (v.kind === "level_exam" ? Boolean(v.levelKey) : Boolean(v.categorySlug || v.lessonId)), { message: "Wybierz zakres", path: ["kind"] });

export const answerInputSchema = z.object({
  questionId: z.string().min(1).max(100),
  /** Open answer, or justification ("dlaczego?") for closed questions. */
  answerText: z.string().max(4000).default(""),
  selectedOptionIds: z.array(z.string().max(100)).max(12).default([]),
  /** match: optionId -> chosen target text */
  matches: z.record(z.string().max(100), z.string().max(500)).default({}),
  selfConfidence: z.number().int().min(1).max(4).optional(),
  /** Self-assessment, used only when the AI cannot grade an open question. */
  selfRating: z.enum(SELF_RATINGS).optional(),
});

// ---- responses ----

export interface LessonSummary {
  id: string;
  title: string;
  status: VerificationStatus;
  completed: boolean;
  questionCount: number;
}
export interface ModuleRow {
  id: string;
  categorySlug: string;
  categoryName: string;
  levelKey: string | null;
  levelName: string | null;
  title: string;
  description: string | null;
  lessons: LessonSummary[];
}
export interface LessonDetail {
  id: string;
  moduleId: string;
  moduleTitle: string;
  categorySlug: string;
  title: string;
  body: string;
  status: VerificationStatus;
  source: SourceSummary | null;
  version: number;
  competencies: { key: string; name: string }[];
  questionCount: number;
  completed: boolean;
}
export interface QuestionForLearner {
  id: string;
  type: QuestionType;
  prompt: string;
  difficulty: number;
  status: VerificationStatus;
  /** single/multi: options to pick; match: left-hand items. Never includes correctness. */
  options: { id: string; text: string }[];
  /** match only: shuffled right-hand targets. */
  matchTargets: string[];
  autoGraded: boolean;
}
export interface QuestionFull extends QuestionForLearner {
  explanation: string;
  categorySlug: string | null;
  lessonId: string | null;
  competencyKeys: string[];
  fullOptions: { id: string; text: string; isCorrect: boolean; matchTarget: string | null }[];
  source: SourceSummary | null;
  version: number;
}
export interface AnswerResult {
  answerId: string;
  questionId: string;
  correctness: number;
  reasoningQuality: number | null;
  evidence: number;
  gradedBy: "auto" | "ai" | "self";
  feedback: string;
  explanation: string;
  correctOptionIds: string[];
  correctMatches: Record<string, string>;
  /** True when the AI was needed but unavailable — the client should ask for self-assessment. */
  needsSelfRating: boolean;
  nextReviewAt: string | null;
}
export interface AttemptView {
  id: string;
  quiz: { id: string; title: string; kind: QuizKind; passThreshold: number };
  startedAt: string;
  finishedAt: string | null;
  score: number | null;
  passed: boolean | null;
  questions: QuestionForLearner[];
  answers: AnswerResult[];
}
export interface AttemptRow {
  id: string;
  title: string;
  kind: QuizKind;
  startedAt: string;
  finishedAt: string | null;
  score: number | null;
  passed: boolean | null;
  answered: number;
  total: number;
}
export interface ProgressResponse {
  levels: {
    key: string;
    name: string;
    masteryThreshold: number;
    minEvidence: number;
    achieved: boolean;
    examPassed: boolean;
    competencies: { key: string; name: string; score: number | null; evidenceCount: number; met: boolean }[];
  }[];
  categories: { slug: string; name: string; answers: number; avgEvidence: number | null }[];
  stats: { answersTotal: number; answers30d: number; avgEvidence30d: number | null; dueReviews: number; lessonsCompleted: number };
}

export interface NextLessons {
  last: { id: string; title: string; moduleTitle: string; completed: boolean } | null;
  recommended: { id: string; title: string; moduleTitle: string; reason: string } | null;
}
