import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import type { HandoverRow } from "../../../shared/kitchen";
import { Alert, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useMe } from "../../lib/queries";
import { InstallBanner } from "../install/InstallPage";
import { fmtDate, kk } from "./common";
import { HandoverCard } from "./HandoverPage";
import { KitchenTiles } from "./KitchenPage";

/** Home screen: the latest shift handover first — "what do I start with?". */
export function StartPage() {
  const me = useMe();
  const q = useQuery({ queryKey: kk.handovers, queryFn: async () => (await apiFetch<{ handovers: HandoverRow[] }>("/api/kitchen/handovers")).handovers });
  const name = me.data ? (me.data.profile.displayName ?? me.data.user.name).split(" ")[0] : "";
  const today = new Date().toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw", weekday: "long", day: "numeric", month: "long" });
  const latest = q.data?.[0];

  return (
    <>
      <header className="mb-4">
        <p className="text-sm capitalize text-muted">{today}</p>
        <h1 className="text-2xl font-bold tracking-tight">Cześć{name ? `, ${name}` : ""}</h1>
      </header>
      <InstallBanner />

      <section aria-labelledby="start-h" className="mb-6">
        <h2 id="start-h" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Od czego zacząć
        </h2>
        {q.isPending && <Spinner label="Ładowanie protokołu…" />}
        {q.isError && <Alert tone="error">Nie udało się wczytać protokołu.</Alert>}
        {q.data && !latest && (
          <div className="rounded-xl border border-dashed border-border p-5 text-center">
            <p className="font-medium">Nie ma jeszcze żadnego protokołu przekazania zmiany.</p>
            <p className="mt-1 text-sm text-muted">Na koniec zmiany zapisz, co trzeba uzupełnić, braki w karcie i awarie.</p>
          </div>
        )}
        {latest && <HandoverCard h={latest} highlight title={`Przekazanie z ${fmtDate(latest.shiftDate)}`} />}
        <Link
          to="/kuchnia/zmiana"
          className="mt-1 flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90 sm:w-auto sm:justify-self-start"
        >
          Przekaż zmianę — nowy protokół
        </Link>
      </section>

      <section aria-labelledby="today-h">
        <h2 id="today-h" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Kuchnia dziś
        </h2>
        <KitchenTiles compact />
      </section>
    </>
  );
}
