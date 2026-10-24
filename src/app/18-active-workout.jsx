
// Builds one exercise's live workout state: exactly as many rows as the plan's series (no more,
// no fewer — extra rows can only come from an explicitly added dropset), each independently
// pre-filled from THIS exercise's own history/progression suggestion (never from another
// exercise in the same superset, which was the source of the old weight-carry-over bug).
function buildWorkoutItem(planItem, exercises, history, nowDate, planId) {
  // I3: an atlas exercise (catalogExerciseId) is shown from the atlas and gets its load snapshot v3 now
  const atlasView = planItem.catalogExerciseId ? atlasExerciseView(planItem.catalogExerciseId) : null;
  const ex = atlasView || exercises.find((e) => e.id === planItem.exerciseId);
  const kind = atlasView ? atlasView.kind : getExerciseKind(ex);
  const setsDetail = getPlanItemSetsDetail(planItem);
  const matches = findMatchingSessions(history, {
    exerciseId: planItem.exerciseId,
    beforeDate: nowDate,
  });
  const priorSession = matches[0] || null;
  const priorData = priorSession?.exercises.find((e) => e.exerciseId === planItem.exerciseId) || null;
  const priorSets = priorData?.sets || [];
  // Always the CURRENT engine: the latest performance is analyzed live against the current plan
  // (setsDetail) and its own earlier history (never data from after it). A recommendation stored
  // inside an old session (possibly written by older logic, e.g. a fixed "+2,5 kg") is kept in the
  // data as a historical record, but is never shown in an active workout.
  const analysis =
    kind === "cardio"
      ? null
      : priorSets.length
      ? computeExerciseAnalysis({
          sets: priorSets,
          kind,
          setsDetail,
          history: matches.slice(1, PROGRESSION_MAX_PERFORMANCES).map((m) => ({
            sets: m.exercises.find((e) => e.exerciseId === planItem.exerciseId)?.sets || [],
            date: m.date,
          })),
          date: priorSession.date,
        })
      : null;
  const suggestedWeight = analysis?.suggestedWeight ?? null;
  const suggestedFirstSetWeight = analysis?.suggestedFirstSetWeight ?? suggestedWeight;
  const usesWeight = kind === "weight" || kind === "bodyweightPlus";

  return {
    id: uid(), // this workout's own execution-instance identity for this exercise — independent
    // of planItemId (which stays tied to the plan's own item and is reused every time that plan
    // is run). Every new session.exercises[] entry gets one of these from the moment it's created.
    planItemId: planItem.id,
    exerciseId: planItem.exerciseId,
    ...(atlasView ? { catalogExerciseId: atlasView.catalogExerciseId, loadSnapshot: atlasLoadSnapshot(atlasView.catalogExerciseId, planItem.loadModel ?? null) } : {}),
    name: ex?.name || "Ćwiczenie",
    videoUrl: ex?.videoUrl || "",
    deviceType: ex?.deviceType || "",
    type: kind,
    setsDetail,
    restSeconds: planItem.restSeconds,
    priorSets,
    priorMessage: analysis?.message || null,
    priorStatus: analysis?.status || null,
    sets: setsDetail.map((sd, i) => {
      // First set gets the warm-up weight (equal to the target weight unless the prior session
      // ended on a heavier weight than it started — then the first set stays at that lighter
      // weight and later sets carry the heavier target).
      const rowWeight = i === 0 ? suggestedFirstSetWeight : suggestedWeight;
      return {
        id: newUuid(), // this set INSTANCE's own identity in this workout (never the plan template id)
        detailId: sd.id, // local link to its setsDetail entry (targets/RIR) — local model only, not synced
        weight: usesWeight && rowWeight != null ? String(rowWeight) : "",
        reps: "",
        duration: "",
        speed: "",
        incline: "",
        rir: "",
        note: "",
        setType: "normal",
        done: false,
        fromSuggestion: usesWeight && rowWeight != null,
      };
    }),
  };
}

function buildBlocksFromPlan(plan, exercises, history, nowDate) {
  const blocks = [];
  let i = 0;
  while (i < plan.exercises.length) {
    const item = plan.exercises[i];
    if (item.supersetGroup) {
      const group = [item];
      let j = i + 1;
      while (j < plan.exercises.length && plan.exercises[j].supersetGroup === item.supersetGroup) {
        group.push(plan.exercises[j]);
        j++;
      }
      blocks.push({ id: uid(), items: group });
      i = j;
    } else {
      blocks.push({ id: uid(), items: [item] });
      i++;
    }
  }
  return blocks.map((b) => ({
    ...b,
    items: b.items.map((it) => buildWorkoutItem(it, exercises, history, nowDate, plan.id)),
  }));
}

// Whether a row actually has performed data (used to decide what counts toward totals/history —
// empty planned rows the person skipped don't get saved as if they happened).
function isSetPerformed(s, kind) {
  if (kind === "time" || kind === "cardio") return s.duration !== "" && s.duration != null && Number(s.duration) > 0;
  if (kind === "sets") return s.done || (s.weight !== "" && s.weight != null);
  return s.reps !== "" && s.reps != null && Number(s.reps) > 0;
}

function buildBlocksFromSession(session, exercises) {
  return session.exercises.map((ex) => {
    const liveEx = exercises?.find((e) => e.id === ex.exerciseId);
    return {
      id: uid(),
      items: [
        {
          id: ex.id || uid(), // preserve the persisted history-exercise id across an edit round-trip;
          // fresh uid() only as a defensive fallback for data somehow not yet normalized.
          planItemId: uid(),
          exerciseId: ex.exerciseId,
          ...atlasRefFields(ex), // I3: the saved snapshot is kept, never rebuilt
          name: ex.name,
          type: ex.type,
          videoUrl: liveEx?.videoUrl || "",
          deviceType: liveEx?.deviceType || "",
          setsDetail: ex.setsDetail && ex.setsDetail.length ? ex.setsDetail : ex.sets.map((s) => ({ id: s.detailId ?? s.id })),
          restSeconds: 90,
          priorSets: [],
          priorMessage: null,
          priorStatus: null,
          sets: ex.sets.map((s) => ({
            id: s.id,
            ...(s.detailId != null ? { detailId: s.detailId } : {}),
            weight: s.weight != null ? String(s.weight) : "",
            reps: s.reps != null ? String(s.reps) : "",
            duration: s.duration != null ? String(s.duration) : "",
            speed: s.speed != null ? String(s.speed) : "",
            incline: s.incline != null ? String(s.incline) : "",
            distance: s.distance != null ? String(s.distance) : "",
            kcal: s.kcal != null ? String(s.kcal) : "",
            resistance: s.resistance != null ? String(s.resistance) : "",
            pace: s.pace != null ? String(s.pace) : "",
            level: s.level != null ? String(s.level) : "",
            floors: s.floors != null ? String(s.floors) : "",
            heartRate: s.heartRate != null ? String(s.heartRate) : "",
            rir: s.rir != null ? String(s.rir) : "",
            note: s.note || "",
            setType: s.setType || "normal",
            done: s.done || false,
            fromSuggestion: false,
          })),
        },
      ],
    };
  });
}

// The dedicated cardio session UI — one continuous entry (never a table of planned sets), with a
// real Start/Pause/Resume/Finish timer and only the fields that make sense for the chosen device.
// kcal is always typed in by hand (from the machine/watch) — this never estimates or calculates
// it from assumptions.
function CardioEntryPanel({ set, deviceType, onPatch }) {
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(() => Number(set.duration) || 0);

  useEffect(() => {
    if (!timerRunning) return;
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [timerRunning]);

  useEffect(() => {
    let wakeLock = null;
    async function acquire() {
      try {
        if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
      } catch {}
    }
    if (timerRunning) acquire();
    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [timerRunning]);

  const commitElapsed = (sec) => {
    setElapsedSec(sec);
    onPatch({ duration: String(sec) });
  };

  const fields = CARDIO_DEVICE_FIELDS[deviceType] || CARDIO_DEVICE_FIELDS["Inne"];

  return (
    <div className="mt-4">
      <div className="bg-neutral-900 border border-rose-500/30 rounded-2xl p-4 text-center">
        <p className="text-neutral-500 text-xs uppercase font-semibold mb-1">Czas</p>
        <p className="font-display text-5xl text-neutral-50 tracking-wide tabular-nums">{fmtClock(elapsedSec)}</p>
        <div className="flex gap-2 mt-3">
          {!timerRunning ? (
            <button
              onClick={() => setTimerRunning(true)}
              className="flex-1 py-3 rounded-xl bg-rose-500 text-neutral-950 font-bold flex items-center justify-center gap-2"
            >
              <PlayCircle size={18} /> {elapsedSec > 0 ? "Wznów" : "Start"}
            </button>
          ) : (
            <button
              onClick={() => {
                setTimerRunning(false);
                commitElapsed(elapsedSec);
              }}
              className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-200 font-bold flex items-center justify-center gap-2"
            >
              Pauza
            </button>
          )}
          <button
            onClick={() => {
              setTimerRunning(false);
              commitElapsed(0);
            }}
            className="px-4 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold text-sm"
          >
            Reset
          </button>
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="text-neutral-500 text-xs">Popraw ręcznie (sekundy):</span>
          <input
            type="number"
            min={0}
            value={elapsedSec}
            onChange={(e) => commitElapsed(Math.max(0, Number(e.target.value) || 0))}
            className="w-20 bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-neutral-200 text-sm text-center"
          />
        </div>
        <p className="text-neutral-600 text-xs mt-2">{timerRunning ? "Ekran nie zgaśnie, dopóki timer działa." : "Uruchom, żeby zapobiec wygaszeniu ekranu."}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        {fields.map((f) => {
          const meta = CARDIO_FIELD_LABELS[f];
          return (
            <div key={f} className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
              <label className="text-neutral-500 text-xs uppercase font-semibold">
                {meta.label}
                {meta.unit ? ` (${meta.unit})` : ""}
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={set[f] || ""}
                onChange={(e) => onPatch({ [f]: e.target.value })}
                placeholder="—"
                className="w-full mt-1 bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-2 text-neutral-100 text-lg font-display tracking-wide outline-none focus:border-rose-500"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <label className="text-neutral-500 text-xs uppercase font-semibold">Notatka (opcjonalnie)</label>
        <input
          value={set.note || ""}
          onChange={(e) => onPatch({ note: e.target.value })}
          placeholder="np. samopoczucie, warunki..."
          className="w-full mt-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-neutral-200 text-sm outline-none focus:border-rose-500"
        />
      </div>
    </div>
  );
}

// Did the person already type anything for this exercise in the current workout?
function itemHasEnteredData(item) {
  return (item?.sets || []).some(
    (s) => isSetPerformed(s, item.type) || [s.reps, s.duration, s.rir, s.note, s.distance, s.kcal].some((v) => v != null && String(v).trim() !== "")
  );
}

function ActiveWorkout({ plan, exercises, history, backfillInfo, editingSession, resumeDraft, onFinish, onSaveEdit, onCancel, onInterrupt, onCreateExercise, isPro = false, onOpenUnlock }) {
  // App-update guard: while a workout is open its state exists only in memory, so the update
  // checker in index.html must never reload the page now — it applies the update afterwards.
  useEffect(() => {
    window.__nextrepBusy = true;
    return () => {
      window.__nextrepBusy = false;
      try { window.dispatchEvent(new Event("nextrep-idle")); } catch {}
    };
  }, []);
  // Fixed at mount: for a live workout this is "now"; for a backfilled past workout it's the
  // date being entered. Every history lookup below only ever looks strictly before this date,
  // so a backfilled session can never see data from a session that happened later.
  // A resumed draft (unfinished workout restored after the app was closed/killed) restores the
  // workout exactly as it was: same series, same position, same start time.
  const draftInit = !editingSession && resumeDraft ? resumeDraft : null;
  const [nowDate] = useState(() => (draftInit?.nowDate ? draftInit.nowDate : backfillInfo ? backfillInfo.date : new Date().toISOString()));
  const [blocks, setBlocks] = useState(() =>
    draftInit
      ? draftInit.blocks
      : editingSession
      ? buildBlocksFromSession(editingSession, exercises)
      : plan
      ? buildBlocksFromPlan(plan, exercises, history, nowDate)
      : []
  );
  const [blockIdx, setBlockIdx] = useState(() => (draftInit && Number.isInteger(draftInit.blockIdx) ? Math.min(draftInit.blockIdx, Math.max(0, draftInit.blocks.length - 1)) : 0));
  const [subIdx, setSubIdx] = useState(() => (draftInit && Number.isInteger(draftInit.subIdx) ? draftInit.subIdx : 0)); // which exercise inside a superset block
  const [startTime] = useState(() => (draftInit && draftInit.startTime ? draftInit.startTime : Date.now()));
  const [elapsed, setElapsed] = useState(0);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPriorDetail, setShowPriorDetail] = useState(false);
  // "Zalecenie na dzisiejszy trening" — its own, independent open/closed state (not an accordion
  // with "Poprzednie wykonanie": both, either or none may be open).
  const [showRecommendation, setShowRecommendation] = useState(true);
  // Replace-exercise flow: null | { step: "target" } | { step: "pick", bi, ii } | { step: "confirm", bi, ii, newExerciseId }
  const [replaceFlow, setReplaceFlow] = useState(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  // Back-filled workout: its date stays editable while entering sets (resumed from the draft if any).
  const [backfillDate, setBackfillDate] = useState(() => (draftInit && draftInit.backfillInfo && draftInit.backfillInfo.date) || (backfillInfo && backfillInfo.date) || null);
  const [manualDuration, setManualDuration] = useState(() => (draftInit && draftInit.manualDuration != null ? draftInit.manualDuration : backfillInfo?.durationMin || 45));
  // Android/system Back dialog: null | "leave" | "choose" | "confirmFinish" | "confirmCancel".
  const [leaveStep, setLeaveStep] = useState(null);
  const [openNoteId, setOpenNoteId] = useState(null);
  const [editDate, setEditDate] = useState(() => (editingSession ? toLocalDateStr(editingSession.date) : null));
  const [editName, setEditName] = useState(() => (editingSession ? editingSession.planName || "" : ""));

  // Rest timer — one shared value per superset (fires per round, not per exercise), started
  // manually by the person rather than auto-popping, per how they want to use it.
  const [restActive, setRestActive] = useState(false);
  const [restTarget, setRestTarget] = useState(90);
  const [restRemaining, setRestRemaining] = useState(90);
  const [restRunning, setRestRunning] = useState(false);
  // Absolute epoch-ms deadline for the running countdown, not a tick count — see the audited
  // effect below for why.
  const restEndAtRef = useRef(null);
  const restRunningRef = useRef(false);
  restRunningRef.current = restRunning;
  // Pending automatic reset after the end signal (cleared by any manual timer action).
  const restAutoResetRef = useRef(null);
  const clearRestAutoReset = () => {
    if (restAutoResetRef.current) {
      clearTimeout(restAutoResetRef.current);
      restAutoResetRef.current = null;
    }
  };
  const restTargetRef = useRef(90);

  // Exercise stopwatch — for time-based (and cardio) sets, a real Start/Stop/Reset timer rather
  // than only manual entry. Only one row's stopwatch panel is open at a time.
  const [timerRowId, setTimerRowId] = useState(null);
  const [timerSec, setTimerSec] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  // --- Active workout draft (live workouts only; editing a saved session is not a draft) ---
  // Every change to the series (weight, reps, RIR, notes, added/removed exercises or sets, order,
  // current position) is written synchronously to trainapp_active_workout_draft_v1. It is never
  // a completed session: only finish() adds a session to history, and finishing/interrupting
  // clears the draft.
  const isLiveWorkout = !editingSession;
  // SEC-HF-01: this workout's own identity (kept in its draft) and the id its finished session gets —
  // both stable across retries, interruptions and app restarts (taken from the draft when resumed).
  // `legacy`: resuming a draft saved before these ids existed (it is adopted, never reset).
  const [workoutOwner] = useState(() => ({
    id: (draftInit && draftInit.workoutInstanceId) || newUuid(),
    legacy: Boolean(draftInit && !draftInit.workoutInstanceId),
  }));
  // The session id is created at the first finish attempt (as before: same moment, same generator)
  // and from then on kept in the draft, so every retry — also after a restart — reuses it.
  const sessionIdRef = useRef((draftInit && draftInit.sessionId) || null);
  const draftDataRef = useRef(null);
  draftDataRef.current = { workoutInstanceId: workoutOwner.id, sessionId: sessionIdRef.current, plan: plan || null, backfillInfo: backfillInfo ? { ...backfillInfo, date: backfillDate || backfillInfo.date } : null, nowDate, startTime, blocks, blockIdx, subIdx, manualDuration };
  // SEC-HF-01 (P1-A): "ok" = the latest state is on disk; "storage" = the write failed (progress
  // only in memory); "conflict" = another unfinished workout owns the draft slot (never overwritten).
  const [draftSaveStatus, setDraftSaveStatus] = useState("ok");
  const saveDraftNow = useCallback(() => {
    if (!isLiveWorkout || !draftDataRef.current) return true;
    const r = saveActiveWorkoutDraft(draftDataRef.current, workoutOwner);
    setDraftSaveStatus(r.ok ? "ok" : r.reason || "storage");
    return r.ok;
  }, [isLiveWorkout, workoutOwner]);
  const progressNotSaved = isLiveWorkout && draftSaveStatus !== "ok";
  // "Przerwij trening" (menu) / "Opuść trening" (Back): the draft is KEPT (saved right now) and the
  // view goes to the Dashboard, where the workout can be resumed, or discarded. Nothing goes to history.
  // SEC-HF-01: when the progress cannot be saved, the workout stays open (leaving would lose it);
  // leaving anyway needs the explicit `force` choice in the dialog.
  const [leaveUnsaved, setLeaveUnsaved] = useState(false);
  const interruptWorkout = (force = false) => {
    if (!saveDraftNow() && force !== true) {
      setConfirmFinish(false);
      setLeaveUnsaved(true);
      setLeaveStep("leave");
      return;
    }
    activeWorkoutOverlayRef.current = null;
    if (onInterrupt) onInterrupt();
    else onCancel(workoutOwner);
  };
  useEffect(() => {
    saveDraftNow();
  }, [blocks, blockIdx, subIdx, manualDuration, backfillDate, saveDraftNow]);
  useEffect(() => {
    if (!isLiveWorkout) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") saveDraftNow();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", saveDraftNow);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", saveDraftNow);
    };
  }, [isLiveWorkout, saveDraftNow]);

  // System/Android Back on the workout itself (no overlay open): the root popstate handler calls
  // this — the draft is saved FIRST, then the dialog opens. The dialog has no history entry of its
  // own; the guard is topped up again on the next tap (see the listener below).
  const openLeaveDialog = useCallback(() => {
    saveDraftNow();
    setMenuOpen(false);
    setAddPickerOpen(false);
    setReplaceFlow(null);
    setConfirmFinish(false);
    setLeaveStep("leave");
  }, [saveDraftNow]);
  useEffect(() => {
    if (!isLiveWorkout) return;
    activeWorkoutBackRef.current = openLeaveDialog;
    return () => {
      activeWorkoutBackRef.current = null;
    };
  }, [isLiveWorkout, openLeaveDialog]);

  // Tops the Back guard up to ACTIVE_WORKOUT_GUARD_DEPTH entries on each tap — inside a real user
  // gesture, so Chrome keeps these entries (never skippable). Bounded: never more than that many
  // guard entries, so history can't grow without limit. Taps on the final "Zakończ trening" /
  // "Przerwij trening" confirmations (data-no-rearm) don't top up — the workout ends there.
  useEffect(() => {
    if (!isLiveWorkout) return;
    activeWorkoutGuard.depth = 0;
    const rearm = (e) => {
      if (e && e.target && e.target.closest && e.target.closest("[data-no-rearm]")) return;
      while (activeWorkoutGuard.depth < ACTIVE_WORKOUT_GUARD_DEPTH) {
        try {
          window.history.pushState({ trainapp: true }, "", "");
        } catch {
          break;
        }
        activeWorkoutGuard.depth++;
      }
    };
    document.addEventListener("click", rearm, true);
    return () => {
      document.removeEventListener("click", rearm, true);
      activeWorkoutGuard.depth = 0;
    };
  }, [isLiveWorkout]);

  // Keeps the shared activeWorkoutOverlayRef pointed at "close whichever of my own overlays is
  // topmost" whenever one is open, and clears it when none are — so a hardware/gesture back press
  // closes just that overlay and never falls through to exiting or ending the workout itself.
  useEffect(() => {
    if (leaveStep) {
      // Back while the leave dialog is open: that Back used up a guard entry too.
      activeWorkoutOverlayRef.current = () => {
        consumeActiveWorkoutGuard();
        setLeaveStep(null);
      };
    } else if (menuOpen) {
      activeWorkoutOverlayRef.current = () => setMenuOpen(false);
    } else if (confirmFinish) {
      activeWorkoutOverlayRef.current = () => setConfirmFinish(false);
    } else if (replaceFlow) {
      activeWorkoutOverlayRef.current = () => setReplaceFlow(null);
    } else if (addPickerOpen) {
      activeWorkoutOverlayRef.current = () => setAddPickerOpen(false);
    } else {
      activeWorkoutOverlayRef.current = null;
    }
    return () => {
      activeWorkoutOverlayRef.current = null;
    };
  }, [leaveStep, menuOpen, confirmFinish, addPickerOpen, replaceFlow]);

  const openAddPicker = () => {
    try {
      window.history.pushState({ trainapp: true }, "", "");
    } catch {}
    setAddPickerOpen(true);
  };
  const openMenu = () => {
    try {
      window.history.pushState({ trainapp: true }, "", "");
    } catch {}
    setMenuOpen(true);
  };

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startTime]);

  // AUDITED (Step: rest timer real-time audit): setInterval ticks are NOT reliable while the
  // screen is off or the tab/PWA is backgrounded — mobile browsers throttle or fully suspend
  // background timers, so a naive "subtract 1 each tick" counter silently falls behind (or, if
  // ticks were ever double-fired, ahead) of the real time that actually passed. Fixed by
  // measuring against a real wall-clock deadline instead of counting ticks: restEndAtRef holds
  // the absolute Date.now() timestamp the countdown should hit zero at (set once, when the
  // countdown starts or resumes, from the remaining time at that moment), and every tick —
  // however late it actually fires — recomputes remaining as (deadline - Date.now()), which is
  // self-correcting regardless of how long the interval was throttled. A visibilitychange
  // listener forces one extra recompute the instant the screen/tab comes back, so the display is
  // never stale even if the next setInterval tick hasn't fired yet.
  useEffect(() => {
    if (!restRunning) return;
    restEndAtRef.current = Date.now() + restRemaining * 1000;
    restSignal.schedule(restRemaining);

    let ended = false;
    const tick = () => {
      if (ended) return;
      const remain = Math.max(0, Math.round((restEndAtRef.current - Date.now()) / 1000));
      setRestRemaining(remain);
      if (remain <= 0) {
        // 0:00 → signal FIRST (sound + vibration, whichever is available) → then, a moment later,
        // back to the starting value. Never starts a new countdown by itself.
        // 0:00 → signal once (sound + vibration) → stays stopped at 0:00. Never starts a new rest.
        ended = true;
        setRestRunning(false);
        restSignal.end();
        clearRestAutoReset();
      }
    };

    const t = setInterval(tick, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      if (!ended) restSignal.cancelScheduled(); // paused / reset / left — no beep later
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restRunning]);
  useEffect(() => () => clearRestAutoReset(), []);

  useEffect(() => {
    if (!timerRunning) return;
    const t = setInterval(() => setTimerSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [timerRunning]);

  // Screen Wake Lock: keeps the screen ON (not dimming/locking) while the rest timer or the
  // exercise stopwatch runs, so the countdown/count-up stays visible without you touching the
  // phone. A web page genuinely cannot draw on the OS lock screen itself — this is the closest
  // real equivalent the platform allows.
  useEffect(() => {
    let wakeLock = null;
    let released = false;
    async function acquire() {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch {}
    }
    if (restRunning || timerRunning) acquire();
    const onVisible = () => {
      if (!released && (restRunning || timerRunning) && document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [restRunning, timerRunning]);

  const currentBlock = blocks[blockIdx];
  const currentEx = currentBlock?.items[subIdx];

  useEffect(() => {
    setTimerRowId(null);
    setTimerRunning(false);
    setShowPriorDetail(false);
    // The rest panel may stay open between exercises: a rest that isn't running takes the plan's
    // value of the exercise now on screen (a running one is never interrupted).
    if (!restRunningRef.current) {
      const secs = (currentEx && currentEx.restSeconds) || 90;
      clearRestAutoReset();
      restTargetRef.current = secs;
      setRestTarget(secs);
      setRestRemaining(secs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockIdx, subIdx]);

  const patchSet = (setId, patch) => {
    setBlocks((prev) => {
      const next = prev.map((b) => ({ ...b, items: b.items.map((it) => ({ ...it, sets: it.sets.map((s) => ({ ...s })) })) }));
      const item = next[blockIdx].items[subIdx];
      item.sets = item.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s));
      return next;
    });
  };

  // Opens the stopwatch panel for one row, starting from whatever duration is already there
  // (0 if empty) so resuming a run you already started makes sense.
  const openTimerForRow = (setId, currentDuration) => {
    if (timerRowId === setId) {
      setTimerRowId(null);
      setTimerRunning(false);
      return;
    }
    setTimerRowId(setId);
    setTimerSec(Number(currentDuration) || 0);
    setTimerRunning(false);
  };

  // Stops the clock and writes the elapsed time into the row — from there it's just a normal
  // editable number, so it can still be manually corrected afterwards.
  const saveTimerToRow = () => {
    if (timerRowId) patchSet(timerRowId, { duration: String(timerSec) });
    setTimerRunning(false);
    setTimerRowId(null);
  };

  const addDropset = () => {
    setBlocks((prev) => {
      const next = prev.map((b) => ({ ...b, items: b.items.map((it) => ({ ...it, sets: [...it.sets] })) }));
      const item = next[blockIdx].items[subIdx];
      item.sets = [
        ...item.sets,
        { id: newUuid(), weight: "", reps: "", duration: "", rir: "0", note: "", setType: "dropset", done: false, fromSuggestion: false },
      ];
      return next;
    });
  };

  const removeDropset = (setId) => {
    setBlocks((prev) => {
      const next = prev.map((b) => ({ ...b, items: b.items.map((it) => ({ ...it, sets: [...it.sets] })) }));
      const item = next[blockIdx].items[subIdx];
      item.sets = item.sets.filter((s) => s.id !== setId);
      return next;
    });
  };

  const addExerciseAdHoc = (exerciseId, loadModel = null) => {
    const syntheticItem = { id: uid(), ...pickedExerciseFields(exerciseId, loadModel, exercises), restSeconds: 90, setsDetail: [{ id: uid() }, { id: uid() }, { id: uid() }] };
    // matchPlan=false: an ad-hoc, no-plan exercise looks at its own history regardless of plan.
    const built = editingSession
      ? { ...buildWorkoutItem(syntheticItem, exercises, history, nowDate, null), priorSets: [], priorMessage: null, priorStatus: null }
      : buildWorkoutItem(syntheticItem, exercises, history, nowDate, null);
    setBlocks((prev) => [...prev, { id: uid(), items: [built] }]);
    setBlockIdx(blocks.length);
    setSubIdx(0);
    setAddPickerOpen(false);
  };

  // Replaces one exercise of THIS workout in place: same block (so a superset keeps its grouping
  // and order), same position, same series structure / rest; the new exercise gets its own
  // exerciseId, its own (possibly empty) history and analysis — results typed for the old
  // exercise are not carried over. The source plan and all saved history are untouched.
  const replaceExercise = (bi, ii, newExerciseId, newLoadModel = null) => {
    const oldItem = blocks[bi]?.items[ii];
    if (!oldItem) return;
    const syntheticItem = {
      id: uid(),
      ...pickedExerciseFields(newExerciseId, newLoadModel, exercises),
      restSeconds: oldItem.restSeconds,
      setsDetail: (oldItem.setsDetail && oldItem.setsDetail.length ? oldItem.setsDetail : [{ id: uid() }]).map((sd) => ({ ...sd, id: uid() })),
    };
    const built = editingSession
      ? { ...buildWorkoutItem(syntheticItem, exercises, history, nowDate, null), priorSets: [], priorMessage: null, priorStatus: null }
      : buildWorkoutItem(syntheticItem, exercises, history, nowDate, null);
    setBlocks((prev) => prev.map((b, i) => (i === bi ? { ...b, items: b.items.map((it, j) => (j === ii ? built : it)) } : b)));
    setBlockIdx(bi);
    setSubIdx(ii);
    setReplaceFlow(null);
  };

  const removeExerciseBlock = (idx) => {
    setBlocks((prev) => prev.filter((_, i) => i !== idx));
    setBlockIdx((prev) => Math.max(0, prev >= idx ? prev - 1 : prev));
    setSubIdx(0);
  };

  const goNext = () => {
    if (currentBlock.items.length > 1 && subIdx < currentBlock.items.length - 1) {
      setSubIdx(subIdx + 1);
    } else if (blockIdx < blocks.length - 1) {
      setBlockIdx(blockIdx + 1);
      setSubIdx(0);
    }
  };
  const goPrev = () => {
    if (currentBlock.items.length > 1 && subIdx > 0) {
      setSubIdx(subIdx - 1);
    } else if (blockIdx > 0) {
      setBlockIdx(blockIdx - 1);
      setSubIdx(0);
    }
  };

  const canGoNext = blockIdx < blocks.length - 1 || subIdx < (currentBlock?.items.length || 1) - 1;
  const canGoPrev = blockIdx > 0 || subIdx > 0;
  const isLastExercise = !canGoNext;
  const unfilledSetsCount = blocks.flatMap((b) => b.items).reduce((sum, it) => sum + it.sets.filter((s) => !isSetPerformed(s, it.type)).length, 0);

  // SEC-HF-01 (P0-2): finishing reports whether the session is on disk. On a failure the workout
  // stays open with its draft and can be finished again — with the same session id, so a retry never
  // adds a second session. A second tap while one finish runs is ignored.
  const [finishError, setFinishError] = useState(null);
  const finishingRef = useRef(false);
  const finish = () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      finishUnguarded();
    } finally {
      finishingRef.current = false;
    }
  };
  const finishUnguarded = () => {
    const allItems = blocks.flatMap((b) => b.items);
    const withSets = allItems
      .map((it) => ({ ...it, sets: it.sets.filter((s) => isSetPerformed(s, it.type)) }))
      .filter((it) => it.sets.length > 0);

    const totalSets = withSets.reduce((sum, it) => sum + it.sets.length, 0);
    const totalReps = withSets.reduce((sum, it) => sum + it.sets.reduce((s, st) => s + (Number(st.reps) || 0), 0), 0);
    const totalWeight = withSets.reduce((sum, it) => sum + it.sets.reduce((s, st) => s + (toNumber(st.weight) || 0), 0), 0);
    const volume = withSets.reduce(
      (sum, it) =>
        sum + it.sets.reduce((s, st) => s + (toNumber(st.weight) || 0) * (st.reps !== "" && st.reps != null ? Number(st.reps) : 1), 0),
      0
    );

    // Analysis with the current engine, from the chronological history strictly BEFORE this
    // workout's own date (no future leakage) — also for a backfilled past workout and for an edit
    // of a historical one (which may even change its date).
    const sessionDateIso = editingSession
      ? editedSessionDateIso(editingSession.date, editDate)
      : backfillInfo
      ? new Date(backfillDate || backfillInfo.date).toISOString()
      : new Date().toISOString();
    const analysis = {};
    withSets.forEach((it) => {
      if (it.type === "cardio") return;
      const setsForAnalysis = it.sets.map((s) => ({ ...s, weight: toNumber(s.weight) }));
      analysis[it.exerciseId] = computeExerciseAnalysis({
        sets: setsForAnalysis,
        kind: it.type,
        setsDetail: it.setsDetail,
        history: exerciseHistoryBefore(history, it.exerciseId, sessionDateIso, editingSession ? editingSession.id : null),
        date: sessionDateIso,
      });
    });

    if (editingSession) {
      const updated = {
        ...editingSession,
        analysis,
        date: editedSessionDateIso(editingSession.date, editDate),
        planName: editName.trim() || null,
        planLabel: editName.trim() || null,
        exercisesCount: withSets.length,
        totalSets,
        totalReps,
        totalWeight,
        volume,
        exercises: withSets.map((it) => ({
          id: it.id || uid(),
          exerciseId: it.exerciseId,
          ...atlasRefFields(it), // I3: catalogExerciseId + the load snapshot taken when it entered the workout
          name: it.name,
          type: it.type,
          setsDetail: it.setsDetail,
          sets: it.sets.map((s) => ({ ...s, weight: toNumber(s.weight) })),
        })),
      };
      onSaveEdit(updated);
      return;
    }

    const session = {
      id: sessionIdRef.current || (sessionIdRef.current = uid()),
      date: sessionDateIso,
      planId: plan?.id || null,
      planName: plan?.name || null,
      planLabel: plan?.name || null,
      exercisesCount: withSets.length,
      totalSets,
      totalReps,
      totalWeight,
      volume,
      durationSec: backfillInfo ? Math.max(0, Math.round(manualDuration * 60)) : elapsed,
      exercises: withSets.map((it) => ({
        id: it.id || uid(),
        exerciseId: it.exerciseId,
        ...atlasRefFields(it), // I3: catalogExerciseId + the load snapshot taken when it entered the workout
        name: it.name,
        type: it.type,
        setsDetail: it.setsDetail,
        sets: it.sets.map((s) => ({ ...s, weight: toNumber(s.weight) })),
      })),
      analysis,
    };
    // the latest state — with the session id — is in the draft before anything else happens
    draftDataRef.current = { ...draftDataRef.current, sessionId: session.id };
    saveDraftNow();
    const result = onFinish(session, workoutOwner);
    if (result && result.ok === false) {
      setConfirmFinish(false);
      setFinishError(result.message || "Nie udało się zapisać treningu na urządzeniu.");
      return;
    }
    setFinishError(null);
  };

  /* System/Android Back dialog. Back never leaves the workout by itself — "Opuść trening" keeps the
          draft (progress saved) and goes to the Dashboard; "Wróć do treningu" just closes the dialog
          (that tap also tops the Back guard up). Finishing stays on the workout's own "Zakończ". */
  const leaveDialog = leaveStep ? (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-6" onClick={() => setLeaveStep(null)}>
          <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2">OPUSZCZASZ AKTYWNY TRENING</p>
            {progressNotSaved ? (
              <p className="text-red-400 text-sm mb-5" data-testid="leave-unsaved-warning">
                Postępu nie udało się zapisać na urządzeniu — jest tylko w pamięci aplikacji. Jeśli wyjdziesz, możesz go stracić.
              </p>
            ) : (
              <p className="text-neutral-400 text-sm mb-5">
                Twój aktualny postęp zostanie zapisany. Będziesz mógł wrócić do tego treningu później i kontynuować od tego miejsca.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button onClick={() => { setLeaveStep(null); setLeaveUnsaved(false); }} className="w-full py-3 rounded-xl bg-orange-500 text-neutral-950 font-bold">
                Wróć do treningu
              </button>
              {progressNotSaved && leaveUnsaved ? (
                <button data-no-rearm data-testid="leave-without-saving" onClick={() => interruptWorkout(true)} className="w-full py-3 rounded-xl bg-red-500/90 text-neutral-950 font-semibold">
                  Opuść bez zapisu
                </button>
              ) : (
                <button data-no-rearm onClick={() => interruptWorkout()} className="w-full py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold">
                  Opuść trening
                </button>
              )}
            </div>
          </div>
        </div>
  ) : null;

  // SEC-HF-01: visible safety messages — never a "saved" message while the data is only in memory.
  const safetyBanner =
    progressNotSaved || finishError ? (
      <div className="fixed inset-x-0 top-0 z-30 px-4 pt-2 flex justify-center" data-testid="workout-safety-banner">
        <div className="w-full max-w-sm bg-neutral-900 border border-red-500/70 rounded-2xl p-3 shadow-lg text-left">
          {finishError && (
            <p className="text-red-400 text-xs leading-relaxed" data-testid="finish-error">
              {finishError} Trening nie został zakończony{progressNotSaved ? "" : " — jest zachowany jako niedokończony"}. Zwolnij miejsce na urządzeniu i spróbuj ponownie.
            </p>
          )}
          {progressNotSaved && (
            <p className={`text-red-400 text-xs leading-relaxed ${finishError ? "mt-1" : ""}`} data-testid="draft-save-warning" data-reason={draftSaveStatus}>
              {draftSaveStatus === "conflict"
                ? "Na urządzeniu jest inny niedokończony trening — ten trening NIE jest zapisywany. Nie zamykaj aplikacji."
                : "Postęp NIE jest zapisany na urządzeniu — jest tylko w pamięci aplikacji. Nie zamykaj aplikacji."}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            {progressNotSaved && (
              <button onClick={() => saveDraftNow()} className="flex-1 py-1.5 rounded-xl bg-neutral-800 text-neutral-100 font-semibold text-xs" data-testid="draft-save-retry">
                Zapisz ponownie
              </button>
            )}
            {finishError && (
              <button onClick={() => finish()} className="flex-1 py-1.5 rounded-xl bg-orange-500 text-neutral-950 font-bold text-xs" data-testid="finish-retry">
                Spróbuj zakończyć ponownie
              </button>
            )}
          </div>
        </div>
      </div>
    ) : null;

  if (!currentBlock) {
    return (
      <div className="min-h-screen bg-app-depth font-body flex flex-col items-center justify-center px-6 text-center">
        <FontStyles />
        {safetyBanner}
        <p className="text-neutral-300 font-semibold mb-4">Ten trening nie ma jeszcze ćwiczeń.</p>
        <button onClick={openAddPicker} className="bg-orange-500 text-neutral-950 font-bold px-6 py-3 rounded-xl mb-3">
          Dodaj ćwiczenie
        </button>
        <button onClick={() => onCancel(workoutOwner)} className="text-neutral-500 text-sm">
          Anuluj trening
        </button>
        {addPickerOpen && <ExercisePickerModal exercises={exercises} onPick={addExerciseAdHoc} onClose={() => setAddPickerOpen(false)} onCreateExercise={onCreateExercise} />}
        {leaveDialog}
      </div>
    );
  }

  const priorSets = currentEx.priorSets || [];

  const formatPriorSet = (s) => {
    const rirTag = formatRir(s.rir) ? ` · RIR ${formatRir(s.rir)}` : "";
    if (currentEx.type === "time") return `${s.duration}s${rirTag}`;
    if (currentEx.type === "cardio") {
      const parts = [`${s.duration || 0}s`];
      if (s.speed) parts.push(`${s.speed}km/h`);
      if (s.incline) parts.push(`${s.incline}%`);
      return parts.join(" · ");
    }
    if (currentEx.type === "sets") return s.weight != null ? `${s.weight}kg` : "seria wykonana";
    if (currentEx.type === "bodyweight") return `${s.reps} powt.${rirTag}`;
    if (currentEx.type === "bodyweightPlus") return `MW+${s.weight || 0}kg × ${s.reps}${rirTag}`;
    return `${s.weight}kg × ${s.reps}${rirTag}`;
  };

  return (
    <div className="min-h-screen bg-app-depth font-body flex flex-col">
      <FontStyles />
      {safetyBanner}
      <div className="px-4 pt-4 pb-2 grid grid-cols-3 items-center gap-2">
        {/* back-filled workout: the date + duration fields use the (otherwise empty) clock column too */}
        <div className={`min-w-0 ${editingSession || backfillInfo ? "col-span-2" : ""}`}>
          {editingSession ? (
            <div className="flex items-center gap-1.5 text-neutral-400 text-xs min-w-0">
              <Pencil size={13} className="text-orange-400 flex-shrink-0" />
              <DateField
                value={editDate || ""}
                onChange={setEditDate}
                max={toLocalDateStr(new Date())}
                testId="edit-date"
                wrapperClassName="flex-shrink-0"
                inputClassName="w-[6.6rem] bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-neutral-200 text-xs"
              />
            </div>
          ) : backfillInfo ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-neutral-400 text-xs">
              <CalendarPlus size={14} className="text-orange-400 flex-shrink-0" />
              <DateField
                value={backfillDate || ""}
                onChange={setBackfillDate}
                max={toLocalDateStr(new Date())}
                testId="backfill-date"
                wrapperClassName="flex-shrink-0"
                inputClassName="w-[6.6rem] bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-neutral-200 text-xs"
              />
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="text-neutral-700">•</span>
                <input
                  type="number"
                  min={0}
                  value={manualDuration}
                  onChange={(e) => setManualDuration(Number(e.target.value))}
                  className="w-12 bg-neutral-900 border border-neutral-800 rounded-lg px-1.5 py-1 text-neutral-200 text-xs text-center"
                />
                <span>min</span>
              </span>
            </div>
          ) : null}
        </div>

        <div className={editingSession || backfillInfo ? "hidden" : "flex justify-center"}>
          {!editingSession && !backfillInfo && (
            <div className="flex items-center gap-1.5 text-neutral-100 font-display text-2xl tracking-wide tabular-nums">
              <Clock size={16} className="text-orange-400" /> {fmtClock(elapsed)}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button onClick={openMenu} className="p-1.5 -mr-1.5 text-neutral-400 active:text-orange-500 flex-shrink-0">
            <MoreVertical size={22} />
          </button>
        </div>
      </div>

      {editingSession && (
        <div className="px-4 pb-2">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Nazwa treningu (opcjonalnie)"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 text-sm outline-none focus:border-orange-500"
          />
        </div>
      )}

      <div className="px-4 pb-1">
        <div className="flex gap-1">
          {blocks.map((b, i) => (
            <div key={b.id} className={`h-1 flex-1 rounded-full ${i < blockIdx ? "bg-orange-500" : i === blockIdx ? "bg-orange-500/50" : "bg-neutral-800"}`} />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4">
        {currentBlock.items.length > 1 ? (
          <>
            {/* Superset: label + letter capsules (A, B, C, D…) for ANY number of exercises in THIS
                block only — the next exercise/superset renders its own view. Capsules are small
                visually, but each tap target is at least 40 px. Switching only changes which
                exercise is shown; the A → B → … → rest execution order is untouched. */}
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-1.5 text-lime-400 text-xs font-semibold min-w-0">
                <Link2 size={13} className="flex-shrink-0" /> <span className="truncate">SUPERSERIA · Ćwiczenie {subIdx + 1} z {currentBlock.items.length}</span>
              </div>
              <div className="flex flex-wrap justify-end" role="tablist" aria-label="Ćwiczenia superserii">
                {currentBlock.items.map((it, i) => {
                  const active = i === subIdx;
                  const letter = String.fromCharCode(65 + i);
                  return (
                    <button
                      key={it.id || it.planItemId}
                      role="tab"
                      aria-selected={active}
                      aria-label={`${letter}: ${it.name}`}
                      title={it.name}
                      onClick={() => setSubIdx(i)}
                      className="min-w-[40px] min-h-[40px] px-0.5 flex items-center justify-center"
                    >
                      <span
                        className={`min-w-[32px] h-7 px-2.5 rounded-full border text-xs font-bold flex items-center justify-center ${
                          active ? "bg-orange-500 border-orange-500 text-neutral-950 shadow-brand-glow" : "bg-neutral-900 border-neutral-700 text-neutral-300"
                        }`}
                      >
                        {letter}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <h1 className="font-display text-3xl text-neutral-50 tracking-wide leading-tight mt-2">{currentBlock.items[subIdx]?.name}</h1>
          </>
        ) : (
          <h1 className="font-display text-3xl text-neutral-50 tracking-wide leading-tight mt-3">{currentBlock.items[0]?.name}</h1>
        )}

        {editingSession && (
          <div className="flex items-center justify-end mt-2">
            <button
              onClick={() => removeExerciseBlock(blockIdx)}
              className="p-2 text-neutral-600 active:text-red-500 flex-shrink-0"
              title="Usuń to ćwiczenie z treningu"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}

        {priorSets.length > 0 && (
          <div className="mt-3">
            {/* "Zalecenie na dzisiejszy trening" is the engine's reading of the history → PRO only.
                Free keeps "Poprzednie wykonanie" (the raw previous sets) below. */}
            {currentEx.priorMessage && !isPro && (
              <button
                onClick={() => onOpenUnlock && onOpenUnlock()}
                className="w-full flex items-center justify-between gap-2 bg-neutral-900 border border-orange-500/30 rounded-xl px-3 py-2.5 text-left"
                data-testid="pro-recommendation-lock"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-orange-400 text-xs font-bold uppercase tracking-wide">
                    <Lock size={12} className="flex-shrink-0" /> Zalecenia treningowe — PRO
                  </span>
                  <span className="block text-neutral-400 text-xs mt-0.5">Zobacz, co wynika z Twojej historii</span>
                </span>
                <span className="text-neutral-950 bg-orange-500 rounded-full px-2.5 py-1 text-[11px] font-bold flex-shrink-0">Poznaj NEXTREP PRO</span>
              </button>
            )}
            {currentEx.priorMessage && isPro && (
              <>
                <button
                  onClick={() => setShowRecommendation((v) => !v)}
                  aria-expanded={showRecommendation}
                  className="w-full flex items-center justify-between gap-2 bg-neutral-900 border border-orange-500/30 rounded-xl px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-wide" style={{ letterSpacing: "0.06em" }}>
                    {currentEx.priorStatus && <span className="flex-shrink-0">{STATUS_META[currentEx.priorStatus]?.icon}</span>}
                    Zalecenie na dzisiejszy trening
                  </span>
                  <ChevronDown size={15} className={`text-neutral-500 flex-shrink-0 transition-transform ${showRecommendation ? "rotate-180" : ""}`} />
                </button>
                {showRecommendation && (
                  <div className="bg-neutral-900 border border-orange-500/30 border-t-0 rounded-b-xl -mt-2 pt-4 px-3 pb-3">
                    <p className="text-neutral-300 text-xs leading-relaxed">{currentEx.priorMessage}</p>
                  </div>
                )}
              </>
            )}

            <button
              onClick={() => setShowPriorDetail((v) => !v)}
              aria-expanded={showPriorDetail}
              className="w-full mt-2 flex items-center justify-between gap-2 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5"
            >
              <span className="flex items-center gap-2 text-neutral-200 text-xs font-semibold">
                <HistoryIcon size={15} className="text-orange-400 flex-shrink-0" />
                {showPriorDetail ? "Ukryj" : "Zobacz"} poprzednie wykonanie treningu
              </span>
              <ChevronDown size={15} className={`text-neutral-500 flex-shrink-0 transition-transform ${showPriorDetail ? "rotate-180" : ""}`} />
            </button>

            {showPriorDetail && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                <p className="text-neutral-500 text-xs uppercase font-semibold mb-2">Poprzednie wykonanie tego ćwiczenia — wyniki wg serii</p>
                <div className="space-y-1">
                  {priorSets.map((s, i) => {
                    const isDrop = s.setType === "dropset";
                    const normalCount = priorSets.slice(0, i + 1).filter((x) => x.setType !== "dropset").length;
                    const dropCount = priorSets.slice(0, i + 1).filter((x) => x.setType === "dropset").length;
                    const rowLabel = isDrop ? (dropCount > 1 ? `D${dropCount}` : "D") : String(normalCount);
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${isDrop ? "bg-orange-500/10" : "bg-neutral-950"}`}
                      >
                        <span className={`w-5 font-display text-sm flex-shrink-0 ${isDrop ? "text-orange-400" : "text-neutral-500"}`}>{rowLabel}</span>
                        <span className={`flex-1 font-display tracking-wide ${isDrop ? "text-orange-300" : "text-neutral-200"}`}>{formatPriorSet(s)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {currentEx.type === "bodyweightPlus" && (
          <p className="text-orange-400/80 text-xs mt-3 flex items-center gap-1.5">
            <Layers size={12} /> Ćwiczenie na masie własnej — wpisz dodatkowy ciężar doczepiony do ciała
          </p>
        )}
        {currentEx.loadSnapshot && currentEx.type !== "bodyweightPlus" && atlasLoadHint(currentEx.loadSnapshot) && (
          <p className="text-neutral-400 text-xs mt-3 flex items-center gap-1.5" data-testid="atlas-load-hint">
            <Layers size={12} /> {atlasLoadHint(currentEx.loadSnapshot)}
          </p>
        )}

        {/* Table — exactly the plan's series, editable inline; only a dropset can add a row */}
        {currentEx.type !== "cardio" && (
        <>
        <div className="mt-4">
          <div className="flex items-center gap-1.5 px-1 mb-1">
            <span className="w-7 text-neutral-600 text-xs uppercase font-semibold flex-shrink-0">S.</span>
            {currentEx.type === "cardio" ? (
              <>
                <span className="flex-1 text-neutral-600 text-xs uppercase font-semibold">Czas</span>
                <span className="flex-1 text-neutral-600 text-xs uppercase font-semibold">Prędkość</span>
                <span className="w-16 text-neutral-600 text-xs uppercase font-semibold flex-shrink-0">Nachyl.</span>
              </>
            ) : (
              <>
                {currentEx.type !== "time" && (
                  <span className="flex-1 text-neutral-600 text-xs uppercase font-semibold">
                    {currentEx.type === "bodyweightPlus" ? "MW + kg" : "Ciężar"}
                  </span>
                )}
                <span className="flex-1 text-neutral-600 text-xs uppercase font-semibold">
                  {currentEx.type === "time" ? "Czas" : currentEx.type === "sets" ? "" : "Powt."}
                </span>
                <span className="w-14 text-neutral-600 text-xs uppercase font-semibold flex-shrink-0">RIR</span>
              </>
            )}
            <span className="w-14 flex-shrink-0" />
          </div>

          <div className="space-y-1.5">
            {currentEx.sets.map((s, i) => {
              const isDrop = s.setType === "dropset";
              const normalCount = currentEx.sets.slice(0, i + 1).filter((x) => x.setType !== "dropset").length;
              const dropCount = currentEx.sets.slice(0, i + 1).filter((x) => x.setType === "dropset").length;
              const label = isDrop ? (dropCount > 1 ? `D${dropCount}` : "D") : String(normalCount);
              const detail = !isDrop ? currentEx.setsDetail.find((d) => d.id === (s.detailId ?? s.id)) : null;

              return (
                <div key={s.id}>
                  <div className={`flex items-center gap-1.5 rounded-xl px-2 py-2 border ${isDrop ? "bg-orange-500/10 border-orange-500/30" : "bg-neutral-900 border-neutral-800"}`}>
                    <span className={`w-7 flex-shrink-0 font-display text-lg ${isDrop ? "text-orange-400" : "text-neutral-100"}`}>{label}</span>

                    {currentEx.type === "bodyweight" && <span className="flex-1 text-neutral-400 text-xs">MW</span>}

                    {currentEx.type === "cardio" && (
                      <>
                        <div className="flex-1 flex items-center gap-1 min-w-0">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={s.duration}
                            placeholder="s"
                            onChange={(e) => patchSet(s.id, { duration: e.target.value })}
                            className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded-lg px-1.5 py-1.5 text-neutral-100 text-sm"
                          />
                          <button
                            onClick={() => openTimerForRow(s.id, s.duration)}
                            className={`p-1.5 rounded-lg border flex-shrink-0 ${
                              timerRowId === s.id ? "bg-sky-500/20 border-sky-500/40 text-sky-400" : "bg-neutral-950 border-neutral-800 text-neutral-500"
                            }`}
                          >
                            <TimerIcon size={15} />
                          </button>
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={s.speed}
                          placeholder="km/h"
                          onChange={(e) => patchSet(s.id, { speed: e.target.value })}
                          className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded-lg px-1.5 py-1.5 text-neutral-100 text-sm"
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={s.incline}
                          placeholder="%"
                          onChange={(e) => patchSet(s.id, { incline: e.target.value })}
                          className="w-16 flex-shrink-0 bg-neutral-950 border border-neutral-800 rounded-lg px-1.5 py-1.5 text-neutral-100 text-sm"
                        />
                      </>
                    )}

                    {currentEx.type === "bodyweightPlus" && (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={s.weight}
                        placeholder="+ kg"
                        onChange={(e) => patchSet(s.id, { weight: e.target.value, fromSuggestion: false })}
                        className="flex-1 min-w-0 bg-neutral-950 border border-orange-500/40 rounded-lg px-1.5 py-1.5 text-neutral-100 text-sm font-semibold"
                      />
                    )}

                    {(currentEx.type === "weight" || currentEx.type === "sets") && (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={s.weight}
                        placeholder="kg"
                        onChange={(e) => patchSet(s.id, { weight: e.target.value, fromSuggestion: false })}
                        className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded-lg px-1.5 py-1.5 text-neutral-100 text-sm"
                      />
                    )}

                    {currentEx.type === "time" ? (
                      <div className="flex-1 flex items-center gap-1 min-w-0">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={s.duration}
                          placeholder="s"
                          onChange={(e) => patchSet(s.id, { duration: e.target.value })}
                          className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded-lg px-1.5 py-1.5 text-neutral-100 text-sm"
                        />
                        <button
                          onClick={() => openTimerForRow(s.id, s.duration)}
                          className={`p-1.5 rounded-lg border flex-shrink-0 ${
                            timerRowId === s.id ? "bg-sky-500/20 border-sky-500/40 text-sky-400" : "bg-neutral-950 border-neutral-800 text-neutral-500"
                          }`}
                        >
                          <TimerIcon size={15} />
                        </button>
                      </div>
                    ) : currentEx.type === "sets" ? (
                      <button
                        onClick={() => patchSet(s.id, { done: !s.done })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${
                          s.done ? "bg-lime-500/20 border-lime-500/40 text-lime-400" : "bg-neutral-950 border-neutral-800 text-neutral-500"
                        }`}
                      >
                        {s.done ? "Wykonano ✓" : "Zaznacz"}
                      </button>
                    ) : currentEx.type === "cardio" ? null : (
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={s.reps}
                        placeholder="0"
                        onChange={(e) => patchSet(s.id, { reps: e.target.value })}
                        className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded-lg px-1.5 py-1.5 text-neutral-100 text-sm"
                      />
                    )}

                    {currentEx.type !== "cardio" && (
                      <select
                        value={s.rir}
                        onChange={(e) => patchSet(s.id, { rir: e.target.value })}
                        className="w-14 flex-shrink-0 bg-neutral-950 border border-neutral-800 rounded-lg px-0.5 py-1.5 text-neutral-100 text-xs"
                      >
                        <option value="">–</option>
                        {RIR_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {formatRir(r)}
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="w-14 flex-shrink-0 flex items-center justify-end gap-2">
                      <button onClick={() => setOpenNoteId(openNoteId === s.id ? null : s.id)} className={openNoteId === s.id ? "text-orange-400" : "text-neutral-600"}>
                        <MessageSquare size={15} />
                      </button>
                      {isDrop && (
                        <button onClick={() => removeDropset(s.id)} className="text-neutral-600 active:text-red-500">
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {detail && (detail.target || detail.rir) && (
                    <p className="text-neutral-600 text-xs mt-0.5 ml-1">
                      cel: {detail.target || "—"}
                      {currentEx.type === "time" ? "s" : ""}
                      {formatRir(detail.rir) ? ` · RIR ${formatRir(detail.rir)}` : ""}
                    </p>
                  )}

                  {openNoteId === s.id && (
                    <input
                      value={s.note}
                      onChange={(e) => patchSet(s.id, { note: e.target.value })}
                      placeholder="Notatka do tej serii (np. „ból nadgarstka”, „ciężar za duży”)..."
                      className="w-full mt-1 bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-neutral-200 text-xs outline-none focus:border-orange-500"
                    />
                  )}

                  {timerRowId === s.id && (
                    <div className="mt-1.5 bg-neutral-950 border border-sky-500/30 rounded-xl p-3">
                      <div className="flex items-center justify-center py-1">
                        <span className="font-display text-5xl tracking-wide text-neutral-50">{fmtClock(timerSec)}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setTimerRunning((r) => !r)}
                          className="flex-1 py-2.5 rounded-xl bg-sky-500 text-neutral-950 font-bold text-sm flex items-center justify-center gap-1.5"
                        >
                          <TimerIcon size={15} /> {timerRunning ? "Pauza" : "Start"}
                        </button>
                        <button onClick={() => setTimerSec(0)} className="px-3 py-2.5 rounded-xl bg-neutral-800 text-neutral-300 font-semibold text-xs">
                          Reset
                        </button>
                        <button onClick={saveTimerToRow} className="px-4 py-2.5 rounded-xl bg-orange-500 text-neutral-950 font-bold text-xs">
                          Zapisz
                        </button>
                      </div>
                      <p className="text-neutral-600 text-xs text-center mt-2">
                        {timerRunning ? "Ekran nie zgaśnie, dopóki stoper działa." : "Zapisany czas będzie można później ręcznie poprawić."}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {currentEx.type !== "time" && currentEx.type !== "sets" && currentEx.type !== "cardio" && (
            <button
              onClick={addDropset}
              className="w-full mt-2 py-2 rounded-xl border-2 border-dashed border-orange-500/30 text-orange-400 text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              <Layers size={14} /> + Dropset
            </button>
          )}
        </div>

        <div className="mt-4 bg-neutral-900 border border-sky-500/30 rounded-2xl p-3">
          {!restActive ? (
            <button
              onClick={() => {
                const secs = currentEx.restSeconds || 90;
                clearRestAutoReset();
                restTargetRef.current = secs;
                setRestTarget(secs);
                setRestRemaining(secs);
                setRestActive(true);
                setRestRunning(false);
              }}
              className="w-full py-2.5 rounded-xl bg-sky-500/15 text-sky-400 font-semibold text-sm flex items-center justify-center gap-2"
            >
              <TimerIcon size={16} /> Start przerwy ({currentEx.restSeconds || 90}s){currentBlock.items.length > 1 ? " — cała superseria" : ""}
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1.5 text-sky-400 text-xs font-bold uppercase tracking-wide">
                  <TimerIcon size={14} /> Przerwa
                </span>
                <button onClick={() => setRestActive(false)} className="text-neutral-500 text-xs font-semibold">
                  Zamknij
                </button>
              </div>
              <div className="flex items-center justify-center py-2">
                <span className="font-display text-6xl tracking-wide text-neutral-50">{fmtClock(restRemaining)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    clearRestAutoReset();
                    restSignal.unlock(); // inside this tap: lets the end signal play later
                    if (!restRunning && restRemaining <= 0) setRestRemaining(restTarget);
                    setRestRunning((r) => !r);
                  }}
                  className="flex-1 py-3 rounded-xl bg-sky-500 text-neutral-950 font-bold flex items-center justify-center gap-2"
                >
                  <TimerIcon size={16} /> {restRunning ? "Pauza" : "Start"}
                </button>
                <button
                  onClick={() => {
                    clearRestAutoReset();
                    setRestRemaining(restTarget);
                    setRestRunning(false);
                  }}
                  className="px-4 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold text-sm"
                >
                  Reset
                </button>
              </div>
              <p className="text-neutral-600 text-xs text-center mt-2">
                {restRunning ? "Ekran nie zgaśnie, dopóki trwa odliczanie." : "Uruchom, żeby zapobiec wygaszeniu ekranu."}
              </p>
            </>
          )}
        </div>
        </>
        )}

        {currentEx.type === "cardio" && (
          <CardioEntryPanel
            key={currentEx.planItemId}
            set={currentEx.sets[0]}
            deviceType={currentEx.deviceType || "Inne"}
            onPatch={(patch) => patchSet(currentEx.sets[0].id, patch)}
          />
        )}
      </div>

      <div className="px-4 pb-6 pt-2 flex gap-3 border-t border-neutral-900">
        <button
          onClick={goPrev}
          disabled={!canGoPrev}
          className="flex-1 py-3.5 rounded-xl bg-neutral-900 border border-neutral-800 disabled:opacity-30 text-neutral-300 font-semibold flex items-center justify-center gap-1"
        >
          <ChevronLeft size={18} /> Poprzednie
        </button>
        <button
          onClick={
            isLastExercise
              ? () => {
                  try {
                    window.history.pushState({ trainapp: true }, "", "");
                  } catch {}
                  setConfirmFinish("finish");
                }
              : goNext
          }
          disabled={!isLastExercise && !canGoNext}
          className={`flex-1 py-3.5 rounded-xl disabled:opacity-30 font-bold flex items-center justify-center gap-1 ${
            isLastExercise ? "bg-gradient-to-br from-[#FF5A00] via-orange-500 to-orange-400 text-neutral-950 shadow-brand-glow" : "bg-orange-500 text-neutral-950"
          }`}
        >
          {isLastExercise ? (
            <>
              <Check size={18} /> Zakończ
            </>
          ) : (
            <>
              Następne <ChevronRight size={18} />
            </>
          )}
        </button>
      </div>

      {addPickerOpen && <ExercisePickerModal exercises={exercises} onPick={addExerciseAdHoc} onClose={() => setAddPickerOpen(false)} onCreateExercise={onCreateExercise} />}
      {replaceFlow && replaceFlow.step === "pick" && (
        <ExercisePickerModal
          title="ZAMIEŃ NA…"
          exercises={exercises.filter((e) => e.id !== blocks[replaceFlow.bi]?.items[replaceFlow.ii]?.exerciseId)}
          excludeExerciseId={blocks[replaceFlow.bi]?.items[replaceFlow.ii]?.exerciseId}
          onPick={(exerciseId, loadModel) => setReplaceFlow({ step: "confirm", bi: replaceFlow.bi, ii: replaceFlow.ii, newExerciseId: exerciseId, newLoadModel: loadModel ?? null })}
          onClose={() => setReplaceFlow(null)}
          onCreateExercise={onCreateExercise}
        />
      )}
      {replaceFlow && replaceFlow.step === "target" && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={() => setReplaceFlow(null)}>
          <div className="w-full bg-neutral-900 border-t border-neutral-800 rounded-t-3xl p-4 pb-6" style={{ maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-3" />
            <h2 className="font-display text-2xl text-neutral-50 tracking-wide mb-1">ZAMIEŃ ĆWICZENIE</h2>
            <p className="text-neutral-500 text-xs mb-3">Które ćwiczenie chcesz zastąpić w tym treningu?</p>
            <div className="space-y-2">
              {blocks.map((b, bi) =>
                b.items.map((it, ii) => (
                  <button
                    key={it.id || it.planItemId}
                    onClick={() => setReplaceFlow({ step: "pick", bi, ii })}
                    className="w-full text-left bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 flex items-center justify-between gap-2 active:border-orange-500"
                  >
                    <span className="text-neutral-100 font-medium min-w-0">{it.name}</span>
                    {b.items.length > 1 && (
                      <span className="text-green-400 text-[11px] font-bold flex-shrink-0">SUPERSERIA · {String.fromCharCode(65 + ii)}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {replaceFlow && replaceFlow.step === "confirm" && (() => {
        const oldItem = blocks[replaceFlow.bi]?.items[replaceFlow.ii];
        const newEx = exercises.find((e) => e.id === replaceFlow.newExerciseId) || atlasExerciseView(replaceFlow.newExerciseId);
        if (!oldItem || !newEx) return null;
        const losesData = itemHasEnteredData(oldItem);
        return (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-6" onClick={() => setReplaceFlow(null)}>
            <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
              <p className="font-display text-2xl text-neutral-50 tracking-wide mb-3">ZAMIENIĆ ĆWICZENIE?</p>
              <p className="text-neutral-300 text-sm">„{oldItem.name}”</p>
              <p className="text-orange-400 text-sm my-1">→</p>
              <p className="text-neutral-100 text-sm font-semibold mb-3">„{newEx.name}”</p>
              {losesData && (
                <p className="text-amber-400 text-xs leading-relaxed mb-3">
                  Zamiana usunie dane wpisane w tym treningu dla „{oldItem.name}”. Historia tego ćwiczenia z poprzednich treningów zostaje bez zmian.
                </p>
              )}
              <p className="text-neutral-500 text-xs mb-5">Zmiana dotyczy tylko tego treningu — plan zostaje bez zmian.</p>
              <div className="flex gap-3">
                <button onClick={() => setReplaceFlow(null)} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-200 font-semibold">
                  Anuluj
                </button>
                <button onClick={() => replaceExercise(replaceFlow.bi, replaceFlow.ii, replaceFlow.newExerciseId, replaceFlow.newLoadModel)} className="flex-1 py-3 rounded-xl bg-orange-500 text-neutral-950 font-bold">
                  Zamień
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={() => setMenuOpen(false)}>
          <div className="w-full bg-neutral-900 border-t border-neutral-800 rounded-t-3xl p-3 pb-6" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-3" />

            <button
              onClick={() => {
                setMenuOpen(false);
                setAddPickerOpen(true); // reuses the history entry already pushed when the menu opened — no second push here
              }}
              className="w-full flex items-center gap-3 px-3 py-3.5 text-left active:bg-neutral-800 rounded-xl"
            >
              <Plus size={19} className="text-neutral-400 flex-shrink-0" />
              <span className="text-neutral-100 font-medium text-sm">Dodaj kolejne ćwiczenie do treningu</span>
            </button>

            {blocks.length > 0 && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  // reuses the menu's history entry, like "Dodaj kolejne ćwiczenie"
                  const total = blocks.reduce((n, b) => n + b.items.length, 0);
                  setReplaceFlow(total === 1 ? { step: "pick", bi: 0, ii: 0 } : { step: "target" });
                }}
                className="w-full flex items-center gap-3 px-3 py-3.5 text-left active:bg-neutral-800 rounded-xl"
              >
                <Repeat size={19} className="text-neutral-400 flex-shrink-0" />
                <span className="text-neutral-100 font-medium text-sm">Zamień ćwiczenie</span>
              </button>
            )}

            {currentEx.videoUrl && (
              <a
                href={currentEx.videoUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-3 px-3 py-3.5 text-left active:bg-neutral-800 rounded-xl"
              >
                <PlayCircle size={19} className="text-sky-400 flex-shrink-0" />
                <span className="text-neutral-100 font-medium text-sm">Zobacz film instruktażowy — {currentEx.name}</span>
              </a>
            )}

            <button
              onClick={() => {
                setMenuOpen(false);
                setConfirmFinish("finish");
              }}
              className="w-full flex items-center gap-3 px-3 py-3.5 text-left active:bg-neutral-800 rounded-xl"
            >
              <Check size={19} className="text-orange-400 flex-shrink-0" />
              <span className="min-w-0">
                <span className="block text-neutral-100 font-medium text-sm">{editingSession ? "Zapisz trening" : "Zakończ trening"}</span>
                <span className="block text-neutral-500 text-[11px] font-normal mt-0.5">
                  {editingSession ? "Zapisany wcześniej trening zostanie zaktualizowany." : "Bieżące wyniki zostaną zapisane i trening zostanie zakończony."}
                </span>
              </span>
            </button>

            <button
              onClick={() => {
                setMenuOpen(false);
                setConfirmFinish("cancel");
              }}
              className="w-full flex items-center gap-3 px-3 py-3.5 text-left active:bg-neutral-800 rounded-xl"
            >
              <X size={19} className="text-red-400 flex-shrink-0" />
              <span className="min-w-0">
                <span className="block text-neutral-100 font-medium text-sm">{editingSession ? "Odrzuć zmiany" : "Przerwij trening"}</span>
                <span className="block text-neutral-500 text-[11px] font-normal mt-0.5">
                  {editingSession ? "Wprowadzone zmiany nie zostaną zapisane." : "Postęp zostanie zapisany — wrócisz do treningu z ekranu Start."}
                </span>
              </span>
            </button>
          </div>
        </div>
      )}

      {confirmFinish && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center px-6" onClick={() => setConfirmFinish(false)}>
          <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-2xl text-neutral-50 tracking-wide mb-2">
              {confirmFinish === "cancel" ? (editingSession ? "ODRZUCIĆ ZMIANY?" : "PRZERYWASZ AKTYWNY TRENING") : editingSession ? "ZAPISAĆ ZMIANY?" : "ZAKOŃCZYĆ TRENING?"}
            </p>
            <p className="text-neutral-400 text-sm mb-5">
              {confirmFinish === "cancel"
                ? editingSession
                  ? "Wprowadzone zmiany nie zostaną zapisane."
                  : progressNotSaved
                  ? "Postępu nie udało się zapisać na urządzeniu — jest tylko w pamięci aplikacji."
                  : "Twój aktualny postęp zostanie zapisany. Będziesz mógł wrócić do tego treningu później i kontynuować od tego miejsca."
                : editingSession
                ? "Zapisany wcześniej trening zostanie zaktualizowany."
                : "Bieżące wyniki zostaną zapisane."}
            </p>
            {confirmFinish === "finish" && !editingSession && unfilledSetsCount > 0 && (
              <p className="text-amber-400 text-xs mb-5 -mt-3">
                {unfilledSetsCount} {plWord(unfilledSetsCount, "niewypełniona seria", "niewypełnione serie", "niewypełnionych serii")} nie zostanie zapisan{unfilledSetsCount === 1 ? "a" : "e"}.
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setConfirmFinish(false)} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold">
                {confirmFinish === "cancel" && !editingSession ? "Wróć do treningu" : "Wróć"}
              </button>
              <button
                data-no-rearm
                onClick={() => {
                  if (confirmFinish !== "cancel") {
                    finish();
                    return;
                  }
                  if (!editingSession) {
                    interruptWorkout(); // keep the draft, go to the Dashboard
                    return;
                  }
                  // Interrupting an active workout (not discarding an edit) must actually exit —
                  // not just close this confirm dialog. Clearing the overlay ref first means the
                  // history.back() below hits the "activeWorkoutPlan !== undefined" branch of the
                  // root popstate handler instead of being intercepted as "just close this modal".
                  if (!editingSession) activeWorkoutOverlayRef.current = null;
                  onCancel(workoutOwner);
                }}
                className={`flex-1 py-3 rounded-xl font-bold ${confirmFinish === "cancel" && editingSession ? "bg-red-500 text-neutral-950" : "bg-orange-500 text-neutral-950"}`}
              >
                {confirmFinish === "cancel" ? (editingSession ? "Odrzuć" : "Przerwij trening") : editingSession ? "Zapisz" : "Zakończ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {leaveDialog}
    </div>
  );
}

