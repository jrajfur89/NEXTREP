# NEXTREP 1.0 — kontrakty i encje v2 (N1)

Stan: N1, 12.10.2026. Czyste funkcje w `src/nr1/domain/` i `src/nr1/contracts/`; bez magazynu,
interfejsu, backendu i migracji. Podstawa: C01, STORE FIRST (schemat v2), atlas F2 (snapshot),
Progress Engine 2.0 (D1–D14, PE-01–PE-32).

## Pola wspólne każdej encji

| Pole | Znaczenie |
| --- | --- |
| `id` | UUID tworzony na urządzeniu (małe litery) |
| `createdAt`, `updatedAt` | czas ISO UTC; `updatedAt` nigdy się nie cofa (zegar urządzenia przestawiony wstecz) |
| `version` | 1 przy utworzeniu; **+1 dokładnie raz na operację**, w której zmieniło się dowolne pole rekordu (także `position`, `supersetGroup`, `deletedAt`); rekord bez zmian zostaje tym samym obiektem |
| `deletedAt` | null albo czas tombstonu; rekord nigdy nie znika z listy |

`deviceId` i `syncSeq` dochodzą z synchronizacją (N11), kiedy wersję i czas nadaje serwer.

## Encje

| Encja | Pola własne | Lista uporządkowana (rodzic) |
| --- | --- | --- |
| profil | — (rodzic listy planów) | — |
| plan | `name`, `status` (`active` / `archived`, D3), `notes`, `position` | plany użytkownika (profil) |
| ćwiczenie planu | `catalogExerciseId` albo `privateExerciseId`, `supersetGroup`, `restSec`, `notes`, `position` | plan |
| seria planu (cel) | `setType` (`working` / `warmup`), `repsMin`–`repsMax` albo `durationMinSec`–`durationMaxSec`, `rirTarget`, `position` | ćwiczenie planu |
| trening | `planId`, `startedAt`, `finishedAt`, `notes` | — (sortowanie po dacie) |
| ćwiczenie treningu | odwołanie do ćwiczenia, **`loadSnapshot` (obowiązkowy, F2-4)**, `supersetGroup`, `planItemId`, `notes`, `position` | trening |
| seria treningu | `setType` (`working` / `warmup` / `dropset`, D5), `status` (`done` / `skipped`), `reps`, `loadKg`, `assistKg`, `durationSec`, `rir`, `planItemSetId`, `position` | ćwiczenie treningu |

## Reguły

- **Kolejność:** sortowanie zawsze po `(position, createdAt, id)` — deterministyczne także przy
  duplikatach i lukach (PE-32). Każda operacja strukturalna przenumerowuje żyjące rodzeństwo 0..n−1.
- **Wersja rodzica:** +1 raz na operację, która zmienia skład lub kolejność jego listy (dodanie,
  usunięcie, przesunięcie, superseria). Zmiana wartości dziecka (np. powtórzeń serii) nie zmienia rodzica.
- **Usuwanie:** tombstone z kaskadą (plan → ćwiczenia → serie; trening → ćwiczenia → serie).
- **Superserie:** `supersetGroup` (UUID), grupa ciągła i co najmniej dwuelementowa. Łączenie tylko
  sąsiadów; wyjście ze środka dzieli grupę; członek nie wychodzi z grupy przez przesunięcie; nic nie
  ląduje w środku cudzej grupy; grupa przesuwa się w całości; usunięcie członka grupy dwóch rozwiązuje ją.
- **Atomowość:** każda operacja zwraca cały nowy stan albo rzuca `DomainError`; wejście nie jest
  modyfikowane. Wynik jest sprawdzany kontraktem, gęstością pozycji i niezmiennikami superserii.
- **Odwołanie do ćwiczenia:** dokładnie jedno z `catalogExerciseId` (format id atlasu) i
  `privateExerciseId` (UUID); bez zamienników i równoważności.
- **Snapshot:** budowany przez `buildLoadSnapshot` (src/engine/load-snapshot.js) przy dodaniu
  ćwiczenia; musi opisywać to samo ćwiczenie co odwołanie. Historia liczy wyłącznie ze snapshotu (D13).
- **Wartości serii** to liczby; dozwolone pola wynikają z modelu obciążenia snapshotu:

  | Model | Pola |
  | --- | --- |
  | ciężar całkowity, na przyrząd, dodatkowy | `reps`, `loadKg`, `rir` |
  | z asystą | `reps`, `assistKg`, `rir` |
  | masa ciała, guma | `reps`, `rir` (poziom gumy — później) |
  | czas, cardio | `durationSec` (bez RIR; pola cardio — później) |
  | tylko serie | brak |

- **RIR:** wyłącznie 0 / 0–1 / 1–2 / 2 albo puste; brak RIR nie jest uzupełniany (D4).
- **Wpis z przecinkiem** („62,5”) zamieniany na liczbę parserami `load.js`; tekst, który nie jest
  liczbą, to błąd (PE-27).
- **Cele planu:** każda seria ma własny cel (PE-28); domyślny cel RIR nowej serii roboczej z
  powtórzeniami: 0–1 (D1); rozgrzewki i serie na czas bez RIR.
- **Unikalność:** każdy UUID występuje w treningu raz (PE-24).

## Wejście silnika

`contracts/engine-input.js` zamienia stan treningu na postać czytaną przez `src/engine/load.js`
(żyjące rekordy w kolejności listy, model ze snapshotu): `workoutTotals`, `workoutExerciseTotals`,
`toEngineSession`. Testy: PE-03, PE-04, PE-05, PE-07, PE-18, D5, D13, PE-27.

## Plan w dwóch miejscach

Rekord planu jest w liście planów i w stanie planu. Nowsza wersja wygrywa: `withPlan(list, plan)`,
`refreshPlan(state, list)`; cofnięcie wersji jest odrzucane (`PLAN_STALE`). W N2 magazyn trzyma jeden
rekord.
