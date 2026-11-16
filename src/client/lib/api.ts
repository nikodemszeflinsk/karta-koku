import type { ApiError } from "../../shared/schemas";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
  });
  if (!res.ok) {
    let err: ApiError["error"] = { code: "http_error", message: `Błąd ${res.status}` };
    try {
      err = ((await res.json()) as ApiError).error ?? err;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiRequestError(res.status, err.code, err.message, err.details as Record<string, string> | undefined);
  }
  return (await res.json()) as T;
}
