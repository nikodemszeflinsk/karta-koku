import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import type { ModuleRow } from "../../../shared/learning";
import { StatusBadge, useCanEdit } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useAiStatus } from "../../lib/ai";
import { useCategories, useLevels } from "../../lib/queries";
import { useApiMutation } from "../../lib/use-api-mutation";
import { useStartQuiz } from "../learning/ExamsPage";

function NewModuleForm({ onDone }: { onDone: () => void }) {
  const categories = useCategories();
  const levels = useLevels();
  const [categorySlug, setCategorySlug] = useState("");
  const [levelKey, setLevelKey] = useState("");
  const [title, setTitle] = useState("");
  const save = useApiMutation<void>(() => ({ path: "/api/learning/modules", body: { categorySlug, levelKey: levelKey || null, title } }), [["modules"]]);
  return (
    <form
      noValidate
      className="grid gap-3 sm:grid-cols-4 sm:items-end"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        if ((await save.submit(undefined)) !== undefined) onDone();
      }}
    >
      <Field label="Kategoria">
        {(p) => (
          <Select {...p} value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)}>
            <option value="">— wybierz —</option>
            {categories.data?.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Poziom">
        {(p) => (
          <Select {...p} value={levelKey} onChange={(e) => setLevelKey(e.target.value)}>
            <option value="">— dowolny —</option>
            {levels.data?.map((l) => (
              <option key={l.key} value={l.key}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Tytuł modułu" error={save.fieldErrors?.title}>
        {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />}
      </Field>
      <span className="flex gap-2">
        <Button type="submit" loading={save.isPending} disabled={!categorySlug || title.trim().length < 2}>
          Dodaj moduł
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Anuluj
        </Button>
      </span>
      {save.isError && <div className="sm:col-span-4"><Alert tone="error">{save.error.message}</Alert></div>}
    </form>
  );
}

function AiLessonForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const levels = useLevels();
  const [categorySlug, setCategorySlug] = useState("");
  const [levelKey, setLevelKey] = useState("advanced_cook");
  const [topic, setTopic] = useState("");
  const draft = useApiMutation<void, { lessonId: string; questions: number }>(() => ({ path: "/api/ai/drafts/lesson", body: { categorySlug, levelKey, topic } }), [["modules"], ["ai", "status"]]);
  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        const res = await draft.submit(undefined);
        if (res) {
          onDone();
          navigate(`/akademia/lekcja/${res.lessonId}`);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kategoria">
          {(p) => (
            <Select {...p} value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)}>
              <option value="">— wybierz —</option>
              {categories.data?.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Poziom">
          {(p) => (
            <Select {...p} value={levelKey} onChange={(e) => setLevelKey(e.target.value)}>
              {levels.data?.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Temat lekcji" error={draft.fieldErrors?.topic} hint="np. „Retrogradacja skrobi i przechowywanie ryżu do sushi”">
        {(p) => <Input {...p} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} />}
      </Field>
      <p className="text-xs text-muted">Do AI trafia tylko kategoria, poziom, temat i lista kompetencji. Lekcja i pytania dostaną status „Do weryfikacji”.</p>
      {draft.isError && <Alert tone="error">{draft.error.message}</Alert>}
      <span className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Anuluj
        </Button>
        <Button type="submit" loading={draft.isPending} disabled={!categorySlug || topic.trim().length < 3}>
          Generuj szkic
        </Button>
      </span>
    </form>
  );
}

export function AcademyPage() {
  const canEdit = useCanEdit();
  const ai = useAiStatus();
  const categories = useCategories();
  const levels = useLevels();
  const modules = useQuery({ queryKey: ["modules"], queryFn: async () => (await apiFetch<{ modules: ModuleRow[] }>("/api/learning/modules")).modules });
  const [panel, setPanel] = useState<"module" | "ai" | null>(null);
  const { start, error: quizError, pending: quizPending } = useStartQuiz();

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Akademia" subtitle="Ścieżka rozwoju, moduły i lekcje. Ćwicz z każdej kategorii." />
        {canEdit && (
          <span className="flex flex-wrap gap-2">
            {ai.data?.enabled && (
              <Button variant="secondary" onClick={() => setPanel(panel === "ai" ? null : "ai")}>
                Szkic lekcji AI
              </Button>
            )}
            <Button onClick={() => setPanel(panel === "module" ? null : "module")}>Nowy moduł</Button>
          </span>
        )}
      </div>
      {panel === "module" && (
        <Card className="mb-4">
          <NewModuleForm onDone={() => setPanel(null)} />
        </Card>
      )}
      {panel === "ai" && (
        <Card className="mb-4" title="Szkic lekcji z pytaniami (AI)">
          <AiLessonForm onDone={() => setPanel(null)} />
        </Card>
      )}
      {quizError && (
        <div className="mb-4">
          <Alert tone="error">{quizError}</Alert>
        </div>
      )}

      <div className="grid gap-4">
        <Card title="Ścieżka rozwoju" action={<Link to="/postepy" className="text-sm font-semibold text-accent hover:underline">Postępy</Link>}>
          {levels.isPending && <Spinner label="Ładowanie…" />}
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

        {modules.isPending && <Spinner label="Ładowanie modułów…" />}
        {modules.isError && <Alert tone="error">{modules.error.message}</Alert>}
        {categories.data?.map((cat) => {
          const mods = modules.data?.filter((m) => m.categorySlug === cat.slug) ?? [];
          return (
            <Card
              key={cat.slug}
              title={`${cat.sortOrder}. ${cat.name}`}
              action={
                <Button variant="ghost" loading={quizPending} onClick={() => void start({ kind: "practice", categorySlug: cat.slug })}>
                  Ćwicz
                </Button>
              }
            >
              {mods.length === 0 ? (
                <EmptyState title="Brak lekcji w tej kategorii">{canEdit ? "Dodaj moduł albo wygeneruj szkic lekcji." : null}</EmptyState>
              ) : (
                <div className="grid gap-3">
                  {mods.map((m) => (
                    <section key={m.id}>
                      <h3 className="text-sm font-semibold">
                        {m.title}
                        {m.levelName && <span className="ml-2 text-xs font-normal text-muted">{m.levelName}</span>}
                      </h3>
                      {m.lessons.length === 0 ? (
                        <p className="text-sm text-muted">Brak lekcji.</p>
                      ) : (
                        <ul className="mt-1 divide-y divide-border rounded-lg border border-border">
                          {m.lessons.map((l) => (
                            <li key={l.id}>
                              <Link to={`/akademia/lekcja/${l.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-surface-2">
                                <span>
                                  {l.completed && <span className="mr-1 text-ok" aria-label="ukończona">✓</span>}
                                  {l.title}
                                  <span className="ml-2 text-xs text-muted">{l.questionCount} pyt.</span>
                                </span>
                                {l.status !== "confirmed" && <StatusBadge status={l.status} />}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      {canEdit && (
                        <Link to={`/akademia/lekcja/nowa?module=${m.id}`} className="mt-1 inline-block text-xs font-semibold text-accent hover:underline">
                          + lekcja
                        </Link>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
