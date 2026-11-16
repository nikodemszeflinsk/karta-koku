import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { QUESTION_TYPE_LABELS, type LessonDetail, type QuestionFull } from "../../../shared/learning";
import type { VerificationStatus } from "../../../shared/knowledge";
import { Prose, Provenance, StatusBadge, StatusSourceFields, Textarea, useCanEdit } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useLevels } from "../../lib/queries";
import { useApiMutation } from "../../lib/use-api-mutation";
import { useStartQuiz } from "../learning/ExamsPage";
import { QuestionEditor } from "../learning/QuestionEditor";

function LessonForm({ initial, moduleId, onDone }: { initial?: LessonDetail; moduleId?: string; onDone: (id?: string) => void }) {
  const levels = useLevels();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [comps, setComps] = useState<string[]>(initial?.competencies.map((c) => c.key) ?? []);
  const [status, setStatus] = useState<VerificationStatus>(initial?.status ?? "needs_verification");
  const [sourceId, setSourceId] = useState<string | null>(initial?.source?.id ?? null);
  const save = useApiMutation<void, { id: string } | LessonDetail>(() => {
    const b = { title, body, competencyKeys: comps, status, sourceId };
    return initial ? { path: `/api/learning/lessons/${initial.id}`, method: "PATCH", body: { ...b, expectedVersion: initial.version } } : { path: "/api/learning/lessons", body: { ...b, moduleId } };
  }, [["modules"], ["lesson"]]);
  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        const res = await save.submit(undefined);
        if (res) onDone("id" in res ? res.id : undefined);
      }}
    >
      <Field label="Tytuł" error={save.fieldErrors?.title}>
        {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />}
      </Field>
      <Field label="Treść lekcji" error={save.fieldErrors?.body}>
        {(p) => <Textarea {...p} rows={16} value={body} onChange={(e) => setBody(e.target.value)} maxLength={50000} />}
      </Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Rozwijane kompetencje</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {levels.data?.flatMap((l) =>
            l.competencies.map((c) => (
              <label key={c.key} className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={comps.includes(c.key)} onChange={(e) => setComps((cs) => (e.target.checked ? [...cs, c.key] : cs.filter((x) => x !== c.key)))} />
                {c.name} <span className="text-xs text-muted">({l.name})</span>
              </label>
            )),
          )}
        </div>
      </fieldset>
      <StatusSourceFields status={status} sourceId={sourceId} onStatus={setStatus} onSource={setSourceId} errors={save.fieldErrors} />
      {save.isError && !save.fieldErrors && <Alert tone="error">{save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Anuluj
        </Button>
        <Button type="submit" loading={save.isPending}>
          {initial ? "Zapisz lekcję" : "Utwórz lekcję"}
        </Button>
      </div>
    </form>
  );
}

export function LessonNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Nowa lekcja" />
      <Card>
        <LessonForm moduleId={params.get("module") ?? ""} onDone={(id) => navigate(id ? `/akademia/lekcja/${id}` : "/akademia", { replace: true })} />
      </Card>
    </>
  );
}

function LessonQuestions({ lesson }: { lesson: LessonDetail }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const q = useQuery({
    queryKey: ["questions", "lesson", lesson.id],
    queryFn: async () => (await apiFetch<{ questions: QuestionFull[] }>(`/api/learning/questions?lesson=${lesson.id}`)).questions,
  });
  const del = useApiMutation<string>((id) => ({ path: `/api/learning/questions/${id}`, method: "DELETE" }), [["questions"], ["lesson"], ["modules"]]);
  return (
    <Card title="Pytania do lekcji (widok edytora)" action={editing !== "new" ? <Button variant="secondary" onClick={() => setEditing("new")}>Dodaj pytanie</Button> : undefined}>
      {editing === "new" && (
        <div className="mb-3">
          <QuestionEditor categorySlug={lesson.categorySlug} lessonId={lesson.id} onDone={() => setEditing(null)} />
        </div>
      )}
      {q.isPending && <Spinner label="Ładowanie…" />}
      {q.data?.length === 0 && editing !== "new" && <EmptyState title="Brak pytań" />}
      <ul className="grid gap-2">
        {q.data?.map((x) =>
          editing === x.id ? (
            <li key={x.id}>
              <QuestionEditor initial={x} categorySlug={lesson.categorySlug} lessonId={lesson.id} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={x.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-accent">{QUESTION_TYPE_LABELS[x.type]}</p>
                  <p className="text-sm font-medium">{x.prompt}</p>
                </div>
                <span className="flex items-center gap-1">
                  <StatusBadge status={x.status} />
                  <Button variant="ghost" onClick={() => setEditing(x.id)}>
                    Edytuj
                  </Button>
                  <Button variant="ghost" onClick={() => confirm("Usunąć pytanie?") && del.mutate(x.id)}>
                    Usuń
                  </Button>
                </span>
              </div>
            </li>
          ),
        )}
      </ul>
    </Card>
  );
}

export function LessonPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ["lesson", id], queryFn: () => apiFetch<LessonDetail>(`/api/learning/lessons/${id}`) });
  const complete = useApiMutation<void>(() => ({ path: `/api/learning/lessons/${id}/complete`, body: {} }), [["lesson", id], ["modules"], ["progress"]]);
  const del = useApiMutation<void>(() => ({ path: `/api/learning/lessons/${id}`, method: "DELETE" }), [["modules"]]);
  const { start, error: quizError, pending } = useStartQuiz();

  useEffect(() => {
    void apiFetch(`/api/learning/lessons/${id}/open`, { body: {} })
      .then(() => qc.invalidateQueries({ queryKey: ["next"] }))
      .catch(() => undefined);
  }, [id, qc]);

  if (q.isPending) return <Spinner label="Ładowanie lekcji…" />;
  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  const l = q.data;

  if (editing) {
    return (
      <>
        <PageHeader title={`Edycja: ${l.title}`} />
        <Card>
          <LessonForm initial={l} onDone={() => setEditing(false)} />
        </Card>
      </>
    );
  }

  return (
    <>
      <Link to="/akademia" className="text-sm text-muted hover:text-fg">
        ← Akademia · {l.moduleTitle}
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{l.title}</h1>
        {canEdit && (
          <span className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edytuj
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                if (confirm("Usunąć lekcję?") && (await del.submit(undefined)) !== undefined) navigate("/akademia", { replace: true });
              }}
            >
              Usuń
            </Button>
          </span>
        )}
      </div>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-2">
        <Provenance status={l.status} source={l.source} />
        {l.competencies.map((c) => (
          <span key={c.key} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
            {c.name}
          </span>
        ))}
      </div>
      {l.status !== "confirmed" && (
        <div className="mb-4">
          <Alert>Treść tej lekcji nie jest potwierdzona — traktuj ją jako wiedzę ogólną do weryfikacji.</Alert>
        </div>
      )}
      <article className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <Prose text={l.body} className="text-base leading-7" />
      </article>
      {quizError && (
        <div className="mt-3">
          <Alert tone="error">{quizError}</Alert>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {l.completed ? (
          <span className="inline-flex min-h-11 items-center text-sm font-semibold text-ok">✓ Lekcja ukończona</span>
        ) : (
          <Button variant="secondary" loading={complete.isPending} onClick={() => void complete.submit(undefined)}>
            Oznacz jako ukończoną
          </Button>
        )}
        <Button disabled={l.questionCount === 0} loading={pending} onClick={() => void start({ kind: "practice", lessonId: l.id })}>
          Sprawdź się ({l.questionCount} pyt.)
        </Button>
      </div>
      {canEdit && (
        <div className="mt-6">
          <LessonQuestions lesson={l} />
        </div>
      )}
    </>
  );
}
