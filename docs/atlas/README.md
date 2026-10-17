# NEXTREP 1.0 — atlas ćwiczeń: pliki, walidacja, import partii

Stan: F2.1–F2.2 (11.10.2026); integracja z aplikacją po K01 (12.10.2026). Atlas w repozytorium jest
pusty (`src/atlas/atlas.json`, wydanie 0).
Treść atlasu (ćwiczenia, nazwy, rodziny, warianty, słowniki sprzętu i mięśni) pochodzi wyłącznie
z zatwierdzonych partii „Standaryzacji ćwiczeń NextRep”. Pola techniczne (typ pomiaru, model
obciążenia, liczba przyrządów, lateralność, liczenie powtórzeń, krok ciężaru) są proponowane dla
każdej partii i zatwierdzane przed importem. Ten katalog i narzędzia niczego nie rozstrzygają.

## Pliki

| Plik | Rola |
| --- | --- |
| `src/atlas/atlas.json` | atlas 1.0: słowniki, rodziny, ćwiczenia, wydane identyfikatory |
| `src/engine/atlas-schema.js` | kształt atlasu i słowniki techniczne (modele, lateralność, 10 grup, typy pomiaru) |
| `src/engine/atlas-validate.js` | walidator (reguły M, V, I, T, S poniżej) |
| `src/engine/load-snapshot.js` | kontrakt snapshotu modelu obciążenia w treningu (silnik = klient = baza) |
| `src/engine/muscle-work.js` | praca partii: pełna dla grup głównych, osobno pomocnicza, bez sumowania |
| `db/v2-draft/001_load_snapshot.sql` | SZKIC schematu v2 z kontraktu; nie jest migracją, nigdzie nie uruchomiony |
| `docs/atlas/nextrep-atlas-batch-template.xlsx` | pusty szablon partii |
| `docs/atlas/przyklad/` | partia syntetyczna (dane TEST) i jej raport importu |
| `tools/import-atlas-batch.mjs` | sprawdzenie partii i raport; zapis atlasu tylko z `--write` |
| `tools/build-nr1.mjs` | walidacja atlasu przy buildzie `src/nr1/` (błąd blokuje build) i generowanie metadanych wydania (C01-4); `issuedIds` pozostaje w `atlas.json`. Po K01 zostaje jako dodatkowa kontrola atlasu w CI |

## Atlas w aplikacji (K01, etapy AT1–AT3.8)

NEXTREP 1.0 to istniejąca aplikacja `src/app/` (K01-1), a atlas jest jej jedynym źródłem ćwiczeń
(decyzje AT3, `docs/roadmap/DECISIONS_1_0.md` §1d). Wymagania produktowe, źródła danych i kryteria odbioru:
`docs/roadmap/NEXTREP_ATLAS_PRODUCT_SPEC_1_0.md`; harmonogram: MASTER PLAN §K.3.

| Etap | Zakres |
| --- | --- |
| AT1 ✅ | publikacja zatwierdzonej partii Batch 01 w `src/atlas/atlas.json` (`368bf2d`) |
| AT2 ✅ | katalog tylko do odczytu w aplikacji (`fbc0cdb`); jedyny import `atlas.json`: `src/engine/atlas-release.js` |
| AT3.0 | decyzje AT3, specyfikacja produktowa, harmonogram (dokumentacja) |
| AT3.1 | projekt UI w Claude Design |
| AT3.2 | resolver, indeks, wyszukiwanie, fasety, mapa partii `src/atlas/navigation.json` z walidatorem (bez zmiany schematu atlasu) |
| AT3.3 | czysty start S1, chmura w S1 wyłączona do SY |
| AT3.4 | atlas jedynym źródłem planów i treningu; obowiązkowy snapshot modelu obciążenia (`buildLoadSnapshot`) od tego etapu |
| AT3.5 | model ćwiczeń prywatnych (UUID, pola modelu atlasu) |
| AT3.6a–d | katalog i filtry, karta szczegółów, wspólny mechanizm wyboru, formularz prywatnego ćwiczenia |
| AT3.7 | statystyki i progresja ze snapshotu, bramka A5 |
| AT3.8 | gotowe plany w `src/atlas/plan-templates.json` z własnym walidatorem (C01-5) |

## Przebieg partii

1. Zatwierdzona partia trafia do kopii szablonu (`node tools/make-atlas-template.mjs`).
2. `node tools/import-atlas-batch.mjs partia.xlsx` — scala partię z kopią atlasu, sprawdza całość
   względem poprzedniego wydania, zapisuje `partia.raport.xlsx` (zakładka „Raport walidacji”)
   i wypisuje raport. Repozytorium się nie zmienia.
3. Po akceptacji raportu (0 błędów): ten sam import z `--write` zapisuje `src/atlas/atlas.json`
   z nowym numerem wydania. `entryRev` podnosi się automatycznie przy zmianie pól obliczeniowych.

## Reguły walidatora (projekt F2 v2, zatwierdzony 11.10.2026)

Błąd blokuje import; ostrzeżenie i informacja idą do oceny.

| Reguła | Kody | Poziom |
| --- | --- | --- |
| M1 co najmniej jeden mięsień główny | `PRIMARY_MUSCLE_REQUIRED` | błąd |
| M2 mięsień ze słownika, aktywny | `MUSCLE_UNKNOWN`, `DICT_VALUE_ARCHIVED` | błąd |
| M3 bez powtórzeń; nie główny i pomocniczy naraz | `MUSCLE_DUPLICATE`, `MUSCLE_PRIMARY_AND_SECONDARY` | błąd |
| M4 każdy mięsień ma jedną z 10 grup | `MUSCLE_GROUP_INVALID` | błąd |
| M5 dużo pracy głównej (> 3 mięśnie lub > 2 grupy) | `MANY_PRIMARY_MUSCLES` | ostrzeżenie |
| M6 pomocniczy w grupie głównej nie zmienia jej statystyk | `SECONDARY_IN_PRIMARY_GROUP` | informacja |
| V1 rodzina istnieje i jest aktywna | `FAMILY_UNKNOWN`, `FAMILY_ARCHIVED`, `FAMILY_ID_*`, `FAMILY_NAME_DUPLICATE` | błąd |
| V2 bez duplikatów wariantu (rodzina + sprzęt + cechy) | `VARIANT_DUPLICATE` | błąd |
| V3 inna interpretacja danych musi być widoczna w cechach | `VARIANT_INTERPRETATION_NOT_VISIBLE` | błąd |
| V4 cecha jednostronności zgodna z lateralnością | `LATERALITY_ATTRIBUTE_MISSING`, `_MISMATCH`, `_MULTIPLE` | błąd |
| V5 sprzęt zgodny z modelem; jedno źródło obciążenia | `MULTIPLE_LOAD_SOURCES_UNSUPPORTED`, `LOAD_MODEL_EQUIPMENT_MISMATCH`, `ASSISTED_WITHOUT_ASSIST_EQUIPMENT` | błąd |
| V6 liczba przyrządów zgodna z modelem i cechą | `IMPLEMENTS_REQUIRED`, `_MODEL_MISMATCH`, `_NOT_APPLICABLE`, `_ATTRIBUTE_MISMATCH` | błąd |
| V7 nazwa bez ciężaru roboczego i liczby powtórzeń | `NAME_CONTAINS_WORKING_WEIGHT`, `NAME_CONTAINS_REPS` / `NAME_SETS_REPS_PATTERN` | błąd / ostrzeżenie |
| V8 brak pól równoważności; następca tylko przy archiwizacji | `EQUIVALENCE_FIELD_FORBIDDEN`, `SUCCESSOR_HINT_ONLY_ARCHIVED` | błąd |
| V9 rodzina z jednym ćwiczeniem; nazwa sugeruje stronę | `FAMILY_SINGLE_EXERCISE`, `FAMILY_WITHOUT_ACTIVE_EXERCISE`, `NAME_SUGGESTS_SIDE` | ostrzeżenie |
| I1 identyfikator: format, unikalność, nigdy usunięty | `EXERCISE_ID_FORMAT`, `_DUPLICATE`, `_REMOVED`, `_NOT_ISSUED` | błąd |
| I2 nazwa unikalna po normalizacji | `NAME_DUPLICATE` | błąd |
| I3 aliasy bez konfliktów | `ALIAS_CONFLICT`, `ALIAS_DUPLICATE` | błąd |
| I4 archiwizacja: powód, poprawny następca | `ARCHIVED_REASON_REQUIRED`, `SUCCESSOR_INVALID` | błąd |
| I5 zmiana pól obliczeniowych = wyższy `entryRev` | `ENTRY_REV_NOT_BUMPED`, `ENTRY_REV_DECREASED` | błąd |
| I6 zmiana interpretacji = nowy wariant albo zatwierdzona poprawka | `LOAD_INTERPRETATION_CHANGED` / `CORRECTION_APPLIED`, `CORRECTION_INVALID` | błąd / informacja |
| T1–T4 pola techniczne kompletne i spójne | `REQUIRED_FIELD_MISSING`, `BILATERAL_PER_SIDE`, `LOAD_MODEL_UNKNOWN`, `MEASUREMENT_*`, `LOAD_INCREMENT_*` | błąd (brak kroku: ostrzeżenie) |
| S1–S2 słowniki i zamknięty schemat | `UNKNOWN_FIELD`, `SCOPE_INVALID`, `STATUS_INVALID`, `DICT_*`, `EQUIPMENT_*`, `VARIANT_*`, `ATLAS_VERSION_*` | błąd |
| B problemy pliku partii | `BATCH_TEMPLATE_VERSION`, `BATCH_TEMPLATE_CHANGED`, `BATCH_DUPLICATE_ROW` | błąd |

`MULTIPLE_LOAD_SOURCES_UNSUPPORTED` to ograniczenie obecnego silnika, nie zakaz takich ćwiczeń
w NEXTREP: wróci, gdy silnik dostanie model sumowania kilku obciążeń.
