import { Link } from "react-router";
import { SHIFT_LABELS, type KitchenSummary } from "../../../shared/kitchen";
import { PageHeader } from "../../components/ui";
import { Icon, NAV_GROUPS, TONE } from "../layout/nav";
import { fmtDate, useKitchenSummary } from "./common";

type Status = { text: string; tone: "ok" | "warn" | "muted" };

function statusFor(to: string, s: KitchenSummary | undefined): Status | null {
  if (!s) return null;
  switch (to) {
    case "/kuchnia/zakupy":
      if (s.shopping.items === 0) return { text: "Brak pozycji — dodaj produkty", tone: "muted" };
      return s.shopping.toBuy > 0 ? { text: `Do kupienia: ${s.shopping.toBuy}`, tone: "warn" } : { text: "Nic do kupienia", tone: "ok" };
    case "/kuchnia/hurtownia":
      if (s.wholesale.items === 0) return { text: "Brak pozycji — dodaj produkty", tone: "muted" };
      return s.wholesale.toOrder > 0 ? { text: `Do zamówienia: ${s.wholesale.toOrder}`, tone: "warn" } : { text: "Stany uzupełnione", tone: "ok" };
    case "/kuchnia/zmiana": {
      const l = s.handover.last;
      if (!l) return { text: "Brak protokołów", tone: "muted" };
      const base = `${fmtDate(l.shiftDate)} · ${SHIFT_LABELS[l.shift].replace("Zmiana ", "")}`;
      if (l.hasFailure) return { text: `${base} · awaria!`, tone: "warn" };
      return l.acknowledged ? { text: `${base} · przejęta`, tone: "ok" } : { text: `${base} · czeka na przejęcie`, tone: "warn" };
    }
    case "/kuchnia/haccp": {
      const h = s.haccp;
      if (h.units === 0) return { text: "Dodaj lodówki i zamrażarki", tone: "muted" };
      if (h.outOfRangeToday > 0) return { text: `Poza zakresem dziś: ${h.outOfRangeToday}`, tone: "warn" };
      const done = h.measuredToday >= h.units && h.pestCheckedToday;
      return { text: `Dziś: ${h.measuredToday}/${h.units} pomiarów${h.pestCheckedToday ? ", szkodniki ✓" : ""}`, tone: done ? "ok" : "warn" };
    }
  }
  return null;
}

const DOT = { ok: "bg-ok", warn: "bg-warn", muted: "bg-border" };

export function KitchenPage() {
  const summary = useKitchenSummary();
  const kitchen = NAV_GROUPS.find((g) => g.key === "kitchen")!;
  return (
    <>
      <PageHeader title="Kuchnia" subtitle="Zakupy, zamówienia, przekazanie zmiany i ewidencja HACCP" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {kitchen.items.map((item) => {
          const st = statusFor(item.to, summary.data);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className="group flex h-full min-h-36 flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-teal-500/60 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${TONE.kitchen}`}>
                    <Icon name={item.icon} className="size-7" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-tight">{item.label}</h2>
                    <p className="mt-0.5 text-sm text-muted">{item.hint}</p>
                  </div>
                  <span aria-hidden="true" className="ml-auto text-xl text-muted transition group-hover:translate-x-0.5 group-hover:text-fg">
                    ›
                  </span>
                </div>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span aria-hidden="true" className={`size-2.5 rounded-full ${st ? DOT[st.tone] : "animate-pulse bg-border"}`} />
                  {st?.text ?? "…"}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
