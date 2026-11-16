import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { TechniqueRow, VerificationStatus } from "../../../shared/knowledge";
import { Prose, Provenance, StatusSourceFields, Textarea, useCanEdit } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useCategories } from "../../lib/queries";
import { useApiMutation } from "../../lib/use-api-mutation";
import { LinkedNotes } from "../notes/LinkedNotes";

function TechniqueForm({ initial, onDone }: { initial?: TechniqueRow; onDone: () => void }) {
  const categories = useCategories();
  const [name, setName] = useState(initial?.name ?? "");
  const [categorySlug, setCategorySlug] = useState(initial?.categorySlug ?? "obrobka-termiczna");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<VerificationStatus>(initial?.status ?? "needs_verification");
  const [sourceId, setSourceId] = useState<string | null>(initial?.source?.id ?? null);
  const save = useApiMutation<void>(
    () => {
      const body = { name, categorySlug: categorySlug || null, description, status, sourceId };
      return initial ? { path: `/api/techniques/${initial.id}`, method: "PATCH", body: { ...body, expectedVersion: initial.version } } : { path: "/api/techniques", body };
    },
    [["techniques"]],
  );
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if ((await save.submit(undefined)) === undefined) return;
    onDone();
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-border bg-surface p-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nazwa *" error={save.fieldErrors?.name}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}
        </Field>
        <Field label="Kategoria">
          {(p) => (
            <Select {...p} value={categorySlug ?? ""} onChange={(e) => setCategorySlug(e.target.value)}>
              <option value="">— bez kategorii —</option>
              {categories.data?.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Opis (mechanizm, parametry, typowe błędy)">{(p) => <Textarea {...p} rows={6} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />}</Field>
      <StatusSourceFields status={status} sourceId={sourceId} onStatus={setStatus} onSource={setSourceId} errors={save.fieldErrors} />
      {save.isError && <Alert tone="error">{save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Anuluj
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
          Zapisz
        </Button>
      </div>
    </form>
  );
}

export function TechniquesPage() {
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const q = useQuery({ queryKey: ["techniques"], queryFn: async () => (await apiFetch<{ techniques: TechniqueRow[] }>("/api/techniques")).techniques });
  const del = useApiMutation<string>((id) => ({ path: `/api/techniques/${id}`, method: "DELETE" }), [["techniques"]]);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Techniki" subtitle="Techniki obróbki i przygotowania — mechanizmy, parametry, błędy." />
        {canEdit && editing !== "new" && <Button onClick={() => setEditing("new")}>Dodaj technikę</Button>}
      </div>
      {editing === "new" && (
        <div className="mb-4">
          <TechniqueForm onDone={() => setEditing(null)} />
        </div>
      )}
      {q.isPending && <Spinner label="Ładowanie…" />}
      {q.data?.length === 0 && editing !== "new" && <EmptyState title="Brak technik" />}
      <div className="grid gap-3">
        {q.data?.map((t) =>
          editing === t.id ? (
            <TechniqueForm key={t.id} initial={t} onDone={() => setEditing(null)} />
          ) : (
            <Card key={t.id} className="scroll-mt-4">
              <div id={t.id} className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{t.name}</h2>
                  {t.categoryName && <p className="text-xs text-muted">{t.categoryName}</p>}
                </div>
                {canEdit && (
                  <span className="flex gap-1">
                    <Button variant="ghost" onClick={() => setEditing(t.id)}>
                      Edytuj
                    </Button>
                    <Button variant="ghost" onClick={() => confirm(`Usunąć technikę „${t.name}”?`) && del.mutate(t.id)}>
                      Usuń
                    </Button>
                  </span>
                )}
              </div>
              <Prose text={t.description} className="mt-2" />
              <div className="mt-2">
                <Provenance status={t.status} source={t.source} />
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-muted">Moje notatki</summary>
                <div className="mt-2">
                  <LinkedNotes targetType="technique" targetId={t.id} targetLabel={t.name} />
                </div>
              </details>
            </Card>
          ),
        )}
      </div>
    </>
  );
}
