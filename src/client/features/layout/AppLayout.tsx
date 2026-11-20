import { useEffect, type ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router";
import { EDUCATION_ENABLED, HOME_LABEL, Icon, isActive, MOBILE_NAV, NAV_GROUPS, TONE, type NavGroup, type NavItem, type Tone } from "./nav";
import { highestRole, ROLE_LABELS } from "../../../shared/roles";
import { Alert, EmptyState, PageHeader, Spinner } from "../../components/ui";
import { applyTheme, storedTheme, useLocalTheme } from "../../lib/theme";
import { useMe } from "../../lib/queries";

function useNavGroups(): NavGroup[] {
  const me = useMe();
  const staff = Boolean(me.data?.roles.some((r) => r.role === "owner" || r.role === "admin" || r.role === "trainer"));
  const guest = Boolean(me.data?.guest);
  // The shared no-login account sees only the kitchen and the home-screen helper.
  const guestHidden = new Set(["/zespol", "/ustawienia"]);
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => (!n.staff || staff) && !(guest && guestHidden.has(n.to))) })).filter((g) => g.items.length > 0);
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();

  useEffect(() => {
    applyTheme(storedTheme());
  }, []);

  if (me.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Ładowanie…" />
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Alert tone="error">Nie udało się połączyć z serwerem. Odśwież stronę.</Alert>
      </div>
    );
  }
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function SidebarLink({ item, tone }: { item: NavItem; tone: Tone }) {
  const { pathname } = useLocation();
  const active = isActive(pathname, item.to);
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm font-medium transition ${active ? "bg-accent-soft text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
    >
      <span className={`grid size-7 place-items-center rounded-md ${TONE[tone]}`}>
        <Icon name={item.icon} className="size-4" />
      </span>
      {item.label}
      {active && <span aria-hidden="true" className="ml-auto h-4 w-1 rounded-full bg-accent" />}
    </Link>
  );
}

export function AppLayout() {
  const me = useMe();
  const role = me.data ? highestRole(me.data.roles.map((r) => r.role)) : null;
  const { pathname } = useLocation();
  const groups = useNavGroups();
  const name = me.data ? (me.data.profile.displayName ?? me.data.user.name) : "";
  const onMain = MOBILE_NAV.some((n) => n.to !== "/wiecej" && isActive(pathname, n.to));

  return (
    <div className="min-h-dvh md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">
        Przejdź do treści
      </a>

      <aside className="hidden w-64 shrink-0 print:!hidden border-r border-border bg-surface md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
        <Link to="/" className="flex items-center gap-2.5 px-5 pb-3 pt-5 text-lg font-bold tracking-tight">
          <img src="/favicon.svg" alt="" className="size-8" />
          Sushi Chef Lab
        </Link>
        {EDUCATION_ENABLED && (
        <div className="px-3 pb-2">
          <Link
            to="/szukaj"
            className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-bg px-3 text-sm text-muted hover:border-accent hover:text-fg"
          >
            <Icon name="search" className="size-4" />
            Szukaj w aplikacji…
          </Link>
        </div>
        )}
        <nav aria-label="Główna nawigacja" className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4">
          <div>
            <SidebarLink item={{ to: "/", label: HOME_LABEL, icon: "home" }} tone="account" />
          </div>
          {groups.map((g) => (
            <div key={g.key}>
              <Link
                to={g.key === "kitchen" ? "/kuchnia" : g.items[0]!.to}
                className="mb-1 block px-2 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-fg"
              >
                {g.label}
              </Link>
              <div className="flex flex-col gap-0.5">
                {g.items.map((item) => (
                  <SidebarLink key={item.to} item={item} tone={g.tone} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        {me.data?.guest && (
          <Link to="/login" className="flex items-center gap-3 border-t border-border px-4 py-3 hover:bg-surface-2">
            <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-sm font-bold text-muted">G</span>
            <span className="min-w-0 text-xs text-muted">
              <span className="block text-sm font-medium text-fg">Bez logowania</span>
              Zaloguj się
            </span>
          </Link>
        )}
        {me.data && !me.data.guest && (
          <Link to="/ustawienia" className="flex items-center gap-3 border-t border-border px-4 py-3 hover:bg-surface-2">
            <span className="grid size-9 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg">{initials(name)}</span>
            <span className="min-w-0 text-xs text-muted">
              <span className="block truncate text-sm font-medium text-fg">{name}</span>
              {role && ROLE_LABELS[role]}
            </span>
          </Link>
        )}
      </aside>


      <main id="main" className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-8 print:max-w-none print:p-0">
        <Outlet />
      </main>

      <nav aria-label="Nawigacja dolna" className="fixed inset-x-0 bottom-0 z-40 grid print:hidden grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {MOBILE_NAV.map((item) => {
          const active = item.to === "/wiecej" ? !onMain : isActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}
            >
              <span className={`grid h-7 w-12 place-items-center rounded-full transition ${active ? "bg-accent-soft" : ""}`}>
                <Icon name={item.icon} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Tile grid used by the mobile "Menu" page. */
export function MorePage() {
  const groups = useNavGroups();
  const guest = Boolean(useMe().data?.guest);
  return (
    <>
      <PageHeader title="Menu" subtitle="Wszystkie sekcje aplikacji" />
      {guest && (
        <p className="mb-4 text-sm text-muted">
          Tryb bez logowania (prototyp).{" "}
          <Link to="/login" className="font-semibold text-accent underline">
            Zaloguj się
          </Link>
        </p>
      )}
      <div className="grid gap-6">
        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`grp-${g.key}`}>
            <h2 id={`grp-${g.key}`} className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              {g.label}
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {g.items.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} className="flex h-full min-h-20 flex-col gap-2 rounded-xl border border-border bg-surface p-3 transition hover:border-accent hover:shadow-sm">
                    <span className={`grid size-9 place-items-center rounded-lg ${TONE[g.tone]}`}>
                      <Icon name={n.icon} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold leading-tight">{n.label}</span>
                      {n.hint && <span className="block text-xs text-muted">{n.hint}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <ThemeSwitch />
      </div>
    </>
  );
}

function ThemeSwitch() {
  const [theme, setTheme] = useLocalTheme();
  return (
    <section aria-labelledby="grp-theme">
      <h2 id="grp-theme" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Wygląd
      </h2>
      <div role="radiogroup" aria-label="Motyw" className="grid grid-cols-2 gap-2">
        {(["light", "dark"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={theme === t}
            onClick={() => setTheme(t)}
            className={`min-h-12 rounded-xl border text-sm font-semibold ${theme === t ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-muted"}`}
          >
            {t === "light" ? "☀ Jasny" : "☾ Ciemny"}
          </button>
        ))}
      </div>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <EmptyState title="Nie ma takiej strony">
      <Link to="/" className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-border bg-surface-2 px-4 text-sm font-semibold text-fg">
        Wróć do pulpitu
      </Link>
    </EmptyState>
  );
}
