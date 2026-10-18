# NEXTREP 1.0 — specyfikacja produktowa atlasu ćwiczeń

Wersja 2 · 17.10.2026 · gałąź `release/1.0` · status: **projekt do odbioru** (zamknięcie AT3-D1/D2)

Zmiany w wersji 2: wspólna hierarchia nawigacji i statystyk zamiast trzech warstw (AT3-D16, zastępuje
AT3-D1); zasady agregacji (AT3-D17, zastępuje AT3-D2); snapshot v2 (AT3-D18); pełne cardio w NEXTREP 1.0
(AT3-D19) z kontraktem danych; rozstrzygnięcia O-30–O-33 (17.10.2026) oraz P1–P3 i B2 (18.10.2026);
zależności etapów AT3.2–AT3.7; testy T1–T16 i C1–C15.

Źródła: koncepcja atlasu zaakceptowana przez właściciela produktu 17.10.2026 (opracowana z ChatGPT), audyt
AT3 (14.10.2026), raport uzgodnieniowy AT3 (17.10.2026), audyt „AT3-D1/D2: wspólna hierarchia atlasu i
statystyk” (17.10.2026), decyzje AT3-D3–AT3-D19 (`DECISIONS_1_0.md` §1d–1e), F2.3, AT1 (`368bf2d`), AT2
(`fbc0cdb`). Harmonogram: `NEXTREP_1_0_MASTER_PLAN.md` §K.3–K.4.

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
4. **Dwie warstwy klasyfikacji** (sekcja 3): anatomiczna (mięśnie z atlasu) i jedna wspólna hierarchia
   dla nawigacji i statystyk (`src/atlas/navigation.json`). Dotychczasowe 10 grup statystycznych nie jest
   podziałem produktu (AT3-D16); pole `statsGroup` zostaje tymczasowo w schemacie atlasu.
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
| WP-03 | Jedna hierarchia kategorii i podpartii dla nawigacji i statystyk | AT3.2 (hierarchia, agregacja), AT3.6a (UI) | `primaryMuscles` + `navigation.json` | tak | 19 kodów zmapowanych (sekcja 3); Łydki puste do nowych kodów |
| WP-04 | Wyszukiwanie po nazwach i aliasach, także bez polskich znaków | AT3.2 (indeks), AT3.6a (UI) | `namePl`, `aliasesPl` | tak | jest |
| WP-05 | Filtry: partie, sprzęt, rodzaj obciążenia, chwyt, pozycja, kąt ławki, jednostronność, rodzina | AT3.2 (fasety), AT3.6a (UI) | sekcja 4 | tak | jest (wartości rosną z partiami) |
| WP-06 | Filtry: ulubione, ostatnio używane, moje ćwiczenia | AT3.6a | dane użytkownika | tak | ulubione: nowe dane (AT3-D14); ostatnio: z historii od AT3.4; moje: od AT3.5 |
| WP-07 | Kafelek: nazwa, mięśnie główne, sprzęt, oznaczenia wariantu | AT3.6a | sekcja 4 | tak | jest |
| WP-08 | Karta szczegółów: sekcje z danymi atlasu, warianty z rodziny, historia i progres | AT3.6b (+ AT3.7 progres) | sekcja 4 | tak | jest |
| WP-09 | Karta: instrukcja i typowe błędy | po AT3-D12 | nowe pola atlasu | tak (miejsce w karcie) | brak |
| WP-10 | Karta: „Podobne ćwiczenia — sugestie oparte na danych, bez deklarowania zamienności” | AT3.6b lub później | wyliczane z danych atlasu (AT3-D11); F2 V8 i K3 bez zmian | tak | jest (wyliczane) |
| WP-11 | Karta: multimedia | wideo: z partiami; zdjęcia: etap zasobów (AT3-D13) | `videoUrl`; zdjęcia — brak | tak | `videoUrl` puste; zdjęcia brak |
| WP-12 | Jeden mechanizm wyboru ćwiczeń dla katalogu, planów i treningu | AT3.6c | resolver, indeks | tak | jest |
| WP-13 | Ćwiczenie prywatne: model techniczny; ćwiczenie inne niż cardio ma co najmniej jeden mięsień główny (B2) | AT3.5 | model atlasu (`scope: private`) | — | jest w silniku (snapshot prywatny) |
| WP-14 | Formularz prywatnego ćwiczenia: tryb podstawowy i zaawansowany | AT3.6d | model z WP-13 | tak | jest |
| WP-15 | Sugerowanie istniejących ćwiczeń przy tworzeniu prywatnego | AT3.6d | indeks wyszukiwania | tak | jest |
| WP-16 | Obowiązkowy snapshot w treningu | AT3.4 (zapis), AT3.7 (użycie) | `load-snapshot.js` | — | jest |
| WP-17 | Oddzielna progresja każdego wariantu | AT3.7 | `exerciseId` + snapshot | — | jest |
| WP-18 | Statystyki kategorii, podpartii i mięśni: praca główna i pomocnicza osobno (AT3-D17) | AT3.2 (agregacja), AT3.7 (ekrany) | snapshot v2 + hierarchia | tak (ekrany statystyk) | jest |
| WP-19 | Gotowe plany wyłącznie na nowym atlasie | AT3.8 | `plan-templates.json` (C01-5) | stan pusty: tak | treść szablonów: AT3-D4, O-29 |
| WP-20 | Katalog ćwiczeń cardio (kategoria „Cardio i kondycja”) | wydania atlasu, AT3.6a | `measurementType: cardio`, `loadModel: cardio` | tak | brak ćwiczeń cardio w Batch 01 |
| WP-21 | Cardio w planach i treningach | AT3.4 (przejściowo), AT3.6c (wybór) | kontrakt cardio (sekcja 7) | tak | — |
| WP-22 | Zapis czasu i dystansu cardio | AT3.2 (silnik), AT3.4 (zapis) | `durationSec`, `distanceM` | tak (wpis cardio w aktywnym treningu) | — |
| WP-23 | Historia aktywności cardio | AT3.4 (zapis), AT3.6b (karta) | historia po `exerciseId` | tak | — |
| WP-24 | Statystyki czasu i dystansu, trendy i porównania wyników cardio | AT3.2 (agregacja), AT3.7 (ekrany) | sekcja 7 | tak | — |

## 3. Hierarchia i zasady agregacji

### 3.1 Dwie warstwy

| Warstwa | Do czego | Źródło | Zmiana |
| --- | --- | --- | --- |
| Anatomiczna | karta ćwiczenia, ćwiczenia prywatne, snapshot | `primaryMuscles`, `secondaryMuscles` + `dictionaries.muscles` | tylko przez partie Standaryzacji |
| Wspólna hierarchia (AT3-D16) | nawigacja katalogu, filtr partii, statystyki, raporty, Progress Engine | `src/atlas/navigation.json` (`hierarchyVersion`), kategorie → podpartie → kody mięśni | nowa `hierarchyVersion`, walidowana z atlasem |

Pole `statsGroup` w słowniku mięśni zostaje tymczasowo, bo wymaga go schemat F2 (reguła M4); aplikacja i
statystyki go nie używają. Usunięcie wymaga osobnej, kontrolowanej zmiany schematu i szablonu importu.

### 3.2 Docelowa hierarchia

Przynależność ćwiczenia do kategorii mięśniowej wyznaczają wyłącznie `primaryMuscles`; mięśnie pomocnicze
są prezentowane oddzielnie. Kody węzłów są propozycją do potwierdzenia w Standaryzacji razem z nazwami
(AT3-D10).

| Kategoria | Podpartia | Kod podpartii | Kody mięśni (Batch 01) | Kody zaplanowane (AT3-D16, bez dodawania teraz) |
| --- | --- | --- | --- | --- |
| Klatka piersiowa (`chest`) | Klatka piersiowa | `chest.pectorals` | `pectoralis_major` | — |
| Plecy (`back`) | Najszerszy grzbietu | `back.lats` | `latissimus_dorsi` | — |
| | Środek i góra pleców | `back.upper` | `trapezius` | `rhomboids` |
| | Dolny odcinek pleców | `back.lower` | `erector_spinae` | — |
| Barki (`shoulders`) | Przedni akton | `shoulders.front` | `deltoid_anterior` | — |
| | Boczny akton | `shoulders.side` | `deltoid_lateral` | — |
| | Tylny akton | `shoulders.rear` | `deltoid_posterior` | — |
| Ramiona (`arms`) | Biceps | `arms.biceps` | `biceps_brachii`, `brachialis` | — |
| | Triceps | `arms.triceps` | `triceps_brachii` | — |
| | Przedramiona | `arms.forearms` | `brachioradialis` | — |
| Brzuch i core (`core`) | Brzuch | `core.abs` | `rectus_abdominis`, `transversus_abdominis` | — |
| | Skośne brzucha | `core.obliques` | `obliques` | — |
| Nogi (`legs`) | Czworogłowe uda | `legs.quads` | `quadriceps` | — |
| | Dwugłowe uda | `legs.hamstrings` | `biceps_femoris` | — |
| | Pośladki | `legs.glutes` | `gluteus_maximus` | `gluteus_medius` |
| | Przywodziciele | `legs.adductors` | `adductor_magnus` | — |
| | Zginacze biodra | `legs.hip_flexors` | `hip_flexors` | — |
| | Łydki | `legs.calves` | — (pusta do nowych kodów) | `gastrocnemius`, `soleus` |
| Cardio i kondycja (`cardio`) | — (bez podpartii w 1.0, O-33) | — | ćwiczenia z `measurementType: cardio` | — |

Wszystkie 19 kodów Batch 01 mają dokładnie jedną podpartię. Cztery kody zaplanowane dodaje Standaryzacja w
partii atlasu (treść słownika, bez zmiany schematu; każdy ma pasującą wartość `statsGroup`); w tym
zleceniu nie są dodawane. Podpartia bez mięśni jest ukryta w UI i daje zero w statystykach.

**Cardio w hierarchii (O-30, O-33).** Ćwiczenie należy do kategorii „Cardio i kondycja” wtedy i tylko
wtedy, gdy ma `measurementType: cardio` — systemowe i prywatne tak samo. Kategoria nie ma podpartii w 1.0;
rodzaje aktywności znajduje się wyszukiwarką i filtrami (sprzęt, rodzina), bez sztucznych podpartii
mięśniowych. Mięśnie ćwiczenia cardio są opcjonalne i informacyjne (karta ćwiczenia): ćwiczenie cardio
nie należy do kategorii mięśniowych ani w nawigacji, ani w statystykach, bo hierarchia jest wspólna.

### 3.3 Zasady agregacji (AT3-D17)

1. Każdy mięsień główny ćwiczenia dostaje pełną objętość każdej serii.
2. Każda podpartia i każda kategoria liczy serię **najwyżej raz** w obrębie własnego węzła, nawet gdy
   seria obejmuje kilka jego mięśni. Kategoria nie jest sumą podpartii.
3. Całkowita objętość treningu jest liczona niezależnie od kategorii (`sessionTotals`), nigdy z węzłów.
4. Praca pomocnicza jest osobną metryką na poziomie mięśnia, podpartii i kategorii; jest zachowana także
   wtedy, gdy ten sam węzeł ma pracę główną z tej samej serii (praca główna i pomocnicza nigdy nie są
   sumowane). To zastępuje regułę F2 v2 pkt 1 w części „grupa nigdy nie jest jednocześnie główna i
   pomocnicza” (`deriveGroups`, M6) — na poziomie mięśni rozłączność zostaje (M3).
5. Normalizacja obciążenia, jednostronność, powtórzenia, serie (D5: rozgrzewki nie, dropsety tak) i statusy
   objętości (`exact` / `estimated` / `partial` / `none`) — bez zmian, z `load.js`.
6. Metryki nie są mieszane: kilogramy tylko z modeli z ciężarem; sekundy ćwiczeń siłowych na czas
   osobno; cardio w osobnym bloku (sekcja 7). Czas i dystans nigdy nie są przeliczane na kilogramy.
7. Nazwa metryki: „Objętość ćwiczeń angażujących partię” (praca główna) i „Objętość ćwiczeń angażujących
   partię jako mięśnie pomocnicze”. To nie jest fizjologiczny pomiar pracy mięśnia.
8. Raporty i eksporty podają `hierarchyVersion` użytą do agregacji.

**Algorytm.** Dla każdego wpisu ćwiczenia ze snapshotem v2: `P` = mięśnie główne + ich podpartie + ich
kategorie (bez powtórzeń); `S` = to samo dla mięśni pomocniczych. Każda licząca się seria (o unikalnym
identyfikatorze) trafia raz do każdego węzła z `P` jako praca główna i raz do każdego węzła z `S` jako
praca pomocnicza; zbiory już policzonych identyfikatorów serii w węźle chronią przed zdublowanymi danymi
(PE-24). Wpis bez snapshotu nie trafia do żadnego węzła i jest liczony jako usterka (F2-4). Wpis cardio
nie trafia do węzłów mięśniowych, także gdy ma mięśnie (O-30); jego dane idą wyłącznie do statystyk
cardio (sekcja 7).

## 4. Źródła danych: filtry, kafelek, karta

Status: **jest** = pole istnieje w schemacie F2 i jest wypełnione w Batch 01; **puste** = pole istnieje,
brak treści; **brak** = potrzebne nowe dane (sekcja 5).

### 4.1 Wyszukiwanie i filtry

| Funkcja | Źródło | Status |
| --- | --- | --- |
| Wyszukiwanie | `namePl`, `aliasesPl`; normalizacja bez polskich znaków i wielkości liter w indeksie | jest |
| Kategoria i podpartia | `primaryMuscles` → `navigation.json` (AT3-D16); cardio: `measurementType` | jest |
| Sprzęt | `equipment` + `dictionaries.equipment` (`labelPl`, `role`: load / support / assist) | jest |
| Rodzaj obciążenia | `loadModel` (+ `measurementType`), pogrupowane w UI | jest; grupowanie: projekt AT3.1 |
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
| N1 | Hierarchia | potwierdzenie nazw i kodów w Standaryzacji; 4 nowe kody w partii atlasu | `navigation.json` z walidatorem (sekcja 3, AT3-D16, AT3-D10) |
| N10 | Ćwiczenia cardio w atlasie | ćwiczenia, sprzęt cardio; mięśnie opcjonalne (O-30) | treść partii Standaryzacji |
| N11 | Wartość metryk cardio | zasady porównań i trendów (sekcja 7) | AT3.2 (silnik), AT3.7 (ekrany) |
| N2 | Instrukcja i typowe błędy | pola schematu i treść partii | nowe pola atlasu dopiero po przygotowaniu treści i osobnej zgodzie na zmianę schematu F2 (AT3-D12) |
| N3 | Podobne ćwiczenia | V8 zabrania pól równoważności, K3: rodzina ≠ zamiennik | „Podobne ćwiczenia — sugestie oparte na danych, bez deklarowania zamienności”; wyliczane z danych atlasu, bez wpływu na progresję; F2 V8 i K3 bez zmian (AT3-D11) |
| N4 | Zdjęcia | brak w schemacie | na rodzinę albo partię, osobny etap zasobów wg `DESIGN.md` §16 (AT3-D13) |
| N5 | Ulubione | dane użytkownika | lokalnie w AT3.6a, synchronizacja w SY (AT3-D14) |
| N6 | Ostatnio używane | nic (z historii) | AT3.6a |
| N7 | Sugestie przy tworzeniu prywatnego | nic (indeks wyszukiwania) | AT3.6d |
| N8 | Historia i progres na karcie | snapshot | od AT3.4, pełny progres w AT3.7 |
| N9 | Wartości filtrów wariantów przy 390 ćwiczeniach | kompletne `variantAttributes` w partiach | jakość zależy od partii; walidator V3/V4 pilnuje spójności |

## 6. Snapshot v2 i ochrona historii

**Kontrakt snapshotu v2 (AT3-D18).**
- `snapshotVersion` = 2.
- Zostają, zamrożone przy zapisie treningu: `primaryMuscles`, `secondaryMuscles` (oraz wszystkie
  pozostałe pola modelu obciążenia: `measurementType`, `loadModel`, `implements`, `laterality`,
  `repsCounting`, `confidence`, `entryRev`, `atlasVersion`, źródło i identyfikator ćwiczenia).
- Wycofane: `primaryGroups`, `secondaryGroups`, reguła `ws_groups_disjoint`, reguła `ws_atlas_primary_group`.
- Nowa reguła `ws_primary_muscle`: snapshot z `measurementType` innym niż `cardio` — z atlasu i
  prywatny (B2) — ma co najmniej jeden mięsień główny; snapshot cardio może mieć puste listy mięśni (O-30).
  `ws_muscles_disjoint` zostaje dla wszystkich.
- Ta sama reguła mięśnia głównego obowiązuje w trzech miejscach (B2): walidator atlasu (M1), walidator i
  formularz ćwiczenia prywatnego (AT3.5, AT3.6d) oraz kontrakt snapshotu (`ws_primary_muscle`).
- Węzły hierarchii są wyliczane przy odczycie z bieżącego `navigation.json`; snapshot nie zapisuje węzłów
  ani `hierarchyVersion`. Zmiana hierarchii przelicza historię spójnie; model obciążenia pozostaje
  zamrożony (D13), bo zmienia liczby, a hierarchia tylko sposób grupowania.
- Konsekwencje: `src/engine/load-snapshot.js` (`SNAPSHOT_FIELDS`, `validateLoadSnapshot`,
  `buildLoadSnapshot`), `db/v2-draft/001_load_snapshot.sql` (kolumny i CHECK), testy
  `f2-load-snapshot`, `f2-snapshot-sql`, fixtury testów `src/nr1/` (kod `src/nr1/` bez zmian). Historia:
  w S1 nie ma danych z atlasu, szkic SQL nigdzie nie działa — nie ma czego migrować.

**Obowiązkowy snapshot od AT3.4.** AT3.4 jest pierwszym etapem, w którym S1 zapisuje treningi na
ćwiczeniach atlasu, dlatego od tego etapu:
- snapshot (`buildLoadSnapshot`) powstaje przy dodaniu ćwiczenia do treningu, z planu lub ręcznie, i jest
  zapisywany przy wpisie historii;
- wpis historii bez snapshotu jest usterką z ostrzeżeniem (F2-4): trening zostaje zapisany, ale taki wpis
  nie jest liczony do objętości ani grup i nigdy nie jest uzupełniany po cichu z bieżącego atlasu (D13);
  scenariusze testowe AT3.4 wymagają zera takich wpisów;
- obecne ekrany statystyk dostają kategorie i podpartie z hierarchii (przez snapshot v2); obecne wzory
  objętości zostają do bramki A5.

**AT3.7 wykorzystuje snapshot:** statystyki kategorii, podpartii i mięśni (praca główna i pomocnicza,
sekcja 3.3), statystyki cardio (sekcja 7), progresja z modelu snapshotu, bramka A5 (zmiana wzorów
objętości na ekranach — osobna akceptacja).

**Ryzyko R-AT3-1: kolizja `hanging_knee_raise`.** Identyfikator istnieje w starym katalogu 68 ćwiczeń, w
starych mapach silnika (`ATLAS_MUSCLE_GROUPS`: Brzuch + Dwugłowe uda / pośladki; `load-legacy-map.js`: masa
ciała) i w atlasie (główny: prosty brzucha; pomocnicze: zginacze biodra, skośne brzucha). To zbieg identyfikatorów, nie mapowanie. Bez ochrony silnik przypisałby nowemu ćwiczeniu grupy ze
starej mapy, a stara historia mogłaby zostać odczytana jako historia ćwiczenia z atlasu.

**Mechanizm ochrony historii (AT3-D8), obowiązuje od pierwszego zapisu w nowej przestrzeni (AT3.4):**
1. Separacja przestrzeni: nowa przestrzeń S1 nie zawiera starych wpisów (AT3-D3); stare dane zostają
   nietknięte i nieczytane.
2. Mięśnie, węzły hierarchii i model w nowej przestrzeni zawsze ze snapshotu, a przy jego braku z atlasu
   przez resolver; stare mapy kluczowane starymi identyfikatorami nie są wywoływane.
3. Brak snapshotu = usterka z ostrzeżeniem (F2-4), bez uzupełniania z bieżącego atlasu.
4. Test z AT2 utrzymuje listę wspólnych identyfikatorów starego katalogu i atlasu; nowa kolizja z kolejnej
   partii jest od razu widoczna.
Test odbioru: trening `hanging_knee_raise` w nowej przestrzeni daje węzły z atlasu (T13).

### 6.1 Konfigurowalny model obciążenia maszyn (B02-D21)

- Jedno ćwiczenie katalogowe może mieć dwie konstrukcje maszyny: ze stosem (`machine_stack`) i ładowaną
  talerzami (`plate_loaded`). Opcje wyznacza `loadModelOptions(exercise, atlas)`: domyślny `loadModel`
  należy do tej pary, a jedyny sprzęt obciążający jawnie dopuszcza oba modele w `loadModels`. Inaczej —
  tylko model z atlasu. Schemat atlasu bez zmian (D-1 = A).
- Wybór następuje przy dodaniu do planu (pozycja planu) albo przy dodaniu poza planem, przed pierwszą serią
  (AT3.4 / AT3.6c): „Na jakiej maszynie będziesz wykonywać ćwiczenie?” — 1. Maszyna ze stosem obciążenia;
  2. Maszyna ładowana talerzami. Pytania nie ma, gdy jest jedna opcja.
- Snapshot wykonania zapisuje wybrany model w polu `loadModel` (`buildLoadSnapshot({ …, loadModel,
  equipment })`, model spoza opcji → `LOAD_MODEL_NOT_ALLOWED`). Zmiana planu nie zmienia starych sesji.
- Wpis ciężaru: stos — wartość ze stosu (50 kg → 50 kg); talerze — suma dołożonych talerzy (20 + 20 kg →
  40 kg); konstrukcja maszyny nie jest doliczana. Tonaż bez zmian wzorów.
- Porównania kg i rekordy: rozdzielone kluczem `comparabilityKey` = `exerciseId + loadModel + entryRev`
  (podstawa PE-B / PE-E). Zmiana modelu nie jest prezentowana jako spadek ani wzrost siły. Ten sam klucz
  nie gwarantuje identyczności dwóch fizycznych maszyn.
- Maszyna Smitha — osobna konwencja (D-3 = S2): `docs/atlas/B02-D21-SMITH-S2.md`.

## 7. Cardio w NEXTREP 1.0 (AT3-D19)

Zakres: katalog ćwiczeń cardio, cardio w planach i treningach, zapis czasu i dystansu, historia
aktywności, statystyki czasu i dystansu, trendy i porównania wyników. W 1.0 zapisywane są wyłącznie czas i
dystans (O-31). Poza zakresem: kalorie, tętno, prędkość jako osobne pole, nachylenie, opór, poziom,
piętra i pozostałe parametry urządzeń, GPS, integracje z urządzeniami. Czas i dystans nigdy nie są
przeliczane na kilogramy.

Rozstrzygnięcia z 17.10.2026: O-30 (mięśnie cardio opcjonalne, informacyjne, poza agregacją siłową; M1
rozróżnia siłowe i cardio), O-31 (tylko czas i dystans), O-32 (dystans per aktywność / `exerciseId`, bez
sumy dystansu różnych aktywności; łączny czas cardio może być sumowany), O-33 (bez podpartii).

### 7.1 Stan obecny

- Schemat atlasu: `measurementType: cardio` z jedynym modelem `cardio` (`atlas-schema.js`); Batch 01 nie ma
  ćwiczeń cardio. Reguła M1 wymaga dziś co najmniej jednego mięśnia głównego także dla cardio — do zmiany
  w AT3.2c (O-30).
- Silnik (`load.js`): model `cardio` ma jednostkę `cardio`; `isPerformed` uznaje serię cardio tylko przy
  czasie > 0; `normalizeLoad` czyta tylko `duration`; `exerciseTotals` i `sessionTotals` dodają czas cardio
  do `seconds` razem z ćwiczeniami siłowymi na czas (plank) i liczą serie cardio w `workingSets`.
  Dystansu silnik nie zna.
- Kontrakt serii N1 (`src/nr1/contracts/set.js`): dla cardio tylko `durationSec` („pola cardio — później”).
- Stara aplikacja (`18-active-workout.jsx`, `14-analytics.jsx`): jeden ciągły wpis cardio z czasem i
  dystansem w km jako tekst, do tego pola zależne od urządzenia (prędkość, nachylenie, opór, poziom,
  piętra, tempo, kcal, tętno — `01-config-utils.jsx`); porównanie „więcej dystansu albo mniej czasu na ten
  sam dystans” w `analyzeCardioSession`. W nowej przestrzeni 1.0 te pola znikają (O-31): wpis cardio
  w AT3.4 ma tylko czas i dystans. Codzienna aplikacja z `main` nie jest zmieniana.

### 7.2 Kontrakt danych (minimalne rozszerzenie)

| Pole serii cardio | Typ | Jednostka kanoniczna | Zasady |
| --- | --- | --- | --- |
| `durationSec` | liczba całkowita | sekunda | 1–86 400; wpis „mm:ss”, „h:mm:ss” albo minuty, parsowany do sekund |
| `distanceM` | liczba całkowita | metr | 1–1 000 000; wpis w km z przecinkiem („5,2”) albo w m, zaokrąglenie do metra |
| `setType`, `status`, `position` | jak w kontrakcie serii | — | rozgrzewka cardio nie liczy się do statystyk (D5) |

- Walidacja pól (P2, ćwiczenia systemowe i prywatne): puste pole = brak wartości; jawnie wpisane zero,
  wartość ujemna i tekst niebędący liczbą = wartość nieprawidłowa (komunikat, pole nie jest zapisane).
  Seria cardio jest wykonana, gdy co najmniej jedno z pól `durationSec`, `distanceM` ma poprawną wartość.
  Brak poprawnej wartości w obu = seria niewykonana (nie liczy się, jak niewykonana seria siłowa).
  Bez `reps`, `loadKg`, `assistKg`, `rir`.
- Tempo (s/km) jest wyliczane, nigdy zapisywane: tylko dla serii z oboma polami,
  `tempo = Σ durationSec / (Σ distanceM / 1000)` po seriach z oboma polami.
- Wpis ćwiczenia cardio ma zwykle jedną serię (ciągła aktywność); kilka serii = interwały. Snapshot v2 jak
  dla innych ćwiczeń (`measurementType: cardio`, `loadModel: cardio`), mięśnie mogą być puste.
- Ten sam kontrakt dla ćwiczeń systemowych (atlas, `source: atlas`) i prywatnych (`source: private`):
  ćwiczenie prywatne cardio wybiera `measurementType: cardio`, model `cardio` jest wtedy jedynym
  dozwolonym, mięśnie opcjonalne; brak pól ciężaru, sprzętu obciążenia i liczby przyrządów.
- Walidator atlasu (M1): błąd `PRIMARY_MUSCLE_REQUIRED` tylko dla ćwiczeń z `measurementType` innym niż
  `cardio`. Pozostałe reguły mięśni (M2, M3, M4) obowiązują, jeśli cardio ma mięśnie; M5 nie dotyczy cardio.
- Silnik: `isPerformed` (czas lub dystans), `normalizeLoad` (+ `distanceM`), `exerciseTotals` dla cardio
  zwraca `{ sets, durationSec, distanceM, paceSecPerKm }`; `sessionTotals` dostaje osobny blok `cardio`
  (`entries`, `durationSec`, dystans per `exerciseId`), a `workingSets`, `reps`, `seconds` i `volumeKg`
  przestają obejmować cardio. Zmiana dotyczy tylko modelu `cardio`; pozostałe reguły `load.js` bez zmian.

### 7.3 Przypadki

| # | Przypadek | Zasada |
| --- | --- | --- |
| 1 | Tylko czas | `durationSec`; brak tempa; porównanie czasu |
| 2 | Tylko dystans | `distanceM`; brak tempa; porównanie dystansu |
| 3 | Czas i dystans | oba pola + tempo wyliczone |
| 4 | Trening mieszany siłowo-kondycyjny | wpisy siłowe i cardio w jednym treningu; sumy siłowe bez cardio, blok cardio osobno; czas treningu bez zmian |
| 5 | Cardio w ćwiczeniu prywatnym | `measurementType: cardio`, `loadModel: cardio`, snapshot `source: private`; mięśnie opcjonalne, nieagregowane (O-30); kategoria „Cardio i kondycja” |
| 6 | Brak czasu i dystansu | seria niewykonana; zapis ćwiczenia bez żadnej wykonanej serii jak dziś dla siłowych |
| 7 | Historia i porównania | per `exerciseId`, tylko metryki obecne w obu wykonaniach: czas z czasem, dystans z dystansem, tempo z tempem; każda metryka osobno, bez jednego wyniku łączonego |
| 8 | Wiele aktywności | łączny czas cardio sumowany między aktywnościami; dystans tylko w obrębie jednego `exerciseId`; brak jednej sumy dystansu różnych aktywności (O-32); nigdy w kg |

### 7.4 Statystyki i trendy

- Okres: dla każdej aktywności (`exerciseId`) — liczba wykonań, suma czasu, suma dystansu, tempo; dla
  kategorii „Cardio i kondycja” — liczba wykonań i łączny czas, bez sumy dystansu (O-32).
- Trendy: per `exerciseId`, ostatnie wykonania (≤ 10, jak w Progress Engine), osobno czas, dystans, tempo.
- Porównanie (P1): zawsze w obrębie tego samego `exerciseId`, metryka po metryce — tempo niższe =
  lepiej; dystans większy = lepiej; czas: „krócej = lepiej” tylko przy identycznym dystansie i
  porównywalnych warunkach pomiaru. W 1.0 porównywalne warunki oznaczają ten sam `exerciseId` (rodzaj
  aktywności i sprzęt z atlasu) i ten sam model ze snapshotu (D13); innych warunków aplikacja nie zbiera
  (O-31). W pozostałych przypadkach zmiana czasu jest informacją (+/−), bez automatycznej oceny poprawy.
  Tempo jest wskaźnikiem wyliczanym, nie przechowywanym.
  Etykiety statusów Progress Engine dla ćwiczeń siłowych nie są używane dla cardio bez osobnej decyzji.

## 8. Etapy

Pełny harmonogram: `NEXTREP_1_0_MASTER_PLAN.md` §K.3–K.4.

| Etap | Rodzaj | Zakres |
| --- | --- | --- |
| AT3.0 | decyzje + dokumentacja | rejestr decyzji AT3, MASTER PLAN, ta specyfikacja |
| AT3.1 | projekt UI (równolegle) | ekrany z sekcji 8 w Claude Design |
| AT3.2 | dane i silnik | AT3.2a: resolver, indeks, wyszukiwanie, fasety; AT3.2b: hierarchia `navigation.json` + walidator, snapshot v2, agregacja węzłów; AT3.2c: kontrakt cardio w silniku |
| AT3.3 | dane | czysty start S1, wyłączone migracje i import starych kopii, chmura w S1 wyłączona do SY |
| AT3.4 | integracja | atlas jedynym źródłem w planach i treningu, zapis snapshotu v2 (także cardio), węzły hierarchii na obecnych ekranach, zapis czasu i dystansu cardio (UI przejściowe), wycofanie starego katalogu, nowy E2E |
| AT3.5 | model | ćwiczenia prywatne: UUID, pola modelu, resolver, snapshot prywatny, prosty formularz przejściowy |
| AT3.6a | UI | katalog: partie, wyszukiwarka, filtry, kafelek, ostatnio używane, ulubione lokalnie |
| AT3.6b | UI | karta szczegółów |
| AT3.6c | UI | jeden mechanizm wyboru w katalogu, planie i treningu |
| AT3.6d | UI | formularz prywatnego ćwiczenia z sugestiami |
| AT3.7 | ekrany statystyk | statystyki kategorii, podpartii i mięśni, statystyki i trendy cardio, progresja ze snapshotu, bramka A5 |
| AT3.8 | treść | gotowe plany na atlasie (`plan-templates.json` + walidator) |

## 9. Zależności od Claude Design (AT3.1)

| Ekran / element | Potrzebny przed |
| --- | --- |
| Ćwiczenia — wejście: kafle 7 kategorii (z „Cardio i kondycja” bez podpartii), podpartie jako chipy, wyszukiwarka, filtry (w cardio: sprzęt i rodzaj aktywności), ulubione, ostatnio używane, moje | AT3.6a |
| Lista wyników i kafelek ćwiczenia (nazwa, mięśnie główne, sprzęt, oznaczenia wariantu) | AT3.6a |
| Arkusz filtrów (wiele wymiarów, czyszczenie, liczby wyników) | AT3.6a |
| Karta szczegółów, z miejscem na sekcje zależne od danych (instrukcja, błędy, zdjęcie, wideo) | AT3.6b |
| Wspólny mechanizm wyboru ćwiczenia (katalog, edytor planu, trening) | AT3.6c |
| Formularz prywatnego ćwiczenia: tryb podstawowy i zaawansowany, sugestie | AT3.6d |
| Stany puste: mały atlas, brak gotowych planów, brak wyników, S1 bez chmury | AT3.4 (prosty tekst wystarczy, AT3-D9) |
| Wpis cardio w aktywnym treningu (tylko czas i dystans w km; tempo wyliczone) i w planie | AT3.6c (przejściowo już w AT3.4) |
| Karta i historia aktywności cardio; mięśnie cardio jako informacja („angażuje”), bez kategorii mięśniowych | AT3.6b |
| Statystyki: kategoria → podpartie → mięśnie, praca główna i pomocnicza osobno, nazwy metryk (sekcja 3.3), wersja hierarchii | AT3.7 / PE-C |
| Statystyki cardio: łączny czas, dystans per aktywność (bez sumy dystansu różnych aktywności), tempo, trendy, porównania per metryka | AT3.7 |

Do czasu projektu AT3.4–AT3.5 używają obecnych komponentów jako UI przejściowego (AT3-D9).

## 10. Kryteria odbioru

Wspólne dla każdego etapu z kodem: wszystkie testy zielone (unit, UI, nr1, E2E); oba workflow CI zielone,
APK S1 zbudowany i sprawdzony na telefonie; diff tylko w zakresie etapu; bez zmian `main`, Vercel,
Supabase i zatwierdzonego `atlas.json`; raport z listą zmienionych plików i testów; push dopiero po
akceptacji właściciela.

| Etap | Kryteria szczegółowe |
| --- | --- |
| AT3.0 | decyzje AT3-D1–AT3-D15 w rejestrze; ryzyko R-AT3-1 i mechanizm ochrony zapisane; MASTER PLAN z harmonogramem AT3.0–AT3.8; ta specyfikacja (wersja 1) ✅ |
| AT3-D1/D2 | AT3-D16–AT3-D19 w rejestrze; ta specyfikacja w wersji 2; testy T1–T16 i C1–C15 opisane (sekcja 11) |
| AT3.1 | każdy ekran zaakceptowany przez właściciela i zapisany w `docs/design/`; projekt nie wymaga danych spoza sekcji 4 albo jawnie oznacza sekcje zależne od N2–N4 |
| AT3.2 | resolver zwraca każde ćwiczenie atlasu (także archiwalne) po id i `null` dla nieznanego; wyszukiwanie znajduje po nazwie, aliasie i bez polskich znaków (np. „przysiad”, „wioslowanie”, „OHP”); fasety poprawne na Batch 01 i na syntetycznym atlasie wielkości 390 (tylko w testach); walidator `navigation.json` (T14); snapshot v2 z walidatorem i szkicem SQL; agregacja T1–T13, T15; kontrakt cardio C1–C15 w silniku; katalog AT2 na kategoriach i podpartiach |
| AT3.3 | stare klucze danych obecne na urządzeniu → nieczytane i nietknięte (test); start z pustą przestrzenią; 0 wywołań Supabase; brak zasiewu starych ćwiczeń; migracje i import starych kopii nieosiągalne; komunikat w S1 o braku chmury do SY |
| AT3.4 | w S1 nie ma żadnego ćwiczenia ze starego katalogu; plan z ćwiczeń atlasu tworzony i uruchamiany; pola serii zgodne z modelem (kontrakt N1, cardio: sekcja 7); każdy wpis historii w scenariuszach ma poprawny snapshot v2 (0 wpisów bez snapshotu); trening `hanging_knee_raise` daje węzły z atlasu; obecne wzory objętości bez zmian; nowy E2E przechodzi pełny trening na atlasie, także z wpisem cardio (gdy atlas lub ćwiczenie prywatne cardio będzie dostępne) |
| AT3.5 | ćwiczenie prywatne z UUID nie koliduje z id atlasu; snapshot `source: private` poprawny także dla „nie wiem” (`external_unknown`, objętość „brak”); prywatne inne niż cardio bez mięśnia głównego odrzucone w formularzu, walidatorze i snapshocie (B2, T16); prywatne w katalogu, planie i treningu |
| AT3.6a | kombinacje filtrów („i” między wymiarami, „lub” w wymiarze) zgodne z indeksem; zgodność z zaakceptowanym projektem (test wizualny) |
| AT3.6b | każda sekcja karty z danymi z atlasu; sekcje bez danych ukryte; warianty tylko z tej samej rodziny, opisane jako warianty; „Podobne ćwiczenia” opisane jako sugestie oparte na danych, bez deklarowania zamienności |
| AT3.6c | jeden komponent wyboru w trzech miejscach; wybór zwraca id atlasu albo UUID; testy wszystkich trzech wejść |
| AT3.6d | tryb podstawowy tworzy kompletne, poprawne ćwiczenie; sugestie pokazują istniejące ćwiczenia przy podobnej nazwie i pozwalają wybrać je zamiast tworzyć duplikat |
| AT3.7 | statystyki kategorii, podpartii i mięśni zgodne z T1–T16; statystyki i trendy cardio zgodne z C1–C15; `hierarchyVersion` w raporcie; scenariusze PE-03–PE-07, PE-18, D5, D13 na danych S1; progresja per `exerciseId`; zmiana wzorów tylko po akceptacji A5 |
| AT3.8 | każdy szablon przechodzi walidator (ćwiczenia istnieją i są aktywne, cele zgodne z modelem, RIR z dozwolonej listy); plan z szablonu uruchomiony na telefonie |

## 11. Testy akceptacyjne hierarchii i cardio

Założenia: ćwiczenia z Batch 01, hierarchia z sekcji 3.2, wzory `load.js`; „G” = praca główna, „P” =
pomocnicza; zapis `serie / kg`; serie robocze bez rozgrzewek. „Węzeł” = mięsień, podpartia albo kategoria.

| # | Przypadek | Dane | Oczekiwany wynik |
| --- | --- | --- | --- |
| T1 | Przysiad: czworogłowe + pośladki | przysiad ze sztangą na plecach, 3 × (100 kg × 5) | `legs.quads`, `legs.glutes`, `legs` G **3 / 1500** (nie 6 / 3000); `legs.adductors` P 3 / 1500; `legs` P 3 / 1500 (zachowana mimo G); `back.lower`, `back` P 3 / 1500; mięśnie: `quadriceps`, `gluteus_maximus` G 3 / 1500, `adductor_magnus`, `erector_spinae` P 3 / 1500; trening: 3 serie, 1500 kg |
| T2 | Dwa ćwiczenia w tym samym węźle | T1 + przysiad przedni 2 × (80 kg × 5) | `legs.quads`, `legs.glutes`, `legs` G **5 / 2300**; `legs` P 3 / 1500; `legs.adductors` P 3 / 1500; `back.lower`, `back` P 5 / 2300; `core.abs`, `core` P 2 / 800; trening: 5 serii, 2300 kg |
| T3 | Dwa mięśnie główne w jednej podpartii | uginanie z hantlami, 2 × (12 kg × 10), para hantli | `arms.biceps` G **2 / 480** (nie 4 / 960); `arms` G 2 / 480; `arms.forearms` P 2 / 480; `arms` P 2 / 480 |
| T4 | Mięśnie główne z dwóch kategorii | ćwiczenie prywatne (czworogłowy + naramienny przedni, sztanga), 2 × (40 kg × 10) | `legs.quads`, `legs`, `shoulders.front`, `shoulders` G po 2 / 800; trening: **2 serie, 800 kg** (nie 1600) |
| T5 | Pomocnicze w innych kategoriach | wyciskanie sztangi leżąc, 3 × (80 kg × 8) | `chest.pectorals`, `chest` G 3 / 1920; `arms.triceps`, `arms` P 3 / 1920; `shoulders.front`, `shoulders` P 3 / 1920 |
| T6 | Pomocniczy w kategorii głównej; seria bez kg | podciąganie nachwytem, 8, 8, 7 powt. | `back.lats`, `back` G: 3 serie, 23 powt., kg `none` (UI: „—”, nie „0 kg”); `back.upper`, `back` P 3 serie / 23 powt.; `arms.biceps`, `arms` P 3 / 23 powt. |
| T7 | Jednostronność | wiosłowanie hantlem jednorącz, 1 × (26 kg × 10 na stronę) | `back.lats`, `back` G 1 / **520** (PE-18), powt. 10, `repsAllSides` 20; `back.upper`, `back` P 1 / 520; `shoulders.rear`, `shoulders` P 1 / 520; `arms.biceps`, `arms` P 1 / 520 |
| T8 | Prywatne z modelem „nie wiem” | prywatne (czworogłowy), `external_unknown`, 2 × (50 kg × 10), razem z T1 | `legs.quads`, `legs` G: 5 serii, kg **1500 ze statusem `partial`** |
| T9 | Brak snapshotu | wpis bez snapshotu, 3 serie | brak w węzłach; `missingSnapshot` = 1; ostrzeżenie (F2-4); wyniki T1 bez zmian |
| T10 | Ćwiczenie siłowe na czas | plank na przedramionach, 3 × 60 s | `core.abs`, `core` G: 3 serie, **180 s**, kg `none`; `core.obliques`, `core` P 3 / 180 s; `legs.glutes`, `legs` P 3 / 180 s; czas nie w kg i nie w bloku cardio |
| T11 | Cardio w hierarchii | ćwiczenie `measurementType: cardio` | nie trafia do węzłów mięśniowych; trafia do kategorii „Cardio i kondycja” (C1–C15) |
| T12 | Zdublowana seria | ten sam identyfikator serii dwa razy we wpisie | węzeł liczy serię raz; walidacja treningu zgłasza duplikat (PE-24) |
| T13 | Kolizja `hanging_knee_raise` | unoszenie kolan w zwisie, 3 × 12 | `core.abs`, `core` G 3 serie / 36 powt.; `core.obliques`, `core` P; `legs.hip_flexors`, `legs` P; **brak** `legs.glutes` i `legs.hamstrings` |
| T14 | Walidator hierarchii | mięsień w dwóch podpartiach; mięsień bez podpartii; nieznany kod; usunięty kod węzła | 4 błędy, build zatrzymany |
| T16 | Prywatne siłowe bez mięśnia głównego | prywatne `measurementType: weight_reps`, `primaryMuscles` puste | odrzucone w formularzu, walidatorze ćwiczenia prywatnego i snapshocie (`ws_primary_muscle`) — B2; prywatne cardio bez mięśni dozwolone (C13) |
| T15 | Suma treningu | dowolny trening z T1–T10 | dla każdego węzła G: serie ≤ serie treningu; suma treningu nigdy nie jest liczona z węzłów; raport podaje `hierarchyVersion` |

| # | Przypadek cardio | Dane | Oczekiwany wynik |
| --- | --- | --- | --- |
| C1 | Tylko czas | 1 seria, `durationSec` 1800 | wykonana; czas 1800 s; dystans brak; tempo brak |
| C2 | Tylko dystans | 1 seria, `distanceM` 5000 | wykonana; dystans 5000 m; czas brak; tempo brak |
| C3 | Czas i dystans | 1 seria, 1500 s, 5000 m | tempo **300 s/km** (5:00/km) |
| C4 | Interwały | 3 serie: (300 s, 1000 m), (300 s, 1000 m), (600 s, —) | czas 1200 s; dystans 2000 m; tempo z serii z oboma polami: 600 s / 2 km = **300 s/km** |
| C5 | Wpis z przecinkiem | dystans „5,2” km, czas „25:30” | `distanceM` 5200, `durationSec` 1530 |
| C6 | Błędy | dystans „-1”, czas „abc”, jawne 0 | 3 błędy walidacji; nic nie zapisane jako liczba |
| C7 | Brak obu | seria bez czasu i dystansu | seria niewykonana; nie liczy się do niczego |
| C8 | Trening mieszany | przysiad (T1) + bieg 1500 s / 5000 m | sumy siłowe: 3 serie, 1500 kg, `seconds` 0; blok cardio: 1 wpis, 1500 s, 5000 m dla tego `exerciseId`; nic z cardio w węzłach mięśniowych |
| C9 | Wiele aktywności | bieg 1500 s / 5000 m + wiosłowanie 600 s / 2000 m | łączny czas cardio 2100 s; dystans osobno: bieg 5000 m, wiosłowanie 2000 m; **brak** sumy 7000 m (O-32) |
| C10 | Prywatne cardio | prywatne `measurementType: cardio` z mięśniem `quadriceps`, 900 s / 3000 m | snapshot `source: private` poprawny; tempo 300 s/km; kategoria „Cardio i kondycja”; **brak** wpisu w `legs.quads` i `legs` (O-30) |
| C13 | Cardio bez mięśni | ćwiczenie atlasu `measurementType: cardio` bez `primaryMuscles` | walidator atlasu bez błędu M1; snapshot bez błędu `ws_primary_muscle`; ćwiczenie siłowe bez mięśnia głównego nadal daje błąd M1 |
| C14 | Tylko czas i dystans | wpis z polem `kcal`, `heartRate` albo `speed` | pole odrzucone przez kontrakt serii (O-31) |
| C15 | Jedno pole poprawne, drugie nie | czas 1500 s, dystans jawnie „0” (systemowe i prywatne) | dystans nieprawidłowy (komunikat, nie zapisany); seria wykonana z czasem 1500 s; tempo brak (P2) |
| C11 | Porównanie | bieg: wcześniej 5000 m / 1560 s, teraz 5000 m / 1500 s | tempo 312 → 300 s/km: lepiej; dystans bez zmian; czas krótszy przy tym samym dystansie: lepiej |
| C12 | Brak porównania metryki | wcześniej tylko czas 1800 s, teraz tylko dystans 5000 m | brak porównania (inne metryki); żadnego wyniku łączonego |

## 12. Zależności zewnętrzne

| Obszar | Zależność |
| --- | --- |
| Standaryzacja (ChatGPT) | kolejne partie atlasu; potwierdzenie hierarchii i 4 nowych kodów (AT3-D16, AT3-D10); ćwiczenia i sprzęt cardio, mięśnie opcjonalne (N10, O-30); treść instrukcji i błędów (AT3-D12); treść gotowych planów (AT3-D4, O-29) |
| Claude Design | projekty AT3.1 przed AT3.6a–d |
| SY | chmura w S1 wyłączona od AT3.3 do SY (AT3-D5); SY obejmie ćwiczenia prywatne (UUID), odwołania `catalog_exercise_id`, snapshot v2 w treningu, serie cardio (`durationSec`, `distanceM` jako liczby — dziś dystans i kcal idą jako tekst) i ulubione |
| Progress Engine | PE-E (najlepszy wynik, przecinek) przed AT3.7; PE-C i A5 w AT3.7; PE-D, PE-F/G/H po AT3.7 (O-25); opisy partii w specyfikacji PE i `REPORTING_ENGINE_MAP.md` zgodne z AT3-D16/D17; progresja per `exerciseId` i normalizacja `load.js` bez zmian |
