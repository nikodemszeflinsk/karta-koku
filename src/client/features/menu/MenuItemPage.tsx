import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  COMPONENT_ROLE_LABELS,
  COMPONENT_ROLES,
  CURRENCY_LABELS,
  CURRENCY_STATUSES,
  KIND_LABELS,
  MENU_KINDS,
  MENU_TIERS,
  STATUS_LABELS,
  TIER_LABELS,
  VERIFICATION_STATUSES,
  type Allergen,
  type ComponentRole,
  type CurrencyStatus,
  type IngredientListItem,
  type MenuItemDetail,
  type MenuKind,
  type MenuTier,
  type VerificationStatus,
} from "../../../shared/knowledge";
import { formatDate, formatPrice, Prose, Provenance, StatusBadge, StatusSourceFields, Textarea, useCanEdit, useSources } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useApiMutation } from "../../lib/use-api-mutation";
import { LinkedNotes } from "../notes/LinkedNotes";

interface ItemForm {
  tier: MenuTier;
  kind: MenuKind;
  code: string;
  name: string;
  description: string;
  technique: string;
  texture: string;
  flavor: string;
  portion: string;
  price: string;
  componentsComplete: boolean;
  currencyStatus: CurrencyStatus;
  status: VerificationStatus;
  sourceId: string | null;
}

function parsePrice(v: string): number | null {
  const n = Number(v.replace(",", ".").replace(/[^\d.]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : Math.round(n * 100);
}

function MenuItemForm({ initial, versionId, defaultTier, onSaved, onCancel }: { initial?: MenuItemDetail; versionId?: string; defaultTier?: MenuTier; onSaved: (id: string) => void; onCancel: () => void }) {
  const [f, setF] = useState<ItemForm>({
    tier: initial?.tier ?? defaultTier ?? "standard",
    kind: initial?.kind ?? "uramaki",
    code: initial?.code ?? "",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    technique: initial?.technique ?? "",
    texture: initial?.texture ?? "",
    flavor: initial?.flavor ?? "",
    portion: initial?.portion ?? "",
    price: initial?.priceGrosze != null ? (initial.priceGrosze / 100).toFixed(2).replace(".", ",") : "",
    componentsComplete: initial?.componentsComplete ?? false,
    currencyStatus: initial?.currencyStatus ?? "current",
    status: initial?.status ?? "needs_verification",
    sourceId: initial?.source?.id ?? null,
  });
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = useApiMutation<void, { id: string } | MenuItemDetail>(
    () => {
      const { price, ...rest } = f;
      const body = { ...rest, priceGrosze: parsePrice(price) };
      return initial
        ? { path: `/api/menu/items/${initial.id}`, method: "PATCH", body: { ...body, expectedVersion: initial.version } }
        : { path: "/api/menu/items", body: { ...body, menuVersionId: versionId } };
    },
    [["menu"]],
  );
  const e = save.fieldErrors;

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const res = await save.submit();
    if (res === undefined) return;
    onSaved("id" in res ? res.id : initial!.id);
  }

  const text = (k: "code" | "name" | "portion", label: string, max: number) => (
    <Field label={label} error={e?.[k]}>
      {(p) => <Input {...p} value={f[k]} onChange={(ev) => set(k, ev.target.value)} maxLength={max} />}
    </Field>
  );
  const area = (k: "description" | "technique" | "texture" | "flavor", label: string) => (
    <Field label={label} error={e?.[k]}>
      {(p) => <Textarea {...p} rows={3} value={f[k]} onChange={(ev) => set(k, ev.target.value)} maxLength={3000} />}
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Część karty">
            {(p) => (
              <Select {...p} value={f.tier} onChange={(ev) => set("tier", ev.target.value as MenuTier)}>
                {MENU_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABELS[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Rodzaj">
            {(p) => (
              <Select {...p} value={f.kind} onChange={(ev) => set("kind", ev.target.value as MenuKind)}>
                {MENU_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {text("name", "Nazwa *", 160)}
          {text("code", "Numer w karcie", 20)}
          {text("portion", "Porcja (np. 8 szt.)", 40)}
          <Field label="Cena (zł)" error={e?.priceGrosze}>
            {(p) => <Input {...p} inputMode="decimal" value={f.price} onChange={(ev) => set("price", ev.target.value)} placeholder="np. 31,00" />}
          </Field>
          {area("description", "Opis")}
          {area("technique", "Technika przygotowania")}
          {area("texture", "Tekstura")}
          {area("flavor", "Charakterystyka smakowa")}
          <Field label="Aktualność">
            {(p) => (
              <Select {...p} value={f.currencyStatus} onChange={(ev) => set("currencyStatus", ev.target.value as CurrencyStatus)}>
                {CURRENCY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CURRENCY_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm">
            <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={f.componentsComplete} onChange={(ev) => set("componentsComplete", ev.target.checked)} />
            Skład kompletny (potwierdzony w całości)
          </label>
          <div className="sm:col-span-2">
            <StatusSourceFields status={f.status} sourceId={f.sourceId} onStatus={(v) => set("status", v)} onSource={(v) => set("sourceId", v)} errors={e} />
          </div>
        </div>
        {save.isError && <div className="mt-4"><Alert tone="error">{save.error.message}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Anuluj
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!f.name.trim()}>
            {initial ? "Zapisz" : "Dodaj pozycję"}
          </Button>
        </div>
      </Card>
    </form>
  );
}

type CompRow = { role: ComponentRole; label: string; ingredientId: string | null; status: VerificationStatus };

function ComponentsEditor({ d, onDone }: { d: MenuItemDetail; onDone: () => void }) {
  const [rows, setRows] = useState<CompRow[]>(d.components.map(({ role, label, ingredientId, status }) => ({ role, label, ingredientId, status })));
  const ings = useQuery({
    queryKey: ["ingredients", "all-names"],
    queryFn: async () => (await apiFetch<{ ingredients: IngredientListItem[] }>("/api/ingredients")).ingredients,
  });
  const save = useApiMutation<void>(() => ({ path: `/api/menu/items/${d.id}/components`, method: "PUT", body: { components: rows.filter((r) => r.label.trim()) } }), [["menu"]]);
  const upd = (i: number, patch: Partial<CompRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-3">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_9rem_1fr_10rem_auto] sm:items-end">
          <Field label="Nazwa (jak w źródle)">{(p) => <Input {...p} value={r.label} onChange={(e) => upd(i, { label: e.target.value })} maxLength={160} />}</Field>
          <Field label="Rola">
            {(p) => (
              <Select {...p} value={r.role} onChange={(e) => upd(i, { role: e.target.value as ComponentRole })}>
                {COMPONENT_ROLES.map((x) => (
                  <option key={x} value={x}>
                    {COMPONENT_ROLE_LABELS[x]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Karta składnika">
            {(p) => (
              <Select {...p} value={r.ingredientId ?? ""} onChange={(e) => upd(i, { ingredientId: e.target.value || null })}>
                <option value="">— nie powiązano —</option>
                {ings.data?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.namePl}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Status">
            {(p) => (
              <Select {...p} value={r.status} onChange={(e) => upd(i, { status: e.target.value as VerificationStatus })}>
                {VERIFICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Button type="button" variant="ghost" aria-label={`Usuń ${r.label || "wiersz"}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
            Usuń
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => setRows((rs) => [...rs, { role: "ingredient", label: "", ingredientId: null, status: "needs_verification" }])}>
        + Dodaj składnik / komponent
      </Button>
      {save.isError && <Alert tone="error">{save.error.message}</Alert>}
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

function MenuAllergens({ d, canEdit }: { d: MenuItemDetail; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState<Record<string, VerificationStatus>>({});
  const [sourceId, setSourceId] = useState<string | null>(null);
  const all = useQuery({ queryKey: ["allergens"], queryFn: async () => (await apiFetch<{ allergens: Allergen[] }>("/api/allergens")).allergens, staleTime: Infinity, enabled: editing });
  const sources = useSources();
  const save = useApiMutation<void>(
    () => ({ path: `/api/menu/items/${d.id}/allergens`, method: "PUT", body: { allergens: Object.entries(sel).map(([allergenId, status]) => ({ allergenId, status, sourceId })) } }),
    [["menu"]],
  );
  return (
    <Card
      title="Alergeny"
      action={
        canEdit && !editing ? (
          <Button
            variant="secondary"
            onClick={() => {
              setSel(Object.fromEntries(d.allergens.map((a) => [a.allergenId, a.status])));
              setSourceId(d.allergens.find((a) => a.source)?.source?.id ?? null);
              setEditing(true);
            }}
          >
            Edytuj
          </Button>
        ) : undefined
      }
    >
      <p className="mb-3 text-xs text-muted">
        Alergeny KOKU w materiałach źródłowych są oznaczone kolorowymi kropkami i nie zostały przepisane automatycznie. Wprowadź je ręcznie z karty alergenów w lokalu.
      </p>
      {!editing &&
        (d.allergens.length === 0 ? (
          <EmptyState title="Nie wprowadzono alergenów" />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {d.allergens.map((a) => (
              <li key={a.allergenId} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-medium">{a.name}</span>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        ))}
      {editing && (
        <div className="grid gap-2">
          {all.data?.map((a) => {
            const on = a.id in sel;
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-1">
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
                  <Select aria-label={`Status: ${a.namePl}`} className="max-w-56" value={sel[a.id]} onChange={(e) => setSel((s) => ({ ...s, [a.id]: e.target.value as VerificationStatus }))}>
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
          <Field label="Źródło" hint="Wymagane dla statusu „Potwierdzone”.">
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

export function MenuItemNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const versionId = params.get("version") ?? "";
  return (
    <>
      <PageHeader title="Nowa pozycja karty" />
      <MenuItemForm
        versionId={versionId}
        defaultTier={(params.get("tier") as MenuTier | null) ?? "standard"}
        onSaved={(id) => navigate(`/karta/${id}`, { replace: true })}
        onCancel={() => navigate(-1)}
      />
    </>
  );
}

export function MenuItemPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const [mode, setMode] = useState<"view" | "edit" | "components">("view");
  const q = useQuery({ queryKey: ["menu", "item", id], queryFn: () => apiFetch<MenuItemDetail>(`/api/menu/items/${id}`) });
  const del = useApiMutation<void>(() => ({ path: `/api/menu/items/${id}`, method: "DELETE" }), [["menu"]]);
  if (q.isPending) return <Spinner label="Ładowanie…" />;
  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  const d = q.data;

  if (mode === "edit") {
    return (
      <>
        <PageHeader title={`Edycja: ${d.name}`} />
        <MenuItemForm initial={d} onSaved={() => setMode("view")} onCancel={() => setMode("view")} />
      </>
    );
  }

  const field = (label: string, v: string | null) =>
    v ? (
      <div>
        <h3 className="text-sm font-semibold text-accent">{label}</h3>
        <Prose text={v} />
      </div>
    ) : null;

  return (
    <>
      <header className="mb-5">
        <Link to={`/karta?tier=${d.tier}`} className="text-sm text-muted hover:text-fg">
          ← {TIER_LABELS[d.tier]}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {d.code && <span className="mr-2 text-muted">{d.code}.</span>}
              {d.name}
            </h1>
            <p className="text-sm text-muted">
              {TIER_LABELS[d.tier]} · {KIND_LABELS[d.kind]}
              {d.portion && ` · ${d.portion}`}
              {d.priceGrosze !== null && ` · ${formatPrice(d.priceGrosze)}`}
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setMode("edit")}>
                Edytuj
              </Button>
              <Button
                variant="ghost"
                loading={del.isPending}
                onClick={async () => {
                  if (!confirm(`Usunąć „${d.name}” z karty?`)) return;
                  if ((await del.submit(undefined)) === undefined) return;
                  navigate(`/karta?tier=${d.tier}`, { replace: true });
                }}
              >
                Usuń
              </Button>
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Provenance status={d.status} source={d.source} />
          <span className={`text-xs ${d.currencyStatus === "current" ? "text-muted" : "text-warn"}`}>{CURRENCY_LABELS[d.currencyStatus]}</span>
        </div>
      </header>

      <div className="grid gap-4">
        <Card
          title="Skład"
          action={canEdit && mode !== "components" ? <Button variant="secondary" onClick={() => setMode("components")}>Edytuj skład</Button> : undefined}
        >
          {!d.componentsComplete && (
            <p className="mb-3 text-xs text-warn">Skład niepełny — zawiera tylko to, co podano w źródle. Brakujących składników nie uzupełniamy domysłami.</p>
          )}
          {mode === "components" ? (
            <ComponentsEditor d={d} onDone={() => setMode("view")} />
          ) : d.components.length === 0 ? (
            <EmptyState title="Brak składników w źródle" />
          ) : (
            <ul className="divide-y divide-border">
              {d.components.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {c.ingredientId ? (
                      <Link to={`/skladniki/${c.ingredientId}`} className="font-medium text-accent hover:underline">
                        {c.label}
                      </Link>
                    ) : (
                      <span className="font-medium">{c.label}</span>
                    )}
                    <span className="ml-2 text-xs text-muted">{COMPONENT_ROLE_LABELS[c.role]}</span>
                  </span>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        {(d.description || d.technique || d.texture || d.flavor) && (
          <Card title="Charakterystyka">
            <div className="grid gap-3">
              {field("Opis", d.description)}
              {field("Technika przygotowania", d.technique)}
              {field("Tekstura", d.texture)}
              {field("Charakterystyka smakowa", d.flavor)}
            </div>
          </Card>
        )}
        <MenuAllergens d={d} canEdit={canEdit} />
        <LinkedNotes targetType="menu_item" targetId={d.id} targetLabel={d.name} />
        <p className="text-xs text-muted">
          {d.menuVersionLabel} · wersja {d.version} · zaktualizowano {formatDate(d.updatedAt)}
        </p>
      </div>
    </>
  );
}

