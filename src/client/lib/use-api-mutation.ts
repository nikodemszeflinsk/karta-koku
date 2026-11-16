import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiRequestError, apiFetch } from "./api";

/**
 * Mutation that calls the API and invalidates the given query keys on success.
 * Exposes field errors from the server's validation response.
 */
export function useApiMutation<TBody, TResult = unknown>(
  request: (body: TBody) => { path: string; method?: string; body?: unknown },
  invalidate: QueryKey[] = [],
) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (body: TBody) => {
      const r = request(body);
      return apiFetch<TResult>(r.path, { method: r.method ?? "POST", body: r.body });
    },
    onSuccess: async () => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
    },
  });
  const fieldErrors = m.error instanceof ApiRequestError ? m.error.details : undefined;
  /** Like mutateAsync, but resolves to undefined on failure (the error is shown via mutation state). */
  const submit = async (body: TBody): Promise<TResult | undefined> => {
    try {
      return await m.mutateAsync(body);
    } catch {
      return undefined;
    }
  };
  return Object.assign(m, { fieldErrors, submit });
}
