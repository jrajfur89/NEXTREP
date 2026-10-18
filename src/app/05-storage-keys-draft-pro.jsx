// Scoped entries are getters: every read resolves against the ACTIVE namespace at that moment.
// The three device-level entries stay plain global strings (not part of any account's data).
const STORAGE_KEYS = {
  get exercises() { return getStorageKey("exercises"); },
  get plans() { return getStorageKey("plans"); },
  get history() { return getStorageKey("history"); },
  get measurements() { return getStorageKey("measurements"); },
  get customFields() { return getStorageKey("custom_fields"); },
  get userName() { return getStorageKey("user_name"); },
  // The in-progress, NOT yet finished workout (a draft). Never a completed session, never part
  // of history, never synced to the cloud (CLOUD_SYNC_FIELDS is an explicit whitelist).
  get activeWorkoutDraft() { return getStorageKey("active_workout_draft"); },
  // Stage 4A.2: local PRO state belongs to the account (guest ≠ A ≠ B), not to the device.
  get proStatus() { return getStorageKey("pro_status"); },
  get proHints() { return getStorageKey("pro_hints"); },
  onboardingCompleted: "trainapp_onboarding_completed_v1", // device-level: the intro walkthrough
};

// Active workout draft — written SYNCHRONOUSLY (plain localStorage, not the async saveKey) so the
// latest typed series is on disk before e.g. the Android Back dialog opens or the OS kills the app.
//
// SEC-HF-01 (P0-1, P1-A): the result is reported ({ ok, reason }) and the write never replaces a
// draft that belongs to ANOTHER workout. A draft carries `workoutInstanceId`; `owner` is
// { id: this workout's instance id, legacy: true when this workout resumed a draft saved before the
// id existed }. A stored draft with user content is replaced only by its own workout (same id, or —
// for a legacy draft without an id — the workout that resumed it). Starting another workout over it
// needs the person's explicit "Odrzuć i zacznij nowy", which clears the draft first. A stored value
// that cannot be read is treated as no draft (as loadActiveWorkoutDraft does).
function activeDraftHasContent(d) {
  return Boolean(d && Array.isArray(d.blocks) && d.blocks.some((b) => b && Array.isArray(b.items) && b.items.length > 0));
}
function activeDraftOwnedBy(d, owner) {
  if (!d) return true;
  if (!owner || !owner.id) return false;
  if (d.workoutInstanceId) return d.workoutInstanceId === owner.id;
  return Boolean(owner.legacy);
}
function saveActiveWorkoutDraft(draft, owner) {
  try {
    const current = loadActiveWorkoutDraft();
    if (current && activeDraftHasContent(current) && !activeDraftOwnedBy(current, owner)) {
      return { ok: false, reason: "conflict" };
    }
    localStorage.setItem(STORAGE_KEYS.activeWorkoutDraft, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ...draft }));
    return { ok: true, reason: null };
  } catch (e) {
    console.error("active workout draft save failed", e);
    return { ok: false, reason: "storage" };
  }
}
function loadActiveWorkoutDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.activeWorkoutDraft);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.version !== 1 || !Array.isArray(d.blocks)) return null;
    return d;
  } catch {
    return null;
  }
}
function clearActiveWorkoutDraft() {
  try {
    localStorage.removeItem(STORAGE_KEYS.activeWorkoutDraft);
  } catch {}
}
// SEC-HF-01: clears the draft only when it belongs to this workout (owner as above) — a workout that
// ends never removes another workout's draft. Returns true when nothing of this workout is left.
function clearOwnActiveWorkoutDraft(owner) {
  const current = loadActiveWorkoutDraft();
  if (current && !activeDraftOwnedBy(current, owner)) return false;
  try {
    localStorage.removeItem(STORAGE_KEYS.activeWorkoutDraft);
    return true;
  } catch {
    return false;
  }
}

// Whether the person currently has PRO-tier access — either they've switched it on directly, or
// they've got a temporary unlock (e.g. from the rewarded-ad placeholder below) that hasn't
// expired yet.
// Serwerowy status NEXTREP PRO zalogowanego konta (Stage 3). Zwraca { active, starts_at,
// expires_at, source }; każdy błąd (brak sesji, brak migracji, offline) = nieaktywne — wtedy
// działa wyłącznie dotychczasowy lokalny PRO, więc nikt nie traci dostępu.
async function fetchServerProStatus() {
  const none = { active: false, starts_at: null, expires_at: null, source: null };
  if (!supabase) return none;
  try {
    const { data, error } = await supabase.rpc("nextrep_my_pro");
    if (error || !data || data.active !== true) return none;
    return { active: true, starts_at: data.starts_at || null, expires_at: data.expires_at || null, source: data.source || null };
  } catch {
    return none;
  }
}

function hasProAccess(proStatus) {
  if (!proStatus) return false;
  if (proStatus.manualPro) return true;
  if (proStatus.adUnlockExpiresAt && Date.now() < proStatus.adUnlockExpiresAt) return true;
  return false;
}

// Uses the browser's own localStorage — persists on this device permanently, independent of
// any external service, and survives closing the app / restarting the phone.
async function loadKey(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveKey(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("storage save failed", key, e);
  }
}

// SEC-HF-01 (P0-2): a synchronous write whose result is CHECKED — true only when the value is on
// disk (written and read back identically). Used where losing the write would lose data.
function saveKeyStrict(key, value) {
  try {
    const raw = JSON.stringify(value);
    localStorage.setItem(key, raw);
    return localStorage.getItem(key) === raw;
  } catch (e) {
    console.error("storage save failed", key, e);
    return false;
  }
}

/* ---------------------------------------------------------------------- */
/* Manual cloud save (Supabase `public.user_data`)                         */
/*                                                                           */
/* This is a one-way, manual push only: reads the agreed subset of the      */
/* existing localStorage keys (via the same `loadKey` used everywhere else  */
/* in the app — no second storage mechanism), and upserts them into the     */
/* signed-in person's row in `public.user_data`. It never runs on its own   */
/* (not on login, not on a timer), never reads anything back from Supabase, */
/* and never touches `nextrep_backup_*` or localStorage in any way.         */
/* ---------------------------------------------------------------------- */

