import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { ownerSetupSchema } from "../../../shared/schemas";
import { Alert, Button, Field, Input, Spinner } from "../../components/ui";
import { ApiRequestError, apiFetch } from "../../lib/api";
import { authClient, authErrorMessage } from "../../lib/auth-client";
import { qk, useSetupStatus } from "../../lib/queries";
import { AuthShell } from "./LoginPage";

type Errors = Partial<Record<"token" | "name" | "email" | "password" | "password2", string>>;

export function SetupPage() {
  const status = useSetupStatus();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ token: "", name: "", email: "", password: "", password2: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Ładowanie…" />
      </div>
    );
  }
  if (status.data && !status.data.needsSetup) return <Navigate to="/login" replace />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = ownerSetupSchema.safeParse(form);
    const next: Errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof Errors;
        next[k] ??= issue.message;
      }
    }
    if (form.password !== form.password2) next.password2 = "Hasła nie są identyczne";
    setErrors(next);
    if (!parsed.success || next.password2) return;

    setPending(true);
    try {
      await apiFetch("/api/setup/owner", { body: parsed.data });
      const { error } = await authClient.signIn.email({ email: parsed.data.email, password: parsed.data.password });
      if (error) throw new Error(authErrorMessage(error));
      await queryClient.resetQueries({ queryKey: qk.me });
      navigate("/ustawienia", { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.details) setErrors(err.details as Errors);
      setFormError(err instanceof Error ? err.message : "Nie udało się utworzyć konta.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="Konfiguracja właściciela" subtitle="Jednorazowe utworzenie konta właściciela aplikacji.">
      {!status.data?.setupEnabled ? (
        <Alert tone="error">Brak tokenu konfiguracji po stronie serwera (sekret SETUP_TOKEN).</Alert>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Token konfiguracji" error={errors.token} hint="Wartość SETUP_TOKEN z pliku .dev.vars lub sekretu serwera.">
            {(p) => <Input {...p} type="password" autoComplete="off" value={form.token} onChange={set("token")} />}
          </Field>
          <Field label="Imię" error={errors.name}>
            {(p) => <Input {...p} autoComplete="name" value={form.name} onChange={set("name")} />}
          </Field>
          <Field label="E-mail" error={errors.email}>
            {(p) => <Input {...p} type="email" autoComplete="username" value={form.email} onChange={set("email")} />}
          </Field>
          <Field label="Hasło" error={errors.password} hint="Min. 12 znaków. Najlepiej kilka losowych słów.">
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />}
          </Field>
          <Field label="Powtórz hasło" error={errors.password2}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password2} onChange={set("password2")} />}
          </Field>
          {formError && <Alert tone="error">{formError}</Alert>}
          <Button type="submit" loading={pending}>
            Utwórz konto właściciela
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
