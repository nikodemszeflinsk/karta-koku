import { useQuery } from "@tanstack/react-query";
import type { ProgressResponse } from "../../../shared/learning";
import { Alert, Card, PageHeader, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";

export function useProgress() {
  return useQuery({ queryKey: ["progress"], queryFn: () => apiFetch<ProgressResponse>("/api/learning/progress") });
}

export function Bar({ value, threshold, label }: { value: number | null; threshold?: number; label: string }) {
  const v = value ?? 0;
  const tone = threshold !== undefined ? (v >= threshold ? "bg-ok" : "bg-accent") : "bg-accent";
  return (
    <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2" role="meter" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full ${tone}`} style={{ width: `${v}%` }} />
      {threshold !== undefined && <div className="absolute top-0 h-full w-0.5 bg-fg/50" style={{ left: `${threshold}%` }} aria-hidden="true" />}
    </div>
  );
}

export function ProgressPage() {
  const p = useProgress();
  if (p.isPending) return <Spinner label="Ładowanie postępów…" />;
  if (p.isError) return <Alert tone="error">{p.error.message}</Alert>;
  const { levels, categories, stats } = p.data;
  return (
    <>
      <PageHeader title="Postępy" subtitle="Poziom jest zaliczony, gdy każda kompetencja osiągnie próg (przy minimalnej liczbie ocenionych odpowiedzi) i zdasz egzamin na poziom." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Odpowiedzi", stats.answersTotal],
          ["Ostatnie 30 dni", stats.answers30d],
          ["Śr. zrozumienie 30 dni", stats.avgEvidence30d ?? "—"],
          ["Powtórki na dziś", stats.dueReviews],
          ["Ukończone lekcje", stats.lessonsCompleted],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4">
        {levels.map((l) => (
          <Card
            key={l.key}
            title={l.name}
            action={<span className={`text-sm font-semibold ${l.achieved ? "text-ok" : "text-muted"}`}>{l.achieved ? "✓ zaliczony" : l.examPassed ? "egzamin zdany" : "w trakcie"}</span>}
          >
            <p className="mb-3 text-xs text-muted">
              Próg {l.masteryThreshold} · min. {l.minEvidence} ocenionych odpowiedzi na kompetencję · egzamin: {l.examPassed ? "zdany" : "niezdany"}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {l.competencies.map((c) => (
                <li key={c.key}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span>
                      {c.met && <span className="mr-1 text-ok" aria-label="spełniona">✓</span>}
                      {c.name}
                    </span>
                    <span className="text-xs tabular-nums text-muted">
                      {c.score ?? "—"} · {c.evidenceCount}/{l.minEvidence}
                    </span>
                  </div>
                  <Bar value={c.score} threshold={l.masteryThreshold} label={`${c.name}: opanowanie`} />
                </li>
              ))}
            </ul>
          </Card>
        ))}
        <Card title="Kategorie">
          <ul className="grid gap-3 sm:grid-cols-2">
            {categories.map((c) => (
              <li key={c.slug}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span>{c.name}</span>
                  <span className="text-xs tabular-nums text-muted">
                    {c.avgEvidence ?? "—"} · {c.answers} odp.
                  </span>
                </div>
                <Bar value={c.avgEvidence} label={`${c.name}: średnie zrozumienie`} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
