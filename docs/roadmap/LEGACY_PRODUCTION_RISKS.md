# Rejestr ryzyk starej produkcji (wersja na `main`)

Wersja 1 · 11.10.2026 · status: **rejestr** (dokumentacja, bez zmian w kodzie)

## Zakres

Dotyczy aplikacji, której dziś używasz: gałąź `main` (`01f1e8b`), wdrożenie Vercel, produkcyjny projekt
Supabase. NEXTREP 1.0 startuje od czystej struktury danych, więc te ryzyka nie są naprawiane w 1.0.
Trwają jednak do wyłączenia starej wersji (STORE FIRST D9, decyzja otwarta) i dotyczą Twoich bieżących
treningów.

Decyzja F-6 (11.10.2026): **nie zmieniamy teraz `main`**. Każda poprawka na `main` wymaga osobnej
decyzji. Działania w kolumnie „Ograniczenie bez zmian w kodzie” możesz wykonać sam.

## Rejestr

| # | Ryzyko | Dowód | Skutek | Prawdop. | Ograniczenie bez zmian w kodzie | Stan |
| --- | --- | --- | --- | --- | --- | --- |
| L01 | **Ciężar z przecinkiem („62,5”) trafia do chmury jako `null`** (stary i nowy klient, synchronizacja i V1) | `docs/sql/README.md` §8: „NIE poprawione: zmiana zmieniłaby porównanie sync i mogłaby nadpisać lokalne dane wartością z chmury” | na drugim urządzeniu lub po wczytaniu z chmury ciężar znika; lokalnie dane są poprawne | wysokie przy ułamkowych ciężarach | regularny eksport JSON z urządzenia głównego; nie wczytywać danych z chmury na urządzenie główne. Do sprawdzenia: czy wpis z kropką („62.5”) omija błąd (niezweryfikowane) | otwarte, zgłoszone (F-6) |
| L02 | Kolejność ćwiczeń i serii w planach nie jest synchronizowana | brak `position` dla planów, ćwiczeń planu i serii planu (MASTER PLAN §3.1; Etap 13 zaparkowany) | inna kolejność na drugim urządzeniu | wysokie przy dwóch urządzeniach | używać jednego urządzenia do edycji planów | otwarte |
| L03 | Kopie lokalne w jednej wartości `localStorage` (limit ok. 5 MB); zapis kopii może się nie udać bez komunikatu | `09-backups.jsx` (jedna lista, zapis zwraca `null`); audyt STORE FIRST | brak kopii w chwili potrzeby | rośnie z historią | regularny eksport JSON do pliku poza przeglądarką | otwarte |
| L04 | Import JSON i przywracanie kopii nie sprawdzają, czy kopia bezpieczeństwa się zapisała; import nadpisuje całe listy i omija kolejkę synchronizacji | `13-account-ui.jsx:1564`, `:1591`; audyt STORE FIRST | przy pełnej pamięci import lub przywrócenie bez możliwości cofnięcia; skutek dla chmury niezweryfikowany | niskie | przed importem ręcznie wyeksportować aktualne dane | otwarte |
| L05 | Produkcyjny Supabase na planie Free | audyt STORE FIRST (10.10, nie sprawdzano ponownie) | brak kopii zapasowych bazy; projekt może zostać wstrzymany po okresie bezczynności | średnie | dane lokalne + eksport JSON jako kopia; regularne używanie | otwarte (D6) |
| L06 | Brak automatycznych testów push / pull / konfliktów | harness utracony (`tests/README.md`); zostało 10 testów kolejki | regresje synchronizacji niewykrywane | — | brak zmian na `main` (F-6) ogranicza ryzyko nowych regresji | otwarte |
| L07 | Logowanie offline: aplikacja proponuje tryb gościa | `STAGE_STATUS.md` (4A.6 OPEN) | trening wpisany offline może trafić do przestrzeni gościa zamiast konta | średnie przy treningu bez sieci | przed treningiem bez sieci sprawdzić, że aplikacja jest na koncie | otwarte |
| L08 | Lokalne ścieżki PRO (tryb testowy, „reklama” bez reklamy, PRO z importu kopii) | audyt STORE FIRST, `hasProAccess` | dostęp PRO bez płatności (dotyczy modelu biznesowego, nie danych) | — | brak (jedyny użytkownik) | otwarte |
| L09 | Błędne liczby na ekranach: rekordy z „57,5” (NaN), dropsety w rekordach; ekran szczegółów ćwiczenia liczy przecinek jako 0 kg | B24, B25 w MASTER PLAN | błędne rekordy i objętość na ekranie (dane zapisane bez zmian) | wysokie przy ułamkowych ciężarach | brak (tylko wyświetlanie) | otwarte |
| L10 | Serwerowe PRO: weryfikacja wdrożenia oczekuje | `STAGE_4A_PLAN.md` 4A.7 | niepewny stan uprawnień | niskie | — | otwarte |

## Zasady

- Rejestr nie uruchamia zmian. Poprawka na `main` = osobna decyzja z planem testów.
- Przed wyłączeniem starej wersji (D9): eksport Twoich danych do pliku (archiwum; 1.0 nie importuje
  formatu starej wersji — ustalenie stałe).
