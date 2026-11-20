import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { COLD_UNIT_KINDS, COLD_UNIT_LABELS, DEFAULT_RANGES, warsawDate, warsawDayStart, type ColdUnit, type ColdUnitKind, type PestRow, type TemperatureRow } from "../../../shared/kitchen";
import { Textarea, useCanEdit } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useApiMutation } from "../../lib/use-api-mutation";
import { fmtDateTime, fmtTemp, KitchenHeader, kk, StepNav, useKitchenSummary } from "./common";

function useUnits() {
  return useQuery({ queryKey: kk.units, queryFn: async () => (await apiFetch<{ units: ColdUnit[] }>("/api/kitchen/haccp/units")).units });
}

/** "-18,5" → -18.5; empty → null; invalid → undefined. */
function parseTemp(s: string): number | null | undefined {
  const t = s.trim().replace(",", ".").replace("−", "-");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= -60 && n <= 60 ? n : undefined;
}

type Tab = "entry" | "log" | "units";

export function HaccpPage() {
  const canEdit = useCanEdit();
  const [tab, setTab] = useState<Tab>("entry");
  const tabs: [Tab, string][] = [
    ["entry", "Nowy wpis"],
    ["log", "Ewidencja"],
    ...(canEdit ? ([["units", "Urządzenia"]] as [Tab, string][]) : []),
  ];
  return (
    <>
      <KitchenHeader title="HACCP" subtitle="Temperatury urządzeń chłodniczych i kontrola obecności szkodników" icon="thermo" />
      <div role="tablist" aria-label="Sekcje HACCP" className="mb-4 inline-flex rounded-xl border border-border bg-surface p-1 print:hidden">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${tab === k ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "entry" && <StepNav />}
      {tab === "entry" && <EntryForm onDone={() => setTab("log")} onManage={canEdit ? () => setTab("units") : undefined} />}
      {tab === "log" && <LogView />}
      {tab === "units" && <UnitsManager />}
    </>
  );
}

function EntryForm({ onDone, onManage }: { onDone: () => void; onManage?: (() => void) | undefined }) {
  const units = useUnits();
  const summary = useKitchenSummary();
  const [temps, setTemps] = useState<Record<string, string>>({});
  const [actions, setActions] = useState<Record<string, string>>({});
  const [pestFound, setPestFound] = useState(false);
  const [pestNotes, setPestNotes] = useState("");
  const [pestAction, setPestAction] = useState("");
  const [checkPests, setCheckPests] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const save = useApiMutation((b: unknown) => ({ path: "/api/kitchen/haccp/entries", body: b }), [kk.summary, ["kitchen", "haccp", "log"]]);

  if (units.isPending) return <Spinner label="Ładowanie…" />;
  if (units.data?.length === 0)
    return (
      <EmptyState title="Nie dodano jeszcze żadnych lodówek ani zamrażarek">
        {onManage ? (
          <button type="button" className="font-semibold text-accent underline" onClick={onManage}>
            Dodaj urządzenia
          </button>
        ) : (
          "Poproś kierownika o dodanie urządzeń."
        )}
      </EmptyState>
    );

  const list = units.data ?? [];
  const h = summary.data?.haccp;

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const readings = list
          .filter((u) => parseTemp(temps[u.id] ?? "") != null)
          .map((u) => ({ unitId: u.id, tempC: parseTemp(temps[u.id]!)!, correctiveAction: actions[u.id] ?? "" }));
        const r = (await save.submit({ readings, pest: checkPests ? { found: pestFound, notes: pestNotes, action: pestAction } : null })) as
          | { saved: number; outOfRange: number }
          | undefined;
        if (r) {
          setTemps({});
          setActions({});
          setPestFound(false);
          setPestNotes("");
          setPestAction("");
          setMsg(`Zapisano ${r.saved} pomiar(y)${checkPests ? " i kontrolę szkodników" : ""}.${r.outOfRange ? ` Poza zakresem: ${r.outOfRange}.` : ""}`);
        }
      }}
    >
      {h && (
        <p className="text-sm text-muted">
          Dziś: {h.measuredToday}/{h.units} urządzeń zmierzonych · szkodniki: {h.pestCheckedToday ? "sprawdzone ✓" : "niesprawdzone"}
        </p>
      )}
      {msg && (
        <Alert tone="success">
          {msg}{" "}
          <button type="button" className="font-semibold underline" onClick={onDone}>
            Zobacz ewidencję
          </button>
        </Alert>
      )}
      <Card title="Temperatury">
        <ul className="grid gap-3">
          {list.map((u) => {
            const v = parseTemp(temps[u.id] ?? "");
            const out = v != null && (v < u.minC || v > u.maxC);
            return (
              <li key={u.id} className={`rounded-xl border p-3 ${out ? "border-danger bg-danger/5" : "border-border"}`}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight">{u.name}</p>
                    <p className="text-xs text-muted">
                      {COLD_UNIT_LABELS[u.kind]} · zakres {fmtTemp(u.minC)} … {fmtTemp(u.maxC)}
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5">
                    <input
                      aria-label={`${u.name}: temperatura °C`}
                      data-step=""
                      enterKeyHint="next"
                      aria-invalid={v === undefined || out || undefined}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="°C"
                      value={temps[u.id] ?? ""}
                      onChange={(e) => setTemps({ ...temps, [u.id]: e.target.value })}
                      className="h-12 w-24 rounded-lg border border-border bg-surface px-2 text-center text-lg font-bold tabular-nums aria-[invalid=true]:border-danger aria-[invalid=true]:text-danger"
                    />
                    <span className="text-sm text-muted">°C</span>
                  </label>
                </div>
                {u.kind === "freezer" && <p className="mt-1 text-xs text-muted">Wpisz z minusem, np. -18.</p>}
                {out && (
                  <div className="mt-3">
                    <Field label="Temperatura poza zakresem — działanie korygujące" hint="Np. przeniesiono produkty, wezwano serwis, ponowny pomiar o …">
                      {(p) => <Textarea {...p} rows={2} required maxLength={2000} value={actions[u.id] ?? ""} onChange={(e) => setActions({ ...actions, [u.id]: e.target.value })} />}
                    </Field>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Obecność szkodników">
        <label className="mb-2 flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={checkPests} onChange={(e) => setCheckPests(e.target.checked)} />
          Zapisz kontrolę szkodników razem z tym wpisem
        </label>
        {checkPests && (
          <>
            <fieldset className="grid gap-1">
              <legend className="sr-only">Wynik kontroli</legend>
              <label className="flex min-h-11 items-center gap-3">
                <input type="radio" name="pest" className="size-5 accent-[var(--color-accent)]" checked={!pestFound} onChange={() => setPestFound(false)} />
                Brak śladów szkodników
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="radio" name="pest" className="size-5 accent-[var(--color-accent)]" checked={pestFound} onChange={() => setPestFound(true)} />
                Zauważono szkodniki lub ślady
              </label>
            </fieldset>
            {pestFound && (
              <div className="mt-2 grid gap-3">
                <Field label="Co i gdzie zauważono" error={save.fieldErrors?.["pest.notes"]}>
                  {(p) => <Textarea {...p} rows={2} required maxLength={2000} value={pestNotes} onChange={(e) => setPestNotes(e.target.value)} />}
                </Field>
                <Field label="Podjęte działania" hint="Np. zabezpieczono żywność, powiadomiono kierownika i firmę DDD.">
                  {(p) => <Textarea {...p} rows={2} maxLength={2000} value={pestAction} onChange={(e) => setPestAction(e.target.value)} />}
                </Field>
              </div>
            )}
          </>
        )}
      </Card>
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      <Button type="submit" loading={save.isPending} className="w-full sm:w-auto sm:justify-self-start">
        Zapisz wpis
      </Button>
      <p className="text-xs text-muted">Zapisane wpisy są nieedytowalne (wymóg rzetelnej ewidencji). Pomyłkę popraw nowym wpisem z komentarzem.</p>
    </form>
  );
}

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const from = warsawDayStart(new Date(Date.UTC(y, m - 1, 1, 12)));
  const to = warsawDayStart(new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 12)));
  return { from: from.toISOString(), to: to.toISOString() };
}

function LogView() {
  const [month, setMonth] = useState(warsawDate().slice(0, 7));
  const { from, to } = monthRange(month);
  const q = useQuery({
    queryKey: kk.log(from, to),
    queryFn: () => apiFetch<{ temperatures: TemperatureRow[]; pests: PestRow[] }>(`/api/kitchen/haccp/log?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });
  const label = new Date(from).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw", month: "long", year: "numeric" });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Miesiąc">{(p) => <Input {...p} type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-48" />}</Field>
        <Button variant="secondary" onClick={() => window.print()}>
          Drukuj / PDF
        </Button>
      </div>
      <h2 className="hidden text-lg font-bold print:block">Ewidencja HACCP — {label}</h2>
      {q.isPending && <Spinner label="Ładowanie…" />}
      {q.data && (
        <>
          <section>
            <h3 className="mb-2 font-semibold">Temperatury ({q.data.temperatures.length})</h3>
            {q.data.temperatures.length === 0 ? (
              <EmptyState title="Brak pomiarów w tym miesiącu" />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-surface print:overflow-visible print:border-0">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">Data i godzina</th>
                      <th className="px-3 py-2">Urządzenie</th>
                      <th className="px-3 py-2 text-right">Temp.</th>
                      <th className="px-3 py-2">Zakres</th>
                      <th className="px-3 py-2">Działanie korygujące</th>
                      <th className="px-3 py-2">Kto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {q.data.temperatures.map((t) => (
                      <tr key={t.id} className={t.inRange ? "" : "bg-danger/5"}>
                        <td className="whitespace-nowrap px-3 py-2">{fmtDateTime(t.measuredAt)}</td>
                        <td className="px-3 py-2">{t.unitName}</td>
                        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${t.inRange ? "" : "text-danger"}`}>
                          {fmtTemp(t.tempC)}
                          {!t.inRange && " ⚠"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted">
                          {t.minC}…{t.maxC}
                        </td>
                        <td className="px-3 py-2">{t.correctiveAction || "—"}</td>
                        <td className="px-3 py-2 text-muted">{t.authorName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Kontrola szkodników ({q.data.pests.length})</h3>
            {q.data.pests.length === 0 ? (
              <EmptyState title="Brak kontroli w tym miesiącu" />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-surface print:overflow-visible print:border-0">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">Data i godzina</th>
                      <th className="px-3 py-2">Wynik</th>
                      <th className="px-3 py-2">Opis / działania</th>
                      <th className="px-3 py-2">Kto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {q.data.pests.map((p) => (
                      <tr key={p.id} className={p.found ? "bg-danger/5" : ""}>
                        <td className="whitespace-nowrap px-3 py-2">{fmtDateTime(p.checkedAt)}</td>
                        <td className={`px-3 py-2 font-semibold ${p.found ? "text-danger" : "text-ok"}`}>{p.found ? "Zauważono" : "Brak"}</td>
                        <td className="px-3 py-2">{[p.notes, p.action].filter(Boolean).join(" — ") || "—"}</td>
                        <td className="px-3 py-2 text-muted">{p.authorName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function UnitsManager() {
  const units = useUnits();
  const add = useApiMutation((b: { name: string; kind: ColdUnitKind; minC: number; maxC: number }) => ({ path: "/api/kitchen/haccp/units", body: b }), [kk.units, kk.summary]);
  const [form, setForm] = useState({ name: "", kind: "fridge" as ColdUnitKind, minC: String(DEFAULT_RANGES.fridge.minC), maxC: String(DEFAULT_RANGES.fridge.maxC) });
  return (
    <div className="grid gap-4">
      <Alert tone="info">Zakresy domyślne (lodówka 0…4 °C, zamrażarka −25…−18 °C) to tylko punkt wyjścia — ustaw granice zgodnie z planem HACCP lokalu. Zmiana granic nie zmienia zapisanych pomiarów.</Alert>
      <Card title="Dodaj urządzenie">
        <form
          className="grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const minC = parseTemp(form.minC);
            const maxC = parseTemp(form.maxC);
            if (minC == null || maxC == null) return;
            const r = await add.submit({ name: form.name, kind: form.kind, minC, maxC });
            if (r) setForm({ ...form, name: "" });
          }}
        >
          <Field label="Nazwa" error={add.fieldErrors?.name}>
            {(p) => <Input {...p} required maxLength={120} placeholder="np. Lodówka ryby" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
          </Field>
          <Field label="Rodzaj">
            {(p) => (
              <Select
                {...p}
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value as ColdUnitKind;
                  setForm({ ...form, kind, minC: String(DEFAULT_RANGES[kind].minC), maxC: String(DEFAULT_RANGES[kind].maxC) });
                }}
              >
                {COLD_UNIT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {COLD_UNIT_LABELS[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Min °C">{(p) => <Input {...p} inputMode="decimal" required value={form.minC} onChange={(e) => setForm({ ...form, minC: e.target.value })} />}</Field>
          <Field label="Max °C" error={add.fieldErrors?.maxC}>
            {(p) => <Input {...p} inputMode="decimal" required value={form.maxC} onChange={(e) => setForm({ ...form, maxC: e.target.value })} />}
          </Field>
          <Button type="submit" loading={add.isPending}>
            Dodaj
          </Button>
        </form>
      </Card>
      <Card title="Urządzenia">
        {units.isPending && <Spinner small />}
        {units.data?.length === 0 && <p className="text-sm text-muted">Brak urządzeń.</p>}
        <ul className="divide-y divide-border">
          {units.data?.map((u) => (
            <UnitRow key={u.id} unit={u} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function UnitRow({ unit }: { unit: ColdUnit }) {
  const inv = [kk.units, kk.summary];
  const patch = useApiMutation((b: Partial<{ name: string; minC: number; maxC: number }>) => ({ path: `/api/kitchen/haccp/units/${unit.id}`, method: "PATCH", body: b }), inv);
  const del = useApiMutation(() => ({ path: `/api/kitchen/haccp/units/${unit.id}`, method: "DELETE" }), inv);
  const [v, setV] = useState({ name: unit.name, minC: String(unit.minC), maxC: String(unit.maxC) });
  const dirty = v.name !== unit.name || v.minC !== String(unit.minC) || v.maxC !== String(unit.maxC);
  return (
    <li className="grid grid-cols-2 gap-2 py-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto] sm:items-center">
      <Input aria-label="Nazwa urządzenia" className="col-span-2 sm:col-span-1" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <Input aria-label={`${unit.name}: min °C`} inputMode="decimal" value={v.minC} onChange={(e) => setV({ ...v, minC: e.target.value })} />
      <Input aria-label={`${unit.name}: max °C`} inputMode="decimal" value={v.maxC} onChange={(e) => setV({ ...v, maxC: e.target.value })} />
      <Button
        variant="secondary"
        disabled={!dirty}
        loading={patch.isPending}
        onClick={() => {
          const minC = parseTemp(v.minC);
          const maxC = parseTemp(v.maxC);
          if (minC == null || maxC == null) return;
          void patch.submit({ name: v.name, minC, maxC });
        }}
      >
        Zapisz
      </Button>
      <Button
        variant="ghost"
        className="text-danger"
        loading={del.isPending}
        onClick={() => {
          if (confirm(`Usunąć „${unit.name}”? Zapisane pomiary zostaną w ewidencji.`)) void del.submit(undefined);
        }}
      >
        Usuń
      </Button>
      {patch.error && <p className="col-span-full text-xs text-danger">{patch.fieldErrors?.maxC ?? patch.error.message}</p>}
    </li>
  );
}
