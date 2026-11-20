import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { KitchenSummary } from "../../../shared/kitchen";
import { apiFetch } from "../../lib/api";
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

/** Page heading with the coloured kitchen chip and a link back to the hub. */
export function KitchenHeader({ title, subtitle, icon, actions }: { title: string; subtitle?: string; icon: IconName; actions?: ReactNode }) {
  return (
    <header className="mb-5 print:mb-2">
      <Link to="/kuchnia" className="text-sm text-muted hover:text-fg print:hidden">
        ← Kuchnia
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className={`grid size-11 place-items-center rounded-xl ${TONE.kitchen} print:hidden`}>
          <Icon name={icon} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </header>
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
      <span className="min-w-0 flex-1 truncate text-right text-xs text-muted">{active.getAttribute("aria-label")}</span>
      <button type="button" className={`${btn} text-accent`} onPointerDown={keep} onMouseDown={keep} onClick={() => active.blur()}>
        Gotowe
      </button>
    </div>
  );
}
