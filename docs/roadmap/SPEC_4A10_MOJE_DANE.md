# NEXTREP 1.0 — Etap 4A.10: „Moje dane”, „Przenoszenie danych”, „Kopie i odzyskiwanie”

Wersja 2 · 11.10.2026 · gałąź `release/1.0` · status: **specyfikacja do akceptacji**; kierunki O-10, O-17,
O-18 przyjęte 11.10.2026 i wpisane poniżej (dokumentacja,
bez implementacji)

## 0. Pochodzenie dokumentu

Oryginalnego opisu Etapu 4A.10 nie ma w repozytorium ani w dokumentach projektu. Ta specyfikacja
została **odtworzona** z trzech źródeł:

1. Decyzja F-1 z 11.10.2026: trzy obszary, zasady bezpieczeństwa starego systemu (izolacja gościa i
   kont, brak cichego nadpisywania, kopia przed przywracaniem, odzyskanie po błędzie, Centrum
   konfliktów), w v2 automatyczna synchronizacja i bezpieczne łączenie rekordów UUID, a ręczne
   „Zapisz dane w chmurze” znika dopiero po bezpiecznym zastąpieniu.
2. Kod Etapów 4A.1–4A.4 na `release/1.0` (inwentarz w sekcji 2, z odwołaniami do plików).
3. Ustalenia STORE FIRST (10.10): IndexedDB (D11; przyjęte 11.10 jako O-10), eksport przez Filesystem i Share,
   import przez kolejkę synchronizacji, brak migracji starych danych do 1.0.

Wszystko, czego nie dało się wyprowadzić z tych źródeł, jest oznaczone jako **pytanie otwarte**
(sekcja 9) i nie jest traktowane jako ustalone.

## 1. Zasady bezpieczeństwa (obowiązują w każdym z trzech obszarów)

| # | Zasada | Pochodzenie | Jak sprawdzamy |
| --- | --- | --- | --- |
| Z1 | **Izolacja gościa i kont.** Gość, konto A i konto B mają osobne przestrzenie lokalne, kolejki, kopie, konflikty i identyfikator urządzenia. Operacja w jednej przestrzeni nigdy nie czyta ani nie zapisuje innej. | 4A.1–4A.2 (kod i testy `workspace-*`, `accounts-storage`) | testy izolacji przeniesione do v2 |
| Z2 | **Brak cichego nadpisywania.** Nie ma zasady „nowszy wygrywa”. Ten sam rekord zmieniony w dwóch miejscach daje konflikt. Import i przywracanie domyślnie **dodają**; domyślnie nic nie jest nadpisywane. Tryb „zastąp” wymaga **zweryfikowanej** kopii (Z3) i jawnego potwierdzenia z opisem skutków. | `ACCOUNT_DATA_MODEL.md` §23, §38 zasada 6; O-17 (11.10) | testy T-05, T-09, T-11 |
| Z3 | **Kopia przed każdą operacją ryzykowną:** przywracanie, import, przeniesienie gościa do konta, tryb „zastąp”, usunięcie danych z urządzenia. **Jeśli kopii nie da się utworzyć, operacja się nie rozpoczyna** (zmiana względem starego kodu, sekcja 2, uwaga U2). Przed zastąpieniem danych kopia musi być **zweryfikowana**: zapisana, odczytana z magazynu i zgodna ze źródłem (liczba rekordów każdego typu i suma kontrolna treści). | 4A.3 (`BEFORE_CLOUD_RESTORE`), 4A.4; F-1; O-17 | testy T-13, T-29 |
| Z4 | **Odzyskanie po błędzie.** Każda operacja wieloetapowa ma zapisany stan „w toku”. Po przerwaniu (zamknięcie aplikacji, brak sieci, błąd) aplikacja przy starcie pokazuje ekran „Dokończ / Cofnij”. „Cofnij” korzysta z kopii z Z3. | markery `loading_cloud`, `uploading_device` (4A.3) | testy T-14, T-15 |
| Z5 | **Centrum konfliktów.** Każdy konflikt jest widoczny, porównywalny pole po polu i rozstrzygany przez użytkownika z potwierdzeniem. Liczba konfliktów jest widoczna w „Moje dane”. | `ConflictCenterScreen` (13-account-ui.jsx:88) | testy T-10, S2, S3, S9 |
| Z6 | **Usunięcia są synchronizowane** (tombstony) i nie wracają po cichu. Konflikt „usunięty tu, zmieniony tam” jest jawny. | `ACCOUNT_DATA_MODEL.md` §38 zasada 7 | S3, S6 |
| Z7 | **Dane nie nadają uprawnień.** Import, przywracanie i przeniesienie nigdy nie zapisują PRO ani ustawień uprawnień. | STORE FIRST (usunięcie PRO z importu) | test T-08 |
| Z8 | **Dla konta źródłem prawdy jest serwer**, przestrzeń lokalna jest jego kopią roboczą. Dla gościa jedyną kopią jest urządzenie (stąd ostrzeżenia). | `ACCOUNT_DATA_MODEL.md` §38 zasady 1, 5 | — |
| Z9 | **Dane gościa nie trafiają do konta automatycznie.** Pierwsze przeniesienie wymaga jednej jawnej zgody. Po niej dane są zwykłymi danymi konta. | ustalenie z 4A.2 („guest data is never auto-imported”) | test T-03 |
| Z10 | **Tylko format v2.** 1.0 nie importuje plików ani danych starej wersji (ustalenie: brak migracji starych planów, historii i identyfikatorów ćwiczeń). | ustalenie stałe projektu | test T-07 |
| Z11 | **„Puste dane” i usunięcie danych z urządzenia nigdy nie usuwają danych w chmurze.** | ustalenie z 4A.3 | test T-16 |

## 2. Inwentarz starego systemu i los każdego elementu w v2

Status dotyczy kodu `release/1.0`. „Los w v2” to propozycja tej specyfikacji.

| Element (dziś) | Gdzie w kodzie | Zachowanie dziś | Los w v2 | Obszar |
| --- | --- | --- | --- | --- |
| Przestrzenie gość / konto A / konto B | `03-normalizers-namespaces.jsx:101`, `04-account-init-migration.jsx` | osobne klucze, kolejki i kopie | **zostaje** (Z1) | wszystkie |
| Karta „Źródło danych” + „Wybierz ponownie źródło danych” | `13-account-ui.jsx` (AccountScreen), `04-account-init-migration.jsx` | przy pierwszym wejściu na konto wybór: urządzenie / chmura / puste; kopia przed wczytaniem chmury; synchronizacja wyłączona do wyboru | **zastąpione** łączeniem po UUID (sekcja 4.2); wybór zostaje tylko dla danych gościa (Z9) | Przenoszenie |
| „Synchronizuj teraz” i status synchronizacji | `07-sync-queue-push.jsx:1159–1178` | stany: wylogowany, wstrzymana, offline, konflikty, w toku, ponowi, oczekujące, aktualne | **zostaje**, z datą ostatniej potwierdzonej synchronizacji | Moje dane |
| „Zapisz dane w chmurze” | `13-account-ui.jsx:805`, `06-legacy-cloud-v1.jsx:16` | zapis całych danych jako jeden JSON do tabeli `user_data` (mechanizm przejściowy) | **usuwane dopiero po spełnieniu bramki z sekcji 7** | Moje dane |
| „Pobierz / Przywróć dane z chmury” (stare) | usunięte z UI w 4A.3 | nadpisywało dane bez kopii | **nie wraca** | — |
| Centrum konfliktów | `13-account-ui.jsx:88`, `08-sync-meta-pull-conflicts.jsx:1189` | porównanie pól, „Zachowaj moją wersję” / „Użyj wersji z chmury”, potwierdzenie | **zostaje**, rozszerzone o konflikt usunięcia i kolejności (sekcja 4.4) | Moje dane |
| Migracja danych gościa do konta (4A.4) | `04-account-init-migration.jsx`, SQL F-5 (tylko `nextrep-f5-test`) | maszyna migracji z próbami po stronie serwera, blokady, „Dokończ / Przerwij przenoszenie” | **usuwana** (decyzja F-5); zastępuje ją przepisanie przestrzeni + kolejka v2 (sekcja 4.1) | Przenoszenie |
| Kopie lokalne | `09-backups.jsx` | jeden klucz `localStorage`; typy: automatyczna (co ≥ 4 s), ręczna, przed importem, przed przywróceniem, przed resetem, przed przeniesieniem; limit 10 na przestrzeń + osobne limity kopii bezpieczeństwa | **zostają**, w IndexedDB (O-10) z limitem liczby i rozmiaru | Kopie |
| Przywracanie kopii | `09-backups.jsx:144`, `13-account-ui.jsx:1591` | nadpisuje pola lokalne, kopia „przed przywróceniem”, przeładowanie | **zmienione**: tryb „dodaj brakujące” domyślnie, „przywróć dokładny stan” jawnie, przez kolejkę (sekcja 5.2) | Kopie |
| Eksport JSON | `13-account-ui.jsx:1510` | pobranie pliku przez Blob; w APK nie działa (NR-S1-01) | **zmienione**: Filesystem + Share, format v2 | Przenoszenie |
| Import JSON | `13-account-ui.jsx:1540` | nadpisuje całe listy, omija kolejkę synchronizacji, może zapisać PRO | **zmienione**: walidacja v2, podgląd, tryb „dodaj” domyślnie, kolejka, bez PRO | Przenoszenie |
| Reset / „Puste dane” | `04-account-init-migration.jsx:725–730` | kopia „przed resetem”, potem puste dane lokalne | **zostaje** jako „Usuń dane z tego urządzenia” (Z11) | Kopie |
| Usuwanie konta | `13-account-ui.jsx` (AccountScreen) | `delete_user`, czyszczenie lokalne | poza 4A.10 (obszar konta); przed usunięciem propozycja eksportu | — |

**Uwagi z inwentarza (luki starego kodu, które v2 musi zamknąć):**

- **U1.** Import i przywracanie zapisują `proStatus` z pliku lub kopii (`13-account-ui.jsx:1540–1590`,
  `09-backups.jsx:144`). Narusza Z7.
- **U2.** Wynik kopii „przed importem” i „przed przywróceniem” nie jest sprawdzany
  (`13-account-ui.jsx:1564`, `:1591`). Gdy kopia się nie zapisze (np. brak miejsca), operacja i tak
  nadpisuje dane. Narusza Z3.
- **U3.** Import omija kolejkę synchronizacji (audyt STORE FIRST). Skutek dla chmury niezweryfikowany.
- **U4.** Wszystkie kopie są w jednej wartości `localStorage`; przy limicie ok. 5 MB zapis kopii może
  się cicho nie udać.

## 3. Obszar „Moje dane”

**Cel:** jedno miejsce, z którego użytkownik wie, gdzie są jego dane, czy są bezpieczne i co wymaga
uwagi. Wejście: „Więcej” → „Moje dane”.

Zawartość ekranu:

1. **Kto i gdzie.** Gość: „Dane są tylko na tym urządzeniu”. Konto: adres e-mail i „Dane są na koncie
   i synchronizowane”.
2. **Liczniki** z bieżącej przestrzeni: ćwiczenia własne, plany, treningi, pomiary.
3. **Synchronizacja** (tylko konto): stan (aktualne / oczekujące zmiany: N / offline / wstrzymana z
   powodem / błąd, ponowimy), **data i godzina ostatniej synchronizacji potwierdzonej przez serwer**,
   przycisk „Synchronizuj teraz”.
4. **Konflikty:** liczba i przejście do Centrum konfliktów (gdy > 0, wyróżnione).
5. **Ostatnia kopia:** data i typ, przejście do „Kopie i odzyskiwanie”.
6. **Przerwana operacja** (jeśli istnieje): opis i „Dokończ / Cofnij” (Z4).
7. **Gość:** stałe ostrzeżenie „Usunięcie aplikacji lub danych przeglądarki usuwa Twoje treningi”, z
   akcjami „Załóż konto” i „Zapisz kopię do pliku”.
8. **Diagnostyka synchronizacji** (link): raport bez treści treningów do dołączenia do zgłoszenia
   (zakres w `NEXTREP_1_0_MASTER_PLAN.md` §2.11).
9. Przejścia: „Przenoszenie danych”, „Kopie i odzyskiwanie”.

## 4. Obszar „Przenoszenie danych”

### 4.1 Gość → konto (rejestracja albo logowanie)

1. Po zalogowaniu, jeśli przestrzeń gościa na tym urządzeniu ma dane, aplikacja pyta raz:
   „Przenieść dane z tego urządzenia do konta?” — „Przenieś”, „Nie teraz”. Bez zgody nic nie przechodzi (Z9).
2. „Przenieś”: kopia „przed przeniesieniem” (Z3) → zapis „operacja w toku” (Z4) → przepisanie rekordów
   gościa do przestrzeni konta **z tymi samymi UUID** → wszystkie rekordy do kolejki → wysyłka.
3. Wynik: po potwierdzeniu przez serwer komunikat z liczbami („Przeniesiono: 12 planów, 140
   treningów…”); przestrzeń gościa zostaje opróżniona **dopiero po potwierdzonym przeniesieniu i pełnej
   synchronizacji** (kolejka pusta, serwer potwierdził wszystkie rekordy; O-17), kopia „przed przeniesieniem” zostaje (retencja
   w sekcji 5.1). Opróżnienie chroni przed ponownym przeniesieniem tych samych UUID do innego konta.
4. Konto już ma dane w chmurze: przeniesienie **dodaje** rekordy gościa (zbiory UUID są rozłączne,
   więc nie powstają konflikty). Rekordy podobne z nazwy (np. dwa plany „PPL”) nie są łączone
   automatycznie; ekran wyniku pokazuje listę „możliwe duplikaty” do ręcznego przejrzenia.
5. Przerwanie (brak sieci, zamknięcie): rekordy są już w przestrzeni konta i w kolejce; wysyłka
   wznawia się sama. Przestrzeń gościa opróżnia się dopiero po potwierdzeniu serwera.
6. „Nie teraz”: dane gościa zostają w przestrzeni gościa; „Moje dane” konta pokazuje „Na tym
   urządzeniu są dane z trybu bez logowania” z akcją „Przenieś”.

### 4.2 Konto na kolejnym urządzeniu i ponowne logowanie

- Nowe urządzenie (pusta przestrzeń konta): automatyczne pobranie danych konta. Nie ma wyboru źródła.
- To samo konto, niewysłane zmiany offline: wysyłane automatycznie po połączeniu; konflikty → Z5.
- Dawny wybór „urządzenie / chmura / puste” znika, bo rekordy mają jeden UUID od urządzenia do chmury
  i łączą się bez strat. Jeśli użytkownik chce zacząć od pustych danych na urządzeniu, robi to przez
  „Usuń dane z tego urządzenia” (sekcja 5.4), które nie dotyka chmury (Z11).

### 4.3 Eksport i import pliku

**Eksport** („Zapisz kopię do pliku”): format v2 (wersja formatu, wersja aplikacji, data, identyfikator
przestrzeni, rekordy z UUID, snapshoty modelu obciążenia); zapis przez Filesystem i udostępnienie przez
Share (F4); w przeglądarce pobranie pliku. Plik nie zawiera uprawnień, tokenów ani danych innych
przestrzeni.

**Import:**

1. Wybór pliku → walidacja formatu v2 i każdego rekordu (snapshot walidowany jak w F2). Plik starej
   wersji albo uszkodzony → odmowa z wyjaśnieniem, dane bez zmian (Z10).
2. Podgląd: liczby rekordów nowych, identycznych i różniących się od obecnych.
3. Tryb **„Dodaj”** (domyślny): dodaje rekordy o nowych UUID; rekordy o istniejącym UUID i innej
   treści trafiają do Centrum konfliktów jako konflikt „plik / urządzenie”. Nic nie jest usuwane.
4. Tryb **„Zastąp”** (osobne potwierdzenie z opisem skutków): przestrzeń przyjmuje dokładnie zawartość
   pliku; rekordy spoza pliku dostają tombstony, które dla konta trafią do chmury i na inne urządzenia.
5. Kopia „przed importem” (Z3) → „operacja w toku” (Z4) → zapis zmian przez kolejkę synchronizacji →
   wynik z liczbami. Import nie zapisuje PRO (Z7).
6. Plik z innego konta: rekordy dostają **nowe UUID** (zapobiega kolizji klucza z rekordami innego
   konta); ostrzeżenie przed importem.

### 4.4 Centrum konfliktów (wspólne dla obszarów)

Typy konfliktów w v2: (a) ten sam rekord zmieniony w dwóch miejscach; (b) usunięty w jednym, zmieniony
w drugim („Przywróć i zachowaj zmiany” / „Usuń”); (c) kolejność tej samej listy zmieniona w dwóch
miejscach (konflikt rodzica, wybór jednej kolejności); (d) plik / urządzenie przy imporcie. Każdy wybór
wymaga potwierdzenia. Ekran dostępny z klawiatury i czytnika ekranu (wymaganie STORE FIRST).

**„Zachowaj obie” (O-17):** dozwolone tylko tam, gdzie kopia z nowym UUID nie narusza spójności.
Propozycja listy typów (do akceptacji, O-17):

| Typ rekordu | „Zachowaj obie” | Powód |
| --- | --- | --- |
| Plan (z ćwiczeniami planu i seriami planu) | tak — cały plan z nowymi UUID dla rodzica i wszystkich dzieci, nazwa z dopiskiem „(kopia)” | kopia samodzielna, bez odwołań z historii |
| Ćwiczenie własne | tak — nowe UUID; historia dalej wskazuje oryginał i czyta snapshot | snapshot chroni historię (D13) |
| Trening, ćwiczenie treningu, seria treningu | **nie** | podwójne liczenie objętości, rekordów i statystyk (PE-24) |
| Pojedyncze ćwiczenie planu lub seria planu | **nie** | naruszenie ciągłości `position` i superserii rodzica |
| Pomiar, pole własne | **nie** (do potwierdzenia) | duplikat tego samego dnia lub tej samej nazwy pola |

## 5. Obszar „Kopie i odzyskiwanie”

### 5.1 Kopie lokalne

| Typ | Kiedy | Retencja (propozycja, pytanie P4) |
| --- | --- | --- |
| Automatyczna | po zmianach, nie częściej niż co kilka sekund | 10 najnowszych na przestrzeń |
| Ręczna | „Utwórz kopię teraz” | wspólny limit z automatycznymi |
| Przed przywróceniem / importem / przeniesieniem / zastąpieniem / usunięciem z urządzenia | automatycznie przed operacją (Z3) | 2 najnowsze każdego typu + każda, do której odwołuje się operacja w toku; nigdy nie wypierane przez kopie automatyczne |

Magazyn: IndexedDB za warstwą magazynu (O-10: docelowy główny magazyn danych treningowych i kopii, z
obsługą błędów i ograniczeń pojemności), limit łącznego rozmiaru, komunikat o braku
miejsca. Kopie należą do przestrzeni (Z1); lista pokazuje tylko kopie bieżącej przestrzeni.

### 5.2 Przywracanie kopii

1. Podgląd kopii: data, typ, liczby rekordów, różnice względem stanu obecnego.
2. Tryb **„Przywróć brakujące”** (domyślny): przywraca rekordy, których dziś nie ma lub które są
   usunięte; rekordy istniejące i zmienione od czasu kopii → konflikt w Centrum konfliktów. Nic nie
   jest usuwane.
3. Tryb **„Przywróć dokładnie ten stan”** (osobne potwierdzenie, pytanie P2): przestrzeń wraca do stanu
   kopii; rekordy nowsze niż kopia dostają tombstony. Dla konta ostrzeżenie: „Zmiana obejmie chmurę i
   inne urządzenia”.
4. Kopia „przed przywróceniem” (Z3), „operacja w toku” (Z4), zmiany przez kolejkę; bez zmian uprawnień
   (Z7). Przywrócić można tylko kopię tej samej przestrzeni (konto i użytkownik sprawdzane jak w 4A.3).

### 5.3 Odzyskiwanie po błędzie

- **Dziennik operacji:** import, przywracanie, przeniesienie, zastąpienie, usunięcie z urządzenia
  zapisują stan (start, kopia, etap, koniec). Przy starcie aplikacji niedokończona operacja otwiera
  ekran „Dokończ / Cofnij”. „Cofnij” przywraca kopię sprzed operacji w trybie dokładnym, tylko lokalnie,
  zanim zmiany wyjdą do chmury; gdy część już wyszła — przez kolejkę, z opisem skutków.
- **Konflikty** zawsze przez Centrum konfliktów (Z5).
- **Ostatnio usunięte** (kosz, np. 30 dni, przywracanie jednym dotknięciem): **pytanie otwarte P1** —
  nie było w starym systemie.
- **Kopie serwerowe** (Supabase): zabezpieczenie przed awarią, nie funkcja dla użytkownika. Zależne od
  planu Supabase (STORE FIRST D6, otwarta).

### 5.4 Usuń dane z tego urządzenia

Kopia (Z3) → usunięcie przestrzeni lokalnej. Konto: dane w chmurze nietknięte, po ponownym otwarciu
pobierają się automatycznie (Z11). Gość: ostrzeżenie, że to usunięcie ostateczne, i propozycja eksportu.

## 6. Scenariusze odbioru (testy automatyczne, do wykonania w F3)

| # | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| T-01 | Gość z danymi zakłada nowe konto i przenosi dane | wszystkie rekordy w chmurze z tymi samymi UUID; przestrzeń gościa pusta po potwierdzeniu serwera; kopia „przed przeniesieniem” istnieje |
| T-02 | Gość z danymi loguje się na konto z danymi | suma zbiorów, 0 konfliktów, lista „możliwe duplikaty” |
| T-03 | Gość loguje się i wybiera „Nie teraz” | nic nie przechodzi do konta; dane gościa nietknięte; akcja „Przenieś” dostępna później |
| T-04 | Przeniesienie przerwane (zabicie aplikacji, brak sieci) | po starcie wysyłka wznowiona; brak duplikatów; gość opróżniony dopiero po potwierdzeniu |
| T-05 | Import „Dodaj” pliku z rekordami nowymi i zmienionymi | nowe dodane, zmienione jako konflikty, nic nie usunięte, wszystko w kolejce |
| T-06 | Import „Zastąp” na koncie, drugie urządzenie online | tombstony na obu urządzeniach; kopia „przed importem” pozwala cofnąć |
| T-07 | Import pliku starej wersji lub uszkodzonego | odmowa, dane bez zmian |
| T-08 | Import i przywrócenie pliku / kopii z polem PRO | uprawnienia bez zmian |
| T-09 | Przywrócenie „brakujące” po przypadkowym usunięciu planu | plan wraca (ten sam UUID, wyższa wersja) na wszystkich urządzeniach |
| T-10 | Usunięcie na A, edycja na B offline | konflikt typu (b) w Centrum konfliktów; bez cichego wskrzeszenia |
| T-11 | Przywrócenie „dokładne” | rekordy nowsze niż kopia jako tombstony; ostrzeżenie pokazane przed operacją |
| T-12 | Kopia innej przestrzeni / innego konta | niewidoczna i nie do przywrócenia |
| T-13 | Brak miejsca przy tworzeniu kopii bezpieczeństwa | operacja nie startuje; komunikat; dane bez zmian |
| T-14 | Aplikacja zabita w trakcie importu | przy starcie „Dokończ / Cofnij”; „Cofnij” daje stan sprzed importu |
| T-15 | Aplikacja zabita w trakcie przywracania | jw. |
| T-16 | „Usuń dane z tego urządzenia” na koncie | chmura nietknięta; dane wracają po ponownym otwarciu |
| T-17 | Plik z innego konta | nowe UUID, ostrzeżenie, brak kolizji |
| T-18 | Eksport i ponowny import tego samego pliku | 0 zmian (wszystko identyczne) |
| T-19 | Eksport i import na S22 przez Filesystem i Share | plik zapisany i wczytany (zamyka NR-S1-01) |

Scenariusze synchronizacji S1–S28 (MASTER PLAN §3.2) obowiązują równolegle. Pokrycie S ↔ T, duplikaty i
proponowane testy T-20–T-32: `COVERAGE_S_T.md` (do akceptacji, O-22).

## 7. Bramka usunięcia „Zapisz dane w chmurze”

Przycisk znika z klienta 1.0 dopiero, gdy **wszystkie** warunki są spełnione i sprawdzone:

1. Synchronizacja v2 wysyła zmiany automatycznie po każdej zmianie i po odzyskaniu sieci (test).
2. „Moje dane” pokazuje datę ostatniej synchronizacji potwierdzonej przez serwer i liczbę
   oczekujących zmian (test UI).
3. Scenariusze S1–S28 i T-01–T-19 są zielone.
4. Eksport do pliku działa w przeglądarce i na S22 (T-19).
5. Kopie zapasowe bazy produkcyjnej 1.0 są włączone i sprawdzone odtworzeniem (zależy od D6).

Do czasu spełnienia bramki „Zapisz dane w chmurze” nie jest przenoszone do 1.0 jako nowa funkcja
(1.0 nie ma tabeli `user_data`), ale nie jest też zgłaszane jako zastąpione. Stara produkcja zachowuje
przycisk bez zmian.

## 8. Zależności i etap

- Wymaga: schemat v2 i `nextrep_push` (F2.4), klient na v2 (F3), IndexedDB (O-10), wtyczki Filesystem i
  Share (F4), projekt ekranów (Stitch, D3), backend testowy (decyzja otwarta, rejestr decyzji).
- Etap wdrożenia: F3 (logika, ekrany), F4 (pliki natywne). Priorytet P1, z elementami P0: Z1–Z4, Z7.

## 9. Pytania otwarte

| # | Pytanie | Propozycja |
| --- | --- | --- |
| P1 | Czy 1.0 ma „Ostatnio usunięte” (kosz) z przywracaniem? | **otwarte — wymaga szczegółowej specyfikacji (O-17 pkt 5)**; propozycja wyjściowa: 30 dni, tylko przywracanie |
| P2 | Tryby „Zastąp” i „Przywróć dokładnie ten stan” | **kierunek przyjęty (O-17):** dopuszczalne wyłącznie ze zweryfikowaną kopią i jawnym potwierdzeniem; domyślnie nic nie jest nadpisywane |
| P3 | Opróżnianie przestrzeni gościa po przeniesieniu | **kierunek przyjęty (O-17):** dopiero po potwierdzonym przeniesieniu i synchronizacji (§4.1 pkt 3) |
| P4 | Retencja kopii: liczba i limit rozmiaru | **otwarte — wymaga szczegółowej specyfikacji (O-17 pkt 5)**; propozycja wyjściowa: 10 zwykłych, 2 na typ kopii bezpieczeństwa |
| P5 | „Zachowaj obie” | **kierunek przyjęty (O-17):** tylko gdzie kopia z nowym UUID nie narusza spójności; lista typów do akceptacji (§4.4) |
| P6 | Dostęp offline | **przyjęte (O-18):** zapisana, wcześniej uwierzytelniona sesja otwiera offline lokalne dane właściwego konta; nowe logowanie wymaga internetu; zmiana konta bez potwierdzonej tożsamości nie ujawnia danych innego konta (test T-28, `COVERAGE_S_T.md`) |
