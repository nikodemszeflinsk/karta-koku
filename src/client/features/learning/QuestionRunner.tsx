import { useState, type FormEvent } from "react";
import {
  QUESTION_TYPE_LABELS,
  SELF_RATING_LABELS,
  SELF_RATINGS,
  type AnswerResult,
  type QuestionForLearner,
  type SelfRating,
} from "../../../shared/learning";
import { Prose, StatusBadge, Textarea } from "../../components/knowledge";
import { Alert, Button, Field, Input, Select } from "../../components/ui";
import { ApiRequestError, apiFetch } from "../../lib/api";

interface Draft {
  answerText: string;
  justification: string;
  selected: string[];
  matches: Record<string, string>;
  confidence: string;
}

const CONFIDENCE = [
  ["1", "Zgaduję"],
  ["2", "Raczej niepewny"],
  ["3", "Raczej pewny"],
  ["4", "Pewny"],
] as const;

function body(q: QuestionForLearner, d: Draft, selfRating?: SelfRating) {
  const needsSplit = q.type === "fill_composition" || q.type === "identify";
  const answerText = needsSplit ? (d.justification.trim() ? `${d.answerText}\n---\n${d.justification}` : d.answerText) : q.autoGraded ? d.justification : d.answerText;
  return {
    questionId: q.id,
    answerText,
    selectedOptionIds: d.selected,
    matches: d.matches,
    selfConfidence: Number(d.confidence),
    ...(selfRating ? { selfRating } : {}),
  };
}

function Score({ label, value }: { label: string; value: number | null }) {
  if (value === null) return <span className="text-muted">{label}: nie oceniono</span>;
  const tone = value >= 75 ? "text-ok" : value >= 45 ? "text-warn" : "text-danger";
  return (
    <span>
      {label}: <strong className={tone}>{value}</strong>/100
    </span>
  );
}

export function ResultPanel({ q, r }: { q: QuestionForLearner; r: AnswerResult }) {
  return (
    <div className="grid gap-2 rounded-xl border border-border bg-surface-2 p-4" role="status">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Score label="Poprawność" value={r.correctness} />
        <Score label="Uzasadnienie" value={r.reasoningQuality} />
        <Score label="Zrozumienie (do opanowania)" value={r.evidence} />
      </div>
      <p className="text-xs text-muted">
        Ocena: {r.gradedBy === "ai" ? "trener AI" : r.gradedBy === "auto" ? "automatyczna" : "samoocena"}
        {r.nextReviewAt && ` · następna powtórka: ${new Date(r.nextReviewAt).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" })}`}
      </p>
      {r.feedback && <Prose text={r.feedback} />}
      {(q.type === "single" || q.type === "multi") && r.correctOptionIds.length > 0 && (
        <p className="text-sm">
          <span className="text-muted">Poprawne:</span> {q.options.filter((o) => r.correctOptionIds.includes(o.id)).map((o) => o.text).join(", ")}
        </p>
      )}
      {q.type === "match" && (
        <ul className="text-sm">
          {q.options.map((o) => (
            <li key={o.id}>
              {o.text} → <strong>{r.correctMatches[o.id]}</strong>
            </li>
          ))}
        </ul>
      )}
      <div>
        <p className="text-xs font-semibold text-accent">Wzorcowa odpowiedź</p>
        <Prose text={r.explanation} />
      </div>
    </div>
  );
}

/**
 * Renders one question, submits the answer to `endpoint`, shows the graded result.
 * Handles the self-assessment round-trip when the AI cannot grade an open answer.
 */
export function QuestionRunner({ q, endpoint, onAnswered }: { q: QuestionForLearner; endpoint: string; onAnswered: (r: AnswerResult) => void }) {
  const [d, setD] = useState<Draft>({ answerText: "", justification: "", selected: [], matches: {}, confidence: "3" });
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));

  async function submit(selfRating?: SelfRating) {
    setPending(true);
    setError(null);
    try {
      const r = await apiFetch<AnswerResult>(endpoint, { body: body(q, d, selfRating) });
      setResult(r);
      if (!r.needsSelfRating) onAnswered(r);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Nie udało się wysłać odpowiedzi.");
    } finally {
      setPending(false);
    }
  }

  const canSubmit =
    q.type === "single" || q.type === "multi"
      ? d.selected.length > 0
      : q.type === "match"
        ? q.options.every((o) => d.matches[o.id])
        : d.answerText.trim().length > 0;

  const done = result && !result.needsSelfRating;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-medium text-accent">{QUESTION_TYPE_LABELS[q.type]}</span>
        <span>trudność {q.difficulty}/3</span>
        {q.status !== "confirmed" && <StatusBadge status={q.status} />}
      </div>
      <Prose text={q.prompt} className="text-base font-medium" />

      <form
        className="grid gap-3"
        noValidate
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={Boolean(result) || pending} className="grid gap-3">
          {q.type === "single" &&
            q.options.map((o) => (
              <label key={o.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input type="radio" name={`q-${q.id}`} className="size-5 accent-[var(--color-accent)]" checked={d.selected[0] === o.id} onChange={() => set("selected", [o.id])} />
                {o.text}
              </label>
            ))}
          {q.type === "multi" && (
            <>
              <p className="text-xs text-muted">Zaznacz wszystkie poprawne — błędnie zaznaczone obniżają wynik.</p>
              {q.options.map((o) => (
                <label key={o.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--color-accent)]"
                    checked={d.selected.includes(o.id)}
                    onChange={(e) => set("selected", e.target.checked ? [...d.selected, o.id] : d.selected.filter((x) => x !== o.id))}
                  />
                  {o.text}
                </label>
              ))}
            </>
          )}
          {q.type === "match" &&
            q.options.map((o) => (
              <div key={o.id} className="grid gap-1 sm:grid-cols-2 sm:items-center">
                <span className="text-sm font-medium">{o.text}</span>
                <Select aria-label={`Dopasuj: ${o.text}`} value={d.matches[o.id] ?? ""} onChange={(e) => set("matches", { ...d.matches, [o.id]: e.target.value })}>
                  <option value="">— wybierz —</option>
                  {q.matchTargets.map((t, i) => (
                    <option key={i} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          {q.type === "fill_composition" && (
            <Field label="Składniki / komponenty" hint="Oddziel przecinkami lub w nowych liniach.">
              {(p) => <Textarea {...p} rows={3} value={d.answerText} onChange={(e) => set("answerText", e.target.value)} maxLength={3000} />}
            </Field>
          )}
          {q.type === "identify" && (
            <Field label="Twoja odpowiedź">{(p) => <Input {...p} value={d.answerText} onChange={(e) => set("answerText", e.target.value)} maxLength={300} />}</Field>
          )}
          {!q.autoGraded && (
            <Field label="Twoja odpowiedź" hint="Wyjaśnij mechanizm — oceniane jest także uzasadnienie.">
              {(p) => <Textarea {...p} rows={6} value={d.answerText} onChange={(e) => set("answerText", e.target.value)} maxLength={4000} />}
            </Field>
          )}
          {q.autoGraded && (
            <Field label="Dlaczego? (uzasadnienie)" hint="Bez uzasadnienia poprawna odpowiedź liczy się do opanowania najwyżej w 70%.">
              {(p) => <Textarea {...p} rows={3} value={d.justification} onChange={(e) => set("justification", e.target.value)} maxLength={2000} />}
            </Field>
          )}
          <Field label="Pewność odpowiedzi">
            {(p) => (
              <Select {...p} value={d.confidence} onChange={(e) => set("confidence", e.target.value)}>
                {CONFIDENCE.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </fieldset>
        {error && <Alert tone="error">{error}</Alert>}
        {!result && (
          <Button type="submit" loading={pending} disabled={!canSubmit}>
            Sprawdź
          </Button>
        )}
      </form>

      {result?.needsSelfRating && (
        <div className="grid gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4">
          <p className="text-sm">{result.feedback}</p>
          <div>
            <p className="text-xs font-semibold text-accent">Wzorcowa odpowiedź</p>
            <Prose text={result.explanation} />
          </div>
          <p className="text-sm font-medium">Jak oceniasz swoją odpowiedź?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SELF_RATINGS.map((s) => (
              <Button key={s} variant="secondary" loading={pending} onClick={() => void submit(s)}>
                {SELF_RATING_LABELS[s]}
              </Button>
            ))}
          </div>
        </div>
      )}
      {done && <ResultPanel q={q} r={result} />}
    </div>
  );
}
