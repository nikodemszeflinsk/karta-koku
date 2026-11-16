import { useQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import { Link, useSearchParams } from "react-router";
import type { SearchHit, SearchType } from "../../../shared/knowledge";
import { Alert, EmptyState, Input, PageHeader, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";

const TYPE_LABELS: Record<SearchType, string> = {
  ingredient: "Składnik",
  technique: "Technika",
  menu_item: "Karta KOKU",
  recipe: "Receptura",
  note: "Notatka",
  source: "Źródło",
  lesson: "Lekcja",
  question: "Pytanie",
};

function hrefFor(h: SearchHit): string {
  switch (h.type) {
    case "ingredient":
      return `/skladniki/${h.id}`;
    case "technique":
      return `/techniki#${h.id}`;
    case "menu_item":
      return `/karta/${h.id}`;
    case "recipe":
      return `/receptury/${h.id}`;
    case "note":
      return `/notatnik`;
    case "source":
      return `/zrodla`;
    case "lesson":
      return `/akademia/lekcja/${h.id}`;
    case "question":
      return `/egzaminy`;
  }
}

/** Renders FTS snippet markers «…» as <mark> without injecting HTML. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <p className="mt-1 text-sm text-muted">
      {parts.map((p, i) =>
        p.startsWith("«") ? (
          <mark key={i} className="rounded bg-accent-soft px-0.5 text-fg">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const dq = useDeferredValue(q.trim());
  const res = useQuery({
    queryKey: ["search", dq],
    queryFn: async () => (await apiFetch<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(dq)}`)).results,
    enabled: dq.length >= 2,
    placeholderData: (prev) => prev,
  });
  return (
    <>
      <PageHeader title="Szukaj" subtitle="Składniki, techniki, karta KOKU, Twoje receptury, notatki i źródła. Polskie znaki są opcjonalne." />
      <Input
        type="search"
        autoFocus
        aria-label="Szukana fraza"
        placeholder="np. łosoś, tempura, ryż"
        value={q}
        onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
      />
      <div className="mt-4">
        {dq.length > 0 && dq.length < 2 && <p className="text-sm text-muted">Wpisz co najmniej 2 znaki.</p>}
        {res.isFetching && !res.data && <Spinner label="Szukam…" />}
        {res.isError && <Alert tone="error">{res.error.message}</Alert>}
        {res.data && dq.length >= 2 && res.data.length === 0 && <EmptyState title="Nic nie znaleziono" />}
        {res.data && dq.length >= 2 && res.data.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {res.data.map((h) => (
              <li key={`${h.type}:${h.id}`}>
                <Link to={hrefFor(h)} className="block px-4 py-3 hover:bg-surface-2">
                  <span className="text-xs font-medium text-accent">{TYPE_LABELS[h.type]}</span>
                  <span className="block font-medium">{h.title}</span>
                  {h.snippet && <Snippet text={h.snippet} />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
