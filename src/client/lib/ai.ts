import { useQuery } from "@tanstack/react-query";
import type { AiStatus, ChatStreamEvent } from "../../shared/ai";
import { ApiRequestError, apiFetch } from "./api";

export function useAiStatus() {
  return useQuery({ queryKey: ["ai", "status"], queryFn: () => apiFetch<AiStatus>("/api/ai/status"), staleTime: 30_000 });
}

/**
 * Sends a chat turn and consumes the SSE stream. Calls onEvent for each event.
 * Throws ApiRequestError for non-2xx responses (validation, limits, AI disabled).
 */
export async function streamChat(
  sessionId: string,
  body: { content: string; confidential?: boolean; confirmedSend?: boolean; storeConfidential?: boolean },
  onEvent: (e: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/ai/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    signal,
  });
  if (!res.ok || !res.body) {
    let err = { code: "http_error", message: `Błąd ${res.status}`, details: undefined as Record<string, string> | undefined };
    try {
      err = ((await res.json()) as { error: typeof err }).error ?? err;
    } catch {
      /* not JSON */
    }
    throw new ApiRequestError(res.status, err.code, err.message, err.details);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as ChatStreamEvent);
      } catch {
        /* ignore malformed block */
      }
    }
  }
}
