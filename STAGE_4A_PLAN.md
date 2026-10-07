# NEXTREP — STAGE 4A PLAN

> Stage 4A — Account, Workspace, Synchronization, Offline and PRO transition

## 1. PURPOSE

Stage 4A establishes the final foundation for:

* anonymous use
* authenticated accounts
* account-specific local workspaces
* anonymous → account migration
* local/cloud source selection
* multi-device synchronization
* offline operation
* conflict handling
* tombstones
* server-side PRO entitlement
* removal of the legacy local PRO model

The goal is not to add large new product features.

The goal is to make the existing data and account architecture safe, isolated, recoverable and synchronization-ready.

---

# 2. CURRENT STATE

Stage 4A was originally defined as a planned architectural phase.

Implementation is now underway.

Current status:

**IN PROGRESS / TESTING**

## 2.1 Stage 4A steps

Numbering below is the source of truth (same as `STAGE_STATUS.md` §10).

| Step | Area | Status | Section in this plan |
| ---- | ---- | ------ | -------------------- |
| 4A.1 | Storage / sync / auth audit | COMPLETED | — |
| 4A.2 | Account workspace isolation | COMPLETED | §4, §5 |
| 4A.3 | Account source selection | COMPLETED | §6, §17 |
| 4A.4 | Anonymous/Guest → Account migration | NOT STARTED (planned) | §7 |
| 4A.5 | Existing account + local data / merge conflicts | TESTING | §8, §13–§16 |
| 4A.6 | Offline operation | TESTING | §18–§20 |
| 4A.7 | Server PRO transition | IMPLEMENTED / TESTING (transitional) | §21, §22 |
| 4A.8 | Remove local PRO | PLANNED (local PRO still exists and must not be removed yet) | §23 |
| 4A.9 | Final regression | PLANNED (not executed) | §25–§27 |

The `Stage 4A.x` comments in `index.html` use an older, shifted numbering (most `4A.1` comments =
roadmap 4A.2, older `4A.2` comments = roadmap 4A.3; the `4A.2` comments from `f2fe328` match the
roadmap). Do not use code comments to decide the stage of a change.

4A.2 (`f2fe328`) adds to the isolation already validated earlier: deferred workspace switch while a
guest workout is open (the workout is not unmounted when an account session is recovered), queue /
session guard, `saveDataToCloud` active-workspace guard, sync timer cancellation on workspace switch,
account-local cleanup after a successful account deletion, and Supabase JS pinned to `2.117.2`.
Automated suite: 172/172 at stage close; deployed; production smoke PASS WITH NOT EXECUTED ITEMS. Stage 4A.2: COMPLETED.

4A.3 (account source selection) is COMPLETED — see §6 for the final semantics. Automated suite
268/268 at stage close, progression cross-version unexplained = 0, no Supabase schema changes.
Before-restore: CLOSED / VERIFIED (§17).

Already validated:

* account namespace isolation
* account switching isolation
* runtime state isolation
* active workout isolation
* account-scoped device identity
* account source selection (Stage 4A.3)
* before-restore (Stage 4A.3)

Currently being fixed/tested:

* offline login (Stage 4A.6)
* merge
* conflicts
* tombstones
* offline synchronization

---

# 3. CORE ARCHITECTURAL PRINCIPLES

## 3.1 Local-first

Local storage remains the immediate source for the user's active application state.

The application must remain usable without network access wherever the current product model allows it.

---

## 3.2 Cloud is a synchronized copy

Supabase is not a replacement for local state.

The target model is:

```text
LOCAL WORKSPACE
      ↓
SYNC QUEUE
      ↓
SUPABASE
      ↓
OTHER DEVICE
      ↓
LOCAL WORKSPACE
```

---

## 3.3 No whole-JSON last-write-wins

The old transitional `user_data` model stores collections as JSON.

The final sync architecture does not replace complete collections with another complete collection.

Synchronization operates on individual records.

---

## 3.4 Stable identities

Records must have stable identities.

This applies to:

* exercises
* plans
* plan items
* plan item sets
* workouts
* workout exercises
* workout sets
* measurements
* custom fields

Names are not identities.

---

## 3.5 Explicit conflicts

If two devices independently change the same logical record, the system must not silently choose one version only because it has a newer timestamp.

The conflict must be detectable and resolvable.

---

## 3.6 Tombstones

Deletion is represented explicitly.

A deleted record remains in the synchronization layer with:

* `deleted_at`
* `version`
* `updated_at`
* `device_id`

This allows other devices to receive the deletion while offline.

---

# 4. WORKSPACE MODEL (Stage 4A.2)

The local application uses separate namespaces.

```text
LOCAL STORAGE

├── anonymous workspace
│
├── user:{uuid-A}
│
└── user:{uuid-B}
```

An account must never see another account's local application state.

This includes:

* exercises
* plans
* history
* measurements
* custom fields
* username
* active workout
* draft
* editing state
* resume state
* local PRO state
* sync queue
* device identity
* account-specific backups

---

# 5. ACCOUNT SWITCHING (Stage 4A.2)

Target sequence:

```text
current workspace
      ↓
stop/await active synchronization
      ↓
save current local state
      ↓
clear previous runtime state
      ↓
switch namespace
      ↓
load target account local data
      ↓
initialize account
      ↓
start/continue synchronization
      ↓
show application
```

The application must not expose the new account until the correct namespace has been loaded.

Exception (4A.2): if an account session appears while a guest workout is open, the switch is
deferred — the workout stays open and keeps writing only to the guest workspace; the switch to the
account workspace happens after the workout is finished or interrupted, followed by a notice.

---

# 6. ACCOUNT SOURCE SELECTION (Stage 4A.3)

After authentication, NEXTREP determines:

```text
LOCAL ACCOUNT DATA?
        +
CLOUD ACCOUNT DATA?
```

Possible states:

### No local + no cloud

```text
→ start new account
```

### Local + no cloud

```text
→ use local
→ the cloud is checked again and, while still empty, the device data is uploaded
```

### No local + cloud

```text
→ load cloud
→ or start empty
```

### Local + cloud

```text
→ use local
→ load cloud
→ or start empty
```

No automatic local+cloud merge is performed merely because both datasets exist.

Merge must be deliberate.

## 6.1 Final semantics (Stage 4A.3 — COMPLETED)

After login the account:

* does not synchronise before its data source is chosen (`ready` and not `syncPaused`);
* recognises its local and cloud state (guest data never counts as account data);
* lets the user choose device / cloud / empty safely, according to the available sources;
* cloud restore takes a before-restore snapshot first; an interrupted cloud restore is resumable
  (retry, or go back to the state before it);
* the initial device → empty cloud upload is resumable; the cloud is re-checked right before it,
  own partial rows can be resumed, rows of another device stop it;
* destructive operations (cloud load, start empty) respect an active workout draft, the unsent sync
  queue and open conflicts — they are refused while any of them exists;
* source selection respects account / workspace isolation;
* operations are protected against an in-flight sync and against stale async actions.

Boundaries — 4A.3 does NOT implement:

* Guest → Account migration — Stage 4A.4 (NOT STARTED);
* local/cloud merge of two independent datasets — Stage 4A.5;
* offline login — Stage 4A.6.

4A.3 chooses ONE source; it never merges two.

---

# 7. ANONYMOUS / GUEST → ACCOUNT MIGRATION (Stage 4A.4)

This is the actual migration of guest data into an account. It is separate from account source
selection (§6, Stage 4A.3), which only chooses which of the account's own datasets to use.

Target migration:

```text
anonymous workspace
        ↓
validate
        ↓
backup
        ↓
identify authenticated account
        ↓
inspect cloud
        ↓
merge / choose source
        ↓
upload
        ↓
verify
        ↓
completed
```

Requirements:

* local data must not disappear
* account creation must not silently overwrite local data
* migration must be idempotent
* migration must be resumable
* interruption must not destroy data
* failure must preserve local data

Migration state model:

```text
not_started
in_progress
completed
failed
```

More detailed internal phases may include:

```text
validating
backing_up
merging
uploading
verifying
```

---

# 8. LOCAL + CLOUD DATA (Stage 4A.5)

When both local and cloud data exist, the final architecture must support record-level merging.

Example:

```text
DEVICE A
exercise A changed

DEVICE B
exercise B changed

          ↓

CLOUD

exercise A
exercise B
```

Different records should merge.

The same record changed independently should produce a conflict.

---

# 9. SYNC QUEUE

Queue:

`nextrep_sync_queue_v1`

Approximate structure:

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

Statuses:

* pending
* processing
* failed
* conflict

Operations:

* upsert
* delete

The queue references records rather than storing an independent second copy of the entire record.

---

# 10. SYNC ORDER

## PUSH

1. profiles
2. devices
3. exercises
4. custom_fields
5. measurements
6. plans
7. plan_items
8. plan_item_sets
9. workouts
10. workout_exercises
11. workout_sets

Technical sync state:

* `nextrep_sync_state`

## PULL

1. exercises
2. profiles
3. custom_fields
4. measurements
5. plans
6. plan_items
7. plan_item_sets
8. workouts
9. workout_exercises
10. workout_sets

---

# 11. SYNC ENGINE

Core functions:

```text
queueSyncChange()
processSyncQueue()
pullRemoteChanges()
applyRemoteChanges()
detectConflicts()
resolveConflict()
runSync()
```

Target `runSync()` sequence:

```text
1. authenticated?
2. online?
3. correct account workspace loaded?
4. ensure device
5. PUSH local changes
6. PULL remote changes
7. detect conflicts
8. apply non-conflicting remote changes
9. update sync state
10. finish
```

Synchronization must not run for the wrong account.

---

# 12. RECORD VERSIONING

Metadata is maintained per record.

Example:

```js
{
  version,
  updatedAt,
  deviceId
}
```

Versioning is record-level.

It is not one global version number for the entire account dataset.

---

# 13. CONFLICT MODEL

A conflict occurs when the same logical record has incompatible local and remote changes.

Conflict information must allow the system to identify:

* record
* table
* local version
* remote version
* local device
* remote device
* local timestamp
* remote timestamp
* reason

The system should not silently discard either version.

---

# 14. CONFLICT CENTER

Target functionality:

* list unresolved conflicts
* identify affected record
* show local version
* show remote version
* allow explicit resolution
* mark conflict resolved
* prevent repeated automatic overwrite

Possible resolution choices:

```text
KEEP LOCAL
KEEP REMOTE
```

A future richer comparison UI may be added later.

---

# 15. TOMBSTONES

Delete flow:

```text
DELETE
  ↓
hide locally
  ↓
version++
  ↓
deleted_at = now
  ↓
queue delete/tombstone
  ↓
PUSH
```

Restore flow:

```text
RESTORE
  ↓
same record ID
  ↓
version++
  ↓
deleted_at = null
  ↓
queue upsert
```

Tombstones must not be interpreted as ordinary missing records.

Absence from a pull response does not mean deletion.

---

# 16. DELETE VS UPDATE

Special conflict:

```text
DEVICE A
DELETE record

DEVICE B
UPDATE same record
```

The system must detect the situation as a conflict.

It must not silently recreate or silently delete the record without an explicit resolution strategy.

---

# 17. BEFORE-RESTORE

Current status:

**CLOSED / VERIFIED (Stage 4A.3)**

Verified by automated tests: snapshot before the destructive clear; correct account and namespace;
restore works; account / namespace mismatch blocked; interrupted restore resumable (the retry never
snapshots partial cloud data); the referenced backup is protected by the retention (also when the
device clock moved back); confirming the cloud ends the pointer's lifecycle.

Required behaviour:

```text
LOCAL ACCOUNT DATA
       ↓
capture exact snapshot
       ↓
"Wczytaj z chmury"
       ↓
cloud data loaded
       ↓
"Wczytaj z urządzenia"
       ↓
restore exact pre-cloud snapshot
```

Requirements:

* snapshot belongs to current account/workspace
* snapshot cannot be restored into another account
* cloud restore failure must preserve the snapshot
* user must be able to return to the pre-cloud state
* restore must not silently mix cloud and local datasets

---

# 18. OFFLINE LOGIN

Current status:

**OPEN / FAILED TEST — target Stage 4A.6**

Repo check (2026-10-06): logging in offline now shows the network message instead of a raw
"Failed to fetch" and stays in the login flow (covered by automated tests). When a stored session
cannot be confirmed offline, the app shows "Nie można potwierdzić sesji" and offers to continue as
guest; continuing in the account's own local workspace in that case is not implemented/confirmed.
Test H has not been repeated. Status stays OPEN.

Authentication and account initialization must be treated separately.

The application must not pretend that authentication succeeded when the server could not authenticate the user.

Target behaviour:

```text
ONLINE LOGIN
    ↓
authenticated session
    ↓
account initialization
```

For an already authenticated/recoverable session:

```text
OFFLINE
   ↓
existing local account workspace
   ↓
continue using local data
   ↓
sync later
```

If authentication itself cannot be completed:

```text
OFFLINE LOGIN
   ↓
remain in authentication flow
```

No fake authentication.

---

# 19. OFFLINE SYNC

Target behaviour:

```text
ONLINE
  ↓
local change
  ↓
queue
  ↓
sync
```

and:

```text
OFFLINE
  ↓
local change
  ↓
queue
  ↓
continue training
  ↓
ONLINE AGAIN
  ↓
process queue
  ↓
PUSH
  ↓
PULL
  ↓
merge/conflict handling
```

The user should not need to manually repeat offline actions.

---

# 20. PWA OFFLINE STARTUP

Status:

**PLANNED**

This is separate from ordinary offline operation.

A proper same-origin Service Worker will eventually allow:

* application shell caching
* startup without network
* offline loading of the PWA

Do not reintroduce the old blob-URL Service Worker.

Target:

```text
/index.html
/sw.js
/manifest.webmanifest
```

The Service Worker work happens after the current account/sync validation.

---

# 21. PRO ENTITLEMENT

Current transition:

```text
SERVER PRO
+
LEGACY LOCAL PRO
```

Target:

```text
SERVER PRO
+
SECURE OFFLINE ENTITLEMENT CACHE
```

The final application should have one access decision path:

```text
hasProAccess()
```

Server-side entitlement is the source of truth.

Local `pro=true` must not remain the authoritative entitlement.

---

# 22. PRO OFFLINE

Target behaviour is still subject to final security/product decision.

Potential model:

```text
ONLINE
  ↓
verify server entitlement
  ↓
secure entitlement cache
  ↓
OFFLINE
  ↓
temporary access according to cache policy
```

Online verification must refresh the entitlement.

A revoked PRO entitlement must eventually stop granting PRO access.

A simple unsigned localStorage flag is not sufficient.

---

# 23. REMOVE LOCAL PRO

Status:

**PLANNED**

This should happen only after:

* account isolation
* source selection
* synchronization
* offline behaviour
* server entitlement
* secure offline entitlement

are stable.

The removal must not break:

* anonymous users
* existing accounts
* legacy data
* active workouts
* account switching

---

# 24. INTEGRITY CLEANUP

Historical integrity repairs are performed separately from the main architecture work.

Rules:

1. diagnose read-only first
2. identify exact affected records
3. verify local/cloud mapping
4. create backup before destructive changes
5. use transactional soft-delete where possible
6. re-run integrity audit
7. verify no new orphan/duplicate records
8. document the repair

Do not use historical cleanup as a reason to redesign the current sync architecture.

---

# 25. TEST STRATEGY

Stage 4A uses three validation levels.

## Level 1 — automated tests

Claude verifies:

* functions
* state transitions
* queue behaviour
* account guards
* sync logic
* regression suite

## Level 2 — browser smoke tests

Verify:

* startup
* login
* account switching
* workout
* refresh
* online/offline transitions

## Level 3 — manual acceptance tests

The user performs defined scenarios on the real application.

A critical feature becomes `TESTED` only after appropriate validation.

---

# 26. CURRENT MANUAL TESTS

Important scenarios include:

### Test C

Account source selection / switching behaviour.

### Test E

Local → cloud → restore local using the pre-restore snapshot. Covered by the Stage 4A.3 automated
tests (before-restore CLOSED / VERIFIED); a manual run on production remains a check, not a blocker.

### Test H

Offline login/session behaviour.

These tests must be repeated after the current fixes.

---

# 27. STAGE 4A TEST ORDER

Current execution order:

```text
1. before-restore fix — DONE (Stage 4A.3)
2. offline login fix (Stage 4A.6)
3. Test C
4. Test E
5. Test H
6. different-record merge
7. nested merge
8. conflict detection
9. Conflict Center
10. conflict resolution
11. tombstones
12. delete vs update
13. offline sync
14. reconnect
15. integrity cleanup
16. account switching regression
17. source-selection regression
18. PWA offline startup
19. final E2E
```

---

# 28. USER RESPONSIBILITIES

The user is responsible for:

* final product decisions
* approving architectural changes
* manually testing critical flows
* confirming whether observed behaviour is acceptable
* approving completion of each stage

The user does not need to manually inspect the entire codebase.

---

# 29. CHATGPT RESPONSIBILITIES

ChatGPT is responsible for:

* architecture
* roadmap
* test design
* documentation
* code review/audit
* interpreting Claude reports
* identifying architectural risks
* preparing Claude implementation prompts
* maintaining project status

ChatGPT must not mark critical functionality as tested solely from Claude's claim.

---

# 30. CLAUDE RESPONSIBILITIES

Claude is responsible for:

* implementation
* automated tests
* debugging
* code changes
* reporting exact changes and test results

Claude should work against the repository documentation and existing architecture.

Claude should not independently redesign:

* Supabase schema
* sync architecture
* account isolation
* entitlement model
* security model

without explicit approval.

---

# 31. NEXT IMMEDIATE TASK

`before-restore` was closed in Stage 4A.3 (CLOSED / VERIFIED).

The next steps follow the roadmap: Stage 4A.4 (Guest → Account migration, NOT STARTED) and

> **Fix offline login** (Stage 4A.6).

Then repeat:

* Test C
* Test E
* Test H

Only after those pass do we continue with synchronization merge/conflict work.

---

# 32. DEFINITION OF DONE FOR STAGE 4A

Stage 4A is complete only when:

* account workspaces are isolated
* anonymous data migration is safe
* local/cloud source selection is safe
* local/cloud merge is deterministic and conflict-aware
* conflicts are visible and resolvable
* tombstones propagate correctly
* delete/update conflicts are handled
* offline changes synchronize after reconnect
* account switching is safe
* PWA can start offline
* PRO entitlement uses the server model
* legacy local PRO is removed safely
* final regression passes
* critical manual tests pass

---

# 33. STAGE 4A SUCCESS CRITERION

The central success criterion is:

> **The user can train locally, offline or online, switch accounts safely, synchronize across devices, recover from conflicts and data-source choices, and never see another account's data.**
