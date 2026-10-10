// Same pattern as activeWorkoutOverlayRef, for the Ćwiczenia tab: drilling from the category
// tiles into a single category (e.g. Klatka) pushes a nav marker but doesn't change the app's
// `screen`, so the root popstate handler below needs to know to just step back out to the tiles
// instead of falling through to leaving the "exercises" screen entirely.
const exercisesOverlayRef = { current: null };

// Ready-plan copies opened in the editor via "Edytuj plan" are NOT saved yet. What saving them
// would also need (exercises the template brings in, the template's other day-plans) waits here,
// keyed by the unsaved plan's id, and is written only on "Zapisz plan". Cancel/Back → discarded.
const pendingTemplatePlans = new Map();

function App() {
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState("welcome");
  const [introDone, setIntroDone] = useState(false); // gates the startup intro placeholder only — never affects which screen is chosen next
  const [exercises, setExercises] = useState([]);
  const [plans, setPlans] = useState([]);
  const [history, setHistory] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [customFields, setCustomFields] = useState([]); // user-defined measurement categories
  const [userName, setUserName] = useState("");
  const [proStatus, setProStatus] = useState({ manualPro: false, adUnlockExpiresAt: null });
  const [proHints, setProHints] = useState({});
  const [proModalOpen, setProModalOpen] = useState(false);
  const proModalOpenRef = useRef(false);
  proModalOpenRef.current = proModalOpen;
  const [authUser, setAuthUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(!supabase);
  // The update* gate functions below are useCallback([]） — stable references, same pattern the
  // app already used before this step. They read authUser via this ref (kept in sync by the
  // effect further down) so sync-queue wiring only fires for people who are actually logged in,
  // without needing to rebuild those callbacks on every auth change.
  const authUserRef = useRef(null);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [syncQueueState, setSyncQueueState] = useState(() => loadSyncQueue());

  const [planEditorTarget, setPlanEditorTarget] = useState(undefined); // undefined = closed, null = new, obj = edit
  const [activeWorkoutPlan, setActiveWorkoutPlan] = useState(undefined); // undefined=closed, null=no-plan, obj=plan
  const [backfillInfo, setBackfillInfo] = useState(null); // { date, durationMin } when logging a past workout
  const [editSessionTarget, setEditSessionTarget] = useState(null); // session object being edited, or null
  const [trainingReportTarget, setTrainingReportTarget] = useState(null); // session object to show full report for, or null
  const [historyDetail, setHistoryDetail] = useState(null);
  const [exerciseDetail, setExerciseDetail] = useState(null);
  // Unfinished workout found on launch: { draft } while the "resume" prompt is shown; resumeDraft
  // is what gets handed to ActiveWorkout when the person chooses to continue it.
  const [resumePrompt, setResumePrompt] = useState(null); // null | { draft, confirmDiscard: bool }
  const [resumeDraft, setResumeDraft] = useState(null);
  const [, setDraftTick] = useState(0); // re-render after the Dashboard discards the draft
  const resumeCheckedRef = useRef(false);

  // Makes the hardware/gesture back button navigate one level up inside the app (closing
  // whichever overlay is currently topmost, or returning to the dashboard from another tab)
  // instead of immediately exiting. Each "drill deeper" action pushes a history entry; the
  // popstate handler below inspects current state and closes exactly one level per back press.
  const pushNavMarker = () => {
    try {
      window.history.pushState({ trainapp: true }, "", "");
    } catch {}
  };

  const screenHistoryRef = useRef([]);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  // Remount key for the current section's screen: bumping it resets the section to its root view
  // (closes in-screen sub-views like Ćwiczenia → Klatka, Plany → podgląd, Trening → lista).
  const [navResetKey, setNavResetKey] = useState(0);

  // Section navigation (bottom panel + in-app links). Goes DIRECTLY to the section's root view:
  // closes app-level detail views, and if the person is already in that section, resets it to
  // its root instead of pushing another history entry — so repeated taps never build a history
  // loop and never step back to a random previous screen. (A live workout replaces the whole UI,
  // so the bottom panel isn't reachable there; its Back protection is untouched.)
  const goToScreen = (target) => {
    setExerciseDetail(null);
    setHistoryDetail(null);
    setTrainingReportTarget(null);
    if (screenRef.current === target) {
      setNavResetKey((k) => k + 1);
      return;
    }
    setScreen((current) => {
      if (current !== target) screenHistoryRef.current.push(current);
      return target;
    });
    if (target !== "dashboard") pushNavMarker();
  };

  useEffect(() => {
    const onPopState = () => {
      // NEXTREP PRO sheet opened from inside a live workout: Back only closes the sheet (that Back
      // used up one guard entry, topped up again on the next tap) — never the leave dialog.
      if (proModalOpenRef.current && activeWorkoutBackRef.current) {
        consumeActiveWorkoutGuard();
        setProModalOpen(false);
        return;
      }
      if (activeWorkoutOverlayRef.current) {
        activeWorkoutOverlayRef.current();
        return;
      }
      if (exercisesOverlayRef.current) {
        exercisesOverlayRef.current();
        return;
      }
      if (adminBackRef.current && (adminModalCloseRef.current || adminBackRef.hasViewBack)) {
        adminBackRef.current(); // NEXTREP ADMIN: modal → Szczegóły → Lista → Dashboard
        return;
      }
      if (editSessionTarget) {
        setEditSessionTarget(null);
        return;
      }
      if (activeWorkoutPlan !== undefined) {
        // A live workout never closes because of Back. The pop used up one guard entry; hand over
        // to the workout: it saves the draft FIRST, then opens "Opuszczasz aktywny trening". No
        // history entry is pushed here (it would be skippable in Chrome — see activeWorkoutGuard);
        // the guard is topped up on the next tap. Never a Back/push loop.
        if (activeWorkoutBackRef.current) {
          consumeActiveWorkoutGuard(); // topped up again on the next tap (a real user gesture)
          activeWorkoutBackRef.current();
          return;
        }
        setActiveWorkoutPlan(undefined);
        setBackfillInfo(null);
        setScreen((s) => (backfillInfo ? "history" : "plans"));
        return;
      }
      if (exerciseDetail) {
        setExerciseDetail(null);
        return;
      }
      if (trainingReportTarget) {
        setTrainingReportTarget(null);
        return;
      }
      if (historyDetail) {
        setHistoryDetail(null);
        return;
      }
      if (planEditorTarget !== undefined) {
        if (planEditorTarget) pendingTemplatePlans.delete(planEditorTarget.id); // unsaved copy discarded
        setPlanEditorTarget(undefined);
        return;
      }
      setScreen((s) => {
        if (s === "dashboard" || s === "welcome") return s;
        const prev = screenHistoryRef.current.pop();
        return prev || "dashboard";
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [editSessionTarget, activeWorkoutPlan, exerciseDetail, trainingReportTarget, historyDetail, planEditorTarget, backfillInfo]);

  // Reads the local data keys into React state — the same logic the app has always used on
  // first load. Pulled out into its own stable function so a cloud restore can call it too,
  // reusing this one mechanism instead of inventing a second way to refresh app state.
  const reloadLocalData = useCallback(async () => {
    const [ex, pl, hi, me, cf, un, ps, ph] = await Promise.all([
      loadKey(STORAGE_KEYS.exercises),
      loadKey(STORAGE_KEYS.plans),
      loadKey(STORAGE_KEYS.history),
      loadKey(STORAGE_KEYS.measurements),
      loadKey(STORAGE_KEYS.customFields),
      loadKey(STORAGE_KEYS.userName),
      loadKey(STORAGE_KEYS.proStatus),
      loadKey(STORAGE_KEYS.proHints),
    ]);
    const normalizedEx = (ex && Array.isArray(ex) && ex.length ? ex : DEFAULT_EXERCISES).map(normalizeExercise);
    setExercises(normalizedEx);
    if (!ex) await saveKey(STORAGE_KEYS.exercises, normalizedEx);
    const normalizedPlans = Array.isArray(pl) ? pl.map(normalizePlan).filter(Boolean) : [];
    setPlans(normalizedPlans);
    const normalizedHistory0 = Array.isArray(hi) ? hi.map(normalizeHistorySession).filter(Boolean) : [];
    // nextrep_workout_identity_v1 (local, offline): unique ids for workout exercises/sets. Runs on
    // the NORMALISED history (after normalizeHistorySession), saves via saveKey only (no queue, no
    // version bump), backs up first, defers while an active workout draft exists.
    let identityRun = { history: normalizedHistory0, ran: false };
    try {
      identityRun = await runWorkoutIdentityMigration(normalizedHistory0, normalizedPlans);
    } catch (e) {
      setWorkoutIdentityMigrationStatus("failed", { error: `exception: ${e && e.message ? e.message : e}` });
    }
    const normalizedHistory = identityRun.history;
    setHistory(normalizedHistory);
    // One-time backfill: older sessions saved before history-exercise ids existed get stable ids
    // assigned above by normalizeHistorySession — persist that back once so the same ids survive
    // future reloads (otherwise a fresh id would be generated again next time). This is a local
    // data-shape fix, not a user edit — it goes through the plain saveKey used elsewhere in this
    // effect, never through updateHistory, so it can never create a sync-queue entry.
    const historyNeededIdBackfill =
      Array.isArray(hi) && hi.some((sess) => sess && Array.isArray(sess.exercises) && sess.exercises.some((ex) => ex && !ex.id));
    if (historyNeededIdBackfill && !identityRun.ran) {
      await saveKey(STORAGE_KEYS.history, normalizedHistory);
    }
    setMeasurements(Array.isArray(me) ? me : []);
    setCustomFields(Array.isArray(cf) ? cf : []);
    setUserName(typeof un === "string" ? un : "");
    setProStatus(ps && typeof ps === "object" && !Array.isArray(ps) ? { manualPro: false, adUnlockExpiresAt: null, ...ps } : { manualPro: false, adUnlockExpiresAt: null });
    setProHints(ph && typeof ph === "object" && !Array.isArray(ph) ? ph : {});
  }, []);

  // (Stage 4A.1) Local data is no longer loaded once at mount: it's loaded for the namespace of
  // the resolved session — see the namespace-switch effect next to `authUserId` below.

  // Auth session tracking — entirely separate from the local-data effect above, so a slow or
  // failed network call to Supabase never blocks the app's normal (account-free) local flow.
  //
  // authUserRef is set SYNCHRONOUSLY, right here, in the same tick the auth outcome becomes
  // known — not via a separate useEffect keyed on the `authUser` state value. A state-dependent
  // effect only runs after React re-renders for that state change, which left a real (if usually
  // brief) window where the UI already showed "zalogowany" but authUserRef.current was still
  // null — exactly the gap that let a genuine edit slip through updateExercises' `if
  // (authUserRef.current)` guard without ever reaching enqueueSyncChange. Assigning the ref here
  // closes that gap at its source instead of reacting to it one render later.
  //
  // getOrCreateDeviceId() is called in the same place, only when there's an actual user, so
  // nextrep_device_id_v1 is guaranteed to exist as soon as we know who's logged in — never
  // lazily, only as a side effect of the first edit someone happens to make.
  // The SDK's getSession() can take ~26 s when the stored token has expired and there's no network
  // (it retries the token refresh). If an auth event arrives meanwhile (sign-out, sign-in, recovered
  // session), that event is newer — a late answer of this first getSession() must not overwrite it.
  const authEventSeenRef = useRef(false);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (authEventSeenRef.current) return;
      const user = data?.session?.user || null;
      authUserRef.current = user;
      setAuthUser(user);
      setAuthLoaded(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      authEventSeenRef.current = true;
      const user = session?.user || null;
      authUserRef.current = user;
      setAuthUser(user);
      setAuthLoaded(true);
      // Supabase fires this after the person opens a "reset password" email link — send them
      // straight to the set-new-password screen instead of wherever they happened to be.
      if (event === "PASSWORD_RECOVERY") {
        setScreen("resetPassword");
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Role user/admin — read from Supabase for the CURRENT user id, kept in memory only (never
  // localStorage / cache). Signed out → "none" immediately; another user → re-checked, and the
  // old answer can't leak because every result is tied to the user id it was fetched for.
  // Any error (e.g. migration not run yet) fails closed as "user".
  const [adminState, setAdminState] = useState({ status: "none", userId: null });
  const authUserId = authUser ? authUser.id : null;

  // ===== Stage 4A.1 — local data follows the account =====
  // expectedNs: the namespace the CURRENT session must see (null while the session is still being
  // resolved at start-up). dataNs: the namespace whose data is actually loaded in React state.
  // The app renders its content only when they match (dataReady) — after A → B the very first
  // render already shows the loading screen, never A's data under B's session.
  const [dataNs, setDataNs] = useState(null);
  const nsSwitchChainRef = useRef(Promise.resolve());
  // Decide the data source of the account whose namespace just became active. Every result is
  // discarded if the account / namespace changed while it was awaited (A → B never writes into B).
  // `notice` (Stage 4A.4): a message from the flow that ended here, shown on the resulting screen.
  const runAccountInitCheck = useCallback(async (userId, ns, notice = null) => {
    const same = () => (authUserRef.current && authUserRef.current.id) === userId && getActiveDataNamespace() === ns;
    if (!same()) return;
    const local = hasLocalAccountData(userId);
    setAccountInit({ ns, status: "checking", local });
    // Stage 4A.4 F-5 (Etap 6): the cloud is locked by a migration attempt (NR001) → explain the lock
    // (server view of the attempt) instead of a generic connection error
    const blockedByMigration = async (e) => {
      if (migrationErrorKind(e) !== "in_progress") return false;
      const gate = await readMigrationGate(userId);
      if (same()) setAccountInit({ ns, status: "migration_blocked", local, gate, error: notice });
      return true;
    };
    let cloud = null;
    try {
      cloud = await checkCloudAccountData(userId);
    } catch (e) {
      if (!same()) return;
      if (await blockedByMigration(e)) return;
      setAccountInit({ ns, status: "error_check", local, error: (e && e.message) || String(e) });
      return;
    }
    if (!same()) return;
    // F-5 (Etap 8, M1): cloud data consciously accepted as INCOMPLETE is never presented as complete nor as an
    // empty cloud — even when only built-in exercises reached it (then the data check alone says "empty").
    // The server view decides; when it cannot be read, this device's own durable note does.
    const gateNow = await readMigrationGate(userId);
    if (!same()) return;
    const incompleteAccepted = !!((gateNow.ok && gateNow.acceptedIncomplete) || (!gateNow.ok && getIncompleteAcceptedNote(userId)));
    if (!local.hasData && !cloud.hasData) {
      // Stage 4A.4: a genuinely empty account + guest data on this device → offer to move it (nothing is
      // written until the user agrees). Not offered while the guest data is bound to another account's migration.
      const guest = guestHasMigratableData();
      // F-4: guest data bound to another account's transfer (or a marker that cannot be verified) is never
      // offered silently and never ends in an automatic decision — the user sees why and decides.
      const binding = guestMarkerBinding(userId);
      if (binding && (guest.hasData || guest.damage.length)) {
        setAccountInit({ ns, status: "guest_bound_other", local, cloud, binding, guest: guest.details, error: notice });
        return;
      }
      if (guest.damage.length) {
        // F-2: damaged guest data is never treated as "no data" — say so; nothing can be moved, nothing decided
        setAccountInit({ ns, status: "guest_offer", local, cloud, guest: guest.details, guestDraft: guest.draft, migrationBlocked: true, guestDamaged: damageText(guest.damage), error: notice });
        return;
      }
      if (guest.hasData && incompleteAccepted) {
        // a guest → account transfer would be refused by the server (incomplete_data_accepted): say why
        setAccountInit({ ns, status: "guest_offer", local, cloud, guest: guest.details, guestDraft: guest.draft, migrationBlocked: true, incompleteAccepted: true, error: notice });
        return;
      }
      if (guest.hasData && !accountLocalBlocksGuestMigration(userId)) {
        // the same strict "genuinely empty" rule the migration itself applies (edited built-in exercises count)
        let strict = null;
        try {
          strict = await checkCloudAccountData(userId, guestMigrationCloudOptions(false, null, userId));
        } catch (e) {
          if (!same()) return;
          if (await blockedByMigration(e)) return;
          setAccountInit({ ns, status: "error_check", local, error: (e && e.message) || String(e) });
          return;
        }
        if (!same()) return;
        // strict rule says "not empty" (an edited built-in exercise of this account, unsent changes …): no
        // automatic decision — the screen explains it and the user chooses "Nie teraz" explicitly.
        setAccountInit({ ns, status: "guest_offer", local, cloud, guest: guest.details, guestDraft: guest.draft, migrationBlocked: !!strict.hasData, error: notice });
        return;
      }
      if (guest.hasData) {
        setAccountInit({ ns, status: "guest_offer", local, cloud, guest: guest.details, guestDraft: guest.draft, migrationBlocked: true, error: notice });
        return;
      }
      setAccountInitMarker(userId, { status: "ready", source: "new", syncPaused: false });
      setAccountInit({ ns, status: "ready", local, cloud });
      return;
    }
    const snap = findDeviceSnapshotBeforeCloudRestore(userId);
    const deviceSnapshotInfo = snap
      ? { createdAt: snap.createdAt, details: { history: (snap.data.history || []).length, plans: (snap.data.plans || []).length, measurements: (snap.data.measurements || []).length } }
      : null;
    setAccountInit({ ns, status: "choice", local, cloud, deviceSnapshot: deviceSnapshotInfo, partialGuestUpload: !!getGuestPartialNote(userId), incompleteAccepted, error: notice });
  }, []);
  const loadedOnceRef = useRef(false);
  // Session not confirmed yet (SDK still trying to refresh an expired token, typically offline):
  // after a short wait show an explanation instead of an empty start screen, and let the person
  // continue as GUEST. An account namespace is only ever opened when the SDK itself confirms a session.
  const [offlineAuthWait, setOfflineAuthWait] = useState(null); // null | "offline" | "server"
  const [offlineGuestAck, setOfflineGuestAck] = useState(false);
  const authLoadedRef = useRef(false);
  authLoadedRef.current = authLoaded;
  useEffect(() => {
    if (!supabase) return;
    const t1 = setTimeout(() => {
      if (!authLoadedRef.current && typeof navigator !== "undefined" && navigator.onLine === false) setOfflineAuthWait("offline");
    }, 2000);
    const t2 = setTimeout(() => {
      if (!authLoadedRef.current) setOfflineAuthWait((k) => k || "server");
    }, 8000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  const expectedNs = !supabase ? "guest" : authLoaded ? getLocalDataNamespace(authUserId) : offlineGuestAck ? "guest" : null;
  // Stage 4A.2: a session that appears while a GUEST workout is open (e.g. recovered by the SDK
  // after "Kontynuuj bez logowania", or a login in another tab) never tears that workout down.
  // The switch to the account's workspace is held — runtime only — until the workout is finished,
  // interrupted or cancelled; meanwhile everything keeps writing ONLY the guest workspace.
  const guestWorkoutOpen = dataNs === "guest" && (activeWorkoutPlan !== undefined || !!editSessionTarget);
  const holdForGuestWorkout = guestWorkoutOpen && !!expectedNs && expectedNs !== "guest";
  const workspaceNs = holdForGuestWorkout ? "guest" : expectedNs;
  const heldSwitchRef = useRef(false);
  if (holdForGuestWorkout) heldSwitchRef.current = true;
  else if (expectedNs === "guest") heldSwitchRef.current = false;
  const [sessionRecoveredNotice, setSessionRecoveredNotice] = useState(false);
  const [guestMigrationNotice, setGuestMigrationNotice] = useState(null); // Stage 4A.4: { draftKept, cleanup } after a migration
  // Stage 4A.4 F-5 (Etap 6): the last server view of migration attempts (sync gate) → a banner while sync is paused
  const [migrationGateView, setMigrationGateView] = useState(null);
  const [migrationBannerHidden, setMigrationBannerHidden] = useState(null);
  useEffect(() => onMigrationGateChange((g) => setMigrationGateView(g)), []);
  const dataNamespaceLoaded = dataNs !== null && dataNs === workspaceNs;
  // Stage 4A.2: an account namespace is usable only once its data source is decided.
  // accountInit = { ns, status: "checking"|"choice"|"error_check"|"loading_cloud"|"error_load"|"ready", local, cloud, error, transient }
  const [accountInit, setAccountInit] = useState({ ns: null, status: "checking" });
  // Stage 4A.3: every source-selection action takes a token; a newer action or a workspace switch
  // makes older ones stale — a stale action stops at its next account check (its ref returns null)
  // and never touches the screen of the flow that replaced it.
  const initOpRef = useRef(0);
  const accountInitReady = workspaceNs === "guest" || (accountInit.ns === dataNs && accountInit.status === "ready");
  const dataReady = dataNamespaceLoaded && accountInitReady;
  useEffect(() => {
    if (!workspaceNs) return;
    const targetUserId = workspaceNs === "guest" ? null : authUserId;
    const targetNs = workspaceNs;
    initOpRef.current++; // Stage 4A.3: actions of the previous workspace / session are stale from now on
    // Switches are serialised: each one finishes (activate → reset → load) before the next starts.
    nsSwitchChainRef.current = nsSwitchChainRef.current
      .then(async () => {
        // Let an in-flight sync of the previous account finish writing ITS namespace first
        // (bounded; sync additionally refuses to apply anything once the account changed).
        for (let i = 0; i < 200 && (isSyncRunInProgress() || isAccountInitBusy()); i++) await new Promise((r) => setTimeout(r, 50));
        cancelAllScheduledSyncRetries(); // Stage 4A.2: no retry / debounced sync of the previous workspace survives the switch
        cancelScheduledSync();
        activateDataNamespace(targetUserId);
        // Drop every piece of UI state that could still hold the previous namespace's objects.
        pendingTemplatePlans.clear();
        setActiveWorkoutPlan(undefined);
        setBackfillInfo(null);
        setHistoryDetail(null);
        setExerciseDetail(null);
        setEditSessionTarget(null);
        setPlanEditorTarget(undefined);
        setTrainingReportTarget(null);
        setResumePrompt(null); // an unfinished workout offered to the PREVIOUS namespace is never shown here
        setResumeDraft(null);
        resumeCheckedRef.current = false; // this account's own unfinished workout gets offered
        await reloadLocalData();
        setSyncQueueState(loadSyncQueue());
        if (targetUserId) getOrCreateDeviceId(); // this account's own device id, in its own namespace
        if (!loadedOnceRef.current) {
          loadedOnceRef.current = true;
          const oc = await loadKey(STORAGE_KEYS.onboardingCompleted);
          if (oc === true) setScreen("dashboard");
          setLoaded(true);
        }
        // Stage 4A.2: an already-initialised account goes straight in; otherwise decide its source.
        if (targetUserId) {
          const marker = getAccountInitMarker(targetUserId);
          if (marker && marker.status === "pending_cloud_confirm") fixLastCloudRestoreFingerprint(targetUserId);
          // Stage 4A.3: a settled account has nothing to roll back — a leftover restore pointer must not
          // offer an old snapshot in a later source choice.
          if (marker && marker.status === "ready" && getLastCloudRestorePointer(targetUserId)) clearLastCloudRestorePointer(targetUserId);
          setAccountInit(
            marker && marker.status === "ready"
              ? { ns: targetNs, status: "ready" }
              : marker && marker.status === "pending_cloud_confirm"
              ? { ns: targetNs, status: "cloud_loaded" }
              : marker && marker.status === "loading_cloud"
              ? { ns: targetNs, status: "cloud_interrupted" } // Stage 4A.3: data on the device may be partial — never used as device data
              : marker && marker.status === "uploading_device"
              ? { ns: targetNs, status: "upload_interrupted" } // Stage 4A.3: own partial upload may be in the cloud
              : marker && marker.status === "migrating_guest"
              ? { ns: targetNs, status: "guest_migration_interrupted" } // Stage 4A.4: unfinished guest → account migration
              : { ns: targetNs, status: "checking" }
          );
        } else {
          setAccountInit({ ns: targetNs, status: "ready" });
        }
        setDataNs(targetNs);
        if (targetUserId && heldSwitchRef.current) {
          heldSwitchRef.current = false;
          setSessionRecoveredNotice(true); // the held switch just happened — say so
        }
        // Stage 4A.3: no marker — or one with an unknown / damaged status (never "ready", never synced,
        // nothing cleared) — means the source is decided again by the normal safe check.
        if (targetUserId && !isKnownAccountInitStatus((getAccountInitMarker(targetUserId) || {}).status)) runAccountInitCheck(targetUserId, targetNs);
        // Stage 4A.4 Part 2: a guest cleanup that failed / was interrupted after a verified migration is
        // retried here — cleanup only (all D1 checks again), never another upload.
        if (targetUserId) {
          const m = getAccountInitMarker(targetUserId);
          if (m && m.status === "ready" && m.source === "guest") retryPendingGuestCleanup(targetUserId, () => (authUserRef.current ? authUserRef.current.id : null)).catch(() => {});
        }
      })
      .catch((e) => console.error("[namespace] switch failed", e));
  }, [workspaceNs]);

  // FIX 1 (B): as soon as a session exists (fresh login or app start with a stored session), fill
  // missing sync_meta baselines — protects accounts that were migrated but never synced. Silent,
  // non-blocking; offline / network errors just leave it for the next sync (runSync retries).
  useEffect(() => {
    if (!supabase || !authUserId || !dataReady) return; // Stage 4A.1: only on this account's own data
    bootstrapSyncMetaForExistingData().catch(() => {});
  }, [authUserId, dataReady]);
  useEffect(() => {
    if (!supabase || !authUserId) {
      setAdminState({ status: "none", userId: null });
      return;
    }
    let alive = true;
    setAdminState({ status: "checking", userId: authUserId });
    supabase
      .rpc("nextrep_my_role")
      .then(({ data, error }) => {
        if (!alive || (authUserRef.current && authUserRef.current.id) !== authUserId) return;
        setAdminState({ status: !error && data === "admin" ? "admin" : "user", userId: authUserId });
      })
      .catch(() => alive && setAdminState({ status: "user", userId: authUserId }));
    return () => {
      alive = false;
    };
  }, [authUserId]);
  const isAdmin = adminState.status === "admin" && adminState.userId === authUserId;

  // NEXTREP PRO z serwera (Stage 3): status konta z Supabase (nextrep_my_pro — tylko własny,
  // tylko odczyt), trzymany wyłącznie w pamięci, powiązany z id zalogowanego konta. Aktywność
  // liczona także lokalnie z expires_at, więc wygasa dokładnie o czasie bez odświeżania.
  const [serverPro, setServerPro] = useState({ userId: null, active: false, starts_at: null, expires_at: null, source: null });
  const refreshServerPro = useCallback(() => {
    const uid = authUserRef.current ? authUserRef.current.id : null;
    if (!supabase || !uid) {
      setServerPro({ userId: null, active: false, starts_at: null, expires_at: null, source: null });
      return;
    }
    fetchServerProStatus().then((st) => {
      if ((authUserRef.current && authUserRef.current.id) !== uid) return;
      setServerPro({ userId: uid, ...st });
    });
  }, []);
  useEffect(() => {
    refreshServerPro();
  }, [authUserId, refreshServerPro]);
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refreshServerPro();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshServerPro]);
  const [, setProTick] = useState(0);
  const serverProActive =
    serverPro.active && serverPro.userId === authUserId && !holdForGuestWorkout && (!serverPro.expires_at || Date.now() < Date.parse(serverPro.expires_at));
  useEffect(() => {
    if (!serverProActive || !serverPro.expires_at) return;
    const ms = Date.parse(serverPro.expires_at) - Date.now() + 500;
    if (ms > 2147483647) return;
    const t = setTimeout(() => setProTick((n) => n + 1), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [serverProActive, serverPro.expires_at]);
  // One effective PRO flag for the whole app: server PRO OR (transitional) the existing local PRO,
  // so nobody loses access by deploying Stage 3. Local PRO is removed together with payments.
  const isProEffective = hasProAccess(proStatus) || serverProActive;
  const serverProForModal = serverProActive ? serverPro : null;

  // Admin route "#/admin" (static hosting on Vercel: a hash route needs no server rewrite). Only
  // honoured once local data is loaded and onboarding is done, so it never bypasses onboarding.
  useEffect(() => {
    if (!loaded) return;
    const openIfRequested = () => {
      if (window.location.hash === ADMIN_HASH && screenRef.current !== "welcome") setScreen("admin");
    };
    openIfRequested();
    window.addEventListener("hashchange", openIfRequested);
    return () => window.removeEventListener("hashchange", openIfRequested);
  }, [loaded]);
  // Keep the address in step with the admin screen: add "#/admin" on entering it, remove it only
  // when actually LEAVING it (never before the initial route has been read).
  const prevScreenForHashRef = useRef(screen);
  useEffect(() => {
    const prev = prevScreenForHashRef.current;
    prevScreenForHashRef.current = screen;
    try {
      if (screen === "admin" && window.location.hash !== ADMIN_HASH) {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search + ADMIN_HASH);
      } else if (prev === "admin" && screen !== "admin" && window.location.hash === ADMIN_HASH) {
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      }
    } catch {}
  }, [screen]);

  // Sync Engine foundation (Krok 7): tracks connectivity and the persisted queue, and — once the
  // person is known to be logged in and online — merely PREPARES a (debounced) sync attempt via
  // the still-stub runSync(). No real push/pull happens here; this only keeps `isOnline` and
  // `syncQueueState` accurate for the UI and future wiring.
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (authUser) {
        const queue = loadSyncQueue();
        setSyncQueueState(queue);
        const hasPendingWork = queue.some((it) => it.status === "pending" || it.status === "failed");
        if (hasPendingWork) scheduleSync();
      }
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [authUser]);

  // Startup (point 9): once we know whether someone is logged in, read the queue, and if there's
  // pending/failed work and we're online, prepare a (debounced, still-stub) sync — never a real
  // push/pull yet.
  useEffect(() => {
    if (!authLoaded || !dataReady) return; // Stage 4A.1: read the queue of the namespace that's loaded
    const queue = loadSyncQueue();
    setSyncQueueState(queue);
    if (authUser && isOnline) {
      const hasPendingWork = queue.some((it) => it.status === "pending" || it.status === "failed");
      if (hasPendingWork) scheduleSync();
    }
  }, [authLoaded, authUser, dataReady]);

  // Stage 4A.2: changes are queued for sync only when the active workspace belongs to the session
  // (never while a guest workout holds the switch to a just-recovered account).
  const queueForSession = () => !!authUserRef.current && isActiveNamespaceFor(authUserRef.current.id);
  const updateExercises = useCallback((updater) => {
    console.log("[sync diag] updateExercises() CALLED");
    setExercises((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      console.log("[sync diag] updateExercises() prev =", prev);
      console.log("[sync diag] updateExercises() next =", next);
      saveKey(STORAGE_KEYS.exercises, next);
      createBackupSnapshot("auto");
      console.log("[sync diag] updateExercises() authUserRef.current =", authUserRef.current);
      if (queueForSession()) {
        const diff = diffById(prev, next);
        const enqueued = queueChangesForDiff("exercises", diff);
        console.log("[sync diag] updateExercises() queueChangesForDiff returned", enqueued);
        if (enqueued) scheduleSync();
      } else {
        console.log("[sync diag] updateExercises() SKIPPED queueing — authUserRef.current is falsy");
      }
      return next;
    });
  }, []);

  const updatePlans = useCallback((updater) => {
    setPlans((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveKey(STORAGE_KEYS.plans, next);
      createBackupSnapshot("auto");
      if (queueForSession()) {
        let any = false;
        any = queueChangesForDiff("plans", diffById(prev, next)) || any;
        // Nested: plan_items and plan_item_sets both carry stable uid()-generated ids, so they
        // can be diffed and queued the same way — per plan that still exists in `next`.
        const prevPlanById = new Map(prev.map((p) => [p.id, p]));
        for (const plan of next) {
          const prevItems = (prevPlanById.get(plan.id)?.exercises) || [];
          const nextItems = plan.exercises || [];
          any = queueChangesForDiff("plan_items", diffById(prevItems, nextItems)) || any;
          const prevItemById = new Map(prevItems.map((it) => [it.id, it]));
          for (const item of nextItems) {
            const prevSets = (prevItemById.get(item.id)?.setsDetail) || [];
            const nextSets = item.setsDetail || [];
            any = queueChangesForDiff("plan_item_sets", diffById(prevSets, nextSets)) || any;
          }
        }
        if (any) scheduleSync();
      }
      return next;
    });
  }, []);

  const updateHistory = useCallback((updater) => {
    setHistory((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveKey(STORAGE_KEYS.history, next);
      createBackupSnapshot("auto");
      if (queueForSession()) {
        let any = false;
        any = queueChangesForDiff("workouts", diffById(prev, next)) || any;
        // Nested: workout_exercises and workout_sets both carry stable ids — session.exercises[].id
        // (the Step 8A.1 fix) and sets[].id — so they can be diffed and queued the same way
        // plan_items/plan_item_sets already are in updatePlans(), per session that still exists in
        // `next`. (An earlier comment here claimed these ids weren't stable yet; that was resolved
        // by 8A.1 and confirmed by the pushWorkoutExercise/pushWorkoutSet integration tests — this
        // was simply never wired into the CRUD gate itself until now.)
        const prevSessionById = new Map(prev.map((s) => [s.id, s]));
        for (const session of next) {
          const prevExercises = (prevSessionById.get(session.id)?.exercises) || [];
          const nextExercises = session.exercises || [];
          any = queueChangesForDiff("workout_exercises", diffById(prevExercises, nextExercises)) || any;
          const prevExerciseById = new Map(prevExercises.map((e) => [e.id, e]));
          for (const ex of nextExercises) {
            const prevSets = (prevExerciseById.get(ex.id)?.sets) || [];
            const nextSets = ex.sets || [];
            any = queueChangesForDiff("workout_sets", diffById(prevSets, nextSets)) || any;
          }
        }
        if (any) scheduleSync();
      }
      return next;
    });
  }, []);

  const updateMeasurements = useCallback((updater) => {
    setMeasurements((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveKey(STORAGE_KEYS.measurements, next);
      createBackupSnapshot("auto");
      if (queueForSession()) {
        if (queueChangesForDiff("measurements", diffById(prev, next))) scheduleSync();
      }
      return next;
    });
  }, []);

  const updateCustomFields = useCallback((updater) => {
    setCustomFields((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveKey(STORAGE_KEYS.customFields, next);
      createBackupSnapshot("auto");
      if (queueForSession()) {
        // Identified by `key`, never `legacy_id` — nextrep_custom_fields has no such column.
        if (queueChangesForDiff("custom_fields", diffById(prev, next, "key"), "key")) scheduleSync();
      }
      return next;
    });
  }, []);

  const saveUserName = useCallback((name) => {
    setUserName(name);
    saveKey(STORAGE_KEYS.userName, name);
    if (queueForSession()) {
      // nextrep_profiles has exactly one row per user_id and no id column of its own — "self" is
      // a fixed, stable recordId sentinel for that single row, not a guess at a missing id.
      const version = bumpRecordVersion("profile", "self");
      enqueueSyncChange({ table: "profile", recordId: "self", operation: "upsert", version, deviceId: getOrCreateDeviceId() });
      scheduleSync();
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    saveKey(STORAGE_KEYS.onboardingCompleted, true);
    setScreen("dashboard");
  }, []);

  const setManualPro = useCallback((value) => {
    setProStatus((prev) => {
      const next = { ...prev, manualPro: value };
      saveKey(STORAGE_KEYS.proStatus, next);
      return next;
    });
  }, []);

  const grantAdUnlock = useCallback(() => {
    setProStatus((prev) => {
      const next = { ...prev, adUnlockExpiresAt: Date.now() + 24 * 60 * 60 * 1000 };
      saveKey(STORAGE_KEYS.proStatus, next);
      return next;
    });
  }, []);

  const markHintShown = useCallback((key) => {
    setProHints((prev) => {
      const next = { ...prev, [key]: Date.now() };
      saveKey(STORAGE_KEYS.proHints, next);
      return next;
    });
  }, []);

  if (introDone && offlineAuthWait && !offlineGuestAck && !authUser) {
    return (
      <div className="min-h-screen bg-app-depth font-body flex items-center justify-center px-6 py-10" data-testid="session-unconfirmed">
        <FontStyles />
        <div className="w-full max-w-sm">
          <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2">{offlineAuthWait === "offline" ? "JESTEŚ OFFLINE" : "BRAK POŁĄCZENIA Z SERWEREM"}</p>
          <p className="text-neutral-200 text-sm mb-2">Nie można potwierdzić sesji.</p>
          <p className="text-neutral-400 text-sm mb-5">Twoje dane konta są bezpieczne i będą dostępne po ponownym połączeniu z internetem.</p>
          <button onClick={() => setOfflineGuestAck(true)} data-testid="session-continue-guest" className="w-full py-3 rounded-2xl font-bold text-sm bg-orange-500 text-neutral-950 mb-2">
            Kontynuuj bez logowania
          </button>
          <p className="text-neutral-600 text-xs leading-relaxed">Po połączeniu z internetem sesja zostanie potwierdzona automatycznie.</p>
        </div>
      </div>
    );
  }

  // ---- Stage 4A.2 choice handlers (each bound to the account that started it) ----
  const initUserId = authUserId;
  const initNs = expectedNs;
  const sameInit = () => (authUserRef.current && authUserRef.current.id) === initUserId && getActiveDataNamespace() === initNs;
  // Stage 4A.3 (F2): token per action. `refFor(op)` is the account ref handed to the domain functions:
  // it returns null once the action is stale, so they stop at their next stillSameAccount check.
  const beginInitOp = () => ++initOpRef.current;
  const isCurrentOp = (op) => initOpRef.current === op && sameInit();
  const refFor = (op) => () => (initOpRef.current === op && authUserRef.current ? authUserRef.current.id : null);
  const ACCOUNT_CHECK_FAILED_TEXT = "Nie udało się potwierdzić konta, więc operacja została przerwana. Dane nie zostały zmienione — spróbuj ponownie.";
  const failText = (e) => (e && e.message ? authErrorText(e) : "Operacja nie powiodła się. Dane nie zostały zmienione — spróbuj ponownie.");
  const finishInit = async () => {
    await reloadLocalData();
    if (!sameInit()) return;
    setSyncQueueState(loadSyncQueue());
    setAccountInit({ ns: initNs, status: "ready" });
  };
  const chooseLocal = async () => {
    if (!sameInit()) return;
    // After an unsettled "Wczytaj z chmury" the namespace holds the CLOUD copy: "device" then means
    // exactly the snapshot taken before that load — or an explicit error. Never the current data.
    const r = resolveDeviceSnapshot(initUserId);
    const afterCloudLoad = r.status !== "none";
    if (r.status === "ok") {
      if (!restoreDeviceSnapshot(initUserId, r.snapshot)) {
        setAccountInit({ ...accountInit, error: "Nie udało się przywrócić danych z urządzenia. Aktualne dane nie zostały zmienione." });
        return;
      }
    } else if (afterCloudLoad) {
      setAccountInit({ ...accountInit, error: DEVICE_SNAPSHOT_ERRORS[r.status] || DEVICE_SNAPSHOT_ERRORS.invalid });
      return; // nothing restored, nothing cleared, not a success
    } else if (accountInit.incompleteAccepted) {
      // F-5 (Etap 8, M1): no upload can ever start on this account — use the device data with sync PAUSED
      const op = beginInitOp();
      const prev = accountInit;
      let u;
      try {
        u = await useDeviceDataAfterIncompleteAccepted(initUserId, refFor(op));
      } catch (e) {
        u = { ok: false, error: failText(e) };
      }
      if (!isCurrentOp(op)) return;
      if (u.ok || u.alreadyReady) {
        await finishInit();
        return;
      }
      if (u.notAccepted) {
        runAccountInitCheck(initUserId, initNs); // the situation changed on the server — decide again
        return;
      }
      if (u.migration === "in_progress") {
        const gate = await readMigrationGate(initUserId);
        if (!sameInit()) return;
        setAccountInit({ ns: initNs, status: "migration_blocked", local: hasLocalAccountData(initUserId), gate, error: null });
        return;
      }
      setAccountInit({ ...prev, error: u.discarded ? ACCOUNT_CHECK_FAILED_TEXT : u.error });
      return;
    } else if (accountInit.local && accountInit.local.hasData && accountInit.cloud && accountInit.cloud.hasData === false) {
      // Stage 4A.3: device data + a cloud confirmed EMPTY → the device data becomes this account's
      // data and is uploaded first; the account is "ready" only after a successful upload.
      await runDeviceUpload();
      return;
    }
    // the cloud just loaded (or checked) has data → device data stays paused against it
    const cloudHasData = afterCloudLoad ? true : !!(accountInit.cloud && accountInit.cloud.hasData);
    const incompleteNote = getIncompleteAcceptedNote(initUserId);
    setAccountInitMarker(initUserId, { status: "ready", source: "device", syncPaused: cloudHasData, ...(cloudHasData && incompleteNote ? { pausedReason: "incomplete_accepted", incompleteAccepted: incompleteNote.attemptId } : {}) });
    await finishInit();
  };
  // Stage 4A.3: upload of the device data to a confirmed-empty cloud (first attempt, retry after an
  // error, or resume after a restart — the persistent "uploading_device" marker tells them apart).
  const runDeviceUpload = async () => {
    if (!sameInit()) return;
    const op = beginInitOp();
    const prev = accountInit;
    setAccountInit({ ...prev, status: "uploading", error: null });
    let u;
    try {
      u = await uploadAccountDataToEmptyCloud(initUserId, refFor(op));
    } catch (e) {
      u = { ok: false, error: failText(e) };
    }
    if (!isCurrentOp(op)) return; // superseded — the newer flow owns the screen
    if (u.discarded) u = { ok: false, error: ACCOUNT_CHECK_FAILED_TEXT }; // never leave the spinner up
    // Stage 4A.4 F-5 (Etap 6): partial upload / attempt closed elsewhere / another attempt holds the account
    if (!u.ok && (await showMigrationOutcome(u, "device"))) return;
    if (!u.ok && !u.cloudChanged && !u.alreadyReady) {
      // an unfinished upload stays recognisable: show its own retry screen, otherwise the previous one
      const m = getAccountInitMarker(initUserId);
      if (m && m.status === "uploading_device") setAccountInit({ ns: initNs, status: prev.status === "upload_interrupted" ? "upload_interrupted" : "error_upload", error: u.error });
      else setAccountInit({ ...prev, error: u.error });
      return;
    }
    if (u.alreadyReady) {
      await finishInit();
      return;
    }
    if (u.cloudChanged) {
      setAccountInit({
        ns: initNs,
        status: "choice",
        local: hasLocalAccountData(initUserId),
        cloud: u.cloud,
        deviceSnapshot: null,
        error: "Dane w chmurze zmieniły się w międzyczasie, więc nic nie zostało wysłane. Wybierz ponownie, których danych chcesz używać.",
      });
      return;
    }
    setAccountInitMarker(initUserId, { status: "ready", source: "device", syncPaused: false });
    await finishInit();
  };
  // Stage 4A.3: give up an unfinished upload — the device data stays as it is; rows this device
  // already sent now count as cloud data in the normal check (nothing is deleted or merged).
  // Stage 4A.4 F-5 (Etap 6): the server attempt ends FIRST — cancelled only when the server confirms zero
  // writes; with writes it stays `abandoned` (the account is locked) and the partial screen explains it.
  const abandonDeviceUpload = async () => {
    if (!sameInit()) return;
    const op = beginInitOp();
    const prev = accountInit;
    let r;
    try {
      r = await abandonInterruptedDeviceUpload(initUserId, refFor(op));
    } catch (e) {
      r = { ok: false, error: failText(e) };
    }
    if (!isCurrentOp(op)) return;
    if (!r.ok && r.completed) {
      await runDeviceUpload(); // the server already holds the verified, completed upload → finish (no re-upload)
      return;
    }
    if (!r.ok && r.partial) {
      setAccountInit({ ns: initNs, status: "upload_partial", error: null });
      return;
    }
    if (!r.ok && !r.discarded) {
      setAccountInit({ ...prev, error: r.error || ACCOUNT_CHECK_FAILED_TEXT });
      return;
    }
    setAccountInit({ ns: initNs, status: "checking" });
    runAccountInitCheck(initUserId, initNs);
  };
  const acceptDeviceIncomplete = async () => {
    if (!sameInit()) return;
    const op = beginInitOp();
    const prev = accountInit;
    let r;
    try {
      r = await acceptIncompleteDeviceUpload(initUserId, refFor(op));
    } catch (e) {
      r = { ok: false, error: failText(e) };
    }
    if (!isCurrentOp(op)) return;
    if (!r.ok) {
      setAccountInit({ ...prev, confirmAccept: false, error: r.discarded ? ACCOUNT_CHECK_FAILED_TEXT : r.error });
      return;
    }
    if (r.recheck) {
      setAccountInit({ ns: initNs, status: "checking" });
      runAccountInitCheck(initUserId, initNs);
      return;
    }
    await finishInit();
  };
  // F-5 outcomes shared by the device and guest flows. → true when the screen was set here.
  const showMigrationOutcome = async (u, flow) => {
    if (u.migration === "incomplete_accepted") {
      // Etap 8: the account's data was accepted as incomplete meanwhile — show the source choice that explains it
      runAccountInitCheck(initUserId, initNs, u.error);
      return true;
    }
    if (u.partial && flow === "device") {
      setAccountInit({ ns: initNs, status: "upload_partial", error: null });
      return true;
    }
    if (u.closed && u.row && u.row.status !== "completed") {
      setAccountInit({ ns: initNs, status: "migration_closed", flow, error: u.error });
      return true;
    }
    if (u.migration === "other_attempt" || u.error === MIGRATION_TEXTS.locked || migrationErrorKind({ message: u.error || "" }) === "in_progress") {
      const gate = await readMigrationGate(initUserId);
      if (!sameInit()) return true;
      setAccountInit({ ns: initNs, status: "migration_blocked", local: hasLocalAccountData(initUserId), gate, error: u.error });
      return true;
    }
    return false;
  };
  // back to the right screen: an unfinished flow of this device keeps its own screen, otherwise the normal check
  const routeInit = () => {
    if (!sameInit()) return;
    const m = getAccountInitMarker(initUserId);
    if (m && m.status === "uploading_device") setAccountInit({ ns: initNs, status: "upload_interrupted" });
    else if (m && m.status === "migrating_guest") setAccountInit({ ns: initNs, status: "guest_migration_interrupted" });
    else if (m && m.status === "loading_cloud") setAccountInit({ ns: initNs, status: "cloud_interrupted" });
    else runAccountInitCheck(initUserId, initNs);
  };
  const onGateChanged = (gate) => {
    if (!sameInit()) return;
    if (gate && gate.ok && !gate.blocking) {
      routeInit();
      return;
    }
    setAccountInit((cur) => ({ ...cur, gate }));
  };
  const chooseEmpty = async () => {
    if (!sameInit()) return;
    const op = beginInitOp();
    const prev = accountInit;
    let r;
    try {
      r = await startAccountEmpty(initUserId, refFor(op), !!(prev.cloud && prev.cloud.hasData));
    } catch (e) {
      r = { ok: false, error: failText(e) };
    }
    if (!isCurrentOp(op)) return;
    if (r.ok) await finishInit();
    else setAccountInit({ ...prev, error: r.discarded ? ACCOUNT_CHECK_FAILED_TEXT : r.error }); // Stage 4A.3: blocked / sync running / account check failed
  };
  const chooseCloud = async () => {
    if (!sameInit()) return;
    const prev = accountInit;
    // Stage 4A.3: a started workout / unsent changes / open conflicts block the load up front.
    const blocker = cloudRestoreBlocker(initUserId);
    if (blocker) {
      setAccountInit({ ...prev, error: blocker.message });
      return;
    }
    const op = beginInitOp();
    setAccountInit({ ...prev, status: "loading_cloud", error: null });
    let r;
    try {
      r = await loadAccountFromCloud(initUserId, refFor(op));
    } catch (e) {
      r = { ok: false, error: failText(e) };
    }
    if (!isCurrentOp(op)) return; // superseded (account / workspace changed) — result dropped
    if (r.alreadyReady) {
      await finishInit();
      return;
    }
    if (!r.ok) {
      const m = getAccountInitMarker(initUserId);
      // F-5: the load hit a migration lock (NR001) — nothing was applied; explain the lock (a resumed load
      // keeps its "loading_cloud" marker and comes back to its own screen after the lock is gone)
      if (!r.discarded && (r.blocked === "migration" || migrationErrorKind({ message: r.error || "" }) === "in_progress")) {
        const gate = await readMigrationGate(initUserId);
        if (!sameInit()) return;
        setAccountInit({ ns: initNs, status: "migration_blocked", local: hasLocalAccountData(initUserId), gate, error: null });
        return;
      }
      if (m && m.status === "loading_cloud") setAccountInit({ ns: initNs, status: "cloud_interrupted", error: r.discarded ? ACCOUNT_CHECK_FAILED_TEXT : r.error }); // interrupted load stays recognisable
      else if (r.blocked || r.discarded) setAccountInit({ ...prev, error: r.discarded ? ACCOUNT_CHECK_FAILED_TEXT : r.error }); // nothing changed — back to the screen it came from
      else setAccountInit({ ...prev, status: "error_load", error: r.error });
      return;
    }
    // Load the cloud state into React, fingerprint it, and STAY on the confirmation step: sync is
    // blocked until the user keeps the cloud data or goes back to the device snapshot.
    await reloadLocalData();
    if (!sameInit()) return;
    fixLastCloudRestoreFingerprint(initUserId);
    setSyncQueueState(loadSyncQueue());
    setAccountInit({ ns: initNs, status: "cloud_loaded", cloud: prev.cloud, local: prev.local });
  };
  // Stage 4A.3: interrupted load, device had no data before it → drop the partial data, decide again.
  const abandonInterruptedCloud = async () => {
    if (!sameInit()) return;
    const op = beginInitOp();
    const prev = accountInit;
    let r;
    try {
      r = await abandonInterruptedCloudLoad(initUserId, refFor(op));
    } catch (e) {
      r = { ok: false, error: failText(e) };
    }
    if (!isCurrentOp(op)) return;
    if (!r.ok) {
      setAccountInit({ ...prev, error: r.error || ACCOUNT_CHECK_FAILED_TEXT });
      return;
    }
    await reloadLocalData();
    if (!sameInit()) return;
    setSyncQueueState(loadSyncQueue());
    setAccountInit({ ns: initNs, status: "checking" });
    runAccountInitCheck(initUserId, initNs);
  };
  const confirmCloud = async () => {
    if (!sameInit()) return;
    // Stage 4A.3: the user keeps the cloud data — no rollback needed any more, so the pointer goes
    // FIRST (a crash in between leaves "pending" without a way back, never a stale pointer under "ready").
    clearLastCloudRestorePointer(initUserId); // the before-restore backup itself stays in the list
    setAccountInitMarker(initUserId, { status: "ready", source: "cloud", syncPaused: false });
    await finishInit();
  };
  // ---- Stage 4A.4: guest → empty account ----
  const runGuestMigration = async () => {
    if (!sameInit() || isGuestMigrationRunning()) return;
    const op = beginInitOp();
    const prev = accountInit;
    setAccountInit({ ns: initNs, status: "guest_migrating", error: null });
    let r;
    try {
      r = await migrateGuestToEmptyAccount(initUserId, refFor(op));
    } catch (e) {
      r = { ok: false, error: failText(e) };
    }
    if (!isCurrentOp(op)) return; // superseded — the newer flow owns the screen
    if (r.ok || r.alreadyReady) {
      await finishInit();
      if (r.ok && sameInit()) setGuestMigrationNotice({ draftKept: !!r.draftKept, cleanup: r.cleanup || null });
      return;
    }
    if (r.discarded) r = { ...r, error: ACCOUNT_CHECK_FAILED_TEXT };
    // Stage 4A.4 F-5 (Etap 6): partial upload → the partial screen; closed elsewhere / another attempt → explained
    if (r.partial) {
      setAccountInit({ ns: initNs, status: "guest_partial", partialUnknown: r.partial === "unknown", error: r.error });
      return;
    }
    if (await showMigrationOutcome(r, "guest")) return;
    const m = getAccountInitMarker(initUserId);
    if (m && m.status === "migrating_guest") {
      // the attempt exists (markers written): its own retry / abandon screen
      setAccountInit({ ns: initNs, status: prev.status === "guest_migration_interrupted" ? "guest_migration_interrupted" : "guest_migration_error", error: r.error });
      return;
    }
    if (r.blocked === "not_empty" || r.blocked === "cloud_changed" || r.blocked === "nothing" || r.blocked === "guest_other_account") {
      runAccountInitCheck(initUserId, initNs, r.error); // the offer no longer applies — decide again
      return;
    }
    // nothing was written — back to the offer, with the reason; a deleted-row collision can't be retried (4A.5)
    setAccountInit({ ...prev, ...(r.blocked === "deleted_collision" ? { migrationBlocked: true } : {}), error: r.error });
  };
  // "Nie teraz": the account starts as a new, empty account; the guest data stays where it is. Nothing is
  // backed up, marked or sent.
  const guestMigrationLater = async () => {
    if (!sameInit() || isGuestMigrationRunning()) return;
    setAccountInitMarker(initUserId, { status: "ready", source: "new", syncPaused: false });
    await finishInit();
  };
  const abandonGuest = async () => {
    if (!sameInit()) return;
    const op = beginInitOp();
    const prev = accountInit;
    let r;
    try {
      r = await abandonGuestMigration(initUserId, refFor(op));
    } catch (e) {
      r = { ok: false, error: failText(e) };
    }
    if (!isCurrentOp(op)) return;
    if (!r.ok && r.completed) {
      await runGuestMigration(); // already completed on the server → finish locally (no re-upload)
      return;
    }
    if (!r.ok && r.partial) {
      // F-5: part of this transfer is already in the cloud — it cannot be undone silently
      setAccountInit({ ns: initNs, status: "guest_partial", partialUnknown: r.partial === "unknown", error: r.error });
      return;
    }
    if (!r.ok) {
      setAccountInit({ ...prev, error: r.error || ACCOUNT_CHECK_FAILED_TEXT });
      return;
    }
    await reloadLocalData();
    if (!sameInit()) return;
    setSyncQueueState(loadSyncQueue());
    setAccountInit({ ns: initNs, status: "checking" });
    runAccountInitCheck(initUserId, initNs);
  };
  // F-4: explicit, confirmed unbinding of guest data held by another account's transfer; then decide again.
  const releaseGuestBinding = async () => {
    if (!sameInit()) return;
    const r = releaseGuestMigrationBinding(initUserId);
    if (!r.ok) {
      setAccountInit({ ...accountInit, error: r.error || ACCOUNT_CHECK_FAILED_TEXT });
      return;
    }
    setAccountInit({ ns: initNs, status: "checking" });
    runAccountInitCheck(initUserId, initNs);
  };
  // F-5: the conscious "start without the guest data" after a partial upload (sync stays paused).
  const startWithoutGuestPartial = async () => {
    if (!sameInit()) return;
    const op = beginInitOp();
    const prev = accountInit;
    let r;
    try {
      r = await startAccountWithoutGuestPartial(initUserId, refFor(op));
    } catch (e) {
      r = { ok: false, error: failText(e) };
    }
    if (!isCurrentOp(op)) return;
    if (!r.ok) {
      setAccountInit({ ...prev, confirmAccept: false, error: r.error || ACCOUNT_CHECK_FAILED_TEXT });
      return;
    }
    await finishInit();
  };
  const workOffline = async () => {
    // usable now, but NOT initialised: no marker → sync stays off and the next start checks again
    if (!sameInit()) return;
    await finishInit();
  };
  if (introDone && loaded && dataNamespaceLoaded && !accountInitReady && accountInit.ns === dataNs) {
    return (
      <AccountInitScreen
        init={accountInit}
        email={authUser && authUser.email}
        onChooseLocal={chooseLocal}
        onChooseCloud={chooseCloud}
        onChooseEmpty={chooseEmpty}
        onConfirmCloud={confirmCloud}
        deviceSnapshotStatus={initUserId ? resolveDeviceSnapshot(initUserId).status : "none"}
        onAbandonCloud={abandonInterruptedCloud}
        onRetryUpload={runDeviceUpload}
        onAbandonUpload={abandonDeviceUpload}
        onGuestMigrate={runGuestMigration}
        onGuestLater={guestMigrationLater}
        onGuestAbandon={abandonGuest}
        onGuestStartWithout={startWithoutGuestPartial}
        onGuestRelease={() => setAccountInit({ ...accountInit, confirmRelease: true, error: null })}
        onGuestReleaseConfirm={releaseGuestBinding}
        onRetry={routeInit}
        userId={initUserId}
        onGateChanged={onGateChanged}
        onConfirmStep={(patch) => setAccountInit({ ...accountInit, ...patch, error: null })}
        onUploadAcceptIncomplete={acceptDeviceIncomplete}
        onWorkOffline={workOffline}
        onBack={() => setAccountInit({ ...accountInit, status: "choice", error: null })}
      />
    );
  }

  if (!loaded || !dataReady) {
    // The start-up intro plays while the account's data is being loaded / checked (Stage 4A.2);
    // the data-source choice, if needed, comes right after it.
    if (!introDone) return <IntroAnimation onFinish={() => setIntroDone(true)} />;
    return (
      <div className="min-h-screen bg-app-depth flex items-center justify-center">
        <FontStyles />
        <span className="text-neutral-500 text-xs font-semibold uppercase" style={{ letterSpacing: "0.15em" }}>NextRep</span>
      </div>
    );
  }

  // Unfinished workout from a previous run (app closed, process killed, reload): offer to resume it.
  // (Stage: Dashboard draft card) No blocking "Niedokończony trening" prompt at start-up any more —
  // an unfinished workout is shown, resumed or discarded on the Dashboard card.

  // Plan editor overlay
  if (planEditorTarget !== undefined) {
    const pendingTemplate = planEditorTarget ? pendingTemplatePlans.get(planEditorTarget.id) : null;
    const editorExercises = pendingTemplate
      ? [...exercises, ...pendingTemplate.newExercises.filter((ne) => !exercises.some((e) => e.id === ne.id))]
      : exercises;
    return (
      <PlanEditor
        plan={planEditorTarget}
        exercises={editorExercises}
        onCancel={() => {
          if (planEditorTarget) pendingTemplatePlans.delete(planEditorTarget.id);
          window.history.back();
        }}
        onSave={(p) => {
          // "Zapisz plan" — the only place an edited ready-plan copy becomes a user plan.
          const pending = pendingTemplatePlans.get(p.id);
          if (pending) {
            pendingTemplatePlans.delete(p.id);
            if (pending.newExercises.length)
              updateExercises((prev) => [...prev, ...pending.newExercises.filter((ne) => !prev.some((e) => e.id === ne.id))]);
          }
          updatePlans((prev) => {
            const exists = prev.find((x) => x.id === p.id);
            const next = exists ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p];
            const extras = pending ? pending.extraPlans.filter((ep) => !next.some((x) => x.id === ep.id || x.name === ep.name)) : [];
            return [...next, ...extras];
          });
          window.history.back();
        }}
      />
    );
  }

  // Editing a past session: reuses ActiveWorkout in edit mode (same step-by-step, per-exercise
  // screen used to record a workout in the first place).
  if (editSessionTarget) {
    return (
      <>
      <ActiveWorkout
        isPro={isProEffective}
        onOpenUnlock={() => setProModalOpen(true)}
        // New exercise created mid-workout → the regular atlas (same gate as the "Ćwiczenia" screen,
        // incl. sync queueing). Never touches any plan.
        onCreateExercise={(ex) => updateExercises((prev) => (prev.some((e) => e.id === ex.id) ? prev : [...prev, ex]))}
        plan={null}
        exercises={exercises}
        history={history}
        backfillInfo={null}
        editingSession={editSessionTarget}
        // "Odrzuć zmiany": the edit only ever lived in ActiveWorkout's own working state, so
        // closing edit mode leaves the saved session exactly as it was, and historyDetail still
        // points at that same session → back to ITS summary. Closed directly: history.back() here
        // only popped the menu's history entry and closed the confirm dialog, so nothing happened.
        onCancel={() => setEditSessionTarget(null)}
        // "Zapisz": the only moment the session changes (analysis already recomputed by finish()).
        onSaveEdit={(updated) => {
          updateHistory((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
          setHistoryDetail(updated);
          setEditSessionTarget(null);
        }}
      />
      {proModalOpen && (
        <ProUnlockModal proStatus={proStatus} serverPro={serverProForModal} onClose={() => setProModalOpen(false)} onSetManualPro={setManualPro} onGrantAdUnlock={grantAdUnlock} />
      )}
      </>
    );
  }

  // Active workout overlay
  if (activeWorkoutPlan !== undefined) {
    return (
      <>
      <ActiveWorkout
        isPro={isProEffective}
        onOpenUnlock={() => setProModalOpen(true)}
        // New exercise created mid-workout → the regular atlas (same gate as the "Ćwiczenia" screen,
        // incl. sync queueing). Never touches any plan.
        onCreateExercise={(ex) => updateExercises((prev) => (prev.some((e) => e.id === ex.id) ? prev : [...prev, ex]))}
        plan={activeWorkoutPlan}
        exercises={exercises}
        history={history}
        backfillInfo={backfillInfo}
        resumeDraft={resumeDraft}
        onInterrupt={() => {
          // "Przerwij trening" / Back → "Opuść trening": the draft is KEPT (ActiveWorkout saved it
          // just now) and the view closes directly to the Dashboard, where it can be resumed or
          // discarded. Nothing is saved to history.
          setResumeDraft(null);
          setActiveWorkoutPlan(undefined);
          setBackfillInfo(null);
          setScreen("dashboard");
        }}
        onCancel={() => {
          // Discard path (kept for completeness; the live workout uses onInterrupt): nothing is
          // saved, the draft is removed, and the view closes directly.
          clearActiveWorkoutDraft();
          setResumeDraft(null);
          setActiveWorkoutPlan(undefined);
          setScreen(backfillInfo ? "history" : "plans");
          setBackfillInfo(null);
        }}
        onFinish={(session) => {
          updateHistory((prev) => [...prev, session]);
          clearActiveWorkoutDraft();
          setResumeDraft(null);
          setActiveWorkoutPlan(undefined);
          setBackfillInfo(null);
          setScreen("history");
          setHistoryDetail(session);
        }}
      />
      {proModalOpen && (
        <ProUnlockModal proStatus={proStatus} serverPro={serverProForModal} onClose={() => setProModalOpen(false)} onSetManualPro={setManualPro} onGrantAdUnlock={grantAdUnlock} />
      )}
      </>
    );
  }

  // Exercise detail overlay (checked first so it can be reached from within history detail,
  // returning to history detail — not the exercises list — when the user goes back)
  if (exerciseDetail) {
    const liveExercise = exercises.find((e) => e.id === exerciseDetail.id) || exerciseDetail;
    return (
      <>
        <ExerciseDetail
          exercise={liveExercise}
          history={history}
          onBack={() => window.history.back()}
          updateExercises={updateExercises}
          isPro={isProEffective}
          onOpenUnlock={() => setProModalOpen(true)}
        />
        {proModalOpen && (
          <ProUnlockModal proStatus={proStatus} serverPro={serverProForModal} onClose={() => setProModalOpen(false)} onSetManualPro={setManualPro} onGrantAdUnlock={grantAdUnlock} />
        )}
      </>
    );
  }

  // Full training report overlay
  if (trainingReportTarget) {
    return (
      <>
        {isProEffective ? (
          <TrainingReport
            session={trainingReportTarget}
            history={history}
            exercises={exercises}
            onBack={() => window.history.back()}
          />
        ) : (
          <ProPaywall onBack={() => window.history.back()} onOpenUnlock={() => setProModalOpen(true)} title="RAPORT TRENINGOWY" />
        )}
        {proModalOpen && (
          <ProUnlockModal proStatus={proStatus} serverPro={serverProForModal} onClose={() => setProModalOpen(false)} onSetManualPro={setManualPro} onGrantAdUnlock={grantAdUnlock} />
        )}
      </>
    );
  }

  // History detail overlay
  if (historyDetail) {
    return (
      <>
      <HistoryDetail
        session={historyDetail}
        exercises={exercises}
        history={history}
        onBack={() => window.history.back()}
        onOpenExercise={(ex) => {
          pushNavMarker();
          setExerciseDetail(ex);
        }}
        onStartEdit={(session) => {
          pushNavMarker();
          setEditSessionTarget(session);
        }}
        onOpenReport={(session) => {
          pushNavMarker();
          setTrainingReportTarget(session);
        }}
        isPro={isProEffective}
        onOpenUnlock={() => setProModalOpen(true)}
      />
      {proModalOpen && (
        <ProUnlockModal proStatus={proStatus} serverPro={serverProForModal} onClose={() => setProModalOpen(false)} onSetManualPro={setManualPro} onGrantAdUnlock={grantAdUnlock} />
      )}
      </>
    );
  }

  const screenContent = (() => {
    switch (screen) {
    case "welcome":
      return <OnboardingFlow userName={userName} onSaveName={saveUserName} onComplete={completeOnboarding} />;
    case "dashboard":
      return (
        <Dashboard
          history={history}
          exercises={exercises}
          onNavigate={goToScreen}
          onGoStart={() => goToScreen("startWorkout")}
          onOpenSession={(session) => {
            goToScreen("history");
            setHistoryDetail(session);
          }}
          onOpenReport={(session) => {
            pushNavMarker();
            setTrainingReportTarget(session);
          }}
          userName={userName}
          onSaveName={saveUserName}
          isPro={isProEffective}
          onOpenUnlock={() => setProModalOpen(true)}
          proHint={isProEffective ? null : computeProHint(history, exercises, proHints)}
          onHintShown={markHintShown}
          activeDraft={summarizeActiveWorkoutDraft(loadActiveWorkoutDraft())}
          onResumeDraft={() => {
            // exactly the existing resume path — the same draft object, as it was left
            const d = loadActiveWorkoutDraft();
            if (!d || !summarizeActiveWorkoutDraft(d)) return;
            setResumeDraft(d);
            setBackfillInfo(d.backfillInfo || null);
            setResumePrompt(null);
            pushNavMarker();
            setActiveWorkoutPlan(d.plan || null);
          }}
          onDiscardDraft={() => {
            clearActiveWorkoutDraft();
            setResumeDraft(null);
            setDraftTick((n) => n + 1);
          }}
          nextPlan={getNextPlan(plans, history)}
          onStartPlan={(p) => {
            // the existing start path ("Trening" → plan)
            pushNavMarker();
            setActiveWorkoutPlan(p);
          }}
        />
      );
    case "exercises":
      return (
        <ExercisesScreen
          exercises={exercises}
          updateExercises={updateExercises}
          onNavigate={goToScreen}
          onOpenDetail={(ex) => {
            pushNavMarker();
            setExerciseDetail(ex);
          }}
        />
      );
    case "plans":
      return (
        <PlansScreen
          plans={plans}
          exercises={exercises}
          updatePlans={updatePlans}
          updateExercises={updateExercises}
          onNavigate={goToScreen}
          onOpenEditor={(p) => {
            pushNavMarker();
            setPlanEditorTarget(p);
          }}
          isPro={isProEffective}
          onOpenUnlock={() => setProModalOpen(true)}
        />
      );
    case "startWorkout":
      return (
        <StartWorkoutScreen
          plans={plans}
          exercises={exercises}
          updatePlans={updatePlans}
          updateExercises={updateExercises}
          onNavigate={goToScreen}
          onSelectPlan={(p) => {
            pushNavMarker();
            setActiveWorkoutPlan(p);
          }}
          onNoPlan={() => {
            pushNavMarker();
            setActiveWorkoutPlan(null);
          }}
          isPro={isProEffective}
          onOpenUnlock={() => setProModalOpen(true)}
        />
      );
    case "stats":
      return isProEffective ? (
        <StatsScreen
          history={history}
          exercises={exercises}
          onNavigate={goToScreen}
          onOpenExercise={(ex) => {
            pushNavMarker();
            setExerciseDetail(ex);
          }}
        />
      ) : (
        <ProPaywall navScreen="stats" onNavigate={goToScreen} onOpenUnlock={() => setProModalOpen(true)} title="STATYSTYKI" />
      );
    case "history":
      return (
        <HistoryScreen
          history={history}
          plans={plans}
          exercises={exercises}
          updatePlans={updatePlans}
          updateExercises={updateExercises}
          onNavigate={goToScreen}
          onOpenDetail={(s) => {
            pushNavMarker();
            setHistoryDetail(s);
          }}
          onOpenReport={(s) => {
            pushNavMarker();
            setTrainingReportTarget(s);
          }}
          onDelete={(id) => updateHistory((prev) => prev.filter((s) => s.id !== id))}
          onStartBackfill={(meta) => {
            pushNavMarker();
            setBackfillInfo({ date: meta.date, durationMin: meta.durationMin });
            setActiveWorkoutPlan(meta.plan || null);
          }}
          isPro={isProEffective}
          onOpenUnlock={() => setProModalOpen(true)}
        />
      );
    case "measurements":
      return (
        <MeasurementsScreen
          measurements={measurements}
          updateMeasurements={updateMeasurements}
          customFields={customFields}
          updateCustomFields={updateCustomFields}
          onNavigate={goToScreen}
        />
      );
    case "more":
      return <MoreMenu onNavigate={goToScreen} isPro={isProEffective} onOpenUnlock={() => setProModalOpen(true)} authUser={authUser} isAdmin={isAdmin} />;
    case "admin":
      return (
        <AdminGate
          authUser={authUser}
          adminState={adminState}
          onExit={() => goToScreen("dashboard")}
          onPushNav={pushNavMarker}
          onProChanged={(id) => id === authUserId && refreshServerPro()}
        />
      );
    case "feedback":
      return <FeedbackScreen onNavigate={goToScreen} userName={userName} />;
    case "account":
      return (
        <AccountScreen
          onRechooseDataSource={async () => {
            if (!authUserId) return;
            const uid = authUserId;
            // Stage 4A.4 F-5 (Etap 6): never while this device's manual upload runs or its attempt is still open —
            // the marker is what lets the owner device finish that attempt with the same id
            if (_manualMigrationRunning || getOpenManualAttempt(uid)) return;
            const ns = dataNs;
            const op = beginInitOp();
            // Stage 4A.3: removing the marker first refuses every NEW sync / bootstrap run; a pass that
            // already started finishes its writes before the data is checked again.
            clearAccountInitMarker(uid);
            clearLastCloudRestorePointer(uid); // Stage 4A.3: a settled account's old snapshot is never offered again
            cancelAllScheduledSyncRetries(); // queued retries / a debounced sync of the old choice must not fire now
            cancelScheduledSync();
            setAccountInit({ ns, status: "checking" });
            await waitForSyncIdle(); // on timeout the check still runs — every destructive choice waits again
            if (initOpRef.current !== op) return; // superseded — the newer flow owns the screen
            // another account / workspace now → its own switch shows its screen. Otherwise always go on to
            // the (read-only) check, even if a session re-check would fail right now: never leave "checking" up.
            if ((authUserRef.current && authUserRef.current.id) !== uid || getActiveDataNamespace() !== ns) return;
            const decided = getAccountInitMarker(uid);
            if (decided && decided.status === "ready") {
              setAccountInit({ ns, status: "ready" }); // decided meanwhile (e.g. another tab) — leave it
              return;
            }
            runAccountInitCheck(uid, ns);
          }}
          onNavigate={goToScreen}
          authUser={authUser}
          authLoaded={authLoaded}
          reloadLocalData={reloadLocalData}
          isOnline={isOnline}
          syncQueueState={syncQueueState}
          onSyncQueueChange={setSyncQueueState}
        />
      );
    case "conflictCenter":
      return <ConflictCenterScreen onNavigate={goToScreen} exercises={exercises} isOnline={isOnline} />;
    case "login":
      return <LoginScreen onNavigate={goToScreen} />;
    case "register":
      return <RegisterScreen onNavigate={goToScreen} />;
    case "forgotPassword":
      return <ForgotPasswordScreen onNavigate={goToScreen} />;
    case "resetPassword":
      return <ResetPasswordScreen onNavigate={goToScreen} />;
    default:
      return null;
  }
  })();

  if (!introDone) {
    return <IntroAnimation onFinish={() => setIntroDone(true)} />;
  }

  return (
    <>
      <React.Fragment key={`${screen}:${navResetKey}`}>{screenContent}</React.Fragment>
      {(() => {
        const g = migrationGateView && authUserId && migrationGateView.userId === authUserId && dataReady ? migrationGateView : null;
        const d = migrationGateDescription(g);
        const key = d ? `${d.kind}:${(d.row && d.row.attempt_id) || ""}` : null;
        if (!d || key === migrationBannerHidden || screen === "account") return null;
        return (
          <div className="fixed inset-x-0 top-0 z-50 px-4 pt-2 flex justify-center" data-testid="migration-banner" data-kind={d.kind}>
            <div className="w-full max-w-sm bg-neutral-900 border border-amber-500/60 rounded-2xl p-3 shadow-lg">
              <p className="text-amber-400 text-xs leading-relaxed">{d.text}</p>
              {d.lastText && <p className="text-neutral-400 text-xs mt-1">{d.lastText}</p>}
              <div className="flex gap-2 mt-2">
                <button onClick={() => goToScreen("account")} className="flex-1 py-1.5 rounded-xl bg-orange-500 text-neutral-950 font-bold text-xs" data-testid="migration-banner-details">
                  Szczegóły
                </button>
                <button onClick={() => setMigrationBannerHidden(key)} className="flex-1 py-1.5 rounded-xl bg-neutral-800 text-neutral-100 font-semibold text-xs" data-testid="migration-banner-hide">
                  Ukryj
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {sessionRecoveredNotice && (
        <div className="fixed inset-x-0 bottom-24 z-50 px-4 flex justify-center" data-testid="session-recovered-notice">
          <div className="w-full max-w-sm bg-neutral-900 border border-orange-500/60 rounded-2xl p-4 shadow-lg">
            <p className="text-neutral-50 text-sm font-semibold mb-1">Sesja konta została odzyskana</p>
            <p className="text-neutral-400 text-xs leading-relaxed mb-3">Aplikacja przełączyła się na dane Twojego konta. Trening wykonany bez logowania pozostał w danych gościa.</p>
            <button onClick={() => setSessionRecoveredNotice(false)} className="w-full py-2 rounded-xl bg-orange-500 text-neutral-950 font-bold text-sm">OK</button>
          </div>
        </div>
      )}
      {guestMigrationNotice && (
        <div className="fixed inset-x-0 bottom-24 z-50 px-4 flex justify-center" data-testid="guest-migration-done">
          <div className="w-full max-w-sm bg-neutral-900 border border-orange-500/60 rounded-2xl p-4 shadow-lg">
            <p className="text-neutral-50 text-sm font-semibold mb-1">Zakończone dane zostały przeniesione na konto</p>
            {guestMigrationNotice.draftKept && (
              <p className="text-neutral-300 text-xs leading-relaxed mb-1" data-testid="guest-migration-draft-kept">Niedokończony trening pozostał w trybie bez logowania.</p>
            )}
            <p className="text-neutral-400 text-xs leading-relaxed mb-3" data-testid="guest-migration-cleanup">
              {guestMigrationNotice.cleanup === "done"
                ? "Przeniesione dane usunięto z trybu bez logowania — ich kopia zapasowa jest zachowana."
                : guestMigrationNotice.cleanup === "skipped_changed"
                ? "Dane w trybie bez logowania zmieniły się w trakcie przenoszenia, więc zostały tam bez zmian."
                : guestMigrationNotice.cleanup === "failed"
                ? "Nie udało się usunąć przeniesionych danych z trybu bez logowania — aplikacja spróbuje ponownie później. Konto jest w pełni gotowe."
                : "Dane w trybie bez logowania pozostały bez zmian."}
            </p>
            <button onClick={() => setGuestMigrationNotice(null)} className="w-full py-2 rounded-xl bg-orange-500 text-neutral-950 font-bold text-sm">OK</button>
          </div>
        </div>
      )}
      {proModalOpen && (
        <ProUnlockModal proStatus={proStatus} serverPro={serverProForModal} onClose={() => setProModalOpen(false)} onSetManualPro={setManualPro} onGrantAdUnlock={grantAdUnlock} />
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);















