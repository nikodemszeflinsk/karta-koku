import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  CHAT_MODE_HINTS,
  CHAT_MODE_LABELS,
  CHAT_MODES,
  MAX_MESSAGE_CHARS,
  type ChatMessageRow,
  type ChatMode,
  type ChatSessionRow,
  type ChatTopicType,
} from "../../../shared/ai";
import type { SearchHit } from "../../../shared/knowledge";
import { formatDate, Prose, Textarea } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "../../components/ui";
import { ApiRequestError, apiFetch } from "../../lib/api";
import { streamChat, useAiStatus } from "../../lib/ai";
import { useCategories } from "../../lib/queries";
import { useApiMutation } from "../../lib/use-api-mutation";

function AiDisabledNotice() {
  const s = useAiStatus();
  if (!s.data || s.data.enabled) return null;
  return (
    <div className="mb-4">
      <Alert>{s.data.reason}</Alert>
    </div>
  );
}

function UsageLine() {
  const s = useAiStatus();
  if (!s.data) return null;
  const u = s.data.usage;
  return (
    <p className="text-xs text-muted">
      Koszt AI dziś: {u.todayUsd.toFixed(3)} / {u.dailyLimitUsd.toFixed(2)} USD · w miesiącu: {u.monthUsd.toFixed(2)} / {u.monthlyLimitUsd.toFixed(2)} USD (szacunek)
    </p>
  );
}

const TOPIC_TYPES: Partial<Record<SearchHit["type"], ChatTopicType>> = { ingredient: "ingredient", menu_item: "menu_item", technique: "technique" };

function NewSessionForm() {
  const navigate = useNavigate();
  const categories = useCategories();
  const [mode, setMode] = useState<ChatMode>("conversation");
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim());
  const [topic, setTopic] = useState<{ type: ChatTopicType; id: string; label: string } | null>(null);
  const hits = useQuery({
    queryKey: ["search", "topic", dq],
    queryFn: async () => (await apiFetch<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(dq)}&types=ingredient,menu_item,technique`)).results,
    enabled: dq.length >= 2 && !topic,
  });
  const create = useApiMutation<void, { id: string }>(() => ({ path: "/api/ai/sessions", body: { mode, topicType: topic?.type ?? null, topicId: topic?.id ?? null } }), [["ai", "sessions"]]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await create.submit(undefined);
    if (res) navigate(`/trener/${res.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <Field label="Tryb" hint={CHAT_MODE_HINTS[mode]}>
        {(p) => (
          <Select {...p} value={mode} onChange={(e) => setMode(e.target.value as ChatMode)}>
            {CHAT_MODES.map((m) => (
              <option key={m} value={m}>
                {CHAT_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Temat z bazy (opcjonalnie)</span>
        {topic ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
            <span>{topic.label}</span>
            <Button type="button" variant="ghost" onClick={() => setTopic(null)}>
              Zmień
            </Button>
          </div>
        ) : (
          <>
            <Input type="search" aria-label="Szukaj tematu: składnik, danie, technika" placeholder="składnik, danie z karty lub technika…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select
              aria-label="Albo wybierz kategorię"
              value=""
              onChange={(e) => {
                const c = categories.data?.find((x) => x.slug === e.target.value);
                if (c) setTopic({ type: "category", id: c.slug, label: c.name });
              }}
            >
              <option value="">…albo wybierz kategorię</option>
              {categories.data?.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
            {hits.data && hits.data.length > 0 && (
              <ul className="max-h-48 overflow-auto rounded-lg border border-border">
                {hits.data.map((h) => {
                  const t = TOPIC_TYPES[h.type];
                  if (!t) return null;
                  return (
                    <li key={`${h.type}:${h.id}`}>
                      <button type="button" className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-surface-2" onClick={() => setTopic({ type: t, id: h.id, label: h.title })}>
                        {h.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
      <p className="text-xs text-muted">Do AI trafia: Twój profil (poziom docelowy, słabe obszary z ocen) i dane wybranego tematu ze statusami. Notatki, receptury i sejf — nigdy automatycznie.</p>
      {create.isError && <Alert tone="error">{create.error.message}</Alert>}
      <Button type="submit" loading={create.isPending}>
        Rozpocznij
      </Button>
    </form>
  );
}

export function CoachPage() {
  const sessions = useQuery({ queryKey: ["ai", "sessions"], queryFn: async () => (await apiFetch<{ sessions: ChatSessionRow[] }>("/api/ai/sessions")).sessions });
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Trener AI" subtitle="Mentor kulinarny: rozmowy, lekcje, egzamin ustny i symulacje problemów z kuchni." />
        <Link to="/trener/ocena" className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface-2 px-4 text-sm font-semibold">
          Oceń moją odpowiedź
        </Link>
      </div>
      <AiDisabledNotice />
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card title="Nowa rozmowa">
          <NewSessionForm />
        </Card>
        <Card title="Rozmowy">
          {sessions.isPending && <Spinner label="Ładowanie…" />}
          {sessions.data?.length === 0 && <EmptyState title="Brak rozmów" />}
          <ul className="divide-y divide-border">
            {sessions.data?.map((s) => (
              <li key={s.id}>
                <Link to={`/trener/${s.id}`} className="block py-3 hover:text-accent">
                  <span className="block font-medium">{s.title}</span>
                  <span className="text-xs text-muted">
                    {CHAT_MODE_LABELS[s.mode]}
                    {s.topicLabel && ` · ${s.topicLabel}`} · {formatDate(s.updatedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <UsageLine />
          </div>
        </Card>
      </div>
    </>
  );
}

interface LiveMessage extends ChatMessageRow {
  pending?: boolean;
  /** Confidential turn shown in this browser tab only. */
  local?: boolean;
}

function ConfidentialConfirm({ text, onCancel, onConfirm }: { text: string; onCancel: () => void; onConfirm: (store: boolean) => void }) {
  const [store, setStore] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onCancel} className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-fg backdrop:bg-black/50">
      <div className="grid gap-3 p-5">
        <h2 className="text-lg font-semibold">Wysłać poufny fragment do AI?</h2>
        <p className="text-sm text-muted">Do usługi Anthropic zostanie wysłany dokładnie ten tekst ({text.length} znaków):</p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 text-sm">{text}</pre>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={store} onChange={(e) => setStore(e.target.checked)} />
          Zapisz ten fragment i odpowiedź w historii rozmowy
        </label>
        <p className="text-xs text-muted">Domyślnie fragment i odpowiedź nie są zapisywane — po odświeżeniu strony zobaczysz w ich miejscu znacznik.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Anuluj
          </Button>
          <Button onClick={() => onConfirm(store)}>Wyślij</Button>
        </div>
      </div>
    </dialog>
  );
}

export function ChatPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const status = useAiStatus();
  const q = useQuery({
    queryKey: ["ai", "session", id],
    queryFn: () => apiFetch<{ session: ChatSessionRow; messages: ChatMessageRow[] }>(`/api/ai/sessions/${id}`),
  });
  const [local, setLocal] = useState<LiveMessage[]>([]);
  const [input, setInput] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const del = useApiMutation<void>(() => ({ path: `/api/ai/sessions/${id}`, method: "DELETE" }), [["ai", "sessions"]]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [local, q.data]);

  async function send(store: boolean) {
    const content = input.trim();
    if (!content) return;
    setError(null);
    setBusy(true);
    setConfirming(false);
    const userMsg: LiveMessage = { id: `u-${Date.now()}`, role: "user", content, redacted: false, createdAt: new Date().toISOString(), local: confidential && !store };
    const botId = `a-${Date.now()}`;
    setLocal((l) => [...l, userMsg, { id: botId, role: "assistant", content: "", redacted: false, createdAt: "", pending: true, local: confidential && !store }]);
    setInput("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamChat(
        id,
        { content, confidential, confirmedSend: confidential, storeConfidential: store },
        (e) => {
          if (e.type === "delta") setLocal((l) => l.map((m) => (m.id === botId ? { ...m, content: m.content + e.text } : m)));
          if (e.type === "done") setLocal((l) => l.map((m) => (m.id === botId ? { ...m, pending: false } : m)));
          if (e.type === "error") {
            setError(e.message);
            setLocal((l) => l.filter((m) => m.id !== botId));
          }
        },
        ctrl.signal,
      );
      setConfidential(false);
      // Persisted turns come back from the server; keep only the unsaved confidential ones locally.
      await qc.invalidateQueries({ queryKey: ["ai", "session", id] });
      setLocal((l) => l.filter((m) => m.local));
      void qc.invalidateQueries({ queryKey: ["ai", "status"] });
      void qc.invalidateQueries({ queryKey: ["ai", "sessions"] });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Nie udało się wysłać wiadomości.");
      setLocal((l) => l.filter((m) => m.id !== botId && m.id !== userMsg.id));
      setInput(content);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (confidential) setConfirming(true);
    else void send(false);
  }

  if (q.isPending) return <Spinner label="Ładowanie rozmowy…" />;
  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  const { session, messages } = q.data;
  const shown: LiveMessage[] = [
    ...messages.filter((m) => !(m.redacted && local.some((l) => l.local))),
    ...local,
  ];
  const disabled = status.data ? !status.data.enabled : false;

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col">
      <header className="mb-3">
        <Link to="/trener" className="text-sm text-muted hover:text-fg">
          ← Trener AI
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{session.title}</h1>
            <p className="text-xs text-muted">
              {CHAT_MODE_LABELS[session.mode]}
              {session.topicLabel && ` · temat: ${session.topicLabel}`}
            </p>
          </div>
          <Button
            variant="ghost"
            loading={del.isPending}
            onClick={async () => {
              if (!confirm("Usunąć tę rozmowę?")) return;
              if ((await del.submit(undefined)) !== undefined) navigate("/trener", { replace: true });
            }}
          >
            Usuń
          </Button>
        </div>
      </header>
      <AiDisabledNotice />

      <div className="flex-1 space-y-3" aria-live="polite">
        {shown.length === 0 && (
          <EmptyState title="Zacznij rozmowę">{CHAT_MODE_HINTS[session.mode]}</EmptyState>
        )}
        {shown.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[92%] rounded-2xl px-4 py-3 sm:max-w-[80%] ${m.role === "user" ? "bg-accent text-accent-fg" : "border border-border bg-surface"} ${m.redacted ? "italic opacity-70" : ""}`}
            >
              {m.redacted ? (
                <p className="text-sm">{m.role === "user" ? "Poufny fragment — nie zapisano w historii." : "Odpowiedź na poufny fragment — nie zapisano w historii."}</p>
              ) : m.pending && !m.content ? (
                <Spinner small label="Trener myśli…" />
              ) : (
                <Prose text={m.content} />
              )}
              {m.local && !m.pending && <p className="mt-1 text-[11px] opacity-80">Widoczne tylko do odświeżenia strony</p>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-16 mt-4 grid gap-2 rounded-xl border border-border bg-surface p-3 md:bottom-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Textarea
          aria-label="Wiadomość do trenera"
          rows={3}
          value={input}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder={disabled ? "Trener AI jest wyłączony" : "Napisz pytanie lub odpowiedź…"}
          disabled={disabled || busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onSubmit(e);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} disabled={disabled || busy} />
            Zawiera poufny fragment receptury
          </label>
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted">
              {input.length}/{MAX_MESSAGE_CHARS}
            </span>
            {busy ? (
              <Button type="button" variant="secondary" onClick={() => abortRef.current?.abort()}>
                Zatrzymaj
              </Button>
            ) : (
              <Button type="submit" disabled={disabled || !input.trim()}>
                Wyślij
              </Button>
            )}
          </span>
        </div>
      </form>
      {confirming && <ConfidentialConfirm text={input.trim()} onCancel={() => setConfirming(false)} onConfirm={(store) => void send(store)} />}
    </div>
  );
}
