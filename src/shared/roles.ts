/** Shared account used when OPEN_ACCESS is on (no sign-in). Can never log in: it has no password. */
export const GUEST_USER_ID = "guest";

export const ROLE_KEYS = ["owner", "admin", "trainer", "learner"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/** Higher rank = more privileges. Used only for display ordering and "at least" checks. */
export const ROLE_RANK: Record<RoleKey, number> = {
  owner: 100,
  admin: 80,
  trainer: 50,
  learner: 10,
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  owner: "Właściciel",
  admin: "Administrator",
  trainer: "Trener",
  learner: "Uczestnik",
};

export function highestRole(roles: readonly RoleKey[]): RoleKey | null {
  let best: RoleKey | null = null;
  for (const r of roles) if (best === null || ROLE_RANK[r] > ROLE_RANK[best]) best = r;
  return best;
}
