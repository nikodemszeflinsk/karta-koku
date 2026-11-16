import { z } from "zod";
import { ROLE_KEYS, type RoleKey } from "./roles";

/** Roles that can be granted through invitations / role changes (owner is unique and never granted). */
export const GRANTABLE_ROLES = ["admin", "trainer", "learner"] as const satisfies readonly RoleKey[];

export const INVITE_TTL_DAYS = 7;

export const invitationCreateSchema = z.object({
  email: z.email("Nieprawidłowy e-mail").max(254).transform((v) => v.toLowerCase()),
  roleKey: z.enum(GRANTABLE_ROLES),
  locationId: z.string().max(100).nullable().optional(),
});

export const invitationAcceptSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2, "Imię: min. 2 znaki").max(80),
  password: z.string().min(12, "Hasło: min. 12 znaków").max(128),
});

export const locationInputSchema = z.object({
  name: z.string().trim().min(2, "Nazwa: min. 2 znaki").max(120),
  city: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
});

export const membershipInputSchema = z.object({
  roleKey: z.enum(GRANTABLE_ROLES),
  /** null = global role. */
  locationId: z.string().max(100).nullable(),
});

export interface InvitationRow {
  id: string;
  email: string;
  roleKey: RoleKey;
  locationId: string | null;
  locationName: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}

export interface LocationRow {
  id: string;
  name: string;
  city: string | null;
  memberCount: number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  roles: { id: string; role: RoleKey; locationId: string | null; locationName: string | null }[];
  progress: { answers30d: number; avgEvidence30d: number | null; levelsAchieved: string[]; lastActivityAt: string | null };
}

export const ALL_ROLE_KEYS = ROLE_KEYS;
