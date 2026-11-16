import { useQuery } from "@tanstack/react-query";
import type { Category, DashboardResponse, Level, MeResponse } from "../../shared/schemas";
import { ApiRequestError, apiFetch } from "./api";

export const qk = {
  me: ["me"] as const,
  dashboard: ["dashboard"] as const,
  categories: ["academy", "categories"] as const,
  levels: ["academy", "levels"] as const,
  setupStatus: ["setup", "status"] as const,
};

/** Current user, or null when signed out (401 is not an error here). */
export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return await apiFetch<MeResponse>("/api/me");
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: () => apiFetch<DashboardResponse>("/api/dashboard") });
}

export function useCategories() {
  return useQuery({
    queryKey: qk.categories,
    queryFn: async () => (await apiFetch<{ categories: Category[] }>("/api/academy/categories")).categories,
    staleTime: 5 * 60_000,
  });
}

export function useLevels() {
  return useQuery({
    queryKey: qk.levels,
    queryFn: async () => (await apiFetch<{ levels: Level[] }>("/api/academy/levels")).levels,
    staleTime: 5 * 60_000,
  });
}

export function useSetupStatus() {
  return useQuery({
    queryKey: qk.setupStatus,
    queryFn: () => apiFetch<{ needsSetup: boolean; setupEnabled: boolean }>("/api/setup/status"),
  });
}
