import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { Alert, Button, Field, Input, Spinner } from "../../components/ui";
import { authClient, authErrorMessage } from "../../lib/auth-client";
import { qk, useMe, useSetupStatus } from "../../lib/queries";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-10" />
          <div>
            <p className="text-lg font-bold tracking-tight">Sushi Chef Lab</p>
            <p className="text-xs text-muted">Prywatna akademia kulinarna</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function LoginPage() {
  const me = useMe();
  const setup = useSetupStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"password" | "passkey" | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (me.data) return <Navigate to={from} replace />;
  if (me.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Ładowanie…" />
      </div>
    );
  }

  async function finish() {
    await queryClient.resetQueries({ queryKey: qk.me });
    navigate(from, { replace: true });
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending("password");
    const { error: err } = await authClient.signIn.email({ email, password });
    setPending(null);
    if (err) return setError(authErrorMessage(err));
    await finish();
  }

  async function onPasskey() {
    setError(null);
    setPending("passkey");
    const res = await authClient.signIn.passkey();
    setPending(null);
    if (res?.error) {
      return setError(
        "code" in res.error && res.error.code === "AUTH_CANCELLED" ? "Anulowano logowanie kluczem dostępu." : authErrorMessage(res.error),
      );
    }
    await finish();
  }

  return (
    <AuthShell title="Zaloguj się">
      {setup.data?.needsSetup && (
        <div className="mb-4">
          <Alert>
            Aplikacja nie ma jeszcze konta właściciela.{" "}
            <Link to="/setup" className="font-semibold text-accent underline">
              Skonfiguruj ją
            </Link>
            .
          </Alert>
        </div>
      )}
      <form onSubmit={onPassword} className="flex flex-col gap-4" noValidate>
        <Field label="E-mail">
          {(p) => (
            <Input {...p} type="email" autoComplete="username webauthn" value={email} onChange={(e) => setEmail(e.target.value)} required />
          )}
        </Field>
        <Field label="Hasło">
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password webauthn"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={pending === "password"} disabled={pending !== null || !email || !password}>
          Zaloguj
        </Button>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        lub
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button variant="secondary" className="w-full" onClick={onPasskey} loading={pending === "passkey"} disabled={pending !== null}>
        Zaloguj kluczem dostępu (Face ID / odcisk palca)
      </Button>
      <p className="mt-4 text-xs text-muted">
        Rejestracja jest wyłączona. Konto zakłada właściciel lub przez zaproszenie.
      </p>
    </AuthShell>
  );
}
