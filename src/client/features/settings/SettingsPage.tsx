import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { highestRole, ROLE_LABELS } from "../../../shared/roles";
import type { MeResponse, Theme } from "../../../shared/schemas";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "../../components/ui";
import { ApiRequestError, apiFetch } from "../../lib/api";
import { authClient, authErrorMessage } from "../../lib/auth-client";
import { qk, useLevels, useMe } from "../../lib/queries";
import { useAiStatus } from "../../lib/ai";
import { EDUCATION_ENABLED } from "../layout/nav";

type ProfilePatch = Partial<{ displayName: string; position: string | null; targetLevelKey: string | null; theme: Theme }>;

function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => apiFetch<{ profile: MeResponse["profile"] }>("/api/me/profile", { method: "PATCH", body: patch }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: qk.me }), qc.invalidateQueries({ queryKey: qk.dashboard })]);
    },
  });
}

function ProfileCard({ me }: { me: MeResponse }) {
  const levels = useLevels();
  const update = useUpdateProfile();
  const [displayName, setDisplayName] = useState(me.profile.displayName ?? me.user.name);
  const [position, setPosition] = useState(me.profile.position ?? "");
  const [targetLevelKey, setTargetLevelKey] = useState(me.profile.targetLevelKey ?? "");
  const [saved, setSaved] = useState(false);

  const fieldErrors = update.error instanceof ApiRequestError ? update.error.details : undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const ok = await update
      .mutateAsync({
        displayName: displayName.trim(),
        position: position.trim() || null,
        targetLevelKey: targetLevelKey || null,
      })
      .then(
        () => true,
        () => false, // error is rendered from mutation state
      );
    setSaved(ok);
  }

  return (
    <Card title="Profil">
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Wyświetlana nazwa" error={fieldErrors?.displayName}>
          {(p) => <Input {...p} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />}
        </Field>
        <Field label="Stanowisko" error={fieldErrors?.position}>
          {(p) => <Input {...p} value={position} onChange={(e) => setPosition(e.target.value)} maxLength={80} placeholder="np. kucharz, szef zmiany" />}
        </Field>
        {EDUCATION_ENABLED && (
        <Field label="Poziom docelowy" error={fieldErrors?.targetLevelKey}>
          {(p) => (
            <Select {...p} value={targetLevelKey} onChange={(e) => setTargetLevelKey(e.target.value)} disabled={!levels.data}>
              <option value="">— nie wybrano —</option>
              {levels.data?.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        )}
        <div className="flex flex-col justify-end gap-2 sm:col-span-2 sm:flex-row sm:items-center">
          {update.isError && !fieldErrors && <Alert tone="error">{update.error.message}</Alert>}
          {saved && !update.isPending && <Alert tone="success">Zapisano.</Alert>}
          <Button type="submit" loading={update.isPending} className="sm:ml-auto">
            Zapisz profil
          </Button>
        </div>
      </form>
    </Card>
  );
}

interface PasskeyRow {
  id: string;
  name?: string | null;
  createdAt?: string | Date | null;
}

function PasskeysCard() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (error) throw new Error(authErrorMessage(error));
      return (data ?? []) as PasskeyRow[];
    },
  });
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy("add");
    const res = await authClient.passkey.addPasskey({ name: name.trim() || "Moje urządzenie" });
    setBusy(null);
    if (res?.error) {
      setMessage({ tone: "error", text: "code" in res.error && res.error.code === "AUTH_CANCELLED" ? "Anulowano dodawanie klucza." : authErrorMessage(res.error) });
      return;
    }
    setName("");
    setMessage({ tone: "success", text: "Dodano klucz dostępu. Możesz się nim logować na tym urządzeniu." });
    await qc.invalidateQueries({ queryKey: ["passkeys"] });
  }

  async function remove(id: string) {
    if (!confirm("Usunąć ten klucz dostępu? Nie będzie można się nim zalogować.")) return;
    setBusy(id);
    const { error } = await authClient.passkey.deletePasskey({ id });
    setBusy(null);
    if (error) setMessage({ tone: "error", text: authErrorMessage(error) });
    await qc.invalidateQueries({ queryKey: ["passkeys"] });
  }

  return (
    <Card title="Klucze dostępu (passkey)">
      <p className="mb-3 text-sm text-muted">
        Logowanie Face ID, odciskiem palca lub PIN-em telefonu, bez wpisywania hasła. Klucz prywatny nie opuszcza urządzenia.
      </p>
      {list.isPending && <Spinner label="Ładowanie kluczy…" />}
      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      {list.data && list.data.length === 0 && <EmptyState title="Brak kluczy dostępu" />}
      {list.data && list.data.length > 0 && (
        <ul className="mb-3 divide-y divide-border rounded-lg border border-border">
          {list.data.map((pk) => (
            <li key={pk.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{pk.name || "Klucz bez nazwy"}</p>
                {pk.createdAt && (
                  <p className="text-xs text-muted">dodano {new Date(pk.createdAt).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" })}</p>
                )}
              </div>
              <Button variant="ghost" onClick={() => remove(pk.id)} loading={busy === pk.id} aria-label={`Usuń klucz ${pk.name ?? ""}`}>
                Usuń
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Nazwa urządzenia">
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="np. iPhone" maxLength={60} />}
          </Field>
        </div>
        <Button type="submit" loading={busy === "add"} disabled={busy !== null}>
          Dodaj klucz
        </Button>
      </form>
      {message && <div className="mt-3"><Alert tone={message.tone}>{message.text}</Alert></div>}
    </Card>
  );
}

function AccountCard({ me }: { me: MeResponse }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const role = highestRole(me.roles.map((r) => r.role));

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    qc.clear();
    navigate("/login", { replace: true });
  }

  return (
    <Card title="Konto">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">E-mail</dt>
          <dd className="font-medium">{me.user.email}</dd>
        </div>
        <div>
          <dt className="text-muted">Rola</dt>
          <dd className="font-medium">{role ? ROLE_LABELS[role] : "—"}</dd>
        </div>
      </dl>
      <Button variant="secondary" className="mt-4" onClick={signOut} loading={pending}>
        Wyloguj
      </Button>
    </Card>
  );
}

function AiCard() {
  const s = useAiStatus();
  // AI is an optional add-on: show nothing unless it is actually configured.
  if (!s.data?.enabled) return null;
  const u = s.data.usage;
  return (
    <Card title="Trener AI">
      {s.data.enabled ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Model</dt>
            <dd className="font-medium">{s.data.model} (proste zadania: {s.data.modelLight})</dd>
          </div>
          <div>
            <dt className="text-muted">Koszt (szacunek)</dt>
            <dd className="font-medium">
              dziś {u.todayUsd.toFixed(3)} / {u.dailyLimitUsd.toFixed(2)} USD · miesiąc {u.monthUsd.toFixed(2)} / {u.monthlyLimitUsd.toFixed(2)} USD
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted">{s.data.reason}</p>
      )}
      <p className="mt-3 text-xs text-muted">Limity i model zmienia się w konfiguracji serwera (wrangler.jsonc). Rzeczywiste koszty widać w konsoli Anthropic.</p>
    </Card>
  );
}

export function SettingsPage() {
  const me = useMe();
  if (me.isPending) return <Spinner label="Ładowanie…" />;
  if (!me.data) return null;
  return (
    <>
      <PageHeader title="Ustawienia" />
      <div className="grid gap-4">
        <ProfileCard me={me.data} />
        <PasskeysCard />
        <AiCard />
        <AccountCard me={me.data} />
      </div>
    </>
  );
}
