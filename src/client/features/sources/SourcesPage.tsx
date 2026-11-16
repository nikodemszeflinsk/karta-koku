import { useState, type FormEvent } from "react";
import { SOURCE_TYPE_LABELS, SOURCE_TYPES, type SourceType } from "../../../shared/knowledge";
import { Textarea, useCanEdit, useSources } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "../../components/ui";
import { useApiMutation } from "../../lib/use-api-mutation";

function SourceForm({ onDone }: { onDone: () => void }) {
  const canEdit = useCanEdit();
  const [type, setType] = useState<SourceType>("user_material");
  const [title, setTitle] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [isPrivate, setIsPrivate] = useState(!canEdit);
  const save = useApiMutation<void>(() => ({ path: "/api/sources", body: { type, title, reference, notes, isPrivate } }), [["sources"]]);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if ((await save.submit(undefined)) === undefined) return;
    onDone();
  }
  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rodzaj">
            {(p) => (
              <Select {...p} value={type} onChange={(e) => setType(e.target.value as SourceType)}>
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SOURCE_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tytuł *" error={save.fieldErrors?.title}>
            {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Odnośnik" hint="adres strony, tytuł książki ze stroną, nazwa dokumentu">
              {(p) => <Input {...p} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={500} />}
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Uwagi">{(p) => <Textarea {...p} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />}</Field>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={isPrivate} disabled={!canEdit} onChange={(e) => setIsPrivate(e.target.checked)} />
            Prywatne (widoczne tylko dla mnie)
          </label>
        </div>
        {save.isError && <div className="mt-3"><Alert tone="error">{save.error.message}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onDone}>
            Anuluj
          </Button>
          <Button type="submit" loading={save.isPending} disabled={title.trim().length < 2}>
            Dodaj źródło
          </Button>
        </div>
      </Card>
    </form>
  );
}

export function SourcesPage() {
  const list = useSources();
  const [adding, setAdding] = useState(false);
  const del = useApiMutation<string>((id) => ({ path: `/api/sources/${id}`, method: "DELETE" }), [["sources"]]);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Źródła" subtitle="Skąd pochodzi każda informacja. Status „Potwierdzone” wymaga materiału użytkownika lub oficjalnego." />
        {!adding && <Button onClick={() => setAdding(true)}>Dodaj źródło</Button>}
      </div>
      {adding && (
        <div className="mb-4">
          <SourceForm onDone={() => setAdding(false)} />
        </div>
      )}
      {del.isError && <div className="mb-3"><Alert tone="error">{del.error.message}</Alert></div>}
      {list.isPending && <Spinner label="Ładowanie…" />}
      {list.data?.length === 0 && <EmptyState title="Brak źródeł" />}
      <ul className="grid gap-2">
        {list.data?.map((s) => (
          <li key={s.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-accent">
                  {SOURCE_TYPE_LABELS[s.type]}
                  {s.isPrivate && " · prywatne"}
                </p>
                <h3 className="font-semibold">{s.title}</h3>
              </div>
              {s.isMine && (
                <Button variant="ghost" loading={del.isPending && del.variables === s.id} onClick={() => confirm(`Usunąć źródło „${s.title}”?`) && del.mutate(s.id)}>
                  Usuń
                </Button>
              )}
            </div>
            {s.reference && <p className="mt-1 break-words text-sm text-muted">{s.reference}</p>}
            {s.notes && <p className="mt-1 text-sm">{s.notes}</p>}
            <p className="mt-2 text-xs text-muted">
              Używane w {s.usageCount} wpisach{s.retrievedAt && ` · pobrano ${s.retrievedAt}`}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
