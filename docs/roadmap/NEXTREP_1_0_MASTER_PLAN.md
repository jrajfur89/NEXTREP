# NEXTREP 1.0 — MASTER PLAN (audyt kompletności)

Wersja 3.2 · 17.10.2026 · gałąź `release/1.0` · status: **aktualna podstawa planowania** po korekcie K01
(decyzje K01-1–K01-5 w `DECISIONS_1_0.md` §1c). **Sekcja K ma pierwszeństwo przed resztą dokumentu**;
sekcje 1–3 i A–E pozostają audytem stanu i wymagań, a etapy F2.4/F3–F7 z wersji 2 są przypisane do faz
sekcji K.

Zmiany w wersji 3.2 (17.10.2026, etap AT3.0): etapy AT3–AT6 zastąpione planem AT3.0–AT3.8 (w tym
AT3.6a–d) według decyzji AT3-D1–AT3-D15 (`DECISIONS_1_0.md` §1d); AT1 i AT2 zakończone; obowiązkowy
snapshot od AT3.4; ryzyko B30 (`hanging_knee_raise`); specyfikacja produktowa atlasu
`NEXTREP_ATLAS_PRODUCT_SPEC_1_0.md`. Prognoza publikacji bez zmian (nadal prognoza, nie zobowiązanie).

Zmiany w wersji 3.1 (13.10.2026): O-28 rozstrzygnięte — wariant równoległy (przygotowanie synchronizacji
równolegle z designem) jest podstawowym scenariuszem harmonogramu K.4; termin publikacji opisany jako
prognoza, nie zobowiązanie. Wariant ścisły z wersji 3 zostaje w K.4 jako porównanie.

Zmiany w wersji 3: sekcja K (strategia K01, etapy integracji atlasu AT1–AT6, fazy 1–5, nowy harmonogram
i prognoza); harmonogram z wersji 2 (sekcja C) zastąpiony; design w Claude Design (K01-2) zamiast Google
Stitch (F-2); N0–N1 (`src/nr1/`) jako zachowany, nierozwijany rezultat.

Zmiany w wersji 2: decyzje F-1–F-10 z 11.10.2026 (rejestr: `DECISIONS_1_0.md`); specyfikacja 4A.10
(`SPEC_4A10_MOJE_DANE.md`); mapa Reporting Engine (`REPORTING_ENGINE_MAP.md`); konflikt narzędzi designu
(`docs/design/decisions/2026-10-11-design-tool-google-stitch.md`); rejestr ryzyk starej produkcji
(`LEGACY_PRODUCTION_RISKS.md`); weryfikacja Crashlytics i propozycja monitoringu synchronizacji (§2.11);
weryfikacja identyfikatora pakietu. Sekcja F przeniesiona do rejestru decyzji.

Ten dokument zbiera w jednym miejscu wszystko, co ustalono dla NEXTREP 1.0, i porównuje to z tym,
co faktycznie jest w kodzie i w testach. Nie zmienia żadnej decyzji produktowej. Tam, gdzie ustalenia
są sprzeczne albo niepełne, zapisuje to jako kwestię do decyzji (sekcja F).

---

## K. Korekta K01 (12.10.2026) — strategia, etapy i harmonogram

### K.1 Strategia

- NEXTREP 1.0 to **istniejąca aplikacja `src/app/`** (`index.html`, build `tools/build-web.mjs`), rozwijana
  do publikacji w Google Play. Ekranów nie budujemy od nowa (K01-1, K01-3).
- `src/nr1/` (N0 szkielet, N1 kontrakty i encje v2) zostaje w repozytorium, nierozwijany. Jego reguły
  (`docs/nr1/CONTRACTS.md`: kolejność list, superserie, RIR, przecinek, snapshot) są wzorcem dla zmian
  w `src/app/`; moduły silnika `src/engine/` (`rir.js`, `load.js`, `load-snapshot.js`, `muscle-work.js`,
  `atlas-*.js`) są wspólne.
- UX/UI wyłącznie w **Claude Design** (K01-2); `DESIGN.md` z `main` jest źródłem wartości.
- Czysty start danych (STORE FIRST): bez migracji starych planów, historii i identyfikatorów ćwiczeń;
  bez mapowania starego atlasu (68) na nowy.
- PRO+ (AI Coach) poza 1.0 (F-9, K01-3).

### K.2 Zasady etapów (K01-4)

1. Jeden etap = jeden zakres opisany z góry: pliki, zachowanie, czego etap NIE robi.
2. Start etapu wymaga Twojej osobnej zgody; zgoda na etap nie obejmuje następnego.
3. Każdy etap kończy się: testami automatycznymi (stare i nowe), buildem testowym działającej aplikacji
   do sprawdzenia na telefonie i raportem odbioru. Następny etap startuje po akceptacji.
4. Etap nie zmienia zakresu projektu; potrzeba takiej zmiany zatrzymuje etap i wraca jako propozycja
   decyzji (zasada zakresu, `DECISIONS_1_0.md` §1c).
5. Bez zmian `main`, produkcyjnego Supabase, `nextrep-f5-test` i produkcyjnej konfiguracji Vercel;
   push tylko na `release/1.0`.

### K.3 Fazy i etapy

| Faza (K01-5) | Etap | Zakres | Czego etap nie robi |
| --- | --- | --- | --- |
| 1. Działający NEXTREP | K02 | korekta dokumentacji (ten dokument, rejestr decyzji, `docs/nr1/README.md`, dokumenty designu, `DESIGN.md` z `main`) | kod, konfiguracja |
| 2. Atlas i plany | AT1 ✅ | publikacja zatwierdzonej partii Batch 01 w `src/atlas/atlas.json` (`368bf2d`) | zmiany aplikacji, schematu atlasu, `issuedIds` |
| | AT2 ✅ | atlas jako katalog tylko do odczytu w istniejącej aplikacji (`fbc0cdb`); S1 jako środowisko rozwoju (O-26) | plany, trening, historia, synchronizacja — bez zmian |
| | AT3.0 | decyzje AT3-D1–AT3-D15 w rejestrze, ten harmonogram, `NEXTREP_ATLAS_PRODUCT_SPEC_1_0.md`, ryzyko B30 (jeden commit dokumentacji) | kod |
| | AT3.1 | projekt UI w Claude Design (równolegle): katalog z partiami i filtrami, kafelek, karta szczegółów, wspólny mechanizm wyboru, formularz prywatnego ćwiczenia, stany puste | kod |
| | AT3.2 | dane: resolver (id atlasu / UUID), indeks, wyszukiwanie bez polskich znaków, fasety, mapa partii z `navigation.json` + walidator (AT3-D1), jeden słownik nazw 10 grup (AT3-D2) | ekrany poza nazwami grup |
| | AT3.3 | czysty start S1 (AT3-D3): nowa przestrzeń, bez zasiewu starego katalogu, wyłączone migracje i import starych kopii, chmura w S1 wyłączona do SY (AT3-D5) | usuwanie starych danych, zmiany `nextrep-f5-test` |
| | AT3.4 | atlas jedynym źródłem w planach i treningu; **obowiązkowy snapshot** przy dodaniu ćwiczenia; grupy na obecnych ekranach ze snapshotu, stare mapy niewywoływane (AT3-D8); wycofanie starego katalogu, szablonów i kafli; UI przejściowe (AT3-D9); nowy E2E (AT3-D7) | ćwiczenia prywatne, nowy wygląd, zmiana wzorów objętości |
| | AT3.5 | model ćwiczeń prywatnych (AT3-D6): UUID, pola modelu, resolver, snapshot prywatny, prosty formularz przejściowy | docelowy formularz, synchronizacja |
| | AT3.6a | UI: katalog, partie, wyszukiwarka, filtry, kafelek, ostatnio używane, ulubione lokalnie (AT3-D14) | karta, wybór |
| | AT3.6b | UI: karta szczegółów; sekcje bez danych ukryte (AT3-D11–AT3-D13) | — |
| | AT3.6c | UI: jeden mechanizm wyboru w katalogu, planie i treningu | — |
| | AT3.6d | UI: formularz prywatnego ćwiczenia (podstawowy, zaawansowany, sugestie) | — |
| | AT3.7 | silnik: statystyki partii ze snapshotu (praca główna i pomocnicza), progresja z modelu snapshotu, bramka A5 | nowe ekrany raportów (PE-F/G/H) |
| | AT3.8 | gotowe plany: `plan-templates.json` + walidator (C01-5), plany na id atlasu (AT3-D4) | treść planów (od właściciela) |
| | PE | PE-B, PE-C, PE-E w silniku (bez ekranów), równolegle do AT; zakres w 1.0: O-25 | |
| 3. Design | DS1 | projekty w Claude Design (Twoja praca; może iść od razu, równolegle do fazy 2); dla atlasu = AT3.1 | |
| | DS2 | wdrażanie zaakceptowanych ekranów w `src/app/`, ekran po ekranie; test wizualny aktualizowany per ekran; ekrany atlasu = AT3.6a–d | zmiana logiki |
| | A5 | bramka: ekrany przechodzą na wzory `load.js`; PE-D, PE-F/G/H (raporty) z nowymi ekranami statystyk | |
| 4. Synchronizacja, monetyzacja, Google Play | SY | nowy projekt Supabase (O-24), synchronizacja wg O-23, konto (OTP, usuwanie konta), 4A.10 wg SPEC, magazyn wg O-27 | |
| | AN | Android: ostateczny identyfikator (O-11), funkcje natywne (F4: eksport, powiadomienie przerwy, stoper w tle), Crashlytics (F-4, O-14), ustawienia wydania (B15–B17) | |
| | MO | reklamy (AdMob + UMP, O-03), PRO i płatności (Billing / RevenueCat, O-02, O-04), usunięcie lokalnego PRO (B12) | PRO+ |
| | GP | dokumenty i deklaracje Google Play: polityka prywatności, regulamin, strona usuwania konta, Data safety, deklaracja zdrowotna, IARC, karta sklepu (O-12) | |
| 5. Publikacja | P | tor wewnętrzny (warunki D.1), test zamknięty 14 dni (D.2), wniosek o produkcję (D.3) | |

Prace bez kodu, które nie zmieniają kolejności (konto Google Play, rekrutacja testerów, szkice dokumentów
prawnych, projekty w Claude Design, partie atlasu), mogą iść od razu, bo wyznaczają terminy faz 4–5.

### K.4 Harmonogram i prognoza (tydzień 1 = 12.10.2026)

**Termin publikacji jest prognozą, nie zatwierdzonym zobowiązaniem.** Celem pozostaje możliwie szybkie
wydanie stabilnej aplikacji w Google Play; prognoza zmienia się razem z tempem atlasu, decyzjami i wynikami
testów. Jeden wykonawca.

Scenariusz podstawowy (O-28, 13.10.2026): przygotowanie synchronizacji (specyfikacja, schemat, testy lokalne)
i prace w Claude Design idą równolegle do fazy 2. Każde wdrożenie i każda integracja w `src/app/` — także
synchronizacji i ekranów — to osobny etap z osobną zgodą i testami (K.2).

| Tydzień | Etapy (każdy z osobną zgodą) | Równolegle: przygotowanie i prace bez kodu |
| --- | --- | --- |
| 1 (12–18.10) | K02 ✅ (`1ed73f3`); AT1 ✅ (`368bf2d`); AT2 ✅ (`fbc0cdb`); AT3.0 | O-26 ✅ (13.10); partie atlasu; DS1 start; decyzja O-01 (konto Play); lista partii nawigacyjnych w Standaryzacji (AT3-D1) |
| 2–3 (19.10–1.11) | AT3.2, AT3.3 | AT3.1 (Claude Design); PE-B; SY: decyzje O-23, O-24 i specyfikacja zakresu |
| 4–5 (2–15.11) | AT3.4, AT3.5; PE-C, PE-E | AT3.1; SY: schemat i testy lokalne; decyzja O-25 |
| 6–8 (16.11–6.12) | AT3.6a–d według gotowości projektów; AT3.7; AT3.8, gdy atlas i treść planów pozwolą (O-29) | ostatnie partie atlasu; SY przygotowane do integracji; szkice GP |
| 9–13 (7.12–10.01) | DS2 + A5 + PE-D/F/G/H; integracja SY w `src/app/` (konto OTP, 4A.10) — z przerwą świąteczną | AN; rekrutacja testerów; aplikacja w Play Console |
| 14–15 (11–24.01) | MO, GP, AN domknięte; tor wewnętrzny (D.1) | karta sklepu |
| 16–17 (25.01–7.02) | test zamknięty 14 dni (D.2) | poprawki |
| 18 (8–14.02) | wniosek o produkcję, ocena Google (do 7 dni) | |

**Prognoza (scenariusz podstawowy):** publikacja ok. **połowy lutego 2027**, rezerwa do **początku marca
2027**.

**Porównanie — wariant ścisły z wersji 3** (synchronizacja dopiero po wdrożeniu designu): publikacja
ok. połowy marca 2027, rezerwa do początku kwietnia 2027. Po O-28 nie jest scenariuszem podstawowym.

Ryzyko scenariusza podstawowego: w tygodniach 9–13 wdrażanie designu i integracja synchronizacji idą
jednocześnie przy jednym wykonawcy; przy opóźnieniu pierwszeństwo ma kolejność K01-5 (design przed
synchronizacją), co przesuwa prognozę w stronę wariantu ścisłego.

Ścieżka krytyczna: treść atlasu i planów (O-29) → DS2 i integracja SY → MO → test zamknięty 14 dni →
ocena Google. Terminy decyzji: O-01 do 31.10 (konto Play, testerzy); O-23, O-24
do 1.11 (przygotowanie SY); O-25 do 15.11; O-02/O-03/O-04 do 6.12 (przed MO).

---

## 0. Zasady audytu

**Źródła.** Kod i testy gałęzi `release/1.0`; dokumenty w repozytorium (`NEXTREP_PROJECT_STATE.md`,
`STAGE_STATUS.md`, `STAGE_4A_PLAN.md`, `SYNC_AND_MIGRATION.md`, `ACCOUNT_DATA_MODEL.md`, `docs/sql/`,
`docs/design/` z `main`, `docs/atlas/`, `tests/README.md`); dokumenty projektu: „NEXTREP 1.0 STORE
FIRST — audyt i plan” (10.10), „Progress Engine 2.0: audyt i specyfikacja” (10–11.10), „F1: plan
modularizacji”, „F1: raport końcowy i plan PE-A”, „A4.5: raport i plan F2”, „F2: projekt struktury
atlasu” (v2); Twoje decyzje z rozmów (S1, F1, PE-A, F2 v2, K2–K4, P1–P4, F-0–F-10).

**Statusy.** Funkcja jest „gotowa” wyłącznie z dowodem w kodzie i w teście (automatycznym albo
na telefonie). Stary plan, opis w dokumencie ani status w `STAGE_STATUS.md` nie są dowodem.

| Status | Znaczenie |
| --- | --- |
| ✅ ZWERYFIKOWANE | jest w kodzie `release/1.0` i ma przechodzący test automatyczny lub zaliczony test na S22 |
| 🟡 W KODZIE, TEST NIEPEŁNY | jest w kodzie, ale test nie obejmuje kluczowych scenariuszy albo pochodzi sprzed utraty harnessu |
| 🟠 CZĘŚCIOWO | część zakresu w kodzie, część brakuje |
| 📝 TYLKO PLAN | opisane w dokumentach, brak w kodzie |
| ⛔ BRAK | ani w kodzie, ani w zatwierdzonym planie (luka) |
| 🗑 DO USUNIĘCIA | w kodzie, ale 1.0 tego nie przenosi (stara warstwa migracji) |

**Ważne o stanie gałęzi.** `release/1.0` = `main` (`68159b3`) + niewdrożona praca Etapu 4A.4
(`wip/4a4`, 21 commitów: migracja gościa do konta, F-5) + S1 + F1 + PE-A1–A4 + A4.5 + F2.1–F2.2.
Produkcja (Vercel, `main`) działa na starszym kodzie bez 4A.4. Kod 4A.4 wymaga SQL F-5, który jest
wdrożony tylko na `nextrep-f5-test`, nie na produkcji (`docs/sql/README.md`). Dokumenty statusu
(`STAGE_STATUS.md` z 4A.4 jako „NOT STARTED”) są w tym miejscu nieaktualne.

---

## 1. Podsumowanie wykonawcze

1. **Synchronizacja docelowa (v2) nie istnieje w kodzie.** Nie ma `nextrep_push`, `sync_seq`, kursorów,
   `position` na listach planów, wspólnych UUID ani `app_config` z minimalną wersją klienta. Działa stara
   synchronizacja rekordowa przez `legacy_id`. Jej pełny harness testowy został utracony; dziś test
   automatyczny obejmuje tylko kolejkę (10 testów), nie push / pull / konflikty na dwóch urządzeniach.
2. **Stara synchronizacja ma znaną utratę danych:** ciężar z przecinkiem („62,5”) trafia do chmury jako
   `null` (`docs/sql/README.md` §8, niepoprawione). Kolejność ćwiczeń i serii w planach nie jest
   synchronizowana (brak `position`, Etap 13 zaparkowany). To uzasadnia czysty start 1.0 na v2.
3. **Etap 4A.10** („Moje dane”, „Przenoszenie danych”, „Kopie i odzyskiwanie”) — specyfikacja
   odtworzona 11.10 (F-1) w `SPEC_4A10_MOJE_DANE.md`; w kodzie brak tych ekranów (są „Moje konto”,
   „Kopia zapasowa”, „Konflikty synchronizacji”). Pytania P1–P6 otwarte.
4. **Atlas 1.0:** gotowe narzędzia (walidator, szablon, import, kontrakt snapshotu); treść 0 z ok. 390
   ćwiczeń. Gotowe plany (8 szablonów) wskazują stare identyfikatory i trzeba je zbudować od nowa.
5. **Progress Engine 2.0:** zrobione PE-A1–A4 i A4.5 (fundament, bez zmian na ekranach). PE-B–PE-H,
   NEXTREP Reporting Engine i A5 są tylko planem.
6. **Monetyzacja:** PRO działa lokalnie (flaga, „reklama” bez SDK, import kopii nadaje PRO) i z nadania
   admina na serwerze. Brak Google Play Billing, RevenueCat, AdMob, PRO+. Ceny w UI są wpisane na sztywno.
7. **Funkcje natywne:** jest tylko `@capacitor/app` (przycisk Wstecz). NR-S1-01 (eksport) i NR-S1-02
   (dźwięk końca przerwy przy zgaszonym ekranie) otwarte. Stoper i timer cardio liczą tyknięcia.
8. **Konto:** rejestracja, logowanie, reset hasła i usuwanie konta są w kodzie, ale linki z e-maili
   w APK prowadzą na `https://localhost`. Brak polityki prywatności, regulaminu i strony WWW usuwania konta.
9. **Monitoring i marketing:** brak w kodzie. F-4: Crashlytics (zgodność z Capacitor 8 deklarowana, test
   buildu przed przyjęciem); propozycja monitoringu synchronizacji w §2.11. Brak analityki i listy oczekujących.
10. **Design:** fundamenty DONE, komponenty i ekrany w większości TODO. K01-2 (12.10): UX/UI wyłącznie
    w Claude Design, zgodnie z `DESIGN.md` §17 z `main`; aktualny `DESIGN.md` przeniesiony na
    `release/1.0` w K02 (F-2 / Stitch zastąpione).
11. **Nazwa:** w Google Play i App Store istnieją już aplikacje „NextRep” (rejestr decyzji, O-12).

Prognoza (v3.1, po O-28): sekcja K.4 — publikacja ok. połowy lutego 2027, rezerwa do początku marca;
to prognoza, nie zatwierdzony termin. Szacunek z wersji 2 (tydzień 19–22) jest nieaktualny.

---

## 2. Obszary (1–14)

Każdy obszar: wcześniejsze ustalenia · stan w kodzie · tylko plan · przetestowane · brakuje ·
zależności · kryteria odbioru · priorytet i etap. Priorytety: **P0** blokuje publikację, **P1** wymagane
w 1.0, **P2** po 1.0.

### 2.1 Zrealizowane etapy: S1, F1, PE-A1–A4, A4.5, F2.1–F2.2

| Etap | Ustalenia | Stan w kodzie | Przetestowane | Brakuje |
| --- | --- | --- | --- | --- |
| S1 | Capacitor 8, APK debug z CI, bez CDN | build `tools/build-web.mjs`, Capacitor 8.5.3, `app.nextrep.spike`, klucz debug | ✅ S22: 11/12 (NR-S1-01 otwarte → F4) | NR-S1-01, NR-S1-02 |
| F1 | modularizacja bez zmiany zachowania | `src/app/` (22 pliki), `src/engine/`, `src/assets/` | ✅ 523 testy, E2E 11/11, S22 8/8 | prawdziwe moduły zamiast łączenia plików (F3) |
| PE-A1–A4 | silnik obciążenia i objętości, bez zmian na ekranach | `src/engine/load.js`, `load-legacy-map.js` | ✅ 649 testów, `app.js` bez zmian | — |
| A4.5 | jeden punkt dostępu do objętości (10 miejsc, 6 ekranów) | `src/engine/volume.js` = wzory F1.6 | ✅ równoważność z F1.6 (1500 historii, 40 ekranów) | — |
| F2.1–F2.2 | walidator atlasu, snapshot, szablon XLSX, import | `atlas-schema/validate.js`, `load-snapshot.js`, `muscle-work.js`, `db/v2-draft/`, `tools/*atlas*` | ✅ 729 testów, CI #20 | treść atlasu, migracje v2 |

Priorytet: zamknięte. Do przeniesienia: NR-S1-01, NR-S1-02 → F4 (P0).

### 2.2 STORE FIRST: schemat v2 i synchronizacja

Szczegółowa analiza scenariuszy jest w sekcji 3.

- **Wcześniejsze ustalenia (STORE FIRST, 10.10):** nowy projekt Supabase; jeden UUID rekordu od urządzenia
  do chmury; kolumny wspólne `id, user_id, created_at, updated_at, version, deleted_at, device_id, sync_seq`;
  `position NOT NULL` na pięciu listach (plany, ćwiczenia planu, serie planu, ćwiczenia treningu, serie
  treningu), sortowanie `(position, created_at, id)`, przenumerowanie rodzeństwa, zmiana kolejności
  podnosi wersję rodzica; push jedną funkcją `nextrep_push` z atomową kontrolą wersji; pull po
  `sync_seq` per tabela; Centrum konfliktów bez „nowszy wygrywa”; `app_config` z minimalną wersją
  klienta; RLS `user_id = auth.uid()`, `version/updated_at/sync_seq` nadaje serwer; kolejka offline jedna;
  tombstony lokalne dla wszystkich typów; izolacja kont zostaje; usunięcie ok. 3 500 linii migracji.
- **Stan w kodzie:** stara synchronizacja (`07-sync-queue-push.jsx`, `08-sync-meta-pull-conflicts.jsx`,
  ok. 2 750 linii): kolejka `nextrep_sync_queue_v1` (upsert/delete, retry, deduplikacja), push rekord po
  rekordzie przez REST z wyszukaniem po `(user_id, legacy_id)` (bez UNIQUE w bazie — chroni blokada
  w kliencie), pull całych tabel stronami, konflikty wersji z magazynem `nextrep_sync_conflicts_v1`
  i Centrum konfliktów, tombstony `deleted_at`. `position` wysyłane tylko dla ćwiczeń i serii treningu;
  planów, ćwiczeń planu i serii planu — nie. Brak `nextrep_push`, `sync_seq`, `app_config`, UUID od
  urządzenia. Izolacja kont ✅ (4A.2), wybór źródła ✅ (4A.3), migracja gościa (4A.4) w kodzie, nie na
  produkcji. Z v2 istnieje tylko szkic kolumn snapshotu (`db/v2-draft/001_load_snapshot.sql`).
- **Tylko plan:** cały schemat v2, `nextrep_push`, `sync_seq`, kursory, pięć list z `position`,
  `app_config`, tombstony lokalne, „Połącz dane” (4A.5) jako suma zbiorów, logowanie offline (4A.6).
- **Przetestowane:** kolejka (10 testów), izolacja kont i przestrzeni (`workspace-*`, `accounts-storage`),
  wybór źródła (ok. 100 testów 4A.3), migracja gościa 4A.4 (ok. 100 testów), wartości do chmury Etapu 11
  (19). **Nieprzetestowane automatycznie:** push / pull / apply / konflikty / tombstony na dwóch
  urządzeniach (harness utracony — `tests/README.md`), SQL i RLS produkcji (testy utracone).
- **Brakuje:** całość v2 (patrz sekcja 3.3), harness dwóch urządzeń na prawdziwym Postgresie (PGlite jest
  już w testach), testy RLS każdej tabeli, usunięcie kodu 4A.4 / F-5 (decyzja F-5, 11.10).
- **Zależności:** F2 (atlas, snapshot), backend testowy bez `nextrep-dev` (F-10: brak zgody; O-13),
  SPEC 4A.10 (F-1).
- **Kryteria odbioru:** sekcja 3.4.
- **Priorytet i etap:** P0 · faza 4, etap SY (sekcja K); zakres (poprawiona obecna synchronizacja czy pełne
  v2 w `src/app/`) — O-23.

### 2.3 Uproszczenie danych z Etapu 4A.10: „Moje dane”, „Przenoszenie danych”, „Kopie i odzyskiwanie”

- **Ustalenia:** F-1 (11.10): trzy obszary; zasady starego systemu (izolacja gościa i kont, brak cichego
  nadpisywania, kopia przed przywracaniem, odzyskanie po błędzie, Centrum konfliktów); w v2 automatyczna
  synchronizacja i łączenie po UUID; „Zapisz dane w chmurze” znika dopiero po spełnieniu bramki.
  Specyfikacja: `SPEC_4A10_MOJE_DANE.md` (odtworzona, oryginał 4A.10 nie istnieje w repozytorium).
- **Stan w kodzie:** brak trzech ekranów. Są: „Moje konto” (konto, synchronizacja, wybór źródła,
  „Zapisz dane w chmurze” do `user_data`, przenoszenie 4A.4), „Kopia zapasowa” (kopie w `localStorage`,
  limit 10, eksport Blob, import nadpisujący), „Konflikty synchronizacji”. Luki U1–U4 starego kodu
  (PRO z importu, niesprawdzana kopia przed importem i przywróceniem, import poza kolejką, jeden klucz
  `localStorage`) — SPEC §2.
- **Tylko plan:** wszystko z SPEC 4A.10 (📝).
- **Przetestowane:** stare mechanizmy: kopia przed wczytaniem chmury (4A.3), izolacja (4A.2); eksport
  w APK ❌ (NR-S1-01). Nowe: nic.
- **Brakuje:** implementacja; szczegółowa specyfikacja kosza i retencji kopii (O-17 pkt 5); akceptacja
  listy typów „Zachowaj obie” i testów T-20–T-32 (`COVERAGE_S_T.md`, O-22); projekt ekranów w Claude Design.
- **Zależności:** F2.4 (schemat v2), F3, F4 (Filesystem, Share), IndexedDB (O-10, przyjęte), O-13 (backend testowy).
- **Kryteria odbioru:** scenariusze T-01–T-19 (SPEC §6) i S1–S28 zielone; bramka „Zapisz dane w chmurze”
  (SPEC §7) spełniona przed betą.
- **Priorytet i etap:** P1, z elementami P0 (zasady Z1–Z4, Z7) · F3 (+ pliki w F4).

### 2.4 Atlas ok. 390 ćwiczeń i gotowe plany

- **Ustalenia:** ok. 390 ćwiczeń, pełne polskie nazwy, stałe `exerciseId`, rodziny wariantów, zamknięte
  słowniki sprzętu i mięśni, wiele mięśni głównych z różnych grup, aliasy, archiwizacja, ćwiczenia
  systemowe i prywatne, hantle na jeden hantel, rodzina ≠ zamiennik; treść z ChatGPT, pola techniczne
  proponuję ja, zatwierdzasz Ty (K2); snapshot modelu w treningu (D13, F2-4, F2-5). Gotowe plany (FBW,
  Split, 5×5, PPL, Home, Glutes, Bands, Abs) jako szablony na nowych identyfikatorach (STORE FIRST).
- **Stan w kodzie:** stary atlas 68 ćwiczeń + 8 szablonów planów w `10-atlas-templates.jsx` (używane przez
  aplikację); nowy atlas `src/atlas/atlas.json` = pusty (wydanie 0); walidator, szablon XLSX, import,
  kontrakt snapshotu, szkic SQL — gotowe, nieużywane przez aplikację.
- **Przetestowane:** narzędzia ✅ (73 testy na danych syntetycznych). Treść: brak.
- **Brakuje:** słowniki sprzętu, mięśni i cech ze Standaryzacji; partie ćwiczeń; pola techniczne każdej
  partii; format `exerciseId`; zatwierdzenie typów pomiaru; szablony planów 1.0; zdjęcia ćwiczeń /
  partii (ok. 40, `DESIGN.md` §16); atlas w aplikacji (F3).
- **Zależności:** Standaryzacja (Ty + ChatGPT), F2.4 (`exercise_catalog`), F3.
- **Kryteria odbioru:** cały atlas: 0 błędów walidatora, ostrzeżenia przejrzane; każdy wpis z modelem,
  lateralnością i liczeniem powtórzeń; 8 szablonów planów walidowanych na nowych identyfikatorach;
  atlas offline w paczce aplikacji.
- **Priorytet i etap:** P0 · F2.3 (partie, równolegle) → AT1 ✅, AT2 ✅, AT3.0–AT3.8 (sekcja K): atlas
  jedynym źródłem ćwiczeń, snapshot, ćwiczenia prywatne, nowy katalog i wybór, gotowe plany
  (`NEXTREP_ATLAS_PRODUCT_SPEC_1_0.md`).

### 2.5 Finalny design i dokumentacja marki

- **Ustalenia:** `DESIGN.md` na `main` (kolory, typografia, odstępy, promienie, efekty — DONE), kierunek
  aktywnego treningu (§15), fotografia (§16), zasoby marki: Logotype i Symbol niezmienne (§18, 11.10).
  K01-2 (12.10): ekrany w **Claude Design**, `DESIGN.md` = zasady, Claude = implementacja w `src/app/`;
  wartości bez zmian (`docs/design/decisions/2026-10-12-design-tool-claude-design.md`). F-2 (Stitch)
  zastąpiona; analiza konfliktów z 11.10 zostaje jako historia.
- **Stan w kodzie:** obecny wygląd aplikacji (Tailwind, ciemny motyw), stare logo w aplikacji;
  nowe zasoby marki nie są wdrożone (wymaga osobnej zgody). `DESIGN_STATUS.md`: komponenty poza
  przyciskami i kartami TODO; ekrany „not yet designed”; prototyp i przekazanie do implementacji TODO.
- **Przetestowane:** test wizualny chroni OBECNY wygląd (20 ekranów); nowego designu nie ma czego testować.
- **Brakuje:** komponenty, 9–10 ekranów, stany puste/błędów, ekrany nowych funkcji (4A.10, PRO/PRO+,
  zakupy, zgody, usuwanie konta, onboarding), grafiki sklepu, ikona aplikacji 1.0.
- **Zależności:** projekty w Claude Design (DS1), PE-F/G/H i A5 (nowe ekrany statystyk, raportu,
  treningu), atlas w aplikacji (AT3.1, AT3.6a–d).
- **Kryteria odbioru:** każdy ekran zaakceptowany i opisany w `docs/design/`; wdrożenie bez zmian logiki;
  nowe wzorce wizualne w teście wizualnym; kontrast sprawdzony na urządzeniu.
- **Priorytet i etap:** P1 · faza 3 (DS1 równolegle od tygodnia 1, DS2 po fazie 2; sekcja K).

### 2.6 Progress Engine 2.0 i NEXTREP Reporting Engine

- **Ustalenia:** D1–D14 i PE-01–PE-32 (10.10), P1–P4, K2–K4, praca partii (F2 v2 pkt 1), etapy PE-A–PE-H,
  A5 jako ostatni krok F3 z osobną bramką. F-3 (11.10): Reporting Engine obejmuje progresję, regresję,
  objętość, rekordy, trendy, stagnację, realizację planu i rekomendacje — mapa obszarów, powierzchni
  i zależności: `REPORTING_ENGINE_MAP.md`.
- **Stan w kodzie (dowody, 11.10):** PE-A ✅ (`load.js`, `volume.js`, testy `pe-a-*`); `muscle-work.js` i
  `load-snapshot.js` ✅ (testy F2); PE-B–PE-H i A5: brak kodu w `src/engine/`. Ekrany korzystają ze
  starego silnika (`legacy-progression.js`, `14-analytics.jsx`).
- **Przetestowane:** PE-03–07, PE-18, część PE-08; stary silnik: 43 + 5 testów progresji, 39 testów
  partii. Raport, rekordy i „Twój następny krok” bez testów.
- **Brakuje:** PE-B–PE-H, A5; odpowiedzi RE-1–RE-6 (O-20).
- **Zależności:** PE-B/C/E — brak (czyste funkcje); PE-D — treść atlasu; PE-F/G/H i A5 — F3 i projekty
  ekranów (graf w mapie, §3).
- **Kryteria odbioru:** PE-01–PE-32 zielone; PE-17 i PE-24 na S22; raport i aktywny trening z jednej
  funkcji; brak ekranu z własnym wzorem obliczeń; każdy z ośmiu obszarów mapy ma wskazane testy.
- **Priorytet i etap:** P0 (PE-B, C, E, G, H) / P1 (PE-D, F) · PE-B/C/E równolegle z F2; PE-D–H w F3; A5 na końcu F3.

### 2.7 FREEMIUM, PRO i architektura PRO+

- **Ustalenia:** FREE = „co zrobiłem”, PRO = „czy robię postęp i co dalej”; tabela podziału (D10 PE);
  serwerowe uprawnienie `nextrep_my_pro` (admin), PRO wymaga konta (STORE FIRST D4, rekomendacja);
  ceny w UI 12,99 zł / mies. i 59,99 zł / rok; PRO+ AI Coach dopiero po wydaniu i kampanii.
- **Stan w kodzie:** `hasProAccess` = lokalna flaga `manualPro` lub odblokowanie „za reklamę” na 24 h
  (bez SDK) + serwerowe `nextrep_my_pro`; import kopii może ustawić PRO; ceny na sztywno; blokady PRO
  w wielu ekranach (`isPro` w 7 plikach); obecny podział nie odpowiada D10 (np. „Progres %” w FREE).
  PRO+: brak.
- **Przetestowane:** izolacja lokalnego PRO (4A.2); serwerowe PRO — „deployment verification pending”.
- **Brakuje:** usunięcie lokalnych ścieżek PRO (4A.8), podział FREE/PRO wg D10, model uprawnień z poziomem
  (`free | pro | pro_plus`) i źródłem (`google_play | admin | promo | trial`), offline cache uprawnienia
  z datą ważności, ekran zakupu z cenami z RevenueCat, „Przywróć zakupy”, zarządzanie subskrypcją.
- **Zależności:** F3 (konto, v2), F5 (Billing), STORE FIRST D2 (ceny, produkty), D3 (reklamy).
- **Kryteria odbioru:** brak jakiejkolwiek ścieżki darmowego PRO w kliencie; PRO widoczne w Androidzie
  i webie z jednego serwera; offline PRO działa do daty ważności, potem FREE; PRO+ można dodać jako nowy
  poziom bez zmiany schematu.
- **Priorytet i etap:** P0 · F5 (model uprawnień zaprojektowany już w F2.4/F3).

### 2.8 Google Play Billing, RevenueCat, reklamy, uprawnienia, offline

- **Ustalenia:** Billing 8+ (od 31.08.2026); RevenueCat → webhook → Edge Function → `pro_grants`
  (`google_play`); reklamy: decyzja D3 (AdMob z UMP albo usunięcie); offline: ostatnia odpowiedź serwera
  z datą ważności.
- **Stan w kodzie:** brak Billing, RevenueCat, AdMob, Edge Functions; przycisk „Obejrzyj reklamę”
  odblokowuje PRO bez reklamy (tekst w UI to przyznaje).
- **Przetestowane:** nic.
- **Brakuje:** całość; konto Play Console (STORE FIRST D1), produkty, testerzy licencji, tor wewnętrzny,
  idempotentny webhook, deklaracje reklam w Play.
- **Zależności:** F3, tor wewnętrzny Play (F7.0), domena i SMTP (F6), D1, D2, D3.
- **Kryteria odbioru:** zakup, odnowienie, anulowanie, przywrócenie, zwrot i wygaśnięcie u testera
  licencji; uprawnienie w webie; offline zgodnie z zasadą; jeśli reklamy — UMP i zgoda przed pierwszą
  reklamą; jeśli nie — deklaracja „brak reklam” i usunięcie przycisku.
- **Priorytet i etap:** P0 · F5.

### 2.9 Funkcje natywne Androida

- **Ustalenia (F4):** powiadomienie końca odpoczynku (zgoda od Androida 13), ekran włączony, haptyka,
  eksport i import pliku (Filesystem, Share), przycisk Wstecz, timery od znaczników czasu, zapis szkicu
  na `pause`, linki zewnętrzne poza WebView, edge-to-edge.
- **Stan w kodzie:** `@capacitor/app` (Wstecz: `goBack` lub nic) ✅; SystemBars `css` ✅; timer treningu
  i przerwy od znaczników czasu ✅; stoper ćwiczenia i timer cardio liczą tyknięcia (`s + 1`, linie 168
  i 529 `18-active-workout.jsx`) ❌; Web Wake Lock, `navigator.vibrate`, AudioContext — webowe; eksport
  przez Blob ❌ w APK; `mailto:` i linki YouTube bez obsługi natywnej.
- **Przetestowane:** S22: start offline, Wstecz, przetrwanie blokady ekranu i przełączania, przywrócenie
  szkicu ✅ (S1/F1). NR-S1-01 ❌, NR-S1-02 ❌.
- **Brakuje:** wtyczki: Local Notifications, Keep Awake, Haptics, Filesystem, Share, Browser (lub
  odpowiedniki); stoper i cardio na znacznikach czasu; powiadomienie trwającego treningu (opcja przy
  oszczędzaniu baterii Samsung).
- **Zależności:** F1 (spełnione); dla importu — format v2 (F3).
- **Kryteria odbioru:** lista kontrolna na S22: powiadomienie końca przerwy przy zgaszonym ekranie
  (także w trybie oszczędzania), stoper w tle, eksport i ponowny import pliku, linki zewnętrzne, wibracja.
- **Priorytet i etap:** P0 · F4 (może iść równolegle z F2/F3).

### 2.10 Konta, logowanie, reset hasła, usuwanie konta, bezpieczeństwo, dokumenty prawne

- **Ustalenia:** Supabase Auth bez Google; potwierdzenia kodem 6-cyfrowym (`verifyOtp`) zamiast linków;
  własny SMTP i domena; usuwanie konta w aplikacji i na stronie WWW; ostrzeżenie o subskrypcji przed
  usunięciem; brak logowania offline bez potwierdzenia sesji (memory/decyzja), zapisana sesja otwiera
  lokalną przestrzeń konta (STORE FIRST); RLS wszędzie, brak `service_role` w kliencie; samohostowane
  czcionki ✅ (F1); polityka prywatności, regulamin.
- **Stan w kodzie:** rejestracja, logowanie, wylogowanie, reset hasła, nowe hasło, usuwanie konta
  (`delete_user`) ✅ w kodzie; linki e-mail przez `authRedirectUrl()` (implicit flow) — w APK `https://localhost`;
  logowanie offline: komunikat sieci ✅, kontynuacja w przestrzeni konta — OPEN (4A.6); panel
  administratora (role po stronie serwera) w kodzie; brak polityki prywatności, regulaminu, strony WWW
  usuwania konta; tekst o usuwaniu konta niezgodny z kodem (STORE FIRST).
- **Przetestowane:** czyszczenie lokalne po usunięciu konta ✅ (4A.2), komunikat offline ✅; reset hasła
  i rejestracja w APK — nie.
- **Brakuje:** OTP, SMTP, domena, dokumenty prawne, strona usuwania konta, poprawiony tekst, decyzja
  o panelu admina w Androidzie (STORE FIRST D10), `webContentsDebuggingEnabled: false` w wydaniu,
  ostateczna nazwa pakietu (dziś `app.nextrep.spike`; kandydat `app.nextrep` — weryfikacja w
  `DECISIONS_1_0.md` §4), klucz wydaniowy i Play App Signing.
- **Zależności:** D7 (domena), F6 (produkcja), F5 (ostrzeżenie o subskrypcji).
- **Kryteria odbioru:** cały cykl konta kodem z e-maila na S22; usunięcie konta w aplikacji i przez WWW;
  doradcy bezpieczeństwa Supabase bez ostrzeżeń krytycznych; testy RLS każdej tabeli v2.
- **Priorytet i etap:** P0 · F3 (OTP, offline) + F6 (prawo, SMTP, strona).

### 2.11 Monitoring

- **Ustalenia:** F-4 (11.10): Crashlytics dla Androida, warunkowo — po potwierdzeniu zgodności z
  Capacitor; Android Vitals; diagnostyka synchronizacji, płatności i reklam; bez danych treningowych i
  osobowych w raportach błędów (wcześniejsze ustalenie).
- **Stan w kodzie:** brak SDK błędów i analityki; brak globalnej obsługi błędów JS; diagnostyka
  synchronizacji tylko w konsoli (`[sync diag]`) i w panelu admina (statystyki użytkowników).
- **Weryfikacja Crashlytics (11.10):** `@capacitor-firebase/crashlytics` 8.5.2 deklaruje Capacitor ≥ 8
  (nasz 8.5.3) — zgodność deklarowana ✅, potwierdzenie buildem ❌ (wymaga projektu Firebase, O-14).
  Ograniczenia: tylko Android i iOS (wersja web bez monitoringu, O-15); błędy JS z WebView trzeba
  przekazywać ręcznie (`window.onerror`, `unhandledrejection` → `recordException`); bundel minifikowany
  bez map źródeł, więc stosy JS będą mało czytelne. Szczegóły: `DECISIONS_1_0.md` §3.
- **Propozycja: monitoring synchronizacji (v2)**

  | Warstwa | Co mierzymy | Jak | Bez danych treningowych |
  | --- | --- | --- | --- |
  | Klient — dziennik diagnostyczny | długość kolejki, wiek najstarszej zmiany, próby i wyniki wysyłki wg klasy (sieć, 401/403, konflikt wersji, 5xx), konflikty utworzone i rozstrzygnięte, czas i liczba rekordów pobrania, data ostatniej potwierdzonej synchronizacji, blokada minimalnej wersji, nieudane kopie bezpieczeństwa, brak miejsca | lokalny bufor (np. 500 ostatnich zdarzeń, IndexedDB); ekran „Diagnostyka synchronizacji” w „Moje dane” z eksportem raportu do zgłoszenia | tylko liczby, kody i znaczniki czasu |
  | Klient — Crashlytics | klucze kontekstu (stan synchronizacji, przedział długości kolejki, przedział wieku ostatniej synchronizacji, wersja schematu); zdarzenia niekrytyczne przy naruszeniu niezmienników (duplikat UUID, osierocony rekord po pobraniu, ujemna lub zdublowana `position`, nieudane rozstrzygnięcie konfliktu, nieoczekiwana odpowiedź `nextrep_push`) | `setCustomKey`, `recordException` | jw.; identyfikator użytkownika nie jest wysyłany (do decyzji przy Data safety) |
  | Serwer — `nextrep_push` | na każde wywołanie: liczba zaakceptowanych, konfliktów, odrzuconych, wersja klienta, czas | tabela `sync_events` (tylko liczniki), retencja 30–90 dni | jw. |
  | Serwer — kontrole niezmienników | dzieci bez rodzica, zdublowane pozycje na liście, żywe dzieci usuniętego rodzica, spadek wersji | zapytanie okresowe (mechanizm harmonogramu do sprawdzenia w planie Supabase, O-05) | tylko liczby |
  | Panel admina „Zdrowie synchronizacji” | odsetek błędów wysyłki, odsetek konfliktów, klienci poniżej `min_client_version`, liczba kont z kolejką starszą niż 24 h, wyniki kontroli | widok w istniejącym panelu admina (D10 otwarta dla Androida; web wystarczy) | jw. |
  | Alarmy | wzrost 5xx, czas `nextrep_push` (p95), skok konfliktów, niezerowe kontrole niezmienników | e-mail do administratora | jw. |

- **Brakuje:** O-14 (projekt Firebase i test buildu), O-15 (web), O-16 (analityka i zgody), Data safety,
  lista zdarzeń produktowych, monitoring webhooków płatności (F5).
- **Kryteria odbioru:** awaria testowa i błąd JS widoczne w Crashlytics w < 5 min bez danych osobowych;
  sztucznie wywołany błąd synchronizacji widoczny w dzienniku klienta, w `sync_events` i na panelu;
  eksport diagnostyki nie zawiera nazw, ciężarów ani notatek (test); alarmy 5xx i webhooka działają.
- **Priorytet i etap:** P0 (błędy, diagnostyka synchronizacji) · dziennik klienta i `sync_events` w F3
  (razem z v2), Crashlytics, panel i alarmy w F6; P1 (analityka) · F6.

### 2.12 Marketing

- **Ustalenia:** lista oczekujących, kampania przedpremierowa, kampania po publikacji, pomiar skuteczności.
- **Stan:** brak w kodzie i w dokumentach (poza kartą sklepu w STORE FIRST).
- **Brakuje:** strona z listą oczekujących (zgoda RODO), plan kampanii, materiały, link UTM / Play
  Install Referrer, karta sklepu, zrzuty z nowego designu, rekrutacja ≥ 12 testerów (STORE FIRST).
- **Zależności:** domena (D7), design (zrzuty), polityka prywatności.
- **Kryteria odbioru:** lista oczekujących działa od ~tygodnia 4; ≥ 15 testerów zapisanych przed F7;
  pomiar: zapisy → instalacje → konta → PRO.
- **Priorytet i etap:** P1 · M1–M3 (sekcja C).

### 2.13 Beta-testy, publikacja, pierwsze tygodnie

- **Ustalenia:** tor wewnętrzny → test zamknięty ≥ 12 testerów przez 14 dni (konto osobiste) → wniosek
  (do 7 dni) → produkcja z rozkładem procentowym; AAB, Play App Signing, API 36, Data safety, deklaracja
  zdrowotna, IARC, konto dla recenzenta.
- **Stan:** brak konta Play Console (stan z 10.10); CI buduje tylko APK debug.
- **Brakuje:** konto (D1), AAB release, podpis, karta sklepu, deklaracje, testerzy.
- **Kryteria odbioru:** sekcja D.
- **Priorytet i etap:** P0 · F7.

### 2.14 PRO+ AI Coach

- **Ustalenia:** wyłącznie po publikacji 1.0 i rozpoczęciu kampanii, gdy są użytkownicy.
- **Stan:** brak (i słusznie).
- **Do przygotowania wcześniej (bez budowy funkcji):** poziom `pro_plus` w modelu uprawnień (F3/F5);
  silnik raportów jako deterministyczne źródło faktów dla przyszłego AI; zgody i polityka prywatności
  pisane tak, by nie trzeba było ich zmieniać pod AI bez nowej zgody użytkownika.
- **Priorytet i etap:** P2 · sekcja E.

---

## 3. Synchronizacja — analiza szczegółowa

### 3.1 Dwie implementacje

| Cecha | Stara (kod `release/1.0`, produkcja na `main`) | Docelowa v2 (STORE FIRST, tylko plan) |
| --- | --- | --- |
| Identyfikator | lokalne `uid()` + UUID w chmurze, łączone przez `legacy_id` (bez UNIQUE w bazie) | jeden UUID z urządzenia |
| Push | rekord po rekordzie: odczyt, potem insert/update; blokada w kliencie przed duplikatem | `nextrep_push(paczka)` — atomowo, kontrola wersji, zwrot konfliktów |
| Pull | całe tabele stronami, porównanie treści | `sync_seq > kursor` per tabela |
| Wersja i czas | `version` z klienta, `updated_at` | `version`, `updated_at`, `sync_seq` nadaje serwer |
| Kolejność | `position` tylko ćwiczenia i serie treningu; plany i ich elementy bez kolejności | `position NOT NULL` na pięciu listach, wersja rodzica |
| Konflikt | ta sama wersja zmieniona inaczej → magazyn konfliktów, Centrum konfliktów | to samo; konflikt kolejności = konflikt rodzica |
| Usunięcie | `deleted_at` zdalnie; lokalnie usunięcie z tablicy | tombstony lokalne dla wszystkich typów |
| Stary klient | brak blokady (mechanizm aktualizacji tylko przeładowuje web) | `app_config.min_client_version` — stary klient nie synchronizuje |
| Pierwsze połączenie | heurystyki `bootstrapSyncMeta…`, migracja V1, F-5 | wspólne UUID od początku |
| Gość → konto | maszyna migracji 4A.4 + SQL F-5 (tylko test) | przepisanie przestrzeni + rekordy do kolejki |
| Testy | kolejka (10); harness push/pull/konflikty utracony | harness dwóch urządzeń na Postgresie (do zbudowania) |

Wniosek: starej implementacji nie domykamy dla 1.0 (czysty start). Jej scenariusze opisuję, bo
produkcja `main` nadal z niej korzysta dla Twoich bieżących treningów.

### 3.2 Scenariusze i ich status

Kolumna „stara” = dowód dla obecnego kodu; „v2” = wymaganie odbioru F3.

| # | Scenariusz | Stara | v2 — wymaganie |
| --- | --- | --- | --- |
| S1 | A i B zmieniają różne rekordy → oba w chmurze i na obu urządzeniach | 🟡 „TESTING”, brak testu automatycznego | test automatyczny dwóch klientów |
| S2 | A i B zmieniają ten sam rekord → konflikt, wybór wersji | 🟡 mechanizm w kodzie, E2E OPEN | konflikt z `nextrep_push`, Centrum konfliktów, test |
| S3 | A usuwa, B edytuje (offline) | ❌ OPEN | jawny konflikt „usunięty / zmieniony”, bez cichego wskrzeszenia |
| S4 | A i B usuwają ten sam rekord | ⛔ nieopisane | idempotentne, bez konfliktu |
| S5 | przywrócenie usuniętego rekordu (ten sam id) | 🟡 ścieżka w push (`deleted_at = null`) | test; wersja rośnie |
| S6 | usunięcie rodzica (plan, trening) z dziećmi | ⛔ nieopisane dla kaskady tombstonów | tombstony dzieci w tej samej paczce; pull nie zostawia sierot |
| S7 | ćwiczenie własne usunięte, a użyte w historii / planach | ⛔ | archiwizacja zamiast usunięcia; historia czyta snapshot |
| S8 | zmiana kolejności planów / ćwiczeń planu / serii planu na A, B widzi tę samą | ❌ brak `position` (Etap 13 zaparkowany) | przenumerowanie, wersja rodzica, test pięciu list |
| S9 | A i B zmieniają kolejność tej samej listy | ❌ | jeden konflikt rodzica |
| S10 | superseria przestawiona na jednym urządzeniu | ⛔ | walidacja ciągłości `superset_group` |
| S11 | ciężar „62,5” na A → B | ❌ trafia jako `null` (znane, niepoprawione) | liczby w schemacie numeric; test przecinka |
| S12 | oba urządzenia offline, zmiany, potem połączenie | 🟡 „TESTING” | test: kolejność wysyłki, konflikty, brak duplikatów |
| S13 | aplikacja zabita w trakcie wysyłki paczki | 🟡 blokada i ponawianie | `nextrep_push` atomowe; ponowienie bez duplikatów (ten sam UUID) |
| S14 | zegar urządzenia przestawiony | 🟢 wersje, nie zegar, decydują o konflikcie; pull bez zależności | `sync_seq` z serwera |
| S15 | stary klient po zmianie schematu | ❌ brak blokady | `app_config`: stary klient nie synchronizuje, prosi o aktualizację |
| S16 | trening w toku na A, B w tym czasie | 🟢 szkic nie jest synchronizowany (test) | bez zmian; jasny komunikat |
| S17 | zmiana konta z niewysłaną kolejką | ✅ kolejka per przestrzeń, timery anulowane (4A.2) | zachować testy |
| S18 | gość → nowe konto | 🟠 4A.4 w kodzie, SQL tylko na teście (usuwane, F-5) | przepisanie przestrzeni do konta + kolejka; SPEC 4A.10 T-01–T-04 |
| S19 | konto z danymi lokalnymi + chmura („Połącz dane”, 4A.5) | ❌ nierozpoczęte | suma zbiorów po UUID; konflikty tylko dla tych samych UUID |
| S20 | wybór źródła: urządzenie / chmura / puste | ✅ 4A.3 (ok. 100 testów) | brak wyboru źródła w v2 (SPEC 4A.10 §4.2); proponowane nowe brzmienie w `COVERAGE_S_T.md` §4 |
| S21 | przywrócenie kopii lokalnej | 🟡 kopie w kodzie, wpływ na kolejkę niezweryfikowany; wynik kopii „przed przywróceniem” niesprawdzany | „przywróć brakujące” domyślnie, „dokładny stan” jawnie, przez kolejkę; SPEC 4A.10 T-09, T-11, T-15 |
| S22 | import pliku JSON | ❌ omija kolejkę, może nadać PRO, nadpisuje listy | walidacja v2, podgląd, „Dodaj” domyślnie, kopia przed importem, kolejka, bez PRO; SPEC 4A.10 T-05–T-08, T-14 |
| S23 | usunięcie konta | ✅ lokalnie (4A.2); w chmurze `delete_user` | + strona WWW, + subskrypcja |
| S24 | logowanie offline / sesja wygasła offline | ❌ OPEN (4A.6) | O-18: zapisana, wcześniej uwierzytelniona sesja → offline dane tego konta; nowe logowanie wymaga internetu; zmiana konta bez potwierdzonej tożsamości nie ujawnia danych innego konta (T-28) |
| S25 | brak miejsca w pamięci | ❌ jedna wartość `localStorage` na kopie | IndexedDB (O-10), limit kopii, komunikat; T-13, T-32 |
| S26 | atlas zmieniony po treningu | ⛔ (stary atlas kopiowany do konta) | snapshot w treningu (F2, D13) |
| S27 | te same UUID trafiają do drugiego konta (plik lub przestrzeń gościa użyta ponownie) | ⛔ nieopisane | nowe UUID przy imporcie z innego konta; opróżnienie gościa po przeniesieniu; SPEC 4A.10 T-17, T-01 |
| S28 | operacja na danych przerwana (import, przywracanie, przeniesienie) | 🟡 markery 4A.3 tylko dla wczytania chmury i wysyłki | dziennik operacji i ekran „Dokończ / Cofnij”; SPEC 4A.10 T-04, T-14, T-15 |

### 3.3 Brakujące elementy v2 (zakres F2.4 + F3)

1. Schemat v2: tabele użytkownika z kolumnami wspólnymi, `exercise_catalog`, `atlas_releases`,
   `custom_exercises`, `workout_exercises` ze snapshotem, `workout_exercise_load_corrections`, `app_config`,
   uprawnienia z poziomem (`free | pro | pro_plus`), RLS, triggery `sync_seq`, `version`, `updated_at`.
2. `nextrep_push` i pull po `sync_seq`, testowane w PGlite / lokalnym Postgresie (bez kosztów).
3. Klient: UUID wszędzie, jedna kolejka, tombstony lokalne, pięć list z `position`, konflikty
   (w tym usunięty / zmieniony i kolejność), Centrum konfliktów dostępne z klawiatury i czytnika ekranu.
4. Usunięcie warstwy migracji (V1, F-5, 4A.4, `user_data`, stare klucze) — ok. 3 500 linii i ok. 300 testów
   (decyzja F-5: usunąć; wymagane zachowania gościa i konta przez SPEC 4A.10).
5. Harness dwóch klientów (S1–S28) na prawdziwym SQL.
6. Dziennik diagnostyczny synchronizacji i `sync_events` (§2.11).
7. Brak zgody na `nextrep-dev` (F-10): F2.4 lokalnie (PGlite / lokalny Postgres); backend dla testów E2E
   F3 i toru wewnętrznego — decyzja O-13.

### 3.4 Kryteria odbioru synchronizacji v2

- Wszystkie scenariusze S1–S28 mają test automatyczny (dwóch klientów, ten sam backend SQL) i są zielone.
- Brak duplikatów po przerwaniu i ponowieniu (S13) na 1 000 losowych przebiegów.
- Pięć list: kolejność identyczna na obu klientach po każdej sekwencji zmian.
- RLS: użytkownik B nie czyta, nie zapisuje i nie usuwa danych A w żadnej tabeli (test per tabela).
- Stary klient (wersja < `min_client_version`) nie wysyła ani nie pobiera danych.
- Na S22 i w przeglądarce: trening offline → połączenie → dane na drugim urządzeniu.

---

## A. Rejestr funkcji i statusów

| ID | Funkcja | Status | Dowód (kod / test) | Etap docelowy |
| --- | --- | --- | --- | --- |
| A01 | Build bez CDN, Capacitor 8, APK z CI | ✅ | `tools/build-web.mjs`, CI #20, S22 | — |
| A02 | Modularizacja `src/` | ✅ | F1, `check-split` | prawdziwe moduły w F3 |
| A03 | Dashboard (podsumowanie 30 dni, karta przerwanego treningu) | ✅ | `dates-dashboard` (19), E2E | design D3 |
| A04 | Atlas 68 ćwiczeń + cardio | 🗑 (zastąpi atlas 1.0) | `10-atlas-templates.jsx` | F3 |
| A05 | Atlas 1.0 (ok. 390) — narzędzia | ✅ | 73 testy F2 | — |
| A06 | Atlas 1.0 — treść | 📝 | `src/atlas/atlas.json` puste | F2.3 |
| A07 | Ćwiczenia własne z modelem obciążenia | 📝 | projekt F2 v2 | F3 |
| A08 | Plany użytkownika, edytor, superserie | 🟡 | kod; brak `position` w sync | F3 (v2) |
| A09 | Gotowe plany (8 szablonów) | 🟡 stare id | `READY_PLAN_TEMPLATES` | F2.3/F3 |
| A10 | Aktywny trening: serie, RIR, dropsety, timer przerwy, szkic | ✅ | E2E, S22 | PE-H |
| A11 | Stoper ćwiczenia i timer cardio w tle | ❌ | tyknięcia (`s + 1`) | F4 |
| A12 | Historia, edycja, dopisanie treningu wstecz | ✅ | E2E | — |
| A13 | Pomiary i pola własne | 🟡 | kod, brak testów dedykowanych | F3 |
| A14 | Statystyki partii (10 grup) | ✅ stare | `muscle-groups` (39) | PE-D/F |
| A15 | Raport treningowy | 🟡 | kod; brak testów raportu (spec PE) | PE-G |
| A16 | Silnik progresji (stary) | ✅ | 43 + 5 testów | PE-B |
| A17 | Silnik obciążenia i objętości (PE-A) | ✅ | 649→729 testów | A5 |
| A18 | Punkt dostępu do objętości (A4.5) | ✅ | równoważność F1.6 | A5 |
| A19 | Snapshot modelu w treningu | 🟠 kontrakt + SQL szkic | 21 testów | F2.4/F3 |
| A20 | PE-B…PE-H, A5 | 📝 | spec PE | F2/F3 |
| A21 | NEXTREP Reporting Engine (osiem obszarów analityki PRO) | 📝 mapa zakresu i zależności | `REPORTING_ENGINE_MAP.md`; kod: tylko PE-A | PE-B–PE-H, A5 |
| A22 | Konto: rejestracja, logowanie, reset, usunięcie | 🟡 | kod; linki e-mail nie działają w APK | F3/F6 |
| A23 | Logowanie offline (4A.6) | ❌ OPEN | komunikat ✅, przestrzeń konta ❌ | F3 |
| A24 | Izolacja kont i przestrzeni | ✅ | 4A.2 testy | zachować w F3 |
| A25 | Wybór źródła (urządzenie / chmura / puste) | ✅ | 4A.3 (~100 testów) | uprościć w F3 |
| A26 | Gość → konto (4A.4) | 🟠 kod + SQL na teście | ~100 testów, brak produkcji | 🗑 / przepisać w F3 |
| A27 | Połącz dane (4A.5) | 📝 | — | F3 |
| A28 | Synchronizacja stara (kolejka, push, pull) | 🟡 / 🗑 | 10 testów kolejki | zastąpi v2 |
| A29 | Konflikty i Centrum konfliktów | 🟡 | kod; E2E OPEN | F3 |
| A30 | Synchronizacja v2 (`nextrep_push`, `sync_seq`, pięć list, UUID) | 📝 | — | F2.4/F3 |
| A31 | Minimalna wersja klienta (`app_config`) | 📝 | — | F3 |
| A32 | „Moje dane”, „Przenoszenie danych”, „Kopie i odzyskiwanie” (4A.10) | 📝 specyfikacja odtworzona | `SPEC_4A10_MOJE_DANE.md` | F3 / F4 |
| A33 | Kopie lokalne | 🟡 | `localStorage`, limit 10 | F3 (IndexedDB) |
| A34 | Eksport / import pliku | ❌ w APK | NR-S1-01; import omija kolejkę | F3/F4 |
| A35 | PRO serwerowe (admin) | 🟡 | „deployment verification pending” | F5 |
| A36 | PRO lokalne / „reklama” / PRO z importu | 🗑 | `hasProAccess` | F5 (usunąć) |
| A37 | Podział FREE / PRO wg D10 | 📝 | — | F5 |
| A38 | Google Play Billing + RevenueCat | 📝 | — | F5 |
| A39 | Reklamy (AdMob + UMP) | 📝 decyzja D3 | — | F5/F6 |
| A40 | PRO+ (poziom uprawnień) | 📝 | — | F3/F5 (model) |
| A41 | PRO+ AI Coach | 📝 po premierze | — | E |
| A42 | Panel administratora | 🟡 | kod, testy ręczne historyczne | D10 STORE FIRST |
| A43 | Formularz opinii (`mailto:`) | 🟡 | kod; `mailto:` w APK niesprawdzone | F4 |
| A44 | Powiadomienie końca przerwy | ❌ | NR-S1-02 | F4 |
| A45 | Ekran włączony, haptyka | 🟡 web | Wake Lock web | F4 |
| A46 | Przycisk Wstecz | ✅ | S22 | — |
| A47 | Polityka prywatności, regulamin, strona usuwania konta | ⛔ | — | F6 |
| A48 | Monitoring błędów (Crashlytics, F-4 warunkowo) | 📝 zgodność deklarowana, bez testu buildu | §2.11, `DECISIONS_1_0.md` §3 | F6 |
| A49 | Analityka produktowa | ⛔ | — | F6 |
| A50 | Lista oczekujących, kampanie | ⛔ | — | M1–M3 |
| A51 | Nowy design (komponenty, ekrany) | 🟠 fundamenty | `docs/design/` | D1–D4 |
| A52 | Zasoby marki (Logotype, Symbol) | 📝 zatwierdzone, niewdrożone | `DESIGN.md` §18 | D4 |
| A53 | Mechanizm aktualizacji web (build id) | ✅ web / wyłączony w APK | `index.html` | Play + `app_config` |
| A54 | AAB release, podpis, nazwa pakietu | ⛔ (kandydat `app.nextrep`) | `app.nextrep.spike`, klucz debug | F7.0 |
| A55 | Monitoring synchronizacji (dziennik klienta, `sync_events`, panel, alarmy) | 📝 propozycja | §2.11 | F3 / F6 |
| A56 | „Zapisz dane w chmurze” (`user_data`) | 🗑 po bramce SPEC 4A.10 §7 | `13-account-ui.jsx:805` | F3 |

## B. Rejestr zaległości i ryzyk

| ID | Pozycja | Typ | Skutek | Działanie | Etap |
| --- | --- | --- | --- | --- | --- |
| B01 | Harness synchronizacji utracony | zaległość | brak dowodu dla S1–S28 | harness dwóch klientów na PGlite | F3 |
| B02 | Ciężar z przecinkiem → `null` w chmurze (stara sync) | błąd starej produkcji | utrata danych na drugim urządzeniu | v2: numeric + PE-27; stara produkcja: `LEGACY_PRODUCTION_RISKS.md` L01 (F-6: bez zmian `main`) | F3 |
| B03 | Brak `position` w planach (stara sync) | błąd | inna kolejka na drugim urządzeniu | v2 pięć list | F3 |
| B04 | Kod 4A.4 na `release/1.0` wymaga SQL F-5 niewdrożonego na produkcji | ryzyko | APK wskazany na produkcję zatrzymałby sync | APK tylko na projekt testowy; decyzja o usunięciu 4A.4 | F3 |
| B05 | Dokumenty statusu nieaktualne (4A.4 „NOT STARTED”, liczby testów) | dokumentacja | mylący stan | aktualizacja po akceptacji tego planu | F2 |
| B06 | 4A.10 odtworzone, nie oryginalne | ryzyko | pominięcie ustaleń, których nie ma w źródłach | przegląd SPEC 4A.10, P1–P6 | F2 |
| B07 | Reporting Engine: RE-1–RE-6 otwarte | luka | niejasny zakres raportów | O-20 | F2 |
| B08 | Dokumenty designu sprzeczne z narzędziem; starszy `DESIGN.md` na `release/1.0` | sprzeczność | implementacja według nieaktualnych wartości | K01-2: `DESIGN.md` z `main` (K02); `STITCH.md` historyczny; pozostałe wzmianki o Stitch w `DESIGN.md` §12, §14 — propozycja tekstu w decyzji z 12.10 | K02 / DS1 |
| B09 | Crashlytics: brak testu buildu, brak wersji web, nieczytelne stosy JS | ryzyko | luki w monitoringu | O-14, O-15; spike po zgodzie | F6 |
| B10 | Treść atlasu (390) i słowniki | ścieżka krytyczna | opóźnienie F3, PE-D/F | partie tygodniowe od tygodnia 1 | F2.3 |
| B11 | Linki e-mail w APK → `https://localhost` | bloker | brak rejestracji / resetu w APK | OTP | F3 |
| B12 | Lokalne ścieżki darmowego PRO | bloker sklepu | naruszenie zasad Play | usunięcie | F5 |
| B13 | `localStorage` jako jedyny magazyn | ryzyko | cicha utrata kopii przy limicie | IndexedDB (O-10, przyjęte) | F3 |
| B14 | Stoper / cardio w tle; powiadomienie przerwy | błąd | złe czasy, przegapiona przerwa | F4 | F4 |
| B15 | Zmiana hostname/scheme WebView po wydaniu | ryzyko | utrata danych lokalnych | blokada w konfiguracji i test | F7.0 |
| B16 | Nazwa pakietu `app.nextrep.spike` | decyzja | nazwa stała na zawsze | decyzja przed pierwszym AAB | F7.0 |
| B17 | `webContentsDebuggingEnabled: true` | bezpieczeństwo | debug w wydaniu | wyłączyć w release | F7.0 |
| B18 | Brak 12 testerów | ryzyko | brak dostępu do produkcji | rekrutacja od M1 | M1 |
| B19 | Koszty (Supabase Pro, Vercel Pro, domena, SMTP, Play) | decyzja | blokada F6 | zgody kosztowe | F6 |
| B20 | Decyzje STORE FIRST D1–D3, D6–D10 bez potwierdzenia (D11 przyjęte jako O-10) | decyzje | blokady F5–F7 | sekcja F | F2–F6 |
| B21 | Dług 4A.3 F4–F11 | dług | dotyczy starej sync | znika z v2 | F3 |
| B22 | Podział FREE/PRO niespójny z D10 („Progres %” w FREE, niewyświetlane podpowiedzi) | zaległość | niezgodność produktu | F5 | F5 |
| B23 | Serwerowe PRO — weryfikacja wdrożenia | zaległość | niepewny stan produkcji starej wersji | tylko odczyt, Twoja zgoda | F5 |
| B24 | `getHistoricalBest` czyta „57,5” jako NaN, dropsety w rekordach | błąd | błędne rekordy | PE-E | F2 |
| B25 | Ekran szczegółów ćwiczenia: przecinek = 0 kg | błąd (zachowany w A4.5) | zaniżone liczby | A5 | F3 |
| B26 | Ostrzeżenia Supabase / RLS produkcji 1.0 | ryzyko | odrzucenie, wyciek | doradcy bez krytycznych | F6 |
| B27 | Inne aplikacje „NextRep” w Google Play i App Store | ryzyko marki | odrzucenie nazwy, pomyłki użytkowników, spór o znak | O-12 przed kartą sklepu | F6 |
| B28 | Backend testowy bez `nextrep-dev` | decyzja | brak E2E na prawdziwym backendzie w F3 | O-13 | F3 |
| B29 | Logowanie offline — rozstrzygnięte (O-18) | zamknięte w dokumentach | — | implementacja i T-28 w F3 | F3 |
| B30 | Kolizja identyfikatora `hanging_knee_raise`: stary katalog 68 i stare mapy silnika vs atlas Batch 01 (R-AT3-1) | ryzyko | grupy ze starej mapy dla nowego ćwiczenia; stara historia odczytana jako historia ćwiczenia z atlasu | AT3-D8: separacja przestrzeni, grupy i model ze snapshotu albo atlasu, stare mapy niewywoływane, brak snapshotu = usterka z ostrzeżeniem (F2-4), test wspólnych id | AT3.4 |

## C. Harmonogram

Harmonogram z wersji 2 (F2.0–F7, design D0–D4 w Google Stitch, publikacja w tygodniu 19) został
zastąpiony 12.10.2026 przez sekcję K.4 (decyzje K01-1–K01-5). Wersja 2 jest w historii git
(`81e1d4b`, `7d13f74`).

## D. Warunki wejścia

### D.1 Wejście do testu wewnętrznego (tor wewnętrzny)

- [ ] Wszystkie testy automatyczne zielone; harness synchronizacji S1–S28 zielony.
- [ ] Atlas 1.0 kompletny w zakresie 1.0 (0 błędów walidatora), szablony planów na nowych id.
- [ ] Brak kodu migracji starych danych i ścieżek darmowego PRO.
- [ ] F4 zaliczone na S22 (NR-S1-01, NR-S1-02 zamknięte).
- [ ] AAB podpisany, Play App Signing, ostateczna nazwa pakietu, `webContentsDebuggingEnabled: false`, stały hostname/scheme.
- [ ] Backend testowy 1.0 z RLS i testami RLS każdej tabeli (rodzaj backendu: O-13).
- [ ] SPEC 4A.10: T-01–T-19 zielone; bramka „Zapisz dane w chmurze” spełniona.

### D.2 Wejście do testu zamkniętego (beta)

- [ ] Funkcjonalnie kompletna 1.0: PE-01–PE-32 zielone, A5 zaakceptowane, nowy design wdrożony.
- [ ] Billing: zakup, odnowienie, anulowanie, przywrócenie, wygaśnięcie u testera licencji.
- [ ] Produkcja 1.0: Supabase Pro, kopie zapasowe, SMTP z domeny, Edge Functions, doradcy bez krytycznych.
- [ ] Polityka prywatności, regulamin, strona usuwania konta online; Data safety, deklaracja zdrowotna, IARC wypełnione.
- [ ] Monitoring błędów działa (Crashlytics: awaria testowa i błąd JS widoczne), bez danych osobowych; panel zdrowia synchronizacji i alarmy działają.
- [ ] ≥ 15 testerów zapisanych (rezerwa ponad 12).

### D.3 Wniosek o produkcję i publikacja

- [ ] 14 dni testu zamkniętego z ≥ 12 testerami bez przerwy.
- [ ] Brak błędów krytycznych z testu i raportu przedpremierowego; Android Vitals bez przekroczeń progów.
- [ ] Konto dla recenzenta Google; uczciwe opisy PRO i cen (ceny z RevenueCat).
- [ ] Plan wyłączenia starej wersji (STORE FIRST D9) zatwierdzony; Twoje dane ze starej wersji wyeksportowane.
- [ ] Rozkład procentowy (np. 10% → 50% → 100%) i kryteria zatrzymania (sekcja E).

## E. Po premierze: utrzymanie, monitoring, PRO+

**Pierwsze 4 tygodnie.**

| Okres | Działanie |
| --- | --- |
| Dni 1–7 | codzienny przegląd: awarie, Android Vitals, błędy synchronizacji (push 4xx/5xx, konflikty, kolejki > 24 h), webhooki płatności, opinie w Play; rozkład 10% → 50% → 100% tylko przy braku błędów krytycznych |
| Tydzień 2–4 | wydania poprawkowe co tydzień; kopia zapasowa bazy sprawdzona (odtworzenie na dev); przegląd kosztów |
| Kryteria zatrzymania rozkładu | wskaźnik awarii powyżej progu Play, utrata danych, błędne uprawnienie PRO, 5xx Data API |

**Monitoring stały:** błędy (F-4), Android Vitals, panel zdrowia synchronizacji (admin), płatności
(RevenueCat + webhook), reklamy (jeśli D3), analityka produktowa (aktywacja, retencja D1/D7/D30,
konwersja do PRO), lejek marketingowy (zapisy → instalacje → konta → PRO).

**PRO+ AI Coach — warunki startu prac:** 1.0 opublikowane; kampania M3 rozpoczęta; co najmniej
liczba aktywnych użytkowników i retencja ustalone z rzeczywistych danych po publikacji (F-9, O-19); stabilne Android Vitals;
Twoja osobna zgoda. Etapy: E1 specyfikacja (zakres coachingu, źródło faktów = silnik PE i raporty,
bezpieczeństwo treści zdrowotnych, zgody i polityka prywatności, koszty modelu); E2 prototyp na
koncie testowym; E3 beta PRO+ dla części użytkowników; E4 wydanie. Wcześniej (w 1.0) tylko poziom
`pro_plus` w modelu uprawnień, bez funkcji.

**iOS:** po stabilizacji Androida (STORE FIRST: ok. 3–5 tygodni, Mac z Xcode, App Store Connect,
RevenueCat dla Apple).

## F. Decyzje

Rejestr decyzji (podjętych i otwartych) jest w `DECISIONS_1_0.md`. Stan 13.10.2026: F-0–F-11, C01, K01-1–K01-5
podjęte (F-2, O-21, C01-1, C01-7 zastąpione przez K01); O-28 rozstrzygnięte 13.10; przyjęte kierunki
O-10, O-17, O-18; otwarte O-01–O-09, O-11–O-17, O-19, O-20, O-22–O-27, O-29 (koszty i wybory biznesowe STORE FIRST, identyfikator pakietu,
nazwa, backend testowy, Firebase, monitoring web, analityka, pytania 4A.10 i Reporting Engine, próg PRO+,
zakres synchronizacji, nowy projekt Supabase, zakres Progress Engine, buildy testowe etapów, magazyn,
minimalny atlas).

---

*Ten plan nie uruchamia żadnych prac. Kolejny krok implementacyjny wymaga Twojej osobnej zgody.*
