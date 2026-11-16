import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { VAULT_MAX_ITEM_BYTES, type VaultItemRow, type VaultKeysRow } from "../../../shared/vault";
import { formatDate, Textarea } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Spinner } from "../../components/ui";
import { ApiRequestError, apiFetch } from "../../lib/api";
import {
  aad,
  changePassword,
  createVault,
  decryptMeta,
  encryptBytes,
  encryptMeta,
  resetPasswordWithRecovery,
  textEncoder,
  toB64,
  unlockWithPassword,
  WrongSecretError,
  type ItemMeta,
  type WrappedKeys,
} from "../../lib/vault-crypto";
import { useVault } from "./vault-context";

const LOSS_WARNING =
  "Sejf szyfruje dane w Twojej przeglądarce. Serwer przechowuje tylko szyfrogram i nie zna hasła. Jeśli zgubisz hasło i klucz odzyskiwania, danych nie da się odszyfrować — nikt, także administrator, nie odzyska ich za Ciebie.";

export function useVaultKeys() {
  return useQuery({ queryKey: ["vault", "keys"], queryFn: async () => (await apiFetch<{ keys: VaultKeysRow | null }>("/api/vault/keys")).keys });
}

function errText(e: unknown): string {
  if (e instanceof WrongSecretError) return e.message;
  if (e instanceof ApiRequestError) return e.message;
  return e instanceof Error ? e.message : "Wystąpił błąd.";
}

function CreateVault() {
  const qc = useQueryClient();
  const { unlock } = useVault();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{ key: string; dek: CryptoKey } | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (p1.length < 12) return setError("Hasło sejfu: min. 12 znaków. Najlepiej kilka losowych słów.");
    if (p1 !== p2) return setError("Hasła nie są identyczne.");
    setBusy(true);
    try {
      const { keys, recoveryKey, dek } = await createVault(p1);
      await apiFetch("/api/vault/keys", { body: keys });
      setRecovery({ key: recoveryKey, dek });
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  if (recovery) {
    return (
      <Card title="Twój klucz odzyskiwania">
        <p className="text-sm">
          Zapisz go teraz (na kartce lub w menedżerze haseł). <strong>Nie pokażemy go ponownie.</strong> Pozwala ustawić nowe hasło, jeśli zapomnisz obecnego.
        </p>
        <p className="my-3 select-all break-all rounded-lg border border-border bg-surface-2 p-3 font-mono text-base tracking-wide" aria-label="Klucz odzyskiwania">
          {recovery.key}
        </p>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          Zapisałem klucz odzyskiwania w bezpiecznym miejscu
        </label>
        <Button
          className="mt-2"
          disabled={!saved}
          onClick={async () => {
            unlock(recovery.dek);
            await qc.invalidateQueries({ queryKey: ["vault"] });
          }}
        >
          Otwórz sejf
        </Button>
      </Card>
    );
  }

  return (
    <Card title="Utwórz sejf">
      <div className="mb-3">
        <Alert>{LOSS_WARNING}</Alert>
      </div>
      <form onSubmit={onSubmit} className="grid gap-3" noValidate>
        <Field label="Hasło sejfu" hint="Inne niż hasło logowania. Min. 12 znaków.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />}
        </Field>
        <Field label="Powtórz hasło sejfu">{(p) => <Input {...p} type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />}</Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={busy}>
          {busy ? "Tworzenie klucza (kilka sekund)…" : "Utwórz sejf"}
        </Button>
      </form>
    </Card>
  );
}

function UnlockVault({ keys }: { keys: VaultKeysRow }) {
  const qc = useQueryClient();
  const { unlock } = useVault();
  const [mode, setMode] = useState<"password" | "recovery">("password");
  const [password, setPassword] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      unlock(await unlockWithPassword(password, keys as WrappedKeys));
      setPassword("");
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRecover(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 12) return setError("Nowe hasło: min. 12 znaków.");
    setBusy(true);
    setError(null);
    try {
      const next = await resetPasswordWithRecovery(recoveryKey, newPassword, keys as WrappedKeys);
      await apiFetch("/api/vault/keys", { method: "PUT", body: { ...next, expectedVersion: keys.version } });
      unlock(await unlockWithPassword(newPassword, next));
      await qc.invalidateQueries({ queryKey: ["vault", "keys"] });
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Sejf jest zablokowany">
      {mode === "password" ? (
        <form onSubmit={onUnlock} className="grid gap-3" noValidate>
          <Field label="Hasło sejfu">{(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" loading={busy} disabled={!password}>
            Odblokuj
          </Button>
          <button type="button" className="text-left text-sm text-accent underline" onClick={() => (setMode("recovery"), setError(null))}>
            Nie pamiętam hasła — użyj klucza odzyskiwania
          </button>
        </form>
      ) : (
        <form onSubmit={onRecover} className="grid gap-3" noValidate>
          <Field label="Klucz odzyskiwania">{(p) => <Input {...p} autoComplete="off" spellCheck={false} value={recoveryKey} onChange={(e) => setRecoveryKey(e.target.value)} className="font-mono" />}</Field>
          <Field label="Nowe hasło sejfu" hint="Min. 12 znaków.">
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />}
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" loading={busy}>
            Ustaw nowe hasło i odblokuj
          </Button>
          <button type="button" className="text-left text-sm text-accent underline" onClick={() => (setMode("password"), setError(null))}>
            Wróć do hasła
          </button>
        </form>
      )}
    </Card>
  );
}

function AddItem({ dek, onDone }: { dek: CryptoKey; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Podaj tytuł.");
    if (!file && !text.trim()) return setError("Wpisz treść albo wybierz plik.");
    if (file && file.size > VAULT_MAX_ITEM_BYTES - 64) return setError("Plik jest za duży (maks. 8 MB).");
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const meta: ItemMeta = file ? { title: title.trim(), fileName: file.name, mime: file.type || "application/octet-stream" } : { title: title.trim(), mime: "text/plain" };
      const plain = file ? new Uint8Array(await file.arrayBuffer()) : (textEncoder.encode(text) as Uint8Array<ArrayBuffer>);
      const [m, content] = await Promise.all([encryptMeta(dek, id, meta), encryptBytes(dek, plain, aad(id, "content"))]);
      await apiFetch("/api/vault/items", {
        body: { id, kind: file ? "file" : "text", metaCiphertext: m.ciphertext, metaIv: m.iv, contentIv: content.iv, content: toB64(content.ciphertext) },
      });
      await qc.invalidateQueries({ queryKey: ["vault", "items"] });
      onDone();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <Field label="Tytuł (szyfrowany)">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />}</Field>
      <Field label="Treść (np. fragment receptury)">{(p) => <Textarea {...p} rows={8} value={text} onChange={(e) => setText(e.target.value)} disabled={Boolean(file)} />}</Field>
      <Field label="…albo plik (PDF, zdjęcie; maks. 8 MB)">
        {(p) => <input {...p} type="file" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
      </Field>
      <p className="text-xs text-muted">Szyfrowanie odbywa się w przeglądarce, zanim cokolwiek zostanie wysłane.</p>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Anuluj
        </Button>
        <Button type="submit" loading={busy}>
          Zaszyfruj i zapisz
        </Button>
      </div>
    </form>
  );
}

function ChangePassword({ keys, onDone }: { keys: VaultKeysRow; onDone: () => void }) {
  const qc = useQueryClient();
  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  return (
    <form
      className="grid gap-3"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (newP.length < 12) return setMsg({ tone: "error", text: "Nowe hasło: min. 12 znaków." });
        setBusy(true);
        setMsg(null);
        try {
          const next = await changePassword(oldP, newP, keys as WrappedKeys);
          await apiFetch("/api/vault/keys", { method: "PUT", body: { ...next, expectedVersion: keys.version } });
          await qc.invalidateQueries({ queryKey: ["vault", "keys"] });
          setMsg({ tone: "success", text: "Hasło sejfu zmienione. Dane nie musiały być ponownie szyfrowane." });
          setOldP("");
          setNewP("");
        } catch (err) {
          setMsg({ tone: "error", text: errText(err) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Obecne hasło sejfu">{(p) => <Input {...p} type="password" autoComplete="current-password" value={oldP} onChange={(e) => setOldP(e.target.value)} />}</Field>
      <Field label="Nowe hasło sejfu">{(p) => <Input {...p} type="password" autoComplete="new-password" value={newP} onChange={(e) => setNewP(e.target.value)} />}</Field>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Zamknij
        </Button>
        <Button type="submit" loading={busy}>
          Zmień hasło
        </Button>
      </div>
    </form>
  );
}

function ItemList({ dek }: { dek: CryptoKey }) {
  const items = useQuery({ queryKey: ["vault", "items"], queryFn: async () => (await apiFetch<{ items: VaultItemRow[] }>("/api/vault/items")).items });
  const [titles, setTitles] = useState<Record<string, ItemMeta | null>>({});
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const out: Record<string, ItemMeta | null> = {};
      for (const it of items.data ?? []) {
        try {
          out[it.id] = await decryptMeta(dek, it.id, it.metaIv, it.metaCiphertext);
        } catch {
          out[it.id] = null;
        }
      }
      if (!cancelled) setTitles(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [items.data, dek]);

  if (items.isPending) return <Spinner label="Ładowanie…" />;
  if (items.isError) return <Alert tone="error">{items.error.message}</Alert>;
  if (items.data.length === 0) return <EmptyState title="Sejf jest pusty" />;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {items.data.map((it) => {
        const m = titles[it.id];
        return (
          <li key={it.id}>
            <Link to={`/sejf/${it.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
              <span>
                <span className="font-medium">{m === undefined ? "…" : m === null ? "(nie można odszyfrować)" : m.title}</span>
                <span className="block text-xs text-muted">
                  {it.kind === "file" ? (m?.fileName ?? "plik") : "notatka"} · {(it.size / 1024).toFixed(1)} KB · {formatDate(it.createdAt)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function VaultPage() {
  const keys = useVaultKeys();
  const { dek, lock } = useVault();
  const [panel, setPanel] = useState<"add" | "password" | null>(null);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Sejf receptur" subtitle="Szyfrowanie end-to-end: Argon2id + AES-GCM-256 w Twojej przeglądarce." />
        {dek && (
          <span className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPanel(panel === "password" ? null : "password")}>
              Zmień hasło
            </Button>
            <Button variant="secondary" onClick={() => setPanel(panel === "add" ? null : "add")}>
              Dodaj
            </Button>
            <Button onClick={lock}>Zablokuj</Button>
          </span>
        )}
      </div>
      {keys.isPending && <Spinner label="Ładowanie…" />}
      {keys.isError && <Alert tone="error">{keys.error.message}</Alert>}
      {keys.data === null && <CreateVault />}
      {keys.data && !dek && <UnlockVault keys={keys.data} />}
      {keys.data && dek && (
        <div className="grid gap-4">
          {panel === "add" && (
            <Card title="Nowy wpis">
              <AddItem dek={dek} onDone={() => setPanel(null)} />
            </Card>
          )}
          {panel === "password" && (
            <Card title="Zmiana hasła sejfu">
              <ChangePassword keys={keys.data} onDone={() => setPanel(null)} />
            </Card>
          )}
          <ItemList dek={dek} />
          <p className="text-xs text-muted">Sejf blokuje się automatycznie po 15 minutach bezczynności i po odświeżeniu strony. {LOSS_WARNING}</p>
        </div>
      )}
    </>
  );
}
