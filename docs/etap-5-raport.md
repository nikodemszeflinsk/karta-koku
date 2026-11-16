# ETAP 5 — prywatny sejf receptur: raport

Data: 2026-11-16. Lokalnie.

## 1. Co działa

- **Sejf** (`/sejf`): tworzenie, odblokowanie, notatki tekstowe i pliki (PDF, zdjęcia; do 8 MB), lista z odszyfrowanymi tytułami, podgląd, pobranie odszyfrowanego pliku, usuwanie, zmiana hasła, odzyskanie dostępu kluczem odzyskiwania, ręczne blokowanie i **automatyczna blokada** (15 min bezczynności, odświeżenie strony, wylogowanie).
- **Kryptografia w przeglądarce** (`src/client/lib/vault-crypto.ts`):
  - hasło sejfu → **Argon2id** (64 MiB, 3 przebiegi, sól 16 B; `hash-wasm` 4.12.0) → klucz KEK (AES-GCM-256, nieeksportowalny);
  - losowy klucz danych **DEK (AES-GCM-256)** przechowywany na serwerze **tylko zaszyfrowany** — raz kluczem z hasła, raz kluczem z **klucza odzyskiwania** (32 losowe bajty → HKDF-SHA-256);
  - każdy wpis: AES-GCM z **nowym 96-bitowym IV** i **AAD** wiążącym szyfrogram z identyfikatorem wpisu i polem (tytuł/treść) — podmiana szyfrogramów między wpisami jest wykrywana;
  - **tytuły i nazwy plików też są szyfrowane**;
  - po odblokowaniu DEK jest nieeksportowalny i istnieje tylko w pamięci karty;
  - zmiana hasła nie wymaga ponownego szyfrowania danych (przepakowanie DEK).
- **Klucz odzyskiwania** pokazywany **jeden raz** przy zakładaniu (52 znaki, format XXXX-XXXX-…), z obowiązkowym potwierdzeniem zapisania. Jasne ostrzeżenie: utrata hasła i klucza = utrata danych.
- **Serwer** (`/api/vault/*`) przechowuje i zwraca wyłącznie szyfrogram (w D1, w częściach po 1 MiB); nie ma żadnych pól tekstu jawnego; waliduje format (base64, IV 12 B, długość zawiniętego klucza, minimalne parametry Argon2id); każde zapytanie ograniczone do właściciela — **inni użytkownicy, także administrator, dostają 404**; audyt operacji bez treści.
- **Selektywna konsultacja z AI**: w podglądzie notatki zaznaczasz fragment → wybierasz rozmowę → rozmowa otwiera się z **samym zaznaczonym fragmentem** w polu wiadomości i zaznaczonym „poufny fragment” → okno z dokładnym tekstem → dopiero potwierdzenie wysyła. Fragment przekazywany jest w pamięci (stan nawigacji, czyszczony od razu) — nigdy przez adres URL ani pamięć przeglądarki. Domyślnie ani fragment, ani odpowiedź nie są zapisywane w historii. Nic z sejfu nie jest wysyłane do AI automatycznie.

### Decyzja: D1 zamiast R2
Plan dopuszczał R2. R2 na koncie Cloudflare wymaga podpięcia metody płatności — to decyzja o kosztach, której nie podejmuję za Ciebie. Szyfrogram trzymany jest w D1 (plan darmowy), w częściach po 1 MiB, limit 8 MB na wpis i 500 wpisów. Bezpieczeństwo jest identyczne — serwer w obu przypadkach widzi tylko szyfrogram. Przejście na R2 jest możliwe później bez zmiany kryptografii.

## 2. Testy — co faktycznie sprawdzono

`npm test` — **95/95** w dwóch projektach: Workers (API) i Node (kryptografia z prawdziwym Argon2id i Web Crypto).
- Kryptografia (9): szyfrowanie i odszyfrowanie; w zapisanym materiale kluczy nie ma hasła; 50 szyfrowań → 50 różnych IV (12 B); złe hasło → błąd; **zmieniony bajt szyfrogramu → błąd**; **podmiana wpisu lub pola (AAD) → błąd**; szyfrowanie tytułów; zmiana hasła (stare przestaje działać, dane nadal się odszyfrowują, złe stare hasło → błąd); odzyskiwanie kluczem (także małymi literami), zły klucz → błąd, zły format → błąd; bezstratny format klucza; DEK nieeksportowalny.
- API (8): walidacja materiału kluczy (słaby Argon2, tekst zamiast szyfrogramu, zły IV, inny algorytm → 400); sejf tworzony raz; prywatność kluczy; zmiana hasła z blokadą wersji, zakaz zmiany klucza odzyskiwania; wymagany sejf przed dodaniem wpisu; plik 2,5 MB w 3 częściach zwracany bajt w bajt; tekst jawny i plik ponad 8 MB odrzucone; **inny użytkownik i administrator → 404** dla odczytu, usuwania i listy; usunięcie z częściami; audyt bez treści.

**Przeglądarka** (iPhone 13, atrapa API Anthropic):
- utworzenie sejfu (Argon2id z 64 MiB w przeglądarce: ok. 0,4 s);
- klucz odzyskiwania pokazany raz, we właściwym formacie;
- zapis zaszyfrowanej notatki;
- zaznaczenie samej linii poufnej i przejście do rozmowy: wypełniony tylko fragment, zaznaczone „poufne”, okno potwierdzenia, wysłanie;
- po przeładowaniu sejf zablokowany, złe hasło odrzucone, **odzyskanie kluczem odzyskiwania** z nowym hasłem, ponowne odblokowanie nowym hasłem;
- **atrapa AI otrzymała wyłącznie zaznaczony fragment**;
- **plik bazy D1 nie zawiera ani tytułu, ani treści receptury tekstem jawnym**, a obie tury rozmowy zapisano jako zredagowane;
- brak błędów JavaScript.

**Wersja produkcyjna** (`vite preview`, nagłówki z `public/_headers`): CSP aktywne (`script-src 'self' 'wasm-unsafe-eval'` — dopuszcza tylko kompilację WebAssembly, nie `eval` JavaScriptu); odblokowanie sejfu działa; **brak naruszeń CSP**.

### Błąd znaleziony i naprawiony przy okazji (trener AI)
Gdy użytkownik opuszczał rozmowę w trakcie odpowiedzi, Worker przerywał pracę razem z połączeniem: odpowiedź przepadała, choć była już płatna. Teraz generowanie kończy się zawsze (`waitUntil`), a odpowiedź jest zapisywana; zapis do zerwanego połączenia jest ignorowany.

## 3. Znane ograniczenia

- Fragment do AI można zaznaczyć w notatkach tekstowych; z PDF/zdjęć trzeba przepisać fragment do notatki (aplikacja nie odczytuje treści PDF).
- Bez hasła i klucza odzyskiwania danych nie da się odzyskać — to cecha, nie błąd.
- Ochrona przed złośliwym kodem na samej stronie (np. przejęty serwer podmieniający JavaScript) jest ograniczona jak w każdej aplikacji webowej z szyfrowaniem w przeglądarce; CSP zmniejsza ryzyko wstrzyknięcia skryptów.

## 4. Zmienione pliki

Nowe: `migrations/0007_vault.sql`, `src/shared/vault.ts`, `src/worker/modules/vault/routes.ts`, `src/client/lib/vault-crypto.ts`, `src/client/lib/vault-crypto.test.ts`, `src/client/features/vault/{vault-context,VaultPage,VaultItemPage}.tsx`, `test/vault.test.ts`.
Zmienione: `package.json` (`hash-wasm` 4.12.0), `vitest.config.ts` (dwa projekty testów), `public/_headers` (WASM w CSP), `src/worker/db/schema.ts`, `src/worker/index.ts`, `src/worker/modules/ai/routes.ts` (zapis odpowiedzi mimo rozłączenia), `src/client/{routes.tsx,features/layout/AppLayout.tsx,features/coach/CoachPage.tsx}`.
