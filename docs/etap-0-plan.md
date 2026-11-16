# Sushi Chef Lab — ETAP 0: analiza, architektura i plan

Status: **zaakceptowany z decyzjami właściciela (sekcja 16).** Na tym etapie nie powstał kod aplikacji, nie utworzono żadnych zasobów Cloudflare/Anthropic, nie skonfigurowano sekretów ani domeny.

Data analizy: 2026-11-16 (Europe/Warsaw).

---

## 1. Co zostało faktycznie sprawdzone

| Obszar | Wynik |
|---|---|
| Repozytorium `karta-koku` | Puste (tylko `README.md`, 1 commit). Brak istniejącego kodu do migracji. |
| Środowisko | Linux, Node 22.23.4, npm 10.9.9, dostęp do rejestru npm. Wrangler 4.163.0 działa przez `npx`. |
| Konto Cloudflare | **Nie sprawdzone** — w tym środowisku nie ma dostępu do konta i nie powinno go być na Etapie 0. |
| Klucz Anthropic | **Brak** — i dobrze; trafi wyłącznie jako Worker Secret, ustawiony przez właściciela. |
| Wersje bibliotek | Sprawdzone w rejestrze npm 2026-11-16 (tabela niżej) wraz z deklarowanymi zależnościami `peerDependencies`. |
| Dokumentacja Anthropic | Sprawdzona aktualna referencja Messages API / SDK TypeScript (modele, streaming, adaptive thinking, structured outputs, obsługa `refusal`). |

Czego **nie** zweryfikowałem i zrobię na początku Etapu 1 (pierwszy krok, przed pisaniem logiki): aktualny przewodnik Better Auth dla Workers + D1, aktualne limity planów Workers/D1 (CPU, rozmiar bazy) — bo od nich zależy pytanie o plan płatny (sekcja 13).

## 2. Zweryfikowany stack (wersje z npm, 2026-11-16)

| Warstwa | Pakiet | Wersja | Uwagi z weryfikacji |
|---|---|---|---|
| Frontend | `react` / `react-dom` | 19.3.x | |
| Build | `vite` | 8.3.x | `@cloudflare/vite-plugin` 1.69 wspiera Vite 6–8 |
| Integracja CF | `@cloudflare/vite-plugin` | 1.69.x | jeden projekt: SPA jako Static Assets + Worker API; dev lokalnie na workerd (Miniflare) |
| CLI | `wrangler` | 4.163.x | |
| Routing | `react-router` | 8.5.x (tryb biblioteki SPA, nie framework) | |
| Dane po stronie klienta | `@tanstack/react-query` | 5.107.x | cache, retry, stan ładowania |
| Style | `tailwindcss` + `@tailwindcss/vite` | 4.3.x | tokeny w CSS, tryb jasny/ciemny przez zmienne |
| Komponenty | Radix UI primitives (przez kopiowane komponenty w stylu shadcn/ui) | — | dostępność (focus, ARIA) bez ciężkiej biblioteki |
| Backend | `hono` | 4.13.x | |
| Walidacja | `zod` 4.6.x + `@hono/zod-validator` 0.9.x | | te same schematy na froncie i serwerze (`packages/shared`) |
| ORM | `drizzle-orm` 0.45.x + `drizzle-kit` 0.31.x | | Drizzle 1.0 jest w becie — **nie** używam bety; Better Auth wspiera 0.45 |
| Auth | `better-auth` | 1.7.x | adapter Drizzle (SQLite/D1). Instancja tworzona per-request (bindingi `env` w Workers) |
| AI | `@anthropic-ai/sdk` | 1.8.x | działa w Workers (fetch); streaming SSE |
| Testy | `vitest` **4.x** + `@cloudflare/vitest-pool-workers` 0.23 | | **Ważne:** pool-workers wymaga `vitest ^4.1` — nie bierzemy Vitest 5, mimo że jest najnowszy |
| PWA | `vite-plugin-pwa` 2.0 | | Workbox; wspiera Vite 8 |
| Powtórki | `ts-fsrs` 6.0 | | algorytm FSRS (nowocześniejszy niż SM-2) |
| KDF sejfu | `hash-wasm` 4.13 (Argon2id) | | patrz sekcja 9 |
| TypeScript | **6.0.x** (nie 7.0) | | TS 7 (natywny kompilator) wyszedł niedawno; część narzędzi (drizzle-kit, typescript-eslint, wtyczki) może jeszcze nie być z nim zgodna. Plan: start na 6.0, migracja do 7 po sprawdzeniu zgodności. |

Model Claude: **nie jest zahardkodowany** — `AI_MODEL` w `wrangler.jsonc` (vars). Proponowana wartość domyślna: `claude-opus-5-5` (aktualny model Opus, $4/$20 za 1M tokenów wejścia/wyjścia). Tańszą alternatywą do oceny odpowiedzi może być osobna zmienna `AI_MODEL_GRADING` — decyzja o kosztach należy do właściciela.

## 3. Architektura

```
 Telefon / przeglądarka (PWA)
 ┌──────────────────────────────────────────────┐
 │ React SPA (Vite)                              │
 │  • widoki, formularze, wyszukiwarka           │
 │  • SEJF: Web Crypto AES-GCM + Argon2id        │  ← klucz sejfu istnieje tylko w pamięci karty
 │    (szyfrowanie/odszyfrowanie lokalnie)       │
 └───────────────┬──────────────────────────────┘
                 │ HTTPS, cookie sesji (HttpOnly, Secure, SameSite=Lax)
 ┌───────────────▼──────────────────────────────┐
 │ Cloudflare Worker (Hono)                      │
 │  /api/auth/*   Better Auth                    │
 │  /api/*        middleware: nagłówki, sesja,   │
 │                RBAC, CSRF/Origin, rate limit  │
 │  moduły: knowledge, menu, notes, learning,    │
 │          exams, review, ai, vault, admin      │
 │  Static Assets: zbudowana SPA                 │
 └──┬──────────────┬──────────────┬─────────────┘
    │              │              │
  D1 (SQL)     R2 (prywatny)   Anthropic Messages API
  dane, audyt  tylko szyfrogramy  (klucz = Worker Secret)
               sejfu
```

Kluczowe decyzje:

1. **Jeden Worker** serwuje SPA (Static Assets) i API pod tą samą domeną → brak CORS, cookie first-party, prostsza ochrona CSRF.
2. **Modularny monolit**: każdy moduł domenowy ma `routes.ts` (HTTP + walidacja Zod), `service.ts` (logika, autoryzacja zasobu), `repo.ts` (Drizzle). Łatwo testować i później wydzielić.
3. **Autoryzacja w dwóch warstwach**: middleware sprawdza sesję i rolę; serwis sprawdza własność konkretnego rekordu (np. `notes.owner_id = session.user.id`). Każde zapytanie o dane prywatne filtruje po właścicielu — nie polegamy na samym ID z URL.
4. **AI jako moduł opcjonalny**: flaga `AI_ENABLED` + brak sekretu = AI wyłączone, reszta aplikacji działa, UI pokazuje stan „Trener niedostępny”.
5. **Sejf jest „ślepy” dla serwera**: serwer przechowuje i zwraca wyłącznie szyfrogramy; nie ma endpointu, który mógłby wysłać zawartość sejfu do AI.

## 4. Struktura katalogów (proponowana)

```
karta-koku/
├─ apps/
│  ├─ web/                    # React SPA
│  │  ├─ src/
│  │  │  ├─ app/              # routing, layout, providers
│  │  │  ├─ features/         # dashboard, academy, ingredients, menu, coach,
│  │  │  │                    # exams, review, notes, progress, settings, vault
│  │  │  ├─ components/ui/    # przyciski, pola, dialogi (Radix + Tailwind)
│  │  │  ├─ lib/              # api client, crypto (sejf), formatowanie dat PL
│  │  │  └─ styles/
│  │  ├─ public/              # ikony PWA, manifest
│  │  └─ tests/
│  └─ worker/                 # Cloudflare Worker (Hono)
│     ├─ src/
│     │  ├─ index.ts          # app Hono, montowanie modułów
│     │  ├─ middleware/       # security headers, session, rbac, csrf, ratelimit, error
│     │  ├─ modules/<moduł>/  # routes.ts, service.ts, repo.ts
│     │  ├─ ai/               # klient Claude, prompty systemowe, budżet, grading
│     │  ├─ auth/             # konfiguracja Better Auth
│     │  └─ db/               # schema Drizzle (podzielona na pliki), client
│     ├─ migrations/          # wersjonowane migracje SQL (drizzle-kit generate)
│     ├─ seed/                # dane startowe: kategorie, poziomy, kompetencje
│     └─ test/                # testy integracyjne API (vitest-pool-workers)
├─ packages/
│  └─ shared/                 # schematy Zod, typy, enumy statusów, role
├─ docs/                      # architektura, decyzje (ADR), instrukcje
├─ wrangler.jsonc
├─ vite.config.ts
├─ package.json               # npm workspaces
└─ .dev.vars.example          # nazwy zmiennych, BEZ wartości (.dev.vars w .gitignore)
```

## 5. Model danych (D1 / SQLite)

Konwencje dla wszystkich tabel treści: `id` (UUID v7 jako TEXT — sortowalne w czasie), `created_at`, `updated_at`, `created_by` → `users.id`, `updated_by`. Daty jako ISO 8601 UTC; prezentacja w Europe/Warsaw.

**Wiarygodność danych (wspólny wzorzec):**
- `verification_status` TEXT CHECK IN (`confirmed`, `general_knowledge`, `needs_verification`, `unknown`)
- `source_id` → `sources.id` (nullable tylko gdy `unknown`)
- reguła w serwisie: `confirmed` wymaga źródła typu „materiał użytkownika”.

Statusy są przechowywane **na poziomie pojedynczego faktu**, nie tylko całego rekordu — dlatego właściwości składników i składniki dań są osobnymi wierszami z własnym statusem.

### 5.1 Tożsamość i uprawnienia
| Tabela | Najważniejsze kolumny / relacje |
|---|---|
| `users`, `sessions`, `accounts`, `verifications` | zarządzane przez Better Auth (nazwy mapowane w schemacie Drizzle) |
| `roles` | `key` (owner/admin/trainer/learner), `rank` |
| `locations` | lokale (na start jeden lub zero) |
| `memberships` | `user_id`, `location_id` (nullable = globalnie), `role_key`; UNIQUE(user_id, location_id) |
| `user_profiles` | `user_id` PK, wyświetlana nazwa, stanowisko, `target_level_id`, preferencje (motyw, AI) |
| `invitations` | `email`, `role_key`, `location_id`, `token_hash` (nigdy token jawnie), `expires_at`, `accepted_at`, `invited_by` |
| `audit_logs` | `actor_id`, `action`, `entity_type`, `entity_id`, `metadata` (bez treści poufnych), `ip_hash`, `created_at`; tylko INSERT |

Przyszłe: `stations`, `learning_paths`, `training_groups`, `group_members` — w Etapie 6, tabele zaprojektowane już teraz, by nie łamać kluczy.

### 5.2 Źródła i wiedza
| Tabela | Opis |
|---|---|
| `sources` | `type` (user_material / literature / web / ai_draft / own_observation), `title`, `reference`, `notes`, `owner_id`, `is_private` |
| `knowledge_categories` | 17 kategorii Akademii; `parent_id` (rozbudowa w drzewo), `slug`, `sort_order` |
| `knowledge_items` | jednostka wiedzy (fakt/zasada/mechanizm): `category_id`, `title`, `body_md`, status + źródło, `version` |
| `knowledge_item_links` | powiązania wiedzy ze składnikami / technikami / daniami (polimorficznie: `target_type`, `target_id`) |
| `techniques` | techniki obróbki (osobny słownik — notatki i lekcje do nich się odwołują) |

### 5.3 Laboratorium składników
| Tabela | Opis |
|---|---|
| `ingredients` | `name_pl`, `name_original`, `transliteration`, `category_id`, `origin`, `description_md`, status, źródło |
| `ingredient_properties` | wiersz = jedna cecha: `aspect` (composition / physical / chemical / taste / aroma / texture / heating / cooling / structure_effect / usage / common_errors), `content_md`, status, źródło |
| `ingredient_substitutes` | `ingredient_id`, `substitute_id`, `context`, `consequences_md`, status |
| `allergens` | słownik 14 alergenów UE |
| `ingredient_allergens` | `ingredient_id`, `allergen_id`, status (alergen pokazujemy jako potwierdzony tylko przy `confirmed`) |

### 5.4 Receptury i Karta KOKU
| Tabela | Opis |
|---|---|
| `recipes` | receptury komponentów (np. ryż do sushi, sos) — **tylko dane wpisane przez użytkownika**; `confidential` (bool) |
| `recipe_components` | hierarchia: receptura składa się z pod-receptur (`parent_recipe_id`, `child_recipe_id`) |
| `recipe_ingredients` | `recipe_id`, `ingredient_id`, `amount`, `unit`, `role` (base/sauce/topping/garnish), status |
| `menu_versions` | wersja karty: `label`, `valid_from`, `valid_to`, `is_current` — umożliwia aktualność i historię |
| `menu_categories` | `menu_version_id`, `tier` (**standard / premium / seasonal / promo** — rozdzielone polem, nigdy nie mieszane w widoku), `kind` (futomaki, uramaki, hosomaki, nigiri, sashimi, zestawy, przystawki, dania ciepłe, desery, dodatki) |
| `menu_items` | `menu_category_id`, `name`, `technique_md`, `texture_md`, `flavor_md`, status, źródło, `currency_status` (aktualne / wycofane / do sprawdzenia) |
| `menu_item_components` | `menu_item_id`, `ingredient_id` lub `recipe_id`, `role` (składnik / komponent / sos / posypka / dekoracja), status |
| `menu_item_allergens` | jak przy składnikach, z własnym statusem |

Brakujące elementy dania zapisuje się jako brak wiersza + flaga `components_complete = false` — nigdy jako zgadywany składnik.

### 5.5 Nauka, egzaminy, powtórki
| Tabela | Opis |
|---|---|
| `levels` | 4 poziomy: kucharz zaawansowany, chef, sous chef, head chef |
| `competencies` | `level_id`, `key`, `name`, `description` (np. „food cost”, „standaryzacja receptur”) |
| `learning_modules` | `category_id`, `level_id`, tytuł, kolejność |
| `lessons` | `module_id`, `body_md`, status (lekcje generowane przez AI mają status `needs_verification` do czasu akceptacji) |
| `lesson_competencies` | które kompetencje rozwija lekcja |
| `questions` | `type` (open / single / multi / fill_composition / identify / match / error_analysis / scenario / explain_process / compare), `prompt_md`, `rubric_md`, `difficulty`, status |
| `question_options` | opcje dla zamkniętych typów (`is_correct`, `explanation_md`) |
| `question_competencies` | mapowanie pytań na kompetencje (podstawa oceny poziomu) |
| `quizzes` | `kind` (practice / exam / level_exam), `level_id`, `pass_threshold` |
| `quiz_questions` | pytania w quizie, kolejność |
| `quiz_attempts` | `user_id`, `quiz_id`, `started_at`, `finished_at`, `score` |
| `attempt_answers` | `attempt_id`, `question_id`, `answer_text`, `score_correctness`, `score_reasoning`, `self_confidence` (1–4), `feedback_md`, `graded_by` (auto / ai / trainer) |
| `learning_progress` | `user_id`, `lesson_id`, `status`, `last_opened_at` |
| `mastery_records` | `user_id`, `competency_id`, `score` (0–100), `evidence_count`, `updated_at` |
| `review_schedule` | `user_id`, `item_type` + `item_id` (pytanie / wiedza / składnik), stan FSRS (`stability`, `difficulty`, `due_at`, `reps`, `lapses`, `last_review_at`) |
| `review_logs` | historia każdej powtórki: ocena, pewność, odpowiedź (temat, data, wynik, liczba błędów — zgodnie z wymaganiem H) |

**Poziomy jako realny mechanizm:** poziom uznaje się za osiągnięty, gdy (a) każda kompetencja poziomu ma `mastery ≥ próg` na podstawie min. N dowodów i (b) zdany jest `level_exam`. Progi trzymane w tabeli `levels`, nie w kodzie.

**Ocena „rozumienia, a nie trafienia”:** każda odpowiedź ma dwie oceny — poprawność i jakość uzasadnienia. Przy pytaniach zamkniętych zadajemy dodatkowo krótkie „dlaczego?” i pytamy o pewność; trafienie z niską pewnością lub bez sensownego uzasadnienia nie podnosi mastery w pełni i trafia szybciej do powtórki.

### 5.6 Notatnik, czat, sejf, AI
| Tabela | Opis |
|---|---|
| `notes` | `owner_id`, `kind` (pytanie z pracy / nieznany składnik / obserwacja / fragment receptury / do wyjaśnienia / problem), `body_md`, `resolved_at` |
| `note_links` | powiązania z składnikami, daniami, technikami, kategoriami |
| `chat_sessions` | `user_id`, `mode` (rozmowa / lekcja / egzamin ustny / symulacja), `topic`, `store_history` (bool) |
| `chat_messages` | `session_id`, `role`, `content`, `tokens_in`, `tokens_out`, `contains_confidential` — treść **nie** jest zapisywana, gdy fragment pochodzi z sejfu i użytkownik nie zgodził się na zapis |
| `ai_usage` | `user_id`, dzień, tokeny wejścia/wyjścia, koszt szacunkowy — podstawa limitów |
| `vault_items` | `owner_id`, `r2_key`, `kdf_params` (JSON — wyjątek uzasadniony: parametry kryptograficzne, nie relacja), `iv`, `size`, `title_ciphertext` (nazwa też zaszyfrowana) |
| `vault_keys` | `owner_id`, `salt`, `kdf_params`, `wrapped_dek` (klucz danych zaszyfrowany kluczem z hasła), `verifier` |

**Wersjonowanie treści:** tabele `*_revisions` (`entity_id`, `version`, `snapshot` jako JSON, `changed_by`, `changed_at`) dla `ingredients`, `ingredient_properties`, `knowledge_items`, `recipes`, `menu_items`, `lessons`, `questions`. Snapshot w JSON jest tu właściwy (archiwum niezmienne, nie źródło relacji). Karta ma dodatkowo wersjonowanie przez `menu_versions`.

**Indeksy (najważniejsze):** wszystkie FK; `(owner_id, updated_at)` w notes; `(user_id, due_at)` w review_schedule; `(user_id, competency_id)` UNIQUE w mastery_records; `(menu_version_id, tier, kind)`; `(user_id, day)` UNIQUE w ai_usage. Wyszukiwarka: **SQLite FTS5** (wirtualne tabele dla składników, wiedzy, dań, notatek) — do potwierdzenia w testach na D1 z polskimi znakami (tokenizer `unicode61 remove_diacritics 2`, by „sól” ≈ „sol”).

## 6. Uprawnienia

| Rola | Zakres |
|---|---|
| owner | wszystko, w tym zaproszenia, role, konfiguracja AI, audyt |
| admin | zarządzanie użytkownikami i treścią w przypisanych lokalach |
| trainer | tworzenie/akceptacja lekcji i pytań, wgląd w postępy swoich grup |
| learner | nauka, własne notatki, własny sejf, własne czaty |

Zasada nienaruszalna: **notatki, sejf, czaty i odpowiedzi egzaminacyjne są prywatne** — nawet owner nie ma endpointu do odczytu cudzego sejfu (i tak nie mógłby go odszyfrować). Trener widzi wyniki/mastery członków grupy, nie treść prywatnych notatek.

Rejestracja publiczna: wyłączona w konfiguracji Better Auth (`disableSignUp`); konto właściciela tworzy jednorazowy skrypt `npm run bootstrap:owner` uruchamiany lokalnie przez właściciela (hasło podawane interaktywnie, nie w repo). Kolejne konta tylko przez zaproszenie z tokenem jednorazowym (w bazie tylko hash).

## 7. Trener AI — projekt

**Warstwy kontekstu (w kolejności, by działał prompt caching):**
1. Stała instrukcja systemowa trenera (PL): rola mentora, poziom odbiorcy, zasady rzetelności — m.in. „rozróżniaj: [potwierdzone w materiałach] / [wiedza ogólna] / [hipoteza]; nie twierdź, że coś jest recepturą KOKU, jeśli nie ma statusu confirmed”.
2. Profil ucznia: poziom docelowy, słabe kompetencje (z `mastery_records`), ostatnie błędy.
3. Kontekst tematu: wybrane rekordy z bazy **wraz z ich statusami** (np. `[status: needs_verification, źródło: brak]`).
4. Historia rozmowy (przycięta do budżetu tokenów).
5. Ewentualny fragment z sejfu — tylko po jawnym potwierdzeniu (sekcja 9).

**Tryby:** rozmowa, lekcja tematyczna, egzamin ustny (pytanie → odpowiedź → ocena → pytanie pogłębiające), symulacja problemu kuchennego (np. „ryż po 40 minutach jest twardy na brzegach — diagnozuj”).

**Ocena odpowiedzi:** osobne wywołanie z **structured outputs** (`output_config.format`, schemat JSON walidowany też Zodem): `correctness`, `reasoning_quality`, `misconceptions[]`, `feedback_md`, `follow_up_question`, `competency_keys[]`. Wynik zasila `attempt_answers`, `mastery_records` i `review_schedule`.

**Technicznie (Messages API, SDK TS 1.8):** streaming SSE przez Worker do przeglądarki; adaptive thinking; `effort` konfigurowalny (rozmowa niżej, ocena egzaminu wyżej); `max_tokens` z konfiguracji; obsługa `stop_reason` (`refusal`, `max_tokens`) i błędów typowanych SDK (429/5xx z ponowieniem, 4xx bez); obsługa odmowy z opcjonalnym fallbackiem serwerowym — do decyzji przy konfiguracji modelu.

**Kontrola kosztów:** dzienny i miesięczny limit tokenów per użytkownik (`ai_usage`), limit długości wiadomości, przycinanie historii, prompt caching stałej części, przełącznik `AI_ENABLED`. Przy przekroczeniu — czytelny komunikat, reszta aplikacji działa.

**Logi:** żadnych treści promptów i odpowiedzi w logach Workera (logujemy tylko: id żądania, liczby tokenów, kod błędu).

## 8. System powtórek

FSRS (`ts-fsrs`) zamiast prostego SM-2: lepiej przewiduje zapominanie. Ocena odpowiedzi (z AI lub automatyczna) + deklarowana pewność mapowana na ocenę FSRS (Again/Hard/Good/Easy). Kolejka „Dzisiejsza powtórka” = `due_at ≤ teraz`, sortowana tak, by najpierw szły elementy z najniższym mastery kompetencji i największą liczbą błędów. Strefa czasowa dnia: Europe/Warsaw.

## 9. Prywatny sejf receptur — projekt kryptograficzny

- **KDF:** Argon2id (`hash-wasm`, WebAssembly w przeglądarce) — Web Crypto nie oferuje Argon2; PBKDF2 (natywny w Web Crypto) jest słabszy wobec ataków GPU. Parametry startowe ok. 64 MiB / 3 iteracje (do strojenia na telefonie, cel < 1,5 s). Parametry zapisywane przy danych → możliwa przyszła zmiana bez utraty dostępu.
- **Hierarchia kluczy:** hasło sejfu → KEK (Argon2id, sól 16 B) → odszyfrowuje losowy DEK (AES-GCM 256, `extractable: false` po imporcie) → DEK szyfruje pliki/teksty. Zmiana hasła = przepakowanie DEK, bez ponownego szyfrowania wszystkich plików.
- **AES-GCM:** losowy 96-bitowy IV na każdy szyfrogram (`crypto.getRandomValues`), nigdy powtórzony; AAD = `vault_item_id` + wersja formatu (blokuje podmianę szyfrogramów między rekordami).
- **Serwer:** widzi tylko szyfrogram, IV, sól, parametry. Hasło sejfu jest **inne** niż hasło logowania (rekomendacja) i nigdy nie opuszcza przeglądarki.
- **R2:** prywatny bucket, bez publicznego dostępu; odczyt wyłącznie przez Worker po sprawdzeniu właściciela; limit rozmiaru (np. 20 MB/plik, do ustalenia).
- **Konsultacja z AI:** użytkownik zaznacza fragment w odszyfrowanym widoku → dialog „Dokładnie to zostanie wysłane do Anthropic” (pełny podgląd, licznik znaków) → potwierdzenie → wysyłany jest tylko ten tekst; domyślnie z oznaczeniem `contains_confidential` i **bez zapisu w historii**, chyba że użytkownik zaznaczy zgodę.
- **Ostrzeżenie w UI:** utrata hasła sejfu = utrata danych; brak „resetu” po stronie serwera (to cecha, nie błąd). Opcjonalny klucz odzyskiwania do wydrukowania — do decyzji.
- **Testy:** round-trip szyfrowanie/odszyfrowanie, złe hasło → błąd, zmodyfikowany bajt szyfrogramu → błąd uwierzytelnienia GCM, podmiana AAD → błąd, unikalność IV, test, że API nigdy nie przyjmuje jawnej treści sejfu (walidacja formatu szyfrogramu).

## 10. Bezpieczeństwo — przekrój

- Sesje: cookie HttpOnly, Secure, SameSite=Lax, prefiks `__Host-`; rotacja; wylogowanie z wszystkich urządzeń.
- CSRF: same-origin + weryfikacja nagłówka `Origin` dla metod zmieniających stan (Better Auth ma własne sprawdzanie origin; dla `/api/*` dodajemy middleware).
- Walidacja Zod każdego wejścia; limity długości pól.
- SQL injection: wyłącznie zapytania parametryzowane (Drizzle / `prepare().bind()`), zakaz sklejania SQL; FTS — escapowanie zapytań wyszukiwania.
- XSS: React escapuje domyślnie; Markdown renderowany przez parser z sanitizacją (bez surowego HTML); CSP bez `unsafe-inline` dla skryptów.
- Nagłówki: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`.
- Rate limiting: logowanie (ochrona przed brute-force), zaproszenia, endpointy AI (tokeny/dzień w D1 + limiter Workers dla krótkich okien — dostępność bindingu na wybranym planie do sprawdzenia).
- Sekrety: `wrangler secret put` (prod), `.dev.vars` lokalnie (w `.gitignore`), `.dev.vars.example` tylko z nazwami.
- Audyt: zaproszenia, zmiany ról, zmiany konfiguracji AI, usunięcia, eksporty.
- Testy autoryzacji: dla każdego zasobu prywatnego test „użytkownik B nie może odczytać / zmienić / usunąć zasobu A” (oczekiwany 404, by nie ujawniać istnienia).

## 11. UI / PWA

Nawigacja: na telefonie dolny pasek (Dashboard, Akademia, Trener, Powtórki, Więcej), na desktopie boczny panel. Typografia o dobrej czytelności polskich znaków, duże pola dotyku (≥ 44 px), tryb jasny/ciemny (systemowy + ręczny), estetyka „laboratorium”: neutralne tła, jeden akcent, gęste ale czytelne karty danych, znaczniki statusu wiarygodności widoczne przy każdej informacji (np. ✓ potwierdzone / ⓘ wiedza ogólna / ? do weryfikacji). PWA: manifest, ikony, service worker cache’ujący powłokę aplikacji; **dane prywatne i sejf nie są cache’owane offline** (świadoma decyzja — do omówienia, jeśli potrzebny tryb offline).

## 12. Ryzyka

| Ryzyko | Wpływ | Mitygacja |
|---|---|---|
| Limit CPU Workers na planie darmowym vs. hashowanie haseł (scrypt w Better Auth) | logowanie może przekraczać limit | weryfikacja na starcie Etapu 1; opcje: plan Workers Paid, inny algorytm hashowania, passkeys — **decyzja właściciela** |
| Koszty API Claude | niekontrolowane wydatki | limity dzienne/miesięczne, przełącznik AI, licznik kosztów w Ustawieniach |
| Halucynacje AI o recepturach KOKU | błędna wiedza w pracy | statusy wiarygodności w kontekście, instrukcja systemowa, lekcje AI jako `needs_verification` do akceptacji |
| Poufność materiałów pracodawcy | ryzyko prawne/zawodowe | sejf E2E, brak automatycznego wysyłania do AI, jawny podgląd przed wysyłką |
| Utrata hasła sejfu | trwała utrata danych | ostrzeżenia, opcjonalny klucz odzyskiwania |
| FTS5 na D1 i polskie znaki | słabsze wyszukiwanie | test na Etapie 2; fallback `LIKE` po znormalizowanych kolumnach |
| Świeże wersje głównych bibliotek (Vite 8, TS 7, Vitest 5) | niezgodności narzędzi | przypięcie zgodnych wersji (Vitest 4, TS 6), lockfile, aktualizacje świadome |
| Pusta baza treści | aplikacja bez wartości edukacyjnej | plan zasilania treścią (pytanie 4) |

## 13. Plan realizacji

| Etap | Zakres | Kryterium ukończenia |
|---|---|---|
| 1 Fundament | monorepo, Vite+React+Tailwind, Worker+Hono, D1+Drizzle+migracje, Better Auth (bez rejestracji, bootstrap ownera), RBAC + middleware bezpieczeństwa, layout + nawigacja, Dashboard (realne dane: puste stany, nie atrapy), tryb jasny/ciemny | testy: auth, RBAC, izolacja danych, migracje od zera; `npm run dev` działa lokalnie |
| 2 Baza wiedzy | kategorie, składniki z właściwościami i statusami, źródła, receptury, Karta KOKU (wersje, tiery), notatnik z powiązaniami, wyszukiwarka FTS, rewizje | CRUD + walidacja + testy autoryzacji + test wyszukiwania PL |
| 3 Trener AI | klient Claude, streaming, tryby, kontekst ze statusami, ocena structured outputs, limity i koszty, przełącznik | testy z zamockowanym API; ręczny test z prawdziwym kluczem **tylko za zgodą** |
| 4 Nauka | moduły, lekcje, pytania 10 typów, quizy/egzaminy, kompetencje, poziomy, FSRS, statystyki | testy logiki mastery/poziomów/FSRS |
| 5 Sejf | Argon2id+AES-GCM, R2, UI sejfu, selektywne wysyłanie do AI | testy kryptograficzne i negatywne |
| 6 PWA i rozbudowa | instalowalność, optymalizacja mobilna, zaproszenia, role, lokale, grupy | Lighthouse PWA, testy zaproszeń |
| 7 Wdrożenie | konfiguracja produkcyjna, sekrety, D1/R2 w koncie | **każdy krok tworzący zasób lub publikujący — za osobną zgodą** |

Wszystko w Etapach 1–6 działa lokalnie (Miniflare/workerd emuluje D1 i R2) — bez zakładania zasobów w koncie Cloudflare.

## 14. Pytania do właściciela (blokujące lub kształtujące Etap 1)

1. **Plan Cloudflare:** czy masz konto Cloudflare i czy dopuszczasz plan Workers Paid (~5 USD/mies.), jeśli okaże się potrzebny dla logowania/limitów CPU? Czy na start wystarczy adres `*.workers.dev` (bez własnej domeny)?
2. **Logowanie:** e-mail + hasło (proponowane) czy dodatkowo passkey (logowanie odciskiem/Face ID na telefonie)? Zaproszenia na start jako link kopiowany ręcznie (bez usługi e-mail) — OK?
3. **AI — budżet i model:** jaki miesięczny limit kosztów API Claude akceptujesz? Czy domyślny model to `claude-opus-5-5` (jakość) z możliwością zmiany w konfiguracji?
4. **Treść:** skąd ma pochodzić materiał Akademii? Propozycja: AI generuje szkice lekcji i pytań oznaczone `needs_verification`, Ty je akceptujesz; dane Karty KOKU wpisujesz ręcznie (lub importujesz z tekstu, który sam wybierzesz). Czy tak?
5. **Karta KOKU:** w jakiej formie masz kartę (PDF, zdjęcia, wiedza z pracy)? Czy masz pewność, że możesz przechowywać te informacje w prywatnej aplikacji (zasady pracodawcy)?
6. **Sejf:** zgoda na Argon2id przez bibliotekę WASM (silniejsze) zamiast samego PBKDF2? Czy chcesz opcjonalny klucz odzyskiwania do wydruku?
7. **Offline:** czy potrzebujesz dostępu do wiedzy bez internetu (np. w chłodni/na zapleczu bez zasięgu)? To zmienia strategię cache PWA.

## 15. Następny krok

Po akceptacji (z ewentualnymi zmianami) rozpoczynam **Etap 1** lokalnie, bez zakładania zasobów w chmurze. Etap zakończę raportem: działające funkcje, testy, lista plików, znane ograniczenia, instrukcja uruchomienia, co faktycznie sprawdzono.

## 16. Decyzje właściciela (2026-11-16)

| # | Decyzja | Konsekwencja w projekcie |
|---|---|---|
| 1 | Brak konta Cloudflare; docelowo plan **darmowy**, adres `*.workers.dev` | Etapy 1–6 lokalnie. Logowanie projektowane pod limit CPU planu darmowego: passkey jako główna metoda; dla hasła — hashowanie mieszczące się w limicie (weryfikacja pomiarem na początku Etapu 1). Konto Cloudflare zakłada właściciel dopiero przed Etapem 7. |
| 2 | Passkey **tak** (obok e-mail + hasło) | plugin passkey Better Auth; zaproszenia jako link kopiowany ręcznie |
| 3 | Koszt AI **jak najniższy** | `AI_MODEL=claude-sonnet-5-5` (rozmowy, lekcje, ocena odpowiedzi), `AI_MODEL_LIGHT=claude-haiku-5-5` (proste zadania: krótkie pytania, klasyfikacja, podpowiedzi); niski `effort`, prompt caching, niskie limity dzienne domyślnie |
| 4 | Treść: szkice AI jako `needs_verification`, akceptuje właściciel | zgodnie z sekcją 5.5 |
| 5 | Karta KOKU z oficjalnej strony | Strona kokusushi.pl **nie publikuje karty w PDF** — menu jest w zamówieniach online per lokal (forgastro) i w linku „Menu sezonowe”. Import po wskazaniu lokalu; dane ze strony = status `confirmed`? **Nie** — źródło publiczne (`web`), status `general_knowledge`/`confirmed` tylko dla tego, co strona faktycznie podaje, z datą pobrania. |
| 6 | Sejf „ma być po prostu bezpieczny” | Argon2id + AES-GCM-256 zgodnie z sekcją 9; przy zakładaniu sejfu generowany jednorazowo **klucz odzyskiwania** do zapisania |
| 7 | Offline — brak odpowiedzi | domyślnie: aplikacja instalowalna, bez offline dla danych prywatnych; do zmiany później |
