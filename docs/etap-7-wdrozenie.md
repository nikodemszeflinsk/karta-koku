# ETAP 7 — wdrożenie na Cloudflare (instrukcja, NIE wykonano)

Nic z poniższego nie zostało uruchomione. Każdy krok, który tworzy zasób, publikuje aplikację albo zmienia dane produkcyjne, wymaga Twojej zgody.

## Co jest potrzebne od Ciebie

1. **Konto Cloudflare** (plan darmowy Workers wystarcza). Załóż je sam na cloudflare.com — nie robię tego za Ciebie.
2. **Klucz API Anthropic** (opcjonalnie, dla trenera AI) z console.anthropic.com. Zalecam ustawić tam miesięczny limit wydatków, np. 5 USD — niezależnie od limitu w aplikacji.
3. Decyzja: adres `sushi-chef-lab.<twoja-subdomena>.workers.dev` (bez kosztów) czy własna domena (zmiana DNS — osobna zgoda).

## Kroki (do wykonania po akceptacji)

```bash
npx wrangler login                                   # logowanie do Twojego konta
npx wrangler d1 create sushi-chef-lab                # tworzy bazę D1 (plan darmowy)
#   → wpisz zwrócone database_id w wrangler.jsonc (d1_databases[0].database_id)
#   → ustaw APP_URL w wrangler.jsonc na docelowy adres https://…workers.dev
npx wrangler secret put BETTER_AUTH_SECRET           # wklej: openssl rand -base64 32
npx wrangler secret put SETUP_TOKEN                  # wklej: openssl rand -hex 16
npx wrangler secret put ANTHROPIC_API_KEY            # opcjonalnie
npm run db:migrate:remote                            # migracje na produkcyjną D1
npm run deploy                                       # typecheck + testy + build + publikacja
```

Potem: otwórz `https://…/setup`, podaj `SETUP_TOKEN`, utwórz konto właściciela, dodaj passkey w Ustawieniach i zainstaluj aplikację na telefonie (Udostępnij → Do ekranu początkowego / Zainstaluj aplikację).

Po utworzeniu konta właściciela możesz usunąć sekret `SETUP_TOKEN` (`wrangler secret delete SETUP_TOKEN`) — `/setup` i tak działa tylko przy pustej bazie.

## Do sprawdzenia po wdrożeniu (nie dało się lokalnie)

- **Limit CPU planu darmowego** przy logowaniu hasłem (PBKDF2 100 000 iteracji). Jeśli logowanie hasłem przekroczy limit, opcje: logowanie passkey (nie używa hashowania), plan Workers Paid (decyzja o kosztach) albo mniejsza liczba iteracji (słabsze bezpieczeństwo — nie zalecam).
- Passkey na prawdziwym telefonie (wymaga HTTPS — dostępne dopiero po wdrożeniu).
- Trener AI z prawdziwym modelem: pierwsza rozmowa, ocena odpowiedzi, szkic lekcji; koszt w Ustawieniach vs konsola Anthropic.

## Kopie zapasowe

D1 ma wbudowane przywracanie do punktu w czasie (Time Travel). Eksport ręczny: `npx wrangler d1 export sushi-chef-lab --remote --output backup.sql`. Sejf jest w kopii zaszyfrowany — bez hasła lub klucza odzyskiwania kopia nie ujawnia receptur.
