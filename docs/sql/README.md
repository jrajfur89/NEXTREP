# NEXTREP 4A.4 / F-5 — SQL serwera i instrukcja wdrożenia

> **Status: NIE WDROŻONE NA PRODUKCJĘ.** Wdrożenie wymaga osobnej, wyraźnej zgody właściciela projektu.
> Ten katalog przechowuje dokładnie te pliki, które przetestowano na `nextrep-f5-test`. Nagłówki plików
> („DRAFT — DO NOT RUN ON SUPABASE”, „PROPOSAL”) zostały celowo pozostawione bez zmian, żeby nie zmieniać
> sum kontrolnych. Warunki uruchomienia opisuje **ten README**, nie nagłówki.

## 1. Pliki

| Plik | Co robi | SHA-256 |
|---|---|---|
| `nextrep_migration_attempts_4a4_DRAFT_v3.sql` | **SQL v3**: tabela `nextrep_migration_attempts`, trigger strażnika przejść, 7 funkcji RPC (`start / resume / complete / abandon / cancel / accept_incomplete / touch`), trigger blokady zapisu na 10 tabelach danych | `f00d517a7f4ff008cddc8c82f57a6004bd642a45b321ae9bf4eacbe7f51856c7` |
| `nextrep_migration_pre_request_4a4_PROPOSAL.sql` | **C v2**: schemat `nextrep_internal` + funkcja `nextrep_internal.nextrep_pre_request()` (blokada odczytu GET/HEAD 10 tabel przy próbie `uploading` / `abandoned`). Aktywacja jest w komentarzu — patrz krok 4 | `e1e9564718f6bddb0a97a70efc960315599f249cb51e09ee695485a33e55ff29` |
| `nextrep_migration_read_guard_rls_4a4_v1.sql` | **RLS v1 (wariant A, Etap 11)**: funkcja `nextrep_internal.nextrep_migration_read_allowed()` + 10 restrykcyjnych polityk SELECT `nextrep_migration_read_guard` — blokada odczytu także przez osadzone relacje (embed, zagnieżdżenie, `count`, `return=representation`) | `7562fea00cef14e36c1c2945de7e0dd915c08b0d22618f0dfa79d75da217d001` |
| `nextrep_migration_read_guard_rls_4a4_v1_rollback.sql` | Rollback RLS v1 (usuwa tylko 10 polityk i ich funkcję) | `73ba0ecd16190b13b8c259f0446fc23b361c28a737f2a09bfd1eb51a20baad22` |

Sprawdzenie na Windows (PowerShell): `Get-FileHash .\docs\sql\<plik> -Algorithm SHA256`
Linux / macOS: `sha256sum docs/sql/*.sql`

Sumy dotyczą plików z końcami linii LF (tak jak są w repozytorium). Jeśli Git na Windows ma `core.autocrlf=true`,
plik w katalogu roboczym dostanie CRLF i hash będzie inny — wtedy sprawdź wersję z repozytorium:
`git show HEAD:docs/sql/<plik> > $env:TEMP\f.sql; Get-FileHash $env:TEMP\f.sql -Algorithm SHA256`
(do edytora SQL wklejaj treść z tej wersji; różnica CRLF/LF nie zmienia działania SQL).

**Zgodność z testem.** Po usunięciu komentarzy, białych znaków oraz `begin;`/`commit;` treść plików jest identyczna
z migracjami zastosowanymi na `nextrep-f5-test` (md5 po normalizacji):

| Plik | Migracja na teście | md5 (znormalizowane) |
|---|---|---|
| v3 | `20261008154808 f5_sql_v3` | `89d51f6b6b3672801c27af2f003c5329` |
| C v2 + 2 linie aktywacji | `20261008160623 f5_pre_request_v2_internal_schema` | `340a140415c085d4f5e425a7f6386284` |

**Nie wdrażać:** wariantu A (`nextrep_migration_read_guard_4a4_PROPOSAL.sql`, poza repozytorium), funkcji
`public.nextrep_pre_request()` (v1 — pozostałość na teście, wywoływalna z zewnątrz), rozszerzenia `http` ani schematu `f5t`
(narzędzia testowe).

## 2. Wymagania wstępne (NO-GO, jeśli któreś nie jest spełnione)

1. Zgoda właściciela na wdrożenie produkcyjne.
2. **Kopia zapasowa produkcji** wykonana i sprawdzona (panel Supabase → Database → Backups lub `supabase db dump`
   schematu i danych). Zapisz datę i miejsce przechowywania.
3. Klient produkcyjny = obecny `main` (stary klient). **Nowy klient wdrażany dopiero po SQL** — nowy klient bez tabeli
   `nextrep_migration_attempts` wstrzymuje synchronizację wszystkim kontom („nie udało się sprawdzić”).
4. Zanotowany identyfikator obecnego wdrożenia Vercel (do szybkiego przywrócenia).
5. Okno bez aktywności użytkowników.
6. Stan wyjściowy zapisany (zapytanie 5a).

## 3. Uprawnienia

* Wykonywane jako rola `postgres` (edytor SQL w panelu Supabase). `postgres` może `alter role authenticator set pgrst.*`
  — potwierdzone na `nextrep-f5-test` (migracja `20261008160623`).
* Klucz `service_role` nie jest potrzebny i nie może trafić do przeglądarki.
* Po wdrożeniu: RPC migracji — `authenticated` (bez `anon`); funkcje pomocnicze i trigger — tylko `postgres` / `service_role`;
  `nextrep_internal.nextrep_pre_request()` — `anon`, `authenticated`, `service_role` (PostgREST wywołuje ją jako rolę żądania;
  schemat `nextrep_internal` nie jest wystawiony przez Data API).

## 4. Kolejność wykonania

| Krok | Działanie | Punkt przerwania |
|---|---|---|
| 1 | W edytorze SQL wpisz najpierw `set lock_timeout = '5s'; set statement_timeout = '60s';`, potem wklej **całą** treść pliku v3 i uruchom (plik ma własne `begin; … commit;`). | Każdy błąd → transakcja wycofana, STOP. |
| 2 | Weryfikacja v3 (zapytania 5b–5d). Stary klient: zapis i odczyt treningu na koncie właściciela działa. | Brak triggera / zła ACL / błąd zapisu → STOP, rollback R3/R4. |
| 3 | Wklej treść pliku C v2 (bez linii aktywacji — są w komentarzu) i uruchom. | Błąd → STOP. |
| 4 | Aktywacja (osobne, świadome polecenie): `alter role authenticator set pgrst.db_pre_request = 'nextrep_internal.nextrep_pre_request';` `notify pgrst, 'reload config';` | — |
| 4b | Wklej całą treść pliku RLS v1 (`nextrep_migration_read_guard_rls_4a4_v1.sql`, z `set lock_timeout = '5s';` przed nim) i uruchom. Kontrola: 10 polityk `nextrep_migration_read_guard` (RESTRICTIVE, SELECT), funkcja w `nextrep_internal` z ACL `postgres, authenticated, service_role`. | Błąd → STOP; po wykonaniu jakikolwiek błąd odczytu konta bez próby → R2b. |
| 5 | Testy 5e (dostępność, bezpieczeństwo). | Jakikolwiek błąd GET bez aktywnej próby → **natychmiast R2**. |
| 6 | Dopiero teraz: merge klienta i deploy (osobna zgoda), testy smoke na koncie testowym, monitoring. | Kryteria przerwania z sekcji 7. |

## 5. Zapytania kontrolne

```sql
-- 5a stan wyjściowy (przed krokiem 1)
select rolconfig from pg_roles where rolname = 'authenticator';               -- nie może zawierać pgrst.db_pre_request
select to_regclass('public.nextrep_migration_attempts');                      -- null
select 'exercises', count(*) from public.nextrep_exercises union all select 'plans', count(*) from public.nextrep_plans
union all select 'plan_items', count(*) from public.nextrep_plan_items union all select 'plan_item_sets', count(*) from public.nextrep_plan_item_sets
union all select 'workouts', count(*) from public.nextrep_workouts union all select 'workout_exercises', count(*) from public.nextrep_workout_exercises
union all select 'workout_sets', count(*) from public.nextrep_workout_sets union all select 'measurements', count(*) from public.nextrep_measurements
union all select 'custom_fields', count(*) from public.nextrep_custom_fields union all select 'profiles', count(*) from public.nextrep_profiles;

-- 5b dokładnie 10 triggerów blokady
select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where t.tgname = 'nextrep_migration_write_lock' and not t.tgisinternal order by 1;                    -- 10 wierszy

-- 5c uprawnienia funkcji
select p.proname, p.prosecdef, array_to_string(p.proacl, ',') from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and (p.proname like 'nextrep_migration%' or p.proname = 'nextrep_request_migration_attempt') order by 1;
-- RPC: authenticated + service_role, bez anon; lock_key / request_migration_attempt / attempts_guard / write_lock: bez anon i authenticated

-- 5d tabela pusta, RLS włączone, bez uprawnień zapisu dla klientów
select count(*) from public.nextrep_migration_attempts;                                               -- 0
select has_table_privilege('authenticated', 'public.nextrep_migration_attempts', 'insert'),
       has_table_privilege('authenticated', 'public.nextrep_migration_attempts', 'update'),
       has_table_privilege('anon', 'public.nextrep_migration_attempts', 'select');                   -- false, false, false

-- 5e po aktywacji pre-requestu
select rolconfig from pg_roles where rolname = 'authenticator';               -- zawiera pgrst.db_pre_request=nextrep_internal.nextrep_pre_request
```

Testy 5e przez aplikację / przeglądarkę (stary klient):
* GET każdej z 10 tabel → 200; `POST rpc/nextrep_my_role`, `POST rpc/nextrep_my_pro` → 200; logowanie działa.
* `GET /rest/v1/rpc/nextrep_pre_request` → 404 (funkcja niewidoczna z zewnątrz).
* Po RLS v1 (krok 4b): `GET /rest/v1/nextrep_devices?select=id,nextrep_workouts(id)` → 200 dla konta bez próby; na koncie testowym
  z otwartą próbą (`start` przez RPC) → 400 / NR001; po `cancel` → znowu 200. `POST /rest/v1/rpc/nextrep_migration_read_allowed` → 404.
* Na dedykowanym koncie testowym: `rpc/nextrep_migration_attempt_start` → GET danych z innego „urządzenia” → 400 / NR001;
  `rpc/nextrep_migration_attempt_cancel` (0 zapisów) → GET → 200.

## 6. Rollback (zawsze w tej kolejności)

| Poziom | Działanie | Skutek |
|---|---|---|
| R1 klient | Vercel → przywróć poprzednie wdrożenie | Stary klient; jeśli zostały próby `uploading` / `abandoned`, ich konta mają nadal zablokowane zapisy → R3 |
| R2b polityki RLS v1 | plik `nextrep_migration_read_guard_rls_4a4_v1_rollback.sql` | Usuwa tylko 10 polityk i funkcję; natychmiastowe, bez danych; v3 i C v2 bez zmian |
| R2 pre-request | `alter role authenticator reset pgrst.db_pre_request;` `notify pgrst, 'reload config';` → sprawdź 5e | Odczyty bez blokady; natychmiastowe, bez danych. Działa także przy niedziałającym Data API (edytor SQL nie korzysta z PostgREST). Jeśli konfiguracja się nie przeładuje: restart projektu w panelu |
| R3 odblokowanie zapisów | `drop trigger if exists nextrep_migration_write_lock on public.<tabela>;` dla 10 tabel | Zapisy bez blokady; **tabela prób zostaje** (trwała informacja o `accepted_incomplete`) |
| R4 pełne | Najpierw eksport `select * from public.nextrep_migration_attempts` do CSV, potem blok „Rollback” z końca pliku v3 i `drop function nextrep_internal.nextrep_pre_request(); drop schema nextrep_internal;` | Utrata historii prób; tylko z osobną decyzją |

**R4 (usunięcie tabeli prób) tylko po R2b** — funkcja polityk RLS v1 odwołuje się do tabeli prób w treści plpgsql (Postgres nie
zapisuje tej zależności); tabela usunięta przy istniejących politykach = każdy odczyt 10 tabel kończy się błędem dla wszystkich.
Schemat `nextrep_internal` (rollback C v2) można usunąć dopiero po R2b (zawiera funkcję polityk).
Nigdy nie usuwaj funkcji pre-request, zanim R2 nie zostanie wykonane i zweryfikowane — skonfigurowana, a nieistniejąca funkcja wyłącza całe Data API.
Nie cofaj SQL (R3/R4), gdy działa nowy klient — najpierw R1.

## 7. Monitoring i kryteria przerwania (pierwsze 72 h)

```sql
select status, count(*) from public.nextrep_migration_attempts group by 1;
select attempt_id, user_id, status, writes_count, updated_at from public.nextrep_migration_attempts
 where status in ('uploading', 'abandoned') and updated_at < now() - interval '1 hour';
```
Logi Postgres: `NR001`, `NR002`, `23502` (NOT NULL). Logi API: 4xx / 5xx na `/rest/v1/nextrep_*`.

Przerwij i wycofaj (R1 → R2 → R3), gdy: jakikolwiek 5xx na Data API; NR001 na koncie bez próby; nieudane usunięcie konta;
próba `uploading` / `abandoned` bez wyjaśnienia.

## 8. Otwarte sprawy przed wdrożeniem (stan: Etap 11)

* Pozycje planów bez `restSeconds` / sumy treningu bez wartości → **poprawione w kliencie (Etap 11)**: kolumny NOT NULL z
  wartością domyślną są pomijane zamiast wysyłania `null` (INSERT → domyślna, UPDATE → wartość w chmurze zostaje), liczby
  całkowite zaokrąglane, przecinek dziesiętny czytany; nienaprawialne dane (brak / zła data pomiaru lub treningu, liczba
  poza zakresem) zatrzymują start i wznowienie przed pierwszym zapisem.
* Odczyt przez osadzone relacje → **RLS v1 (Etap 11)**, przetestowane na `nextrep-f5-test` i lokalnie (PostgREST 13.0.7).
* Ciężar z przecinkiem („62,5”) trafia do chmury jako `null` (stary i nowy klient, sync i V1) — NIE poprawione: zmiana
  zmieniłaby porównanie sync i mogłaby nadpisać lokalne dane wartością z chmury; wymaga osobnego projektu.

## 9. Test parzystości z produkcją (Etap 10 / B2)

Na `nextrep-f5-test` odtworzono obiekty istniejące tylko na produkcji (`delete_user`, `nextrep_user_roles` + trigger na
`auth.users`, funkcje roli / PRO / admina, `nextrep_pro_grants`, `nextrep_pro_events` z triggerami, `user_data`) — migracja
`e10_prod_parity_deps`. Definicje odczytane z katalogów produkcji; po zastosowaniu treść 16 funkcji (md5 bez białych znaków),
właściciel, ACL i `search_path` oraz kolumny, ograniczenia, indeksy, polityki, uprawnienia i triggery 4 tabel są identyczne
z produkcją. Bez kopiowania danych. Wyniki testów: raport Etapu 10.
