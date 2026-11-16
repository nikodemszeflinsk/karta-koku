# ETAP 6 — PWA, zaproszenia, role pracowników, lokale: raport

Data: 2026-11-16. Lokalnie.

## 1. Co działa

- **PWA** (`vite-plugin-pwa` 2.0): manifest (nazwa, ikony 192/512 + ikona maskowalna, tryb `standalone`, język PL), ikona dla iOS, service worker z automatyczną aktualizacją. **Cache'owana jest tylko powłoka aplikacji** (JS, CSS, HTML, ikony). Odpowiedzi API, czyli dane prywatne, nigdy nie trafiają do pamięci offline, zgodnie z Twoją decyzją „na razie bez offline”. Rejestracja SW przez zewnętrzny plik, więc ścisłe CSP działa dalej.
- **Optymalizacja mobilna**: podział kodu na strony (lazy routes). Główny pakiet zmalał z ~600 kB do ~410 kB, a biblioteka Argon2 ładuje się dopiero w sejfie.
- **Zaproszenia** (`/zespol` → Zaproszenia):
  - właściciel lub administrator tworzy zaproszenie: e-mail, rola, opcjonalnie lokal;
  - link jest pokazywany **jeden raz**, w bazie zapisywany jest tylko skrót SHA-256 tokenu (256 bitów losowości);
  - zaproszenie jest ważne 7 dni, jednorazowe i można je odwołać;
  - osoba zaproszona otwiera `/zaproszenie/:token`, widzi e-mail, rolę i lokal, ustawia imię i hasło, po czym jest od razu zalogowana. Później może dodać passkey.
- **Role**: właściciel, administrator, trener, uczestnik — globalnie lub per lokal.
  - Tylko właściciel może nadać lub odebrać rolę administratora.
  - Ról właściciela nie da się zmienić ani usunąć.
  - Osoba bez uprawnień nie widzi zakładki „Zespół”.
- **Lokale**: dodawanie i usuwanie, liczba osób w lokalu, przypisywanie osób do lokali z rolą.
- **Widok zespołu**: właściciel i administrator widzą wszystkich, **trener widzi tylko osoby ze swoich lokali**. Widoczne są wyłącznie postępy: odpowiedzi i średnie zrozumienie z 30 dni, zaliczone poziomy, ostatnia aktywność. **Nigdy nie widać prywatnych notatek, receptur, rozmów ani sejfu.**
- **Audyt**: utworzenie i usunięcie lokalu, utworzenie, odwołanie i przyjęcie zaproszenia, nadanie i usunięcie roli.

Struktura pod przyszłe stanowiska, ścieżki nauki i grupy szkoleniowe jest gotowa przez przypisania per lokal. Osobne tabele grup dodam, gdy będą potrzebne.

## 2. Testy — co faktycznie sprawdzono

`npm test` — **103/103**. Nowe w `test/team.test.ts` (8):
- lokale może tworzyć tylko administrator lub właściciel;
- kto kogo może zaprosić: uczestnik → 403, administrator zapraszający administratora → 403, istniejące konto → 409, rola właściciela → 400;
- token przechowywany wyłącznie jako skrót i nieobecny w bazie;
- zaproszenie pokazuje dane publicznie po tokenie, przyjmuje się jeden raz, nowe konto loguje się i ma rolę globalną oraz rolę w lokalu;
- odwołane, wygasłe i nieznane tokeny → 404; statusy na liście się zgadzają;
- ochrona właściciela i roli administratora;
- trener widzi tylko swój lokal, bez prywatnych pól;
- wpisy w audycie.

**Przeglądarka, wersja produkcyjna** (`vite preview`, iPhone 13):
- manifest poprawny, service worker aktywny, 41 plików w cache, **żadnego `/api`**;
- utworzenie lokalu i zaproszenia;
- przyjęcie zaproszenia w osobnym kontekście przeglądarki i automatyczne logowanie;
- uczestnik nie widzi zakładki „Zespół”;
- ponowne użycie linku odrzucone;
- właściciel widzi nową osobę;
- brak przewijania w bok i **brak błędów JavaScript**.

## 3. Znane ograniczenia

- Zaproszenia nie są wysyłane e-mailem — link kopiujesz ręcznie (zgodnie z decyzją; e-mail wymagałby płatnej usługi).
- Instalacja na telefonie wymaga HTTPS, czyli wdrożenia (Etap 7). Lokalnie działa na `localhost`.
- Usunięcie konta użytkownika nie ma jeszcze interfejsu (można odebrać role).
- Wtyczka PWA zapisuje też nieużywane pliki manifestu do katalogu builda Workera — bez wpływu na działanie.

## 4. Zmienione pliki

Nowe: `src/shared/team.ts`, `src/worker/modules/team/routes.ts`, `src/client/features/team/{InvitePage,TeamPage}.tsx`, `public/{pwa-192,pwa-512,pwa-maskable-512,apple-touch-icon}.png`, `test/team.test.ts`.
Zmienione: `vite.config.ts` (PWA), `index.html`, `package.json` (`vite-plugin-pwa` 2.0.0), `src/client/routes.tsx` (lazy routes), `src/client/features/layout/AppLayout.tsx` (nawigacja zależna od roli), `src/worker/index.ts`.
