import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
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
