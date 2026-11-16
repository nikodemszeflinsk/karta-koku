import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  RECIPE_LINE_ROLE_LABELS,
  RECIPE_LINE_ROLES,
  type IngredientListItem,
  type RecipeDetail,
  type RecipeLineRole,
  type RecipeSummary,
  type VerificationStatus,
} from "../../../shared/knowledge";
import { formatDate, Prose, Provenance, StatusBadge, StatusSourceFields, Textarea } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useApiMutation } from "../../lib/use-api-mutation";
import { LinkedNotes } from "../notes/LinkedNotes";

const PRIVACY_NOTE =
  "Receptury są prywatne: widzisz je tylko Ty. Treść receptur poufnych nie trafia do wyszukiwarki (tylko nazwa) i nigdy nie jest wysyłana do AI automatycznie. Dla materiałów ściśle poufnych użyj sejfu (Etap 5).";

function useRecipes() {
  return useQuery({ queryKey: ["recipes"], queryFn: async () => (await apiFetch<{ recipes: RecipeSummary[] }>("/api/recipes")).recipes });
}

export function RecipesPage() {
  const list = useRecipes();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Receptury" subtitle="Twoje prywatne receptury i fragmenty receptur." />
        {!adding && <Button onClick={() => setAdding(true)}>Nowa receptura</Button>}
      </div>
      <div className="mb-4">
        <Alert>{PRIVACY_NOTE}</Alert>
      </div>
      {adding && (
        <div className="mb-4">
          <RecipeForm onDone={() => setAdding(false)} />
        </div>
      )}
      {list.isPending && <Spinner label="Ładowanie…" />}
      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      {list.data?.length === 0 && !adding && <EmptyState title="Brak receptur" />}
      {list.data && list.data.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {list.data.map((r) => (
            <li key={r.id}>
              <Link to={`/receptury/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
                <span>
                  <span className="font-medium">{r.name}</span>
                  {r.confidential && <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">poufna</span>}
                  <span className="block text-xs text-muted">zmieniono {formatDate(r.updatedAt)}</span>
                </span>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RecipeForm({ initial, onDone }: { initial?: RecipeDetail; onDone: (id?: string) => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [yieldText, setYieldText] = useState(initial?.yieldText ?? "");
  const [method, setMethod] = useState(initial?.method ?? "");
  const [confidential, setConfidential] = useState(initial?.confidential ?? true);
  const [status, setStatus] = useState<VerificationStatus>(initial?.status ?? "needs_verification");
  const [sourceId, setSourceId] = useState<string | null>(initial?.source?.id ?? null);
  const save = useApiMutation<void, { id: string } | RecipeDetail>(
    () => {
      const body = { name, description, yieldText, method, confidential, status, sourceId };
      return initial ? { path: `/api/recipes/${initial.id}`, method: "PATCH", body: { ...body, expectedVersion: initial.version } } : { path: "/api/recipes", body };
    },
    [["recipes"], ["recipe"]],
  );
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await save.submit();
    if (res === undefined) return;
    if (!initial && "id" in res) navigate(`/receptury/${res.id}`);
    onDone();
  }
  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nazwa *" error={save.fieldErrors?.name}>
              {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />}
            </Field>
            <Field label="Wydajność" hint="np. 1 kg, 20 porcji">
              {(p) => <Input {...p} value={yieldText} onChange={(e) => setYieldText(e.target.value)} maxLength={120} />}
            </Field>
          </div>
          <Field label="Opis">{(p) => <Textarea {...p} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} />}</Field>
          <Field label="Sposób przygotowania">{(p) => <Textarea {...p} rows={8} value={method} onChange={(e) => setMethod(e.target.value)} maxLength={20000} />}</Field>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
            Poufna (treść nie trafia do wyszukiwarki)
          </label>
          <StatusSourceFields status={status} sourceId={sourceId} onStatus={setStatus} onSource={setSourceId} errors={save.fieldErrors} />
          {save.isError && <Alert tone="error">{save.error.message}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onDone()}>
              Anuluj
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
              {initial ? "Zapisz" : "Utwórz recepturę"}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

type Line = { label: string; ingredientId: string | null; amount: string; unit: string; role: RecipeLineRole; note: string };
type Comp = { childRecipeId: string; amount: string; unit: string };

function num(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : n;
}

function LinesEditor({ d, onDone }: { d: RecipeDetail; onDone: () => void }) {
  const [lines, setLines] = useState<Line[]>(
    d.ingredients.map((l) => ({ label: l.label, ingredientId: l.ingredientId, amount: l.amount?.toString().replace(".", ",") ?? "", unit: l.unit ?? "", role: l.role, note: l.note ?? "" })),
  );
  const [comps, setComps] = useState<Comp[]>(d.components.map((c) => ({ childRecipeId: c.childRecipeId, amount: c.amount?.toString().replace(".", ",") ?? "", unit: c.unit ?? "" })));
  const ings = useQuery({ queryKey: ["ingredients", "all-names"], queryFn: async () => (await apiFetch<{ ingredients: IngredientListItem[] }>("/api/ingredients")).ingredients });
  const recipes = useRecipes();
  const save = useApiMutation<void>(
    () => ({
      path: `/api/recipes/${d.id}/lines`,
      method: "PUT",
      body: {
        ingredients: lines.filter((l) => l.label.trim()).map((l) => ({ ...l, amount: num(l.amount) })),
        components: comps.filter((c) => c.childRecipeId).map((c) => ({ ...c, amount: num(c.amount) })),
      },
    }),
    [["recipe", d.id]],
  );
  const updL = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const updC = (i: number, p: Partial<Comp>) => setComps((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)));

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">Składniki</h3>
        {lines.map((l, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_6rem_5rem_8rem_auto] sm:items-end">
            <Field label="Składnik">
              {(p) => (
                <Input
                  {...p}
                  list="recipe-ingredient-names"
                  value={l.label}
                  onChange={(e) => {
                    const match = ings.data?.find((x) => x.namePl.toLowerCase() === e.target.value.trim().toLowerCase());
                    updL(i, { label: e.target.value, ingredientId: match?.id ?? null });
                  }}
                  maxLength={160}
                />
              )}
            </Field>
            <Field label="Ilość">{(p) => <Input {...p} inputMode="decimal" value={l.amount} onChange={(e) => updL(i, { amount: e.target.value })} />}</Field>
            <Field label="Jedn.">{(p) => <Input {...p} value={l.unit} onChange={(e) => updL(i, { unit: e.target.value })} maxLength={20} />}</Field>
            <Field label="Rola">
              {(p) => (
                <Select {...p} value={l.role} onChange={(e) => updL(i, { role: e.target.value as RecipeLineRole })}>
                  {RECIPE_LINE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {RECIPE_LINE_ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button type="button" variant="ghost" aria-label={`Usuń ${l.label || "wiersz"}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
              Usuń
            </Button>
          </div>
        ))}
        <datalist id="recipe-ingredient-names">
          {ings.data?.map((x) => <option key={x.id} value={x.namePl} />)}
        </datalist>
        <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, { label: "", ingredientId: null, amount: "", unit: "g", role: "base", note: "" }])}>
          + Składnik
        </Button>
      </div>
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">Komponenty (inne Twoje receptury)</h3>
        {comps.map((c, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_6rem_5rem_auto] sm:items-end">
            <Field label="Receptura">
              {(p) => (
                <Select {...p} value={c.childRecipeId} onChange={(e) => updC(i, { childRecipeId: e.target.value })}>
                  <option value="">— wybierz —</option>
                  {recipes.data
                    ?.filter((r) => r.id !== d.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <Field label="Ilość">{(p) => <Input {...p} inputMode="decimal" value={c.amount} onChange={(e) => updC(i, { amount: e.target.value })} />}</Field>
            <Field label="Jedn.">{(p) => <Input {...p} value={c.unit} onChange={(e) => updC(i, { unit: e.target.value })} maxLength={20} />}</Field>
            <Button type="button" variant="ghost" onClick={() => setComps((cs) => cs.filter((_, j) => j !== i))}>
              Usuń
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={() => setComps((cs) => [...cs, { childRecipeId: "", amount: "", unit: "g" }])}>
          + Komponent
        </Button>
      </div>
      {save.isError && <Alert tone="error">{save.fieldErrors?.components ?? save.error.message}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Anuluj
        </Button>
        <Button loading={save.isPending} onClick={async () => (await save.submit(undefined)) !== undefined && onDone()}>
          Zapisz skład
        </Button>
      </div>
    </div>
  );
}

export function RecipeDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"view" | "edit" | "lines">("view");
  const q = useQuery({ queryKey: ["recipe", id], queryFn: () => apiFetch<RecipeDetail>(`/api/recipes/${id}`) });
  const del = useApiMutation<void>(() => ({ path: `/api/recipes/${id}`, method: "DELETE" }), [["recipes"]]);
  if (q.isPending) return <Spinner label="Ładowanie…" />;
  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  const d = q.data;
  if (mode === "edit") {
    return (
      <>
        <PageHeader title={`Edycja: ${d.name}`} />
        <RecipeForm initial={d} onDone={() => setMode("view")} />
      </>
    );
  }
  const fmt = (n: number | null, u: string | null) => [n?.toLocaleString("pl-PL"), u].filter(Boolean).join(" ");
  return (
    <>
      <header className="mb-5">
        <Link to="/receptury" className="text-sm text-muted hover:text-fg">
          ← Receptury
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{d.name}</h1>
            <p className="text-sm text-muted">
              {d.yieldText ? `Wydajność: ${d.yieldText}` : "Wydajność nieokreślona"}
              {d.confidential && " · poufna"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setMode("edit")}>
              Edytuj
            </Button>
            <Button
              variant="ghost"
              loading={del.isPending}
              onClick={async () => {
                if (!confirm(`Usunąć recepturę „${d.name}”?`)) return;
                if ((await del.submit(undefined)) === undefined) return;
                navigate("/receptury", { replace: true });
              }}
            >
              Usuń
            </Button>
          </div>
        </div>
        <div className="mt-2">
          <Provenance status={d.status} source={d.source} />
        </div>
      </header>
      <div className="grid gap-4">
        {d.description && (
          <Card title="Opis">
            <Prose text={d.description} />
          </Card>
        )}
        <Card title="Skład" action={mode !== "lines" ? <Button variant="secondary" onClick={() => setMode("lines")}>Edytuj skład</Button> : undefined}>
          {mode === "lines" ? (
            <LinesEditor d={d} onDone={() => setMode("view")} />
          ) : d.ingredients.length === 0 && d.components.length === 0 ? (
            <EmptyState title="Brak składników" />
          ) : (
            <div className="grid gap-3">
              {d.ingredients.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-1 font-medium">Składnik</th>
                      <th className="py-1 text-right font-medium">Ilość</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {d.ingredients.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2">
                          {l.ingredientId ? (
                            <Link to={`/skladniki/${l.ingredientId}`} className="text-accent hover:underline">
                              {l.label}
                            </Link>
                          ) : (
                            l.label
                          )}
                          {l.role !== "base" && <span className="ml-2 text-xs text-muted">{RECIPE_LINE_ROLE_LABELS[l.role]}</span>}
                        </td>
                        <td className="py-2 text-right tabular-nums">{fmt(l.amount, l.unit) || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {d.components.length > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-medium text-muted">Komponenty</h3>
                  <ul className="grid gap-1 text-sm">
                    {d.components.map((c) => (
                      <li key={c.id}>
                        <Link to={`/receptury/${c.childRecipeId}`} className="text-accent hover:underline">
                          {c.childName}
                        </Link>
                        {fmt(c.amount, c.unit) && <span className="ml-2 text-muted">{fmt(c.amount, c.unit)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
        {d.method && (
          <Card title="Sposób przygotowania">
            <Prose text={d.method} />
          </Card>
        )}
        <LinkedNotes targetType="recipe" targetId={d.id} targetLabel={d.name} />
        <p className="text-xs text-muted">
          Wersja {d.version} · zaktualizowano {formatDate(d.updatedAt)}
        </p>
      </div>
    </>
  );
}
