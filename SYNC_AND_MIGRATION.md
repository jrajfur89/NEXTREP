# NEXTREP — SYNC AND MIGRATION

## 1. Cel dokumentu

Dokument opisuje docelowy i aktualny model:

* migracji danych anonimowych do konta,
* synchronizacji lokalnej i chmurowej,
* PUSH,
* PULL,
* kolejki synchronizacji,
* konfliktów,
* tombstones,
* pracy offline,
* odtwarzania danych po zmianie źródła,
* integralności danych.

Dokument jest technicznym uzupełnieniem:

* `NEXTREP_PROJECT_STATE.md`
* `STAGE_STATUS.md`
* `STAGE_4A_PLAN.md`
* `ACCOUNT_DATA_MODEL.md`

---

# 2. Źródła danych

NEXTREP posiada trzy podstawowe warstwy danych:

```text
LOCAL DEVICE
    │
    │ localStorage
    ▼
LOCAL WORKSPACE
    │
    │ synchronization
    ▼
SUPABASE CLOUD
```

Lokalne dane są podstawowym źródłem działania aplikacji podczas:

* normalnej pracy,
* pracy offline,
* aktywnego treningu,
* oczekiwania na synchronizację.

Supabase przechowuje współdzieloną kopię danych konta.

---

# 3. Workspace

Każdy użytkownik działa w określonej przestrzeni danych.

## Anonymous workspace

```text
guest
```

Jest to przestrzeń użytkownika niezalogowanego.

## Account workspace

```text
user:{uuid}
```

W aplikacji lokalny namespace jest tworzony na podstawie identyfikatora użytkownika.

Przykładowo:

```text
guest
user_81f87def-21bb-47af-9c89-d2e54b46437f
```

Dane różnych kont nie mogą być mieszane.

---

# 4. Account isolation

Każdy account workspace posiada własne:

* dane lokalne,
* device ID,
* sync queue,
* sync metadata,
* lokalny status PRO,
* aktywny trening,
* dane ćwiczeń,
* plany,
* historię,
* pomiary,
* custom fields.

Zmiana konta musi następować w kolejności:

```text
SESSION
  ↓
ACCOUNT NAMESPACE
  ↓
LOAD ACCOUNT DATA
  ↓
INITIALIZE ACCOUNT STATE
  ↓
SHOW APP
```

Aplikacja nie może pokazać danych poprzedniego konta podczas przełączania.

Stage 4A.2 (`f2fe328`) dodatkowo:

* jeżeli w trakcie treningu gościa pojawi się sesja konta (np. odzyskana przez SDK), przełączenie
  workspace jest odroczone do zakończenia albo przerwania treningu; trening nie jest odmontowywany,
  a zapisy trafiają wyłącznie do workspace gościa,
* zmiany trafiają do kolejki sync tylko wtedy, gdy aktywny workspace należy do bieżącej sesji,
* `saveDataToCloud` wysyła wyłącznie aktywny workspace konta z sesji,
* przy każdej zmianie workspace anulowane są zaplanowane ponowienia sync i debounce,
* po skutecznym `delete_user` i wylogowaniu usuwane są lokalne dane i kopie zapasowe tylko
  usuniętego konta.

---

# 5. Account source selection po zalogowaniu (Stage 4A.3)

> Ta sekcja opisuje **wybór źródła danych konta** (Stage 4A.3), a nie migrację danych gościa.
> Właściwa migracja Guest/Anonymous → Account to osobny etap **4A.4**
> (`STAGE_4A_PLAN.md` §7, `ACCOUNT_DATA_MODEL.md` §26) i nie jest tu opisana.

Migracja danych anonimowych do konta jest osobnym procesem.

Nie wolno automatycznie wykonywać:

```text
guest data
    +
cloud account data
    =
automatic merge
```

przy pierwszym logowaniu.

Docelowy przepływ:

```text
GUEST
  ↓
LOGIN / REGISTER
  ↓
ACCOUNT WORKSPACE
  ↓
CHECK LOCAL DATA
  ↓
CHECK CLOUD DATA
  ↓
SOURCE SELECTION
  ↓
LOCAL / CLOUD / EMPTY
```

Możliwe scenariusze:

### Brak danych lokalnych + brak danych cloud

```text
→ nowe konto
```

### Dane lokalne + brak danych cloud

```text
→ można rozpocząć z danych urządzenia
→ później synchronizacja / PUSH
```

### Brak danych lokalnych + dane cloud

```text
→ można pobrać dane z cloud
```

### Dane lokalne + dane cloud

```text
→ użytkownik wybiera źródło
```

Nie wykonujemy automatycznego scalania obu źródeł.

---

# 6. Source selection (Stage 4A.3)

Obecny model posiada mechanizm wyboru źródła danych.

Główne opcje:

```text
Wczytaj z urządzenia
Wczytaj z chmury
Zacznij od pustych danych
```

Wybór źródła musi być jawny.

Aplikacja nie może po cichu zastępować lokalnego workspace danymi cloud.

---

# 7. Before-restore

Przed operacją, która może zastąpić lokalny workspace, należy wykonać snapshot stanu lokalnego.

Przykładowo:

```text
LOCAL STATE
    ↓
BEFORE-RESTORE SNAPSHOT
    ↓
CLOUD RESTORE
```

Snapshot musi być:

* związany z aktualnym kontem,
* kompletny dla zakresu operacji,
* możliwy do odtworzenia,
* niedostępny dla innego konta.

Jeżeli restore cloud zakończy się błędem:

```text
CLOUD RESTORE FAILED
        ↓
ROLLBACK
        ↓
LOCAL STATE
```

Obecnie `before-restore` wymaga dalszej implementacji i testów.

Stan repo (2026-10-06): w kodzie istnieje mechanizm before-restore (`loadAccountFromCloud` tworzy
kopię `before-restore` i wskaźnik; `resolveDeviceSnapshot` / `restoreDeviceSnapshot` odtwarzają ją
z kontrolą konta i namespace). Nie ma testów w aktualnym zestawie automatycznym, a Test E nie
został powtórzony — status pozostaje **OPEN**.

---

# 8. Logout

Wylogowanie nie może usuwać danych lokalnych konta.

Po logout:

```text
ACCOUNT A
   ↓
LOGOUT
   ↓
GUEST / AUTH SCREEN
```

Dane konta A pozostają w jego namespace.

Po ponownym zalogowaniu:

```text
LOGIN A
   ↓
user_A namespace
   ↓
LOAD LOCAL DATA
```

Dane innego konta nie mogą zostać użyte jako fallback.

---

# 9. Login

Standardowy login online:

```text
AUTH LOGIN
    ↓
SESSION
    ↓
ACCOUNT NAMESPACE
    ↓
LOCAL LOAD
    ↓
CLOUD CHECK / SYNC
    ↓
APP
```

Login nie powinien automatycznie wykonywać destrukcyjnego restore.

---

# 10. Offline login

Offline login jest osobnym problemem od offline działania aplikacji.

Jeżeli użytkownik jest już zalogowany i posiada lokalny workspace:

```text
OFFLINE
  ↓
LOCAL ACCOUNT DATA
  ↓
APP
```

może nadal działać.

Natomiast obecny przepływ ponownego logowania przy braku internetu wymaga dalszej implementacji.

Aktualny status:

```text
OPEN / FAILED TEST
```

Stan repo (2026-10-06): login offline pokazuje komunikat o braku sieci zamiast surowego
„Failed to fetch” i pozostaje w ekranie logowania (testy automatyczne). Gdy zapisanej sesji nie da
się potwierdzić offline, aplikacja pokazuje „Nie można potwierdzić sesji” i proponuje tryb gościa;
dalsza praca w lokalnym workspace konta w tej sytuacji nie jest potwierdzona. Test H nie został
powtórzony — status pozostaje **OPEN**.

Nie należy udawać sukcesu uwierzytelnienia bez odpowiedniej lokalnej sesji / mechanizmu.

---

# 11. Sync queue

Zmiany lokalne trafiają do kolejki:

```text
nextrep_sync_queue_v1
```

Model:

```js
{
  id,
  table,
  recordId,
  operation,
  version,
  deviceId,
  createdAt,
  attempts,
  status
}
```

Operacje:

```text
upsert
delete
```

Statusy:

```text
pending
processing
failed
conflict
```

Kolejka posiada deduplikację według:

```text
table + recordId
```

---

# 12. Sync metadata

Lokalne metadata synchronizacji są przechowywane osobno.

Przykład:

```js
{
  "exercise:abc": {
    version,
    updatedAt,
    deviceId
  }
}
```

Migracja istniejących danych nie powinna automatycznie tworzyć tysięcy historycznych operacji PUSH.

Dane już uznane za zsynchronizowane traktujemy jako stan bazowy.

---

# 13. PUSH

PUSH przesyła lokalne zmiany do Supabase.

Podstawowa kolejność:

```text
profiles
devices
exercises
custom_fields
measurements
plans
plan_items
plan_item_sets
workouts
workout_exercises
workout_sets
```

PUSH musi:

* respektować account isolation,
* używać właściwego `device_id`,
* respektować wersjonowanie,
* nie tworzyć niepotrzebnych duplikatów,
* zachowywać relacje pomiędzy rekordami.

---

# 14. PULL

PULL pobiera zmiany z Supabase.

Podstawowa kolejność:

```text
exercises
profiles
custom_fields
measurements
plans
plan_items
plan_item_sets
workouts
workout_exercises
workout_sets
```

PULL musi:

* działać wyłącznie dla aktualnego konta,
* zachować lokalny model danych,
* respektować tombstones,
* wykrywać konflikty,
* nie nadpisywać bezwarunkowo lokalnych zmian.

---

# 15. Synchronizacja

Docelowy przebieg:

```text
LOGIN
  ↓
ONLINE?
  ↓
DEVICE READY
  ↓
PUSH LOCAL CHANGES
  ↓
PULL REMOTE CHANGES
  ↓
CLASSIFY
  ↓
APPLY NON-CONFLICTING
  ↓
STORE CONFLICTS
  ↓
UPDATE SYNC STATE
```

Główna funkcja:

```text
runSync()
```

Powinna być odporna na wielokrotne wywołania.

Istnieje runtime lock zabezpieczający przed równoczesnym wykonaniem sync.

---

# 16. Sync runtime lock

Stan runtime lock:

```text
not_applicable
        ↓
not_started
        ↓
planning
        ↓
planned
        ↓
applying_local
        ↓
local_applied
        ↓
repairs_queued
        ↓
verifying
        ↓
completed
```

Stan:

```text
needs_review
```

może zostać ustawiony z dowolnego etapu, jeśli synchronizacja wymaga ręcznej kontroli.

PULL jest blokowany podczas krytycznej naprawy lokalnego stanu.

PUSH może być dopuszczony zależnie od aktualnego stanu naprawy.

---

# 17. Debounce

Zmiany użytkownika nie powinny powodować osobnego requestu po każdym kliknięciu.

Automatyczny zapis wykorzystuje debounce około:

```text
1–2 sekundy
```

Dzięki temu:

```text
USER CHANGES
   ↓
LOCAL SAVE
   ↓
QUEUE
   ↓
DEBOUNCE
   ↓
SYNC
```

Lokalny zapis pozostaje natychmiastowy.

---

# 18. Offline changes

Offline zmiany są wykonywane lokalnie.

Przykład:

```text
OFFLINE
  ↓
USER CHANGES WORKOUT
  ↓
LOCAL SAVE
  ↓
QUEUE PENDING
  ↓
INTERNET RETURNS
  ↓
SYNC
```

Brak internetu nie powinien blokować:

* aktywnego treningu,
* zapisu treningu,
* pracy z lokalnymi planami,
* pracy z lokalną historią.

---

# 19. Reconnect

Po odzyskaniu połączenia synchronizacja może zostać uruchomiona automatycznie.

Dodatkowe punkty uruchomienia:

* startup,
* foreground,
* odzyskanie online,
* okresowy sync.

Aktualny model nie wymaga realtime.

---

# 20. Merge różnych rekordów

Zmiany dotyczące różnych rekordów mogą być scalane.

Przykład:

```text
DEVICE A
Exercise A → edited

DEVICE B
Exercise B → edited
```

wynik:

```text
Exercise A → A
Exercise B → B
```

Nie powinno dochodzić do utraty jednej ze zmian.

---

# 21. Conflict

Konflikt występuje, gdy dwa urządzenia zmodyfikują ten sam rekord w sposób wymagający decyzji.

Przykład:

```text
DEVICE A
Exercise X
weight = 100

DEVICE B
Exercise X
weight = 110
```

Nie stosujemy automatycznie:

```text
newer wins
```

jako uniwersalnej strategii.

Konflikt trafia do conflict store.

---

# 22. Conflict Store

Konflikt powinien przechowywać informacje pozwalające porównać:

```text
LOCAL
REMOTE
```

oraz:

* rekord,
* tabelę,
* identyfikator,
* wersję,
* device ID,
* czas zmiany,
* dane lokalne,
* dane zdalne.

---

# 23. Conflict Center

Conflict Center jest miejscem ręcznego rozwiązywania konfliktów.

Docelowy model:

```text
CONFLICT
   ↓
CONFLICT CENTER
   ↓
LOCAL VERSION
REMOTE VERSION
   ↓
USER CHOICE
   ├── KEEP LOCAL
   └── KEEP REMOTE
```

Conflict Center jest obecnie elementem OPEN i wymaga finalizacji oraz testów E2E.

---

# 24. Tombstones

Usunięcie rekordu nie powinno oznaczać wyłącznie:

```js
array.filter(...)
```

w modelu synchronizowanym.

Docelowo usunięcie powinno być reprezentowane przez:

```text
deleted_at
```

czyli tombstone.

Przykład:

```js
{
  id,
  version,
  updated_at,
  deleted_at,
  device_id
}
```

Dzięki temu inne urządzenie może dowiedzieć się, że rekord został usunięty.

---

# 25. Aktualne ograniczenie tombstones

Obecny lokalny model nie posiada pełnych lokalnych tombstones dla:

* exercises,
* plans,
* plan_items,
* plan_item_sets,
* measurements,
* custom fields,
* history.

Lokalne usunięcie usuwa rekord z tablicy.

Dlatego PULL zdalnego tombstone może obecnie wymagać specjalnej obsługi.

Pełne lokalne tombstones pozostają elementem dalszego rozwoju Stage 4A.

---

# 26. Delete vs update

Szczególną sytuacją jest:

```text
DEVICE A → DELETE
DEVICE B → UPDATE
```

Nie można rozstrzygać tego wyłącznie przez:

```text
updated_at
```

Potrzebna jest jawna reguła konfliktu delete/update.

Status:

```text
OPEN
```

---

# 27. Device identity

Każde urządzenie posiada własny stabilny:

```text
device_id
```

Device ID jest używany do:

* identyfikacji źródła zmiany,
* wersjonowania,
* synchronizacji,
* diagnostyki,
* wykrywania konfliktów.

Device ID jest powiązany z kontem w:

```text
nextrep_devices
```

---

# 28. Supabase sync state

Stan synchronizacji konta/urządzenia przechowywany jest w:

```text
nextrep_sync_state
```

Najważniejsze pola:

```text
device_id
user_id
last_sync_at
last_sync_version
created_at
updated_at
```

---

# 29. Stable IDs

Rekordy synchronizowane między urządzeniami muszą posiadać stabilne identyfikatory.

Dotyczy to między innymi:

* exercises,
* plans,
* plan_items,
* plan_item_sets,
* workouts,
* workout_exercises,
* workout_sets.

Legacy identifiers mogą być zachowane przez:

```text
legacy_id
```

Nie należy generować nowych identyfikatorów przy każdym PUSH/PULL.

---

# 30. Foreign keys

Synchronizacja danych hierarchicznych musi zachować kolejność zależności.

Przykład:

```text
PLAN
  ↓
PLAN ITEM
  ↓
PLAN ITEM SET
```

oraz:

```text
WORKOUT
  ↓
WORKOUT EXERCISE
  ↓
WORKOUT SET
```

Najpierw musi istnieć rekord nadrzędny, zanim zostanie zapisany rekord zależny.

---

# 31. Historical data integrity

Dane historyczne wymagają okresowego audytu.

Audyt obejmuje między innymi:

* duplicate active records,
* parent-child integrity,
* device integrity,
* orphan records,
* tombstones,
* relacje workout → exercise → set.

Naprawy historyczne muszą być:

* audytowalne,
* transakcyjne,
* odwracalne przez backup,
* wykonywane przed kolejnymi zmianami architektury.

---

# 32. Transitional user_data

Istniejąca tabela:

```text
user_data
```

pozostaje rozwiązaniem przejściowym.

Służy do ręcznego backupu/restore dla:

* exercises,
* plans,
* history,
* measurements,
* custom fields,
* username.

Nie obejmuje:

* backups,
* Premium,
* onboarding.

Docelowa synchronizacja opiera się na tabelach:

```text
nextrep_*
```

a nie na całym JSON `user_data`.

---

# 33. PRO i synchronizacja

PRO jest obecnie uprawnieniem serwerowym.

Źródłem prawdy dla PRO jest:

```text
Supabase
```

Lokalny PRO jest rozwiązaniem przejściowym/deprecated.

Offline działanie powinno korzystać z ostatniego poprawnie znanego stanu entitlementu, bez możliwości lokalnego nadania PRO.

---

# 34. Bezpieczeństwo

Synchronizacja nigdy nie może:

* używać `service_role` w frontendzie,
* używać sekretów Supabase w frontendzie,
* omijać RLS,
* pozwalać jednemu użytkownikowi czytać danych innego użytkownika,
* mieszać namespace różnych kont,
* automatycznie nadpisywać danych bez określonej reguły.

Źródłem autoryzacji pozostaje:

```text
Supabase Auth
+
RLS
```

---

# 35. Czego nie robić

Nie należy:

* wracać do globalnego localStorage bez namespace,
* tworzyć automatycznego merge local + cloud bez decyzji architektonicznej,
* stosować globalnego last-write-wins dla całych danych,
* usuwać rekordów synchronizowanych wyłącznie przez `array.filter`,
* dodawać Service Workera bez osobnej decyzji,
* zmieniać schematu Supabase bez aktualizacji dokumentacji,
* zmieniać RLS bez testów bezpieczeństwa,
* dodawać nowej warstwy synchronizacji bez uzasadnienia,
* używać service_role w aplikacji frontendowej.

---

# 36. Aktualny status

## IMPLEMENTED

* account namespaces,
* account isolation,
* device identity,
* sync queue,
* PUSH,
* PULL,
* conflict store,
* sync runtime lock,
* different-record merge mechanism,
* account source selection,
* Supabase sync state,
* stable IDs,
* podstawowa obsługa offline changes,
* Stage 4A.2 (`f2fe328`, testy automatyczne 172/172, wdrożone; production smoke jeszcze niewykonany): odroczone
  przełączenie workspace podczas treningu gościa, strażnik kolejki/sesji, strażnik
  `saveDataToCloud`, anulowanie timerów sync przy zmianie workspace, czyszczenie lokalnych danych
  po usunięciu konta, Supabase JS przypięty do `2.117.2`.

## TESTING

* PUSH/PULL E2E,
* different-record merge,
* nested merge,
* offline sync,
* account switching,
* source selection,
* history synchronization,
* tombstone mechanism,
* device/integrity cleanup.

## OPEN

* before-restore,
* offline login,
* final conflict E2E,
* Conflict Center finalization,
* conflict resolution,
* delete vs update,
* pełne lokalne tombstones,
* pełna obsługa remote deleted records,
* final offline sync validation,
* race conditions między wieloma tabami/PWA.

## PLANNED

* PWA offline startup,
* finalizacja offline PRO cache,
* pełny final E2E Stage 4A.

---

# 37. Kolejność dalszych prac

Priorytet Stage 4A:

```text
1. before-restore
2. offline login
3. Test C
4. Test E
5. Test H
6. different-record merge
7. nested merge
8. conflict E2E
9. Conflict Center
10. conflict resolution
11. tombstones
12. delete vs update
13. offline sync/reconnect
14. integrity cleanup
15. account switching regression
16. source selection regression
17. PWA offline startup
18. final E2E
```

---

# 38. Definition of Done

Stage 4A można uznać za zakończony dopiero, gdy:

* dane różnych kont są całkowicie izolowane,
* logout/login nie miesza workspace,
* anonymous → account ma jawny i bezpieczny przepływ,
* before-restore działa,
* offline login ma poprawny UX,
* PUSH działa,
* PULL działa,
* różne rekordy scalają się poprawnie,
* konflikty są wykrywane,
* Conflict Center pozwala je rozwiązać,
* tombstones działają lokalnie i cloudowo,
* delete/update ma określoną regułę,
* offline changes synchronizują się po reconnect,
* dane historyczne są oczyszczone,
* PWA offline startup działa,
* pełny E2E regression przechodzi,
* RLS pozostaje poprawne,
* dokumentacja odpowiada rzeczywistemu kodowi.

---

# 39. Zasada końcowa

NEXTREP nie traktuje synchronizacji jako prostego:

```text
SAVE JSON → UPLOAD JSON
```

Docelowy model to:

```text
LOCAL-FIRST
    +
ACCOUNT ISOLATION
    +
RECORD-LEVEL SYNC
    +
VERSIONING
    +
TOMBSTONES
    +
CONFLICT DETECTION
    +
MANUAL CONFLICT RESOLUTION
    +
OFFLINE SUPPORT
```

Każda przyszła zmiana synchronizacji musi być zgodna z tym modelem albo wymagać osobnej decyzji architektonicznej.
