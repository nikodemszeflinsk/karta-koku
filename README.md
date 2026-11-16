# Sushi Chef Lab

Prywatna, polskojęzyczna akademia kulinarna dla kucharza sushi: od kucharza zaawansowanego do sous chefa i head chefa.

Stack: React + Vite + Tailwind (SPA) · Cloudflare Workers + Hono (API) · D1 + Drizzle · Better Auth (hasło + passkey) · Zod · Vitest (testy w środowisku Workers).

Plan i decyzje: [`docs/etap-0-plan.md`](docs/etap-0-plan.md). Raporty: [etap 1](docs/etap-1-raport.md), [etap 2](docs/etap-2-raport.md), [etap 3](docs/etap-3-raport.md), [etap 4](docs/etap-4-raport.md), [etap 5](docs/etap-5-raport.md), [etap 6](docs/etap-6-raport.md); wdrożenie: [etap 7](docs/etap-7-wdrozenie.md).

**Produkcja:** https://sushi-chef-lab.nikodemszeflinsk.workers.dev — publikowane automatycznie przez Cloudflare Workers Builds po każdym pushu na gałąź produkcyjną (szczegóły: `docs/etap-7-wdrozenie.md`).

## Uruchomienie lokalne

Wymagane: Node 22+. Konto Cloudflare **nie** jest potrzebne — D1 działa lokalnie.

```bash
npm install
cp .dev.vars.example .dev.vars        # potem wpisz wartości:
#   BETTER_AUTH_SECRET=$(openssl rand -base64 32)
#   SETUP_TOKEN=$(openssl rand -hex 16)
npm run db:migrate:local              # tworzy lokalną bazę D1 i dane referencyjne
npm run dev                           # http://localhost:5173
```

Trener AI (opcjonalnie): dopisz do `.dev.vars` swój klucz `ANTHROPIC_API_KEY=...`. Bez klucza trener jest wyłączony, a reszta aplikacji działa. Limity kosztów ustawiasz w `wrangler.jsonc` (`AI_DAILY_BUDGET_USD`, `AI_MONTHLY_BUDGET_USD`).

Pierwsze uruchomienie: wejdź na `http://localhost:5173/setup`, podaj `SETUP_TOKEN` z `.dev.vars` i utwórz konto właściciela. Działa tylko raz, gdy baza nie ma żadnego użytkownika. Potem w **Ustawieniach** możesz dodać klucz dostępu (passkey).

## Polecenia

| Polecenie | Opis |
|---|---|
| `npm run dev` | serwer deweloperski (SPA + Worker + lokalna D1) |
| `npm test` | testy (Vitest w runtime Workers, z prawdziwymi migracjami) |
| `npm run typecheck` | TypeScript dla klienta, Workera i testów |
| `npm run build` | build produkcyjny |
| `npm run db:generate` | nowa migracja z `src/worker/db/schema.ts` |
| `npm run db:migrate:local` | migracje na lokalną D1 |
| `npm run cf-typegen` | typy `Env` z `wrangler.jsonc` |

## Struktura

```
src/
  client/      React SPA (features/, components/, lib/)
  worker/      API Hono: auth/, db/, middleware/, modules/<moduł>/
  shared/      schematy Zod, typy i role wspólne dla klienta i serwera
migrations/    wersjonowane migracje SQL (D1)
test/          testy API i bezpieczeństwa
materials/     materiały źródłowe (publiczne menu KOKU)
```

## Bezpieczeństwo (skrót)

Rejestracja publiczna wyłączona · hasła PBKDF2-SHA-256 (100 000 iteracji, Web Crypto) · cookie sesji HttpOnly + SameSite=Lax · kontrola `Origin` dla żądań zmieniających dane · limit prób logowania · nagłówki bezpieczeństwa i CSP · walidacja Zod na serwerze · dziennik audytu. Sekrety tylko w `.dev.vars` (ignorowany przez git) lub jako sekrety Workera.
