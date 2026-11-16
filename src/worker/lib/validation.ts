import type { Context } from "hono";
import type { z } from "zod";

type Result = { success: true } | { success: false; error: z.core.$ZodError };

/** zValidator hook: uniform 400 response with field messages (Polish, from schemas). */
export function validationHook(result: Result, c: Context) {
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    return c.json({ error: { code: "validation_error", message: "Nieprawidłowe dane.", details: fields } }, 400);
  }
  return undefined;
}
