import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Icon, TONE, type IconName } from "../layout/nav";
import {
  COLD_UNIT_KINDS,
  COLD_UNIT_LABELS,
  DEFAULT_RANGES,
  warsawDate,
  warsawDayStart,
  CLEANING_FREQUENCIES,
  CLEANING_FREQUENCY_LABELS,
  type CleaningFrequency,
  type CleaningRow,
  type CleaningTask,
  type ColdUnit,
  type ColdUnitKind,
  type PestRow,
  type TemperatureRow,
} from "../../../shared/kitchen";
import { Textarea, useCanEdit } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useApiMutation } from "../../lib/use-api-mutation";
import { fmtDateTime, fmtTemp, KitchenHeader, kk, NameField, StepNav, useKitchenSummary, useSignedName } from "./common";

function useUnits() {
  return useQuery({ queryKey: kk.units, queryFn: async () => (await apiFetch<{ units: ColdUnit[] }>("/api/kitchen/haccp/units")).units });
}
const cleaningKey = ["kitchen", "haccp", "cleaning-tasks"] as const;
function useCleaningTasks() {
  return useQuery({ queryKey: cleaningKey, queryFn: async () => (await apiFetch<{ tasks: CleaningTask[] }>("/api/kitchen/haccp/cleaning-tasks")).tasks });
}
const LOG_KEY = ["kitchen", "haccp", "log"];

/** "-18,5" → -18.5; empty → null; invalid → undefined. */
function parseTemp(s: string): number | null | undefined {
  const t = s.trim().replace(",", ".").replace("−", "-");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= -60 && n <= 60 ? n : undefined;
}

type Section = "sprzatanie" | "temperatury" | "szkodniki" | "ewidencja" | "ustawienia";
const TITLES: Record<Section, string> = {
  sprzatanie: "Sprzątanie i czyszczenie",
  temperatury: "Temperatury",
  szkodniki: "Szkodniki",
  ewidencja: "Ewidencja HACCP",
  ustawienia: "Ustawienia HACCP",
};

export function HaccpPage() {
  const canEdit = useCanEdit();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get("s");
  const section = raw && raw in TITLES ? (raw as Section) : null;
  const go = (s: Section | null) => navigate(s ? `/kuchnia/haccp?s=${s}` : "/kuchnia/haccp");
  const toSettings = canEdit ? () => go("ustawienia") : undefined;
  const toLog = () => go("ewidencja");

  if (!section) return <HaccpHome canEdit={canEdit} />;
  return (
    <>
      <KitchenHeader title={TITLES[section]} icon="thermo" backTo="/kuchnia/haccp" />
      {section === "sprzatanie" && <CleaningForm onManage={toSettings} onDone={toLog} />}
      {section === "temperatury" && (
        <>
          <StepNav />
          <TempForm onManage={toSettings} onDone={toLog} />
        </>
      )}
      {section === "szkodniki" && <PestForm onDone={toLog} />}
      {section === "ewidencja" && <LogView />}
      {section === "ustawienia" &&
        (canEdit ? (
          <div className="grid gap-6">
            <CleaningPlanEditor />
            <UnitsManager />
          </div>
        ) : (
          <Alert tone="info">Ustawienia zmienia kierownik.</Alert>
        ))}
    </>
  );
}

type TileStatus = { text: string; tone: "ok" | "warn" | "muted" };
const DOT = { ok: "bg-ok", warn: "bg-warn", muted: "bg-border" };

/** Three big tiles filling the screen: cleaning, temperatures, pests. */
function HaccpHome({ canEdit }: { canEdit: boolean }) {
  const summary = useKitchenSummary();
  const h = summary.data?.haccp;
  const tiles: { s: Section; title: string; icon: IconName; status: TileStatus | null }[] = [
    {
      s: "sprzatanie",
      title: "Sprzątanie i czyszczenie",
      icon: "broom",
      status: !h ? null : h.cleaningTasks === 0 ? { text: "Brak planu sprzątania", tone: "muted" } : h.cleaningDue ? { text: `Do zrobienia: ${h.cleaningDue}`, tone: "warn" } : { text: "Wszystko zrobione na teraz", tone: "ok" },
    },
    {
      s: "temperatury",
      title: "Temperatury",
      icon: "thermo",
      status: !h
        ? null
        : h.units === 0
          ? { text: "Brak urządzeń", tone: "muted" }
          : h.outOfRangeToday
            ? { text: `Poza zakresem dziś: ${h.outOfRangeToday}`, tone: "warn" }
            : { text: `Dziś zmierzono ${h.measuredToday}/${h.units}`, tone: h.measuredToday >= h.units ? "ok" : "warn" },
    },
    {
      s: "szkodniki",
      title: "Szkodniki",
      icon: "bug",
      status: !h ? null : h.pestCheckedToday ? { text: "Dziś sprawdzone", tone: "ok" } : { text: "Dziś jeszcze nie sprawdzone", tone: "warn" },
    },
  ];
  return (
    <>
      <KitchenHeader title="HACCP" icon="thermo" />
      <ul className="grid min-h-[calc(100dvh-15rem)] grid-rows-3 gap-3 md:min-h-[calc(100dvh-12rem)]">
        {tiles.map((t) => (
          <li key={t.s} className="min-h-28">
            <Link
              to={`/kuchnia/haccp?s=${t.s}`}
              className="group flex h-full items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-teal-500/60 hover:shadow-md"
            >
              <span className={`grid size-16 shrink-0 place-items-center rounded-2xl ${TONE.kitchen}`}>
                <Icon name={t.icon} className="size-8" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-bold leading-tight">{t.title}</span>
                <span className="mt-1.5 flex items-center gap-2 text-sm font-medium">
                  <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${t.status ? DOT[t.status.tone] : "animate-pulse bg-border"}`} />
                  {t.status?.text ?? "…"}
                </span>
              </span>
              <span aria-hidden="true" className="text-2xl text-muted group-hover:text-fg">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/kuchnia/haccp?s=ewidencja" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-2">
          Ewidencja / druk
        </Link>
        {canEdit && (
          <Link to="/kuchnia/haccp?s=ustawienia" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-2">
            Ustawienia
          </Link>
        )}
      </div>
    </>
  );
}

function Saved({ text, onDone }: { text: string; onDone: () => void }) {
  return (
    <Alert tone="success">
      {text}{" "}
      <button type="button" className="font-semibold underline" onClick={onDone}>
        Zobacz ewidencję
      </button>
    </Alert>
  );
}

function SubmitRow({ children, pending, error }: { children: ReactNode; pending: boolean; error: Error | null }) {
  return (
    <>
      {error && <Alert tone="error">{error.message}</Alert>}
      <Button type="submit" loading={pending} className="w-full sm:w-auto sm:justify-self-start">
        {children}
      </Button>
    </>
  );
}

/* ----------------------------- cleaning ----------------------------- */

function CleaningForm({ onManage, onDone }: { onManage?: (() => void) | undefined; onDone: () => void }) {
  const tasks = useCleaningTasks();
  const summary = useKitchenSummary();
  const [name, setName] = useSignedName();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const save = useApiMutation((b: unknown) => ({ path: "/api/kitchen/haccp/cleaning", body: b }), [kk.summary, LOG_KEY]);

  if (tasks.isPending) return <Spinner label="Ładowanie…" />;
  if (!tasks.data?.length)
    return (
      <EmptyState title="Nie ma jeszcze planu sprzątania">
        {onManage ? (
          <button type="button" className="font-semibold text-accent underline" onClick={onManage}>
            Dodaj zadania sprzątania
          </button>
        ) : (
          "Poproś kierownika o dodanie zadań."
        )}
      </EmptyState>
    );
  const h = summary.data?.haccp;
  const picked = tasks.data.filter((t) => done[t.id]).map((t) => t.id);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = (await save.submit({ signedName: name, taskIds: picked, notes })) as { saved: number } | undefined;
        if (r) {
          setDone({});
          setNotes("");
          setMsg(`Zapisano: ${r.saved} ${r.saved === 1 ? "zadanie" : "zadania/zadań"}.`);
        }
      }}
    >
      {h && h.cleaningTasks > 0 && (
        <p className="text-sm text-muted">{h.cleaningDue ? `Do zrobienia teraz: ${h.cleaningDue}` : "Wszystko zrobione na teraz ✓"}</p>
      )}
      {msg && <Saved text={msg} onDone={onDone} />}
      <Card title="Sprzątanie i czyszczenie">
        {[
          ["Do zrobienia", tasks.data.filter((t) => t.due)],
          ["Zrobione na teraz", tasks.data.filter((t) => !t.due)],
        ].map(([title, list]) =>
          (list as CleaningTask[]).length === 0 ? null : (
            <div key={title as string} className="mb-2">
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted">{title as string}</p>
              <ul className="grid gap-1">
                {(list as CleaningTask[]).map((t) => (
                  <li key={t.id}>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 hover:bg-surface-2">
                      <input type="checkbox" className="size-5 shrink-0 accent-[var(--color-accent)]" checked={Boolean(done[t.id])} onChange={(e) => setDone({ ...done, [t.id]: e.target.checked })} />
                      <span className="min-w-0 flex-1">
                        <span className={`block ${t.due ? "font-medium" : "text-muted"}`}>{t.label}</span>
                        <span className="block text-xs text-muted">
                          {CLEANING_FREQUENCY_LABELS[t.frequency]}
                          {t.required > 1 && ` · dziś ${t.doneInPeriod}/${t.required}`}
                          {t.lastDoneAt && ` · ostatnio ${fmtDateTime(t.lastDoneAt)}`}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
        <button type="button" className="mt-1 px-2 text-xs font-semibold text-accent" onClick={() => setDone(Object.fromEntries(tasks.data.filter((t) => t.due).map((t) => [t.id, true])))}>
          Zaznacz wszystkie do zrobienia
        </button>
        <div className="mt-3">
          <Field label="Uwagi (opcjonalnie)">{(p) => <Textarea {...p} rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        </div>
      </Card>
      <NameField value={name} onChange={setName} error={save.fieldErrors?.signedName} />
      {save.fieldErrors?.taskIds && <Alert tone="error">{save.fieldErrors.taskIds}</Alert>}
      <SubmitRow pending={save.isPending} error={save.fieldErrors ? null : save.error}>
        Zapisz sprzątanie ({picked.length})
      </SubmitRow>
    </form>
  );
}

function CleaningPlanEditor() {
  const tasks = useCleaningTasks();
  const [rows, setRows] = useState<{ label: string; frequency: CleaningFrequency }[] | null>(null);
  const save = useApiMutation((b: { tasks: { label: string; frequency: CleaningFrequency }[] }) => ({ path: "/api/kitchen/haccp/cleaning-tasks", method: "PUT", body: b }), [cleaningKey, kk.summary]);
  const value = rows ?? (tasks.data ?? []).map((t) => ({ label: t.label, frequency: t.frequency }));
  const set = (next: typeof value) => setRows(next);
  return (
    <Card title="Plan sprzątania">
      <p className="mb-3 text-sm text-muted">Zadanie i jak często musi być zrobione (co najmniej). Zmiana planu nie wpływa na zapisane wpisy.</p>
      <ul className="grid gap-2">
        {value.map((r, i) => (
          <li key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_16rem_auto]">
            <Input aria-label={`Zadanie ${i + 1}`} value={r.label} maxLength={120} placeholder="np. podłoga" onChange={(e) => set(value.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="col-span-2 sm:col-span-1" />
            <Select aria-label={`Zadanie ${i + 1}: częstotliwość`} value={r.frequency} onChange={(e) => set(value.map((x, j) => (j === i ? { ...x, frequency: e.target.value as CleaningFrequency } : x)))}>
              {CLEANING_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {CLEANING_FREQUENCY_LABELS[f]}
                </option>
              ))}
            </Select>
            <button type="button" aria-label={`Usuń zadanie ${i + 1}`} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger" onClick={() => set(value.filter((_, j) => j !== i))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" className="mt-2 text-accent" onClick={() => set([...value, { label: "", frequency: "daily" }])}>
        + Dodaj zadanie
      </Button>
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      <div className="mt-3 flex items-center gap-3">
        <Button
          loading={save.isPending}
          disabled={rows === null}
          onClick={async () => {
            if (await save.submit({ tasks: value.map((r) => ({ ...r, label: r.label.trim() })).filter((r) => r.label) })) setRows(null);
          }}
        >
          Zapisz plan
        </Button>
        {save.isSuccess && rows === null && <span className="text-sm text-ok">Zapisano.</span>}
      </div>
    </Card>
  );
}

/* --------------------------- temperatures --------------------------- */

function TempForm({ onDone, onManage }: { onDone: () => void; onManage?: (() => void) | undefined }) {
  const units = useUnits();
  const summary = useKitchenSummary();
  const [name, setName] = useSignedName();
  const [temps, setTemps] = useState<Record<string, string>>({});
  // iPhone's number pad has no minus key: the sign is a separate toggle (freezers start negative).
  const [neg, setNeg] = useState<Record<string, boolean>>({});
  const isNeg = (u: ColdUnit) => neg[u.id] ?? u.kind === "freezer";
  const signed = (u: ColdUnit) => {
    const raw = (temps[u.id] ?? "").trim();
    return raw === "" ? "" : `${isNeg(u) ? "-" : ""}${raw}`;
  };
  const [actions, setActions] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const save = useApiMutation((b: unknown) => ({ path: "/api/kitchen/haccp/entries", body: b }), [kk.summary, LOG_KEY]);

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
          .filter((u) => parseTemp(signed(u)) != null)
          .map((u) => ({ unitId: u.id, tempC: parseTemp(signed(u))!, correctiveAction: actions[u.id] ?? "" }));
        const r = (await save.submit({ signedName: name, readings, pest: null })) as { saved: number; outOfRange: number } | undefined;
        if (r) {
          setTemps({});
          setNeg({});
          setActions({});
          setMsg(`Zapisano ${r.saved} pomiar(y).${r.outOfRange ? ` Poza zakresem: ${r.outOfRange}.` : ""}`);
        }
      }}
    >
      {h && (
        <p className="text-sm text-muted">
          Dziś zmierzono: {h.measuredToday}/{h.units}
        </p>
      )}
      {msg && <Saved text={msg} onDone={onDone} />}
      <ul className="grid gap-3">
        {list.map((u) => {
          const v = parseTemp(signed(u));
          const out = v != null && (v < u.minC || v > u.maxC);
          return (
            <li key={u.id} className={`rounded-xl border bg-surface p-3 ${out ? "border-danger bg-danger/5" : "border-border"}`}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{u.name}</p>
                  <p className="text-xs text-muted">
                    {fmtTemp(u.minC)} … {fmtTemp(u.maxC)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`${u.name}: znak ${isNeg(u) ? "minus" : "plus"} — zmień`}
                    aria-pressed={isNeg(u)}
                    // Keep focus (and the keyboard) on the temperature field.
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setNeg({ ...neg, [u.id]: !isNeg(u) })}
                    className={`grid h-12 w-11 place-items-center rounded-lg border text-2xl font-bold ${isNeg(u) ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300" : "border-border bg-surface-2 text-muted"}`}
                  >
                    {isNeg(u) ? "−" : "+"}
                  </button>
                  <input
                    aria-label={`${u.name}: temperatura °C`}
                    data-step=""
                    enterKeyHint="next"
                    aria-invalid={v === undefined || out || undefined}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="°C"
                    value={temps[u.id] ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      // A typed "-" (Android keyboards have one) flips the sign instead.
                      if (/[-−]/.test(val)) setNeg({ ...neg, [u.id]: !isNeg(u) });
                      setTemps({ ...temps, [u.id]: val.replace(/[-−+]/g, "") });
                    }}
                    className="h-12 w-20 rounded-lg border border-border bg-surface px-2 text-center text-lg font-bold tabular-nums aria-[invalid=true]:border-danger aria-[invalid=true]:text-danger"
                  />
                  <span className="text-sm text-muted">°C</span>
                </div>
              </div>
              {out && (
                <div className="mt-3">
                  <Field label="Poza zakresem — działanie korygujące" hint="Np. przeniesiono produkty, wezwano serwis, ponowny pomiar o …">
                    {(p) => <Textarea {...p} rows={2} required maxLength={2000} value={actions[u.id] ?? ""} onChange={(e) => setActions({ ...actions, [u.id]: e.target.value })} />}
                  </Field>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">Przycisk −/+ zmienia znak. Zamrażarki mają od razu minus.</p>
      <NameField value={name} onChange={setName} error={save.fieldErrors?.signedName} />
      <SubmitRow pending={save.isPending} error={save.fieldErrors?.signedName ? null : save.error}>
        Zapisz temperatury
      </SubmitRow>
    </form>
  );
}

/* ------------------------------ pests ------------------------------- */

function PestForm({ onDone }: { onDone: () => void }) {
  const summary = useKitchenSummary();
  const [name, setName] = useSignedName();
  const [found, setFound] = useState(false);
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const save = useApiMutation((b: unknown) => ({ path: "/api/kitchen/haccp/entries", body: b }), [kk.summary, LOG_KEY]);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await save.submit({ signedName: name, readings: [], pest: { found, notes, action } });
        if (r) {
          setFound(false);
          setNotes("");
          setAction("");
          setMsg("Zapisano kontrolę szkodników.");
        }
      }}
    >
      {summary.data && <p className="text-sm text-muted">Dziś: {summary.data.haccp.pestCheckedToday ? "sprawdzone ✓" : "jeszcze nie sprawdzone"}</p>}
      {msg && <Saved text={msg} onDone={onDone} />}
      <Card title="Obecność szkodników">
        <fieldset className="grid gap-1">
          <legend className="sr-only">Wynik kontroli</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" name="pest" className="size-5 accent-[var(--color-accent)]" checked={!found} onChange={() => setFound(false)} />
            Brak
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" name="pest" className="size-5 accent-[var(--color-accent)]" checked={found} onChange={() => setFound(true)} />
            Zauważono szkodniki lub ślady
          </label>
        </fieldset>
        {found && (
          <div className="mt-2 grid gap-3">
            <Field label="Co i gdzie zauważono" error={save.fieldErrors?.["pest.notes"]}>
              {(p) => <Textarea {...p} rows={2} required maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
            <Field label="Podjęte działania" hint="Np. zabezpieczono żywność, powiadomiono kierownika i firmę DDD.">
              {(p) => <Textarea {...p} rows={2} maxLength={2000} value={action} onChange={(e) => setAction(e.target.value)} />}
            </Field>
          </div>
        )}
      </Card>
      <NameField value={name} onChange={setName} error={save.fieldErrors?.signedName} />
      <SubmitRow pending={save.isPending} error={save.fieldErrors ? null : save.error}>
        Zapisz kontrolę
      </SubmitRow>
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
    queryFn: () => apiFetch<{ temperatures: TemperatureRow[]; pests: PestRow[]; cleaning: CleaningRow[] }>(`/api/kitchen/haccp/log?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
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
            <h3 className="mb-2 font-semibold">Sprzątanie i czyszczenie ({q.data.cleaning.length})</h3>
            {q.data.cleaning.length === 0 ? (
              <EmptyState title="Brak wpisów sprzątania w tym miesiącu" />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-surface print:overflow-visible print:border-0">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">Data i godzina</th>
                      <th className="px-3 py-2">Zadanie</th>
                      <th className="px-3 py-2">Uwagi</th>
                      <th className="px-3 py-2">Kto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {q.data.cleaning.map((c) => (
                      <tr key={c.id}>
                        <td className="whitespace-nowrap px-3 py-2">{fmtDateTime(c.doneAt)}</td>
                        <td className="px-3 py-2">{c.taskLabel}</td>
                        <td className="px-3 py-2">{c.notes || "—"}</td>
                        <td className="px-3 py-2 text-muted">{c.authorName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
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
          <Field label="Min °C">{(p) => <Input {...p} inputMode="text" required value={form.minC} onChange={(e) => setForm({ ...form, minC: e.target.value })} />}</Field>
          <Field label="Max °C" error={add.fieldErrors?.maxC}>
            {(p) => <Input {...p} inputMode="text" required value={form.maxC} onChange={(e) => setForm({ ...form, maxC: e.target.value })} />}
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
      <Input aria-label={`${unit.name}: min °C`} inputMode="text" value={v.minC} onChange={(e) => setV({ ...v, minC: e.target.value })} />
      <Input aria-label={`${unit.name}: max °C`} inputMode="text" value={v.maxC} onChange={(e) => setV({ ...v, maxC: e.target.value })} />
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
