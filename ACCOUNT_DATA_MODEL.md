# NEXTREP — ACCOUNT DATA MODEL

## 1. Cel dokumentu

Ten dokument definiuje model danych NEXTREP związany z kontami użytkowników, lokalnym workspace, danymi w Supabase, urządzeniami oraz stanem synchronizacji.

Dokument jest punktem odniesienia dla:

* Stage 4A,
* migracji danych anonimowych do konta,
* przełączania kont,
* logout/login,
* synchronizacji lokalnych danych z Supabase,
* pracy offline,
* izolacji danych między kontami,
* modelu PRO,
* późniejszego rozwoju aplikacji na wiele urządzeń.

---

# 2. Podstawowa zasada

NEXTREP rozdziela:

1. **tożsamość użytkownika**
2. **workspace użytkownika**
3. **lokalną kopię danych**
4. **chmurową kopię danych**
5. **urządzenie**
6. **stan synchronizacji**
7. **uprawnienia PRO**

Supabase jest źródłem prawdy dla:

* konta użytkownika,
* danych współdzielonych między urządzeniami,
* uprawnienia PRO.

LocalStorage jest źródłem prawdy dla bieżącej pracy aplikacji na danym urządzeniu i umożliwia działanie offline.

Lokalna kopia nie jest osobnym kontem.

---

# 3. Workspace

NEXTREP używa modelu workspace.

Logicznie istnieją:

```text
ANONYMOUS WORKSPACE
│
├── dane lokalne użytkownika niezalogowanego
│
└── brak powiązania z auth.users

USER WORKSPACE
│
├── user:{uuid-A}
├── user:{uuid-B}
└── ...
```

Każdy zalogowany użytkownik ma własny workspace.

Workspace jest wybierany na podstawie aktualnej sesji Supabase.

---

# 4. Namespace LocalStorage

Dane lokalne są izolowane przez namespace.

Docelowy model:

```text
guest
user:{supabase_user_id}
```

W implementacji używany jest mechanizm:

```js
getLocalDataNamespace(userId)
```

oraz:

```js
getStorageKey(name)
```

`STORAGE_KEYS` korzysta z aktualnego namespace.

Przykładowo logicznie:

```text
guest → exercises
user_A → exercises
user_B → exercises
```

nie są tym samym zestawem danych.

---

# 5. Izolacja kont

Po zalogowaniu użytkownika NEXTREP musi:

1. uzyskać aktualną sesję,
2. ustalić `user_id`,
3. wybrać odpowiedni namespace,
4. załadować dane tego workspace,
5. dopiero następnie pokazać właściwy stan aplikacji.

Nie wolno:

* pokazać przez chwilę danych poprzedniego użytkownika,
* zapisać danych użytkownika A do workspace użytkownika B,
* używać poprzedniego `device_id`,
* używać poprzedniej kolejki synchronizacji,
* używać poprzedniego stanu PRO.

---

# 6. Kolejność zmiany workspace

Zmiana użytkownika jest traktowana jako operacja zmiany kontekstu aplikacji.

Minimalna kolejność:

```text
SESSION
   ↓
USER ID
   ↓
NAMESPACE
   ↓
LOAD LOCAL DATA
   ↓
SOURCE SELECTION / CLOUD CHECK
   ↓
LOAD / RESTORE
   ↓
SHOW APP
   ↓
START SYNC
```

Przy zmianie konta należy również wyczyścić runtime state, w szczególności:

* aktywny trening,
* edycję,
* szczegóły ćwiczenia,
* dialog wznowienia treningu,
* stan synchronizacji poprzedniego konta.

---

# 7. Dane lokalne

Podstawowe dane użytkownika przechowywane lokalnie obejmują:

* exercises,
* plans,
* history,
* measurements,
* custom fields,
* username,
* active workout draft,
* dane pomocnicze synchronizacji,
* kolejkę synchronizacji,
* lokalny stan urządzenia.

Dodatkowe dane techniczne mogą istnieć lokalnie, ale nie powinny być traktowane jako dane konta użytkownika bez wyraźnego przypisania.

---

# 8. Aktywny trening

Aktywny trening jest lokalnym stanem roboczym.

Musi działać:

* bez internetu,
* po chwilowej utracie połączenia,
* po przeładowaniu aplikacji,
* po wznowieniu procesu aplikacji, jeżeli przeglądarka zachowa dane lokalne.

Aktywny trening nie może zostać przypadkowo przeniesiony między kontami.

Przy zmianie workspace musi zostać zamknięty lub zapisany w odpowiednim namespace.

Stage 4A.2: jeżeli podczas treningu gościa pojawi się sesja konta (np. odzyskana przez SDK),
trening nie jest odmontowywany. Przełączenie na workspace konta jest odroczone do zakończenia lub
przerwania treningu, a do tego czasu wszystkie zapisy trafiają wyłącznie do workspace gościa.
Po przełączeniu aplikacja pokazuje komunikat o odzyskanej sesji.

---

# 9. Dane chmurowe

Docelowy model Supabase wykorzystuje osobne tabele dla poszczególnych typów danych.

## Główne tabele

```text
nextrep_profiles
nextrep_devices
nextrep_exercises
nextrep_plans
nextrep_plan_items
nextrep_plan_item_sets
nextrep_workouts
nextrep_workout_exercises
nextrep_workout_sets
nextrep_custom_fields
nextrep_measurements
nextrep_sync_state
```

Model ten zastępuje docelowo przechowywanie całego workspace jako jednego dużego obiektu JSON.

---

# 10. Profile

Tabela:

```text
nextrep_profiles
```

zawiera dane profilu użytkownika.

Aktualny model:

```text
user_id
display_name
created_at
updated_at
```

`user_id` jest powiązany z Supabase Auth.

Profil nie powinien być używany do przechowywania danych treningowych.

---

# 11. Urządzenia

Tabela:

```text
nextrep_devices
```

reprezentuje konkretne urządzenia używane przez użytkownika.

Model:

```text
id
user_id
device_name
created_at
updated_at
```

Każdy device należy do konkretnego użytkownika.

`device_id` nie może być współdzielony pomiędzy użytkownikami.

---

# 12. Dane treningowe

Dane treningowe są rozdzielone według domeny.

## Ćwiczenia

```text
nextrep_exercises
```

## Plany

```text
nextrep_plans
nextrep_plan_items
nextrep_plan_item_sets
```

## Historia treningów

```text
nextrep_workouts
nextrep_workout_exercises
nextrep_workout_sets
```

## Dane użytkownika

```text
nextrep_custom_fields
nextrep_measurements
```

Taki podział umożliwia synchronizację rekordów zamiast przesyłania całego workspace.

---

# 13. Identyfikatory rekordów

Każdy rekord synchronizowany z chmurą powinien posiadać stabilny identyfikator.

Identyfikator rekordu:

* nie powinien zmieniać się podczas synchronizacji,
* nie powinien być generowany ponownie przy każdym PUSH/PULL,
* służy do rozpoznania tego samego rekordu na różnych urządzeniach.

Dodatkowo część tabel posiada:

```text
legacy_id
```

który służy do zachowania powiązania ze starszym lokalnym modelem danych.

`legacy_id` nie zastępuje głównego UUID rekordu.

---

# 14. Wersjonowanie

Rekordy synchronizowane mogą posiadać:

```text
version
updated_at
device_id
deleted_at
```

Znaczenie:

### version

Numer wersji rekordu używany do wykrywania zmian i konfliktów.

### updated_at

Moment ostatniej zmiany rekordu.

### device_id

Urządzenie, z którego pochodzi zmiana.

### deleted_at

Informacja o logicznym usunięciu rekordu.

---

# 15. Soft delete / tombstone

Docelowa synchronizacja nie może opierać się wyłącznie na fizycznym usuwaniu rekordów.

Jeżeli rekord zostanie usunięty na jednym urządzeniu, inne urządzenie musi mieć możliwość dowiedzenia się, że został usunięty.

Dlatego używany jest mechanizm:

```text
deleted_at
```

czyli tombstone.

Przykład:

```text
REKORD A
active
   ↓
DELETE
   ↓
deleted_at = timestamp
```

Rekord może nadal istnieć w bazie, ale jest oznaczony jako usunięty.

---

# 16. Aktualne ograniczenie lokalnego modelu

Aktualny lokalny model NEXTREP nie posiada jeszcze pełnego mechanizmu tombstone dla wszystkich typów danych.

W szczególności lokalne usunięcie części danych powoduje obecnie usunięcie rekordu z tablicy.

Dotyczy to m.in.:

* exercises,
* plans,
* plan items,
* plan item sets,
* measurements,
* custom fields,
* history.

Dlatego pełna synchronizacja delete/update wymaga dalszej pracy w Stage 4A.

Do czasu zakończenia tej pracy nie należy traktować modelu tombstone jako w pełni zamkniętego.

---

# 17. Kolejka synchronizacji

Zmiany lokalne są zapisywane do kolejki:

```text
nextrep_sync_queue_v1
```

Element kolejki zawiera logicznie:

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

---

# 18. Zasada kolejki

Zmiana lokalna powinna:

1. zostać zapisana lokalnie,
2. zostać dodana do kolejki,
3. zostać wysłana do Supabase, gdy synchronizacja jest możliwa.

Brak internetu nie powinien blokować pracy użytkownika.

Nie tworzymy osobnej ścieżki danych dla offline.

Model pozostaje:

```text
LOCAL CHANGE
    ↓
LOCAL STORAGE
    ↓
SYNC QUEUE
    ↓
SUPABASE
```

---

# 19. Deduplication kolejki

Kolejka nie powinna tworzyć nieograniczonej liczby wpisów dla tego samego rekordu.

Podstawowym kluczem logicznym jest:

```text
table + recordId
```

Jeżeli rekord został zmieniony kilka razy przed synchronizacją, kolejka może zostać scalona do aktualnej operacji.

Nie może to jednak powodować utraty informacji potrzebnych do wykrycia konfliktu.

---

# 20. Sync state

Tabela:

```text
nextrep_sync_state
```

przechowuje stan synchronizacji użytkownika/urządzenia.

Aktualny model obejmuje:

```text
device_id
user_id
last_sync_at
last_sync_version
created_at
updated_at
```

Stan synchronizacji jest techniczny.

Nie jest właściwymi danymi treningowymi użytkownika.

---

# 21. PUSH

Podczas PUSH dane są wysyłane w kontrolowanej kolejności.

Aktualna kolejność:

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

Celem kolejności jest zachowanie zależności pomiędzy rekordami.

---

# 22. PULL

Podczas PULL dane są pobierane i stosowane lokalnie.

Aktualna kolejność:

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

PULL nie powinien nadpisywać bezwarunkowo lokalnych zmian.

Najpierw należy określić:

```text
remote only
local only
same
different
conflict
deleted
```

---

# 23. Konflikt

Konflikt występuje wtedy, gdy:

```text
LOCAL RECORD
        +
REMOTE RECORD
        ↓
ten sam rekord
        +
obie strony zmienione
        ↓
CONFLICT
```

NEXTREP nie powinien stosować prostego:

```text
newer wins
```

jako uniwersalnej zasady.

W przypadku konfliktu użytkownik powinien mieć możliwość świadomego wyboru danych.

---

# 24. Conflict Center

Docelowo konflikty powinny być widoczne w:

```text
Conflict Center
```

Użytkownik powinien móc porównać:

```text
DANE Z URZĄDZENIA
vs
DANE Z CHMURY
```

i wybrać właściwą wersję.

Mechanizm ten jest częścią Stage 4A i nie jest jeszcze uznany za całkowicie zamknięty.

---

# 25. Dane anonimowe

Użytkownik niezalogowany może posiadać lokalne dane.

Przykładowo:

```text
guest workspace
├── exercises
├── plans
├── history
├── measurements
└── custom fields
```

Dane te nie są automatycznie przypisane do konta tylko dlatego, że użytkownik później się zaloguje.

---

# 26. Anonymous / Guest → Account (Stage 4A.4)

Migracja danych anonimowych do konta jest osobną operacją.

Nie może polegać na:

```text
login
→ delete guest data
→ load account
```

Prawidłowy kierunek:

```text
GUEST DATA
   ↓
VALIDATE
   ↓
BACKUP
   ↓
IDENTIFY ACCOUNT
   ↓
CHECK CLOUD
   ↓
MERGE / SELECT SOURCE
   ↓
UPLOAD
   ↓
VERIFY
   ↓
ACCOUNT WORKSPACE
```

Migracja musi być możliwie:

* idempotentna,
* resumowalna,
* odporna na przerwanie,
* bezpieczna przy błędzie.

Błąd migracji nie może prowadzić do utraty lokalnych danych.

---

# 27. Istniejące konto + lokalne dane (Stage 4A.5)

Jeżeli użytkownik loguje się na istniejące konto i na urządzeniu istnieją lokalne dane, NEXTREP nie powinien automatycznie scalać danych bez jasnej decyzji.

Możliwe źródła:

```text
DANE Z URZĄDZENIA
DANE Z CHMURY
```

Użytkownik może otrzymać możliwość:

```text
Wczytaj z urządzenia
Wczytaj z chmury
Połącz dane
```

Automatyczne połączenie nie jest domyślną operacją.

---

# 28. Before-restore (Stage 4A.3)

Przed operacją:

```text
Wczytaj z chmury
```

lokalny stan musi zostać zachowany jako dokładny snapshot.

Snapshot musi być:

* związany z właściwym workspace,
* możliwy do przywrócenia,
* odporny na błąd operacji cloud restore.

Jeżeli cloud restore zakończy się błędem, lokalny stan powinien zostać odtworzony.

Nie wolno przywrócić snapshotu należącego do innego konta.

Status: **OPEN**. Mechanizm istnieje w kodzie (`loadAccountFromCloud`, `resolveDeviceSnapshot`,
`restoreDeviceSnapshot`), ale nie ma testów w aktualnym zestawie, a Test E nie został powtórzony.

---

# 29. Logout

Logout oznacza zakończenie aktualnej sesji użytkownika.

Przed wylogowaniem NEXTREP powinien:

1. zapisać lokalny stan,
2. zakończyć lub zatrzymać synchronizację,
3. wyczyścić runtime poprzedniego konta,
4. zakończyć kontekst użytkownika,
5. przejść do workspace anonimowego lub ekranu logowania zgodnie z aktualnym flow aplikacji.

Dane użytkownika nie są usuwane z LocalStorage tylko dlatego, że użytkownik się wylogował.

Usunięcie konta (Stage 4A.2) różni się od logout: dopiero po skutecznym `delete_user` i
wylogowaniu NEXTREP usuwa lokalny workspace usuniętego konta (dane, kolejkę i metadane sync,
marker inicjalizacji, wskaźnik restore, device ID, statusy migracji) oraz jego kopie zapasowe.
Workspace gościa, inne konta i ich kopie oraz klucze urządzenia (onboarding) pozostają.
Błąd `delete_user` nie usuwa niczego lokalnie.

---

# 30. Ponowne logowanie

Po ponownym logowaniu:

```text
AUTH SESSION
    ↓
USER ID
    ↓
USER NAMESPACE
    ↓
LOCAL DATA
    ↓
SOURCE SELECTION
    ↓
SYNC
```

NEXTREP powinien rozpoznać istniejący workspace zamiast tworzyć nowy.

---

# 31. Offline

Offline jest właściwością workspace, a nie osobnym trybem danych.

Użytkownik może:

* otworzyć aplikację,
* rozpocząć trening,
* wykonać trening,
* edytować plan,
* zmieniać ćwiczenia,
* zapisywać historię,

bez aktywnego połączenia, o ile dane wymagane do wykonania operacji są już lokalnie dostępne.

Zmiany oczekują wtedy w kolejce synchronizacji.

---

# 32. Offline login

Offline login jest osobnym problemem od offline pracy już zalogowanego użytkownika.

Nie wolno udawać, że Supabase Auth potwierdził login, jeżeli nie ma połączenia z serwerem.

Docelowy flow offline musi rozróżniać:

```text
AUTHENTICATION
vs
ACCOUNT INITIALIZATION
vs
OFFLINE WORKSPACE
```

Aktualny problem:

```text
login offline
→ failed to fetch
```

jest nadal OPEN.

Stan repo (2026-10-06): surowy „Failed to fetch” został zastąpiony komunikatem o braku sieci, a
użytkownik pozostaje w ekranie logowania (testy automatyczne). Nie jest potwierdzone, że przy
niepotwierdzonej sesji offline można pracować w lokalnym workspace konta (aplikacja proponuje tryb
gościa). Test H nie został powtórzony, dlatego status pozostaje OPEN.

---

# 33. PRO

PRO jest uprawnieniem konta.

Docelowo:

```text
ACCOUNT
   ↓
SERVER ENTITLEMENT
   ↓
FREE / PRO
```

Źródłem prawdy dla PRO jest Supabase.

Lokalny zapis:

```text
pro = true
```

nie może być traktowany jako autorytatywne źródło uprawnienia.

Aktualny lokalny PRO jest mechanizmem przejściowym i ma zostać usunięty w Stage 4A.

Szczegółowy model PRO jest opisany osobno w:

```text
PRO_ENTITLEMENT_MODEL.md
```

---

# 34. Backup

Backup lokalny jest mechanizmem bezpieczeństwa.

Nie jest częścią synchronizacji.

Backup:

* nie jest źródłem prawdy konta,
* nie jest automatycznie synchronizowany z Supabase,
* może być używany do ręcznego odzyskania danych,
* powinien być powiązany z właściwym workspace, jeżeli zawiera dane użytkownika.

Istniejący system lokalnych backupów pozostaje oddzielony od sync engine.

---

# 35. Transitional `user_data`

Tabela:

```text
user_data
```

jest rozwiązaniem przejściowym.

Przechowuje cały zestaw wybranych danych jako JSON:

```text
exercises
plans
history
measurements
custom fields
username
```

Nie obejmuje m.in.:

* backupów,
* Premium/PRO,
* onboardingu.

Mechanizm ten był używany do ręcznego cloud save/fetch/restore.

Docelowa architektura synchronizacji korzysta z osobnych tabel NEXTREP.

`user_data` nie powinno być dalej rozwijane jako główny model danych.

---

# 36. RLS i izolacja Supabase

Każdy rekord należący do użytkownika musi być chroniony przez Supabase RLS.

Podstawowa zasada:

```text
auth.uid()
    =
owner/user_id rekordu
```

Użytkownik A nie może:

* odczytać danych użytkownika B,
* zmienić danych użytkownika B,
* usunąć danych użytkownika B,
* użyć urządzenia użytkownika B,
* użyć kolejki użytkownika B.

Izolacja lokalna i izolacja Supabase muszą działać jednocześnie.

---

# 37. Model całościowy

Docelowy model NEXTREP:

```text
                 SUPABASE AUTH
                      │
                      ▼
                  USER UUID
                      │
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
     USER WORKSPACE          PRO ENTITLEMENT
          │                       │
          │                       └── FREE / PRO
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
 LOCAL COPY   CLOUD COPY
    │           │
    │           │
    ▼           ▼
SYNC QUEUE   SUPABASE TABLES
    │
    ▼
 DEVICE
```

---

# 38. Najważniejsze zasady architektoniczne

### Zasada 1 — konto nie jest LocalStorage

LocalStorage jest lokalną kopią workspace.

### Zasada 2 — logout nie usuwa danych

Wylogowanie zmienia kontekst użytkownika.

### Zasada 3 — konto A i B są całkowicie izolowane

Dotyczy to zarówno runtime, LocalStorage, device identity, kolejki, jak i Supabase.

### Zasada 4 — offline nie tworzy drugiego modelu danych

Offline korzysta z lokalnego workspace i kolejki.

### Zasada 5 — synchronizacja działa na rekordach

Nie synchronizujemy całego workspace jako jednego JSON-a.

### Zasada 6 — konflikt nie oznacza automatycznego zwycięstwa nowszego rekordu

Konflikt wymaga świadomej obsługi.

### Zasada 7 — usunięcie musi być synchronizowalne

Docelowo delete wymaga tombstone.

### Zasada 8 — PRO pochodzi z serwera

LocalStorage nie jest źródłem prawdy dla entitlement.

### Zasada 9 — migracja nie może powodować utraty danych

Anonymous → account oraz restore muszą być bezpieczne przy błędzie.

### Zasada 10 — GitHub jest źródłem prawdy technicznej

Kod i dokumentacja w repozytorium są nadrzędne wobec opisów znajdujących się wyłącznie w rozmowie.

---

# 39. Status modelu

## IMPLEMENTED

* namespace kont,
* izolacja kont,
* device identity,
* docelowe tabele Supabase,
* RLS,
* podstawowy sync queue,
* PUSH,
* PULL,
* conflict store,
* account source selection,
* Stage 4A.2 (`f2fe328`): odroczone przełączenie workspace podczas treningu gościa, strażnik
  kolejki/sesji i `saveDataToCloud`, anulowanie timerów sync przy zmianie workspace, czyszczenie
  lokalnych danych po usunięciu konta (testy automatyczne 172/172; production smoke jeszcze
  niewykonany).

## TESTED

* izolacja kont,
* zmiana workspace,
* device identity,
* podstawowe PUSH/PULL,
* różne rekordy na różnych urządzeniach,
* część scenariuszy konfliktowych.

## OPEN

* before-restore,
* offline login,
* pełne tombstones po stronie lokalnej,
* pełna obsługa offline sync,
* Conflict Center,
* finalna obsługa konfliktów,

## PLANNED

* pełny offline startup PWA,
* finalizacja modelu offline PRO,
* dalsze testy wielourządzeniowe.

---

# 40. Relacja z innymi dokumentami

Ten dokument definiuje **model danych i workspace**.

Powiązane dokumenty:

```text
NEXTREP_PROJECT_STATE.md
        ↓
STAGE_STATUS.md
        ↓
STAGE_4A_PLAN.md
        ↓
ACCOUNT_DATA_MODEL.md
        ↓
SYNC_AND_MIGRATION.md
        ↓
PRO_ENTITLEMENT_MODEL.md
```

`ACCOUNT_DATA_MODEL.md` nie opisuje szczegółowej implementacji każdego mechanizmu synchronizacji.

Szczegółowe reguły migracji, PUSH, PULL, konfliktów, tombstones i offline sync powinny znajdować się w:

```text
SYNC_AND_MIGRATION.md
```

---

# 41. Definition of Done dla modelu konta

Model konta można uznać za zamknięty dopiero wtedy, gdy:

* każdy workspace jest jednoznacznie identyfikowany,
* konta są izolowane lokalnie,
* konta są izolowane w Supabase,
* device identity jest izolowane,
* logout nie powoduje utraty danych,
* account switching nie miesza danych,
* anonymous → account jest bezpieczne,
* before-restore działa,
* offline działa,
* offline login ma jasno zdefiniowany i przetestowany flow,
* synchronizacja nie powoduje utraty danych,
* konflikty są obsługiwane,
* delete/update jest synchronizowalne,
* PRO nie zależy od prostego lokalnego `pro=true`,
* pełny E2E Stage 4A przechodzi.

---

# 42. Aktualny priorytet

Najbliższe prace nie polegają na zmianie podstawowego modelu danych.

Priorytetem jest dokończenie istniejącej architektury:

```text
BEFORE-RESTORE
      ↓
OFFLINE LOGIN
      ↓
SOURCE SELECTION TESTS
      ↓
MERGE / CONFLICT
      ↓
TOMBSTONES
      ↓
OFFLINE SYNC
      ↓
INTEGRITY
      ↓
PWA OFFLINE STARTUP
      ↓
FINAL E2E
```

Nie należy w tym momencie wprowadzać nowego modelu synchronizacji ani zmieniać schematu Supabase bez osobnej decyzji architektonicznej.
