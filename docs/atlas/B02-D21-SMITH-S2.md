# B02-D21 / D-3 = S2 — maszyna Smitha: notatka projektowa (bez implementacji)

18.10.2026 · gałąź `release/1.0` · status: **propozycja do zatwierdzenia** (implementacja po osobnej zgodzie)

## Zasada produktu (zatwierdzona)

- Znany opór początkowy: wpis = opór początkowy + suma dołożonych talerzy (np. 7 + 40 = 47 kg). Bez
  domyślnych 20 kg.
- Nieznany opór początkowy: dopuszczalny wpis samej sumy talerzy (40 kg), jednoznacznie oznaczony jako
  nieuwzględniający oporu początkowego; nieporównywalny bezpośrednio z pełnym ciężarem.
- Karta ćwiczenia (AT3-D20, por. O-34): „Szukaj naklejki informacyjnej na maszynie.” Oznaczenia producenta
  (`Starting resistance`, `Bar weight`, masa gryfu, efektywny opór początkowy) nie są traktowane jako
  identyczne dla każdej konstrukcji.

## Minimalny kontrakt danych — czy wystarczą istniejące pola?

**Tak, bez zmiany snapshotu i SQL**, jeśli konwencję zapisu wyrazi `loadModel` wykonania:

| Konwencja | `loadModel` w snapshocie | Znaczenie wpisanego ciężaru | Tonaż (wzór bez zmian) |
| --- | --- | --- | --- |
| Pełny ciężar (opór znany) | `barbell_total` | opór początkowy + talerze | ciężar × powtórzenia |
| Same talerze (opór nieznany) | `plate_loaded` | suma dołożonych talerzy, bez oporu początkowego | ciężar × powtórzenia, oznaczony w UI jako „bez oporu początkowego” |

- Oba modele mają w `load.js` ten sam wzór (`kg: "total"`), więc tonaż się nie zmienia, a podwójne
  liczenie jest niemożliwe.
- Rozdzielenie porównań daje istniejący `comparabilityKey` (`exerciseId + loadModel + entryRev`):
  wyniki „pełne” i „same talerze” nigdy nie są porównywane jako progres lub regres.
- Wartość oporu początkowego nie musi być zapisywana: przy konwencji pełnej jest już w wpisanym ciężarze.
  Jeśli ma być pokazywana lub podpowiadana, może żyć w pozycji planu (nie w snapshocie).

## Co wymaga osobnej zgody

1. **Rozszerzenie reguły D-1 o drugą parę wyboru** dla Smitha: {`barbell_total`, `plate_loaded`},
   wyznaczaną tak samo ze słownika sprzętu (np. sprzęt `smith_machine` z `loadModels: ["barbell_total",
   "plate_loaded"]`, rola `load`). Dziś `loadModelOptions` obsługuje wyłącznie parę stos / talerze —
   celowo, bez globalnego wyjątku.
2. **Etykiety UI zależne od sprzętu**: na Smithie `plate_loaded` musi brzmieć „Same talerze — bez oporu
   początkowego”, a nie „Maszyna ładowana talerzami”.
3. **Treść atlasu** (Standaryzacja): ćwiczenia na Smithie, sprzęt `smith_machine`, karta z obowiązkową
   informacją o naklejce (AT3-D20).

## Alternatywa (gdyby oznaczenie przez `loadModel` nie zostało przyjęte)

Nowe pole snapshotu, np. `loadBasis: "total" | "added_only"`, z kolumną i CHECK w szkicu SQL i włączeniem
do klucza porównywalności. To zmiana kontraktu snapshotu v2 (AT3-D18) — wymaga zatwierdzenia.

## Ryzyka

- Mieszanie konwencji przez użytkownika (raz pełny ciężar, raz same talerze bez zmiany wyboru) — UI musi
  pytać o konwencję przy każdym wykonaniu, gdy opór jest nieznany, i nie pamiętać jej domyślnie bez
  potwierdzenia.
- Rekordy i wykresy (PE-E, PE-F) muszą pokazywać serie „same talerze” osobno.
