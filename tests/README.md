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
| **Razem** | **159** | |

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
