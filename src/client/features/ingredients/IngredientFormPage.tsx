import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import type { IngredientDetail, VerificationStatus } from "../../../shared/knowledge";
import { StatusSourceFields, Textarea } from "../../components/knowledge";
import { Alert, Button, Card, Field, Input, PageHeader, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useCategories } from "../../lib/queries";
import { useApiMutation } from "../../lib/use-api-mutation";

interface FormState {
  namePl: string;
  nameOriginal: string;
  transliteration: string;
  categorySlug: string;
  origin: string;
  description: string;
  status: VerificationStatus;
  sourceId: string | null;
}

function IngredientForm({ initial }: { initial?: IngredientDetail }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const [f, setF] = useState<FormState>({
    namePl: initial?.namePl ?? "",
    nameOriginal: initial?.nameOriginal ?? "",
    transliteration: initial?.transliteration ?? "",
    categorySlug: initial?.categorySlug ?? "",
    origin: initial?.origin ?? "",
    description: initial?.description ?? "",
    status: initial?.status ?? "needs_verification",
    sourceId: initial?.source?.id ?? null,
  });
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const save = useApiMutation<FormState, { id: string } | IngredientDetail>(
    (body) =>
      initial
        ? { path: `/api/ingredients/${initial.id}`, method: "PATCH", body: { ...body, categorySlug: body.categorySlug || null, expectedVersion: initial.version } }
        : { path: "/api/ingredients", body: { ...body, categorySlug: body.categorySlug || null } },
    [["ingredients"], ["ingredient"]],
  );
  const e = save.fieldErrors;

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const res = await save.submit(f);
    if (res === undefined) return;
    navigate(`/skladniki/${"id" in res ? res.id : initial!.id}`, { replace: true });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nazwa polska *" error={e?.namePl}>
            {(p) => <Input {...p} value={f.namePl} onChange={(ev) => set("namePl", ev.target.value)} required maxLength={120} />}
          </Field>
          <Field label="Nazwa oryginalna" error={e?.nameOriginal} hint="np. 海苔">
            {(p) => <Input {...p} value={f.nameOriginal} onChange={(ev) => set("nameOriginal", ev.target.value)} maxLength={120} />}
          </Field>
          <Field label="Transliteracja" error={e?.transliteration} hint="np. nori">
            {(p) => <Input {...p} value={f.transliteration} onChange={(ev) => set("transliteration", ev.target.value)} maxLength={120} />}
          </Field>
          <Field label="Kategoria" error={e?.categorySlug}>
            {(p) => (
              <Select {...p} value={f.categorySlug} onChange={(ev) => set("categorySlug", ev.target.value)}>
                <option value="">— bez kategorii —</option>
                {categories.data?.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Pochodzenie" error={e?.origin}>
              {(p) => <Input {...p} value={f.origin} onChange={(ev) => set("origin", ev.target.value)} maxLength={300} />}
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Opis ogólny" error={e?.description}>
              {(p) => <Textarea {...p} value={f.description} onChange={(ev) => set("description", ev.target.value)} maxLength={5000} />}
            </Field>
          </div>
          <div className="sm:col-span-2">
            <StatusSourceFields status={f.status} sourceId={f.sourceId} onStatus={(v) => set("status", v)} onSource={(v) => set("sourceId", v)} errors={e} />
          </div>
        </div>
        {save.isError && <div className="mt-4"><Alert tone="error">{save.error.message}</Alert></div>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Anuluj
          </Button>
          <Button type="submit" loading={save.isPending}>
            {initial ? "Zapisz zmiany" : "Dodaj składnik"}
          </Button>
        </div>
      </Card>
    </form>
  );
}

export function IngredientNewPage() {
  return (
    <>
      <PageHeader title="Nowy składnik" subtitle="Szczegółowe właściwości dodasz na karcie składnika." />
      <IngredientForm />
    </>
  );
}

export function IngredientEditPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["ingredient", id], queryFn: () => apiFetch<IngredientDetail>(`/api/ingredients/${id}`) });
  if (q.isPending) return <Spinner label="Ładowanie…" />;
  if (q.isError) return <Alert tone="error">{q.error.message}</Alert>;
  return (
    <>
      <PageHeader title={`Edycja: ${q.data.namePl}`} />
      <IngredientForm initial={q.data} />
    </>
  );
}
