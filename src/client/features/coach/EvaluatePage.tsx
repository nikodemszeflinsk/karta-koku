import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { EvaluationRow } from "../../../shared/ai";
import { formatDate, Prose, Textarea } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, PageHeader, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useAiStatus } from "../../lib/ai";
import { useApiMutation } from "../../lib/use-api-mutation";

const VERDICT: Record<EvaluationRow["verdict"], { label: string; cls: string }> = {
  correct: { label: "Poprawna", cls: "text-ok" },
  partially_correct: { label: "Częściowo poprawna", cls: "text-warn" },
  incorrect: { label: "Błędna", cls: "text-danger" },
};

export function EvaluationCard({ e }: { e: EvaluationRow }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-medium">{e.question}</p>
      <p className="mt-1 text-sm text-muted">Twoja odpowiedź: {e.answer}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
        <span className={`font-semibold ${VERDICT[e.verdict].cls}`}>{VERDICT[e.verdict].label}</span>
        <span>Poprawność: <strong>{e.correctness}</strong>/100</span>
        <span>Uzasadnienie: <strong>{e.reasoningQuality}</strong>/100</span>
      </div>
      <Prose text={e.feedback} className="mt-2" />
      {e.misconceptions.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-danger">
          {e.misconceptions.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      {e.followUpQuestion && <p className="mt-2 text-sm"><span className="text-muted">Pytanie pogłębiające:</span> {e.followUpQuestion}</p>}
      <p className="mt-2 text-xs text-muted">{formatDate(e.createdAt)}</p>
    </div>
  );
}

export function EvaluatePage() {
  const status = useAiStatus();
  const list = useQuery({ queryKey: ["ai", "evaluations"], queryFn: async () => (await apiFetch<{ evaluations: EvaluationRow[] }>("/api/ai/evaluations")).evaluations });
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState("3");
  const [last, setLast] = useState<EvaluationRow | null>(null);
  const ev = useApiMutation<void, EvaluationRow>(() => ({ path: "/api/ai/evaluate", body: { question, answer, selfConfidence: Number(confidence) } }), [["ai", "evaluations"], ["ai", "status"], ["dashboard"]]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await ev.submit(undefined);
    if (res) {
      setLast(res);
      setAnswer("");
    }
  }

  return (
    <>
      <Link to="/trener" className="text-sm text-muted hover:text-fg">
        ← Trener AI
      </Link>
      <PageHeader title="Oceń moją odpowiedź" subtitle="Trener ocenia poprawność i osobno jakość uzasadnienia. Trafienie bez zrozumienia nie daje pełnej oceny." />
      {status.data && !status.data.enabled && (
        <div className="mb-4">
          <Alert>{status.data.reason}</Alert>
        </div>
      )}
      <Card>
        <form onSubmit={onSubmit} className="grid gap-3" noValidate>
          <Field label="Pytanie" error={ev.fieldErrors?.question}>
            {(p) => <Textarea {...p} rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000} />}
          </Field>
          <Field label="Twoja odpowiedź (z uzasadnieniem)" error={ev.fieldErrors?.answer}>
            {(p) => <Textarea {...p} rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={4000} />}
          </Field>
          <Field label="Jak bardzo jesteś pewien odpowiedzi?">
            {(p) => (
              <Select {...p} value={confidence} onChange={(e) => setConfidence(e.target.value)}>
                <option value="1">Zgaduję</option>
                <option value="2">Raczej niepewny</option>
                <option value="3">Raczej pewny</option>
                <option value="4">Pewny</option>
              </Select>
            )}
          </Field>
          {ev.isError && !ev.fieldErrors && <Alert tone="error">{ev.error.message}</Alert>}
          <Button type="submit" loading={ev.isPending} disabled={!question.trim() || !answer.trim() || status.data?.enabled === false}>
            Oceń
          </Button>
        </form>
      </Card>
      {last && (
        <div className="mt-4">
          <EvaluationCard e={last} />
        </div>
      )}
      <h2 className="mb-2 mt-6 text-base font-semibold">Historia ocen</h2>
      {list.isPending && <Spinner label="Ładowanie…" />}
      {list.data?.length === 0 && <EmptyState title="Brak ocen" />}
      <div className="grid gap-3">
        {list.data?.filter((e) => e.id !== last?.id).map((e) => <EvaluationCard key={e.id} e={e} />)}
      </div>
    </>
  );
}
