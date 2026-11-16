import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState, type FormEvent } from "react";
import {
  NOTE_KIND_LABELS,
  NOTE_KINDS,
  NOTE_TARGET_LABELS,
  type NoteKind,
  type NoteRow,
  type NoteTarget,
  type SearchHit,
} from "../../../shared/knowledge";
import { Textarea } from "../../components/knowledge";
import { Alert, Button, Field, Input, Select } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useCategories } from "../../lib/queries";
import { useApiMutation } from "../../lib/use-api-mutation";

type Link = { targetType: NoteTarget; targetId: string; label: string };

const LINKABLE: Partial<Record<SearchHit["type"], NoteTarget>> = {
  ingredient: "ingredient",
  menu_item: "menu_item",
  technique: "technique",
  recipe: "recipe",
};

function LinkPicker({ links, onChange }: { links: Link[]; onChange: (l: Link[]) => void }) {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim());
  const categories = useCategories();
  const hits = useQuery({
    queryKey: ["search", "links", dq],
    queryFn: async () =>
      (await apiFetch<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(dq)}&types=ingredient,menu_item,technique,recipe`)).results,
    enabled: dq.length >= 2,
  });
  const has = (t: NoteTarget, id: string) => links.some((l) => l.targetType === t && l.targetId === id);
  const add = (l: Link) => !has(l.targetType, l.targetId) && onChange([...links, l]);

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">Powiązania</span>
      {links.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {links.map((l) => (
            <li key={`${l.targetType}:${l.targetId}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1 text-sm">
              <span className="text-muted">{NOTE_TARGET_LABELS[l.targetType]}:</span> {l.label}
              <button
                type="button"
                className="ml-1 grid size-7 place-items-center rounded-full hover:bg-border"
                aria-label={`Usuń powiązanie ${l.label}`}
                onClick={() => onChange(links.filter((x) => x !== l))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input type="search" aria-label="Szukaj składnika, dania, techniki lub receptury" placeholder="Szukaj składnika, dania, techniki…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select
          aria-label="Dodaj kategorię"
          value=""
          onChange={(e) => {
            const c = categories.data?.find((x) => x.slug === e.target.value);
            if (c) add({ targetType: "category", targetId: c.slug, label: c.name });
          }}
        >
          <option value="">+ kategoria…</option>
          {categories.data?.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      {hits.data && hits.data.length > 0 && (
        <ul className="max-h-48 overflow-auto rounded-lg border border-border">
          {hits.data.map((h) => {
            const t = LINKABLE[h.type];
            if (!t) return null;
            return (
              <li key={`${h.type}:${h.id}`}>
                <button
                  type="button"
                  disabled={has(t, h.id)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
                  onClick={() => {
                    add({ targetType: t, targetId: h.id, label: h.title });
                    setQ("");
                  }}
                >
                  <span>{h.title}</span>
                  <span className="text-xs text-muted">{NOTE_TARGET_LABELS[t]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function NoteEditor({
  note,
  defaultLinks = [],
  onDone,
}: {
  note?: NoteRow;
  defaultLinks?: Link[];
  onDone: () => void;
}) {
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? "work_question");
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [resolved, setResolved] = useState(note?.resolved ?? false);
  const [links, setLinks] = useState<Link[]>(note?.links ?? defaultLinks);
  const save = useApiMutation<void>(
    () => {
      const payload = { kind, title, body, resolved, links: links.map(({ targetType, targetId }) => ({ targetType, targetId })) };
      return note ? { path: `/api/notes/${note.id}`, method: "PATCH", body: payload } : { path: "/api/notes", body: payload };
    },
    [["notes"]],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if ((await save.submit(undefined)) === undefined) return;
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-border bg-surface p-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rodzaj">
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
              {NOTE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {NOTE_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Tytuł" error={save.fieldErrors?.title}>
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />}
        </Field>
      </div>
      <Field label="Treść" error={save.fieldErrors?.body}>
        {(p) => <Textarea {...p} value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={20000} />}
      </Field>
      <LinkPicker links={links} onChange={setLinks} />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={resolved} onChange={(e) => setResolved(e.target.checked)} />
        Wyjaśnione / rozwiązane
      </label>
      <p className="text-xs text-muted">Notatki są prywatne — widzisz je tylko Ty. Nie są wysyłane do AI bez Twojej decyzji.</p>
      {save.isError && <Alert tone="error">{save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Anuluj
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!title.trim()}>
          {note ? "Zapisz notatkę" : "Dodaj notatkę"}
        </Button>
      </div>
    </form>
  );
}
