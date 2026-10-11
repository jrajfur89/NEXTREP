# Pokrycie scenariuszy: synchronizacja S1–S26 ↔ 4A.10 T-01–T-19

Wersja 1 · 11.10.2026 · status: **do akceptacji** (dokumentacja). Żaden test nie jest usuwany.

Źródła: S1–S26 — `NEXTREP_1_0_MASTER_PLAN.md` §3.2 (S27–S28 dodane w wersji 2 planu, pokazane osobno);
T-01–T-19 — `SPEC_4A10_MOJE_DANE.md` §6.

Legenda: **=** ten sam scenariusz (duplikat); **⊃** S jest scenariuszem ogólnym, T jego przypadkiem
szczegółowym; **~** częściowe pokrycie; **—** brak odpowiednika (luka).

## 1. S → T

| S | Scenariusz | T | Relacja | Uwagi |
| --- | --- | --- | --- | --- |
| S1 | A i B zmieniają różne rekordy | — | — | tylko synchronizacja |
| S2 | ten sam rekord na A i B → konflikt | T-05 | ~ | T-05 to konflikt „plik / urządzenie”, nie dwóch urządzeń |
| S3 | A usuwa, B edytuje offline | T-10 | **=** | duplikat |
| S4 | A i B usuwają ten sam rekord | — | — | tylko synchronizacja |
| S5 | przywrócenie usuniętego rekordu (ten sam id) | T-09 | ~ | T-09 przywraca z kopii; S5 z ścieżki synchronizacji |
| S6 | usunięcie rodzica z dziećmi | T-06, T-11 | ~ | tombstony masowe, ale bez jawnego sprawdzenia kaskady → luka L-T1 |
| S7 | ćwiczenie własne usunięte, użyte w historii | — | — | luka L-T5 (import / przywracanie takiego ćwiczenia) |
| S8 | kolejność list na A, B widzi to samo | T-18 | ~ | T-18 (eksport → import) nie sprawdza kolejności → luka L-T6 |
| S9 | A i B zmieniają kolejność tej samej listy | — | — | SPEC §4.4 (c) ma typ konfliktu, brak testu → luka L-T2 |
| S10 | superseria przestawiona | — | — | tylko synchronizacja |
| S11 | ciężar „62,5” A → B | — | — | luka L-T7 (ułamki w eksporcie, imporcie, kopii) |
| S12 | oba urządzenia offline | T-04 | ~ | T-04 dotyczy przeniesienia gościa |
| S13 | aplikacja zabita w trakcie wysyłki | T-04 | ~ | jw.; T-14, T-15 dotyczą innych operacji |
| S14 | zegar urządzenia przestawiony | — | — | tylko synchronizacja |
| S15 | stary klient po zmianie schematu | T-07 | ~ | T-07 to stary format pliku, nie stary klient |
| S16 | trening w toku na A | — | — | luka L-T3 (import / przywracanie / przeniesienie przy aktywnym szkicu) |
| S17 | zmiana konta z niewysłaną kolejką | T-12 | ~ | T-12 to izolacja kopii; brak operacji 4A.10 przy niepustej kolejce → luka L-T4 |
| S18 | gość → nowe konto | T-01, T-03, T-04 | **⊃** | |
| S19 | konto z danymi lokalnymi + chmura | T-02 | **⊃** | w v2 dla tego samego konta automatycznie; T-02 = gość → konto z danymi |
| S20 | wybór źródła: urządzenie / chmura / puste | T-16 | ~ | **niespójność:** wymaganie v2 dla S20 („zachować kopię przed wczytaniem”) zakłada wybór źródła, który SPEC 4A.10 §4.2 usuwa → propozycja nowego brzmienia (sekcja 4) |
| S21 | przywrócenie kopii lokalnej | T-08, T-09, T-11, T-12, T-15 | **⊃** | |
| S22 | import pliku JSON | T-05, T-06, T-07, T-08, T-14, T-17, T-18 | **⊃** | |
| S23 | usunięcie konta | — | — | luka L-T8 (propozycja eksportu przed usunięciem, SPEC §2) |
| S24 | logowanie offline | — | — | luka L-T9 (decyzja O-18 z 11.10) |
| S25 | brak miejsca w pamięci | T-13 | ~ | T-13 tylko dla kopii bezpieczeństwa; zapis zwykłych danych bez testu |
| S26 | atlas zmieniony po treningu | — | — | luka L-T5 |

S27 (te same UUID w drugim koncie) ⊃ T-01, T-17. S28 (przerwana operacja na danych) ⊃ T-04, T-14, T-15.

## 2. T bez odpowiednika w S1–S26

T-07 (stary format pliku — tylko luźno S15), T-08 (brak PRO z danych), T-16 (usunięcie danych z
urządzenia), T-18 (eksport i import bez zmian), T-19 (pliki na S22). To scenariusze 4A.10, nie
synchronizacji; luka nie dotyczy synchronizacji.

## 3. Duplikaty

| Para | Propozycja (bez usuwania testu) |
| --- | --- |
| S3 = T-10 | oba identyfikatory zostają; jeden test może nosić oba identyfikatory albo zostają dwa testy (Twoja decyzja) |
| S18 ⊃ T-01, T-03, T-04; S19 ⊃ T-02; S21 ⊃ T-08, T-09, T-11, T-12, T-15; S22 ⊃ T-05–T-08, T-14, T-17, T-18 | S zostaje jako scenariusz ogólny (test dwóch klientów), T jako przypadki szczegółowe |

## 4. Luki — proponowane nowe scenariusze (do akceptacji)

| # | Luka | Proponowany test | Pokrywa |
| --- | --- | --- | --- |
| L-T1 | kaskada usunięć przy imporcie „Zastąp” i przywróceniu „dokładnym” | T-20: tombstony dzieci razem z rodzicem; po pobraniu na drugim urządzeniu brak sierot | S6 |
| L-T2 | konflikt kolejności w Centrum konfliktów | T-21: A i B zmieniają kolejność tej samej listy; jeden konflikt rodzica; po wyborze identyczna kolejność | S9 |
| L-T3 | operacje na danych przy aktywnym treningu | T-22: import, przywrócenie i przeniesienie przy otwartym szkicu treningu — szkic nietknięty albo operacja zablokowana z komunikatem | S16 |
| L-T4 | operacje na danych przy niepustej kolejce lub trwającej synchronizacji | T-23: import / przywrócenie / przeniesienie czeka na koniec synchronizacji albo dokłada zmiany do kolejki bez utraty | S12, S17 |
| L-T5 | import lub przywrócenie treningu z ćwiczeniem zarchiwizowanym, usuniętym albo z innej wersji atlasu | T-24: trening czyta snapshot; brak utraty serii; ćwiczenie nieznane → ostrzeżenie | S7, S26 |
| L-T6 | kolejność list w eksporcie, imporcie i kopii | T-25: pięć list zachowuje `position` po eksporcie → imporcie i po przywróceniu | S8 |
| L-T7 | ciężary ułamkowe w danych przenoszonych | T-26: „62,5” i „57,5” zachowane po eksporcie, imporcie, przywróceniu i przeniesieniu | S11, PE-27 |
| L-T8 | eksport przed usunięciem konta | T-27: przed usunięciem konta propozycja „Zapisz kopię do pliku” | S23 |
| L-T9 | dostęp offline (O-18) | T-28: zapisana, wcześniej uwierzytelniona sesja otwiera offline dane tego konta; nowe logowanie offline odrzucone; zmiana konta offline bez potwierdzenia tożsamości nie pokazuje danych innego konta | S24 |
| L-T10 | weryfikacja kopii przed zastąpieniem (O-17) | T-29: kopia, której nie da się odczytać i porównać, blokuje „Zastąp” i „Przywróć dokładnie ten stan” | O-17 |
| L-T11 | „Zachowaj obie” (O-17) | T-30: kopia z nowym UUID tylko dla dozwolonych typów; dzieci kopiowane z nowymi UUID; brak dla typów niedozwolonych | O-17 |
| L-T12 | czyszczenie danych gościa (O-17) | T-31: gość opróżniony dopiero po potwierdzonym przeniesieniu i pełnej synchronizacji (kolejka pusta, serwer potwierdził); przy błędzie dane gościa zostają | O-17 (wzmacnia T-01, T-04) |
| L-T13 | brak miejsca przy zwykłym zapisie | T-32: zapis rekordu do IndexedDB kończy się błędem pojemności → komunikat, brak cichej utraty, kolejka nienaruszona | S25, O-10 |

Proponowane nowe brzmienie S20 (v2): „Brak wyboru źródła. Pusta przestrzeń konta → pobranie danych
konta. Dane gościa → T-01–T-03. Start od pustych danych na urządzeniu → „Usuń dane z tego urządzenia”
(T-16)”.
