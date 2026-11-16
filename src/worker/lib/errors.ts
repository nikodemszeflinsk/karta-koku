import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Thrown by services; converted to a JSON error response by app.onError. */
export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
