import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  CURRENCY_LABELS,
  KIND_LABELS,
  MENU_KINDS,
  MENU_TIERS,
  TIER_LABELS,
  type MenuItemSummary,
  type MenuTier,
  type MenuVersion,
} from "../../../shared/knowledge";
import { formatPrice, StatusBadge, useCanEdit } from "../../components/knowledge";
import { Alert, EmptyState, Field, PageHeader, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { primaryLink } from "../ingredients/IngredientsPage";

export function useMenuVersions() {
  return useQuery({ queryKey: ["menu", "versions"], queryFn: async () => (await apiFetch<{ versions: MenuVersion[] }>("/api/menu/versions")).versions });
}

export function MenuPage() {
  const canEdit = useCanEdit();
  const versions = useMenuVersions();
  const [params, setParams] = useSearchParams();
  const tier = (params.get("tier") as MenuTier | null) ?? "standard";
  const [versionId, setVersionId] = useState<string | null>(null);
  const activeVersion = versionId ?? versions.data?.find((v) => v.isCurrent)?.id ?? versions.data?.[0]?.id ?? null;

  const items = useQuery({
    queryKey: ["menu", "items", activeVersion],
    queryFn: async () => (await apiFetch<{ items: MenuItemSummary[] }>(`/api/menu/versions/${activeVersion}/items`)).items,
    enabled: Boolean(activeVersion),
  });
  const version = versions.data?.find((v) => v.id === activeVersion);
  const tierItems = items.data?.filter((i) => i.tier === tier) ?? [];
  const counts = Object.fromEntries(MENU_TIERS.map((t) => [t, items.data?.filter((i) => i.tier === t).length ?? 0])) as Record<MenuTier, number>;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Karta KOKU" subtitle="Pozycje karty rozdzielone na standard, premium, wkładki sezonowe i promocje." />
        {canEdit && activeVersion && (
          <Link to={`/karta/nowa?version=${activeVersion}&tier=${tier}`} className={primaryLink}>
            Dodaj pozycję
          </Link>
        )}
      </div>

      {versions.isPending && <Spinner label="Ładowanie karty…" />}
      {versions.data?.length === 0 && <EmptyState title="Brak wersji karty" />}
      {versions.data && versions.data.length > 1 && (
        <div className="mb-4 max-w-md">
          <Field label="Wersja karty">
            {(p) => (
              <Select {...p} value={activeVersion ?? ""} onChange={(e) => setVersionId(e.target.value)}>
                {versions.data.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                    {v.isCurrent ? " (aktualna)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      )}
      {version?.notes && (
        <div className="mb-4">
          <Alert>{version.notes}</Alert>
        </div>
      )}

      <div role="tablist" aria-label="Część karty" className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1">
        {MENU_TIERS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tier === t}
            onClick={() => setParams({ tier: t }, { replace: true })}
            className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium ${tier === t ? "bg-accent-soft text-accent" : "text-muted hover:text-fg"}`}
          >
            {TIER_LABELS[t]} <span className="text-xs">({counts[t]})</span>
          </button>
        ))}
      </div>

      {items.isPending && activeVersion && <Spinner label="Ładowanie pozycji…" />}
      {items.isError && <Alert tone="error">{items.error.message}</Alert>}
      {items.data && tierItems.length === 0 && (
        <EmptyState title="Brak pozycji w tej części karty">
          {tier === "standard" ? "Publiczne materiały KOKU zawierają dla karty standardowej tylko numery pozycji — uzupełnij ją na podstawie karty w lokalu." : null}
        </EmptyState>
      )}
      <div className="grid gap-5">
        {MENU_KINDS.map((k) => {
          const list = tierItems.filter((i) => i.kind === k);
          if (list.length === 0) return null;
          return (
            <section key={k}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{KIND_LABELS[k]}</h2>
              <ul className="grid gap-2 md:grid-cols-2">
                {list.map((i) => (
                  <li key={i.id}>
                    <Link to={`/karta/${i.id}`} className="block h-full rounded-xl border border-border bg-surface p-3 hover:bg-surface-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">
                          {i.code && <span className="mr-1 text-muted">{i.code}.</span>}
                          {i.name}
                        </span>
                        <StatusBadge status={i.status} />
                      </div>
                      {i.componentLabels.length > 0 && <p className="mt-1 text-sm text-muted">{i.componentLabels.join(", ")}</p>}
                      <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                        {i.priceGrosze !== null && <span className="font-medium text-fg">{formatPrice(i.priceGrosze)}</span>}
                        {i.portion && <span>{i.portion}</span>}
                        {!i.componentsComplete && <span>skład niepełny</span>}
                        {i.currencyStatus !== "current" && <span className="text-warn">{CURRENCY_LABELS[i.currencyStatus]}</span>}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
