import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { isTextUnit, orderQty, UNIT_SUGGESTIONS, type StockItem, type StockList, type StockResponse, type StockSheetHistory, type StockSheetSummaryLine } from "../../../shared/kitchen";
import { Textarea, useCanEdit } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useApiMutation } from "../../lib/use-api-mutation";
import { copyOrShare, fmtDateTime, fmtQty, KitchenHeader, kk, parseQty, StepNav } from "./common";

type Draft = { have: string; order: string; note: string };

const CONFIG: Record<StockList, { title: string; subtitle: string; icon: "cart" | "truck"; exportTitle: string; empty: string }> = {
  shopping: {
    title: "Lista zakupów",
    subtitle: "Wpisz, ile kupić, i ewentualnie opis.",
    icon: "cart",
    exportTitle: "Lista zakupów",
    empty: "Nic do kupienia.",
  },
  wholesale: {
    title: "Hurtownia",
    subtitle: "Wpisz, ile jest — „Zamówić” liczy się samo.",
    icon: "truck",
    exportTitle: "Zamówienie z hurtowni",
    empty: "Nic do zamówienia.",
  },
};

function groupBy<T extends { groupName: string }>(rows: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(r.groupName || "Inne", [...(m.get(r.groupName || "Inne") ?? []), r]);
  // Ungrouped items ("Inne") go last.
  return [...m.entries()].sort(([a], [b]) => Number(a === "Inne") - Number(b === "Inne"));
}

function exportLine(l: Pick<StockSheetSummaryLine, "name" | "unit" | "qty" | "note">): string {
  if (l.qty > 0) return `- ${l.name}: ${fmtQty(l.qty)} ${l.unit}${l.note ? ` (${l.note})` : ""}`;
  return `- ${l.name}${l.note ? `: ${l.note}` : ""}`;
}

export function exportText(title: string, lines: Pick<StockSheetSummaryLine, "name" | "unit" | "groupName" | "qty" | "note">[], when = new Date()): string {
  const date = when.toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" });
  const body = groupBy(lines)
    .map(([g, ls]) => `${g}:\n${ls.map(exportLine).join("\n")}`)
    .join("\n\n");
  return `${title} — ${date}\n\n${body}`;
}

export function StockPage({ list }: { list: StockList }) {
  const cfg = CONFIG[list];
  const canEdit = useCanEdit();
  const [manage, setManage] = useState(false);
  const q = useQuery({ queryKey: kk.stock(list), queryFn: () => apiFetch<StockResponse>(`/api/kitchen/stock/${list}`) });

  return (
    <>
      <KitchenHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        icon={cfg.icon}
        actions={
          canEdit && (
            <Button variant={manage ? "primary" : "secondary"} onClick={() => setManage((v) => !v)}>
              {manage ? "Gotowe" : "Edytuj pozycje"}
            </Button>
          )
        }
      />
      {q.isPending && <Spinner label="Ładowanie…" />}
      {q.isError && <Alert tone="error">Nie udało się wczytać listy.</Alert>}
      {q.data && (manage ? <StockManager list={list} items={q.data.items} /> : <StockSheet list={list} data={q.data} canEdit={canEdit} onManage={() => setManage(true)} />)}
      {!manage && <StockHistory list={list} />}
      <StepNav />
    </>
  );
}

function StockSheet({ list, data, canEdit, onManage }: { list: StockList; data: StockResponse; canEdit: boolean; onManage: () => void }) {
  const cfg = CONFIG[list];
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(data.lines.map((l) => [l.itemId, { have: fmtQty(l.qtyHave), order: fmtQty(l.qtyOrder), note: l.note }])),
  );
  const [onlyPending, setOnlyPending] = useState(false);
  const [saving, setSaving] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(data.updatedAt);
  const [notice, setNotice] = useState<string | null>(null);
  const [closedText, setClosedText] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef(drafts);
  latest.current = drafts;

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((h) => clearTimeout(h));
  }, []);

  const save = async (itemId: string) => {
    timers.current.delete(itemId);
    const d = latest.current[itemId];
    if (!d) return;
    const have = parseQty(d.have);
    const order = parseQty(d.order);
    if (have === undefined || order === undefined) return;
    setSaving((n) => n + 1);
    try {
      await apiFetch(`/api/kitchen/stock/${list}/lines/${itemId}`, { method: "PUT", body: list === "wholesale" ? { qtyHave: have, qtyOrder: order, note: d.note } : { qtyOrder: order, note: d.note } });
      setSavedAt(new Date().toISOString());
      setSaveError(null);
      void qc.invalidateQueries({ queryKey: kk.summary });
    } catch {
      setSaveError("Nie udało się zapisać — sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setSaving((n) => n - 1);
    }
  };

  const change = (itemId: string, field: keyof Draft, value: string) => {
    setDrafts((p) => ({ ...p, [itemId]: { ...(p[itemId] ?? { have: "", order: "", note: "" }), [field]: value } }));
    const old = timers.current.get(itemId);
    if (old) clearTimeout(old);
    timers.current.set(itemId, setTimeout(() => void save(itemId), 800));
  };
  const flush = (itemId: string) => {
    const t = timers.current.get(itemId);
    if (t) {
      clearTimeout(t);
      void save(itemId);
    }
  };

  const qtyOf = (it: StockItem): number => {
    if (isTextUnit(it.unit)) return 0;
    const d = drafts[it.id];
    const have = d ? parseQty(d.have) : null;
    const order = d ? parseQty(d.order) : null;
    if (list === "shopping") return order ?? 0;
    return orderQty(it, { qtyHave: have ?? null, qtyOrder: order ?? null });
  };
  const noteOf = (it: StockItem) => (list === "shopping" || isTextUnit(it.unit) ? (drafts[it.id]?.note.trim() ?? "") : "");
  const pending = (it: StockItem) => qtyOf(it) > 0 || noteOf(it) !== "";
  const pendingLines = data.items
    .filter(pending)
    .map((it) => ({ name: it.name, unit: it.unit, groupName: it.groupName, qty: qtyOf(it), note: noteOf(it) }));

  const close = useApiMutation(() => ({ path: `/api/kitchen/stock/${list}/close`, body: {} }), [kk.stock(list), kk.stockHistory(list), kk.summary]);

  if (data.items.length === 0) {
    return (
      <EmptyState title="Na tej liście nie ma jeszcze pozycji">
        {canEdit ? (
          <>
            Dodaj produkty ręcznie albo wklej całą listę.{" "}
            <button type="button" onClick={onManage} className="font-semibold text-accent underline">
              Dodaj pozycje
            </button>
          </>
        ) : (
          "Poproś kierownika o dodanie produktów."
        )}
      </EmptyState>
    );
  }

  const visible = onlyPending ? data.items.filter(pending) : data.items;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
          Pokaż tylko {list === "shopping" ? "do kupienia" : "do zamówienia"}
        </label>
        <span className="text-muted" aria-live="polite">
          {saving > 0 ? "Zapisywanie…" : savedAt ? `Zapisano ${fmtDateTime(savedAt).split(", ")[1] ?? ""}` : "Zmiany zapisują się same"}
        </span>
      </div>
      {saveError && (
        <div className="mb-3">
          <Alert tone="error">{saveError}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-3">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <div className="grid gap-4">
        {groupBy(visible).map(([group, items]) => (
          <section key={group} className="overflow-hidden rounded-xl border border-border bg-surface">
            <h2 className="border-b border-border bg-surface-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">{group}</h2>
            <ul className="divide-y divide-border">
              {items.map((it) => {
                const d = drafts[it.id] ?? { have: "", order: "", note: "" };
                const q = qtyOf(it);
                const haveBad = parseQty(d.have) === undefined;
                const orderBad = parseQty(d.order) === undefined;
                if (isTextUnit(it.unit)) {
                  return (
                    <li key={it.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
                      <div className="min-w-0">
                        <p className="font-medium leading-tight">{it.name}</p>
                        <p className="text-xs text-muted">{list === "wholesale" ? "wpisz, co zamówić" : "wpisz, co kupić"}</p>
                      </div>
                      <NoteInput label={`${it.name}: ${list === "wholesale" ? "zamówić" : "kupić"} (opis)`} caption={list === "wholesale" ? "Zamówić — opis" : "Kupić — opis"} value={d.note} highlight={d.note.trim() !== ""} step onChange={(v) => change(it.id, "note", v)} onBlur={() => flush(it.id)} />
                    </li>
                  );
                }
                return (
                  <li key={it.id} className={`grid items-center gap-x-3 gap-y-2 px-4 py-3 ${list === "wholesale" ? "grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-2 sm:gap-x-3" : "grid-cols-[minmax(0,1fr)_auto_minmax(0,1.1fr)] sm:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,2fr)]"}`}>
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{it.name}</p>
                      <p className="text-xs text-muted">
                        {list === "wholesale" ? (it.parQty != null ? it.unit : "ustaw „powinno być” w Edytuj pozycje") : it.unit}
                      </p>
                    </div>
                    {list === "wholesale" && <ParBox name={it.name} unit={it.unit} value={it.parQty} />}
                    {list === "wholesale" && (
                      <QtyInput label={`${it.name}: jest`} caption="Jest" unit={it.unit} value={d.have} bad={haveBad} onChange={(v) => change(it.id, "have", v)} onBlur={() => flush(it.id)} />
                    )}
                    <QtyInput
                      label={`${it.name}: ${list === "wholesale" ? "zamówić" : "kupić"}`}
                      caption={list === "wholesale" ? "Zamówić" : "Kupić"}
                      unit={it.unit}
                      value={d.order}
                      placeholder={list === "wholesale" ? fmtQty(q) || "0" : ""}
                      bad={orderBad}
                      highlight={q > 0}
                      step={list === "shopping"}
                      onChange={(v) => change(it.id, "order", v)}
                      onBlur={() => flush(it.id)}
                    />
                    {list === "shopping" && (
                      <NoteInput label={`${it.name}: opis`} caption="Opis" value={d.note} onChange={(v) => change(it.id, "note", v)} onBlur={() => flush(it.id)} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {list === "wholesale" && <p className="mt-2 text-xs text-muted">„Zamówić” liczy się samo (powinno − jest). „Powinno” zmienisz w „Edytuj pozycje”. Wpisz własną liczbę, żeby ją nadpisać; wyczyść pole, by wrócić do automatu.</p>}

      {closedText && (
        <Card title="Lista zamknięta" className="mt-4">
          <pre className="whitespace-pre-wrap text-sm">{closedText}</pre>
          <Button className="mt-3" variant="secondary" onClick={() => void copyOrShare(cfg.exportTitle, closedText).then((r) => r !== "failed" && setNotice(r === "copied" ? "Skopiowano do schowka." : "Udostępniono."))}>
            Kopiuj / udostępnij
          </Button>
        </Card>
      )}

      <div className="sticky bottom-16 z-20 mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur md:bottom-4">
        <p className="mr-auto min-w-0 text-sm leading-tight">
          <span className="font-bold">{pendingLines.length}</span> {list === "shopping" ? "do kupienia" : "do zamówienia"}
        </p>
        <Button
          variant="secondary"
          className="px-3"
          disabled={pendingLines.length === 0}
          onClick={() =>
            void copyOrShare(cfg.exportTitle, exportText(cfg.exportTitle, pendingLines)).then((r) =>
              setNotice(r === "copied" ? "Lista skopiowana — wklej ją w SMS/WhatsApp/e-mail." : r === "shared" ? "Udostępniono." : null),
            )
          }
        >
          Wyślij
        </Button>
        <Button
          className="px-3"
          loading={close.isPending}
          disabled={saving > 0}
          onClick={async () => {
            if (!confirm(`Zamknąć listę (${pendingLines.length} poz.) i zacząć nową? Zamknięta trafi do historii.`)) return;
            // Persist pending edits before closing.
            await Promise.all(
              [...timers.current.entries()].map(([id, t]) => {
                clearTimeout(t);
                return save(id);
              }),
            );
            const r = await close.submit(undefined);
            if (r) {
              const res = r as { lines: StockSheetSummaryLine[] };
              setDrafts({});
              setNotice(null);
              setClosedText(res.lines.length ? exportText(cfg.exportTitle, res.lines) : cfg.empty);
            }
          }}
        >
          Zamknij listę
        </Button>
      </div>
      {close.error && (
        <div className="mt-2">
          <Alert tone="error">{close.error.message}</Alert>
        </div>
      )}
    </>
  );
}

/** `step`: include in the keyboard prev/next order (only when the text replaces the quantity). */
function NoteInput(props: { label: string; caption: string; value: string; step?: boolean; highlight?: boolean; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] font-medium text-muted">{props.caption}</span>
      <input
        aria-label={props.label}
        {...(props.step ? { "data-step": "", enterKeyHint: "next" as const } : {})}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={300}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={props.onBlur}
        className={`h-11 w-full min-w-0 rounded-lg border bg-surface px-3 text-base placeholder:text-muted ${props.highlight ? "border-teal-500" : "border-border"}`}
      />
      <span className="text-[11px] text-transparent" aria-hidden="true">
        .
      </span>
    </label>
  );
}

/** Read-only target level; changed only in "Edytuj pozycje". */
function ParBox({ name, unit, value }: { name: string; unit: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center gap-0.5" aria-label={`${name}: powinno być ${value == null ? "nie ustawiono" : `${fmtQty(value)} ${unit}`}`} role="group">
      <span className="text-[11px] font-medium text-muted">Powinno</span>
      <span className="grid h-11 w-16 place-items-center rounded-lg bg-surface-2 text-base font-semibold tabular-nums text-muted sm:w-20">{value == null ? "—" : fmtQty(value)}</span>
      <span className="text-[11px] text-muted">{unit}</span>
    </div>
  );
}

function QtyInput(props: {
  label: string;
  caption: string;
  unit: string;
  value: string;
  placeholder?: string;
  bad: boolean;
  highlight?: boolean;
  /** Include in the keyboard prev/next order (default true). */
  step?: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <label className="flex flex-col items-center gap-0.5">
      <span className="text-[11px] font-medium text-muted">{props.caption}</span>
      <input
        aria-label={props.label}
        aria-invalid={props.bad || undefined}
        {...(props.step !== false ? { "data-step": "", enterKeyHint: "next" as const } : {})}
        inputMode="decimal"
        autoComplete="off"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={props.onBlur}
        className={`h-11 w-16 rounded-lg border bg-surface px-2 sm:w-20 text-center text-base font-semibold tabular-nums placeholder:font-normal aria-[invalid=true]:border-danger ${props.highlight ? "border-teal-500 placeholder:text-teal-700 dark:placeholder:text-teal-300" : "border-border placeholder:text-muted"}`}
      />
      <span className="text-[11px] text-muted">{props.unit}</span>
    </label>
  );
}

function StockHistory({ list }: { list: StockList }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: kk.stockHistory(list),
    queryFn: async () => (await apiFetch<{ sheets: StockSheetHistory[] }>(`/api/kitchen/stock/${list}/history`)).sheets,
    enabled: open,
  });
  return (
    <details className="mt-6 rounded-xl border border-border bg-surface" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold">Historia zamkniętych list</summary>
      <div className="border-t border-border p-4">
        {q.isPending && open && <Spinner small />}
        {q.data?.length === 0 && <p className="text-sm text-muted">Brak zamkniętych list.</p>}
        <ul className="grid gap-3">
          {q.data?.map((s) => (
            <li key={s.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {fmtDateTime(s.closedAt)}
                  {s.closedByName && <span className="font-normal text-muted"> · {s.closedByName}</span>}
                </p>
                <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={() => void copyOrShare(CONFIG[list].exportTitle, exportText(CONFIG[list].exportTitle, s.lines, new Date(s.closedAt)))}>
                  Kopiuj
                </Button>
              </div>
              {s.lines.length === 0 ? (
                <p className="text-sm text-muted">{CONFIG[list].empty}</p>
              ) : (
                <ul className="mt-1 text-sm">
                  {s.lines.map((l, i) => (
                    <li key={i}>
                      {l.name}
                      {l.qty > 0 && (
                        <>
                          : <strong>{fmtQty(l.qty)}</strong> {l.unit}
                        </>
                      )}
                      {l.note && <span className="text-muted"> — {l.note}</span>}
                      {list === "wholesale" && l.qtyHave != null && <span className="text-muted"> (było {fmtQty(l.qtyHave)})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/* ---------------- catalog management (owner/admin/trainer) ---------------- */

function StockManager({ list, items }: { list: StockList; items: StockItem[] }) {
  const inv = [kk.stock(list), kk.summary];
  const add = useApiMutation((b: { name: string; unit: string; groupName: string; parQty: number | null }) => ({ path: `/api/kitchen/stock/${list}/items`, body: b }), inv);
  const imp = useApiMutation((b: { text: string }) => ({ path: `/api/kitchen/stock/${list}/import`, body: b }), inv);
  const [form, setForm] = useState({ name: "", unit: "szt.", groupName: "", par: "" });
  const [bulk, setBulk] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const groups = [...new Set(items.map((i) => i.groupName).filter(Boolean))];

  return (
    <div className="grid gap-4">
      <Card title="Dodaj pozycję">
        <form
          className="grid gap-3 sm:grid-cols-[2fr_1fr_1.5fr_1fr_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const par = parseQty(form.par);
            const r = await add.submit({ name: form.name, unit: form.unit, groupName: form.groupName, parQty: par ?? null });
            if (r) setForm((f) => ({ ...f, name: "", par: "" }));
          }}
        >
          <Field label="Nazwa" error={add.fieldErrors?.name}>
            {(p) => <Input {...p} required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
          </Field>
          <Field label="Jednostka" hint="„opis” = zamiast liczby własny tekst">
            {(p) => <Input {...p} list="stock-units" maxLength={20} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />}
          </Field>
          <Field label="Grupa">
            {(p) => (
              <>
                <Input {...p} list="stock-groups" maxLength={60} placeholder="np. Ryby" value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} />
                <datalist id="stock-groups">
                  {groups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          {list === "wholesale" ? (
            <Field label="Powinno być">{(p) => <Input {...p} inputMode="decimal" value={form.par} onChange={(e) => setForm({ ...form, par: e.target.value })} />}</Field>
          ) : (
            <span className="hidden sm:block" />
          )}
          <Button type="submit" loading={add.isPending}>
            Dodaj
          </Button>
        </form>
        {add.error && !add.fieldErrors && <Alert tone="error">{add.error.message}</Alert>}
      </Card>

      <datalist id="stock-units">
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <Card title={`Pozycje (${items.length})`}>
        {items.length === 0 ? (
          <p className="text-sm text-muted">Brak pozycji.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((it) => (
              <ManagedRow key={it.id} list={list} item={it} />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Wklej wiele pozycji naraz">
        <p className="mb-2 text-sm text-muted">
          Jedna pozycja w linii: <code>nazwa; jednostka; {list === "wholesale" ? "ile powinno być" : "(puste)"}; grupa</code>. Wystarczy sama nazwa. Jednostka „opis” = zamiast liczby wpisuje się własny tekst. Duplikaty są pomijane.
        </p>
        <Textarea
          aria-label="Lista pozycji do wklejenia"
          rows={6}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={list === "wholesale" ? "Łosoś; kg; 6; Ryby\nNori; opak.; 4; Suche" : "Cytryny; szt.;; Warzywa i owoce\nPapier do pieczenia; rolka;; Chemia"}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            loading={imp.isPending}
            disabled={!bulk.trim()}
            onClick={async () => {
              const r = (await imp.submit({ text: bulk })) as { added: number; skipped: number } | undefined;
              if (r) {
                setBulk("");
                setMsg(`Dodano ${r.added}${r.skipped ? `, pominięto ${r.skipped} (już były)` : ""}.`);
              }
            }}
          >
            Importuj
          </Button>
          {msg && <span className="text-sm text-ok">{msg}</span>}
          {imp.error && <span className="text-sm text-danger">{imp.fieldErrors?.text ?? imp.error.message}</span>}
        </div>
      </Card>
    </div>
  );
}

function ManagedRow({ list, item }: { list: StockList; item: StockItem }) {
  const inv = [kk.stock(list), kk.summary];
  const patch = useApiMutation((b: Partial<{ name: string; unit: string; groupName: string; parQty: number | null }>) => ({ path: `/api/kitchen/stock/items/${item.id}`, method: "PATCH", body: b }), inv);
  const del = useApiMutation(() => ({ path: `/api/kitchen/stock/items/${item.id}`, method: "DELETE" }), inv);
  const [v, setV] = useState({ name: item.name, unit: item.unit, groupName: item.groupName, par: fmtQty(item.parQty) });
  const commit = (b: Parameters<typeof patch.submit>[0]) => void patch.submit(b);
  return (
    <li className="grid grid-cols-2 gap-2 py-3 sm:grid-cols-[2fr_1fr_1.5fr_1fr_auto] sm:items-center">
      <Input aria-label="Nazwa" className="col-span-2 sm:col-span-1" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} onBlur={() => v.name.trim() && v.name !== item.name && commit({ name: v.name })} />
      <Input aria-label={`${item.name}: jednostka`} list="stock-units" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} onBlur={() => v.unit !== item.unit && commit({ unit: v.unit })} />
      <Input aria-label={`${item.name}: grupa`} placeholder="Grupa" value={v.groupName} onChange={(e) => setV({ ...v, groupName: e.target.value })} onBlur={() => v.groupName !== item.groupName && commit({ groupName: v.groupName })} />
      {list === "wholesale" ? (
        <Input
          aria-label={`${item.name}: powinno być`}
          placeholder="Powinno być"
          inputMode="decimal"
          value={v.par}
          onChange={(e) => setV({ ...v, par: e.target.value })}
          onBlur={() => {
            const p = parseQty(v.par);
            if (p !== undefined && p !== item.parQty) commit({ parQty: p });
          }}
        />
      ) : (
        <span className="hidden sm:block" />
      )}
      <Button
        variant="ghost"
        className="text-danger"
        loading={del.isPending}
        onClick={() => {
          if (confirm(`Usunąć „${item.name}” z listy? Historia zostanie zachowana.`)) void del.submit(undefined);
        }}
      >
        Usuń
      </Button>
      {patch.error && <p className="col-span-full text-xs text-danger">{patch.fieldErrors?.name ?? patch.error.message}</p>}
    </li>
  );
}

export const ShoppingPage = () => <StockPage list="shopping" />;
export const WholesalePage = () => <StockPage list="wholesale" />;
