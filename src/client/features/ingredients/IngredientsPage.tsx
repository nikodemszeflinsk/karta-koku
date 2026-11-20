import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { Link } from "react-router";
import { STATUS_LABELS, VERIFICATION_STATUSES, type IngredientListItem, type VerificationStatus } from "../../../shared/knowledge";
import { StatusBadge, useCanEdit } from "../../components/knowledge";
import { Alert, EmptyState, Field, Input, PageHeader, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useCategories } from "../../lib/queries";

export const primaryLink =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90";
export const secondaryLink =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface-2 px-4 text-sm font-semibold text-fg hover:bg-border/60";

export function IngredientsPage() {
  const canEdit = useCanEdit();
  const categories = useCategories();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<VerificationStatus | "">("");
  const dq = useDeferredValue(q.trim());

  const params = new URLSearchParams();
  if (dq) params.set("q", dq);
  if (category) params.set("category", category);
  if (status) params.set("status", status);
  const list = useQuery({
    queryKey: ["ingredients", dq, category, status],
    queryFn: async () => (await apiFetch<{ ingredients: IngredientListItem[] }>(`/api/ingredients?${params}`)).ingredients,
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Laboratorium składników" subtitle="Karty składników: właściwości, zachowanie w obróbce, zamienniki, alergeny." />
        {canEdit && (
          <Link to="/skladniki/nowy" className={primaryLink}>
            Dodaj składnik
          </Link>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Szukaj">
          {(p) => <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="nazwa polska lub oryginalna" />}
        </Field>
        <Field label="Kategoria">
          {(p) => (
            <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Wszystkie</option>
              {categories.data?.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Status">
          {(p) => (
            <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as VerificationStatus | "")}>
              <option value="">Wszystkie</option>
              {VERIFICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {list.isPending && <Spinner label="Ładowanie składników…" />}
      {list.isError && <Alert tone="error">{list.error.message}</Alert>}
      {list.data && list.data.length === 0 && (
        <EmptyState title={dq || category || status ? "Brak wyników" : "Brak składników"}>
          {canEdit && !dq && !category && !status ? "Dodaj pierwszy składnik." : null}
        </EmptyState>
      )}
      {list.data && list.data.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {list.data.map((i) => (
            <li key={i.id}>
              <Link to={`/skladniki/${i.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
                <span>
                  <span className="font-medium">{i.namePl}</span>
                  {i.nameOriginal && <span className="ml-2 text-sm text-muted">{i.nameOriginal}</span>}
                  <span className="block text-xs text-muted">
                    {i.categoryName ?? "bez kategorii"} · {i.propertyCount} {i.propertyCount === 1 ? "właściwość" : "właściwości"}
                  </span>
                </span>
                <StatusBadge status={i.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
