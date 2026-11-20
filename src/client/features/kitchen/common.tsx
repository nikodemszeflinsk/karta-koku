import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { KitchenSummary } from "../../../shared/kitchen";
import { apiFetch } from "../../lib/api";
import { Field, Input } from "../../components/ui";
import { Icon, TONE, type IconName } from "../layout/nav";

export const kk = {
  summary: ["kitchen", "summary"] as const,
  stock: (list: string) => ["kitchen", "stock", list] as const,
  stockHistory: (list: string) => ["kitchen", "stock", list, "history"] as const,
  handovers: ["kitchen", "handovers"] as const,
  checks: ["kitchen", "handover-checks"] as const,
  units: ["kitchen", "haccp", "units"] as const,
  log: (from: string, to: string) => ["kitchen", "haccp", "log", from, to] as const,
};

export function useKitchenSummary() {
  return useQuery({ queryKey: kk.summary, queryFn: () => apiFetch<KitchenSummary>("/api/kitchen/summary") });
}

/** "6,5" → 6.5; empty → null; invalid → undefined. */
export function parseQty(s: string): number | null | undefined {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
export function fmtQty(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return String(Math.round(n * 1000) / 1000).replace(".", ",");
}
export function fmtTemp(n: number): string {
  return `${String(n).replace(".", ",")} °C`;
}
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
};

/** Compact page heading: back arrow, title, actions on one line. */
export function KitchenHeader({ title, subtitle, icon, actions, backTo = "/" }: { title: string; subtitle?: string; icon: IconName; actions?: ReactNode; backTo?: string }) {
  return (
    <header className="mb-3 print:mb-2">
      <div className="flex items-center gap-2">
        <Link to={backTo} aria-label="Wróć" className="-ml-2 grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg print:hidden">
          <span aria-hidden="true" className="text-xl leading-none">←</span>
        </Link>
        <span className={`hidden size-8 shrink-0 place-items-center rounded-lg sm:grid ${TONE.kitchen} print:hidden`}>
          <Icon name={icon} className="size-4" />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight">{title}</h1>
        {actions}
      </div>
      {subtitle && <p className="mt-0.5 hidden text-sm text-muted sm:block">{subtitle}</p>}
    </header>
  );
}

const NAME_KEY = "scl-signed-name";
function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
function rememberName(v: string) {
  try {
    localStorage.setItem(NAME_KEY, v.trim());
  } catch {
    /* storage unavailable: the field just starts empty next time */
  }
}

/** First name of the person filling in the record; remembered on this device. */
export function useSignedName(): [string, (v: string) => void] {
  const [name, setName] = useState(readName);
  return [
    name,
    (v: string) => {
      setName(v);
      rememberName(v);
    },
  ];
}

export function NameField({ value, onChange, error, label = "Twoje imię" }: { value: string; onChange: (v: string) => void; error?: string | undefined; label?: string }) {
  return (
    <Field label={label} error={error}>
      {(p) => <Input {...p} required autoComplete="given-name" maxLength={60} value={value} onChange={(e) => onChange(e.target.value)} className="sm:w-72" />}
    </Field>
  );
}

export async function copyOrShare(title: string, text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title, text });
      return "shared";
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return "failed";
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

/* ---------------------------------------------------------------------------
 * Field stepper: on phones, a bar docked above the on-screen keyboard with
 * previous / next buttons, so you can move between quantity fields without
 * closing the keyboard. Inputs opt in with `data-step`. Enter also moves on.
 * ------------------------------------------------------------------------- */

function stepFields(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-step]")].filter((el) => el.offsetParent !== null && !(el as HTMLInputElement).disabled);
}

function focusField(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  if (el instanceof HTMLInputElement) el.select();
}

export function StepNav() {
  const [active, setActive] = useState<HTMLElement | null>(null);
  const [bottom, setBottom] = useState<number | null>(null);
  const [coarse] = useState(() => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);

  useEffect(() => {
    const pick = () => {
      const a = document.activeElement as HTMLElement | null;
      setActive(a?.matches?.("[data-step]") ? a : null);
    };
    const onOut = () => setTimeout(pick, 0);
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "Enter" || !(t instanceof HTMLInputElement) || !t.matches("[data-step]")) return;
      e.preventDefault();
      const f = stepFields();
      const next = f[f.indexOf(t) + 1];
      if (next) focusField(next);
      else t.blur();
    };
    document.addEventListener("focusin", pick);
    document.addEventListener("focusout", onOut);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("focusin", pick);
      document.removeEventListener("focusout", onOut);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!active || !coarse) return;
    const vv = window.visualViewport;
    // Bottom edge of the visible area (above the keyboard), in layout-viewport coordinates.
    const place = () => setBottom(vv ? vv.offsetTop + vv.height : window.innerHeight);
    place();
    vv?.addEventListener("resize", place);
    vv?.addEventListener("scroll", place);
    return () => {
      vv?.removeEventListener("resize", place);
      vv?.removeEventListener("scroll", place);
    };
  }, [active, coarse]);

  if (!coarse || !active || bottom === null) return null;
  const f = stepFields();
  const i = f.indexOf(active);
  // preventDefault on pointerdown keeps focus (and the keyboard) on the current field.
  const keep = (e: { preventDefault: () => void }) => e.preventDefault();
  const btn = "min-h-11 rounded-lg px-3 text-sm font-semibold disabled:opacity-40";
  return (
    <div
      role="toolbar"
      aria-label="Przechodzenie między polami"
      className="fixed inset-x-0 z-50 flex items-center gap-2 border-t border-border bg-surface px-2 py-1.5 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
      style={{ top: bottom, transform: "translateY(-100%)" }}
    >
      <button type="button" className={`${btn} bg-surface-2`} disabled={i <= 0} onPointerDown={keep} onMouseDown={keep} onClick={() => f[i - 1] && focusField(f[i - 1]!)}>
        ↑ Poprz.
      </button>
      <button type="button" className={`${btn} bg-accent text-accent-fg`} disabled={i < 0 || i >= f.length - 1} onPointerDown={keep} onMouseDown={keep} onClick={() => f[i + 1] && focusField(f[i + 1]!)}>
        Następne ↓
      </button>
      <span className="flex-1" aria-hidden="true" />
      <button type="button" className={`${btn} text-accent`} onPointerDown={keep} onMouseDown={keep} onClick={() => active.blur()}>
        Gotowe
      </button>
    </div>
  );
}
