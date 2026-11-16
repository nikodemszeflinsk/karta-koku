# ETAP 3 — trener AI: raport

Data: 2026-11-16. Lokalnie. **Nie wykonano żadnego zapytania do prawdziwego API Anthropic** (brak klucza; testy używają atrapy).

## 1. Co działa

- **Trener AI** (`/trener`): nowe rozmowy w 4 trybach — rozmowa z mentorem, lekcja tematyczna, egzamin ustny, symulacja problemu kuchennego; opcjonalny temat z bazy (składnik, pozycja karty KOKU, technika, kategoria); lista rozmów; usuwanie.
- **Streaming odpowiedzi** (SSE) z przyciskiem „Zatrzymaj”; historia w D1; tytuł rozmowy nadawany po pierwszej odpowiedzi tańszym modelem (Haiku).
- **Kontekst dla modelu**: stała instrukcja mentora (cache’owana) + tryb + profil ucznia (poziom docelowy, kompetencje, ostatnie słabe obszary z ocen) + dane tematu **ze statusami wiarygodności** ([potwierdzone] / [wiedza ogólna] / [do weryfikacji] / [brak informacji]) i jawnym ostrzeżeniem „skład NIEPEŁNY — nie uzupełniaj jako faktów o KOKU”. Notatki, receptury i prywatne źródła **nie są** dołączane automatycznie (tytuły prywatnych źródeł są ukrywane).
- **Poufne fragmenty**: zaznaczenie „zawiera poufny fragment” → okno z **dokładnym tekstem**, który zostanie wysłany, i licznikiem znaków → wysyłka dopiero po potwierdzeniu (serwer odrzuca bez `confirmedSend`). Domyślnie fragment **i odpowiedź** nie są zapisywane (w historii znacznik), a kolejne tury wysyłają do AI tylko znacznik. Zapis wyłącznie po zaznaczeniu zgody. Dla poufnych tur nie jest wywoływane nadawanie tytułu.
- **Ocena odpowiedzi** (`/trener/ocena`): ustrukturyzowana odpowiedź (Zod + structured outputs): werdykt, poprawność 0–100, **osobno jakość uzasadnienia 0–100** (trafienie bez zrozumienia ≤ 40), błędne przekonania, pytanie pogłębiające, kompetencje (filtrowane do istniejących kluczy); deklarowana pewność; historia ocen.
- **Słabe obszary**: oceny z niską poprawnością lub słabym uzasadnieniem trafiają do kontekstu kolejnych rozmów i do „Ostatnich błędów” na pulpicie.
- **Szkic AI karty składnika** (przycisk na karcie, tylko edytorzy): do AI idzie tylko nazwa, nazwa oryginalna i kategoria; wynik zapisany jako właściwości „do weryfikacji” ze źródłem typu „Szkic AI (model, data)”.
- **Kontrola kosztów**: modele z konfiguracji (`AI_MODEL=claude-sonnet-5-5`, `AI_MODEL_LIGHT=claude-haiku-5-5`), `effort: low`, limit tokenów odpowiedzi (3000), limit długości kontekstu (24 000 znaków, starsze wiadomości przycinane), limit wiadomości (4000 znaków), **6 zapytań/min na użytkownika**, **budżet dzienny 0,50 USD na użytkownika i miesięczny 5 USD łącznie** (szacowany z cennika; przy przekroczeniu 429 z komunikatem). Koszt widoczny w Trenerze i Ustawieniach.
- **Wyłączanie**: `AI_ENABLED=false` lub brak sekretu `ANTHROPIC_API_KEY` → trener pokazuje powód, reszta aplikacji działa.
- **Odporność**: typowane błędy SDK mapowane na polskie komunikaty (klucz, przeciążenie, połączenie, błąd modelu); SDK ponawia 429/5xx; obsługa `refusal` (z serwerowym fallbackiem `fallbacks: "default"` dla Sonneta 5.5) i `max_tokens`; w logach tylko kody błędów — **bez treści promptów**.

## 2. Testy — co faktycznie sprawdzono

`npm test` — **63/63**. Nowe (15) w `test/ai.test.ts`, z atrapą dostawcy; dodatkowo w setupie testów atrapa blokująca każde wywołanie prawdziwego API:
- konfiguracja: wyłączenie bez klucza / flagą, domyślne modele, odrzucenie niedozwolonego `effort`; szacowanie kosztów (nieznany model wyceniany drożej); przycinanie historii z zachowaniem naprzemienności ról;
- czat: SSE (`delta` → `done`), zapis obu tur, zapis kosztu; kontekst zawiera statusy, ostrzeżenie o niepełnym składzie i składniki; pierwsza instrukcja systemowa to stały prompt; tytuł przez Haiku;
- poufne: bez potwierdzenia 400; z potwierdzeniem — treść trafia do modelu, ale **w bazie nie ma jej ani w pytaniu, ani w odpowiedzi**; kolejna tura wysyła znacznik zamiast treści;
- prywatność rozmów (cudza → 404 dla odczytu/wysyłki/usuwania; pusta lista);
- awaria dostawcy → zdarzenie `error`, brak zapisanej odpowiedzi;
- ocena: struktura, filtrowanie nieznanych kompetencji, prywatność historii ocen; słabe obszary trafiają do kontekstu;
- szkic AI: learner 403; właściciel → wpisy „do weryfikacji” ze źródłem `ai_draft`;
- limit 6/min (7. i 8. → 429); budżet dzienny → 429 `ai_daily_budget`.

**Przeglądarka + prawdziwy kod SDK**: lokalna atrapa API Anthropic (emituje prawdziwy format SSE i odpowiedzi JSON) podpięta przez `AI_BASE_URL`. Przebieg na telefonie: nowa lekcja o pozycji KOKU → odpowiedź strumieniowana → zachowana po przeładowaniu → poufny fragment z oknem potwierdzenia → po przeładowaniu treść poufna niewidoczna (znacznik) → ocena odpowiedzi → „Ostatnie błędy” na pulpicie → szkic AI składnika → ustawienia z modelem i kosztem → tytuł nadany przez Haiku; **brak błędów JavaScript**. Zapis zapytań atrapy potwierdził: Sonnet 5.5 + nagłówek `server-side-fallback-2026-07-01` + `fallbacks: "default"`, Haiku bez fallbacku, `effort: low`, `cache_control` na instrukcji systemowej, `output_config.format` przy ocenie i szkicu.

## 3. Znane ograniczenia

- **Nie sprawdzono z prawdziwym API** — wymaga Twojego klucza Anthropic. Do lokalnego uruchomienia: wpisz `ANTHROPIC_API_KEY=...` w `.dev.vars` (plik nie trafia do Git). W produkcji: `wrangler secret put ANTHROPIC_API_KEY` (Etap 7).
- Koszt jest **szacunkiem** z cennika w kodzie (`src/worker/ai/config.ts`); rozliczenie wiążące jest w konsoli Anthropic. Zalecam ustawić też limit wydatków w konsoli Anthropic.
- Stała instrukcja jest krótsza niż minimalny rozmiar cache’owanego prefiksu, więc cache może nie zadziałać, dopóki kontekst nie urośnie (bez wpływu na poprawność).
- Odpowiedzi wyświetlane jako tekst z podziałem linii (bez formatowania Markdown).
- Poufne fragmenty wpisuje się w Trenerze ręcznie; wybór fragmentu z zaszyfrowanego sejfu dojdzie w Etapie 5.

## 4. Zmienione pliki

Nowe: `migrations/0005_ai_coach.sql`, `src/shared/ai.ts`, `src/worker/ai/{config,provider,prompts,context,usage}.ts`, `src/worker/modules/ai/routes.ts`, `src/client/lib/ai.ts`, `src/client/features/coach/{CoachPage,EvaluatePage}.tsx`, `test/ai.test.ts`.
Zmienione: `wrangler.jsonc`, `.dev.vars.example`, `package.json` (`@anthropic-ai/sdk` 1.8.0), `src/worker/db/schema.ts`, `src/worker/index.ts`, `src/worker/modules/{dashboard,ingredients}/routes.ts`, `src/shared/schemas.ts`, `src/client/{routes.tsx,features/layout/AppLayout.tsx,features/dashboard/DashboardPage.tsx,features/settings/SettingsPage.tsx,features/ingredients/IngredientDetailPage.tsx}`, `test/{api.test.ts,apply-migrations.ts}`, `vitest.config.ts`.
