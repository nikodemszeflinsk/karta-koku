import { useEffect, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { highestRole, ROLE_LABELS } from "../../../shared/roles";
import { Alert, EmptyState, Spinner } from "../../components/ui";
import { applyTheme } from "../../lib/theme";
import { useMe } from "../../lib/queries";

const NAV = [
  { to: "/", label: "Pulpit", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { to: "/akademia", label: "Akademia", icon: "M4 19.5V6a2 2 0 012-2h12v15H6a2 2 0 00-2 2zm0 0A2 2 0 006 22h12" },
  { to: "/ustawienia", label: "Ustawienia", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2-1.2L14.5 2h-5l-.4 2.6a7.6 7.6 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 002 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" },
] as const;

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
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

  return (
    <div className="min-h-dvh md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">
        Przejdź do treści
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
        <Link to="/" className="flex items-center gap-2 px-5 py-5 text-lg font-bold tracking-tight">
          <img src="/favicon.svg" alt="" className="size-7" />
          Sushi Chef Lab
        </Link>
        <nav aria-label="Główna nawigacja" className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${isActive ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`
              }
            >
              <Icon d={item.icon} />
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

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-8">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Główna nawigacja"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? "text-accent" : "text-muted"}`
            }
          >
            <Icon d={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <EmptyState title="Nie ma takiej strony">
      <Link
        to="/"
        className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-border bg-surface-2 px-4 text-sm font-semibold text-fg"
      >
        Wróć do pulpitu
      </Link>
    </EmptyState>
  );
}
