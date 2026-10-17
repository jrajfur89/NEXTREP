# NEXTREP 1.0 — rejestr decyzji

Wersja 6 · 17.10.2026 · gałąź `release/1.0`

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
| AT3-D1 | Partie nawigacyjne oddzielone od 10 grup statystycznych i od klasyfikacji anatomicznej; zdefiniowane jako zbiory kodów mięśni ze słownika atlasu w osobnym pliku `src/atlas/navigation.json` z walidatorem, bez zmiany schematu atlasu. Filtry wielokryterialne: partie, sprzęt, rodzaj obciążenia, chwyt, pozycja, kąt ławki, jednostronność, rodzina | **zatwierdzona kierunkowo**; lista partii, mapowanie kodów mięśni, przynależność ćwiczenia do partii (tylko mięśnie główne czy także pomocnicze) i grupowanie rodzajów obciążenia wymagają szczegółowego uzgodnienia w Standaryzacji (AT3-D10) przed częścią nawigacyjną AT3.2 i przed AT3.6a |
| AT3-D2 | Jeden słownik nazw 10 grup statystycznych: Klatka piersiowa, Plecy, Barki, Biceps, Triceps, Przedramiona, Brzuch, Czworogłowe uda, Dwugłowe uda / pośladki, Łydki; nazwy użyte w katalogu AT2 („Uda — przód”, „Uda — tył i pośladki”) poprawiane w AT3.2 | obowiązuje (zgodna z wcześniejszą decyzją o 10 grupach) |
| AT3-D3 | Czysty start S1: nowa przestrzeń danych, stare dane testowe nietknięte i niewidoczne, bez migracji i bez mapowania identyfikatorów | obowiązuje (STORE FIRST, K01) |
| AT3-D4 | Gotowe plany wyłącznie na nowym atlasie (`plan-templates.json`, C01-5). Do czasu szablonów sekcja gotowych planów z informacją, że pojawią się wraz z atlasem; treść szablonów przygotowuje właściciel (z ChatGPT), gdy atlas obejmie potrzebne ćwiczenia (O-29) | zatwierdzona |
| AT3-D5 | Chmura w S1 (logowanie i synchronizacja) wyłączona od AT3.3 do etapu SY; `nextrep-f5-test` bez zmian | zatwierdzona |
| AT3-D6 | Ćwiczenia prywatne: model techniczny w AT3.5 (UUID, pola modelu atlasu, mięśnie ze słownika atlasu, „nie wiem” → `external_unknown`, snapshot `source: private`); docelowy formularz w AT3.6d (tryb podstawowy i zaawansowany, sugestie istniejących ćwiczeń). Pola trybu podstawowego ustala projekt AT3.1 w granicach tego modelu | zatwierdzona |
| AT3-D7 | Testy: od AT3.4 nowy przebieg E2E na atlasie; test wizualny porównuje z zaakceptowanym stanem poprzedniego etapu zamiast z aplikacją `a2b9ca0` | zatwierdzona |
| AT3-D8 | Ochrona historii i kolizji `hanging_knee_raise` (ryzyko R-AT3-1, niżej): separacja przestrzeni (AT3-D3); grupy i model w nowej przestrzeni ze snapshotu, a przy jego braku z atlasu — nigdy ze starych map kluczowanych starymi id; brak snapshotu = usterka z ostrzeżeniem (F2-4), bez uzupełniania z bieżącego atlasu; test listy wspólnych id z AT2. Obowiązuje od pierwszego zapisu w nowej przestrzeni (AT3.4) | obowiązuje |
| AT3-D9 | UI przejściowe z obecnych komponentów w AT3.4–AT3.5; docelowy wygląd w AT3.6a–d po projekcie | zatwierdzona |
| AT3-D10 | Listę partii nawigacyjnych (AT3-D1) potwierdza czat „Standaryzacja ćwiczeń NextRep”; schemat atlasu bez zmian | zatwierdzona |
| AT3-D11 | „Podobne ćwiczenia — sugestie oparte na danych, bez deklarowania zamienności”: wyliczane z danych atlasu, bez wpływu na progresję; zasady F2 V8 (brak pól równoważności) i K3 (rodzina ≠ zamiennik) bez zmian | zatwierdzona |
| AT3-D12 | Instrukcja wykonania i typowe błędy jako nowe pola atlasu dopiero po przygotowaniu treści w Standaryzacji i osobnej zgodzie na zmianę schematu F2; do tego czasu sekcje karty ukryte | zatwierdzona (zmiana schematu nadal wymaga osobnej zgody) |
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
