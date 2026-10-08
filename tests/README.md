# NEXTREP — testy regresyjne

> **Status: NOWY zestaw testów napisany 2026-10-06.**
> To nie jest historyczny zestaw 652/655 (+ SQL 102/102) ani jego odtworzenie. Tamten zestaw
> nigdy nie był w repozytorium i został utracony przy resecie środowiska roboczego. Ten zestaw
> napisano od zera na podstawie aktualnego `index.html` (commit `5228ecba`, md5
> `f840df30feba154b313ddfc85433aaf6`), historii Git i opisów etapów.
> **Wynik 140/140 nie jest porównywalny z 652/655.**

## Uruchomienie

Wymagania: Node.js ≥ 20 (sprawdzone na 22.22.0) i npm. Internet potrzebny tylko do `npm install`.

```bash
cd tests
npm install        # jednorazowo, instaluje esbuild, jsdom, react 18.3.1, react-dom 18.3.1
npm test           # build z ../index.html + wszystkie testy (~10 s)
npm run test:unit  # tylko testy logiki
npm run test:ui    # tylko testy UI (jsdom)
```

Gwarancje harnessu:
- `index.html` jest **tylko czytany**. Nic w kodzie aplikacji nie jest zmieniane.
- Testy nigdy nie łączą się z prawdziwym Supabase: `@supabase/supabase-js` jest podmieniony na
  fake w pamięci (`harness/stubs/supabase-js.mjs`).
- Strefa czasowa testów: `Europe/Warsaw` (domyślnie, z przejściami DST). Można ją nadpisać przez `TZ=...`.

## Jak to działa

`harness/build.mjs`:
1. Wycina z `../index.html` skrypt `<script type="text/babel">` (kod aplikacji).
2. Podmienia **jedyną** linię `createRoot(...).render(<App />);` na `export { … }` wszystkich
   funkcji i stałych najwyższego poziomu (~410 nazw). Testy wywołują więc **prawdziwe funkcje
   produkcyjne**, a nie ich kopie.
3. Buduje bundle przez esbuild do `harness/.build/` (katalog ignorowany przez git).
   `lucide-react` zastępuje stub z samymi ikonami.

`harness/load-app.mjs` ładuje bundle w jsdom (window, document, localStorage). Sprawdza też,
czy bundle pochodzi z aktualnego `index.html` (md5). Jeśli nie, test kończy się błędem „stale”.

`node harness/build.mjs --ref <commit>` buduje `index.html` ze starszego commita przez
`git show` (working tree nie jest ruszany). Z tego korzysta test cross-version.

## Struktura

| Plik | Testy | Zakres |
|---|---|---|
| `unit/progression.test.mjs` | 43 | parsery zakresu/RIR, objętość wg rodzaju, hierarchia sygnałów `comparePerformances`, **overshoot** (`repsAboveRange`), statusy silnika (baseline / green / yellow / red / stagnation), przerwa >14 dni, notatki (gorszy dzień, za ciężko), sugestia „można rozważyć zwiększenie”, okno 10 wykonań, chronologia historii (brak „przecieku przyszłości” przy backfillu) |
| `unit/progression-crossversion.test.mjs` | 5 | silnik aktualny vs `c07a61d` (sprzed overshoot): 2000 losowych, deterministycznych przypadków. Różnice dopuszczalne **tylko** tam, gdzie decydują powtórzenia powyżej zakresu. Test jest przypięty do etapu overshoot (patrz niżej) |
| `unit/muscle-groups.test.mjs` | 39 | MGW-001: słownik 10 partii, mapa atlasu (61), tylko partia główna (bez podwójnego liczenia), jednostki kg/powt./s rozdzielone, dropsety pominięte, okno dat, „brak porównania” (inne ćwiczenia / inna jednostka), chronologia z `session.date`. MGW-002: `buildMuscleCategory` (kolejność słownikowa), `readMuscleSelection` (atlas tylko do odczytu, stare kategorie, legacy „Nogi”), filtry (+Cardio, „Partia nieokreślona” tylko gdy potrzebna), odznaki |
| `unit/dates-dashboard.test.mjs` | 19 | `editedSessionDateIso` (ten sam dzień = ten sam timestamp, inny dzień = ta sama godzina lokalna, DST), `toLocalDateStr`, Dashboard: kroczące 30 dni zakotwiczone na ostatnim treningu, `computeDashboardSummary`, `getNextPlan`, `summarizeActiveWorkoutDraft`, `findMatchingSessions` |
| `unit/accounts-storage.test.mjs` | 22 | namespace’y gość/A/B, izolacja danych, device_id per konto, jednorazowa niedestrukcyjna migracja kluczy `trainapp_*`, marker inicjalizacji konta + bramka sync, `hasLocalAccountData`, snapshot/restore/clear jednego konta, `startAccountEmpty`, `checkCloudAccountData` (fake), teksty błędów offline |
| `unit/sync-queue.test.mjs` | 10 | lokalna kolejka sync: dedup, walidacja, izolacja per konto, uszkodzony JSON, klasyfikacja błędów, backoff, kolejność zależności tabel, szkic treningu poza synchronizacją |
| `ui/components.test.mjs` | 14 | jsdom + React 18.3.1: `DateField` (dd.mm.rrrr, brak przyszłych dat, nieistniejące daty), `ExerciseEditorModal` (partia główna + drugorzędne → `category`, atlas tylko do odczytu, legacy „Nogi”), `LoginScreen` offline |
| `ui/app-flows.test.mjs` | 7 | pełna `<App/>` jako gość: start bez zapisów do chmury, podsumowanie 30 dni, karta „Kontynuuj trening” (otwiera tylko przycisk, szkic zostaje), następny plan |
| `unit/workspace-hardening.test.mjs` | 6 | Stage 4A.2: warunek w `saveDataToCloud` (tylko workspace bieżącej sesji), przypięty SDK Supabase 2.117.2 w importmap, `purgeDeletedAccountData` (tylko usunięte konto i jego kopie), `cancelScheduledSync` |
| `ui/workspace-isolation.test.mjs` | 7 | Stage 4A.2 w pełnej `<App/>`: gość offline → odzyskana sesja w trakcie treningu gościa (przełączenie wstrzymane do zakończenia lub przerwania, komunikat, dane gościa nie trafiają do konta), usunięcie konta (sukces i błąd), anulowanie zaplanowanych sync przy zmianie workspace’u, A → wylogowanie → B → wylogowanie → A (dane, szkic, lokalne PRO) |
| `unit/source-selection-hardening.test.mjs` | 29 | Stage 4A.3: stronicowanie `fetchRemoteTable` (>1000 wierszy, limit serwera, błąd strony), blokada „Wczytaj z chmury” przy szkicu / niewysłanej kolejce / otwartych konfliktach, czekanie na trwający sync i anulowanie przy zmianie konta, trwały stan `loading_cloud` (zapis przed czyszczeniem, idempotentny retry, rollback), wysyłka danych urządzenia do pustej chmury z trwałym stanem `uploading_device` (zapis przed pierwszym zapisem w chmurze, ponowne sprawdzenie chmury, błąd + retry, restart przed / po częściowej wysyłce, obce wiersze, zmiana konta, izolacja gościa) |
| `unit/source-selection-part2.test.mjs` | 26 | Stage 4A.3: „Przenieś dane do konta” tylko jako chronione narzędzie naprawcze (marker `ready`, sync niewstrzymany, właściwa przestrzeń, brak trwającej operacji), retencja kopii `BEFORE_CLOUD_RESTORE` (2 najnowsze na konto, aktywna i właśnie tworzona chronione — również przy cofniętym zegarze, B / gość / inne rodzaje nietknięte), blokada „Zacznij od pustych danych” (szkic / kolejka / konflikty), status migracji V1 tylko w przestrzeni, w której ją rozpoczęto, stronicowana weryfikacja V1 (>1000 wierszy, limit serwera, błąd strony, inny użytkownik), before-restore: kontrola konta i przestrzeni |
| `ui/source-selection.test.mjs` | 14 | Stage 4A.3 w pełnej `<App/>`: stany ekranu wyboru źródła, wczytanie z chmury + potwierdzenie / powrót do kopii, blokada przez szkic treningu, restart podczas wczytywania (A–D), retry, urządzenie → pusta chmura (sukces, błąd, zmiana chmury, dane gościa) |
| `ui/source-selection-closure.test.mjs` | 20 | Stage 4A.3 w pełnej `<App/>`: scenariusze A–J z audytu (nowe konto, tylko chmura, konto zainicjalizowane, A → B → A, dane gościa — od 4A.4 oferta i „Nie teraz”, sesja odzyskana przy starcie, błąd sieci), nieznany marker, „wróć do danych z urządzenia” tylko gdy możliwe, cykl życia wskaźnika restore, przerwana wysyłka po restarcie, blokady w UI, brak starego „Pobierz / Przywróć dane z chmury” |
| `ui/source-selection-dead-ends.test.mjs` | 7 | Stage 4A.3: żadna akcja wyboru źródła nie zostawia spinnera bez przycisków (nieudane sprawdzenie konta przy wczytaniu z chmury, wysyłce, pustych danych, ponowieniach i „Wybierz ponownie”), nieaktualna akcja nie działa dalej i nie przejmuje ekranu nowego przepływu |
| `unit/v1-workout-exercise-identity.test.mjs` | 10 | Hotfix I-1: migracja V1 zapisuje ćwiczenia treningu z `legacy_id = ex.id` (jak sync; id powtórzone w kilku sesjach zostaje przy `-posN`), więc PULL po uploadzie nie dubluje ćwiczeń ani serii (objętość i werdykt progresji bez zmian), idempotencja V1 → V1 → PULL → PULL, tożsamość serii bez zmian, zgodność z wierszami `<workoutId>-posN` (przejęcie jednego jednoznacznego wiersza, bez drugiego rekordu; wiersz kanoniczny wygrywa; inny / niejednoznaczny wiersz nietknięty), narzędzie naprawcze |
| `ui/v1-identity-device-upload.test.mjs` | 1 | Hotfix I-1 w pełnej `<App/>`: 4A.3 urządzenie → pusta chmura → sync → reload → sync, historia, objętość i progresja bez zmian |
| `unit/v1-integrity-gate.test.mjs` | 26 | Stage 4A.4 Part 1 (I-2): bramka integralności V1 przed pierwszym zapisem w chmurze (powtórzone id treningów, serii — także `1` vs `"1"`, planów, pozycji planów, serii planów — także syntetyczne `<item>-<i>`, pomiarów; powtórzone `ex.id` nadal jak w I-1), przygotowanie kopii do wysyłki (bez mutacji wejścia, idempotentne, niezależne od kolejności planów, kolejność / daty / wartości / `exerciseId` bez zmian), weryfikacja tabel potomnych z relacją do rodzica (+ stronicowanie), 4A.3 urządzenie → pusta chmura z powtórzonymi id (kopia zapasowa oryginału, PULL nic nie dodaje), F-1 (wznowienie wysyłki rozpoczętej bez przygotowania → odmowa, zero zapisów; co ta odmowa blokuje: osierocone wiersze → duplikaty po PULL) |
| `unit/guest-migration-core.test.mjs` | 51 | Stage 4A.4 Part 1: gość → puste konto — co jest „danymi gościa”, sukces (kopia przygotowana, gość bajt w bajt bez zmian, bez szkicu i PRO, nazwa tylko do pustego konta), kopia `BEFORE_GUEST_MIGRATION` (oryginał, gość, cel / odcisk / próba, bez PRO), kolejność przed pierwszym zapisem w chmurze, odmowy bez żadnych zapisów (dane konta lokalnie / w chmurze, nazwa w profilu, migracja innego konta, zły format, integralność, błąd kopii, brak danych, zmiana konta), zmiana chmury tuż przed wysyłką, błąd + ponowienie, restart w trakcie wysyłki i kopiowania, wznowienie bez zmiany id (F-1 po stronie gościa, nieznana faza markera), „naprawdę puste” konto (edycja wbudowanego ćwiczenia lokalnie / w chmurze, niewysłane zmiany, konflikty), atlas ćwiczeń przy braku listy u gościa, porzucenie, A → B (także w trakcie wysyłki V1), podwójny start, retencja (deterministyczne znaczniki czasu), usunięcie konta |
| `ui/guest-migration.test.mjs` | 10 | Stage 4A.4 Part 1 w pełnej `<App/>`: oferta → przeniesienie → sync → reload → sync bez duplikatów (I-1), „Nie teraz”, brak oferty dla niepustego konta / chmury / edycji wbudowanego ćwiczenia / migracji innego konta, przerwane przenoszenie po restarcie (dokończenie, powrót bez przenoszenia), aktywny trening gościa (wstrzymanie, Zakończ, Przerwij — szkic zostaje u gościa) |
| **Razem** | **366** | |

Poprawki po production smoke test (19 testów dopisanych do 140): podwójna kropka w tekstach
overshoot/stagnacji (+ strażnik „..” na macierzy 4 × 2000 przypadków), `ChartCard showDelta`
(wykres partii bez delty w nagłówku; przypadek 1800 → 2160 → Dipsy 240 w Statystykach),
osobny kafel „Łydki” w atlasie (assety przypięte hashem SHA-256).

## Czego ten zestaw nie obejmuje (brak pokrycia — świadomie)

| Obszar (był w historycznym zestawie) | Dlaczego go tu nie ma | Co by było potrzebne |
|---|---|---|
| Pełny harness silnika sync (push/pull/apply, bootstrap meta, konflikty) z seedowanymi danymi i fake’iem Supabase | utracony przy resecie, za duży, żeby napisać go wiarygodnie bez specyfikacji przypadków | osobny etap: nowe testy scenariuszy z `SYNC_AND_MIGRATION.md` |
| **3 znane P1 (bootstrap sync, odroczone do Stage 2.2)** | należały do powyższego harnessu. **Nie da się ich teraz ponownie zweryfikować.** Status „odroczone” pochodzi z opisu commita `5228ecba`, nie z nowego uruchomienia | jak wyżej |
| SQL 102/102 (Postgres) | wymagały lokalnego Postgresa ze stubem schematu `auth`/Supabase; skrypty utracone | lokalny Postgres + nowe testy RLS/RPC dla `supabase/*.sql` |
| Testy UI w Chromium (puppeteer) | utracone; jsdom nie sprawdza layoutu, CSS, natywnego date pickera, audio timera przerwy | Chromium w środowisku + skrypty E2E |
| Pozostała część z ~650 testów | nie ma ich listy ani kodu | — |

## Zasady dla kolejnych sesji (Claude / ludzie)

1. **Nie zmieniaj testów tylko po to, żeby przechodziły.** Czerwony test to najpierw analiza: czy
   zmieniło się zachowanie aplikacji, czy test zakładał coś błędnie. Decyzję i powód zapisz w raporcie.
2. Nowy etap = nowe testy w odpowiednim pliku (albo nowy plik `unit/<obszar>.test.mjs`).
3. `progression-crossversion` jest przypięty do `c07a61d` i etapu overshoot. Przy **zamierzonej**
   zmianie silnika zaktualizuj świadomie `REF` albo regułę dopuszczalnych różnic i opisz to w commicie.
4. Asercje na elementach DOM: używaj `assert.ok(!el)` / `assert.ok(el)`, a nie `assert.equal(el, null)`.
   Diff obiektu jsdom potrafi zająć całą pamięć i proces zostaje ubity (SIGKILL).
5. Testy UI renderują prawdziwe komponenty. Dane wejściowe (np. szkic treningu) buduj funkcjami
   aplikacji (`buildBlocksFromPlan`), a nie ręcznie zgadywanym kształtem.

## Weryfikacja, że testy wykrywają regresje (2026-10-06)

Na **kopii** `index.html` w katalogu tymczasowym (oryginał nietknięty) wprowadzono 4 celowe błędy.
Każdy został wykryty:

| Mutacja | Nieudane testy |
|---|---|
| usunięty sygnał overshoot (`repsAboveRange`) | 2 |
| okno Dashboardu 30 → 31 dni | 1 |
| kolejność partii drugorzędnych = kolejność kliknięć | 4 |
| partie drugorzędne liczone do obciążenia | 1 |

## Obserwacja (bez zmian w kodzie)

Szkic treningu, który przechodzi walidację `loadActiveWorkoutDraft` (`version: 1`, tablica `blocks`),
ale ma niekompletne pozycje (np. bez `setsDetail`), powoduje błąd renderu `ActiveWorkout` po
„Wróć do treningu”. Szkice zapisuje wyłącznie aplikacja, więc ryzyko jest niskie. Zapisane jako
kandydat do osobnego etapu.
