import type { QuestionType, SelfRating } from "../../shared/learning";
import { foldText } from "../../shared/text";

export interface GradeOption {
  id: string;
  text: string;
  isCorrect: boolean;
  matchTarget: string | null;
}

export interface LearnerAnswer {
  answerText: string;
  selectedOptionIds: string[];
  matches: Record<string, string>;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Splits a free-text list ("ryż, nori; ogórek\nsezam") into folded items. */
function items(text: string): string[] {
  return [...new Set(text.split(/[,;\n]+/).map(foldText).filter(Boolean))];
}

/**
 * Correctness (0–100) for automatically graded types, or null for types that
 * need AI / self-assessment.
 */
export function autoCorrectness(type: QuestionType, options: GradeOption[], a: LearnerAnswer): number | null {
  const correct = options.filter((o) => o.isCorrect);
  switch (type) {
    case "single": {
      const picked = a.selectedOptionIds[0];
      return a.selectedOptionIds.length === 1 && correct.some((o) => o.id === picked) ? 100 : 0;
    }
    case "multi": {
      const picked = new Set(a.selectedOptionIds);
      const hits = correct.filter((o) => picked.has(o.id)).length;
      const wrong = options.filter((o) => !o.isCorrect && picked.has(o.id)).length;
      return clamp(((hits - wrong) / Math.max(1, correct.length)) * 100);
    }
    case "match": {
      const pairs = options.filter((o) => o.matchTarget);
      const ok = pairs.filter((o) => foldText(a.matches[o.id] ?? "") === foldText(o.matchTarget ?? "")).length;
      return clamp((ok / Math.max(1, pairs.length)) * 100);
    }
    case "fill_composition": {
      // Expected components are the correct options; extras that are not expected cost half a point each.
      const expected = correct.map((o) => foldText(o.text));
      const given = items(a.answerText.split("\n---\n")[0] ?? "");
      const hits = expected.filter((e) => given.includes(e)).length;
      const extras = given.filter((g) => !expected.includes(g)).length;
      return clamp(((hits - extras * 0.5) / Math.max(1, expected.length)) * 100);
    }
    case "identify": {
      const accepted = correct.map((o) => foldText(o.text));
      const first = foldText((a.answerText.split("\n---\n")[0] ?? "").split("\n")[0] ?? "");
      return accepted.includes(first) ? 100 : 0;
    }
    default:
      return null;
  }
}

/** For closed questions the learner may add a justification after a "---" line. */
export function justificationOf(type: QuestionType, answerText: string): string {
  if (type === "single" || type === "multi" || type === "match") return answerText.trim();
  if (type === "fill_composition" || type === "identify") return (answerText.split("\n---\n")[1] ?? "").trim();
  return answerText.trim();
}

export const SELF_RATING_CORRECTNESS: Record<SelfRating, number> = { again: 0, hard: 40, good: 75, easy: 95 };

/**
 * Evidence of understanding used for mastery and scheduling.
 * - Without a graded justification the score is capped at 70% of correctness:
 *   a lucky guess never counts as full mastery.
 * - A correct answer given with low confidence counts less.
 */
export function evidenceScore(correctness: number, reasoningQuality: number | null, selfConfidence?: number): number {
  let e = reasoningQuality === null ? correctness * 0.7 : correctness * 0.6 + reasoningQuality * 0.4;
  if (selfConfidence !== undefined && selfConfidence <= 2 && correctness >= 50) e *= 0.85;
  return clamp(e);
}

/** Maps evidence to an FSRS rating (1 Again … 4 Easy). */
export function fsrsRating(evidence: number): 1 | 2 | 3 | 4 {
  if (evidence < 40) return 1;
  if (evidence < 65) return 2;
  if (evidence < 88) return 3;
  return 4;
}

/** Running mastery: plain average for the first answers, then an exponential moving average. */
export function nextMastery(prev: { score: number; evidenceCount: number } | undefined, evidence: number): { score: number; evidenceCount: number } {
  if (!prev || prev.evidenceCount === 0) return { score: clamp(evidence), evidenceCount: 1 };
  const n = prev.evidenceCount + 1;
  const alpha = Math.max(0.25, 1 / n);
  return { score: clamp(prev.score + (evidence - prev.score) * alpha), evidenceCount: n };
}
