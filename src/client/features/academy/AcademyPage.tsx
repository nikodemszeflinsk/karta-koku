import { Alert, Card, PageHeader, Spinner } from "../../components/ui";
import { useCategories, useLevels } from "../../lib/queries";

export function AcademyPage() {
  const categories = useCategories();
  const levels = useLevels();

  return (
    <>
      <PageHeader title="Akademia" subtitle="Struktura wiedzy i ścieżka rozwoju: od kucharza zaawansowanego do head chefa." />

      <div className="grid gap-4">
        <Card title="Ścieżka rozwoju">
          {levels.isPending && <Spinner label="Ładowanie poziomów…" />}
          {levels.isError && <Alert tone="error">Nie udało się wczytać poziomów.</Alert>}
          {levels.data && (
            <ol className="grid gap-3 md:grid-cols-2">
              {levels.data.map((l, i) => (
                <li key={l.key} className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">Poziom {i + 1}</p>
                  <h3 className="font-semibold">{l.name}</h3>
                  {l.description && <p className="mt-1 text-sm text-muted">{l.description}</p>}
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {l.competencies.map((c) => (
                      <li key={c.key} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
                        {c.name}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Kategorie wiedzy">
          {categories.isPending && <Spinner label="Ładowanie kategorii…" />}
          {categories.isError && <Alert tone="error">Nie udało się wczytać kategorii.</Alert>}
          {categories.data && (
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {categories.data.map((c) => (
                <li key={c.slug} className="flex items-baseline gap-2 rounded-lg border border-border px-3 py-2.5 text-sm">
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">{c.sortOrder}.</span>
                  <span>{c.name}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-xs text-muted">Składniki, receptury i materiały do kategorii pojawią się w Etapie 2.</p>
        </Card>
      </div>
    </>
  );
}
