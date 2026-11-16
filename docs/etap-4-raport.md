# ETAP 4 — nauka, egzaminy, kompetencje, powtórki: raport

Data: 2026-11-16. Lokalnie; AI testowane wyłącznie atrapą.

## 1. Co działa

- **Akademia** (`/akademia`): 17 kategorii → moduły (z przypisanym poziomem) → lekcje; znacznik ukończenia; „Ćwicz” z każdej kategorii. Edytor: nowy moduł, nowa lekcja, **szkic lekcji AI** (lekcja + 4–6 pytań, zapisane jako „do weryfikacji” w module „Szkice AI”; do AI idzie tylko kategoria, poziom, temat i lista kompetencji).
- **Lekcja** (`/akademia/lekcja/:id`): treść, status wiarygodności z ostrzeżeniem, kompetencje, „Oznacz jako ukończoną”, „Sprawdź się” (ćwiczenie z pytań lekcji); edycja z wersjonowaniem; zarządzanie pytaniami.
- **10 typów pytań** z walidacją na serwerze: otwarte, jednokrotny i wielokrotny wybór, uzupełnij skład, rozpoznaj składnik, dopasuj surowiec do zastosowania, analiza błędu, scenariusz kuchenny, wyjaśnij proces, porównaj produkty. Każde pytanie ma wzorcową odpowiedź (kryteria), trudność, kompetencje, status i źródło.
- **Ocenianie** — ocenia zrozumienie, a nie tylko trafienie:
  - typy zamknięte oceniane automatycznie; jeśli dopiszesz uzasadnienie, trener AI ocenia jego jakość;
  - pytania otwarte ocenia AI (poprawność i uzasadnienie osobno);
  - gdy AI jest niedostępne, pokazuje się wzorzec i samoocena;
  - **bez uzasadnienia poprawna odpowiedź liczy się do opanowania najwyżej w 70%**, a przy deklarowanej niskiej pewności jeszcze mniej.
- **Egzaminy** (`/egzaminy`):
  - ćwiczenie (5 pytań), egzamin z kategorii (12 pytań, próg 70), **egzamin na poziom** (20 pytań z kompetencji poziomu, próg poziomu);
  - po każdej odpowiedzi widoczny wynik, wzorcowa odpowiedź i poprawne opcje;
  - wynik końcowy = średnie zrozumienie; pytania bez odpowiedzi liczą się jako 0;
  - historia podejść;
  - pytania ze statusem „brak informacji” są wykluczone z egzaminów.
- **Kompetencje i poziomy**: każda odpowiedź aktualizuje opanowanie kompetencji przypisanych do pytania (średnia, potem średnia krocząca). **Poziom jest zaliczony dopiero, gdy każda kompetencja osiągnie próg przy minimalnej liczbie ocenionych odpowiedzi i zdasz egzamin na ten poziom.**
- **Powtórki** (`/powtorki`):
  - algorytm FSRS-7 (`ts-fsrs` 6);
  - każda odpowiedź (z egzaminu lub powtórki) planuje kolejną powtórkę;
  - kolejka zaczyna od najsłabszych kompetencji, potem od pytań z największą liczbą pomyłek;
  - dziennik każdej powtórki: data, ocena, pewność, wynik, następny termin.
- **Postępy** (`/postepy`): poziomy z paskami opanowania i progami, stan egzaminu, kategorie (średnie zrozumienie), statystyki (odpowiedzi, ostatnie 30 dni, zaległe powtórki, ukończone lekcje).
- **Pulpit**: ostatnia lekcja; **polecana lekcja** (nieukończona, rozwijająca najsłabszą kompetencję, z poziomu docelowego); liczba dzisiejszych powtórek; opanowanie kompetencji poziomu docelowego; ostatnie błędy (z egzaminów, powtórek i ocen AI); postęp w kategoriach.
- **Wyszukiwarka** obejmuje lekcje i pytania. Indeksowana jest wyłącznie treść pytania; wzorcowa odpowiedź nie trafia do indeksu, więc nie wycieknie przez fragmenty wyników.
- **Nawigacja na telefonie**: Pulpit / Akademia / Trener / Powtórki / Więcej.

## 2. Testy — co faktycznie sprawdzono

`npm test` — **78/78**. Nowe w `test/learning.test.ts` (15):
- reguły oceniania dla każdego typu zamkniętego; ograniczenie do 70 bez uzasadnienia; kara za niską pewność; mapowanie na oceny FSRS; uśrednianie opanowania; FSRS planuje dobrą odpowiedź później niż błędną i liczy pomyłki;
- tylko edytor tworzy moduły i lekcje oraz widzi pytania z odpowiedziami (learner → 403); walidacja pytań (np. jednokrotny wybór bez poprawnej opcji → 400);
- quiz nie zdradza poprawnych odpowiedzi ani wzorca; cudze podejście → 404; podwójna odpowiedź → 409; odpowiedź po zakończeniu → 409;
- awaria AI → samoocena, nic nie zapisane przed samooceną;
- wynik egzaminu liczony ze zrozumienia; powtórka oceniona przez AI i przeplanowana; dziennik powtórek;
- postępy: opanowanie po 2 odpowiedziach, ukończone lekcje, kategorie; **poziom niezaliczony mimo pełnego opanowania, dopóki nie zdasz egzaminu**, a po zdaniu zaliczony;
- quiz bez pytań → 409; szkic AI zapisuje tylko poprawne pytania (2 z 3), ze statusem „do weryfikacji” i źródłem AI;
- endpoint „następna lekcja”; wzorcowe odpowiedzi nie są wyszukiwalne.

**Przeglądarka** (iPhone 13 + desktop, atrapa API Anthropic):
- utworzenie modułu i lekcji z kompetencją;
- dodanie 3 pytań w edytorze (jednokrotny wybór, dopasowanie, wyjaśnij proces);
- oznaczenie lekcji jako ukończonej;
- ćwiczenie z oceną AI (wynik 79 = (79 + 70 + 88) / 3, zgodnie z regułami);
- postępy i powtórka z przeplanowaniem;
- pulpit z ostatnią lekcją, opanowaniem i postępem;
- brak przewijania w bok i **brak błędów JavaScript**.

Błąd znaleziony w tym teście i naprawiony: po odpowiedzi ekran od razu przechodził do następnego pytania, więc wynik i wzorzec znikały. Teraz zostają widoczne do kliknięcia „Następne pytanie”.

## 3. Znane ograniczenia

- Treści (lekcje, pytania) trzeba utworzyć: ręcznie albo szkicami AI (wymaga klucza API). Baza startuje bez lekcji — celowo, bez fikcyjnych treści.
- Ocena przez AI z prawdziwym modelem nie była sprawdzona (brak klucza).
- Egzamin na poziom zależy od liczby pytań przypisanych do kompetencji danego poziomu.
- Kod klienta to jeden pakiet ~600 kB (ostrzeżenie Vite o rozmiarze) — podział na części w Etapie 6 (PWA).

## 4. Zmienione pliki

Nowe: `migrations/0006_learning.sql`, `src/shared/learning.ts`, `src/worker/learning/{grading,srs,service}.ts`, `src/worker/modules/learning/routes.ts`, `src/client/features/learning/{QuestionRunner,QuestionEditor,ExamsPage,ReviewsPage,ProgressPage}.tsx`, `src/client/features/academy/LessonPage.tsx`, `test/learning.test.ts`.
Zmienione: `package.json` (`ts-fsrs` 6.0.0), `src/worker/db/schema.ts`, `src/worker/index.ts`, `src/worker/modules/{ai,dashboard}/routes.ts`, `src/worker/ai/prompts.ts`, `src/shared/{ai,knowledge,schemas}.ts`, `src/client/{routes.tsx,features/academy/AcademyPage.tsx,features/dashboard/DashboardPage.tsx,features/layout/AppLayout.tsx,features/search/SearchPage.tsx}`.
