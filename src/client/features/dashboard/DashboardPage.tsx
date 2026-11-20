import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import type { NextLessons } from "../../../shared/learning";
import { Alert, Card, EmptyState, PageHeader, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useDashboard } from "../../lib/queries";
import { InstallBanner } from "../install/InstallPage";
import { useKitchenSummary } from "../kitchen/common";
import { Bar, useProgress } from "../learning/ProgressPage";

const linkClass = "font-semibold text-accent underline-offset-2 hover:underline";

export function DashboardPage() {
  const dash = useDashboard();
  const progress = useProgress();
  const next = useQuery({ queryKey: ["next"], queryFn: () => apiFetch<NextLessons>("/api/learning/next") });

  if (dash.isPending) return <Spinner label="Ładowanie pulpitu…" />;
  if (dash.isError) return <Alert tone="error">Nie udało się wczytać pulpitu: {dash.error.message}</Alert>;

  const d = dash.data;
  const today = new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Warsaw" }).format(new Date());
  const level = d.targetLevel ? progress.data?.levels.find((l) => l.key === d.targetLevel!.key) : undefined;
  const due = progress.data?.stats.dueReviews ?? 0;

  return (
    <>
      <PageHeader title={`Cześć, ${d.greetingName}`} subtitle={today} />
      <InstallBanner />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Kontynuuj naukę" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {next.data?.last ? (
              <Link to={`/akademia/lekcja/${next.data.last.id}`} className="rounded-lg border border-border p-3 hover:bg-surface-2">
                <p className="text-xs text-muted">Ostatnia lekcja · {next.data.last.moduleTitle}</p>
                <p className="font-medium">{next.data.last.title}</p>
                {next.data.last.completed && <p className="text-xs text-ok">✓ ukończona</p>}
              </Link>
            ) : (
              <EmptyState title="Ostatnia lekcja">Nie otwarto jeszcze żadnej lekcji.</EmptyState>
            )}
            {next.data?.recommended ? (
              <Link to={`/akademia/lekcja/${next.data.recommended.id}`} className="rounded-lg border border-accent/40 bg-accent-soft p-3 hover:opacity-90">
                <p className="text-xs text-accent">Polecana następna</p>
                <p className="font-medium">{next.data.recommended.title}</p>
                <p className="text-xs text-muted">{next.data.recommended.reason}</p>
              </Link>
            ) : (
              <EmptyState title="Polecana lekcja">
                Brak nieukończonych lekcji.{" "}
                <Link to="/akademia" className={linkClass}>
                  Akademia
                </Link>
              </EmptyState>
            )}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card title="Dzisiejsza powtórka" action={<Link to="/powtorki" className={`text-sm ${linkClass}`}>Zacznij</Link>}>
            <p className="text-2xl font-bold tabular-nums">{due}</p>
            <p className="text-xs text-muted">{due === 0 ? "Brak zaległych pytań." : "pytań do powtórki"}</p>
          </Card>
          <KitchenTodayCard linkClass={linkClass} />
        </div>

        <Card title="Cel rozwoju" className="lg:col-span-2" action={<Link to="/postepy" className={`text-sm ${linkClass}`}>Postępy</Link>}>
          {d.targetLevel ? (
            <>
              <p className="text-sm text-muted">
                Poziom docelowy: <span className="font-semibold text-fg">{d.targetLevel.name}</span>
                {level && (level.achieved ? <span className="ml-2 text-ok">✓ zaliczony</span> : level.examPassed ? " · egzamin zdany" : "")}
              </p>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {(level?.competencies ?? d.targetLevel.competencies.map((c) => ({ ...c, score: null, evidenceCount: 0, met: false }))).map((c) => (
                  <li key={c.key}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span>
                        {c.met && <span className="mr-1 text-ok">✓</span>}
                        {c.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted">{c.score === null ? "brak danych" : `${c.score} · ${c.evidenceCount} odp.`}</span>
                    </div>
                    <Bar value={c.score} threshold={d.targetLevel!.masteryThreshold} label={`${c.name}: opanowanie`} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState title="Nie wybrano poziomu docelowego">
              <Link to="/ustawienia" className={linkClass}>
                Wybierz go w ustawieniach
              </Link>
            </EmptyState>
          )}
        </Card>

        <div className="grid gap-4">
          <Card title="Ostatnie błędy">
            {d.recentMistakes.length === 0 ? (
              <p className="text-sm text-muted">Brak ocenionych błędnych odpowiedzi.</p>
            ) : (
              <ul className="grid gap-2">
                {d.recentMistakes.map((m) => (
                  <li key={m.id} className="text-sm">
                    <span>{m.question.length > 90 ? `${m.question.slice(0, 90)}…` : m.question}</span>
                    <span className="block text-xs text-muted">
                      poprawność {m.correctness} · uzasadnienie {m.reasoningQuality ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Notatnik" action={<Link to="/notatnik" className={`text-sm ${linkClass}`}>Otwórz</Link>}>
            <p className="text-sm text-muted">{d.openNotes === 0 ? "Brak otwartych pytań." : `Otwarte pytania do wyjaśnienia: ${d.openNotes}`}</p>
          </Card>
        </div>

        <Card title="Postęp w kategoriach" className="lg:col-span-3" action={<Link to="/akademia" className={`text-sm ${linkClass}`}>Akademia</Link>}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.categories.map((c) => {
              const p = progress.data?.categories.find((x) => x.slug === c.slug);
              return (
                <li key={c.slug}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span>{c.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {p?.avgEvidence ?? "—"} · {c.materialCount} wpis.
                    </span>
                  </div>
                  <Bar value={p?.avgEvidence ?? null} label={`${c.name}: średnie zrozumienie`} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}

function KitchenTodayCard({ linkClass }: { linkClass: string }) {
  const k = useKitchenSummary();
  const s = k.data;
  const rows: [string, string, boolean][] = s
    ? [
        ["HACCP dziś", s.haccp.units ? `${s.haccp.measuredToday}/${s.haccp.units}${s.haccp.pestCheckedToday ? " · szkodniki ✓" : ""}` : "brak urządzeń", s.haccp.units > 0 && s.haccp.measuredToday >= s.haccp.units && s.haccp.outOfRangeToday === 0],
        ["Hurtownia", s.wholesale.items ? `${s.wholesale.toOrder} do zamówienia` : "brak pozycji", s.wholesale.toOrder === 0],
        ["Zakupy", s.shopping.items ? `${s.shopping.toBuy} do kupienia` : "brak pozycji", s.shopping.toBuy === 0],
        ["Zmiana", s.handover.last ? (s.handover.last.acknowledged ? "przejęta" : "czeka na przejęcie") : "brak protokołu", Boolean(s.handover.last?.acknowledged)],
      ]
    : [];
  return (
    <Card title="Kuchnia dziś" action={<Link to="/kuchnia" className={`text-sm ${linkClass}`}>Otwórz</Link>}>
      {!s ? (
        <Spinner small />
      ) : (
        <ul className="grid gap-1.5 text-sm">
          {rows.map(([label, value, ok]) => (
            <li key={label} className="flex items-center justify-between gap-2">
              <span className="text-muted">{label}</span>
              <span className={`font-medium ${ok ? "text-ok" : ""}`}>{value}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
