# NEXTREP 1.0 — rejestr decyzji

Wersja 11 · 19.10.2026 · gałąź `release/1.0` (projekt do odbioru)

Zmiany w wersji 11: etap B02/S3 — model obciążenia wybrany w pozycji planu nr1 trafia do snapshotu
treningu (sekcja 1g); szkic SY `db/v2-draft/002_plan_item_load_model.sql`.

Zmiany w wersji 10: B02-D25 A — maszyna Smitha (`smith_plates_only`, opcjonalny opór początkowy R jako
ustawienie karty, snapshot v3); etap B02/S2 wdrożony w silniku (sekcja 1g); D-3 w sekcji 1f zastąpiona;
otwarte O-35 (porównania Smitha w PE-B/PE-E) i O-36 (e1RM Smitha).

Zmiany w wersji 9: AT3-D12 A — pełna karta ćwiczenia (`instructionsPl`, `commonMistakesPl`, `safetyPl`);
etap B02/S1 wdrożony w schemacie i walidatorze (sekcja 1g), obowiązek treści dla rekordów systemowych
odroczony do S4.

Zmiany w wersji 8: B02-D21 — konfigurowalny model obciążenia maszyn (sekcja 1f; D-1 = A, D-2, D-3 = S2,
zatwierdzone 18.10.2026); niespójność rejestru: AT3-D20 przywołana w handoffie B02-D21, brak w rejestrze
(O-34).

Zmiany w wersji 7: decyzje AT3-D16–AT3-D19 (sekcja 1e): wspólna hierarchia nawigacji i statystyk
(zastępuje AT3-D1), zasady agregacji (zastępuje AT3-D2), snapshot v2, pełne cardio w NEXTREP 1.0; decyzje
O-30–O-33 (cardio) zgłoszone jako otwarte i rozstrzygnięte przez właściciela 17.10.2026; P1–P3 i B2
zatwierdzone 18.10.2026; specyfikacja atlasu
w wersji 2.

Zmiany w wersji 6: decyzje AT3-D1–AT3-D15 (sekcja 1d, etap AT3.0): nowy atlas jedynym źródłem ćwiczeń,
trzy warstwy klasyfikacji, harmonogram AT3.0–AT3.8, obowiązkowy snapshot od AT3.4, ryzyko R-AT3-1
(`hanging_knee_raise`) i mechanizm ochrony historii; O-26 rozstrzygnięte 13.10 (S1 środowiskiem rozwoju);
specyfikacja `NEXTREP_ATLAS_PRODUCT_SPEC_1_0.md`.

Zmiany w wersji 5: O-28 rozstrzygnięte (13.10.2026) — przygotowanie synchronizacji i prace w Claude Design
mogą przebiegać równolegle; wdrożenie i integracja wymagają osobnej zgody i testów (sekcja 1c).

Zmiany w wersji 4: decyzje K01-1–K01-5 (sekcja 1c) — powrót do rozwoju istniejącej aplikacji
`src/app/`, Claude Design jako jedyne narzędzie UX/UI, integracja etapami, kolejność priorytetów.
Decyzje zastąpione przez K01 zostają w rejestrze z adnotacją (historia decyzji).

Zmiany w wersji 3: decyzje C01-1–C01-7 (sekcja 1b) i ustalenie N0.

Zmiany w wersji 2: kierunki O-10, O-17, O-18, O-21 (decyzje z 11.10.2026, po commicie `81e1d4b`);
MASTER PLAN v2 przyjęty jako aktualna podstawa planowania.

Rejestr zbiera decyzje 1.0: podjęte (z datą i źródłem) i otwarte. Decyzja jest „podjęta” tylko wtedy,
gdy padła wprost od Ciebie. Rekomendacja w dokumencie nie jest decyzją. Ten plik zastępuje sekcję F
„Decyzje do podjęcia” w `NEXTREP_1_0_MASTER_PLAN.md` (wersja 1).

## 1. Decyzje po audycie MASTER PLAN (11.10.2026)

| # | Decyzja | Skutek w dokumentach | Status |
| --- | --- | --- | --- |
| F-0 | `NEXTREP_1_0_MASTER_PLAN.md` przyjęty jako baza planowania, z zastrzeżeniem uzupełnienia decyzji i specyfikacji | MASTER PLAN v2 | przyjęta |
| F-1 | 4A.10 odtworzyć jako trzy obszary („Moje dane”, „Przenoszenie danych”, „Kopie i odzyskiwanie”), z zasadami bezpieczeństwa starego systemu; w v2 automatyczna synchronizacja i łączenie po UUID; „Zapisz dane w chmurze” usuwane dopiero po bezpiecznym zastąpieniu | `SPEC_4A10_MOJE_DANE.md` (pytania P1–P6 otwarte) | przyjęta |
| F-2 | Google Stitch — projektowanie ekranów; `DESIGN.md` — zasady wizualne; Claude — implementacja. Najpierw wskazać konflikt z §17, bez zmiany wartości Design Systemu | `docs/design/decisions/2026-10-11-design-tool-google-stitch.md` (konflikty K1–K8, zmiany tekstu do akceptacji). Zastępuje kierunek z §17 (10.10) | **zastąpiona przez K01-2 (12.10)** |
| F-3 | Reporting Engine szerszy niż PE-F i PE-G: progresja, regresja, objętość, rekordy, trendy, stagnacja, realizacja planu, rekomendacje; mapa zależności z PE bez zgadywania statusu | `REPORTING_ENGINE_MAP.md` (pytania RE-1–RE-6 otwarte) | przyjęta |
| F-4 | Monitoring Androida: Crashlytics, pod warunkiem potwierdzenia zgodności ze stosem Capacitor; propozycja monitoringu synchronizacji | MASTER PLAN §2.11 (weryfikacja zgodności i propozycja) | przyjęta warunkowo; warunek: test na buildzie (sekcja 3) |
| F-5 | Kod 4A.4 / F-5 usuwany w 1.0; SQL F-5 nie trafia na produkcję; wymagane zachowania gościa i konta przez model v2 | MASTER PLAN §2.2, §3; SPEC 4A.10 §4.1 | przyjęta |
| F-6 | Nie zmieniać teraz `main`; błąd przecinka do osobnego rejestru ryzyk starej produkcji | `LEGACY_PRODUCTION_RISKS.md` (L01–L10) | przyjęta |
| F-7 | Decyzje wymagające kosztów lub wyborów biznesowych pozostają otwarte; nie zakładać ich zatwierdzenia | sekcja 2 (O-01–O-10) | przyjęta |
| F-8 | `app.nextrep` jest kandydatem na identyfikator pakietu; zweryfikować przed zatwierdzeniem | sekcja 4 | kandydat; weryfikacja częściowa |
| F-9 | PRO+ po premierze i starcie marketingu; próg użytkowników z rzeczywistych danych | MASTER PLAN sekcja E | przyjęta; próg otwarty (O-19) |
| F-10 | Brak zgody na płatny projekt `nextrep-dev` | MASTER PLAN sekcja C (F2.4 tylko lokalnie), O-13 | przyjęta |
| F-11 | MASTER PLAN v2 (`81e1d4b`) — aktualna podstawa planowania | — | przyjęta |

## 1a. Kierunki przyjęte 11.10.2026 (po `81e1d4b`) — bez rozpoczynania implementacji

| # | Kierunek | Skutek w dokumentach | Co zostaje otwarte |
| --- | --- | --- | --- |
| O-10 | **IndexedDB** jako docelowy główny magazyn danych treningowych, z obsługą błędów i ograniczeń pojemności | SPEC 4A.10 §5.1, §8; MASTER PLAN (D11 → przyjęte); test T-32 (propozycja) | szczegóły warstwy magazynu i limitów — projekt w F3 |
| O-17 | (1) domyślnie nie nadpisujemy danych; (2) zastąpienie danych wymaga **zweryfikowanej** kopii i jawnego potwierdzenia; (3) dane gościa mogą zostać wyczyszczone dopiero po **potwierdzonym przeniesieniu i synchronizacji**; (4) „Zachowaj obie” tylko tam, gdzie bezpieczne kopiowanie z nowym UUID nie narusza spójności; (5) kosz i retencja kopii wymagają szczegółowej specyfikacji | SPEC 4A.10 Z2, Z3, §4.1, §4.4, §9; testy T-29–T-31 (propozycja) | P1 (kosz) i P4 (retencja) — do szczegółowej specyfikacji; lista typów dla „Zachowaj obie” (propozycja w SPEC §4.4) |
| O-18 | Zapisana, wcześniej uwierzytelniona sesja umożliwia **dostęp offline do lokalnych danych właściwego konta**. Nowe logowanie wymaga internetu. Zmiana konta bez potwierdzonej tożsamości nie może ujawnić danych innego konta | SPEC 4A.10 P6 (rozstrzygnięte), MASTER PLAN S24, B29; test T-28 (propozycja). Zastępuje wcześniejszą zasadę „gość + komunikat” dla sesji zapisanej | szczegóły wygaśnięcia sesji offline — projekt w F3 |
| O-21 | Przygotować propozycję sześciu poprawek tekstu; Stitch pozostaje głównym workflow; wartości Design Systemu bez zmian bez Twojej zgody | `docs/design/decisions/2026-10-11-design-docs-text-proposal.md` (z kontrolą niezmiennika wartości) | **zastąpiony przez K01-2 (12.10)**: poprawki 1–4 i 6 nieaktualne; poprawka 5 (aktualny `DESIGN.md` z `main` na `release/1.0`, bez zmiany wartości) wykonana w K02 |

## 1b. Decyzje C01 — separacja architektury (zatwierdzone 12.10.2026, zlecenie N0)

| # | Decyzja | Skutek | Status po K01 |
| --- | --- | --- | --- |
| C01-1 | NEXTREP 1.0 powstaje w `src/nr1/`, obok starej aplikacji | `docs/nr1/README.md` | **zastąpiona przez K01-1** |
| C01-2 | Deweloperski identyfikator Androida: `app.nextrep.dev` | osobny projekt natywny (etap N9); nie przesądza O-11 | **zastąpiona przez O-26 (13.10)**: bez `app.nextrep.dev`; rozwój w istniejącym S1 |
| C01-3 | Bramka A5 = akceptacja właściciela przed pierwszym ekranem z wynikami Progress Engine 2.0 | etap N8 | **zmieniona przez K01-1**: A5 wraca do pierwotnego znaczenia — przełączenie istniejących ekranów na wzory `load.js`, osobna akceptacja |
| C01-4 | `issuedIds` zostaje w `atlas.json`; metadane wydania generuje build | `tools/build-nr1.mjs` (N0); dokumentacja F2 zgodna z tą decyzją | obowiązuje (także dla `src/app/`) |
| C01-5 | Szablony planów w osobnym `src/atlas/plan-templates.json`, z własnym walidatorem | etap późniejszy (nie w N0) | obowiązuje (etap AT3.8, dawniej AT6) |
| C01-6 | `fake-indexeddb` wyłącznie jako zależność testowa; bez nowej biblioteki produkcyjnej do IndexedDB na start | N2 | do ponownej oceny razem z zakresem O-10 w `src/app/` (O-27) |
| C01-7 | Stara aplikacja na `release/1.0` zamrożona do N12 | test zamrożenia w `tests/nr1/n0.test.mjs` | **zastąpiona przez K01-1**; test zamrożenia zostaje do pierwszego etapu zmieniającego `src/app/` (AT2), który go zdejmuje w swoim zakresie |

Ustalenie N0: `src/engine/load.js` importuje `parseRirBounds` z `legacy-progression.js`, więc nowe moduły
silnika ciągną stary silnik przechodnio. Usunięcie tej zależności jest pierwszym krokiem N1
(`docs/nr1/README.md`).

## 1c. Decyzje K01 — korekta strategii (12.10.2026)

Źródło: zlecenie K01 i raport „NEXTREP 1.0 — K01: korekta strategii i integracja atlasu”; K01-1–K01-3
zatwierdzone 12.10.2026, K01-4 i K01-5 podane wprost w tej samej akceptacji.

| # | Decyzja | Skutek dla wcześniejszych decyzji |
| --- | --- | --- |
| K01-1 | Anulujemy budowę nowego interfejsu w `src/nr1/`. NEXTREP 1.0 = rozwój istniejącej aplikacji `src/app/` (`index.html`). `src/nr1/` zostaje w repozytorium jako zachowany rezultat N0–N1, nierozwijany bez nowego polecenia | C01-1 i C01-7 zastąpione; C01-3 wraca do pierwotnego znaczenia A5; C01-4 i C01-5 obowiązują; C01-2 i C01-6 do ponownej oceny (O-26, O-27) |
| K01-2 | UX/UI projektowane wyłącznie w Claude Design | F-2 (Stitch) i O-21 zastąpione; `DESIGN.md` §17 z `main` obowiązuje; `docs/design/decisions/2026-10-12-design-tool-claude-design.md` |
| K01-3 | Cel: jak najszybsza publikacja pełnowartościowego 1.0 w Google Play bez ponownego tworzenia ekranów; PRO+ (AI Coach) poza 1.0 | potwierdza STORE FIRST (10.10) i F-9 |
| K01-4 | Integracja etapami, zaczynając od atlasu. Każdy etap ma własny zakres, osobną zgodę na start, kryteria odbioru i osobne testowanie w działającej aplikacji. Nie wdrażamy B1–B8 naraz | MASTER PLAN v3 §K; zasada zakresu niżej |
| K01-5 | Kolejność priorytetów: działający NEXTREP → nowy atlas i plany → dopracowany design → synchronizacja, monetyzacja i wymagania Google Play → publikacja | harmonogram MASTER PLAN v3 §K.4 |

| O-28 | (13.10.2026) Przygotowanie synchronizacji i prace w Claude Design mogą przebiegać równolegle; kolejność priorytetów K01-5 nie zakazuje równoległej pracy nad niezależnymi obszarami. Wdrożenie i integracja (w tym synchronizacji i ekranów w `src/app/`) wymagają osobnej zgody oraz testów | harmonogram MASTER PLAN v3.1 §K.4: wariant równoległy jest podstawowy; K01-4 i zasada zakresu bez zmian |

**Zasada zakresu (z K01-4).** Decyzja architektoniczna, propozycja w raporcie ani zmiana w dokumencie
technicznym nie zmienia zakresu projektu. Zmiana zakresu (co budujemy, w której aplikacji, w jakiej
kolejności) wymaga osobnej, nazwanej decyzji właściciela w tym rejestrze. Jeśli etap ujawni potrzebę
takiej zmiany, etap zatrzymuje się i wraca z propozycją decyzji.

## 1d. Decyzje AT3 — atlas jedynym źródłem ćwiczeń (17.10.2026)

Źródło: audyt AT3 (14.10.2026), koncepcja atlasu opracowana z ChatGPT i zaakceptowana przez właściciela
17.10.2026, raport uzgodnieniowy AT3 (17.10.2026); pakiet decyzji zatwierdzony przez właściciela
17.10.2026 (etap AT3.0). Prefiks „AT3-” odróżnia te decyzje od D1–D11 STORE FIRST i D1–D14 Progress
Engine. Specyfikacja: `NEXTREP_ATLAS_PRODUCT_SPEC_1_0.md`; harmonogram: MASTER PLAN §K.3–K.4.

| # | Decyzja | Status |
| --- | --- | --- |
| AT3-D1 | Partie nawigacyjne oddzielone od 10 grup statystycznych i od klasyfikacji anatomicznej; zdefiniowane jako zbiory kodów mięśni ze słownika atlasu w osobnym pliku `src/atlas/navigation.json` z walidatorem, bez zmiany schematu atlasu. Filtry wielokryterialne: partie, sprzęt, rodzaj obciążenia, chwyt, pozycja, kąt ławki, jednostronność, rodzina | **zastąpiona przez AT3-D16** (17.10.2026); filtry wielokryterialne pozostają w AT3-D16 |
| AT3-D2 | Jeden słownik nazw 10 grup statystycznych: Klatka piersiowa, Plecy, Barki, Biceps, Triceps, Przedramiona, Brzuch, Czworogłowe uda, Dwugłowe uda / pośladki, Łydki; nazwy użyte w katalogu AT2 („Uda — przód”, „Uda — tył i pośladki”) poprawiane w AT3.2 | **zastąpiona przez AT3-D17** (17.10.2026); 10 grup przestaje być podziałem produktu, nazwy w katalogu AT2 poprawiane w AT3.2 na nazwy kategorii i podpartii |
| AT3-D3 | Czysty start S1: nowa przestrzeń danych, stare dane testowe nietknięte i niewidoczne, bez migracji i bez mapowania identyfikatorów | obowiązuje (STORE FIRST, K01) |
| AT3-D4 | Gotowe plany wyłącznie na nowym atlasie (`plan-templates.json`, C01-5). Do czasu szablonów sekcja gotowych planów z informacją, że pojawią się wraz z atlasem; treść szablonów przygotowuje właściciel (z ChatGPT), gdy atlas obejmie potrzebne ćwiczenia (O-29) | zatwierdzona |
| AT3-D5 | Chmura w S1 (logowanie i synchronizacja) wyłączona od AT3.3 do etapu SY; `nextrep-f5-test` bez zmian | zatwierdzona |
| AT3-D6 | Ćwiczenia prywatne: model techniczny w AT3.5 (UUID, pola modelu atlasu, mięśnie ze słownika atlasu, „nie wiem” → `external_unknown`, snapshot `source: private`); docelowy formularz w AT3.6d (tryb podstawowy i zaawansowany, sugestie istniejących ćwiczeń). Pola trybu podstawowego ustala projekt AT3.1 w granicach tego modelu | zatwierdzona |
| AT3-D7 | Testy: od AT3.4 nowy przebieg E2E na atlasie; test wizualny porównuje z zaakceptowanym stanem poprzedniego etapu zamiast z aplikacją `a2b9ca0` | zatwierdzona |
| AT3-D8 | Ochrona historii i kolizji `hanging_knee_raise` (ryzyko R-AT3-1, niżej): separacja przestrzeni (AT3-D3); grupy i model w nowej przestrzeni ze snapshotu, a przy jego braku z atlasu — nigdy ze starych map kluczowanych starymi id; brak snapshotu = usterka z ostrzeżeniem (F2-4), bez uzupełniania z bieżącego atlasu; test listy wspólnych id z AT2. Obowiązuje od pierwszego zapisu w nowej przestrzeni (AT3.4) | obowiązuje |
| AT3-D9 | UI przejściowe z obecnych komponentów w AT3.4–AT3.5; docelowy wygląd w AT3.6a–d po projekcie | zatwierdzona |
| AT3-D10 | Listę partii nawigacyjnych (od 17.10: hierarchię AT3-D16 — nazwy i kody węzłów) potwierdza czat „Standaryzacja ćwiczeń NextRep”; schemat atlasu bez zmian | zatwierdzona |
| AT3-D11 | „Podobne ćwiczenia — sugestie oparte na danych, bez deklarowania zamienności”: wyliczane z danych atlasu, bez wpływu na progresję; zasady F2 V8 (brak pól równoważności) i K3 (rodzina ≠ zamiennik) bez zmian | zatwierdzona |
| AT3-D12 | Instrukcja wykonania i typowe błędy jako nowe pola atlasu dopiero po przygotowaniu treści w Standaryzacji i osobnej zgodzie na zmianę schematu F2; do tego czasu sekcje karty ukryte | **rozstrzygnięta wariantem AT3-D12 A** (18.10.2026, sekcja 1g) |
| AT3-D13 | Zdjęcia na rodzinę albo partię, nie na każde ćwiczenie; osobny etap zasobów według `DESIGN.md` §16 | zatwierdzona |
| AT3-D14 | Ulubione lokalnie w AT3.6a; synchronizacja w SY | zatwierdzona |
| AT3-D15 | Numeracja: dawne etapy AT4 (snapshot), AT5 (ćwiczenia prywatne) i AT6 (gotowe plany) wchłonięte w AT3.4/AT3.7, AT3.5/AT3.6d i AT3.8 | zatwierdzona |

**Ustalenie techniczne (raport uzgodnieniowy, K-1).** Obowiązkowy snapshot modelu obciążenia powstaje od
AT3.4 — pierwszego etapu, który zapisuje treningi na ćwiczeniach atlasu — przy dodaniu ćwiczenia do
treningu i jest zapisywany przy wpisie historii. AT3.7 wykorzystuje go do statystyk partii (praca główna i
pomocnicza), progresji i bramki A5. Uwaga: raport z 17.10 mówił o odrzucaniu zapisu bez snapshotu; to
sprzeczne z F2-4, które obowiązuje — brak snapshotu jest usterką z ostrzeżeniem, a trening nie jest
tracony.

**Ryzyko R-AT3-1 (otwarte do AT3.4).** `hanging_knee_raise` istnieje w starym katalogu 68 ćwiczeń, w
starych mapach silnika (`ATLAS_MUSCLE_GROUPS`, `load-legacy-map.js`) i w atlasie Batch 01. To zbieg
identyfikatorów, nie mapowanie. Bez ochrony silnik przypisałby nowemu ćwiczeniu grupy ze starej mapy, a
stara historia mogłaby zostać odczytana jako historia ćwiczenia z atlasu. Mechanizm ochrony: AT3-D8.
Zamknięcie: test odbioru AT3.4 (trening `hanging_knee_raise` w nowej przestrzeni daje grupy z atlasu).

**O-26 rozstrzygnięte (13.10.2026, decyzja właściciela).** Codzienna aplikacja właściciela działa z `main`
przez Vercel i nie może zostać naruszona. `release/1.0` i istniejący APK S1 są środowiskiem rozwoju Android
NEXTREP 1.0; bez `app.nextrep.dev` i bez nowego workflow; `app.nextrep.spike` pozostaje tymczasowym
identyfikatorem testowym (ostateczny: O-11); `nextrep-f5-test` pozostaje testowym backendem S1 (od AT3.3 w
S1 nieużywany do SY, AT3-D5).

## 1e. Decyzje AT3-D16–AT3-D19 — wspólna hierarchia, agregacja, snapshot v2, cardio (17.10.2026)

Źródło: decyzje właściciela produktu po audycie „AT3-D1/D2: wspólna hierarchia atlasu i statystyk”
(17.10.2026) i zlecenie zamknięcia AT3-D1/D2 (17.10.2026). Szczegóły, tabele i testy:
`NEXTREP_ATLAS_PRODUCT_SPEC_1_0.md` wersja 2, sekcje 3, 6, 7 i 11.

| # | Decyzja | Status |
| --- | --- | --- |
| AT3-D16 | **Jedna hierarchia dla nawigacji atlasu i statystyk** (zastępuje AT3-D1). Kategorie: Klatka piersiowa, Plecy, Barki, Ramiona, Brzuch i core, Nogi, Cardio i kondycja (osobna kategoria aktywności). Przynależność ćwiczenia do kategorii mięśniowej wyznaczają wyłącznie `primaryMuscles`; mięśnie pomocnicze prezentowane oddzielnie. Hierarchia w `src/atlas/navigation.json` z `hierarchyVersion` i walidatorem (każdy aktywny mięsień w dokładnie jednej podpartii). 19 kodów Batch 01 zmapowanych; w Nogach przywodziciele i zginacze biodra to osobne podpartie. Zaplanowane rozszerzenia słownika `gastrocnemius`, `soleus`, `gluteus_medius`, `rhomboids` — dodawane w partii atlasu Standaryzacji, nie w tym zleceniu. Pole `statsGroup` zostaje tymczasowo w schemacie (M4); usunięcie wymaga osobnej, kontrolowanej zmiany schematu i szablonu importu. Filtry wielokryterialne jak w AT3-D1 | zatwierdzona; nazwy i kody węzłów potwierdza Standaryzacja (AT3-D10) |
| AT3-D17 | **Zasady agregacji** (zastępuje AT3-D2). Każdy mięsień główny dostaje pełną objętość serii; każda podpartia i kategoria liczy serię najwyżej raz w obrębie własnego węzła; kategoria nie jest sumą podpartii; suma treningu liczona niezależnie od kategorii. Praca pomocnicza to osobna metryka na poziomie mięśnia, podpartii i kategorii, zachowana także wtedy, gdy węzeł ma pracę główną; praca główna i pomocnicza nie są sumowane. Zastępuje F2 v2 pkt 1 w części rozłączności grup (`deriveGroups`, M6); rozłączność mięśni (M3) zostaje. Normalizacja obciążenia, jednostronność, powtórzenia, serie i statusy objętości z `load.js` bez zmian. Nazwa metryki: „Objętość ćwiczeń angażujących partię”. Progresja per `exerciseId` | zatwierdzona |
| AT3-D18 | **Snapshot v2.** `primaryMuscles` i `secondaryMuscles` zamrożone przy zapisie; `primaryGroups` i `secondaryGroups` wycofane; węzły hierarchii wyliczane przy odczycie z bieżącej hierarchii; raporty i eksporty podają `hierarchyVersion`. Brak snapshotu nadal usterką z ostrzeżeniem (F2-4). Brak migracji: S1 nie ma danych z atlasu, szkic SQL nigdzie nie działa | zatwierdzona |
| AT3-D19 | **Pełne cardio w NEXTREP 1.0**: katalog, plany i treningi, zapis czasu i dystansu, historia, statystyki czasu i dystansu, trendy i porównania. Jednostki kanoniczne: sekundy (`durationSec`) i metry (`distanceM`); seria wykonana przy czasie lub dystansie > 0; tempo wyliczane, nie zapisywane; czas i dystans nigdy w kg; cardio w osobnym bloku sum treningu. Bez GPS, integracji z urządzeniami, tętna i kalorii bez osobnej decyzji | zatwierdzona; szczegóły: O-30–O-33 rozstrzygnięte 17.10 (niżej) |

**Rozstrzygnięcia O-30–O-33 (17.10.2026, decyzje właściciela).**
- **O-30:** ćwiczenie cardio nie wymaga `primaryMuscles`; mięśnie cardio są opcjonalne i informacyjne, nie
  uczestniczą w agregacji siłowej ani w kategoriach mięśniowych. Reguła M1 rozróżnia ćwiczenia siłowe
  (mięsień główny wymagany) i cardio (`measurementType: cardio`, mięśnie opcjonalne); tak samo reguła
  snapshotu `ws_primary_muscle`. Dotyczy ćwiczeń systemowych i prywatnych.
- **O-31:** w 1.0 zapisywane są wyłącznie czas i dystans. Kalorie, tętno, prędkość jako osobne pole,
  nachylenie i pozostałe parametry — poza zakresem. Tempo jest tylko wyliczane z czasu i dystansu.
- **O-32:** dystans agregowany w ramach konkretnej aktywności (`exerciseId`); bez jednej sumy dystansu
  różnych aktywności. Łączny czas cardio może być sumowany.
- **O-33:** „Cardio i kondycja” bez podpartii w 1.0; rodzaje aktywności wyszukiwane i filtrowane, bez
  sztucznych podpartii mięśniowych.

**Rozstrzygnięcia P1–P3 i B2 (18.10.2026, decyzje właściciela).**
- **P1:** czas cardio oceniany według zasady „krócej = lepiej” tylko dla tego samego `exerciseId`, przy
  identycznym dystansie i porównywalnych warunkach pomiaru; w innych przypadkach zmiana czasu jest
  informacją, bez automatycznej oceny poprawy. Tempo jest wskaźnikiem wyliczanym, nie przechowywanym.
- **P2:** dla `durationSec` i `distanceM` puste pole = brak wartości; jawne zero i wartość ujemna są
  nieprawidłowe; seria cardio jest wykonana, gdy co najmniej jedna z tych wartości jest poprawna;
  walidacja obejmuje ćwiczenia systemowe i prywatne.
- **P3:** ćwiczenie cardio występuje wyłącznie w kategorii „Cardio i kondycja”; opcjonalne mięśnie
  informacyjne nie powodują pojawienia się w kategoriach mięśniowych ani nie uczestniczą w statystykach
  objętości siłowej.
- **B2:** każde prywatne ćwiczenie inne niż cardio ma co najmniej jeden mięsień główny; reguła spójna w
  formularzu, walidatorze i kontrakcie snapshotu (`ws_primary_muscle`).

**Zależności etapów po AT3-D16–D19.** AT3.2 obejmuje hierarchię, snapshot v2, agregację węzłów i kontrakt
cardio w silniku (AT3.2a–c); AT3.4 zapisuje snapshot v2 także dla cardio i ma przejściowy wpis cardio; AT3.5 i AT3.6d wymagają mięśnia
głównego w prywatnym ćwiczeniu innym niż cardio (B2);
AT3.6a pokazuje 7 kategorii i podpartie (cardio bez podpartii); AT3.6b–c kartę, historię i wpis cardio; AT3.7 ekrany statystyk
kategorii, podpartii, mięśni i cardio. Progress Engine: definicje PE (D1–D14, PE-01–PE-32) bez zmian;
w PE-D „partie” oznaczają węzły hierarchii AT3-D16 z zasadami AT3-D17.

## 1f. B02-D21 — konfigurowalny model obciążenia maszyn (18.10.2026)

Źródło: decyzja właściciela B02-D21 i rozstrzygnięcia audytu D-1, D-2, D-3 (18.10.2026). Implementacja
warstwy silnika: `src/engine/load-model-options.js`, `buildLoadSnapshot` (parametr `loadModel`); spec
atlasu §6.1; notatka Smitha `docs/atlas/B02-D21-SMITH-S2.md`.

| # | Decyzja | Status |
| --- | --- | --- |
| B02-D21 | **Konfigurowalny model obciążenia maszyn.** Jedno ćwiczenie katalogowe (np. „Wyciskanie na maszynie”) może być wykonywane na maszynie ze stosem (`machine_stack`) albo ładowanej talerzami (`plate_loaded`); wybór to konfiguracja wykonania (pozycja planu, trening bez planu), utrwalana w snapshocie wykonania. Nie tworzymy osobnych ćwiczeń tylko z powodu konstrukcji maszyny; nie scalamy ćwiczeń różniących się mechaniką, kątem lub wykonaniem. Wpis: stos — wartość ze stosu; talerze — suma dołożonych talerzy; bez doliczania konstrukcji. Wzory tonażu bez zmian (oba modele: ciężar całkowity) | zatwierdzona |
| B02-D21 / D-1 | Dozwolone modele wynikają z istniejącego słownika sprzętu (wariant A): wybór tylko gdy domyślny model ćwiczenia należy do {`machine_stack`, `plate_loaded`} i jego jedyny sprzęt obciążający (V5) jawnie dopuszcza oba; w innych przypadkach wyłącznie model z atlasu. Bez pola `loadModelOptions` w atlasie, bez wnioskowania z nazw | zatwierdzona, wdrożona w silniku |
| B02-D21 / D-2 | **Kontrolowany wyjątek od K3 / V3 / I6:** wybór spośród jawnie dopuszczonych modeli maszynowych danego ćwiczenia nie jest nowym wariantem ćwiczenia. Wyjątek nie zezwala na zmianę interpretacji zapisanej historii (snapshot zamraża model wykonania) ani na łączenie różnych ćwiczeń. Porównania kg rozdzielone kluczem `exerciseId + loadModel + entryRev` (D13); zmiana modelu nie jest spadkiem ani wzrostem siły | zatwierdzona |
| B02-D21 / D-3 | ~~Maszyna Smitha: osobna konwencja (S2) — znany opór początkowy: wpis = opór początkowy + talerze (bez domyślnych 20 kg); nieznany: dopuszczalny wpis samych talerzy, jednoznacznie oznaczony i nieporównywalny bezpośrednio z pełnym ciężarem.~~ Obowiązkowa informacja na karcie: „Szukaj naklejki informacyjnej na maszynie.” | **zastąpiona przez B02-D25 A** (sekcja 1g): użytkownik zawsze wpisuje same talerze P; opór początkowy R to opcjonalne ustawienie karty; wcześniejsza propozycja zapisu przez `barbell_total` / `plate_loaded` wycofana |

**Uwaga do snapshotu.** Wybrany model jest zapisywany w istniejącym polu `loadModel`; `source: atlas` i
`confidence: verified` pozostają, bo opisują pochodzenie definicji ćwiczenia (atlas), a wybrany model jest
jednym z modeli dopuszczonych danymi atlasu. Snapshot nie zapisuje jawnie, że model pochodzi z wyboru
(da się to odtworzyć: model ≠ domyślny i należy do opcji). Osobne pole pochodzenia wyboru wymagałoby
zatwierdzonej zmiany kontraktu i szkicu SQL — nie wprowadzono.

## 1g. AT3-D12 A i B02-D25 A — pełna karta ćwiczenia, maszyna Smitha, model maszyny w planie; etapy B02/S1–S4 (18–19.10.2026)

Źródło: decyzja właściciela AT3-D12 A (rejestr B02-STD-12), audyt B02-STD-13 i polecenie B02/S1
(18.10.2026). Implementacja S1: `src/engine/atlas-schema.js` (`CARD_CONTENT_FIELDS`, `CARD_CONTENT_LIMITS`,
`cardContentProblems`, `readCardContent`), `src/engine/atlas-validate.js` (reguła T5); testy
`tests/unit/b02-s1-card-content.test.mjs`.

| # | Decyzja | Status |
| --- | --- | --- |
| AT3-D12 A | Pola `instructionsPl`, `commonMistakesPl`, `safetyPl` (listy punktów po polsku) w rekordach systemowych i prywatnych; `tipsPl` zostaje. Pola redakcyjne: poza `CALC_FIELDS` i `INTERPRETATION_FIELDS`, więc zmiana tekstu nie podnosi `entryRev` i nie reinterpretuje historii. Bez `contentRev` (wymagałby odrębnej decyzji). Treść pisze Standaryzacja | zatwierdzona; schemat wdrożony w S1 |
| B02/S1 | Zamknięty schemat zna trzy pola. Pole obecne musi mieć 1–10 punktów; każdy punkt to tekst niepusty po obcięciu spacji, najwyżej 300 znaków (po obcięciu), unikalny po obcięciu. Rekord systemowy: błąd T5 (`CARD_CONTENT_TYPE`, `_EMPTY`, `_TOO_MANY`, `CARD_ITEM_TYPE`, `_EMPTY`, `_TOO_LONG`, `_DUPLICATE`); pusta lista `[]` jest błędem — jedyną dozwoloną formą braku treści jest brak pola. Rekord prywatny: pola opcjonalne, te same problemy jako ostrzeżenie T5, wczytanie starszych danych nigdy nie jest blokowane; do wyświetlania `readCardContent` (kopia poprawnych punktów, bez mutacji rekordu). Walidator nie zmienia rekordów | wdrożona (S1) |
| B02/S4 | Obowiązek obecności trzech pól w każdym aktywnym rekordzie systemowym włączany razem z treścią 15 kart Batch 01 dostarczoną przez Standaryzację (jeden etap, żeby walidacja atlasu w CI nie została przerwana). Przed S4: szablon importu XLSX (`tools/atlas-xlsx.mjs`) musi przenosić trzy pola — dziś ich nie zna | zaplanowana; nie wdrożona |

| B02-D25 A | **Maszyna Smitha.** Trzy identyfikatory Smitha bez zmian, model `smith_plates_only`: wpisywana jest zawsze masa talerzy **P**. Opcjonalny opór początkowy **R** [kg] to ustawienie karty ćwiczenia danego użytkownika (nie pole wspólnego atlasu); `0` = świadomie podane zero, brak = R nieznane (nigdy 0). R znane: obciążenie P + R, objętość (P + R) × n; R nieznane: obciążenie P, objętość P × n. Obie objętości w głównej objętości treningu (wybór B); wynik bez R ma status `plates_only`, nie `exact`. Snapshot zapisuje R (wartość albo null) i jawny status `known` / `unknown`; edycja karty nie zmienia historii; zmiana maszyny — użytkownik aktualizuje R i odpowiada za porównania; bez katalogu egzemplarzy maszyn. Brak R w wykonanym ćwiczeniu → komunikat raportu `SMITH_STARTING_RESISTANCE_MISSING`. Nie łączyć z `barbell_total`; bez automatycznej konwersji; bez e1RM w S2 | zatwierdzona |
| B02/S2 | Silnik: `LOAD_MODELS.smith_plates_only` (`kg: "plates"`), `effectiveLoadKg`, `platesKg`, `loadBasis`, `topPlatesKg`, status `plates_only`, `combineVolumeStatuses`, `sessionTotals.notices`; ustawienie R: `src/engine/exercise-settings.js` (parser, walidacja, magazyn w pamięci — trwały adapter TODO S6); snapshot v3 (`startingResistanceKg`, `startingResistanceStatus`, reguły `ws_starting_resistance`, `ws_snapshot_version_fields`; wersja 2 czytelna bez migracji); szkic SQL wygenerowany ponownie; kontrakt serii nr1 (`loadKg` = P). Szczegóły: `docs/atlas/B02-D21-SMITH-S2.md` | wdrożona (S2); UI karty i raportu — S6 |
| B02/S3 | **Model maszyny w planie (B02-D21).** Pozycja planu nr1 ma pole `loadModel` (wybór osoby albo `null`); nie zmienia `exerciseId` ani `entryRev`. Dopuszczalność wyłącznie przez istniejące `loadModelOptions` / `validateLoadModelChoice` (`src/nr1/contracts/plan-load-model.js`, bez drugiego walidatora). Ćwiczenie z wyborem: model obowiązkowy przy dodaniu i edycji (`LOAD_MODEL_MISSING` / `LOAD_MODEL_NOT_ALLOWED`); ćwiczenie z jednym modelem i ćwiczenie prywatne: `null`, model z atlasu / własny, obcy model odrzucany. `null` w zapisanej lub importowanej pozycji ćwiczenia z wyborem = stan do rozstrzygnięcia: trening nie startuje (`LOAD_MODEL_MISSING`), bez cichego `machine_stack`. Budowa treningu z planu (`src/nr1/domain/workout-from-plan.js`): wszystkie pozycje sprawdzane przed utworzeniem treningu, snapshot v3 przez `buildLoadSnapshot` (model z planu, R Smitha z ustawień karty), `planItemId` i supersety zachowane; edycja planu lub atlasu nie zmienia zbudowanych treningów. Szkic SY: kolumna `plan_items.load_model` (znany model atlasu albo `null`) | wdrożona (S3) w domenie nr1; UI wyboru, karty i ekranu treningu — S6 |

Kolejność dalszych etapów B02: S2 (`smith_plates_only`) → S3 (model maszyny w pozycji planu) → S4 → S5
(import 40 rekordów B02 po zatwierdzeniu) → S6 (UI). Notatka `docs/atlas/B02-D21-SMITH-S2.md` dotyczy
wcześniejszego wariantu zapisu Smitha; zaktualizowana w S2 (B02-D25 A) z zachowaniem śladu zastąpienia.

## 2. Decyzje otwarte

| # | Decyzja | Rodzaj | Blokuje | Uwagi |
| --- | --- | --- | --- | --- |
| O-01 | STORE FIRST D1: konto Google Play — osobiste (test 12 testerów przez 14 dni) czy organizacji (D-U-N-S) | biznes / koszt | F7, harmonogram testu zamkniętego | |
| O-02 | STORE FIRST D2: ceny i produkty PRO | biznes | F5 | ceny w UI starej wersji nie są decyzją 1.0 |
| O-03 | STORE FIRST D3: reklamy (AdMob + zgoda UMP) czy brak reklam | biznes | F5, Data safety | |
| O-04 | STORE FIRST D4: czy PRO wymaga konta | biznes | F3, F5 | w MASTER PLAN v1 opisane jako rekomendacja; brak potwierdzenia |
| O-05 | STORE FIRST D6: plan Supabase dla produkcji 1.0 | koszt | F6, kopie bazy (SPEC 4A.10 §7 pkt 5) | |
| O-06 | STORE FIRST D7: domena | koszt | e-mail z domeny (OTP), strona WWW, polityka prywatności; wpływa na O-11 | |
| O-07 | STORE FIRST D8: plan Vercel | koszt | F6 | |
| O-08 | STORE FIRST D9: termin i sposób wyłączenia starej wersji | biznes | D.3 MASTER PLAN | dotyczy `LEGACY_PRODUCTION_RISKS.md` |
| O-09 | STORE FIRST D10: panel administratora w aplikacji Android | produkt | F3 | |
| ~~O-10~~ | STORE FIRST D11: magazyn lokalny | — | — | **przyjęte 11.10** (sekcja 1a) |
| O-11 | Ostateczny identyfikator pakietu (kandydat `app.nextrep`) | stała na zawsze | Firebase, RevenueCat, Play Console, F7.0 | sekcja 4 |
| O-12 | Nazwa w sklepie i znak „NextRep” wobec istniejących aplikacji o tej nazwie | biznes / prawo | karta sklepu, marketing | sekcja 4, pkt 4 |
| O-13 | Backend testowy dla F3 i toru wewnętrznego bez `nextrep-dev`: lokalny Supabase (CLI / Docker w CI, bez kosztu), wolne miejsce po usunięciu `nextrep-f5-test` (wymaga zgody) albo projekt płatny (wymaga zgody kosztowej) | koszt / technika | F3 (testy E2E na prawdziwym backendzie), D.1 | F2.4 może iść lokalnie (PGlite) bez tej decyzji |
| O-14 | Projekt Firebase dla Crashlytics (plan bezpłatny, ale to nowy zasób) i test zgodności na buildzie | zasób | F6 | sekcja 3 |
| O-15 | Monitoring błędów wersji web (Crashlytics nie obejmuje przeglądarki): brak / własny zapis błędów w Supabase / Sentry tylko dla web | technika / prywatność | F6 | MASTER PLAN §2.11 |
| O-16 | Analityka produktowa: narzędzie i zakres zgód | prywatność | F6, Data safety | |
| O-17 | 4A.10: kierunki przyjęte 11.10 (sekcja 1a); otwarte: szczegółowa specyfikacja kosza (P1) i retencji kopii (P4), lista typów „Zachowaj obie” | produkt | F3 | `SPEC_4A10_MOJE_DANE.md` §9 |
| ~~O-18~~ | Logowanie offline | — | — | **przyjęte 11.10** (sekcja 1a) |
| O-19 | Próg użytkowników do startu PRO+ | biznes | sekcja E | z danych po publikacji (F-9) |
| O-20 | Reporting Engine: RE-1–RE-6 (eksport raportu, raport tygodniowy, realizacja planu na poziomie planu, wykresy FREE, „Progres %”, etykiety statusów) | produkt | PE-F, PE-G | `REPORTING_ENGINE_MAP.md` §5 |
| ~~O-21~~ | Design: akceptacja propozycji poprawek 1–6 | — | — | **zastąpione przez K01-2** (sekcja 1c) |
| O-22 | Pokrycie scenariuszy: akceptacja nowych testów T-20–T-32, nowego brzmienia S20 i sposobu obsługi duplikatu S3 = T-10 | testy | F3 | `COVERAGE_S_T.md` |
| O-23 | Zakres synchronizacji w 1.0: poprawiona obecna synchronizacja (przecinek, `position`) czy pełny schemat v2 STORE FIRST w `src/app/` | technika / termin | faza 4 (SY) | MASTER PLAN v3 §K.3 |
| O-24 | Nowy projekt Supabase dla 1.0 (koszt; łączy się z O-05 i O-13) | koszt | faza 4 (SY) | czysty start bez dotykania produkcji i `nextrep-f5-test` |
| O-25 | Zakres Progress Engine w 1.0 (które z PE-B–PE-H) i termin bramki A5 | produkt | faza 2–3 | |
| ~~O-26~~ | Identyfikator i środowisko buildów testowych etapów AT | — | — | **rozstrzygnięte 13.10** (sekcja 1d) |
| O-27 | Magazyn w `src/app/`: zakres O-10 (IndexedDB) w istniejącej aplikacji i termin | technika | faza 4 | ponowna ocena C01-6 |
| ~~O-28~~ | Równoległość synchronizacji i designu | — | — | **rozstrzygnięte 13.10** (sekcja 1c) |
| O-29 | Minimalny zakres atlasu i gotowych planów na publikację 1.0 (liczba ćwiczeń, które plany) | produkt | AT3.8, test zamknięty | tempo partii jest ścieżką krytyczną; AT3-D4 |
| ~~O-30~~ | Cardio a mięśnie (M1) | — | — | **rozstrzygnięte 17.10** (sekcja 1e) |
| ~~O-31~~ | Pola cardio poza czasem i dystansem | — | — | **rozstrzygnięte 17.10** (sekcja 1e) |
| ~~O-32~~ | Suma dystansu różnych aktywności | — | — | **rozstrzygnięte 17.10** (sekcja 1e) |
| ~~O-33~~ | Podpartie w „Cardio i kondycja” | — | — | **rozstrzygnięte 17.10** (sekcja 1e) |
| O-34 | Niespójność rejestru: handoff B02-D21 przywołuje decyzję **AT3-D20** („obowiązkowe pełne karty ćwiczeń”, w tym karta maszyny Smitha), której nie ma w rejestrze (ostatnia: AT3-D19). Potrzebna treść decyzji od właściciela, aby wpisać ją bez zgadywania | dokumentacja | karta Smitha (D-3), AT3.6b | rejestr nie został uzupełniony samodzielnie |
| O-35 | Porównania Smitha w PE-B / PE-E: zatwierdzony klucz `exerciseId + loadModel + entryRev` jest wspólny dla sesji z R i bez R; porównanie P + R z samym P dałoby sztuczny progres. Warianty: porównywać same P (`topPlatesKg`), rozdzielać według `loadBasis`, albo oba | produkt | PE-B, PE-E (Smith) | dane S2 przechowują P i R osobno; reguły nie zgadnięto |
| O-36 | Algorytm e1RM dla Smitha (P + R, same P czy brak e1RM) | produkt | PE (e1RM) dla Smitha | poza S2 (B02-D25 A) |

## 3. F-4: zgodność Crashlytics ze stosem Capacitor (stan weryfikacji)

| Sprawdzenie | Wynik | Źródło |
| --- | --- | --- |
| Wtyczka | `@capacitor-firebase/crashlytics` 8.5.2 (Capawesome, wtyczka nieoficjalna, aktywnie wspierana) | rejestr npm, 11.10.2026 |
| Wymagana wersja Capacitor | `@capacitor/core >= 8.0.0`; linia 8.x = „Active support” | rejestr npm, README wtyczki |
| Nasz stos | `@capacitor/core` 8.5.3, `@capacitor/android` 8.5.3 | `package.json` |
| Zgodność deklarowana | **tak** | — |
| Zgodność potwierdzona buildem | **nie** — wymaga projektu Firebase i pliku `google-services.json` (O-14) | — |
| Zakres | tylko Android i iOS; wszystkie metody „Only available for Android and iOS” | README wtyczki |
| Awarie natywne | automatycznie | README |
| Błędy JavaScript w WebView | **nie automatycznie**: potrzebne globalne `window.onerror` i `unhandledrejection` → `recordException` ze stosem ze `stacktrace.js`; dziś aplikacja nie ma globalnej obsługi błędów | README, `grep` w `src/` |
| Czytelność stosów JS | bundel jest minifikowany bez map źródeł (`tools/build-web.mjs`: `minify: true`, `sourcemap: false`); stosy JS w Crashlytics będą trudne do odczytania bez osobnego rozwiązania | kod |
| Prywatność | `setEnabled` pozwala sterować zbieraniem; Data safety: dane o awariach i identyfikator instalacji | README |

Warunek przyjęcia F-4: spike na osobnej gałęzi (po Twojej zgodzie i po O-14) — build APK z wtyczką,
awaria testowa i błąd JS widoczne w konsoli Firebase, bez danych treningowych i osobowych.

## 4. F-8: weryfikacja identyfikatora `app.nextrep`

| # | Sprawdzenie | Wynik |
| --- | --- | --- |
| 1 | Format nazwy pakietu Androida (segmenty od litery, małe litery, bez słów zastrzeżonych Javy) | ✅ poprawny |
| 2 | Czy identyfikator jest wolny w Google Play | ⚠ nie sprawdzono: strona `play.google.com/store/apps/details?id=app.nextrep` jest niedostępna z tego środowiska. Ostatecznie potwierdza to dopiero utworzenie aplikacji w Play Console (O-01) |
| 3 | Zgodność z domeną (konwencja: odwrócona domena, którą posiadasz — `app.nextrep` ↔ `nextrep.app`) | ⚠ nie sprawdzono (zapytanie RDAP zablokowane w tym środowisku); domena to decyzja O-06. Jeśli wybierzesz inną domenę (np. `nextrep.pl`), spójniejszy będzie `pl.nextrep` |
| 4 | Inne aplikacje o nazwie „NextRep” | ⚠ istnieją: w Google Play m.in. „NextRep” (`com.thomassalisbury265.nextrep`) i „NextRep: AI Workout Planner” (`com.appstackx.fitness.nextrep`); w App Store m.in. „NextRep”, „NextRep Pro”, „NextRep AI”, „NextRep Challenge”. Nie blokuje to identyfikatora pakietu, ale dotyczy nazwy w sklepie i marki (O-12) |
| 5 | Zależności | identyfikator wiąże Firebase (Crashlytics), RevenueCat, Play Console i podpis; zmiana po pierwszym wydaniu = nowa aplikacja |
| 6 | Wpływ na dane | zmiana z `app.nextrep.spike` to nowa instalacja z pustymi danymi — zgodne z czystym startem 1.0 |

Wniosek: `app.nextrep` jest poprawnym kandydatem. Przed zatwierdzeniem potrzebne: decyzja o domenie
(O-06), sprawdzenie dostępności w Play Console (O-01) i decyzja o nazwie w sklepie (O-12).

## 5. Wcześniejsze decyzje 1.0 (indeks)

| Obszar | Decyzje | Gdzie zapisane |
| --- | --- | --- |
| STORE FIRST | strategia: Android najpierw, czysty start danych, bez migracji starych danych | dokument projektu „NEXTREP 1.0 STORE FIRST” (10.10) |
| S1 | Capacitor 8, APK debug z CI | MASTER PLAN §2.1 |
| F1 | modularizacja bez zmiany zachowania (8/8) | dokument „F1: raport końcowy i plan PE-A” |
| Progress Engine | D1–D14 (10.10), PE-01–PE-32 jako kryteria odbioru | „Progress Engine 2.0: audyt i specyfikacja” |
| PE-A | P1–P4 (w tym uniwersalny silnik bez ręcznego przeglądu 68 ćwiczeń); A4.5 z pełną równoważnością; kolejność A4.5 → F2 → A5 | dokumenty F1 / A4.5 |
| F2 | F2-1 (zastąpione), F2-2 (bez projektu i kosztów), F2-3 (A5 na końcu F3 z osobną bramką), F2-4 (snapshot obowiązkowy, brak = usterka z ostrzeżeniem), F2-5 (jawna korekta z historią) | „F2: projekt struktury atlasu” v2 |
| K01 | powrót do `src/app/`, Claude Design, integracja etapami, kolejność priorytetów; O-28 (praca równoległa) | sekcja 1c |
| AT3 | atlas jedynym źródłem ćwiczeń, AT3-D1–AT3-D15, R-AT3-1, O-26 | sekcja 1d, `NEXTREP_ATLAS_PRODUCT_SPEC_1_0.md` |
| Atlas | treść wyłącznie z zatwierdzonych partii „Standaryzacji ćwiczeń NextRep”; K2 (pola techniczne proponuję per partia), K3 (warianty z własnym id), K4 (wiele mięśni głównych z różnych grup); walidator v2 pkt 1–5 | `docs/atlas/README.md`, dokument F2 |
