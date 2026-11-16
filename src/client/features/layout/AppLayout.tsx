import { useEffect, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { highestRole, ROLE_LABELS } from "../../../shared/roles";
import { Alert, EmptyState, PageHeader, Spinner } from "../../components/ui";
import { applyTheme } from "../../lib/theme";
import { useMe } from "../../lib/queries";

const ICONS = {
  home: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10",
  book: "M4 19.5V6a2 2 0 012-2h12v15H6a2 2 0 00-2 2zm0 0A2 2 0 006 22h12",
  flask: "M9 3h6M10 3v6L4.5 18.5A2 2 0 006.2 21.5h11.6a2 2 0 001.7-3L14 9V3M7 15h10",
  menu: "M4 6h16M4 12h16M4 18h10",
  chef: "M6 13.9V20h12v-6.1A4 4 0 0017 6a5 5 0 00-10 0 4 4 0 00-1 7.9zM6 17h12",
  note: "M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.3-4.3",
  flame: "M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z",
  link: "M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2-1.2L14.5 2h-5l-.4 2.6a7.6 7.6 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 002 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  chat: "M21 12a8 8 0 01-11.6 7.1L4 20l1.1-4.6A8 8 0 1121 12zM8 10h8M8 14h5",
} as const;

interface NavItem {
  to: string;
  label: string;
  icon: keyof typeof ICONS;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Pulpit", icon: "home" },
  { to: "/trener", label: "Trener AI", icon: "chat" },
  { to: "/akademia", label: "Akademia", icon: "book" },
  { to: "/skladniki", label: "Składniki", icon: "flask" },
  { to: "/karta", label: "Karta KOKU", icon: "menu" },
  { to: "/techniki", label: "Techniki", icon: "flame" },
  { to: "/receptury", label: "Receptury", icon: "chef" },
  { to: "/notatnik", label: "Notatnik", icon: "note" },
  { to: "/szukaj", label: "Szukaj", icon: "search" },
  { to: "/zrodla", label: "Źródła", icon: "link" },
  { to: "/ustawienia", label: "Ustawienia", icon: "gear" },
];

const MOBILE_NAV: NavItem[] = [
  { to: "/", label: "Pulpit", icon: "home" },
  { to: "/trener", label: "Trener", icon: "chat" },
  { to: "/skladniki", label: "Składniki", icon: "flask" },
  { to: "/karta", label: "Karta", icon: "menu" },
  { to: "/wiecej", label: "Więcej", icon: "dots" },
];

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();

  useEffect(() => {
    if (me.data) applyTheme(me.data.profile.theme);
  }, [me.data]);

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

export function AppLayout() {
  const me = useMe();
  const role = me.data ? highestRole(me.data.roles.map((r) => r.role)) : null;
  const location = useLocation();
  const inMore = !MOBILE_NAV.some((n) => n.to !== "/wiecej" && (n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to)));

  return (
    <div className="min-h-dvh md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">
        Przejdź do treści
      </a>

      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
        <Link to="/" className="flex items-center gap-2 px-5 py-5 text-lg font-bold tracking-tight">
          <img src="/favicon.svg" alt="" className="size-7" />
          Sushi Chef Lab
        </Link>
        <nav aria-label="Główna nawigacja" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${isActive ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        {me.data && (
          <div className="border-t border-border px-5 py-4 text-xs text-muted">
            <p className="truncate font-medium text-fg">{me.data.profile.displayName ?? me.data.user.name}</p>
            {role && <p>{ROLE_LABELS[role]}</p>}
          </div>
        )}
      </aside>

      <main id="main" className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-8">
        <Outlet />
      </main>

      <nav aria-label="Główna nawigacja" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive || (item.to === "/wiecej" && inMore) ? "text-accent" : "text-muted"}`
            }
          >
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function MorePage() {
  const extra = NAV.filter((n) => !MOBILE_NAV.some((m) => m.to === n.to));
  return (
    <>
      <PageHeader title="Więcej" />
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {extra.map((n) => (
          <li key={n.to}>
            <Link to={n.to} className="flex min-h-14 items-center gap-3 px-4 text-sm font-medium hover:bg-surface-2">
              <Icon name={n.icon} />
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
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
