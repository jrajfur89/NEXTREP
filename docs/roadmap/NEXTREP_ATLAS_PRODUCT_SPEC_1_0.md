# NEXTREP 1.0 — specyfikacja produktowa atlasu ćwiczeń

Wersja 1 · 17.10.2026 · gałąź `release/1.0` · status: **zatwierdzona** (etap AT3.0)

Źródła: koncepcja atlasu zaakceptowana przez właściciela produktu 17.10.2026 (opracowana z ChatGPT), audyt
AT3 (14.10.2026), raport uzgodnieniowy AT3 (17.10.2026), decyzje AT3-D1–AT3-D15 (`DECISIONS_1_0.md` §1d),
F2.3, AT1 (`368bf2d`), AT2 (`fbc0cdb`). Harmonogram: `NEXTREP_1_0_MASTER_PLAN.md` §K.3–K.4.

Kierunek produktowy nie oznacza, że wszystkie funkcje wchodzą w AT3. Każda funkcja ma niżej przypisany
etap albo zależność. Zasada zakresu (K01-4) obowiązuje: etap nie zmienia zakresu bez nazwanej decyzji.

## 1. Zasady

1. **Jeden katalog.** NEXTREP 1.0 ma jedną bazę ok. 390 ćwiczeń opartą wyłącznie na atlasie F2.3
   (`src/atlas/atlas.json`), budowaną zatwierdzonymi partiami „Standaryzacji ćwiczeń NextRep”. Dziś:
   wydanie 1, 15 ćwiczeń (Batch 01). Stary katalog 68 ćwiczeń, jego kategorie i obecny interfejs wyboru nie
   są elementami produktu 1.0 i zostają wycofane z S1 (AT3.3–AT3.4).
2. **Treść atlasu tylko ze Standaryzacji.** Claude waliduje i wdraża zatwierdzone partie; nie decyduje o
   nazwach, wariantach ani klasyfikacji.
3. **Schemat atlasu nie zmienia się dla potrzeb interfejsu.** Dane, których atlas nie ma, są zależnością
   albo osobną decyzją (sekcja 5). Format F2.3, `issuedIds` i stałe identyfikatory obowiązują bez zmian.
4. **Trzy warstwy klasyfikacji**, oddzielne i wyprowadzane z danych (sekcja 3).
5. **Jeden resolver** ćwiczenia po identyfikatorze: `exerciseId` z atlasu (aktywne i zarchiwizowane) albo
   UUID ćwiczenia prywatnego. Ekrany nie czytają pliku atlasu bezpośrednio.
6. **Historia liczy się ze snapshotu** modelu obciążenia zapisanego w treningu (D13 Progress Engine, F2-4);
   późniejsze wydanie atlasu nie zmienia historii.
7. **Progresja per dokładny `exerciseId`.** Każdy wariant ma własną progresję; rodzina nie łączy progresji
   (K3: rodzina ≠ zamiennik).
8. **Czysty start S1 bez mieszania historii** (AT3-D3, AT3-D8); bez migracji i bez mapowania starych
   identyfikatorów.
9. **Ochrona środowisk:** bez zmian `main`, produkcyjnego Vercel i Supabase oraz `nextrep-f5-test`; push
   tylko na `release/1.0`.

## 2. Wymagania produktowe

Kolumna „Projekt” = wymaga zaakceptowanego projektu w Claude Design (AT3.1) przed implementacją UI.

| ID | Wymaganie | Etap | Źródło danych | Projekt | Stan danych |
| --- | --- | --- | --- | --- | --- |
| WP-01 | Jeden katalog ok. 390 ćwiczeń budowany partiami | AT1 ✅, kolejne wydania | `atlas.json` | — | 15 / ok. 390 |
| WP-02 | Atlas jedynym aktywnym źródłem w S1; stary katalog wycofany | AT3.3, AT3.4 | resolver | — | jest |
| WP-03 | Podział partii (nawigacja) oddzielony od grup statystycznych | AT3.2 (mapa), AT3.6a (UI) | mięśnie + `navigation.json` | tak | lista partii: AT3-D1 (kierunkowo) |
| WP-04 | Wyszukiwanie po nazwach i aliasach, także bez polskich znaków | AT3.2 (indeks), AT3.6a (UI) | `namePl`, `aliasesPl` | tak | jest |
| WP-05 | Filtry: partie, sprzęt, rodzaj obciążenia, chwyt, pozycja, kąt ławki, jednostronność, rodzina | AT3.2 (fasety), AT3.6a (UI) | sekcja 4 | tak | jest (wartości rosną z partiami) |
| WP-06 | Filtry: ulubione, ostatnio używane, moje ćwiczenia | AT3.6a | dane użytkownika | tak | ulubione: nowe dane (AT3-D14); ostatnio: z historii od AT3.4; moje: od AT3.5 |
| WP-07 | Kafelek: nazwa, mięśnie główne, sprzęt, oznaczenia wariantu | AT3.6a | sekcja 4 | tak | jest |
| WP-08 | Karta szczegółów: sekcje z danymi atlasu, warianty z rodziny, historia i progres | AT3.6b (+ AT3.7 progres) | sekcja 4 | tak | jest |
| WP-09 | Karta: instrukcja i typowe błędy | po AT3-D12 | nowe pola atlasu | tak (miejsce w karcie) | brak |
| WP-10 | Karta: „Podobne ćwiczenia — sugestie oparte na danych, bez deklarowania zamienności” | AT3.6b lub później | wyliczane z danych atlasu (AT3-D11); F2 V8 i K3 bez zmian | tak | jest (wyliczane) |
| WP-11 | Karta: multimedia | wideo: z partiami; zdjęcia: etap zasobów (AT3-D13) | `videoUrl`; zdjęcia — brak | tak | `videoUrl` puste; zdjęcia brak |
| WP-12 | Jeden mechanizm wyboru ćwiczeń dla katalogu, planów i treningu | AT3.6c | resolver, indeks | tak | jest |
| WP-13 | Ćwiczenie prywatne: model techniczny | AT3.5 | model atlasu (`scope: private`) | — | jest w silniku (snapshot prywatny) |
| WP-14 | Formularz prywatnego ćwiczenia: tryb podstawowy i zaawansowany | AT3.6d | model z WP-13 | tak | jest |
| WP-15 | Sugerowanie istniejących ćwiczeń przy tworzeniu prywatnego | AT3.6d | indeks wyszukiwania | tak | jest |
| WP-16 | Obowiązkowy snapshot w treningu | AT3.4 (zapis), AT3.7 (użycie) | `load-snapshot.js` | — | jest |
| WP-17 | Oddzielna progresja każdego wariantu | AT3.7 | `exerciseId` + snapshot | — | jest |
| WP-18 | Statystyki partii z pracą główną i pomocniczą | AT3.7 (dane), ekrany z PE-C / A5 | `muscle-work.js`, snapshot | tak (ekrany statystyk) | jest |
| WP-19 | Gotowe plany wyłącznie na nowym atlasie | AT3.8 | `plan-templates.json` (C01-5) | stan pusty: tak | treść szablonów: AT3-D4, O-29 |

## 3. Trzy warstwy klasyfikacji

| Warstwa | Do czego | Źródło | Zmienna? |
| --- | --- | --- | --- |
| Anatomiczna | szczegóły ćwiczenia, ćwiczenia prywatne, snapshot | `primaryMuscles`, `secondaryMuscles` + słownik `dictionaries.muscles` | tylko przez partie Standaryzacji |
| Nawigacyjna (partie UI) | kafle, filtr partii, chipy zawężenia | `src/atlas/navigation.json`: partie jako zbiory kodów mięśni, z walidatorem (każdy kod istnieje w słowniku, każdy aktywny mięsień ma partię); bez zmiany schematu atlasu | tak, bez wpływu na dane i statystyki |
| Statystyczna (10 grup) | statystyki, raporty, Progress Engine | `dictionaries.muscles[].statsGroup` → `STATS_GROUPS`; zapisane w snapshocie | nie (AT3-D2) |

Dziesięć grup statystycznych i ich nazwy (AT3-D2): Klatka piersiowa, Plecy, Barki, Biceps, Triceps,
Przedramiona, Brzuch, Czworogłowe uda, Dwugłowe uda / pośladki, Łydki. Jeden słownik nazw dla całej
aplikacji; nazwy dwóch grup użyte w katalogu AT2 („Uda — przód”, „Uda — tył i pośladki”) są błędem do
poprawy w AT3.2.

Praca grup (decyzja F2 v2 pkt 1, `muscle-work.js`): każda grupa główna dostaje pełną pracę, każda
pomocnicza — osobną pracę pomocniczą; bez sumowania między grupami.

Partie nawigacyjne są zdefiniowane na mięśniach, a nie na grupach statystycznych, aby mogły być
drobniejsze (np. pośladki osobno od dwugłowych ud, które w statystykach są jedną grupą). Lista partii,
przypisanie kodów mięśni, przynależność ćwiczenia do partii (tylko mięśnie główne czy także pomocnicze)
i grupowanie rodzajów obciążenia w filtrze są do uzgodnienia w Standaryzacji (AT3-D1, AT3-D10).

## 4. Źródła danych: filtry, kafelek, karta

Status: **jest** = pole istnieje w schemacie F2 i jest wypełnione w Batch 01; **puste** = pole istnieje,
brak treści; **brak** = potrzebne nowe dane (sekcja 5).

### 4.1 Wyszukiwanie i filtry

| Funkcja | Źródło | Status |
| --- | --- | --- |
| Wyszukiwanie | `namePl`, `aliasesPl`; normalizacja bez polskich znaków i wielkości liter w indeksie | jest |
| Partie | mięśnie (`primaryMuscles`, ewentualnie `secondaryMuscles`) → `navigation.json` | mięśnie: jest; lista partii: AT3-D1 |
| Grupa statystyczna (chipy) | `dictionaries.muscles[].statsGroup` | jest |
| Sprzęt | `equipment` + `dictionaries.equipment` (`labelPl`, `role`: load / support / assist) | jest |
| Rodzaj obciążenia | `loadModel` (+ `measurementType`), pogrupowane w UI | jest; grupowanie: AT3-D1 |
| Chwyt | `variantAttributes` o wymiarze `grip` | jest |
| Pozycja | `variantAttributes` o wymiarze `position` | jest |
| Kąt ławki | `variantAttributes` o wymiarze `angle` | jest |
| Jednostronność | `laterality` (+ `repsCounting`) | jest |
| Rodzina | `familyId` + `families[].namePl` | jest |
| Moje ćwiczenia | ćwiczenia prywatne | od AT3.5 |
| Ostatnio używane | historia treningów użytkownika (data, `exerciseId`) | dane użytkownika, od AT3.4 |
| Ulubione | lista `exerciseId` użytkownika | brak (nowe dane użytkownika, AT3-D14) |

Łączenie: różne wymiary przez „i”, wartości w jednym wymiarze przez „lub”. Filtr pokazuje tylko wartości
występujące w bieżącym wydaniu (w Batch 01 np. jeden kąt `angle.flat` i jeden chwyt `grip.pronated`).

### 4.2 Kafelek ćwiczenia

| Element | Źródło | Status |
| --- | --- | --- |
| Nazwa | `namePl` | jest |
| Mięśnie główne | `primaryMuscles` + `dictionaries.muscles[].labelPl` | jest |
| Sprzęt | `equipment` (rola `load` / `assist` na początku) | jest |
| Oznaczenia wariantu | `variantAttributes[].labelPl` | jest |

### 4.3 Karta szczegółów

| Sekcja | Źródło | Status |
| --- | --- | --- |
| Nazwa, aliasy, rodzina | `namePl`, `aliasesPl`, `familyId` | jest |
| Sprzęt, mięśnie główne i pomocnicze | `equipment`, `primaryMuscles`, `secondaryMuscles` | jest |
| Sposób zapisu | `measurementType`, `loadModel`, `implements`, `laterality`, `repsCounting` | jest |
| Wskazówki | `tipsPl` | jest |
| Instrukcja wykonania | — | brak (AT3-D12) |
| Typowe błędy | — | brak (AT3-D12) |
| Warianty | inne ćwiczenia tej samej `familyId`, opisane jako warianty | jest |
| Podobne ćwiczenia | sugestie oparte na danych, bez deklarowania zamienności (AT3-D11) | jest |
| Ćwiczenie zarchiwizowane | `status`, `archivedReason`, `successorHint` | jest (w Batch 01 brak archiwalnych) |
| Wideo | `videoUrl` | puste |
| Zdjęcie | — | brak (AT3-D13) |
| Historia i progres | historia użytkownika po `exerciseId`, model ze snapshotu | dane użytkownika (AT3.4, AT3.7) |

Sekcje bez danych są ukryte i pojawiają się z kolejnymi wydaniami atlasu bez zmiany ekranów, jeśli projekt
je przewidzi.

## 5. Dane brakujące i decyzje

| # | Funkcja | Czego brakuje | Ustalenie |
| --- | --- | --- | --- |
| N1 | Partie nawigacyjne | lista partii i mapowanie kodów mięśni | `navigation.json` z walidatorem; treść ze Standaryzacji (AT3-D1, AT3-D10) |
| N2 | Instrukcja i typowe błędy | pola schematu i treść partii | nowe pola atlasu dopiero po przygotowaniu treści i osobnej zgodzie na zmianę schematu F2 (AT3-D12) |
| N3 | Podobne ćwiczenia | V8 zabrania pól równoważności, K3: rodzina ≠ zamiennik | „Podobne ćwiczenia — sugestie oparte na danych, bez deklarowania zamienności”; wyliczane z danych atlasu, bez wpływu na progresję; F2 V8 i K3 bez zmian (AT3-D11) |
| N4 | Zdjęcia | brak w schemacie | na rodzinę albo partię, osobny etap zasobów wg `DESIGN.md` §16 (AT3-D13) |
| N5 | Ulubione | dane użytkownika | lokalnie w AT3.6a, synchronizacja w SY (AT3-D14) |
| N6 | Ostatnio używane | nic (z historii) | AT3.6a |
| N7 | Sugestie przy tworzeniu prywatnego | nic (indeks wyszukiwania) | AT3.6d |
| N8 | Historia i progres na karcie | snapshot | od AT3.4, pełny progres w AT3.7 |
| N9 | Wartości filtrów wariantów przy 390 ćwiczeniach | kompletne `variantAttributes` w partiach | jakość zależy od partii; walidator V3/V4 pilnuje spójności |

## 6. Snapshot i ochrona historii

**Obowiązkowy snapshot od AT3.4.** AT3.4 jest pierwszym etapem, w którym S1 zapisuje treningi na
ćwiczeniach atlasu, dlatego od tego etapu:
- snapshot (`buildLoadSnapshot`) powstaje przy dodaniu ćwiczenia do treningu, z planu lub ręcznie, i jest
  zapisywany przy wpisie historii;
- wpis historii bez snapshotu jest usterką z ostrzeżeniem (F2-4): trening zostaje zapisany, ale taki wpis
  nie jest liczony do objętości ani grup i nigdy nie jest uzupełniany po cichu z bieżącego atlasu (D13);
  scenariusze testowe AT3.4 wymagają zera takich wpisów;
- obecne ekrany statystyk dostają grupy główne ze snapshotu; obecne wzory objętości zostają do bramki A5.

**AT3.7 wykorzystuje snapshot:** statystyki partii (praca główna i pomocnicza, `muscle-work.js`), progresja
z modelu snapshotu, bramka A5 (zmiana wzorów objętości na ekranach — osobna akceptacja).

**Ryzyko R-AT3-1: kolizja `hanging_knee_raise`.** Identyfikator istnieje w starym katalogu 68 ćwiczeń, w
starych mapach silnika (`ATLAS_MUSCLE_GROUPS`: Brzuch + Dwugłowe uda / pośladki; `load-legacy-map.js`: masa
ciała) i w atlasie (główny: prosty brzucha; pomocnicze: zginacze biodra → Czworogłowe uda, skośne brzucha →
Brzuch). To zbieg identyfikatorów, nie mapowanie. Bez ochrony silnik przypisałby nowemu ćwiczeniu grupy ze
starej mapy, a stara historia mogłaby zostać odczytana jako historia ćwiczenia z atlasu.

**Mechanizm ochrony historii (AT3-D8), obowiązuje od pierwszego zapisu w nowej przestrzeni (AT3.4):**
1. Separacja przestrzeni: nowa przestrzeń S1 nie zawiera starych wpisów (AT3-D3); stare dane zostają
   nietknięte i nieczytane.
2. Grupy i model w nowej przestrzeni zawsze ze snapshotu, a przy jego braku z atlasu przez resolver; stare
   mapy kluczowane starymi identyfikatorami nie są wywoływane.
3. Brak snapshotu = usterka z ostrzeżeniem (F2-4), bez uzupełniania z bieżącego atlasu.
4. Test z AT2 utrzymuje listę wspólnych identyfikatorów starego katalogu i atlasu; nowa kolizja z kolejnej
   partii jest od razu widoczna.
Test odbioru: trening `hanging_knee_raise` w nowej przestrzeni daje grupy z atlasu.

## 7. Etapy

Pełny harmonogram: `NEXTREP_1_0_MASTER_PLAN.md` §K.3–K.4.

| Etap | Rodzaj | Zakres |
| --- | --- | --- |
| AT3.0 | decyzje + dokumentacja | rejestr decyzji AT3, MASTER PLAN, ta specyfikacja |
| AT3.1 | projekt UI (równolegle) | ekrany z sekcji 8 w Claude Design |
| AT3.2 | dane | resolver, indeks, wyszukiwanie, fasety, mapa partii z `navigation.json` + walidator, jeden słownik nazw grup |
| AT3.3 | dane | czysty start S1, wyłączone migracje i import starych kopii, chmura w S1 wyłączona do SY |
| AT3.4 | integracja | atlas jedynym źródłem w planach i treningu, zapis snapshotu, grupy ze snapshotu, wycofanie starego katalogu, UI przejściowe, nowy E2E |
| AT3.5 | model | ćwiczenia prywatne: UUID, pola modelu, resolver, snapshot prywatny, prosty formularz przejściowy |
| AT3.6a | UI | katalog: partie, wyszukiwarka, filtry, kafelek, ostatnio używane, ulubione lokalnie |
| AT3.6b | UI | karta szczegółów |
| AT3.6c | UI | jeden mechanizm wyboru w katalogu, planie i treningu |
| AT3.6d | UI | formularz prywatnego ćwiczenia z sugestiami |
| AT3.7 | silnik | statystyki i progresja ze snapshotu, bramka A5 |
| AT3.8 | treść | gotowe plany na atlasie (`plan-templates.json` + walidator) |

## 8. Zależności od Claude Design (AT3.1)

| Ekran / element | Potrzebny przed |
| --- | --- |
| Ćwiczenia — wejście: kafle partii, wyszukiwarka, filtry, ulubione, ostatnio używane, moje | AT3.6a |
| Lista wyników i kafelek ćwiczenia (nazwa, mięśnie główne, sprzęt, oznaczenia wariantu) | AT3.6a |
| Arkusz filtrów (wiele wymiarów, czyszczenie, liczby wyników) | AT3.6a |
| Karta szczegółów, z miejscem na sekcje zależne od danych (instrukcja, błędy, zdjęcie, wideo) | AT3.6b |
| Wspólny mechanizm wyboru ćwiczenia (katalog, edytor planu, trening) | AT3.6c |
| Formularz prywatnego ćwiczenia: tryb podstawowy i zaawansowany, sugestie | AT3.6d |
| Stany puste: mały atlas, brak gotowych planów, brak wyników, S1 bez chmury | AT3.4 (prosty tekst wystarczy, AT3-D9) |
| Statystyki partii z pracą główną i pomocniczą | AT3.7 / PE-C |

Do czasu projektu AT3.4–AT3.5 używają obecnych komponentów jako UI przejściowego (AT3-D9).

## 9. Kryteria odbioru

Wspólne dla każdego etapu z kodem: wszystkie testy zielone (unit, UI, nr1, E2E); oba workflow CI zielone,
APK S1 zbudowany i sprawdzony na telefonie; diff tylko w zakresie etapu; bez zmian `main`, Vercel,
Supabase i zatwierdzonego `atlas.json`; raport z listą zmienionych plików i testów; push dopiero po
akceptacji właściciela.

| Etap | Kryteria szczegółowe |
| --- | --- |
| AT3.0 | decyzje AT3-D1–AT3-D15 w rejestrze; ryzyko R-AT3-1 i mechanizm ochrony zapisane; MASTER PLAN z harmonogramem AT3.0–AT3.8; ta specyfikacja |
| AT3.1 | każdy ekran zaakceptowany przez właściciela i zapisany w `docs/design/`; projekt nie wymaga danych spoza sekcji 4 albo jawnie oznacza sekcje zależne od N2–N4 |
| AT3.2 | resolver zwraca każde ćwiczenie atlasu (także archiwalne) po id i `null` dla nieznanego; wyszukiwanie znajduje po nazwie, aliasie i bez polskich znaków (np. „przysiad”, „wioslowanie”, „OHP”); fasety poprawne na Batch 01 i na syntetycznym atlasie wielkości 390 (tylko w testach); walidator `navigation.json` odrzuca nieznany mięsień i mięsień bez partii; jeden słownik nazw grup na wszystkich ekranach |
| AT3.3 | stare klucze danych obecne na urządzeniu → nieczytane i nietknięte (test); start z pustą przestrzenią; 0 wywołań Supabase; brak zasiewu starych ćwiczeń; migracje i import starych kopii nieosiągalne; komunikat w S1 o braku chmury do SY |
| AT3.4 | w S1 nie ma żadnego ćwiczenia ze starego katalogu; plan z ćwiczeń atlasu tworzony i uruchamiany; pola serii zgodne z modelem (kontrakt N1); każdy wpis historii w scenariuszach ma poprawny snapshot (0 wpisów bez snapshotu); trening `hanging_knee_raise` daje grupy z atlasu; obecne wzory objętości bez zmian; nowy E2E przechodzi pełny trening na atlasie |
| AT3.5 | ćwiczenie prywatne z UUID nie koliduje z id atlasu; snapshot `source: private` poprawny także dla „nie wiem” (`external_unknown`, objętość „brak”); prywatne w katalogu, planie i treningu |
| AT3.6a | kombinacje filtrów („i” między wymiarami, „lub” w wymiarze) zgodne z indeksem; zgodność z zaakceptowanym projektem (test wizualny) |
| AT3.6b | każda sekcja karty z danymi z atlasu; sekcje bez danych ukryte; warianty tylko z tej samej rodziny, opisane jako warianty; „Podobne ćwiczenia” opisane jako sugestie oparte na danych, bez deklarowania zamienności |
| AT3.6c | jeden komponent wyboru w trzech miejscach; wybór zwraca id atlasu albo UUID; testy wszystkich trzech wejść |
| AT3.6d | tryb podstawowy tworzy kompletne, poprawne ćwiczenie; sugestie pokazują istniejące ćwiczenia przy podobnej nazwie i pozwalają wybrać je zamiast tworzyć duplikat |
| AT3.7 | statystyki partii z grup ze snapshotu, praca główna i pomocnicza osobno, bez sumowania między grupami; scenariusze PE-03–PE-07, PE-18, D5, D13 na danych S1; progresja per `exerciseId`; zmiana wzorów tylko po akceptacji A5 |
| AT3.8 | każdy szablon przechodzi walidator (ćwiczenia istnieją i są aktywne, cele zgodne z modelem, RIR z dozwolonej listy); plan z szablonu uruchomiony na telefonie |

## 10. Zależności zewnętrzne

| Obszar | Zależność |
| --- | --- |
| Standaryzacja (ChatGPT) | kolejne partie atlasu; lista partii nawigacyjnych (AT3-D1, AT3-D10); treść instrukcji i błędów (AT3-D12); treść gotowych planów (AT3-D4, O-29) |
| Claude Design | projekty AT3.1 przed AT3.6a–d |
| SY | chmura w S1 wyłączona od AT3.3 do SY (AT3-D5); SY obejmie ćwiczenia prywatne (UUID), odwołania `catalog_exercise_id`, snapshot w treningu i ulubione |
| Progress Engine | PE-E (najlepszy wynik, przecinek) przed AT3.7; PE-C i A5 w AT3.7; PE-D, PE-F/G/H po AT3.7 (O-25) |
