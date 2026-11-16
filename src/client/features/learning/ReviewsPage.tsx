import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import type { QuestionForLearner } from "../../../shared/learning";
import { Alert, Button, Card, EmptyState, PageHeader, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { QuestionRunner } from "./QuestionRunner";

export function useDueReviews() {
  return useQuery({
    queryKey: ["reviews", "due"],
    queryFn: () => apiFetch<{ questions: QuestionForLearner[]; total: number }>("/api/learning/reviews/due"),
  });
}

export function ReviewsPage() {
  const qc = useQueryClient();
  const due = useDueReviews();
  // Freeze the session's queue so answering does not reshuffle it.
  const [queue, setQueue] = useState<QuestionForLearner[] | null>(null);
  const [pos, setPos] = useState(0);
  const [answered, setAnswered] = useState(false);
  const list = queue ?? due.data?.questions ?? [];
  const current = list[pos];

  return (
    <>
      <PageHeader title="Powtórki" subtitle="Algorytm FSRS planuje powtórki tak, by utrwalić wiedzę tuż przed zapomnieniem. Najpierw najsłabsze kompetencje." />
      {due.isPending && <Spinner label="Ładowanie…" />}
      {due.isError && <Alert tone="error">{due.error.message}</Alert>}
      {due.data && due.data.total === 0 && !queue && (
        <EmptyState title="Na dziś nie ma powtórek">
          Pytania trafiają tu po odpowiedziach w <Link to="/egzaminy" className="text-accent underline">egzaminach i ćwiczeniach</Link>.
        </EmptyState>
      )}
      {list.length > 0 && current && (
        <>
          <p className="mb-3 text-sm text-muted">
            Pytanie {pos + 1} z {list.length}
            {due.data && due.data.total > list.length && ` (zaległych łącznie: ${due.data.total})`}
          </p>
          <Card>
            <QuestionRunner
              key={current.id}
              q={current}
              endpoint="/api/learning/reviews/answer"
              onAnswered={() => {
                setQueue(list);
                setAnswered(true);
                void qc.invalidateQueries({ queryKey: ["progress"] });
                void qc.invalidateQueries({ queryKey: ["dashboard"] });
              }}
            />
          </Card>
          {answered && (
            <div className="mt-4 flex justify-end">
              {pos < list.length - 1 ? (
                <Button
                  onClick={() => {
                    setPos(pos + 1);
                    setAnswered(false);
                  }}
                >
                  Następne pytanie
                </Button>
              ) : (
                <Button
                  onClick={async () => {
                    setQueue(null);
                    setPos(0);
                    setAnswered(false);
                    await qc.invalidateQueries({ queryKey: ["reviews", "due"] });
                  }}
                >
                  Zakończ sesję
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
