# NEXTREP — PROJECT STATE

> **Status snapshot projektu NEXTREP**
> Stan dokumentacji: październik 2026
> Ten dokument jest mapą aktualnego stanu projektu. Nie jest pełną historią zmian ani szczegółową specyfikacją każdego modułu. Szczegółowe zasady powinny znajdować się w dokumentach domenowych.

---

## 1. PROJECT IDENTITY

**NEXTREP** is a Progressive Web App (PWA) for strength training and progress tracking.

Product phrase:

> **Trenuj. Śledź. Analizuj. Progresuj.**

Main product areas:

* Dashboard
* Exercises
* Training Plans
* Active Workout
* History
* Measurements
* Cardio
* Progress analysis
* Free / PRO
* Account
* Synchronization
* NEXTREP ADMIN

Current deployment:

`https://nextrep-theta.vercel.app/`

Supabase project:

`pyhhvbqcjhpulrmqiguz`

Feedback:

`usenextrep@gmail.com`

---

# 2. SOURCE OF TRUTH

The technical source of truth is:

> **GitHub repository `jrajfur89/NEXTREP`**

Repository:

* owner: `jrajfur89`
* repository: `NEXTREP`
* repository ID: `1382713347`
* visibility: public
* default branch: `main`

Current audited commit:

4cdd354100b9211b5384b5bb184ba763c2f0e46c`

Current `index.html` SHA:

`fa43a521677f686daea27f2f9d5fb19ed416bdf4`

Current repository structure:

```text
NEXTREP/
├── index.html
├── manifest.webmanifest
├── nextrep-intro.mp4
├── icons/
├── NEXTREP_PROJECT_STATE.md
├── STAGE_STATUS.md
├── STAGE_4A_PLAN.md
├── ACCOUNT_DATA_MODEL.md
└── SYNC_AND_MIGRATION.md
```

Documentation structure is being introduced and is expected to become part of the repository source of truth.

---

# 3. COLLABORATION MODEL

```text
                         USER
                 owner / decision maker
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
         CHATGPT                  CLAUDE
       architecture              implementation
       planning                   code
       audit                      tests
       roadmap                    debugging
       decisions
              │                     │
              └──────────┬──────────┘
                         ▼
                    GITHUB
                         │
                         ▼
                      VERCEL
```

### USER

Owner of the product and final decision maker.

### CHATGPT

Responsible primarily for:

* architecture
* planning
* audits
* roadmap
* status tracking
* documentation
* test design
* identifying risks and inconsistencies
* reviewing implementation decisions

### CLAUDE

Responsible primarily for:

* implementation
* tests
* debugging
* code changes

Claude must not independently change major:

* architecture
* synchronization model
* database schema
* security model
* account isolation
* entitlement model

without an explicit decision.

### GITHUB

Technical source of truth.

### VERCEL

Deployment environment.

Core rule:

> **Czat = kontekst rozmowy.**
> **GitHub = prawda techniczna.**
> **Ty = właściciel i osoba podejmująca decyzje.**

---

# 4. CURRENT IMPLEMENTATION MODEL

NEXTREP is currently built primarily as a single `index.html` application.

Current technology includes:

* React 18.3.1
* ReactDOM
* Babel standalone
* Tailwind browser build
* lucide-react
* Supabase
* PWA manifest
* Vercel deployment

Local development:

```bash
python -m http.server 8000
```

Local URL:

`http://localhost:8000/index.html`

The current architecture prioritizes incremental development and preservation of working functionality.

---

# 5. PRODUCT STATUS

## 5.1 Exercises

**Status: IMPLEMENTED / TESTED**

NEXTREP has a canonical exercise atlas with stable exercise identities.

The atlas includes:

* strength exercises
* machine exercises
* cable exercises
* bodyweight exercises
* home exercises
* band exercises
* time-based exercises
* cardio exercises

### Cardio

**Status: IMPLEMENTED**

Cardio is already present in the exercise atlas.

It must therefore not be documented as a future feature.

Future work may expand Cardio functionality, analysis or dedicated UX, but the underlying cardio exercise atlas already exists.

---

# 6. TRAINING PLANS

**Status: IMPLEMENTED / TESTED**

Ready-made plans currently include:

* FBW — 3 levels
* Split — 3
* 5x5 — 3
* PPL — 3
* Home
* Glutes — 2
* Bands — 2
* Abs — 3

Important rules:

* 5x5 is exactly 5x5
* Home plans do not require machines, cables or barbells
* ready plans can be started without saving
* adding a ready plan to personal plans is explicit
* ready-plan days use stable plan/template identity
* old data must remain compatible

Editing ready plans uses an unsaved copy.

Cancel/system Back must not accidentally save changes.

---

# 7. ACTIVE WORKOUT

**Status: IMPLEMENTED / TESTED**

Implemented functionality includes:

* active workout
* workout timer
* rest timer
* supersets
* add exercise
* replace exercise
* finish workout
* interrupt workout
* draft persistence
* reload/process-death recovery
* Android Back protection
* confirmation dialogs
* continuous draft saving

Android Back protection:

> **Opuszczasz aktywny trening**

Options:

* Wróć do treningu
* Opuść trening

Existing tests cover active workout, timers, supersets and draft/resume behaviour.

---

# 8. PROGRESSION ENGINE

**Status: IMPLEMENTED / TESTED**

NEXTREP uses a shared progression analysis engine.

Main functions include:

* `computeExerciseAnalysis`
* `summarizePerformance`
* `comparePerformances`
* `exerciseHistoryBefore`
* `analyzeSessionExercise`
* `noteOverride`
* `computeSessionVolume`
* `buildWorkoutItem`

Progress is not defined only as adding weight.

Current progression hierarchy:

1. reps
2. execution quality / RIR
3. volume
4. stabilization of the new weight
5. consideration of increasing load

Important rules:

* heavier weight does not automatically mean progress
* RIR 0 is not automatically regression
* RIR 0 alone is not a reason to increase weight
* volume growth can represent progress without heavier load
* one weaker workout should not automatically reverse a stable trend
* analysis follows stable `exerciseId`
* maximum 10 latest comparable performances
* future data is excluded
* > 14 days is treated as a longer break
* notes can modify interpretation

Statuses include:

* PROGRES
* KONTYNUUJ NA TYM POZIOMIE
* MOŻLIWA STAGNACJA
* UTRZYMUJĄCY SIĘ SPADEK
* PUNKT ODNIESIENIA

---

# 9. FREE / PRO

## FREE

**Status: IMPLEMENTED**

Free focuses primarily on facts and information from the current workout.

## PRO

**Status: IMPLEMENTED**

PRO provides historical analysis and trend functionality, including:

* historical comparison
* comparable workouts
* exercise-level trends
* charts
* volume analysis
* progress interpretation
* recommendations

PRO analysis uses the same progression engine.

PRO chart/history limits are intentionally constrained to the latest relevant data.

---

# 10. AUTHENTICATION

**Status: IMPLEMENTED / TESTED**

Authentication uses Supabase Auth.

Implemented:

* registration
* login
* logout
* password reset
* password recovery
* account deletion
* unconfirmed-email handling
* account screen

Google login was dropped.

Account deletion uses the existing secured `delete_user()` RPC.

No service-role key is used in the frontend.

---

# 11. ACCOUNT DATA MODEL

NEXTREP supports two conceptual modes:

```text
ANONYMOUS
   │
   └── local workspace

AUTHENTICATED
   │
   ├── user workspace
   ├── synchronization
   ├── backup
   └── future multi-device functionality
```

Account isolation has become a critical architectural requirement.

Local data must never leak between:

* anonymous user
* account A
* account B

Current workspace model:

```text
LOCAL STORAGE
├── anonymous workspace
├── user:{uuid-A}
└── user:{uuid-B}
```

Each authenticated account has its own local namespace.

Device identity is also account-scoped.

---

# 12. ACCOUNT ISOLATION

**Status: TESTED / VALIDATED**

Stage 4A Step 1 has been implemented and manually validated.

> Numbering note: "Step 1" here (and `Stage 4A.1` comments in `index.html`) is the older, shifted
> numbering. In the roadmap (`STAGE_STATUS.md` §10, source of truth) this work is **4A.2 — Account
> workspace isolation**.

4A.2 hardening (`f2fe328`, deployed; production smoke pending): a guest workout is not unmounted
when an account session is recovered (deferred workspace switch + notice), queue/session guard,
`saveDataToCloud` active-workspace guard, sync timers cancelled on workspace switch, account-local
cleanup after a successful account deletion, Supabase JS pinned to `2.117.2`. Automated tests
172/172 at stage close.

Validated scenarios:

1. Guest → Account A
2. Account A → Account B
3. Account B → Account A
4. refresh
5. device ID isolation
6. unfinished workout isolation

Important result:

> A previously active workout from another account must never appear after account switching.

The application now waits for the correct account namespace/data to be loaded before exposing account data.

---

# 13. ACCOUNT SOURCE SELECTION

**Status: IMPLEMENTED / TESTING**

Stage 4A Step 2 has been implemented.

> Numbering note: "Step 2" here (and the older `Stage 4A.2` comments in `index.html`) corresponds to
> roadmap **4A.3 — Account source selection**. Anonymous/Guest → Account migration is a separate step,
> **4A.4**.

After account login, NEXTREP can distinguish:

* local account data
* cloud data
* empty account

Current intended choices include:

### Local only

Use data already stored for this account/device.

### Cloud

Download account data from Supabase.

### Empty

Start the account with empty local data.

When guest data exists, it must not be silently imported into another account.

Anonymous → account migration and deliberate local/cloud merge remain separate operations.

---

# 14. CURRENT OPEN ACCOUNT ISSUES

Two important problems remain.

## 14.1 Before-restore

**Status: OPEN / FAILED TEST**

During Test E, the expected behaviour was:

```text
local account data
       │
       ▼
capture before-restore snapshot
       │
       ▼
load cloud data
       │
       ▼
"Wczytaj z urządzenia"
       │
       ▼
restore exact pre-cloud local state
```

Current implementation did not correctly restore the pre-cloud state.

Repo check (2026-10-06): the code now contains a before-restore mechanism (`loadAccountFromCloud`,
`resolveDeviceSnapshot`, `restoreDeviceSnapshot`), but it has no tests in the current automated suite
and Test E has not been repeated. Status stays OPEN.

Required fix:

* capture pre-restore state
* bind it to the correct account/workspace
* restore it through the correct namespace
* preserve it on failure
* never restore another account's backup

---

# 15. OFFLINE LOGIN

**Status: OPEN / FAILED TEST**

Current finding:

When the application is already running and connectivity is later disabled, local training can continue.

However, logging in while offline currently results in a fetch failure instead of the intended account initialization/recovery flow.

Repo check (2026-10-06): offline login now shows the network message (no raw "Failed to fetch") and
stays in the login flow — covered by automated tests. When a stored session cannot be confirmed
offline, the app offers to continue as guest; using the account's local workspace in that case is not
confirmed. Test H has not been repeated. Status stays OPEN.

Required distinction:

```text
AUTHENTICATION
        ≠
ACCOUNT DATA INITIALIZATION
```

The application must not fake successful authentication.

If a valid existing session is recoverable locally, the app should use the account's local workspace.

If authentication itself cannot be completed offline, the user must remain in the authentication flow.

This must be handled separately from the future Service Worker work.

---

# 16. SUPABASE DATA MODEL

The target normalized Supabase schema exists.

Core tables include:

* `nextrep_profiles`
* `nextrep_devices`
* `nextrep_exercises`
* `nextrep_plans`
* `nextrep_plan_items`
* `nextrep_plan_item_sets`
* `nextrep_workouts`
* `nextrep_workout_exercises`
* `nextrep_workout_sets`
* `nextrep_custom_fields`
* `nextrep_measurements`
* `nextrep_sync_state`

Transitional table:

* `user_data`

The normalized schema should be treated as the target architecture.

Schema changes must not be made casually.

---

# 17. DATA MIGRATION

**Status: IMPLEMENTED / TESTED**

Legacy localStorage data was migrated into normalized Supabase structures.

Migration is designed to be:

* one-time
* idempotent
* validated
* resumable where applicable

Legacy IDs are preserved through `legacy_id` where the target schema supports them.

Migration also introduced:

* device identity
* record versions
* timestamps
* normalized workout identities

---

# 18. DEVICE IDENTITY

**Status: IMPLEMENTED / TESTED**

Device identity uses UUIDs.

Current architecture requires device identity to be scoped to:

```text
account + installation
```

rather than one global device identifier shared between accounts.

Device references are used by synchronization and integrity diagnostics.

---

# 19. SYNCHRONIZATION

**Status: IMPLEMENTED / TESTING**

NEXTREP uses local-first synchronization.

Principles:

* localStorage remains the immediate/offline source
* cloud is the shared synchronized copy
* offline changes remain local
* changes are queued
* synchronization happens when connectivity is available
* whole JSON last-write-wins is not used
* individual records are synchronized

Core queue:

`nextrep_sync_queue_v1`

Queue operations:

* upsert
* delete

Queue statuses:

* pending
* processing
* failed
* conflict

Core synchronization functions include:

```text
queueSyncChange()
processSyncQueue()
pullRemoteChanges()
applyRemoteChanges()
detectConflicts()
resolveConflict()
runSync()
```

---

# 20. SYNCHRONIZATION MODEL

Different records changed on different devices should merge.

Example:

```text
Device A → exercise A
Device B → exercise B

       ↓

Cloud

exercise A
exercise B
```

No whole-collection replacement should occur.

If the same record is independently modified on two devices, the system should treat it as a conflict rather than automatically selecting the newer timestamp.

Conflict resolution must be explicit.

---

# 21. TOMBSTONES

**Status: IMPLEMENTED MECHANISM / TESTING**

Remote data uses soft deletion through:

```text
deleted_at
version
updated_at
device_id
```

Initial architecture:

```text
CREATE
  → version++
  → deleted_at = null
  → queue

UPDATE
  → version++
  → updated_at
  → queue

DELETE
  → hide locally
  → version++
  → deleted_at
  → queue

RESTORE
  → same ID
  → version++
  → deleted_at = null
  → queue
```

Full delete/conflict validation is still required.

---

# 22. SYNC CONFLICTS

**Status: MECHANISM IMPLEMENTED / E2E TESTING OPEN**

Conflict storage exists:

`nextrep_sync_conflicts_v1`

Conflict resolution is intended to allow choosing between:

* local version
* remote version

The Conflict Center still requires complete accessibility and end-to-end validation.

---

# 23. HISTORICAL DATA INTEGRITY

**Status: CLEANUP IN PROGRESS**

Several historical synchronization/data issues were discovered and repaired.

Completed repairs included:

* duplicate `workout_exercises`
* duplicate `workout_sets`
* duplicate `plan_item_sets`
* duplicate `plan_items`
* orphaned plan hierarchy records
* several historical identity inconsistencies

The normalized hierarchy is currently clean for the repaired areas.

### Important historical device issue

A separate integrity investigation found historical workout records where a workout belonging to one user referenced a device belonging to another user.

The issue is concentrated around specific historical workouts.

This is being treated as:

> **historical data integrity issue, not a reason to redesign the synchronization architecture.**

Read-only diagnostics are preferred before any further repair.

---

# 24. IDENTITY / WORKOUT DATA

Historical workout data exposed an important distinction between:

* plan template/set identities
* concrete workout exercise identities
* concrete workout set identities

Concrete workout instances must have stable unique IDs.

Workout set IDs must not be reused between unrelated workouts.

The architecture now preserves:

* concrete UUID
* `detailId` for template-level relation where required

This was introduced to prevent cross-workout collisions during synchronization.

---

# 25. PWA / UPDATE MECHANISM

**Status: IMPLEMENTED / TESTED**

The previous blob-URL Service Worker approach was removed.

Current update mechanism:

* remove old Service Worker registrations/caches
* fetch `index.html` with no-cache
* compare build ID
* reload on new version
* defer reload during active workout
* sessionStorage reload lock
* startup check
* foreground check
* online-regain check
* periodic check every 30 minutes

Vercel headers:

```text
public, max-age=0, must-revalidate
```

Important:

> Do not return to the old blob-based Service Worker.

A proper same-origin `sw.js` will be introduced later for full offline PWA startup.

---

# 26. NEXTREP ADMIN

## Stage 1

**Status: IMPLEMENTED / TESTED**

Admin access is role-based.

Table:

`nextrep_user_roles`

Functions include:

* `nextrep_is_admin()`
* `nextrep_my_role()`
* `nextrep_admin_session()`

Admin access requires:

* `role = admin`
* confirmed email

The first admin is:

`usenextrep@gmail.com`

Admin identity is not determined solely by email.

No service-role key is exposed in the frontend.

---

# 27. NEXTREP ADMIN STAGE 2

**Status: IMPLEMENTED / TESTED**

Implemented:

* dashboard
* user list
* user search
* pagination
* user detail view
* role information
* account statistics
* workout statistics
* plan statistics
* exercise statistics
* measurements
* last workout
* read-only user details

Server-side functions:

* `nextrep_admin_dashboard`
* `nextrep_admin_users`
* `nextrep_admin_user_detail`

Functions verify admin privileges server-side.

---

# 28. NEXTREP ADMIN STAGE 3 — SERVER PRO

**Status: IMPLEMENTED / DEPLOYMENT VERIFICATION PENDING**

Server-side PRO entitlement model has been implemented.

Important:

> Stage 3 must not be marked DEPLOYED until manual deployment verification is completed.

Core PRO model:

`nextrep_pro_grants`

Event history:

`nextrep_pro_events`

PRO states include:

* active
* revoked
* expired

Grant sources include:

* admin
* future Stripe
* future promo
* future trial

Server functions include:

* `nextrep_my_pro()`
* `nextrep_admin_pro_status(user)`
* `nextrep_admin_grant_pro(user, expires_at, reason)`
* `nextrep_admin_revoke_pro(user, reason)`

PRO history is designed to be immutable.

User-side clients cannot grant, revoke or modify PRO access.

The frontend does not use service-role credentials.

---

# 29. CURRENT PRO TRANSITION

The project is currently in a transition between:

```text
SERVER PRO
+
LEGACY LOCAL PRO
```

The local PRO flag has not yet been removed because account-optional operation and legacy users still require compatibility.

The final target is:

```text
hasProAccess()
        │
        ├── authenticated server entitlement
        └── secure offline entitlement cache
```

A simple localStorage:

```text
pro = true
```

must not remain the final entitlement mechanism.

Removing local PRO is part of Stage 4A.

---

# 30. STAGE 4A — CURRENT STATE

Stage 4A was originally a planned architectural phase.

**Current state: IN PROGRESS / TESTING**

Implementation has already started.

Current sub-status:

| Area                         | Status                |
| ---------------------------- | --------------------- |
| Account namespace isolation  | TESTED / VALIDATED    |
| 4A.2 workspace isolation hardening (`f2fe328`) | IMPLEMENTED / TESTED (automated) / DEPLOYED — production smoke pending |
| Account source selection (4A.3) | IMPLEMENTED / TESTING |
| Anonymous/Guest → account migration (4A.4) | PLANNED / PARTIALLY IMPLEMENTED |
| before-restore               | OPEN / FAILED TEST    |
| Offline login                | OPEN / FAILED TEST    |
| Different-record merge       | TESTING               |
| Nested merge                 | TESTING               |
| Conflict detection E2E       | OPEN                  |
| Conflict Center              | OPEN                  |
| Conflict resolution          | OPEN                  |
| Tombstone full testing       | TESTING               |
| Delete vs update             | OPEN                  |
| Offline sync                 | TESTING               |
| Device/integrity cleanup     | IN PROGRESS           |
| Account switching regression | TESTING               |
| PWA offline startup          | PLANNED               |
| Final E2E                    | PLANNED               |

---

# 31. STAGE 4A — IMMEDIATE NEXT WORK

The current order is:

1. Fix `before-restore`
2. Fix offline login flow
3. Re-run Test C
4. Re-run Test E
5. Re-run Test H
6. Test merge of different records
7. Test nested merge
8. Test conflict detection E2E
9. Validate Conflict Center accessibility
10. Test conflict resolution
11. Complete tombstone/delete tests
12. Test delete-vs-update conflicts
13. Test offline synchronization and reconnect
14. Finish device/integrity cleanup
15. Run account-switching regression
16. Run source-selection regression
17. Implement proper PWA offline startup
18. Run final E2E synchronization test

No unrelated architecture changes should be introduced during this sequence.

---

# 32. STAGE 4A TARGET

The final Stage 4A architecture is intended to support:

```text
ANONYMOUS
   │
   └── FREE / local workspace

AUTHENTICATED
   │
   ├── FREE
   ├── PRO
   ├── local workspace
   ├── cloud synchronization
   ├── backup
   └── multi-device

ADMIN
   │
   └── independent role
       + FREE or PRO entitlement
```

Role and entitlement remain separate concepts.

---

# 33. ANONYMOUS → ACCOUNT

**Status: PLANNED / PARTIALLY IMPLEMENTED**

Anonymous data should never disappear simply because the user creates an account.

Target migration:

```text
anonymous workspace
        │
        ▼
validate
        │
        ▼
backup
        │
        ▼
identify account
        │
        ▼
inspect cloud
        │
        ▼
merge / choose source
        │
        ▼
upload
        │
        ▼
verify
        │
        ▼
completed
```

Migration must be:

* idempotent
* resumable
* interruption-safe
* non-destructive on failure

Failure must preserve local data.

---

# 34. OFFLINE MODEL

**Status: PARTIALLY IMPLEMENTED / TESTING**

Offline Free training should work normally.

Target:

```text
LOCAL DATA
   ↓
SYNC QUEUE
   ↓
SUPABASE
```

No second offline queue should be introduced.

The existing synchronization architecture should be extended rather than replaced.

Full offline PWA startup requires a proper same-origin Service Worker and remains future work.

---

# 35. DESIGN SYSTEM

**Status: FOUNDATIONS IMPLEMENTED / COMPONENTS IN PROGRESS**

Current design direction:

> **Google Stitch is the new primary visual design workflow.**

Figma remains useful as a backup/archive/reference, but manual Figma component construction is currently paused.

Design system source of truth will become:

`DESIGN.md`

Core visual direction:

* dark
* premium
* sport
* modern
* minimalist
* professional

Avoid:

* neon/gaming aesthetic
* excessive orange
* random colors
* inconsistent component styles

---

# 36. DESIGN TOKENS

Primary brand:

```text
#FF6A13
```

Bright:

```text
#FF7A18
```

Deep:

```text
#D94B00
```

Base background:

```text
#0B0B0C
```

Surface:

```text
#151516
#1B1C1E
```

Border:

```text
#28292D
```

Text:

```text
#FFFFFF
#A1A1A6
#686868
```

Status:

```text
success  #42C98A
warning  #E5A63A
danger   #E84B4B
```

Orange represents:

* action
* progress
* focus
* brand

It should not dominate the interface.

Approximate visual ratio:

```text
70% near-black
20–25% white/gray typography
5–10% orange
```

Typography:

**Inter**

Core sizes:

* H1 — 24px
* H2 — 18px
* Body — 14px
* Label — 11px
* Timer — 40px

Spacing:

```text
4
8
12
16
24
32
40
48
```

Radius:

```text
8
12
16
20
100
```

---

# 37. STITCH WORKFLOW

Target workflow:

```text
Design System
      ↓
basic components
      ↓
reference screen
      ↓
visual iteration
      ↓
approved direction
      ↓
additional screens
      ↓
DESIGN.md
      ↓
Claude implementation
```

The first reference screen should be:

> **HOME**

It should validate:

* colors
* typography
* spacing
* radius
* effects
* hierarchy
* premium fitness aesthetic

Only after approval should the visual system scale across the application.

---

# 38. DOCUMENTATION PLAN

The project documentation should be divided by domain rather than stored as one giant document.

Planned core documents:

```text
STAGE_STATUS.md
STAGE_4A_PLAN.md
ACCOUNT_DATA_MODEL.md
SYNC_AND_MIGRATION.md
PRO_ENTITLEMENT_MODEL.md
DESIGN.md
```

Additional domain documents:

```text
/docs
├── architecture/
├── product/
├── auth/
├── sync/
├── progression/
├── pro/
├── admin/
├── design/
└── stages/
```

Likely domain documents include:

* `PROGRESSION.md`
* `ADMIN.md`
* authentication documentation
* sync architecture
* account/workspace model
* design system

---

# 39. DOCUMENT STATUS VOCABULARY

Use the following status vocabulary consistently:

### IMPLEMENTED

Functionality exists in the codebase.

### DEPLOYED

Functionality has been deployed to the target environment.

### TESTED

Functionality has been manually/automatically verified according to the relevant test scope.

### PLANNED

Accepted future work.

### PROPOSED

Idea or direction that has not yet been finally approved.

### OPEN

Known issue or unresolved decision.

### DEPRECATED

No longer the target architecture, but may remain temporarily for compatibility.

Important rule:

> A feature is not automatically `TESTED` merely because Claude reports that tests passed.

Critical functionality requires appropriate manual validation.

---

# 40. CURRENT MAJOR RISKS

The most important current risks are:

1. account data leakage between workspaces
2. incorrect restore/source-selection behaviour
3. offline authentication/session handling
4. incomplete conflict testing
5. historical data integrity inconsistencies
6. incomplete tombstone/delete validation
7. legacy local PRO remaining too long
8. PWA offline startup not yet implemented
9. documentation lagging behind implementation

Account isolation is currently validated and therefore should remain protected from regressions.

---

# 41. ARCHITECTURAL RULES

The following decisions should be preserved:

### Local-first

Local data remains immediately usable.

### Cloud synchronization

Cloud is a synchronized shared copy, not a replacement for local state.

### No whole-JSON last-write-wins

Synchronization operates on records.

### Stable identities

Exercises, plans, workouts and nested records require stable identities.

### Explicit conflicts

The same record modified independently on multiple devices should not be silently overwritten.

### Tombstones

Deletes propagate as explicit state rather than absence.

### Account isolation

Anonymous and authenticated workspaces must never share active runtime/local data.

### Server-side PRO

Final entitlement must be derived from secure server-side state.

### No service-role frontend

Never expose Supabase `service_role` or secret keys to the browser.

### Incremental implementation

Existing working architecture should be extended rather than replaced without an explicit architectural decision.

---

# 42. WHAT MUST NOT BE DONE

Unless explicitly approved:

* do not redesign the Supabase schema
* do not replace the sync architecture
* do not introduce a second sync queue
* do not reintroduce blob-based Service Workers
* do not expose service-role credentials
* do not silently merge anonymous data into an account
* do not silently overwrite local data with cloud data
* do not silently overwrite cloud data with local data
* do not use whole-collection last-write-wins
* do not remove local PRO before the Stage 4A entitlement transition is complete
* do not mark unverified functionality as tested
* do not make broad cleanup changes during targeted integrity repairs

---

# 43. CURRENT PROJECT PRIORITY

The immediate priority is not new product functionality.

It is:

> **Finish the account/workspace + synchronization foundation safely.**

Priority order:

```text
ACCOUNT ISOLATION
      ↓
SOURCE SELECTION
      ↓
BEFORE-RESTORE
      ↓
OFFLINE LOGIN
      ↓
MERGE
      ↓
CONFLICTS
      ↓
TOMBSTONES
      ↓
OFFLINE SYNC
      ↓
INTEGRITY
      ↓
PWA OFFLINE
      ↓
FINAL E2E
```

Only after this foundation is stable should the project move into the next major architecture/product phase.

---

# 44. DOCUMENTATION PRINCIPLE

This file is a **state snapshot**.

It should answer:

> **„Gdzie jesteśmy teraz?”**

It should not attempt to contain:

* every historical test
* every SQL migration
* every implementation detail
* every Claude prompt
* every debugging session
* every old architectural decision

Those belong in the appropriate domain documents.

The repository documentation should make it possible for a new contributor or Claude session to understand:

1. what NEXTREP is,
2. what is already implemented,
3. what is tested,
4. what is currently being fixed,
5. what is planned,
6. what architectural decisions must not be broken.

---

# 45. CURRENT SNAPSHOT SUMMARY

```text
PRODUCT
├── Strength training        IMPLEMENTED
├── Cardio atlas             IMPLEMENTED
├── Exercises                IMPLEMENTED
├── Plans                    IMPLEMENTED
├── Active Workout           IMPLEMENTED
├── History                  IMPLEMENTED
├── Measurements             IMPLEMENTED
├── Progression Engine       IMPLEMENTED
├── FREE                     IMPLEMENTED
└── PRO                      IMPLEMENTED / transition

AUTH
├── Registration             IMPLEMENTED / TESTED
├── Login                    IMPLEMENTED / TESTED
├── Logout                   IMPLEMENTED
├── Password reset           IMPLEMENTED
└── Account deletion         IMPLEMENTED / TESTED

DATA
├── Target Supabase schema   IMPLEMENTED
├── Local migration          IMPLEMENTED / TESTED
├── Device IDs               IMPLEMENTED / TESTED
├── Local namespaces         TESTED / VALIDATED
└── Data integrity cleanup   IN PROGRESS

SYNC
├── Queue                    IMPLEMENTED / TESTED
├── PUSH                     IMPLEMENTED / TESTED
├── PULL                     IMPLEMENTED / TESTED
├── Merge                    TESTING
├── Conflicts                TESTING
├── Conflict Center          OPEN
├── Tombstones               TESTING
└── Offline sync             TESTING

STAGE 4A
├── Overall                  IN PROGRESS / TESTING
└── 4A.2 Workspace isolation IMPLEMENTED / TESTED / DEPLOYED — production smoke pending

ADMIN
├── Stage 1                  IMPLEMENTED / TESTED
├── Stage 2                  IMPLEMENTED / TESTED
└── Stage 3 Server PRO       IMPLEMENTED / DEPLOYMENT VERIFICATION PENDING

DESIGN
├── Foundations              IMPLEMENTED
├── Components               IN PROGRESS
├── Figma                    BACKUP / REFERENCE
├── Stitch                   NEW PRIMARY WORKFLOW
└── DESIGN.md                PLANNED

PWA
├── Update mechanism         IMPLEMENTED / TESTED
└── Full offline startup     PLANNED
```

---

# 46. NEXT IMMEDIATE ACTION

The next technical task is:

> **Stage 4A — fix `before-restore` and offline login, then repeat the affected manual tests.**

No new architecture should be introduced before those two issues are resolved and validated.

After that:

> **Continue with synchronization merge/conflict validation.**
