# Raport importu — partia syntetyczna (dane testowe)

**Wynik:** import zablokowany (błędów: 4)

| Ćwiczenia w atlasie | Nowe | Zmienione | Bez zmian | Błędy | Ostrzeżenia | Wydanie po imporcie |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | 11 | 0 | 0 | 4 | 2 | 1 |

| Poziom | Reguła | Kod | Rekord | Pole | Opis |
| --- | --- | --- | --- | --- | --- |
| błąd | V5 | MULTIPLE_LOAD_SOURCES_UNSUPPORTED | test_press_bar | equipment | Ćwiczenie ma 2 źródła obciążenia (test.bar, test.chain); sumowanie różnych obciążeń nie jest jeszcze obsługiwane. |
| błąd | V7 | NAME_CONTAINS_WORKING_WEIGHT | test_row_cable | namePl | „Testowe wiosłowanie na wyciągu 40 kg” zawiera ciężar roboczy; zmiana ciężaru nie tworzy nowego ćwiczenia. |
| błąd | V4 | LATERALITY_ATTRIBUTE_MISSING | test_pull_bw | variantAttributes | Jednostronność lub naprzemienność musi być widoczna jako cecha wariantu. |
| błąd | M1 | PRIMARY_MUSCLE_REQUIRED | test_core_band | primaryMuscles | Ćwiczenie musi mieć co najmniej jeden mięsień główny. |
| ostrzeżenie | T4 | LOAD_INCREMENT_MISSING | test_press_bar_method | loadIncrementKg | Brak kroku ciężaru — silnik nie poda konkretnego ciężaru do zwiększenia (D7). |
| ostrzeżenie | V7 | NAME_SETS_REPS_PATTERN | test_press_bar_method | namePl | „Testowa metoda 5x5” wygląda na serie × powtórzenia; dozwolone tylko jako nazwa metody. |
| informacja | M6 | SECONDARY_IN_PRIMARY_GROUP | test_press_db_incline | secondaryMuscles | Mięsień pomocniczy „test.m.chest_a” należy do grupy głównej chest; nie zmienia statystyk tej grupy. |
