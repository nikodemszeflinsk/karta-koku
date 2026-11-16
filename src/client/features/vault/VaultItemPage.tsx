import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { ChatSessionRow } from "../../../shared/ai";
import type { VaultItemContent } from "../../../shared/vault";
import { formatDate } from "../../components/knowledge";
import { Alert, Button, Card, Field, PageHeader, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useAiStatus } from "../../lib/ai";
import { aad, decryptBytes, decryptMeta, fromB64, textDecoder, type ItemMeta } from "../../lib/vault-crypto";
import { useApiMutation } from "../../lib/use-api-mutation";
import { useVault } from "./vault-context";

export function VaultItemPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { dek } = useVault();
  const ai = useAiStatus();
  const item = useQuery({ queryKey: ["vault", "item", id], queryFn: () => apiFetch<VaultItemContent>(`/api/vault/items/${id}`), enabled: Boolean(dek), gcTime: 0 });
  const sessions = useQuery({ queryKey: ["ai", "sessions"], queryFn: async () => (await apiFetch<{ sessions: ChatSessionRow[] }>("/api/ai/sessions")).sessions, enabled: Boolean(dek) });
  const [meta, setMeta] = useState<ItemMeta | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
  const [target, setTarget] = useState("new");
  const ref = useRef<HTMLTextAreaElement>(null);
  const del = useApiMutation<void>(() => ({ path: `/api/vault/items/${id}`, method: "DELETE" }), [["vault", "items"]]);

  useEffect(() => {
    if (!dek || !item.data) return;
    let url: string | null = null;
    void (async () => {
      try {
        const m = await decryptMeta(dek, id, item.data.metaIv, item.data.metaCiphertext);
        const plain = await decryptBytes(dek, { iv: item.data.contentIv, ciphertext: fromB64(item.data.content) }, aad(id, "content"));
        setMeta(m);
        if (item.data.kind === "text" || m.mime?.startsWith("text/")) setText(textDecoder.decode(plain));
        url = URL.createObjectURL(new Blob([plain], { type: m.mime ?? "application/octet-stream" }));
        setBlobUrl(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nie można odszyfrować.");
      }
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
      setText(null); // drop plaintext from state when leaving
    };
  }, [dek, item.data, id]);

  if (!dek) {
    return (
      <Alert>
        Sejf jest zablokowany. <Link to="/sejf" className="font-semibold text-accent underline">Odblokuj go</Link>.
      </Alert>
    );
  }
  if (item.isPending) return <Spinner label="Pobieranie zaszyfrowanych danych…" />;
  if (item.isError) return <Alert tone="error">{item.error.message}</Alert>;

  function captureSelection() {
    const t = ref.current;
    if (!t) return;
    setSelection(t.value.slice(t.selectionStart, t.selectionEnd).trim());
  }

  return (
    <>
      <Link to="/sejf" className="text-sm text-muted hover:text-fg">
        ← Sejf
      </Link>
      <PageHeader title={meta?.title ?? "…"} subtitle={`${meta?.fileName ?? (item.data.kind === "text" ? "notatka" : "plik")} · ${formatDate(item.data.createdAt)}`} />
      {error && <Alert tone="error">{error}</Alert>}
      {text !== null && (
        <Card title="Treść (odszyfrowana tylko w tej karcie)">
          <textarea
            ref={ref}
            readOnly
            aria-label="Odszyfrowana treść"
            value={text}
            rows={14}
            onSelect={captureSelection}
            onMouseUp={captureSelection}
            onKeyUp={captureSelection}
            className="w-full rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm"
          />
          {ai.data?.enabled && (
            <div className="mt-3 grid gap-2 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Konsultacja z trenerem AI</p>
              <p className="text-xs text-muted">Zaznacz fragment powyżej. Do AI trafi wyłącznie zaznaczony tekst — dopiero po Twoim potwierdzeniu w rozmowie.</p>
              <p className="text-xs">{selection ? `Zaznaczono ${selection.length} znaków.` : "Nic nie zaznaczono."}</p>
              <Field label="Rozmowa">
                {(p) => (
                  <Select {...p} value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="new">Nowa rozmowa z mentorem</option>
                    {sessions.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Button
                disabled={!selection}
                onClick={async () => {
                  let sid = target;
                  if (sid === "new") sid = (await apiFetch<{ id: string }>("/api/ai/sessions", { body: { mode: "conversation", title: "Konsultacja fragmentu z sejfu" } })).id;
                  navigate(`/trener/${sid}`, { state: { confidentialFragment: selection } });
                }}
              >
                Przejdź do rozmowy z zaznaczonym fragmentem
              </Button>
            </div>
          )}
        </Card>
      )}
      {blobUrl && (
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={blobUrl} download={meta?.fileName ?? `${meta?.title ?? "sejf"}.txt`} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface-2 px-4 text-sm font-semibold">
            Pobierz odszyfrowany plik
          </a>
          <Button
            variant="ghost"
            loading={del.isPending}
            onClick={async () => {
              if (confirm("Usunąć ten wpis z sejfu? Tej operacji nie da się cofnąć.") && (await del.submit(undefined)) !== undefined) navigate("/sejf", { replace: true });
            }}
          >
            Usuń
          </Button>
        </div>
      )}
    </>
  );
}
