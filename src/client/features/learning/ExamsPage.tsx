import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { QUIZ_KIND_LABELS, type AttemptRow, type AttemptView, type QuizKind } from "../../../shared/learning";
import { formatDate } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, PageHeader, Select, Spinner } from "../../components/ui";
import { ApiRequestError, apiFetch } from "../../lib/api";
import { useCategories, useLevels } from "../../lib/queries";
import { QuestionRunner, ResultPanel } from "./QuestionRunner";

export function useStartQuiz() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function start(body: { kind: QuizKind; categorySlug?: string; lessonId?: string; levelKey?: string }) {
    setError(null);
    setPending(true);
    try {
      const { attemptId } = await apiFetch<{ attemptId: string }>("/api/learning/quizzes", { body });
      navigate(`/egzaminy/${attemptId}`);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Nie udało się rozpocząć.");
    } finally {
      setPending(false);
    }
  }
  return { start, error, pending };
}

export function ExamsPage() {
  const categories = useCategories();
  const levels = useLevels();
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState<QuizKind>("exam");
  const [level, setLevel] = useState("advanced_cook");
  const { start, error, pending } = useStartQuiz();
  const history = useQuery({ queryKey: ["attempts"], queryFn: async () => (await apiFetch<{ attempts: AttemptRow[] }>("/api/learning/attempts")).attempts });

  return (
    <>
      <PageHeader title="Egzaminy" subtitle="Wynik liczy zrozumienie: poprawność i jakość uzasadnienia. Samo trafienie nie wystarczy do zdania." />
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Z kategorii">
          <div className="grid gap-3">
            <Field label="Kategoria">
              {(p) => (
                <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">— wybierz —</option>
                  {categories.data?.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Rodzaj">
              {(p) => (
                <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as QuizKind)}>
                  <option value="practice">Ćwiczenie (5 pytań)</option>
                  <option value="exam">Egzamin (12 pytań, próg 70)</option>
                </Select>
              )}
            </Field>
            <Button disabled={!category} loading={pending} onClick={() => void start({ kind, categorySlug: category })}>
              Rozpocznij
            </Button>
          </div>
        </Card>
        <Card title="Egzamin na poziom">
          <div className="grid gap-3">
            <Field label="Poziom" hint="Poziom jest zaliczony, gdy zdasz ten egzamin i każda kompetencja poziomu osiągnie próg.">
              {(p) => (
                <Select {...p} value={level} onChange={(e) => setLevel(e.target.value)}>
                  {levels.data?.map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.name} (próg {l.masteryThreshold})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button loading={pending} onClick={() => void start({ kind: "level_exam", levelKey: level })}>
              Rozpocznij egzamin
            </Button>
          </div>
        </Card>
      </div>
      <h2 className="mb-2 mt-6 text-base font-semibold">Historia</h2>
      {history.isPending && <Spinner label="Ładowanie…" />}
      {history.data?.length === 0 && <EmptyState title="Brak podejść" />}
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {history.data?.map((a) => (
          <li key={a.id}>
            <Link to={`/egzaminy/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
              <span>
                <span className="font-medium">{a.title}</span>
                <span className="block text-xs text-muted">
                  {QUIZ_KIND_LABELS[a.kind]} · {formatDate(a.startedAt)} · {a.answered}/{a.total} odpowiedzi
                </span>
              </span>
              {a.finishedAt ? (
                <span className={`text-sm font-semibold ${a.passed ? "text-ok" : "text-danger"}`}>
                  {a.score} pkt · {a.passed ? "zaliczony" : "niezaliczony"}
                </span>
              ) : (
                <span className="text-sm text-warn">w toku</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function AttemptPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["attempt", id], queryFn: () => apiFetch<AttemptView>(`/api/learning/attempts/${id}`) });
  const [index, setIndex] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);

  if (q.isPending) return <Spinner label="Ładowanie…" />;
  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  const v = q.data;
  const answered = new Set(v.answers.map((a) => a.questionId));
  const firstOpen = v.questions.findIndex((x) => !answered.has(x.id));
  const current = index ?? (firstOpen === -1 ? v.questions.length : firstOpen);

  async function finish() {
    setFinishing(true);
    await apiFetch(`/api/learning/attempts/${id}/finish`, { body: {} }).catch(() => undefined);
    await Promise.all([qc.invalidateQueries({ queryKey: ["attempt", id] }), qc.invalidateQueries({ queryKey: ["attempts"] }), qc.invalidateQueries({ queryKey: ["progress"] })]);
    setFinishing(false);
  }

  if (v.finishedAt) {
    return (
      <>
        <Link to="/egzaminy" className="text-sm text-muted hover:text-fg">
          ← Egzaminy
        </Link>
        <PageHeader title={v.quiz.title} subtitle={QUIZ_KIND_LABELS[v.quiz.kind]} />
        <Card>
          <p className={`text-2xl font-bold ${v.passed ? "text-ok" : "text-danger"}`}>
            {v.score} / 100 — {v.passed ? "zaliczony" : "niezaliczony"}
          </p>
          <p className="mt-1 text-sm text-muted">Próg: {v.quiz.passThreshold}. Wynik = średnie zrozumienie (poprawność z uzasadnieniem); pytania bez odpowiedzi liczą się jako 0.</p>
        </Card>
        <div className="mt-4 grid gap-4">
          {v.questions.map((qq, i) => {
            const r = v.answers.find((a) => a.questionId === qq.id);
            return (
              <Card key={qq.id} title={`Pytanie ${i + 1}`}>
                <p className="mb-2 text-sm font-medium">{qq.prompt}</p>
                {r ? <ResultPanel q={qq} r={r} /> : <p className="text-sm text-muted">Bez odpowiedzi.</p>}
              </Card>
            );
          })}
        </div>
      </>
    );
  }

  const question = v.questions[current];
  return (
    <>
      <Link to="/egzaminy" className="text-sm text-muted hover:text-fg">
        ← Egzaminy
      </Link>
      <PageHeader title={v.quiz.title} subtitle={`${QUIZ_KIND_LABELS[v.quiz.kind]} · pytanie ${Math.min(current + 1, v.questions.length)} z ${v.questions.length}`} />
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={answered.size} aria-valuemin={0} aria-valuemax={v.questions.length} aria-label="Postęp">
        <div className="h-full bg-accent transition-all" style={{ width: `${(answered.size / v.questions.length) * 100}%` }} />
      </div>
      {question && !answered.has(question.id) ? (
        <Card>
          <QuestionRunner
            key={question.id}
            q={question}
            endpoint={`/api/learning/attempts/${id}/answers`}
            onAnswered={() => {
              // Stay on this question so the result and model answer can be read.
              setIndex(current);
              void qc.invalidateQueries({ queryKey: ["attempt", id] });
            }}
          />
        </Card>
      ) : (
        <Card>
          {question ? (
            <p className="text-sm font-medium">{question.prompt}</p>
          ) : (
            <p className="text-sm">{answered.size === v.questions.length ? "Odpowiedziano na wszystkie pytania." : "Zostały pytania bez odpowiedzi."}</p>
          )}
        </Card>
      )}
      {question && answered.has(question.id) && v.answers.find((a) => a.questionId === question.id) && (
        <div className="mt-3">
          <ResultPanel q={question} r={v.answers.find((a) => a.questionId === question.id)!} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        {(() => {
          const after = v.questions.findIndex((x, i) => i > current && !answered.has(x.id));
          const nextOpen = after !== -1 ? after : v.questions.findIndex((x) => !answered.has(x.id));
          const isAnswered = question ? answered.has(question.id) : true;
          if (nextOpen === -1 || nextOpen === current) return <span />;
          return (
            <Button variant={isAnswered ? "primary" : "secondary"} onClick={() => setIndex(nextOpen)}>
              {isAnswered ? "Następne pytanie" : "Pomiń"}
            </Button>
          );
        })()}
        <Button loading={finishing} onClick={() => void finish()} variant={answered.size === v.questions.length ? "primary" : "secondary"}>
          Zakończ i podsumuj
        </Button>
      </div>
    </>
  );
}
