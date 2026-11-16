import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ROLE_LABELS } from "../../../shared/roles";
import { GRANTABLE_ROLES, type InvitationRow, type LocationRow, type TeamMember } from "../../../shared/team";
import { formatDate } from "../../components/knowledge";
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { useMe } from "../../lib/queries";
import { useApiMutation } from "../../lib/use-api-mutation";

const STATUS_LABEL: Record<InvitationRow["status"], string> = { pending: "oczekuje", accepted: "przyjęte", revoked: "odwołane", expired: "wygasło" };

function useLocations() {
  return useQuery({ queryKey: ["team", "locations"], queryFn: async () => (await apiFetch<{ locations: LocationRow[] }>("/api/team/locations")).locations });
}

function InviteCard({ isOwner }: { isOwner: boolean }) {
  const locations = useLocations();
  const invites = useQuery({ queryKey: ["team", "invitations"], queryFn: async () => (await apiFetch<{ invitations: InvitationRow[] }>("/api/team/invitations")).invitations });
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState<(typeof GRANTABLE_ROLES)[number]>("learner");
  const [locationId, setLocationId] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = useApiMutation<void, { url: string }>(() => ({ path: "/api/team/invitations", body: { email, roleKey, locationId: locationId || null } }), [["team", "invitations"]]);
  const revoke = useApiMutation<string>((id) => ({ path: `/api/team/invitations/${id}/revoke`, body: {} }), [["team", "invitations"]]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setCopied(false);
    const res = await create.submit(undefined);
    if (res) {
      setLink(res.url);
      setEmail("");
    }
  }

  return (
    <Card title="Zaproszenia">
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-4 sm:items-end" noValidate>
        <Field label="E-mail" error={create.fieldErrors?.email}>
          {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Rola">
          {(p) => (
            <Select {...p} value={roleKey} onChange={(e) => setRoleKey(e.target.value as typeof roleKey)}>
              {GRANTABLE_ROLES.filter((r) => isOwner || r !== "admin").map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Lokal">
          {(p) => (
            <Select {...p} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— bez lokalu —</option>
              {locations.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" loading={create.isPending} disabled={!email}>
          Utwórz zaproszenie
        </Button>
      </form>
      {create.isError && !create.fieldErrors && <div className="mt-3"><Alert tone="error">{create.error.message}</Alert></div>}
      {link && (
        <div className="mt-3 grid gap-2 rounded-lg border border-ok/40 bg-ok/10 p-3">
          <p className="text-sm">Link zaproszenia (ważny 7 dni, jednorazowy). Przekaż go osobie zapraszanej — <strong>nie zobaczysz go ponownie</strong>.</p>
          <code className="select-all break-all rounded bg-surface p-2 text-xs" aria-label="Link zaproszenia">
            {link}
          </code>
          <Button
            variant="secondary"
            className="justify-self-start"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Skopiowano" : "Kopiuj link"}
          </Button>
        </div>
      )}
      <ul className="mt-4 divide-y divide-border">
        {invites.data?.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>
              {i.email} · {ROLE_LABELS[i.roleKey]}
              {i.locationName && ` · ${i.locationName}`}
              <span className="block text-xs text-muted">
                {STATUS_LABEL[i.status]} · utworzono {formatDate(i.createdAt)}
              </span>
            </span>
            {i.status === "pending" && (
              <Button variant="ghost" onClick={() => confirm(`Odwołać zaproszenie dla ${i.email}?`) && revoke.mutate(i.id)}>
                Odwołaj
              </Button>
            )}
          </li>
        ))}
      </ul>
      {invites.data?.length === 0 && <p className="mt-3 text-sm text-muted">Brak zaproszeń.</p>}
    </Card>
  );
}

function LocationsCard({ canEdit }: { canEdit: boolean }) {
  const locations = useLocations();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const create = useApiMutation<void>(() => ({ path: "/api/team/locations", body: { name, city } }), [["team"]]);
  const del = useApiMutation<string>((id) => ({ path: `/api/team/locations/${id}`, method: "DELETE" }), [["team"]]);
  return (
    <Card title="Lokale">
      {canEdit && (
        <form
          noValidate
          className="mb-3 grid gap-3 sm:grid-cols-3 sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if ((await create.submit(undefined)) !== undefined) {
              setName("");
              setCity("");
            }
          }}
        >
          <Field label="Nazwa" error={create.fieldErrors?.name}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}
          </Field>
          <Field label="Miasto">{(p) => <Input {...p} value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />}</Field>
          <Button type="submit" loading={create.isPending} disabled={name.trim().length < 2}>
            Dodaj lokal
          </Button>
        </form>
      )}
      {locations.data?.length === 0 && <EmptyState title="Brak lokali" />}
      <ul className="divide-y divide-border">
        {locations.data?.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              {l.name}
              {l.city && <span className="text-muted"> · {l.city}</span>}
              <span className="block text-xs text-muted">{l.memberCount} osób</span>
            </span>
            {canEdit && (
              <Button variant="ghost" onClick={() => confirm(`Usunąć lokal „${l.name}”? Przypisania do niego zostaną usunięte.`) && del.mutate(l.id)}>
                Usuń
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MemberRow({ m, canEdit, isOwner, locations }: { m: TeamMember; canEdit: boolean; isOwner: boolean; locations: LocationRow[] }) {
  const [roleKey, setRoleKey] = useState<(typeof GRANTABLE_ROLES)[number]>("learner");
  const [locationId, setLocationId] = useState("");
  const assign = useApiMutation<void>(() => ({ path: `/api/team/members/${m.id}/roles`, body: { roleKey, locationId: locationId || null } }), [["team", "members"]]);
  const remove = useApiMutation<string>((mid) => ({ path: `/api/team/members/${m.id}/roles/${mid}`, method: "DELETE" }), [["team", "members"]]);
  const isOwnerRow = m.roles.some((r) => r.role === "owner");
  return (
    <li className="grid gap-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{m.name}</p>
          <p className="text-xs text-muted">{m.email}</p>
        </div>
        <div className="text-right text-xs text-muted">
          <p>
            30 dni: {m.progress.answers30d} odp. · zrozumienie {m.progress.avgEvidence30d ?? "—"}
          </p>
          <p>{m.progress.levelsAchieved.length ? `Poziomy: ${m.progress.levelsAchieved.join(", ")}` : "Brak zaliczonych poziomów"}</p>
          {m.progress.lastActivityAt && <p>Ostatnia aktywność: {formatDate(m.progress.lastActivityAt)}</p>}
        </div>
      </div>
      <ul className="flex flex-wrap gap-2">
        {m.roles.map((r) => (
          <li key={r.id} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs">
            {ROLE_LABELS[r.role]}
            {r.locationName ? ` · ${r.locationName}` : " · globalnie"}
            {canEdit && r.role !== "owner" && (r.role !== "admin" || isOwner) && (
              <button type="button" className="ml-1 grid size-6 place-items-center rounded-full hover:bg-surface-2" aria-label={`Usuń rolę ${ROLE_LABELS[r.role]}`} onClick={() => remove.mutate(r.id)}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && !isOwnerRow && (
        <div className="flex flex-wrap items-end gap-2">
          <Select aria-label={`Rola dla ${m.name}`} className="max-w-44" value={roleKey} onChange={(e) => setRoleKey(e.target.value as typeof roleKey)}>
            {GRANTABLE_ROLES.filter((r) => isOwner || r !== "admin").map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <Select aria-label={`Lokal dla ${m.name}`} className="max-w-52" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">globalnie</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Button variant="secondary" loading={assign.isPending} onClick={() => void assign.submit(undefined)}>
            Przypisz
          </Button>
          {(assign.isError || remove.isError) && <span className="text-xs text-danger">{(assign.error ?? remove.error)?.message}</span>}
        </div>
      )}
    </li>
  );
}

export function TeamPage() {
  const me = useMe();
  const roles = me.data?.roles.map((r) => r.role) ?? [];
  const isOwner = roles.includes("owner");
  const canEdit = isOwner || roles.includes("admin");
  const members = useQuery({ queryKey: ["team", "members"], queryFn: async () => (await apiFetch<{ members: TeamMember[] }>("/api/team/members")).members });
  const locations = useLocations();

  return (
    <>
      <PageHeader
        title="Zespół"
        subtitle={canEdit ? "Zaproszenia, role, lokale i postępy zespołu. Prywatne notatki, receptury, rozmowy i sejf nie są tu widoczne." : "Postępy osób z Twoich lokali."}
      />
      <div className="grid gap-4">
        {canEdit && <InviteCard isOwner={isOwner} />}
        <Card title="Osoby">
          {members.isPending && <Spinner label="Ładowanie…" />}
          {members.isError && <Alert tone="error">{members.error.message}</Alert>}
          <ul className="divide-y divide-border">
            {members.data?.map((m) => <MemberRow key={m.id} m={m} canEdit={canEdit} isOwner={isOwner} locations={locations.data ?? []} />)}
          </ul>
        </Card>
        <LocationsCard canEdit={canEdit} />
      </div>
    </>
  );
}
