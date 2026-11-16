import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [passkeyClient()],
});

/** Better Auth error codes -> Polish messages shown to the user. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return "Nieznany błąd.";
  if (error.status === 429) return "Za dużo prób. Odczekaj minutę i spróbuj ponownie.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Nieprawidłowy e-mail lub hasło.";
    case "INVALID_EMAIL":
      return "Nieprawidłowy adres e-mail.";
    default:
      return error.message || "Nie udało się wykonać operacji.";
  }
}
