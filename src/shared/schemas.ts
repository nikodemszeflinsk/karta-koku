import { z } from "zod";
import { ROLE_KEYS } from "./roles";

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const ownerSetupSchema = z.object({
  token: z.string().min(1, "Podaj token konfiguracji").max(200),
  name: z.string().trim().min(2, "Imię: min. 2 znaki").max(80),
  email: z.email("Nieprawidłowy e-mail").max(254).transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(12, "Hasło: min. 12 znaków")
    .max(128, "Hasło: max. 128 znaków"),
});
export type OwnerSetupInput = z.infer<typeof ownerSetupSchema>;

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    position: z.string().trim().max(80).nullable().optional(),
    targetLevelKey: z.string().trim().max(40).nullable().optional(),
    theme: z.enum(THEMES).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Brak zmian do zapisania" });
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const roleKeySchema = z.enum(ROLE_KEYS);

// ---- API response shapes (shared by worker and client) ----

export interface MeResponse {
  user: { id: string; name: string; email: string };
  roles: { role: (typeof ROLE_KEYS)[number]; locationId: string | null }[];
  profile: {
    displayName: string | null;
    position: string | null;
    targetLevelKey: string | null;
    theme: Theme;
  };
}

export interface Competency {
  key: string;
  name: string;
  description: string | null;
}

export interface Level {
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  masteryThreshold: number;
  minEvidence: number;
  competencies: Competency[];
}

export interface Category {
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface DashboardResponse {
  greetingName: string;
  targetLevel: Level | null;
  categories: (Category & { materialCount: number })[];
  openNotes: number;
  ai: { enabled: boolean; reason: string | null };
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
