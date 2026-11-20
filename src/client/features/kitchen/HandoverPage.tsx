import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { warsawDate, type HandoverRow } from "../../../shared/kitchen";
import { Textarea } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useMe } from "../../lib/queries";
import { useApiMutation } from "../../lib/use-api-mutation";
import { fmtDate, fmtDateTime, KitchenHeader, kk } from "./common";

/*
 * Shift handover protocol:
 *  1. "Do uzupełnienia" — a plain list typed by the person handing over,
 *  2. "Braki w karcie" — Brak (default) or a description,
 *  3. "Awarie" — Brak (default) or a description.
 * Storage: items → prep[{label, done:false}], shortages → shortagesNote, failures → failureNote.
 */

export function HandoverPage() {
  const q = useQuery({ queryKey: kk.handovers, queryFn: async () => (await apiFetch<{ handovers: HandoverRow[] }>("/api/kitchen/handovers")).handovers });
  const [formKey, setFormKey] = useState(0);
  const [done, setDone] = useState(false);
  const latest = q.data?.[0];
  return (
    <>
      <KitchenHeader title="Przekazanie zmiany" subtitle="Do uzupełnienia, braki w karcie i awarie" icon="handover" />
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

function shortagesText(h: HandoverRow): string {
  const parts = [...h.shortages.map((s) => s.name), h.shortagesNote].filter(Boolean);
  return parts.length ? parts.join(", ") : "";
}

export function HandoverCard({ h, highlight = false, title: titleOverride }: { h: HandoverRow; highlight?: boolean; title?: string }) {
  const me = useMe();
  const ack = useApiMutation(() => ({ path: `/api/kitchen/handovers/${h.id}/ack`, body: {} }), [kk.handovers, kk.summary]);
  const todo = h.prep.filter((p) => !p.done);
  const shortages = shortagesText(h);
  const canAck = !h.acknowledgedAt && me.data && (me.data.guest || me.data.user.id !== h.authorId);
  const body = (
    <div className="grid gap-3 text-sm">
      <div>
        <p className="font-semibold">Do uzupełnienia:</p>
        {todo.length ? (
          <ul className="list-disc pl-5">
            {todo.map((p, i) => (
              <li key={i}>{p.label}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">Nic</p>
        )}
        {h.prepNotes && <p className="mt-1 whitespace-pre-wrap">{h.prepNotes}</p>}
      </div>
      <p className={shortages ? "font-semibold text-warn" : ""}>
        <span className="font-semibold text-fg">Braki w karcie: </span>
        {shortages || "Brak"}
      </p>
      <p className={h.hasFailure ? "font-semibold text-danger" : ""}>
        <span className="font-semibold text-fg">Awarie: </span>
        {h.hasFailure ? h.failureNote : "Brak"}
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
  const title = fmtDate(h.shiftDate);
  if (highlight) {
    return (
      <Card title={titleOverride ?? `Ostatnie przekazanie: ${title}`} className="mb-4 border-teal-500/50">
        {body}
      </Card>
    );
  }
  return (
    <details className="rounded-xl border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer flex-wrap items-center gap-2 px-4 text-sm font-semibold">
        {title} <span className="font-normal text-muted">{fmtDateTime(h.createdAt).split(", ")[1]}</span>
        {shortages && <Badge tone="warn">Braki</Badge>}
        {h.hasFailure && <Badge tone="danger">Awaria</Badge>}
        {!h.acknowledgedAt && <Badge tone="warn">Nieprzejęta</Badge>}
      </summary>
      <div className="border-t border-border p-4">{body}</div>
    </details>
  );
}

function Badge({ tone, children }: { tone: "warn" | "danger"; children: ReactNode }) {
  const c = { warn: "bg-warn/15 text-warn", danger: "bg-danger/10 text-danger" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
}

/** Brak (default) / Są — with a description when present. */
function YesNoText(props: { name: string; yesLabel: string; on: boolean; setOn: (v: boolean) => void; text: string; setText: (v: string) => void; label: string; error?: string | undefined }) {
  return (
    <>
      <fieldset className="grid gap-1">
        <legend className="sr-only">{props.name}</legend>
        <label className="flex min-h-11 items-center gap-3">
          <input type="radio" name={props.name} className="size-5 accent-[var(--color-accent)]" checked={!props.on} onChange={() => props.setOn(false)} />
          Brak
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="radio" name={props.name} className="size-5 accent-[var(--color-accent)]" checked={props.on} onChange={() => props.setOn(true)} />
          {props.yesLabel}
        </label>
      </fieldset>
      {props.on && (
        <div className="mt-2">
          <Field label={props.label} error={props.error}>
            {(p) => <Textarea {...p} rows={3} required maxLength={4000} value={props.text} onChange={(e) => props.setText(e.target.value)} />}
          </Field>
        </div>
      )}
    </>
  );
}

function HandoverForm({ onSaved }: { onSaved: () => void }) {
  const [shiftDate, setShiftDate] = useState(warsawDate());
  const [items, setItems] = useState<string[]>([""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [hasShortages, setHasShortages] = useState(false);
  const [shortagesNote, setShortagesNote] = useState("");
  const [hasFailure, setHasFailure] = useState(false);
  const [failureNote, setFailureNote] = useState("");
  const save = useApiMutation((b: unknown) => ({ path: "/api/kitchen/handovers", body: b }), [kk.handovers, kk.summary]);

  const addAfter = (i: number) => {
    const next = [...items.slice(0, i + 1), "", ...items.slice(i + 1)];
    setItems(next);
    setTimeout(() => refs.current[i + 1]?.focus(), 0);
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await save.submit({
          shiftDate,
          prep: items.map((l) => l.trim()).filter(Boolean).map((label) => ({ label, done: false })),
          prepNotes: "",
          shortages: [],
          shortagesNote: hasShortages ? shortagesNote : "",
          hasFailure,
          failureNote: hasFailure ? failureNote : "",
        });
        if (r) onSaved();
      }}
    >
      <Card title="Nowy protokół">
        <Field label="Data" error={save.fieldErrors?.shiftDate}>
          {(p) => <Input {...p} type="date" required value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} className="sm:w-60" />}
        </Field>
      </Card>

      <Card title="1. Do uzupełnienia">
        <ul className="grid gap-2">
          {items.map((v, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-sm text-muted">{i + 1}.</span>
              <Input
                ref={(el) => {
                  refs.current[i] = el;
                }}
                aria-label={`Do uzupełnienia, pozycja ${i + 1}`}
                value={v}
                maxLength={120}
                enterKeyHint="next"
                onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (v.trim()) addAfter(i);
                  }
                }}
              />
              {items.length > 1 && (
                <button
                  type="button"
                  aria-label={`Usuń pozycję ${i + 1}`}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2"
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" className="mt-2 text-accent" onClick={() => addAfter(items.length - 1)}>
          + Dodaj pozycję
        </Button>
      </Card>

      <Card title="2. Braki w karcie">
        <YesNoText name="shortages" yesLabel="Są braki" on={hasShortages} setOn={setHasShortages} text={shortagesNote} setText={setShortagesNote} label="Czego brakuje w karcie" />
      </Card>

      <Card title="3. Awarie">
        <YesNoText
          name="failure"
          yesLabel="Jest awaria"
          on={hasFailure}
          setOn={setHasFailure}
          text={failureNote}
          setText={setFailureNote}
          label="Opis awarii"
          error={save.fieldErrors?.failureNote}
        />
      </Card>

      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      <Button type="submit" loading={save.isPending} className="w-full sm:w-auto sm:justify-self-start">
        Zapisz protokół przekazania
      </Button>
    </form>
  );
}
