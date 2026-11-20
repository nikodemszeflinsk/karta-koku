import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { SHIFT_LABELS, SHIFTS, warsawDate, type HandoverRow, type Shift } from "../../../shared/kitchen";
import type { MenuItemSummary, MenuVersion } from "../../../shared/knowledge";
import { Textarea, useCanEdit } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useMe } from "../../lib/queries";
import { useApiMutation } from "../../lib/use-api-mutation";
import { foldText } from "../../../shared/text";
import { fmtDate, fmtDateTime, KitchenHeader, kk } from "./common";

type Shortage = { menuItemId: string | null; name: string };

function useChecks() {
  return useQuery({ queryKey: kk.checks, queryFn: async () => (await apiFetch<{ checks: { id: string; label: string }[] }>("/api/kitchen/handovers/checks")).checks });
}

/** Items of the current menu version (Karta KOKU), for picking shortages. */
function useCurrentMenuItems() {
  return useQuery({
    queryKey: ["menu", "current-items"],
    queryFn: async () => {
      const { versions } = await apiFetch<{ versions: MenuVersion[] }>("/api/menu/versions");
      const cur = versions.find((v) => v.isCurrent) ?? versions[0];
      if (!cur) return [];
      return (await apiFetch<{ items: MenuItemSummary[] }>(`/api/menu/versions/${cur.id}/items`)).items;
    },
    staleTime: 10 * 60_000,
  });
}

const defaultShift = (): Shift => (Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "numeric", hourCycle: "h23" }).format(new Date())) < 16 ? "morning" : "evening");

export function HandoverPage() {
  const q = useQuery({ queryKey: kk.handovers, queryFn: async () => (await apiFetch<{ handovers: HandoverRow[] }>("/api/kitchen/handovers")).handovers });
  const [formKey, setFormKey] = useState(0);
  const [done, setDone] = useState(false);
  const latest = q.data?.[0];
  return (
    <>
      <KitchenHeader title="Przekazanie zmiany" subtitle="Przygotowanie do serwisu, braki w karcie i awarie" icon="handover" />
      {latest && <HandoverCard h={latest} highlight />}
      {done && (
        <div className="my-4">
          <Alert tone="success">Protokół zapisany. Osoba przejmująca zmianę może go teraz potwierdzić.</Alert>
        </div>
      )}
      <HandoverForm
        key={formKey}
        onSaved={() => {
          setDone(true);
          setFormKey((k) => k + 1);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Poprzednie protokoły</h2>
        {q.isPending && <Spinner label="Ładowanie…" />}
        {q.data && q.data.length <= 1 && <EmptyState title="Brak wcześniejszych protokołów" />}
        <div className="grid gap-3">
          {q.data?.slice(1).map((h) => (
            <HandoverCard key={h.id} h={h} />
          ))}
        </div>
      </section>
    </>
  );
}

function HandoverCard({ h, highlight = false }: { h: HandoverRow; highlight?: boolean }) {
  const me = useMe();
  const ack = useApiMutation(() => ({ path: `/api/kitchen/handovers/${h.id}/ack`, body: {} }), [kk.handovers, kk.summary]);
  const doneCount = h.prep.filter((p) => p.done).length;
  const canAck = !h.acknowledgedAt && me.data && me.data.user.id !== h.authorId;
  const body = (
    <div className="grid gap-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge tone={doneCount === h.prep.length ? "ok" : "warn"}>
          Przygotowanie {doneCount}/{h.prep.length}
        </Badge>
        <Badge tone={h.shortages.length ? "warn" : "ok"}>{h.shortages.length ? `Braki: ${h.shortages.length}` : "Bez braków"}</Badge>
        <Badge tone={h.hasFailure ? "danger" : "ok"}>{h.hasFailure ? "Awaria" : "Awarie: brak"}</Badge>
      </div>
      {h.prep.some((p) => !p.done) && (
        <div>
          <p className="font-semibold">Nie zrobione:</p>
          <ul className="list-disc pl-5">
            {h.prep.filter((p) => !p.done).map((p) => (
              <li key={p.label}>{p.label}</li>
            ))}
          </ul>
        </div>
      )}
      {h.prepNotes && <p className="whitespace-pre-wrap"><span className="font-semibold">Uwagi: </span>{h.prepNotes}</p>}
      {h.shortages.length > 0 && (
        <div>
          <p className="font-semibold">Braki w karcie:</p>
          <p>{h.shortages.map((s) => s.name).join(", ")}</p>
        </div>
      )}
      {h.shortagesNote && <p className="whitespace-pre-wrap">{h.shortagesNote}</p>}
      <p className={h.hasFailure ? "font-semibold text-danger" : ""}>
        <span className="font-semibold">Awarie: </span>
        {h.failureNote || "Brak"}
      </p>
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs text-muted">
        <span>
          Przekazał(a): {h.authorName ?? "—"} · {fmtDateTime(h.createdAt)}
        </span>
        {h.acknowledgedAt ? (
          <span className="font-semibold text-ok">
            ✓ Przejęte: {h.acknowledgedByName ?? "—"} · {fmtDateTime(h.acknowledgedAt)}
          </span>
        ) : canAck ? (
          <Button className="ml-auto" loading={ack.isPending} onClick={() => void ack.submit(undefined)}>
            Przejmuję zmianę
          </Button>
        ) : (
          <span className="font-semibold text-warn">Czeka na przejęcie</span>
        )}
      </div>
      {ack.error && <Alert tone="error">{ack.error.message}</Alert>}
    </div>
  );
  const title = `${fmtDate(h.shiftDate)} · ${SHIFT_LABELS[h.shift]}`;
  if (highlight) {
    return (
      <Card title={`Ostatnie przekazanie: ${title}`} className="mb-4 border-teal-500/50">
        {body}
      </Card>
    );
  }
  return (
    <details className="rounded-xl border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer flex-wrap items-center gap-2 px-4 text-sm font-semibold">
        {title}
        {h.hasFailure && <Badge tone="danger">Awaria</Badge>}
        {!h.acknowledgedAt && <Badge tone="warn">Nieprzejęta</Badge>}
      </summary>
      <div className="border-t border-border p-4">{body}</div>
    </details>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "danger"; children: ReactNode }) {
  const c = { ok: "bg-ok/10 text-ok", warn: "bg-warn/15 text-warn", danger: "bg-danger/10 text-danger" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
}

function HandoverForm({ onSaved }: { onSaved: () => void }) {
  const checks = useChecks();
  const menu = useCurrentMenuItems();
  const canEdit = useCanEdit();
  const [editChecks, setEditChecks] = useState(false);
  const [shiftDate, setShiftDate] = useState(warsawDate());
  const [shift, setShift] = useState<Shift>(defaultShift());
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [prepNotes, setPrepNotes] = useState("");
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [search, setSearch] = useState("");
  const [shortagesNote, setShortagesNote] = useState("");
  const [hasFailure, setHasFailure] = useState(false);
  const [failureNote, setFailureNote] = useState("");
  const save = useApiMutation((b: unknown) => ({ path: "/api/kitchen/handovers", body: b }), [kk.handovers, kk.summary]);

  const matches = useMemo(() => {
    const f = foldText(search);
    if (f.length < 2 || !menu.data) return [];
    const taken = new Set(shortages.map((s) => s.menuItemId));
    return menu.data.filter((m) => !taken.has(m.id) && (foldText(m.name).includes(f) || (m.code ?? "") === search.trim())).slice(0, 8);
  }, [search, menu.data, shortages]);

  const addShortage = (s: Shortage) => {
    if (!shortages.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) setShortages([...shortages, s]);
    setSearch("");
  };

  if (editChecks) return <ChecksEditor labels={checks.data?.map((c) => c.label) ?? []} onDone={() => setEditChecks(false)} />;

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await save.submit({
          shiftDate,
          shift,
          prep: (checks.data ?? []).map((c) => ({ label: c.label, done: Boolean(done[c.id]) })),
          prepNotes,
          shortages,
          shortagesNote,
          hasFailure,
          failureNote: hasFailure ? failureNote : "",
        });
        if (r) onSaved();
      }}
    >
      <Card title="Nowy protokół">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Data" error={save.fieldErrors?.shiftDate}>
            {(p) => <Input {...p} type="date" required value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} />}
          </Field>
          <Field label="Zmiana">
            {(p) => (
              <Select {...p} value={shift} onChange={(e) => setShift(e.target.value as Shift)}>
                {SHIFTS.map((s) => (
                  <option key={s} value={s}>
                    {SHIFT_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Card>

      <Card
        title="1. Przygotowanie do serwisu"
        action={
          canEdit && (
            <Button type="button" variant="ghost" className="min-h-9 px-2 text-xs" onClick={() => setEditChecks(true)}>
              Edytuj listę
            </Button>
          )
        }
      >
        {checks.isPending && <Spinner small />}
        <ul className="grid gap-1">
          {checks.data?.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-surface-2">
                <input type="checkbox" className="size-5 shrink-0 accent-[var(--color-accent)]" checked={Boolean(done[c.id])} onChange={(e) => setDone({ ...done, [c.id]: e.target.checked })} />
                <span className={done[c.id] ? "text-muted line-through" : ""}>{c.label}</span>
              </label>
            </li>
          ))}
        </ul>
        {checks.data && (
          <button
            type="button"
            className="mt-1 px-2 text-xs font-semibold text-accent"
            onClick={() => setDone(Object.fromEntries(checks.data.map((c) => [c.id, true])))}
          >
            Zaznacz wszystko
          </button>
        )}
        <div className="mt-3">
          <Field label="Uwagi do przygotowania" hint="Co jest niedokończone, czego jest mało, co trzeba zrobić na początku zmiany.">
            {(p) => <Textarea {...p} rows={3} maxLength={4000} value={prepNotes} onChange={(e) => setPrepNotes(e.target.value)} />}
          </Field>
        </div>
      </Card>

      <Card title="2. Braki w karcie">
        <Field label="Dodaj pozycję z karty" hint="Wpisz nazwę lub numer. Możesz też dodać coś spoza karty.">
          {(p) => (
            <Input
              {...p}
              value={search}
              autoComplete="off"
              placeholder="np. futomaki, 12"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (matches[0]) addShortage({ menuItemId: matches[0].id, name: matches[0].name });
                  else if (search.trim()) addShortage({ menuItemId: null, name: search.trim() });
                }
              }}
            />
          )}
        </Field>
        {search.trim().length >= 2 && (
          <ul className="mt-2 overflow-hidden rounded-lg border border-border">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-2" onClick={() => addShortage({ menuItemId: m.id, name: m.name })}>
                  {m.code && <span className="text-xs text-muted">{m.code}.</span>}
                  {m.name}
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="flex min-h-11 w-full items-center px-3 text-left text-sm font-semibold text-accent hover:bg-surface-2" onClick={() => addShortage({ menuItemId: null, name: search.trim() })}>
                + Dodaj „{search.trim()}”
              </button>
            </li>
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {shortages.length === 0 && <p className="text-sm text-muted">Brak braków — wszystko z karty jest dostępne.</p>}
          {shortages.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1 rounded-full bg-warn/15 py-1 pl-3 pr-1 text-sm font-medium">
              {s.name}
              <button type="button" aria-label={`Usuń ${s.name}`} className="grid size-7 place-items-center rounded-full hover:bg-warn/25" onClick={() => setShortages(shortages.filter((x) => x !== s))}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3">
          <Field label="Uwagi do braków">{(p) => <Textarea {...p} rows={2} maxLength={4000} value={shortagesNote} onChange={(e) => setShortagesNote(e.target.value)} />}</Field>
        </div>
      </Card>

      <Card title="3. Awarie">
        <fieldset className="grid gap-2">
          <legend className="sr-only">Awarie</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" name="failure" className="size-5 accent-[var(--color-accent)]" checked={!hasFailure} onChange={() => setHasFailure(false)} />
            Brak
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" name="failure" className="size-5 accent-[var(--color-accent)]" checked={hasFailure} onChange={() => setHasFailure(true)} />
            Jest awaria
          </label>
        </fieldset>
        {hasFailure && (
          <div className="mt-2">
            <Field label="Opis awarii" hint="Co nie działa, od kiedy, czy zgłoszono serwis." error={save.fieldErrors?.failureNote}>
              {(p) => <Textarea {...p} rows={3} required maxLength={4000} value={failureNote} onChange={(e) => setFailureNote(e.target.value)} />}
            </Field>
          </div>
        )}
      </Card>

      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      <Button type="submit" loading={save.isPending} className="w-full sm:w-auto sm:justify-self-start">
        Zapisz protokół przekazania
      </Button>
    </form>
  );
}

function ChecksEditor({ labels, onDone }: { labels: string[]; onDone: () => void }) {
  const [text, setText] = useState(labels.join("\n"));
  const save = useApiMutation((b: { labels: string[] }) => ({ path: "/api/kitchen/handovers/checks", method: "PUT", body: b }), [kk.checks]);
  return (
    <Card title="Lista kontrolna przygotowania">
      <Field label="Jeden punkt w linii" hint="Zmiana nie wpływa na zapisane już protokoły.">
        {(p) => <Textarea {...p} rows={10} value={text} onChange={(e) => setText(e.target.value)} />}
      </Field>
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      <div className="mt-3 flex gap-2">
        <Button
          loading={save.isPending}
          onClick={async () => {
            const r = await save.submit({ labels: text.split("\n").map((l) => l.trim()).filter(Boolean) });
            if (r) onDone();
          }}
        >
          Zapisz listę
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Anuluj
        </Button>
      </div>
    </Card>
  );
}
