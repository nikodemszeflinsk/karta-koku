import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { NOTE_KIND_LABELS, NOTE_KINDS, NOTE_TARGET_LABELS, type NoteKind, type NoteRow, type NoteTarget } from "../../../shared/knowledge";
import { formatDate, Prose } from "../../components/knowledge";
import { Alert, Button, EmptyState, Field, PageHeader, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useApiMutation } from "../../lib/use-api-mutation";
import { NoteEditor } from "./NoteEditor";

export function targetHref(t: NoteTarget, id: string): string | null {
  switch (t) {
    case "ingredient":
      return `/skladniki/${id}`;
    case "menu_item":
      return `/karta/${id}`;
    case "recipe":
      return `/receptury/${id}`;
    case "technique":
      return `/techniki#${id}`;
    case "category":
      return `/akademia`;
  }
}

export function NoteCard({ note, onEdit }: { note: NoteRow; onEdit: () => void }) {
  const del = useApiMutation<void>(() => ({ path: `/api/notes/${note.id}`, method: "DELETE" }), [["notes"]]);
  return (
    <article className={`rounded-xl border border-border bg-surface p-4 ${note.resolved ? "opacity-75" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-accent">{NOTE_KIND_LABELS[note.kind]}</p>
          <h3 className="font-semibold">
            {note.resolved && <span className="mr-1 text-ok" aria-label="rozwiązane">✓</span>}
            {note.title}
          </h3>
        </div>
        <span className="flex gap-1">
          <Button variant="ghost" onClick={onEdit}>
            Edytuj
          </Button>
          <Button variant="ghost" loading={del.isPending} onClick={() => confirm("Usunąć notatkę?") && del.mutate()}>
            Usuń
          </Button>
        </span>
      </div>
      <Prose text={note.body} className="mt-2" />
      {note.links.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {note.links.map((l) => {
            const href = targetHref(l.targetType, l.targetId);
            const content = (
              <>
                <span className="text-muted">{NOTE_TARGET_LABELS[l.targetType]}:</span> {l.label}
              </>
            );
            return (
              <li key={`${l.targetType}:${l.targetId}`}>
                {href ? (
                  <Link to={href} className="inline-flex rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-2">
                    {content}
                  </Link>
                ) : (
                  <span className="inline-flex rounded-full border border-border px-3 py-1 text-xs">{content}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Zmieniono {formatDate(note.updatedAt)}</p>
    </article>
  );
}

export function NotesPage() {
  const [kind, setKind] = useState<NoteKind | "">("");
  const [resolved, setResolved] = useState<"" | "true" | "false">("false");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (resolved) params.set("resolved", resolved);
  const list = useQuery({
    queryKey: ["notes", kind, resolved],
    queryFn: async () => (await apiFetch<{ notes: NoteRow[] }>(`/api/notes?${params}`)).notes,
  });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Notatnik" subtitle="Pytania z pracy, nieznane składniki, obserwacje i problemy do wyjaśnienia. Prywatny." />
        {editing !== "new" && <Button onClick={() => setEditing("new")}>Nowa notatka</Button>}
      </div>
      {editing === "new" && (
        <div className="mb-4">
          <NoteEditor onDone={() => setEditing(null)} />
        </div>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Field label="Rodzaj">
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as NoteKind | "")}>
              <option value="">Wszystkie</option>
              {NOTE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {NOTE_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Stan">
          {(p) => (
            <Select {...p} value={resolved} onChange={(e) => setResolved(e.target.value as "" | "true" | "false")}>
              <option value="false">Otwarte</option>
              <option value="true">Wyjaśnione</option>
              <option value="">Wszystkie</option>
            </Select>
          )}
        </Field>
      </div>
      {list.isPending && <Spinner label="Ładowanie notatek…" />}
      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      {list.data?.length === 0 && <EmptyState title="Brak notatek" />}
      <div className="grid gap-3">
        {list.data?.map((n) =>
          editing === n.id ? (
            <NoteEditor key={n.id} note={n} onDone={() => setEditing(null)} />
          ) : (
            <NoteCard key={n.id} note={n} onEdit={() => setEditing(n.id)} />
          ),
        )}
      </div>
    </>
  );
}
