import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { NoteRow, NoteTarget } from "../../../shared/knowledge";
import { Button, Card, EmptyState } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { NoteEditor } from "./NoteEditor";
import { NoteCard } from "./NotesPage";

/** "My notes about this item" section, shown on ingredient / menu item / recipe pages. */
export function LinkedNotes({ targetType, targetId, targetLabel }: { targetType: NoteTarget; targetId: string; targetLabel: string }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const q = useQuery({
    queryKey: ["notes", "target", targetType, targetId],
    queryFn: async () => (await apiFetch<{ notes: NoteRow[] }>(`/api/notes?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`)).notes,
  });
  return (
    <Card title="Moje notatki" action={editing !== "new" ? <Button variant="secondary" onClick={() => setEditing("new")}>Dodaj</Button> : undefined}>
      {editing === "new" && (
        <div className="mb-3">
          <NoteEditor defaultLinks={[{ targetType, targetId, label: targetLabel }]} onDone={() => setEditing(null)} />
        </div>
      )}
      {q.data?.length === 0 && editing !== "new" && <EmptyState title="Brak notatek" />}
      <div className="grid gap-3">
        {q.data?.map((n) =>
          editing === n.id ? (
            <NoteEditor key={n.id} note={n} onDone={() => setEditing(null)} />
          ) : (
            <NoteCard key={n.id} note={n} onEdit={() => setEditing(n.id)} />
          ),
        )}
      </div>
    </Card>
  );
}
