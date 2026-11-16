import { useQuery } from "@tanstack/react-query";
import type { TextareaHTMLAttributes } from "react";
import {
  SOURCE_TYPE_LABELS,
  STATUS_HINTS,
  STATUS_LABELS,
  VERIFICATION_STATUSES,
  type SourceRow,
  type SourceSummary,
  type VerificationStatus,
} from "../../shared/knowledge";
import { apiFetch } from "../lib/api";
import { useMe } from "../lib/queries";
import { Field, Select } from "./ui";

const STATUS_STYLE: Record<VerificationStatus, string> = {
  confirmed: "border-ok/40 bg-ok/10 text-ok",
  general_knowledge: "border-border bg-surface-2 text-fg",
  needs_verification: "border-warn/40 bg-warn/10 text-warn",
  unknown: "border-border bg-transparent text-muted",
};
const STATUS_ICON: Record<VerificationStatus, string> = {
  confirmed: "✓",
  general_knowledge: "i",
  needs_verification: "?",
  unknown: "–",
};

export function StatusBadge({ status }: { status: VerificationStatus }) {
  return (
    <span
      title={STATUS_HINTS[status]}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      <span aria-hidden="true">{STATUS_ICON[status]}</span>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Provenance({ status, source }: { status: VerificationStatus; source: SourceSummary | null }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs text-muted">
      <StatusBadge status={status} />
      {source ? <span>źródło: {source.title}</span> : <span>bez źródła</span>}
    </span>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={4}
      {...props}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-fg placeholder:text-muted aria-[invalid=true]:border-danger ${props.className ?? ""}`}
    />
  );
}

/** Plain text with preserved line breaks (no HTML rendering → no XSS surface). */
export function Prose({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  return <p className={`whitespace-pre-wrap text-sm leading-relaxed ${className ?? ""}`}>{text}</p>;
}

export function useSources() {
  return useQuery({
    queryKey: ["sources"],
    queryFn: async () => (await apiFetch<{ sources: SourceRow[] }>("/api/sources")).sources,
    staleTime: 60_000,
  });
}

export function StatusSourceFields({
  status,
  sourceId,
  onStatus,
  onSource,
  errors,
}: {
  status: VerificationStatus;
  sourceId: string | null;
  onStatus: (s: VerificationStatus) => void;
  onSource: (id: string | null) => void;
  errors?: Record<string, string> | undefined;
}) {
  const sources = useSources();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Status wiarygodności" error={errors?.status} hint={STATUS_HINTS[status]}>
        {(p) => (
          <Select {...p} value={status} onChange={(e) => onStatus(e.target.value as VerificationStatus)}>
            {VERIFICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Źródło" error={errors?.sourceId}>
        {(p) => (
          <Select {...p} value={sourceId ?? ""} onChange={(e) => onSource(e.target.value || null)} disabled={!sources.data}>
            <option value="">— brak —</option>
            {sources.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({SOURCE_TYPE_LABELS[s.type]})
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}

/** Owner, admin and trainer may edit shared knowledge. */
export function useCanEdit(): boolean {
  const me = useMe();
  return Boolean(me.data?.roles.some((r) => r.role === "owner" || r.role === "admin" || r.role === "trainer"));
}

export function formatPrice(grosze: number | null): string | null {
  if (grosze === null) return null;
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(grosze / 100);
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "medium", timeStyle: "short" });
}
