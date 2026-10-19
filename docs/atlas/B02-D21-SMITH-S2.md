# Maszyna Smitha — kontrakt zapisu (B02-D25 A, etap B02/S2)

19.10.2026 · gałąź `release/1.0` · status: **wdrożone w silniku (S2)**; UI karty i raportu — S6

> **Ślad zastąpienia.** Pierwsza wersja tej notatki (18.10.2026, B02-D21 / D-3 = S2) proponowała zapis
> Smitha istniejącymi modelami: pełny ciężar (opór początkowy + talerze) jako `barbell_total`, same talerze
> jako `plate_loaded`, z rozróżnieniem tylko przez `loadModel`. **Ta propozycja jest zastąpiona** decyzją
> B02-D25 A i uzgodnieniami S2 (18–19.10.2026): Smith ma własny model `smith_plates_only`, użytkownik
> zawsze wpisuje same talerze, a opór początkowy jest osobnym, opcjonalnym ustawieniem karty. Zapis
> `barbell_total` nigdy nie oznacza Smitha i nie jest reinterpretowany.

## Pojęcia

| Symbol | Znaczenie | Gdzie żyje |
| --- | --- | --- |
| **P** | masa talerzy wpisana w serii (kg) | seria treningu (`loadKg`) |
| **R** | opór początkowy maszyny (kg), opcjonalny; `0` = świadomie podane zero | ustawienie karty ćwiczenia danego użytkownika; kopia w snapshocie treningu |
| **R = null** | opór początkowy nieznany (nie uzupełniono karty); nigdy nie zastępowany przez 0 | snapshot: `startingResistanceStatus: "unknown"` |
| **P + R** | obciążenie obliczeniowe, gdy R znane | `effectiveLoadKg` w silniku |
| **P** (R nieznane) | obciążenie obliczeniowe = same talerze | `effectiveLoadKg`, status `plates_only` |

Karta ćwiczenia (treść atlasu, Standaryzacja) zawiera: „Szukaj naklejki informacyjnej na maszynie” oraz
odwołanie do „Starting resistance” / „Bar weight”.

## Obliczenia (n powtórzeń)

| R | Obciążenie / powt. | Objętość | `volumeStatus` | Komunikat |
| --- | --- | --- | --- | --- |
| znane (np. 15) | P + R (40 + 15 = 55) | (P + R) × n = 550 | `exact` | brak |
| 0 | P (40) | P × n = 400 | `exact` | brak |
| nieznane | P (40) | P × n = 400 | `plates_only` | `SMITH_STARTING_RESISTANCE_MISSING` |

- Objętość w obu przypadkach **wlicza się do głównej objętości treningu** (`sessionTotals.volumeKg`,
  wybór B). Status sumy: `unavailable` → `partial`, potem `estimated`, `plates_only`, `exact`
  (`combineVolumeStatuses`, wspólne dla `sessionTotals` i `muscle-stats`).
- Komunikat (kontrakt dla raportu potreningowego S6), tylko dla **wykonanego** ćwiczenia Smitha bez R:
  `sessionTotals.notices[] = { code: "SMITH_STARTING_RESISTANCE_MISSING", exerciseId, message }`,
  treść: „Dla ćwiczenia na maszynie Smitha liczono same talerze, ponieważ nie uzupełniono oporu
  początkowego w karcie ćwiczenia.”
- `exerciseTotals` podaje osobno: `topExternalKg` (P + R lub P), `topPlatesKg` (P), `loadBasis`
  (`plates_plus_starting_resistance` / `plates_only`), `startingResistanceKg`, `startingResistanceMissing`.
- Bez e1RM dla Smitha w S2 (osobna decyzja). Bez automatycznej konwersji starych wyników.

## Ustawienie karty (R) — `src/engine/exercise-settings.js`

- Ustawienie jednego użytkownika dla jednego ćwiczenia, **nie pole rekordu atlasu**; wpis R nie zmienia
  wspólnego atlasu.
- Wpis: `parseStartingResistanceInput` — puste → `null` (nieznane), `"0"` → 0, `"7,5"` → 7,5; ujemne,
  NaN, Infinity, tekst → `STARTING_RESISTANCE_INVALID`; ponad 1000 kg lub więcej niż 3 miejsca po
  przecinku → `STARTING_RESISTANCE_TOO_LARGE` (te same granice co ciężar serii).
- `validateExerciseSettings`: zamknięty kształt `{ startingResistanceKg }`; R tylko dla ćwiczenia z modelem
  `smith_plates_only` (inaczej `STARTING_RESISTANCE_NOT_APPLICABLE`).
- Magazyn: `createMemoryExerciseSettingsStore` (get / set / clear) — kontrakt z adapterem w pamięci.
  **Trwały zapis jeszcze nie istnieje** (edytor karty nr1: AT3.5 / S6; synchronizacja: SY). Żadna wartość
  wpisana przez osobę nie jest dziś nigdzie utrwalana.
- Zmiana maszyny: użytkownik sam aktualizuje R i odpowiada za porównania ze starszym sprzętem; bez katalogu
  egzemplarzy maszyn.

## Snapshot v3 — `src/engine/load-snapshot.js`, `db/v2-draft/001_load_snapshot.sql`

- Nowe pola: `startingResistanceKg` (`starting_resistance_kg numeric`, null) i `startingResistanceStatus`
  (`starting_resistance_status text`: `known` / `unknown`; null dla innych modeli).
- `buildLoadSnapshot({ …, startingResistanceKg })` kopiuje R z ustawienia przy dodaniu ćwiczenia do
  treningu; edycja karty później nie zmienia starego treningu.
- Reguły (JS = SQL): `ws_starting_resistance` — Smith ma jawny status, `known` ⇔ R obecne, R ≥ 0 i
  skończone; inny model — oba pola puste. `ws_snapshot_version_fields` — snapshot v2 nie ma kolumn R.
- Wersjonowanie: nowe snapshoty mają `snapshotVersion` 3; wersja 2 pozostaje poprawna do odczytu bez
  migracji (te same wiersze bez kolumn R, nigdy Smith). Baza produkcyjna nie jest migrowana — szkic SQL nie
  jest nigdzie zastosowany.
- Korekta F2-5: zmiana modelu ze Smitha usuwa R; zmiana na Smitha daje status `unknown` (R nie jest
  zgadywane).

## Otwarte (do decyzji właściciela)

1. **Porównania Smitha w PE-B / PE-E.** Zatwierdzony klucz `exerciseId|loadModel|entryRev` jest taki sam dla
   sesji z R i bez R, więc porównanie P + R z samym P dałoby sztuczny progres. Dane pozwalają uczciwie
   porównywać (P i R są osobno), ale reguła jest do ustalenia: porównywać same P, rozdzielać według
   `loadBasis`, albo oba.
2. **e1RM dla Smitha** — poza S2.
