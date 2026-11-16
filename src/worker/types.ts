import type { RoleKey } from "../shared/roles";
import type { Auth } from "./auth/auth";
import type { Db } from "./db/client";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

export interface AppVariables {
  db: Db;
  auth: Auth;
  user: CurrentUser | null;
  /** Global roles (location_id IS NULL). Location-scoped roles are loaded on demand. */
  globalRoles: RoleKey[];
}

export type AppEnv = { Bindings: Env; Variables: AppVariables };
