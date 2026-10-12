# NEXTREP 1.0 (`src/nr1/`) — aplikacja oddzielona od dotychczasowej

Stan: **N0 — szkielet i separacja architektury** (12.10.2026). Podstawa: raport C01 i decyzje
C01-1–C01-7 (rejestr: `docs/roadmap/DECISIONS_1_0.md`, sekcja 1b).

NEXTREP 1.0 nie jest jeszcze aplikacją produkcyjną. Wersja deweloperska nie służy do zapisywania
treningów: nie ma konta, synchronizacji ani backendu i nie korzysta z danych dotychczasowej aplikacji.

## Struktura

| Ścieżka | Rola |
| --- | --- |
| `src/nr1/index.html` | powłoka strony 1.0 (CSP: `connect-src 'none'` — brak sieci w N0) |
| `src/nr1/main.jsx` | wejście aplikacji; w N0 ekran „NEXTREP 1.0 — wersja deweloperska” z metadanymi wydania atlasu |
| `tools/build-nr1.mjs` | build 1.0: walidacja atlasu, bundel w pamięci, kontrola granic, zapis do `dist-nr1/` |
| `tools/check-nr1-boundaries.mjs` | reguły granic architektury i kontrola gotowego buildu (CLI) |
| `tests/nr1/n0.test.mjs`, `tests/nr1/fixtures/entries/` | testy akceptacyjne N0 i wejścia testowe granic |
| `.github/workflows/nr1.yml` | osobne CI 1.0 (bez konfiguracji Supabase) |
| `dist-nr1/`, `.build-nr1/` | wynik buildu (ignorowane przez git) |

Stara aplikacja (`src/app/`, `index.html`, `tools/build-web.mjs`, `android/`, workflow Android S1)
pozostaje zamrożona do N12 (C01-7). Docelowy układ katalogów `src/nr1/` (contracts, domain, catalog,
store, workout, features, ui, platform, sync) powstaje w kolejnych etapach, nie w N0.

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
   tylko `src/nr1/**`, moduł wydania atlasu, dozwolone moduły `src/engine/` (`load.js`,
   `atlas-schema.js`, `atlas-validate.js`, `load-snapshot.js`, `muscle-work.js`) i pakiety `react`,
   `react-dom`, `scheduler`. Zakazane: `src/app/`, `legacy-progression.js`, `load-legacy-map.js`,
   `volume.js`, `src/engine/index.js`, `@supabase/*`, `tools/`, `db/`, `docs/`. Zakazany import jest
   odrzucany już przy rozwiązywaniu (z nazwą pliku i importu), także gdy jest przechodni.
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
   `vercel.json`, workflow Android S1 i starsze moduły silnika — różnica musi być pusta.

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

## Status N0

Zakres N0-A–N0-F zrealizowany; wyniki w raporcie N0 i w CI `nr1.yml`.

**Ustalenie N0 (warunek wstępny N1):** `src/engine/load.js` importuje `parseRirBounds` z
`legacy-progression.js`. Dlatego dziś żaden dozwolony moduł silnika (`load.js` i wszystkie, które go
importują) nie przechodzi kontroli granic — stary silnik trafiłby do bundla przechodnio. N0 nie
zmienia wspólnego silnika (ekran N0 go nie używa). Test `imports-load-transitive.jsx` potwierdza, że
kontrola wykrywa tę zależność.

## Następny etap: N1 (wymaga osobnego zlecenia)

1. Usunięcie zależności `load.js` → `legacy-progression.js` (np. `parseRirBounds` w osobnym czystym
   module silnika) bez zmiany zachowania starej aplikacji: 729 testów zielonych, bundel starej
   aplikacji sprawdzony.
2. `src/nr1/contracts/`: kontrakt wejścia silnika (trening, ćwiczenie treningu ze snapshotem, seria,
   cele planu) — czyste dane.
3. `src/nr1/domain/`: encje v2 (UUID, `position`, `version`, `deleted_at`), operacje kolejności i
   superserii.
4. Kryteria: testy własności (przenumerowanie rodzeństwa, ciągłość superserii, tombstony); PE-03,
   PE-04 i PE-18 liczone przez `load.js` na kontrakcie; kontrola granic dalej zielona.
