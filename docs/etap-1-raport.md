# ETAP 1 — fundament: raport

Data: 2026-11-16. Wszystko działa lokalnie; nie utworzono żadnych zasobów w Cloudflare ani Anthropic.

## 1. Co działa

- **Projekt**: jeden pakiet (Vite + `@cloudflare/vite-plugin`) — SPA jako Static Assets i API w jednym Workerze, ta sama domena. Uproszczenie względem planu (zamiast monorepo z workspaces): mniej konfiguracji, ten sam podział kodu (`client/`, `worker/`, `shared/`).
- **Baza D1 + Drizzle**: 15 tabel (Better Auth: users, sessions, accounts, verifications, passkeys, rate_limits; aplikacja: roles, locations, memberships, user_profiles, invitations, audit_logs, levels, competencies, knowledge_categories), relacje i indeksy. Migracja `0001` wgrywa dane referencyjne ze specyfikacji: 4 role, 17 kategorii Akademii, 4 poziomy, 23 kompetencje.
- **Logowanie**: e-mail + hasło oraz **passkey** (Face ID / odcisk palca). Rejestracja publiczna wyłączona. Konto właściciela tworzone jednorazowo na `/setup` z tajnym tokenem.
- **Uprawnienia**: role globalne i per lokal (`memberships`), middleware `requireAuth` / `requireRole`. Każdy użytkownik edytuje wyłącznie własny profil.
- **Interfejs** (PL, mobile-first, jasny/ciemny): logowanie, konfiguracja właściciela, Pulpit (cel rozwoju z kompetencjami poziomu, status trenera AI, kategorie, puste stany nauki), Akademia (ścieżka 4 poziomów + 17 kategorii), Ustawienia (profil, poziom docelowy, motyw, klucze dostępu, wylogowanie).
- **API**: `/api/health`, `/api/setup/{status,owner}`, `/api/me`, `PATCH /api/me/profile`, `/api/dashboard`, `/api/academy/{categories,levels}`, `/api/admin/{users,audit-logs}` (owner/admin), `/api/auth/*` (Better Auth).

## 2. Bezpieczeństwo

- Hasła: PBKDF2-HMAC-SHA-256, 100 000 iteracji, sól 16 B, format wersjonowany. Wybrane zamiast domyślnego scrypt, bo scrypt w JS może przekraczać limit CPU darmowego planu Workers.
- Token konfiguracji porównywany w czasie stałym; `/setup` działa tylko przy pustej bazie.
- Cookie sesji: HttpOnly, SameSite=Lax, prefiks `scl`; w produkcji (https) automatycznie Secure.
- CSRF: każde żądanie POST/PATCH/DELETE do `/api/*` musi mieć `Origin` aplikacji.
- Limit prób: 10 logowań/min na IP (Better Auth, licznik w D1).
- Nagłówki: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS (https), `no-store` dla API; plik `public/_headers` dla zasobów statycznych (CSP bez `unsafe-inline`).
- Dziennik audytu: utworzenie właściciela, każde logowanie. Logi błędów bez treści żądań.

## 3. Testy — co faktycznie sprawdzono

`npm test` — **28/28** (Vitest w prawdziwym runtime Workers, z migracjami):
- hashowanie: weryfikacja, złe hasło, unikalna sól, odrzucanie uszkodzonych i podmienionych hashy;
- nagłówki bezpieczeństwa, JSON 404, 401 dla 4 chronionych endpointów;
- CSRF: obcy i brakujący `Origin` → 403; rejestracja publiczna nie tworzy konta;
- `/setup`: walidacja pól, zły token → 403, tworzy właściciela raz (drugi raz → 409), hasło w bazie tylko jako hash PBKDF2;
- logowanie: złe hasło → 401, poprawne → cookie HttpOnly + SameSite=Lax; wylogowanie unieważnia sesję;
- dane referencyjne (17 kategorii, 4 poziomy), aktualizacja profilu, odrzucenie nieznanego poziomu i pól spoza schematu (`userId`);
- RBAC: learner → 403 na endpointach admina; izolacja profili (zmiana learnera nie dotyka danych właściciela);
- limit prób logowania → 429.

`npm run typecheck` — bez błędów (klient, Worker, testy, konfiguracja). `npm run build` — OK.

**Test w przeglądarce** (Chromium, profil iPhone 13 + desktop 1366 px, wirtualny autentykator WebAuthn): przekierowanie na logowanie → konfiguracja (walidacja, zły token, poprawne utworzenie) → zapis profilu → **rejestracja passkey** → pulpit z kompetencjami sous chefa → wylogowanie → **logowanie passkey bez hasła** → złe hasło (komunikat) → logowanie hasłem → Akademia → motyw ciemny zachowany po przeładowaniu; brak poziomego przewijania na telefonie; brak błędów JavaScript.

## 4. Znane ograniczenia

- **Limit CPU na planie darmowym** nie został zmierzony na prawdziwym Cloudflare (lokalnie limitu nie ma). PBKDF2 jest natywny i powinien się zmieścić; sprawdzimy przy wdrożeniu (Etap 7). Passkey nie wymaga hashowania hasła.
- Passkey na prawdziwym telefonie wymaga HTTPS i domeny — lokalnie działa tylko na `localhost`. Pełny test na telefonie po wdrożeniu.
- Pulpit: „Ostatnia lekcja”, „Dzisiejsza powtórka”, „Ostatnie błędy” to uczciwe puste stany — moduły nauki powstaną w Etapie 4. Liczniki „0 materiałów” są stałe do Etapu 2.
- Zaproszenia i zarządzanie użytkownikami w UI — Etap 6 (tabela `invitations` już istnieje).
- `/setup` nie ma blokady na dwa równoczesne żądania w tej samej milisekundzie (praktycznie nieistotne przy jednym właścicielu z tajnym tokenem).
- `npm install` wymaga `legacy-peer-deps` (plik `.npmrc`) z powodu błędu npm przy opcjonalnych zależnościach Better Auth.
- Pakiet testowy Cloudflare zmienił nazwę na `@cloudflare/vitest-plugin` — używamy nowej nazwy; Vitest 4.1 (zgodny).

## 5. Zmienione pliki

Nowe: `package.json`, `package-lock.json`, `.npmrc`, `.gitignore`, `.dev.vars.example`, `wrangler.jsonc`, `vite.config.ts`, `vitest.config.ts`, `drizzle.config.ts`, `tsconfig*.json`, `index.html`, `public/{favicon.svg,theme-init.js,_headers}`, `migrations/0000_init.sql`, `migrations/0001_seed_reference_data.sql`, `migrations/meta/*`, `src/shared/*`, `src/worker/**`, `src/client/**`, `test/*`, `docs/etap-1-raport.md`. Zmienione: `README.md`.

## 6. Uruchomienie

Zob. `README.md` → „Uruchomienie lokalne”.
