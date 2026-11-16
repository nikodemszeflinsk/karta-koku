# ETAP 2 — baza wiedzy: raport

Data: 2026-11-16. Lokalnie; bez zasobów w chmurze.

## 1. Co działa

- **Źródła** (`/zrodla`): typy materiał użytkownika / oficjalny KOKU / literatura / strona / obserwacja / szkic AI; prywatne lub wspólne; licznik użyć; usuwanie zablokowane, gdy źródło jest używane.
- **Laboratorium składników** (`/skladniki`): nazwa PL, oryginalna, transliteracja, kategoria, pochodzenie, opis; **właściwości per aspekt** (skład, fizyczne, chemiczne, smak i aromat, tekstura, zastosowanie, podgrzewanie, chłodzenie, wpływ na strukturę, typowe błędy, przechowywanie) — każda ze swoim statusem i źródłem; **14 alergenów UE** ze statusem; **zamienniki** z kontekstem i konsekwencjami; „występuje w karcie”; notatki; historia zmian.
- **Techniki** (`/techniki`): opis mechanizmu, kategoria, status, źródło, notatki.
- **Karta KOKU** (`/karta`): wersje karty; zakładki **standard / premium / wkładki sezonowe / promocje** (nigdy nie łączone); grupy wg rodzaju; pozycja: numer, porcja, cena, technika, tekstura, smak, skład (z rolą: składnik/komponent/sos/posypka/dekoracja, powiązanie z kartą składnika), alergeny, aktualność, „skład niepełny”.
- **Import publicznych materiałów KOKU** (migracja `0004`, generowana skryptem `scripts/build-koku-import.py`): 37 pozycji — 9 z wkładki jesień–zima 2026 (składniki i ceny dosłownie ze źródła), 12 nazw premium, 15 pozycji promocji z 12.2025 (oznaczone „aktualność do sprawdzenia”), warzywka do zestawów. **Wszystko ze statusem „do weryfikacji” i „skład niepełny”.** Alergenów nie przepisano (w źródłach to kolorowe kropki — zbyt ryzykowne do odczytu na oko); karty standardowej nie zaimportowano (źródło ma tylko numery 1–131).
- **Receptury** (`/receptury`) — **prywatne**: składniki z ilościami, komponenty (inne receptury, z blokadą cykli), sposób przygotowania, flaga „poufna” (treść nie trafia do wyszukiwarki).
- **Notatnik** (`/notatnik`) — **prywatny**: 6 rodzajów notatek, powiązania ze składnikami, daniami, technikami, kategoriami i własnymi recepturami, oznaczanie „wyjaśnione”; sekcja „Moje notatki” na kartach składnika/dania/receptury/techniki.
- **Wyszukiwarka** (`/szukaj`): FTS5 w D1, ranking BM25, podświetlenie fragmentów; polskie znaki opcjonalne (także „ł”: „lososiem” → „łososiem”); prywatne treści widzi tylko właściciel.
- **Pulpit**: liczba wpisów w kategoriach, otwarte pytania z notatnika.
- Nawigacja: telefon — Pulpit / Składniki / Karta / Notatnik / Więcej; komputer — pełny pasek boczny.

## 2. Zasady wiarygodności (wymuszane na serwerze)

- „Potwierdzone” wymaga źródła typu *materiał użytkownika* lub *materiał oficjalny* — nigdy szkicu AI ani braku źródła (400 z komunikatem przy polu).
- Źródło musi istnieć i być widoczne dla użytkownika (cudzych prywatnych źródeł nie da się podpiąć).
- Brakujących składników dań nie uzupełniamy — „skład niepełny” jest domyślny.

## 3. Wersjonowanie i spójność

- Optymistyczne blokowanie (`expectedVersion`) dla składników, właściwości, technik, pozycji karty, receptur — równoległa edycja → 409.
- Tabela `content_revisions`: migawka poprzedniej wersji przy każdej zmianie i usunięciu; podgląd „Historia zmian” na karcie składnika.
- Zapis treści i indeksu wyszukiwania w jednej transakcji (D1 batch). Obejście błędu Drizzle (`db.run` z parametrami nie działa w batchu D1) — tabela FTS ma typowany uchwyt w `src/worker/db/search-table.ts`, poza schematem migracji.
- Unikalność nazw składników i technik bez względu na wielkość liter i polskie znaki (kolumna `name_key`; `lower()` w SQLite nie obsługuje „Ż”).

## 4. Testy — co faktycznie sprawdzono

`npm test` — **48/48** (Workers runtime, prawdziwe migracje). Nowe w etapie 2:
- import KOKU: 1 wersja, 37 pozycji, rozdzielone tiery, wszystko „do weryfikacji”, skład dosłowny, cena, brak alergenów;
- wyszukiwanie: zwijanie „ł”, prefiksy, operatory FTS traktowane jako tekst, walidacja zapytania;
- uprawnienia: learner czyta, nie edytuje wiedzy wspólnej; edycja przez trenera/właściciela;
- duplikat nazwy niezależnie od wielkości liter i ogonków → 409;
- „potwierdzone” bez źródła i ze źródłem AI → 400; ze źródłem oficjalnym → OK;
- blokada wersji (409) i zapis rewizji;
- alergeny (nieznane → 400), zamiennik sam dla siebie → 400, usunięcie używanego źródła → 409;
- prywatność: cudza receptura/notatka → 404 dla odczytu, edycji i usuwania; brak w listach i w wyszukiwarce; treść poufnej receptury nieindeksowana; nie można podpiąć cudzej receptury do notatki; prywatne źródło niewidoczne i niepodpinalne dla innych;
- cykle w recepturach (bezpośrednie i pośrednie) → 400.

`npm run typecheck` — bez błędów. `npm run build` — OK.

**Przeglądarka** (iPhone 13 + desktop 1366 px, czysta baza): pulpit → karta (zakładki sezonowe/premium/standard) → szczegóły dania (ostrzeżenie o niepełnym składzie) → nowy składnik → właściwość „potwierdzone” bez źródła odrzucona z komunikatem → zapis jako wiedza ogólna → powiązanie składnika w składzie dania → notatka z powiązaniem → receptura ze składnikiem → wyszukiwanie „lososiem” i brak trafień w treści poufnej → źródła przez „Więcej”; brak poziomego przewijania; **brak błędów JavaScript**.

## 5. Znane ograniczenia

- Alergeny pozycji KOKU trzeba wprowadzić ręcznie z karty alergenów w lokalu.
- Karta standardowa jest pusta (poza „Warzywkami”) — źródło publiczne nie zawiera nazw.
- Brak paginacji list (limit 500 składników / 300 notatek) — wystarczające dla jednego użytkownika.
- Lista rozwijana składników przy zamiennikach/składzie dania ładuje wszystkie nazwy (do ~500).
- Treści wyświetlane jako zwykły tekst z podziałem linii (bez Markdown) — świadomie, bez powierzchni XSS.

## 6. Zmienione pliki

Nowe: `migrations/0002–0004*`, `scripts/build-koku-import.py`, `src/shared/{knowledge,text}.ts`, `src/worker/db/search-table.ts`, `src/worker/lib/{knowledge,search,errors}.ts`, `src/worker/modules/{sources,ingredients,techniques,menu,recipes,notes,search}/routes.ts`, `src/client/components/knowledge.tsx`, `src/client/lib/use-api-mutation.ts`, `src/client/features/{ingredients,menu,notes,recipes,sources,techniques,search}/*`, `test/{knowledge,text}.test.ts`.
Zmienione: `src/worker/db/schema.ts`, `src/worker/index.ts`, `src/worker/modules/dashboard/routes.ts`, `src/shared/schemas.ts`, `src/client/{routes.tsx,features/layout/AppLayout.tsx,features/dashboard/DashboardPage.tsx,features/settings/SettingsPage.tsx}`, `test/api.test.ts`, `README.md`.
