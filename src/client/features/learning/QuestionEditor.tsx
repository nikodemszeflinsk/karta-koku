import { useState, type FormEvent } from "react";
import { NEEDS_OPTIONS, QUESTION_TYPE_LABELS, QUESTION_TYPES, type QuestionFull, type QuestionType } from "../../../shared/learning";
import type { VerificationStatus } from "../../../shared/knowledge";
import { StatusSourceFields, Textarea } from "../../components/knowledge";
import { Alert, Button, Field, Input, Select } from "../../components/ui";
import { useLevels } from "../../lib/queries";
import { useApiMutation } from "../../lib/use-api-mutation";

type Opt = { text: string; isCorrect: boolean; matchTarget: string };

const OPTION_HINT: Partial<Record<QuestionType, string>> = {
  single: "Zaznacz dokładnie jedną poprawną opcję.",
  multi: "Zaznacz wszystkie poprawne opcje.",
  fill_composition: "Wpisz oczekiwane składniki (każdy jako poprawny).",
  identify: "Wpisz akceptowane odpowiedzi (każda jako poprawna).",
  match: "Każdy wiersz: surowiec → zastosowanie.",
};

export function QuestionEditor({
  initial,
  categorySlug,
  lessonId,
  onDone,
}: {
  initial?: QuestionFull;
  categorySlug: string | null;
  lessonId: string | null;
  onDone: () => void;
}) {
  const levels = useLevels();
  const [type, setType] = useState<QuestionType>(initial?.type ?? "single");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [difficulty, setDifficulty] = useState(String(initial?.difficulty ?? 2));
  const [comps, setComps] = useState<string[]>(initial?.competencyKeys ?? []);
  const [opts, setOpts] = useState<Opt[]>(
    initial?.fullOptions.map((o) => ({ text: o.text, isCorrect: o.isCorrect, matchTarget: o.matchTarget ?? "" })) ?? [
      { text: "", isCorrect: true, matchTarget: "" },
      { text: "", isCorrect: false, matchTarget: "" },
    ],
  );
  const [status, setStatus] = useState<VerificationStatus>(initial?.status ?? "needs_verification");
  const [sourceId, setSourceId] = useState<string | null>(initial?.source?.id ?? null);

  const save = useApiMutation<void>(() => {
    const question = {
      type,
      prompt,
      explanation,
      difficulty: Number(difficulty),
      categorySlug,
      lessonId,
      competencyKeys: comps,
      options: NEEDS_OPTIONS.includes(type)
        ? opts.filter((o) => o.text.trim()).map((o) => ({ text: o.text, isCorrect: type === "match" ? true : o.isCorrect, matchTarget: type === "match" ? o.matchTarget : null }))
        : [],
      status,
      sourceId,
    };
    return initial ? { path: `/api/learning/questions/${initial.id}`, method: "PUT", body: { expectedVersion: initial.version, question } } : { path: "/api/learning/questions", body: question };
  }, [["questions"], ["lesson"], ["modules"]]);

  const updOpt = (i: number, p: Partial<Opt>) => setOpts((os) => os.map((o, j) => (j === i ? { ...o, ...p } : type === "single" && p.isCorrect ? { ...o, isCorrect: false } : o)));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if ((await save.submit(undefined)) !== undefined) onDone();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-border bg-surface p-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Typ pytania">
          {(p) => (
            <Select {...p} value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Trudność">
          {(p) => (
            <Select {...p} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="1">1 — podstawowa</option>
              <option value="2">2 — średnia</option>
              <option value="3">3 — trudna</option>
            </Select>
          )}
        </Field>
      </div>
      <Field label="Treść pytania" error={save.fieldErrors?.prompt}>
        {(p) => <Textarea {...p} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={3000} />}
      </Field>
      {NEEDS_OPTIONS.includes(type) && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Odpowiedzi</legend>
          <p className="text-xs text-muted">{OPTION_HINT[type]}</p>
          {opts.map((o, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              {type !== "match" && (
                <input
                  type={type === "single" ? "radio" : "checkbox"}
                  name="correct"
                  aria-label={`Poprawna: ${o.text || `opcja ${i + 1}`}`}
                  className="size-5 accent-[var(--color-accent)]"
                  checked={o.isCorrect}
                  onChange={(e) => updOpt(i, { isCorrect: e.target.checked })}
                />
              )}
              <Input aria-label={`Opcja ${i + 1}`} className="min-w-0 flex-1" value={o.text} onChange={(e) => updOpt(i, { text: e.target.value })} maxLength={500} />
              {type === "match" && (
                <>
                  <span aria-hidden="true">→</span>
                  <Input aria-label={`Odpowiednik ${i + 1}`} className="min-w-0 flex-1" value={o.matchTarget} onChange={(e) => updOpt(i, { matchTarget: e.target.value })} maxLength={500} />
                </>
              )}
              <Button type="button" variant="ghost" aria-label={`Usuń opcję ${i + 1}`} onClick={() => setOpts((os) => os.filter((_, j) => j !== i))}>
                ×
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => setOpts((os) => [...os, { text: "", isCorrect: type !== "single" && type !== "multi", matchTarget: "" }])}>
            + Opcja
          </Button>
          {save.fieldErrors?.options && <p className="text-xs text-danger">{save.fieldErrors.options}</p>}
        </fieldset>
      )}
      <Field label="Wzorcowa odpowiedź / kryteria oceny" error={save.fieldErrors?.explanation} hint="Pokazywana po odpowiedzi i używana przez trenera AI do oceny.">
        {(p) => <Textarea {...p} rows={4} value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={5000} />}
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Kompetencje</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {levels.data?.flatMap((l) =>
            l.competencies.map((c) => (
              <label key={c.key} className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent)]"
                  checked={comps.includes(c.key)}
                  onChange={(e) => setComps((cs) => (e.target.checked ? [...cs, c.key] : cs.filter((x) => x !== c.key)))}
                />
                <span>
                  {c.name} <span className="text-xs text-muted">({l.name})</span>
                </span>
              </label>
            )),
          )}
        </div>
      </fieldset>
      <StatusSourceFields status={status} sourceId={sourceId} onStatus={setStatus} onSource={setSourceId} errors={save.fieldErrors} />
      {save.isError && !save.fieldErrors && <Alert tone="error">{save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Anuluj
        </Button>
        <Button type="submit" loading={save.isPending}>
          {initial ? "Zapisz pytanie" : "Dodaj pytanie"}
        </Button>
      </div>
    </form>
  );
}
