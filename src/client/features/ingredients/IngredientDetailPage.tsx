import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ASPECT_LABELS,
  INGREDIENT_ASPECTS,
  STATUS_LABELS,
  TIER_LABELS,
  VERIFICATION_STATUSES,
  type Allergen,
  type IngredientAspect,
  type IngredientDetail,
  type IngredientListItem,
  type IngredientProperty,
  type Revision,
  type VerificationStatus,
} from "../../../shared/knowledge";
import { formatDate, Prose, Provenance, StatusSourceFields, Textarea, useCanEdit, useSources } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useApiMutation } from "../../lib/use-api-mutation";
import { LinkedNotes } from "../notes/LinkedNotes";
import { secondaryLink } from "./IngredientsPage";

function PropertyEditor({
  ingredientId,
  property,
  onDone,
}: {
  ingredientId: string;
  property?: IngredientProperty;
  onDone: () => void;
}) {
  const [aspect, setAspect] = useState<IngredientAspect>(property?.aspect ?? "composition");
  const [content, setContent] = useState(property?.content ?? "");
  const [status, setStatus] = useState<VerificationStatus>(property?.status ?? "needs_verification");
  const [sourceId, setSourceId] = useState<string | null>(property?.source?.id ?? null);
  const save = useApiMutation<void>(
    () =>
      property
        ? { path: `/api/ingredients/${ingredientId}/properties/${property.id}`, method: "PATCH", body: { aspect, content, status, sourceId, expectedVersion: property.version } }
        : { path: `/api/ingredients/${ingredientId}/properties`, body: { aspect, content, status, sourceId } },
    [["ingredient", ingredientId]],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if ((await save.submit(undefined)) === undefined) return;
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-border bg-surface-2 p-3" noValidate>
      <Field label="Aspekt">
        {(p) => (
          <Select {...p} value={aspect} onChange={(e) => setAspect(e.target.value as IngredientAspect)}>
            {INGREDIENT_ASPECTS.map((a) => (
              <option key={a} value={a}>
                {ASPECT_LABELS[a]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Treść" error={save.fieldErrors?.content}>
        {(p) => <Textarea {...p} value={content} onChange={(e) => setContent(e.target.value)} maxLength={5000} rows={5} />}
      </Field>
      <StatusSourceFields status={status} sourceId={sourceId} onStatus={setStatus} onSource={setSourceId} errors={save.fieldErrors} />
      {save.isError && <Alert tone="error">{save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Anuluj
        </Button>
        <Button type="submit" loading={save.isPending}>
          Zapisz
        </Button>
      </div>
    </form>
  );
}

function PropertiesSection({ d, canEdit }: { d: IngredientDetail; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const del = useApiMutation<string>((pid) => ({ path: `/api/ingredients/${d.id}/properties/${pid}`, method: "DELETE" }), [["ingredient", d.id]]);
  const grouped = INGREDIENT_ASPECTS.map((a) => ({ aspect: a, items: d.properties.filter((p) => p.aspect === a) })).filter((g) => g.items.length);

  return (
    <Card
      title="Właściwości i zachowanie"
      action={
        canEdit && editing !== "new" ? (
          <Button variant="secondary" onClick={() => setEditing("new")}>
            Dodaj
          </Button>
        ) : undefined
      }
    >
      {editing === "new" && (
        <div className="mb-4">
          <PropertyEditor ingredientId={d.id} onDone={() => setEditing(null)} />
        </div>
      )}
      {grouped.length === 0 && editing !== "new" && <EmptyState title="Brak opisanych właściwości" />}
      <div className="grid gap-4">
        {grouped.map((g) => (
          <section key={g.aspect}>
            <h3 className="mb-2 text-sm font-semibold text-accent">{ASPECT_LABELS[g.aspect]}</h3>
            <ul className="grid gap-2">
              {g.items.map((p) =>
                editing === p.id ? (
                  <li key={p.id}>
                    <PropertyEditor ingredientId={d.id} property={p} onDone={() => setEditing(null)} />
                  </li>
                ) : (
                  <li key={p.id} className="rounded-lg border border-border p-3">
                    <Prose text={p.content} />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <Provenance status={p.status} source={p.source} />
                      {canEdit && (
                        <span className="flex gap-1">
                          <Button variant="ghost" onClick={() => setEditing(p.id)}>
                            Edytuj
                          </Button>
                          <Button
                            variant="ghost"
                            loading={del.isPending && del.variables === p.id}
                            onClick={() => confirm("Usunąć tę właściwość?") && del.mutate(p.id)}
                          >
                            Usuń
                          </Button>
                        </span>
                      )}
                    </div>
                  </li>
                ),
              )}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}

function AllergensSection({ d, canEdit }: { d: IngredientDetail; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const all = useQuery({ queryKey: ["allergens"], queryFn: async () => (await apiFetch<{ allergens: Allergen[] }>("/api/allergens")).allergens, staleTime: Infinity });
  const [sel, setSel] = useState<Record<string, VerificationStatus>>({});
  const [sourceId, setSourceId] = useState<string | null>(null);
  const sources = useSources();
  const save = useApiMutation<void>(
    () => ({
      path: `/api/ingredients/${d.id}/allergens`,
      method: "PUT",
      body: { allergens: Object.entries(sel).map(([allergenId, status]) => ({ allergenId, status, sourceId })) },
    }),
    [["ingredient", d.id]],
  );

  function start() {
    setSel(Object.fromEntries(d.allergens.map((a) => [a.allergenId, a.status])));
    setSourceId(d.allergens.find((a) => a.source)?.source?.id ?? null);
    setEditing(true);
  }

  return (
    <Card title="Alergeny" action={canEdit && !editing ? <Button variant="secondary" onClick={start}>Edytuj</Button> : undefined}>
      <p className="mb-3 text-xs text-muted">Alergen jest pewny tylko ze statusem „Potwierdzone”. Pozostałe traktuj jako informację do sprawdzenia.</p>
      {!editing &&
        (d.allergens.length === 0 ? (
          <EmptyState title="Brak przypisanych alergenów" />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {d.allergens.map((a) => (
              <li key={a.allergenId} className="rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-medium">{a.name}</span>
                <span className="ml-2">
                  <Provenance status={a.status} source={a.source} />
                </span>
              </li>
            ))}
          </ul>
        ))}
      {editing && all.data && (
        <div className="grid gap-2">
          {all.data.map((a) => {
            const on = a.id in sel;
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
                <label className="flex min-h-11 flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--color-accent)]"
                    checked={on}
                    onChange={(e) =>
                      setSel((s) => {
                        const n = { ...s };
                        if (e.target.checked) n[a.id] = "needs_verification";
                        else delete n[a.id];
                        return n;
                      })
                    }
                  />
                  {a.namePl}
                </label>
                {on && (
                  <Select
                    aria-label={`Status: ${a.namePl}`}
                    className="max-w-56"
                    value={sel[a.id]}
                    onChange={(e) => setSel((s) => ({ ...s, [a.id]: e.target.value as VerificationStatus }))}
                  >
                    {VERIFICATION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            );
          })}
          <Field label="Źródło informacji o alergenach" hint="Wymagane dla statusu „Potwierdzone” (materiał użytkownika lub oficjalny).">
            {(p) => (
              <Select {...p} value={sourceId ?? ""} onChange={(e) => setSourceId(e.target.value || null)}>
                <option value="">— brak —</option>
                {sources.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {save.isError && <Alert tone="error">{save.error.message}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Anuluj
            </Button>
            <Button loading={save.isPending} onClick={async () => (await save.submit(undefined)) !== undefined && setEditing(false)}>
              Zapisz alergeny
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SubstitutesSection({ d, canEdit }: { d: IngredientDetail; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const [substituteId, setSubstituteId] = useState("");
  const [context, setContext] = useState("");
  const [consequences, setConsequences] = useState("");
  const [status, setStatus] = useState<VerificationStatus>("needs_verification");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const options = useQuery({
    queryKey: ["ingredients", "all-names"],
    queryFn: async () => (await apiFetch<{ ingredients: IngredientListItem[] }>("/api/ingredients")).ingredients,
    enabled: adding,
  });
  const add = useApiMutation<void>(
    () => ({ path: `/api/ingredients/${d.id}/substitutes`, body: { substituteId, context, consequences, status, sourceId } }),
    [["ingredient", d.id]],
  );
  const del = useApiMutation<string>((sid) => ({ path: `/api/ingredients/${d.id}/substitutes/${sid}`, method: "DELETE" }), [["ingredient", d.id]]);

  return (
    <Card title="Zamienniki" action={canEdit && !adding ? <Button variant="secondary" onClick={() => setAdding(true)}>Dodaj</Button> : undefined}>
      {adding && (
        <form
          className="mb-4 grid gap-3 rounded-lg border border-border bg-surface-2 p-3"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if ((await add.submit(undefined)) === undefined) return;
            setAdding(false);
            setSubstituteId("");
            setContext("");
            setConsequences("");
          }}
        >
          <Field label="Zamiennik" error={add.fieldErrors?.substituteId}>
            {(p) => (
              <Select {...p} value={substituteId} onChange={(e) => setSubstituteId(e.target.value)}>
                <option value="">— wybierz składnik —</option>
                {options.data
                  ?.filter((o) => o.id !== d.id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.namePl}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="W jakim zastosowaniu">
            {(p) => <Input {...p} value={context} onChange={(e) => setContext(e.target.value)} maxLength={1000} />}
          </Field>
          <Field label="Konsekwencje zamiany">
            {(p) => <Textarea {...p} value={consequences} onChange={(e) => setConsequences(e.target.value)} maxLength={3000} rows={3} />}
          </Field>
          <StatusSourceFields status={status} sourceId={sourceId} onStatus={setStatus} onSource={setSourceId} errors={add.fieldErrors} />
          {add.isError && <Alert tone="error">{add.error.message}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Anuluj
            </Button>
            <Button type="submit" loading={add.isPending} disabled={!substituteId}>
              Dodaj zamiennik
            </Button>
          </div>
        </form>
      )}
      {d.substitutes.length === 0 && !adding && <EmptyState title="Brak zamienników" />}
      <ul className="grid gap-2">
        {d.substitutes.map((s) => (
          <li key={s.id} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link to={`/skladniki/${s.substituteId}`} className="font-medium text-accent hover:underline">
                {s.substituteName}
              </Link>
              {canEdit && (
                <Button variant="ghost" onClick={() => confirm("Usunąć zamiennik?") && del.mutate(s.id)}>
                  Usuń
                </Button>
              )}
            </div>
            {s.context && <p className="text-sm text-muted">Zastosowanie: {s.context}</p>}
            <Prose text={s.consequences} className="mt-1" />
            <div className="mt-2">
              <Provenance status={s.status} source={s.source} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RevisionsSection({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["ingredient", id, "revisions"],
    queryFn: async () => (await apiFetch<{ revisions: (Revision & { entityType: string })[] }>(`/api/ingredients/${id}/revisions`)).revisions,
    enabled: open,
  });
  return (
    <Card title="Historia zmian" action={<Button variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? "Ukryj" : "Pokaż"}</Button>}>
      {open && q.isPending && <Spinner label="Ładowanie…" />}
      {open && q.data && q.data.length === 0 && <EmptyState title="Brak wcześniejszych wersji" />}
      {open && q.data && q.data.length > 0 && (
        <ul className="grid gap-2 text-sm">
          {q.data.map((r, i) => (
            <li key={i} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted">
                {r.entityType === "ingredient" ? "Karta składnika" : "Właściwość"} · wersja {r.version} · {formatDate(r.changedAt)}
                {Boolean(r.snapshot.deleted) && " · usunięto"}
              </p>
              <Prose text={String(r.snapshot.content ?? r.snapshot.description ?? r.snapshot.namePl ?? "")} className="mt-1 text-muted" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function IngredientDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const q = useQuery({ queryKey: ["ingredient", id], queryFn: () => apiFetch<IngredientDetail>(`/api/ingredients/${id}`) });
  const del = useApiMutation<void>(() => ({ path: `/api/ingredients/${id}`, method: "DELETE" }), [["ingredients"]]);

  if (q.isPending) return <Spinner label="Ładowanie składnika…" />;
  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  const d = q.data;

  return (
    <>
      <header className="mb-5">
        <Link to="/skladniki" className="text-sm text-muted hover:text-fg">
          ← Składniki
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{d.namePl}</h1>
            <p className="text-sm text-muted">
              {[d.nameOriginal, d.transliteration].filter(Boolean).join(" · ") || "brak nazwy oryginalnej"}
              {d.categoryName && ` · ${d.categoryName}`}
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Link to={`/skladniki/${d.id}/edytuj`} className={secondaryLink}>
                Edytuj
              </Link>
              <Button
                variant="ghost"
                loading={del.isPending}
                onClick={async () => {
                  if (!confirm(`Usunąć składnik „${d.namePl}” wraz z właściwościami?`)) return;
                  if ((await del.submit(undefined)) === undefined) return;
                  navigate("/skladniki", { replace: true });
                }}
              >
                Usuń
              </Button>
            </div>
          )}
        </div>
        <div className="mt-2">
          <Provenance status={d.status} source={d.source} />
        </div>
      </header>

      <div className="grid gap-4">
        {(d.origin || d.description) && (
          <Card title="Opis">
            {d.origin && <p className="mb-2 text-sm"><span className="text-muted">Pochodzenie:</span> {d.origin}</p>}
            <Prose text={d.description} />
          </Card>
        )}
        <PropertiesSection d={d} canEdit={canEdit} />
        <AllergensSection d={d} canEdit={canEdit} />
        <SubstitutesSection d={d} canEdit={canEdit} />
        {d.usedIn.length > 0 && (
          <Card title="Występuje w karcie">
            <ul className="flex flex-wrap gap-2">
              {d.usedIn.map((u) => (
                <li key={u.menuItemId}>
                  <Link to={`/karta/${u.menuItemId}`} className="inline-flex rounded-full border border-border px-3 py-1 text-sm hover:bg-surface-2">
                    {u.name} <span className="ml-1 text-muted">· {TIER_LABELS[u.tier]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <LinkedNotes targetType="ingredient" targetId={d.id} targetLabel={d.namePl} />
        <RevisionsSection id={d.id} />
        <p className="text-xs text-muted">Wersja {d.version} · zaktualizowano {formatDate(d.updatedAt)}</p>
      </div>
    </>
  );
}
