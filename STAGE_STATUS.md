# NEXTREP — STAGE STATUS

> Centralna tablica statusu projektu NEXTREP.
> Szczegółowe zasady i specyfikacje znajdują się w dokumentach domenowych.

## Status vocabulary

* **IMPLEMENTED** — funkcjonalność istnieje w kodzie.
* **DEPLOYED** — funkcjonalność została wdrożona na środowisko docelowe.
* **TESTED** — funkcjonalność została zweryfikowana odpowiednimi testami.
* **PLANNED** — zaakceptowana praca na przyszłość.
* **PROPOSED** — propozycja, która nie została jeszcze ostatecznie zatwierdzona.
* **OPEN** — znany problem lub nierozstrzygnięta kwestia.
* **DEPRECATED** — rozwiązanie nie jest już docelową architekturą, ale może pozostać dla kompatybilności.

> **Important:** Claude's test report alone does not automatically change a status to TESTED. Critical functionality requires appropriate manual validation.

---

# 1. PROJECT FOUNDATION

| Area                        | Status      | Notes                                    |
| --------------------------- | ----------- | ---------------------------------------- |
| NEXTREP PWA                 | IMPLEMENTED | Main application is operational          |
| GitHub source of truth      | IMPLEMENTED | `jrajfur89/NEXTREP`                      |
| Vercel deployment           | DEPLOYED    | Current production deployment exists     |
| Local development server    | IMPLEMENTED | Python HTTP server                       |
| Project state documentation | IMPLEMENTED | `NEXTREP_PROJECT_STATE.md`               |
| Domain documentation        | IN PROGRESS | Documentation structure being introduced |

---

# 2. PRODUCT

| Area                 | Status                   | Notes                                                   |
| -------------------- | ------------------------ | ------------------------------------------------------- |
| Dashboard            | IMPLEMENTED              |                                                         |
| Exercises            | IMPLEMENTED              | Canonical exercise atlas                                |
| Cardio atlas         | IMPLEMENTED              | Cardio already exists in the exercise atlas             |
| Training Plans       | IMPLEMENTED              |                                                         |
| Active Workout       | IMPLEMENTED              |                                                         |
| History              | IMPLEMENTED              |                                                         |
| Measurements         | IMPLEMENTED              |                                                         |
| Progression analysis | IMPLEMENTED              | Shared progression engine                               |
| FREE                 | IMPLEMENTED              |                                                         |
| PRO                  | IMPLEMENTED / TRANSITION | Server PRO implemented, local PRO compatibility remains |
| Account              | IMPLEMENTED              | Supabase Auth                                           |
| Synchronization      | IMPLEMENTED / TESTING    | Core engine exists                                      |
| NEXTREP ADMIN        | IMPLEMENTED / TESTING    | Stages 1–3                                              |

---

# 3. AUTHENTICATION

| Area                         | Status      | Notes                          |
| ---------------------------- | ----------- | ------------------------------ |
| Registration                 | TESTED      |                                |
| Login                        | TESTED      |                                |
| Logout                       | IMPLEMENTED |                                |
| Password reset               | IMPLEMENTED |                                |
| Account deletion             | TESTED      | Secured RPC                    |
| Email confirmation handling  | IMPLEMENTED |                                |
| Google login                 | DEPRECATED  | Removed from product direction |
| Service-role frontend access | DEPRECATED  | Must never be used             |

---

# 4. SUPABASE / DATA MODEL

| Area                         | Status                     | Notes                              |
| ---------------------------- | -------------------------- | ---------------------------------- |
| Target Supabase schema       | IMPLEMENTED                | Normalized architecture exists     |
| RLS                          | TESTED                     | User data isolated by `auth.uid()` |
| Device table                 | IMPLEMENTED                |                                    |
| Sync state table             | IMPLEMENTED                | Schema exists                      |
| Legacy `user_data`           | IMPLEMENTED / TRANSITIONAL | Manual cloud backup mechanism      |
| Local → normalized migration | TESTED                     | V1 migration completed             |
| Stable record identities     | IMPLEMENTED                |                                    |
| Version metadata             | IMPLEMENTED                |                                    |
| Tombstone fields             | IMPLEMENTED                | Full behavioural testing remains   |

---

# 5. DATA MIGRATION

| Area                           | Status      | Notes                                       |
| ------------------------------ | ----------- | ------------------------------------------- |
| Migration V1                   | TESTED      | Idempotent migration                        |
| Legacy IDs                     | IMPLEMENTED | Preserved where schema supports `legacy_id` |
| Device migration               | TESTED      |                                             |
| Exercise migration             | TESTED      |                                             |
| Plan migration                 | TESTED      |                                             |
| History migration              | TESTED      |                                             |
| Measurement migration          | TESTED      |                                             |
| Custom field migration         | TESTED      |                                             |
| Profile migration              | TESTED      |                                             |
| Workout identity normalization | TESTED      | Concrete workout IDs stabilized             |

---

# 6. DEVICE IDENTITY

| Area                               | Status      | Notes                                    |
| ---------------------------------- | ----------- | ---------------------------------------- |
| UUID device identity               | IMPLEMENTED |                                          |
| Account-scoped device identity     | TESTED      |                                          |
| Device persistence                 | IMPLEMENTED |                                          |
| Device references in cloud records | IMPLEMENTED |                                          |
| Historical device integrity        | IN PROGRESS | Historical inconsistencies being audited |

---

# 7. SYNCHRONIZATION

| Area                         | Status                | Notes                                      |
| ---------------------------- | --------------------- | ------------------------------------------ |
| Sync queue                   | TESTED                | `nextrep_sync_queue_v1`                    |
| Debounced queueing           | TESTED                |                                            |
| Retry mechanism              | TESTED                |                                            |
| Online/offline detection     | TESTED                |                                            |
| PUSH                         | TESTED                |                                            |
| PULL                         | TESTED                |                                            |
| Remote change classification | TESTED                |                                            |
| Different-record merge       | TESTING               | Requires final E2E validation              |
| Nested merge                 | TESTING               |                                            |
| Conflict detection           | IMPLEMENTED / TESTING |                                            |
| Conflict storage             | IMPLEMENTED           |                                            |
| Conflict Center              | OPEN                  | Full accessibility/E2E validation required |
| Conflict resolution          | OPEN                  | Depends on Conflict Center validation      |
| Tombstones                   | IMPLEMENTED / TESTING |                                            |
| Delete vs update conflict    | OPEN                  | Not fully validated                        |
| Offline synchronization      | TESTING               |                                            |
| Reconnect synchronization    | TESTING               |                                            |
| Final E2E sync               | PLANNED               |                                            |

---

# 8. ACCOUNT / WORKSPACE ISOLATION

| Area                                 | Status      | Notes                   |
| ------------------------------------ | ----------- | ----------------------- |
| Guest workspace                      | IMPLEMENTED | Separate namespace      |
| Account workspace                    | IMPLEMENTED | User-specific namespace |
| Account A → B isolation              | TESTED      |                         |
| Account B → A isolation              | TESTED      |                         |
| Guest → account isolation            | TESTED      |                         |
| Runtime state isolation              | TESTED      |                         |
| Active workout isolation             | TESTED      |                         |
| Device isolation                     | TESTED      |                         |
| Local PRO isolation                  | TESTED      |                         |
| Backup filtering by workspace        | IMPLEMENTED |                         |
| Account switch synchronization guard | TESTED      |                         |

---

# 9. ACCOUNT SOURCE SELECTION

| Area                           | Status                | Notes                    |
| ------------------------------ | --------------------- | ------------------------ |
| Detect local account data      | IMPLEMENTED           |                          |
| Detect cloud account data      | IMPLEMENTED           |                          |
| Local-only choice              | IMPLEMENTED / TESTING |                          |
| Cloud-only choice              | IMPLEMENTED / TESTING |                          |
| Empty account choice           | IMPLEMENTED / TESTING |                          |
| No automatic local+cloud merge | IMPLEMENTED           | Deliberate decision      |
| Guest auto-import              | DEPRECATED            | Must not happen silently |
| Failed cloud check handling    | IMPLEMENTED           |                          |
| Source-selection regression    | TESTING               |                          |

---

# 10. STAGE 4A

## Overall

**IN PROGRESS / TESTING**

Stage 4A started as a planned architectural phase. Implementation is now underway.

| Step | Area                          | Status                          |
| ---- | ----------------------------- | ------------------------------- |
| 4A.1 | Storage / sync / auth audit   | IMPLEMENTED                     |
| 4A.2 | Account workspace isolation   | TESTED                          |
| 4A.3 | Account source selection      | IMPLEMENTED / TESTING           |
| 4A.4 | Anonymous → account migration | PLANNED / PARTIALLY IMPLEMENTED |
| 4A.5 | Existing account + local data | TESTING                         |
| 4A.6 | Offline operation             | TESTING                         |
| 4A.7 | Server PRO transition         | IMPLEMENTED / TESTING           |
| 4A.8 | Remove local PRO              | PLANNED                         |
| 4A.9 | Final regression              | PLANNED                         |

---

# 11. CURRENT STAGE 4A OPEN ISSUES

| Issue                       | Status      | Description                                                                     |
| --------------------------- | ----------- | ------------------------------------------------------------------------------- |
| Before-restore              | OPEN        | Pre-cloud local state is not correctly restored                                 |
| Offline login               | OPEN        | Offline login currently reaches fetch failure instead of intended recovery flow |
| Different-record merge      | TESTING     | Requires E2E confirmation                                                       |
| Nested merge                | TESTING     | Requires E2E confirmation                                                       |
| Conflict E2E                | OPEN        | Needs complete end-to-end validation                                            |
| Conflict Center             | OPEN        | Accessibility and functionality require validation                              |
| Delete vs update            | OPEN        | Conflict behaviour not fully tested                                             |
| Offline reconnect           | TESTING     | Needs complete validation                                                       |
| Historical device integrity | IN PROGRESS | Read-only diagnostics and safe repairs                                          |
| PWA offline startup         | PLANNED     | Requires proper same-origin Service Worker                                      |

---

# 12. ACTIVE WORKOUT

| Area                    | Status      | Notes |
| ----------------------- | ----------- | ----- |
| Workout timer           | TESTED      |       |
| Rest timer              | TESTED      |       |
| Supersets               | TESTED      |       |
| Add exercise            | IMPLEMENTED |       |
| Replace exercise        | IMPLEMENTED |       |
| Finish workout          | IMPLEMENTED |       |
| Interrupt workout       | IMPLEMENTED |       |
| Draft persistence       | TESTED      |       |
| Reload recovery         | TESTED      |       |
| Android Back protection | TESTED      |       |
| Process-death recovery  | TESTED      |       |

---

# 13. PROGRESSION ENGINE

| Area                                 | Status      | Notes |
| ------------------------------------ | ----------- | ----- |
| Shared analysis engine               | IMPLEMENTED |       |
| Exercise-level history               | IMPLEMENTED |       |
| Comparable performances              | IMPLEMENTED |       |
| Volume analysis                      | IMPLEMENTED |       |
| RIR interpretation                   | IMPLEMENTED |       |
| Trend analysis                       | IMPLEMENTED |       |
| Recommendation logic                 | IMPLEMENTED |       |
| Maximum historical comparison window | IMPLEMENTED |       |
| Notes affecting interpretation       | IMPLEMENTED |       |
| Progress statuses                    | IMPLEMENTED |       |

Core philosophy:

> Progress is not defined only by adding weight.

---

# 14. FREE / PRO

| Area                             | Status                    | Notes |
| -------------------------------- | ------------------------- | ----- |
| FREE current-workout facts       | IMPLEMENTED               |       |
| PRO historical analysis          | IMPLEMENTED               |       |
| PRO trend analysis               | IMPLEMENTED               |       |
| PRO charts                       | IMPLEMENTED               |       |
| PRO recommendations              | IMPLEMENTED               |       |
| Server-side entitlement          | IMPLEMENTED               |       |
| Legacy local PRO                 | DEPRECATED / TRANSITIONAL |       |
| Secure offline entitlement cache | PLANNED                   |       |
| Remove local PRO flag            | PLANNED                   |       |

---

# 15. NEXTREP ADMIN

## Stage 1

**IMPLEMENTED / TESTED**

Implemented:

* role system
* admin detection
* server-side authorization
* admin session
* RLS protection

## Stage 2

**IMPLEMENTED / TESTED**

Implemented:

* dashboard
* users
* search
* pagination
* user details
* account statistics
* workout statistics
* plan statistics
* exercise statistics
* measurement statistics

## Stage 3

**IMPLEMENTED / DEPLOYMENT VERIFICATION PENDING**

Implemented:

* server PRO entitlement
* grant
* revoke
* expiry
* immutable PRO event history
* admin PRO status
* user PRO status
* protective database logic

Manual deployment verification remains required.

---

# 16. PWA / UPDATES

| Area                             | Status      | Notes                |
| -------------------------------- | ----------- | -------------------- |
| PWA manifest                     | IMPLEMENTED |                      |
| Current update mechanism         | TESTED      |                      |
| Build ID detection               | TESTED      |                      |
| Reload protection during workout | TESTED      |                      |
| Online regain update check       | TESTED      |                      |
| Periodic update check            | TESTED      |                      |
| Old blob Service Worker          | DEPRECATED  | Must not return      |
| Proper offline Service Worker    | PLANNED     | Future Stage 4A work |

---

# 17. DESIGN

| Area                | Status                  | Notes                        |
| ------------------- | ----------------------- | ---------------------------- |
| Design foundations  | IMPLEMENTED             |                              |
| Colors              | IMPLEMENTED             |                              |
| Typography          | IMPLEMENTED             | Inter                        |
| Spacing             | IMPLEMENTED             |                              |
| Radius              | IMPLEMENTED             |                              |
| Effects             | IMPLEMENTED             |                              |
| Buttons             | IMPLEMENTED / INITIAL   |                              |
| Cards               | IN PROGRESS             |                              |
| Badges              | PLANNED                 |                              |
| Inputs              | PLANNED                 |                              |
| Tabs                | PLANNED                 |                              |
| Navigation          | PLANNED                 |                              |
| Stats / metrics     | PLANNED                 |                              |
| Progress components | PLANNED                 |                              |
| Figma               | BACKUP / REFERENCE      | Manual component work paused |
| Google Stitch       | PRIMARY DESIGN WORKFLOW | New direction                |
| DESIGN.md           | PLANNED                 | Design source of truth       |

---

# 18. DOCUMENTATION

| Document                   | Status      |
| -------------------------- | ----------- |
| `NEXTREP_PROJECT_STATE.md` | IMPLEMENTED |
| `STAGE_STATUS.md`          | IN PROGRESS |
| `STAGE_4A_PLAN.md`         | IMPLEMENTED |
| `ACCOUNT_DATA_MODEL.md`    | IMPLEMENTED |
| `SYNC_AND_MIGRATION.md`    | PLANNED     |
| `PRO_ENTITLEMENT_MODEL.md` | PLANNED     |
| `DESIGN.md`                | PLANNED     |
| `PROGRESSION.md`           | PLANNED     |
| `ADMIN.md`                 | PLANNED     |

---

# 19. CURRENT PRIORITY

The immediate priority is:

```text
1. Fix before-restore
2. Fix offline login
3. Re-run affected manual tests
4. Validate different-record merge
5. Validate nested merge
6. Validate conflicts
7. Validate Conflict Center
8. Validate conflict resolution
9. Complete tombstone tests
10. Validate delete vs update
11. Validate offline sync + reconnect
12. Finish integrity cleanup
13. Run account/source-selection regression
14. Implement PWA offline startup
15. Run final E2E synchronization test
```

---

# 20. CURRENT PROJECT RULE

> **Do not add new architecture while the account/workspace/synchronization foundation is still being validated.**

The current goal is stability and correctness before adding the next major feature set.

---

# 21. RESPONSIBILITY MODEL

### USER

* product decisions
* architectural approvals
* manual testing
* final acceptance

### CHATGPT

* architecture
* planning
* audits
* documentation
* test design
* review of Claude implementation
* status management

### CLAUDE

* implementation
* automated tests
* debugging
* code changes according to approved architecture

### GITHUB

* technical source of truth

### VERCEL

* deployment environment
