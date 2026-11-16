import { Link } from "react-router";
import { Alert, Card, EmptyState, PageHeader, Spinner } from "../../components/ui";
import { useDashboard } from "../../lib/queries";

const linkClass = "font-semibold text-accent underline-offset-2 hover:underline";

export function DashboardPage() {
  const dash = useDashboard();

  if (dash.isPending) return <Spinner label="Ładowanie pulpitu…" />;
  if (dash.isError) return <Alert tone="error">Nie udało się wczytać pulpitu: {dash.error.message}</Alert>;

  const d = dash.data;
  const today = new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Warsaw" }).format(new Date());

  return (
    <>
      <PageHeader title={`Cześć, ${d.greetingName}`} subtitle={today} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Cel rozwoju" className="lg:col-span-2">
          {d.targetLevel ? (
            <>
              <p className="text-sm text-muted">
                Poziom docelowy: <span className="font-semibold text-fg">{d.targetLevel.name}</span>
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {d.targetLevel.competencies.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                    <span>{c.name}</span>
                    <span className="shrink-0 text-xs text-muted" title="Opanowanie pojawi się po pierwszych odpowiedziach w egzaminach">
                      brak danych
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Próg zaliczenia: {d.targetLevel.masteryThreshold}% w każdej kompetencji, min. {d.targetLevel.minEvidence} ocenionych
                odpowiedzi na kompetencję.
              </p>
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
          <Card title="Trener AI">
            <p className="text-sm text-muted">{d.ai.reason ?? "Trener jest dostępny."}</p>
          </Card>
          <Card title="Notatnik" action={<Link to="/notatnik" className={`text-sm ${linkClass}`}>Otwórz</Link>}>
            <p className="text-sm text-muted">
              {d.openNotes === 0 ? "Brak otwartych pytań." : `Otwarte pytania do wyjaśnienia: ${d.openNotes}`}
            </p>
          </Card>
        </div>

        <Card title="Nauka i powtórki" className="lg:col-span-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <EmptyState title="Ostatnia lekcja">Brak rozpoczętych lekcji.</EmptyState>
            <EmptyState title="Dzisiejsza powtórka">Brak zaplanowanych powtórek.</EmptyState>
            <EmptyState title="Ostatnie błędy">Brak ocenionych odpowiedzi.</EmptyState>
          </div>
          <p className="mt-3 text-xs text-muted">Lekcje, egzaminy i powtórki pojawią się w Etapie 4.</p>
        </Card>

        <Card title="Kategorie Akademii" className="lg:col-span-3" action={<Link to="/akademia" className={`text-sm ${linkClass}`}>Wszystkie</Link>}>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {d.categories.map((c) => (
              <li key={c.slug} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span>{c.name}</span>
                <span className="text-xs text-muted">{c.materialCount} {c.materialCount === 1 ? "wpis" : "wpisów"}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
