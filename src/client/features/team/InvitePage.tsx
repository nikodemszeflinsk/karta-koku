import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { ROLE_LABELS, type RoleKey } from "../../../shared/roles";
import { Alert, Button, Field, Input, Spinner } from "../../components/ui";
import { ApiRequestError, apiFetch } from "../../lib/api";
import { authClient, authErrorMessage } from "../../lib/auth-client";
import { qk } from "../../lib/queries";
import { AuthShell } from "../auth/LoginPage";

export function InvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => apiFetch<{ email: string; roleKey: RoleKey; locationName: string | null }>(`/api/invitations/${encodeURIComponent(token)}`),
    retry: false,
  });
  const [name, setName] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});
    if (p1 !== p2) return setErrors({ password2: "Hasła nie są identyczne" });
    setPending(true);
    try {
      const res = await apiFetch<{ email: string }>("/api/invitations/accept", { body: { token, name, password: p1 } });
      const { error: err } = await authClient.signIn.email({ email: res.email, password: p1 });
      if (err) throw new Error(authErrorMessage(err));
      await qc.resetQueries({ queryKey: qk.me });
      navigate("/ustawienia", { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.details) setErrors(err.details as Record<string, string>);
      setError(err instanceof Error ? err.message : "Nie udało się utworzyć konta.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="Zaproszenie" subtitle="Utwórz konto w Sushi Chef Lab.">
      {info.isPending && <Spinner label="Sprawdzanie zaproszenia…" />}
      {info.isError && <Alert tone="error">{info.error.message}</Alert>}
      {info.data && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Alert>
            Konto: <strong>{info.data.email}</strong> · rola: {ROLE_LABELS[info.data.roleKey]}
            {info.data.locationName && ` · lokal: ${info.data.locationName}`}
          </Alert>
          <Field label="Imię" error={errors.name}>
            {(p) => <Input {...p} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Hasło" error={errors.password} hint="Min. 12 znaków. Później możesz dodać klucz dostępu (passkey).">
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />}
          </Field>
          <Field label="Powtórz hasło" error={errors.password2}>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />}
          </Field>
          {error && !Object.keys(errors).length && <Alert tone="error">{error}</Alert>}
          <Button type="submit" loading={pending}>
            Utwórz konto
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
