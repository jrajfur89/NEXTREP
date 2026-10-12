# NEXTREP 1.0 (`src/nr1/`) — aplikacja oddzielona od dotychczasowej

> **Zawieszone decyzją K01-1 (12.10.2026) — zachowane, nierozwijane.** NEXTREP 1.0 powstaje przez rozwój
> istniejącej aplikacji `src/app/` (`DECISIONS_1_0.md` §1c, MASTER PLAN v3 sekcja K). Katalog `src/nr1/`,
> jego build i CI zostają jako rezultat N0–N1; kontrakty (`CONTRACTS.md`) są wzorcem reguł dla zmian
> w `src/app/`. Etapy N2 i dalsze nie zostaną rozpoczęte bez nowego polecenia. Opis niżej jest stanem z N1.

Stan: **N1 — kontrakt silnika i encje v2** (12.10.2026; N0 — szkielet i separacja architektury). Podstawa: raport C01 i decyzje
C01-1–C01-7 (rejestr: `docs/roadmap/DECISIONS_1_0.md`, sekcja 1b).

NEXTREP 1.0 nie jest jeszcze aplikacją produkcyjną. Wersja deweloperska nie służy do zapisywania
treningów: nie ma konta, synchronizacji ani backendu i nie korzysta z danych dotychczasowej aplikacji.

## Struktura

| Ścieżka | Rola |
| --- | --- |
| `src/nr1/index.html` | powłoka strony 1.0 (CSP: `connect-src 'none'` — brak sieci w N0) |
| `src/nr1/main.jsx` | wejście aplikacji; w N0 ekran „NEXTREP 1.0 — wersja deweloperska” z metadanymi wydania atlasu |
| `src/nr1/domain/` (N1) | encje v2 i operacje: `entity.js` (UUID, wersja, tombstony), `ordering.js` (pięć list z `position`), `superset.js`, `list-ops.js`, `plan.js`, `workout.js` |
| `src/nr1/contracts/` (N1) | kontrakty: `constants.js`, `exercise-ref.js`, `set.js`, `plan-goal.js`, `workout.js`, `engine-input.js` — opis w `docs/nr1/CONTRACTS.md` |
| `tools/build-nr1.mjs` | build 1.0: walidacja atlasu, bundel w pamięci, kontrola granic, zapis do `dist-nr1/` |
| `tools/check-nr1-boundaries.mjs` | reguły granic architektury i kontrola gotowego buildu (CLI) |
| `tests/nr1/n0.test.mjs`, `tests/nr1/fixtures/entries/` | testy akceptacyjne N0 i wejścia testowe granic |
| `tests/nr1/n1-*.test.mjs`, `tests/nr1/helpers.mjs` | testy N1 (encje, superserie, kontrakty, wejście silnika, porównanie starego bundla) |
| `tests/unit/engine-rir.test.mjs` | regresja `parseRirBounds` po wydzieleniu (stare CI) |
| `.github/workflows/nr1.yml` | osobne CI 1.0 (bez konfiguracji Supabase) |
| `dist-nr1/`, `.build-nr1/` | wynik buildu (ignorowane przez git) |

Stara aplikacja (`src/app/`, `index.html`, `tools/build-web.mjs`, `android/`, workflow Android S1)
pozostaje zamrożona do N12 (C01-7). Docelowy układ katalogów `src/nr1/` (contracts, domain, catalog,
store, workout, features, ui, platform, sync) powstaje w kolejnych etapach; w N1 doszły `domain/` i `contracts/`.

## Komendy

```sh
npm ci && (cd tests && npm ci)
node tools/build-nr1.mjs --check-atlas   # tylko walidacja atlasu (npm run nr1:atlas)
node tools/build-nr1.mjs                 # build do dist-nr1/ (npm run nr1:build)
node tools/check-nr1-boundaries.mjs      # kontrola gotowego buildu (npm run nr1:check)
cd tests && npm run test:nr1             # testy N0
```

Opcje buildu (używane przez testy): `--out <katalog>`, `--work <katalog>`, `--atlas <plik>`,
`--entry <plik>`. Build odmawia zapisu do `dist/` (build starej aplikacji), `src/`, `android/`,
`tools/`, `tests/`, `docs/` i katalogu głównego.

## Zasady izolacji (sprawdzane automatycznie)

1. **Zależności z prawdziwego grafu** (metafile esbuild, nie wyszukiwanie tekstu): w bundlu mogą być
   tylko `src/nr1/**`, moduł wydania atlasu, dozwolone moduły `src/engine/` (`rir.js`, `load.js`,
   `atlas-schema.js`, `atlas-validate.js`, `load-snapshot.js`, `muscle-work.js`) i pakiety `react`,
   `react-dom`, `scheduler`. Zakazane: `src/app/`, `legacy-progression.js`, `load-legacy-map.js`,
   `volume.js`, `src/engine/index.js`, `@supabase/*`, `tools/`, `db/`, `docs/`. Zakazany import jest
   odrzucany już przy rozwiązywaniu (z nazwą pliku i importu), także gdy jest przechodni.
   Od N1 kontrola obejmuje graf aplikacji ORAZ osobno każdy moduł `src/nr1/` (także te, których ekran
   jeszcze nie importuje, np. `domain/` i `contracts/`).
2. **Treść bundla:** brak adresów i kluczy Supabase, brak projektów chronionych (produkcja,
   `nextrep-f5-test`), brak kluczy starego modelu danych (`trainapp_*`, `nextrep_*`, `legacy_id`,
   `user_data`), brak `localStorage` i `sessionStorage`, brak identyfikatorów 68 ćwiczeń starego atlasu
   (poza identyfikatorami wydanymi przez atlas 1.0) i brak adresów CDN.
3. **Brak backendu:** build nie czyta żadnej konfiguracji Supabase; zmienna `NR1_*SUPABASE*` zatrzymuje
   build; zmienne starej aplikacji (`NEXTREP_SUPABASE_*`) są ignorowane. W przeglądarce CSP blokuje
   każde połączenie sieciowe.
4. **Dane starej aplikacji:** test w jsdom z wypełnionymi starymi kluczami `localStorage` sprawdza
   0 odwołań do `localStorage`, `sessionStorage`, sieci i IndexedDB oraz nienaruszone stare dane.
5. **Zamrożenie starej aplikacji:** test porównuje z punktem audytu `7d13f74` katalogi `src/app/`,
   `android/`, `db/`, `docs/sql/`, pliki `index.html`, `tools/build-web.mjs`, `capacitor.config.json`,
   `vercel.json`, workflow Android S1 oraz `load-legacy-map.js`, `volume.js`, `index.js` — różnica musi
   być pusta. `legacy-progression.js` może różnić się WYŁĄCZNIE wydzieleniem `parseRirBounds` (N1),
   sprawdzanym mechanicznie.
6. **Stara aplikacja po N1:** zminifikowany `app.js` starej aplikacji zmienił bajty tylko przez inną
   kolejność funkcji (zaakceptowane). `tests/nr1/n1-old-bundle.test.mjs` dowodzi, że bundel bez
   minifikacji jest identyczny z `db38ae8` poza miejscem przeniesionej funkcji.

Naruszenie dowolnej reguły zatrzymuje build, zanim cokolwiek zostanie zapisane.

## Zależność od atlasu

- Źródło: `src/atlas/atlas.json` w schemacie F2 (bez zmian schematu). Build uruchamia
  `validateAtlas()`; **błąd walidatora blokuje build**, ostrzeżenia są raportowane.
- Metadane wydania (C01-4) generuje build: `formatVersion`, `atlasVersion`, liczba ćwiczeń (wszystkich
  i aktywnych), liczba rodzin, liczba wydanych identyfikatorów (`issuedIds` zostaje w `atlas.json`),
  suma kontrolna SHA-256 pliku i wynik walidacji. Trafiają do `dist-nr1/atlas-release.json` i do
  aplikacji jako moduł `nr1:atlas-release`.
- Mechanizm działa z pustym atlasem (wydanie 0, stan repozytorium) i z kolejnymi wydaniami (np.
  zatwierdzona lokalnie partia Batch 01: wydanie 1, 15 ćwiczeń, ostrzeżenia dopuszczalne). N0 nie
  publikuje Batch 01.
- W N0 aplikacja dostaje tylko metadane wydania; katalog ćwiczeń to etap N3.

## Status

**N0** — zakończone (`db38ae8`): osobna aplikacja, build, granice, CI.

**N1** — kontrakt silnika i encje v2:

1. `parseRirBounds` wydzielone do `src/engine/rir.js`; `legacy-progression.js` je importuje i eksportuje
   jak dotąd; `load.js` nie zależy już od starego silnika, więc dozwolone moduły silnika przechodzą
   kontrolę granic.
2. Encje v2, kolejność, superserie, operacje planu i treningu, kontrakty — `docs/nr1/CONTRACTS.md`.
3. Bez IndexedDB, interfejsu, backendu i migracji.

## Dalsze etapy

Wstrzymane decyzją K01-1. Planowany wcześniej N2 (magazyn IndexedDB w `src/nr1/store/`) nie jest
realizowany; magazyn istniejącej aplikacji to decyzja O-27.

Zamrożenie starej aplikacji (zasada 5 wyżej, C01-7) zostało zastąpione przez K01-1; test zamrożenia
zostaje do etapu AT2, który go zdejmuje w swoim zakresie.
