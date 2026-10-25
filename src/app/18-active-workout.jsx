
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

/* ---------------------------------------------------------------------- */
/* I4.4 — Active Workout after the approved master (AWM v1, canvas v81)   */
/* Visual layer only: the series, their values, the completion rule        */
/* (isSetPerformed), the rest timer, the draft and finishing are unchanged.*/
/* ---------------------------------------------------------------------- */
const AW_NUM = "Inter, 'Barlow Condensed', sans-serif";
const AW_LABEL = { fontFamily: NR.font, fontSize: "14px", lineHeight: "16px", fontWeight: 500, letterSpacing: ".05em", textTransform: "uppercase", color: "#9A9A9A" };
const AW_SR = { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };
const awKg = (w) => String(w).replace(".", ",");
const awRange = (t) => String(t).replace(/-/g, "–");
// 01:12 — the rest countdown of the master (zero-padded minutes)
function awMmSs(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
// "Czas treningu 24 minuty 18 sekund" — the spoken form of the elapsed clock
function awClockLabel(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h} ${plWord(h, "godzina", "godziny", "godzin")}`);
  parts.push(`${m} ${plWord(m, "minuta", "minuty", "minut")}`);
  parts.push(`${s} ${plWord(s, "sekunda", "sekundy", "sekund")}`);
  return `Czas treningu ${parts.join(" ")}`;
}
// The result of one set as the master writes it: "80 kg × 8" + "RIR 1–2" (values as they were entered).
function awSetResult(s, kind) {
  const rir = formatRir(s.rir) ? `RIR ${formatRir(s.rir)}` : null;
  let main;
  if (kind === "time") main = `${s.duration} s`;
  else if (kind === "cardio") {
    const parts = [`${s.duration || 0} s`];
    if (s.speed) parts.push(`${s.speed} km/h`);
    if (s.incline) parts.push(`${s.incline}%`);
    main = parts.join(" · ");
  } else if (kind === "sets") main = s.weight !== "" && s.weight != null ? `${awKg(s.weight)} kg` : "Wykonana";
  else if (kind === "bodyweight") main = `${s.reps} powt.`;
  else if (kind === "bodyweightPlus") main = `MW + ${awKg(s.weight || 0)} kg × ${s.reps}`;
  else main = `${awKg(s.weight === "" || s.weight == null ? 0 : s.weight)} kg × ${s.reps}`;
  return { main, rir: kind === "cardio" ? null : rir };
}
const awResultText = (s, kind) => {
  const r = awSetResult(s, kind);
  return r.rir ? `${r.main} · ${r.rir}` : r.main;
};
const awPendingText = (kind) => (kind === "bodyweight" ? "— powt." : kind === "time" ? "— s" : kind === "sets" ? "—" : "— kg × —");
// "Seria 2" / "Dropset" (a second dropset: "Dropset 2") — numbering as in production (dropsets apart)
function awSetLabels(sets) {
  let n = 0;
  let d = 0;
  return sets.map((s) => (s.setType === "dropset" ? (++d > 1 ? `Dropset ${d}` : "Dropset") : `Seria ${++n}`));
}
// The set of the previous workout at the same position (n-th normal set / n-th dropset).
function awPriorFor(sets, i, priorSets) {
  const isDrop = sets[i].setType === "dropset";
  const nth = sets.slice(0, i + 1).filter((x) => (x.setType === "dropset") === isDrop).length;
  const same = (priorSets || []).filter((x) => (x.setType === "dropset") === isDrop);
  return same[nth - 1] || null;
}

// Circular progress of the docked rest timer.
function AwRestRing({ remaining, target }) {
  const c = 2 * Math.PI * 18;
  const frac = target > 0 ? Math.max(0, Math.min(1, remaining / target)) : 0;
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="24" cy="24" r="18" fill="none" stroke="#1E2A33" strokeWidth="4" />
      <circle cx="24" cy="24" r="18" fill="none" stroke="#5EC2FF" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 24 24)" />
    </svg>
  );
}
const AW_ICON_BTN = { flexShrink: 0, width: "44px", height: "44px", boxSizing: "border-box", background: "transparent", border: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 };

// Completed set: "Seria 1 · 80 kg × 8 · RIR 1–2" + pencil (production completion rule).
function AwSetDone({ label, set, kind, onEdit }) {
  const r = awSetResult(set, kind);
  const drop = set.setType === "dropset";
  return (
    <li data-set="done" data-testid="aw-set-done" style={{ listStyle: "none", position: "relative", display: "flex", alignItems: "center", gap: "10px", minHeight: "56px", boxSizing: "border-box", padding: "6px 4px 6px 16px", borderRadius: "14px", background: "#0D0E0D", border: "1px solid rgba(66,201,138,.28)", overflow: "hidden" }}>
      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: "10px", bottom: "10px", width: "3px", borderRadius: "0 2px 2px 0", background: NR.success }} />
      <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 12px" }}>
        <span style={{ fontFamily: NR.font, fontSize: "17px", lineHeight: "20px", fontWeight: 500, color: drop ? "#FF9A3D" : "#D0D0D0", minWidth: "58px" }}>{label}</span>
        <span style={{ fontFamily: AW_NUM, fontSize: "19px", lineHeight: "24px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: NR.textDisplay, whiteSpace: "nowrap" }}>{r.main}</span>
        {r.rir && <span style={{ fontFamily: NR.font, fontSize: "16px", lineHeight: "20px", color: NR.textSecondary, whiteSpace: "nowrap" }}>{r.rir}</span>}
      </span>
      <button type="button" aria-label={`Edytuj ${label}`} onClick={onEdit} style={{ ...AW_ICON_BTN, width: "auto", minWidth: "44px", minHeight: "44px", height: "auto" }}>
        <Pencil aria-hidden="true" size={18} color="#9A9A9A" />
      </button>
    </li>
  );
}
// Set still to do: "Seria 4 · Do wykonania · — kg × —" + "Wpisz".
function AwSetPending({ label, kind, onEdit }) {
  return (
    <li data-set="pending" data-testid="aw-set-pending" style={{ listStyle: "none", display: "flex", alignItems: "center", gap: "10px", minHeight: "56px", boxSizing: "border-box", padding: "6px 4px 6px 16px", borderRadius: "14px", background: NR.card, border: "1px dashed #2E2E30" }}>
      <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 12px" }}>
        <span style={{ fontFamily: NR.font, fontSize: "17px", lineHeight: "20px", fontWeight: 500, color: "#D0D0D0", minWidth: "58px" }}>{label}</span>
        <span style={{ fontFamily: NR.font, fontSize: "16px", lineHeight: "20px", color: NR.textMuted }}>Do wykonania</span>
        <span aria-hidden="true" style={{ fontFamily: AW_NUM, fontSize: "17px", lineHeight: "22px", fontWeight: 500, color: "#5E5E5E", whiteSpace: "nowrap" }}>{awPendingText(kind)}</span>
      </span>
      <button type="button" aria-label={`Wpisz wyniki: ${label}`} onClick={onEdit} style={{ flexShrink: 0, minWidth: "44px", minHeight: "44px", padding: "0 10px", border: 0, background: "transparent", color: NR.textSecondary, fontFamily: NR.font, fontSize: "16px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
        <Pencil aria-hidden="true" size={16} color="#9A9A9A" />
        Wpisz
      </button>
    </li>
  );
}
// Labelled field of the expanded set card (visible label above, full spoken label for readers).
function AwField({ label, srLabel, flex, minWidth, fontSize = "24px", children }) {
  return (
    <div style={{ flex, display: "flex", flexDirection: "column", gap: "6px" }}>
      <span aria-hidden="true" style={AW_LABEL}>{label}</span>
      <label style={{ position: "relative", display: "block", minWidth, fontSize }}>
        <span style={AW_SR}>{srLabel}</span>
        {children}
      </label>
    </div>
  );
}
// Collapsible card of the master ("Zalecenie na dziś" — warm, "Zobacz poprzednie wykonanie" — neutral).
function AwCardToggle({ open, onToggle, icon: Icon, warm, title, testId }) {
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} data-testid={testId} style={{ width: "100%", minHeight: "52px", boxSizing: "border-box", padding: "8px 12px 8px 14px", border: 0, background: "transparent", display: "flex", alignItems: "center", gap: "10px", textAlign: "left", cursor: "pointer" }}>
      <Icon aria-hidden="true" size={18} color={NR.warm} strokeWidth={2.25} style={{ flexShrink: 0 }} />
      <span style={{ flex: "1 1 auto", minWidth: 0 }}>
        {warm ? <span style={nrHeadText}>{title}</span> : <span style={{ fontFamily: NR.font, fontSize: "17px", lineHeight: "20px", fontWeight: 500, color: NR.textPrimary }}>{title}</span>}
      </span>
      <span style={{ display: "flex", transform: open ? "rotate(180deg)" : "none" }}>
        <ChevronDown aria-hidden="true" size={18} color={NR.textSecondary} />
      </span>
    </button>
  );
}
// Menu row of the ⋮ sheet: icon, title and (optional) explanation.
function AwMenuItem({ icon: Icon, color = NR.textSecondary, title, sub, onClick, href, testId }) {
  const style = { width: "100%", minHeight: "56px", boxSizing: "border-box", padding: "8px 12px", border: 0, borderRadius: "12px", background: "transparent", display: "flex", alignItems: "center", gap: "14px", textAlign: "left", cursor: "pointer", textDecoration: "none" };
  const body = (
    <>
      <Icon aria-hidden="true" size={21} color={color} style={{ flexShrink: 0 }} />
      <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
        <span style={{ fontFamily: NR.font, fontSize: "19px", lineHeight: "22px", fontWeight: 500, color: NR.textPrimary }}>{title}</span>
        {sub && <span style={{ fontFamily: NR.font, fontSize: "15px", lineHeight: "18px", color: "#9A9A9A" }}>{sub}</span>}
      </span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" onClick={onClick} data-testid={testId} style={style}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} data-testid={testId} style={style}>
      {body}
    </button>
  );
}
// Superset bar: green label + A/B/C capsules (44 × 44 targets). Switching only changes the view.
function AwSupersetBar({ items, subIdx, onPick }) {
  return (
    <div data-testid="aw-superset" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "4px 8px", margin: "2px 0 -4px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: NR.font, fontSize: "15px", lineHeight: "18px", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "#A3E635" }}>
        <LinkIcon aria-hidden="true" size={15} color="#A3E635" strokeWidth={2.25} />
        Superseria · ćwiczenie {subIdx + 1} z {items.length}
      </span>
      <div role="tablist" aria-label="Ćwiczenia superserii" style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {items.map((it, i) => {
          const active = i === subIdx;
          const letter = String.fromCharCode(65 + i);
          return (
            <button key={it.id || it.planItemId} type="button" role="tab" aria-selected={active} aria-label={`${letter}: ${it.name}`} title={it.name} onClick={() => onPick(i)} style={{ minWidth: "44px", minHeight: "44px", padding: "0 2px", border: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <span style={{ minWidth: "34px", height: "30px", boxSizing: "border-box", padding: "0 10px", borderRadius: "15px", background: active ? NR.warm : "rgba(9,9,9,.6)", border: `1px solid ${active ? NR.warm : "#4A4A4A"}`, color: active ? NR.bg : "#D0D0D0", boxShadow: active ? "0 0 10px rgba(255,133,27,.45)" : "none", fontFamily: AW_NUM, fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {letter}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
// Segmented progress of the workout (blocks): done = warm, current = 45 %, rest = #2A2A2A.
function AwProgress({ count, idx }) {
  return (
    <div role="progressbar" aria-label={`Ćwiczenie ${idx + 1} z ${count}`} aria-valuenow={idx + 1} aria-valuemin={1} aria-valuemax={count} style={{ display: "flex", gap: "4px" }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{ flex: "1 1 0", height: "4px", borderRadius: "2px", background: i < idx ? NR.warm : i === idx ? "rgba(255,133,27,.45)" : NR.hairline, boxShadow: i < idx ? "0 0 6px rgba(255,133,27,.45)" : "none" }} />
      ))}
    </div>
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

  // I4.4 (AWM v1) — view state only. The expanded set card: null = the first set not performed yet
  // (production completion rule); a tap on "Wpisz" / the pencil, or typing in a card, pins it.
  const [editSetId, setEditSetId] = useState(null);
  const [focusKey, setFocusKey] = useState(null);
  // the two cards collapse once when set editing begins (their content is kept)
  const cardsCollapsedRef = useRef(false);
  useEffect(() => {
    setEditSetId(null);
    cardsCollapsedRef.current = false;
  }, [blockIdx, subIdx]);
  const beginEdit = (setId, key) => {
    if (editSetId !== setId) setEditSetId(setId);
    if (key) setFocusKey(key);
    if (!cardsCollapsedRef.current) {
      cardsCollapsedRef.current = true;
      setShowRecommendation(false);
      setShowPriorDetail(false);
    }
  };
  // Keyboard open (a text field focused and the visual viewport clearly shorter than without it):
  // the rest dock and Poprzednie/Następne are hidden, a running rest shows as a chip by the clock.
  const awRootRef = useRef(null);
  const awHeaderRef = useRef(null);
  const awDockRef = useRef(null);
  const awFooterRef = useRef(null);
  const [kbOpen, setKbOpen] = useState(false);
  const kbOpenRef = useRef(false);
  kbOpenRef.current = kbOpen;
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    let base = vv.height;
    const check = () => {
      const a = document.activeElement;
      const typing = Boolean(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && awRootRef.current && awRootRef.current.contains(a));
      if (!typing) base = Math.max(base, vv.height);
      const open = typing && vv.height < base - 120;
      setKbOpen(open);
      if (open && a && a.scrollIntoView) {
        try {
          a.scrollIntoView({ block: "center" });
        } catch {}
      }
    };
    const later = () => setTimeout(check, 0);
    vv.addEventListener("resize", check);
    document.addEventListener("focusin", later);
    document.addEventListener("focusout", later);
    return () => {
      vv.removeEventListener("resize", check);
      document.removeEventListener("focusin", later);
      document.removeEventListener("focusout", later);
    };
  }, []);
  // Compact header when the working area left by the photo header, the dock and the footer is
  // under 280 px (constrained height / large text) — the threshold of the master's tests.
  const [compactHeader, setCompactHeader] = useState(false);
  const compactRef = useRef(false);
  compactRef.current = compactHeader;
  const photoHeaderH = useRef(0);
  useEffect(() => {
    const measure = () => {
      if (kbOpenRef.current || !awRootRef.current) return;
      const H = awRootRef.current.clientHeight;
      if (!H) return;
      const hh = awHeaderRef.current ? awHeaderRef.current.offsetHeight : 0;
      if (!compactRef.current) photoHeaderH.current = hh;
      const used = photoHeaderH.current + (awDockRef.current ? awDockRef.current.offsetHeight : 0) + (awFooterRef.current ? awFooterRef.current.offsetHeight : 0);
      const next = H - used < 280;
      if (next !== compactRef.current) setCompactHeader(next);
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver !== "undefined" && awRootRef.current ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(awRootRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      if (ro) ro.disconnect();
    };
  }, [blockIdx, subIdx, restActive]);

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
    const dropId = newUuid();
    setEditSetId(dropId); // I4.4: the new dropset opens as the expanded set card
    setBlocks((prev) => {
      const next = prev.map((b) => ({ ...b, items: b.items.map((it) => ({ ...it, sets: [...it.sets] })) }));
      const item = next[blockIdx].items[subIdx];
      item.sets = [
        ...item.sets,
        { id: dropId, weight: "", reps: "", duration: "", rir: "0", note: "", setType: "dropset", done: false, fromSuggestion: false },
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
  // date of the previous workout shown in "Zobacz poprzednie wykonanie" (read from the history, the
  // same lookup that produced priorSets)
  const priorDate = priorSets.length ? (findMatchingSessions(history, { exerciseId: currentEx.exerciseId, beforeDate: nowDate })[0] || {}).date || null : null;
  const kind = currentEx.type;
  const setLabels = awSetLabels(currentEx.sets);
  const autoSetId = (currentEx.sets.find((s) => !isSetPerformed(s, kind)) || {}).id || null;
  const currentSetId = editSetId && currentEx.sets.some((s) => s.id === editSetId) ? editSetId : autoSetId;
  const isSuperset = currentBlock.items.length > 1;
  const showDock = !kbOpen;
  const planLine = editingSession ? editName.trim() : plan?.name || "";

  const startRest = () => {
    const secs = currentEx.restSeconds || 90;
    clearRestAutoReset();
    restSignal.unlock(); // inside this tap: lets the end signal play later
    restTargetRef.current = secs;
    setRestTarget(secs);
    setRestRemaining(secs);
    setRestActive(true);
    setRestRunning(true);
  };
  const toggleRest = () => {
    clearRestAutoReset();
    restSignal.unlock();
    if (!restRunning && restRemaining <= 0) setRestRemaining(restTarget);
    setRestRunning((r) => !r);
  };
  const resetRest = () => {
    clearRestAutoReset();
    setRestRemaining(restTarget);
    setRestRunning(false);
  };
  const closeRest = () => {
    clearRestAutoReset();
    setRestRunning(false);
    setRestActive(false);
  };

  const clockChip = !editingSession && !backfillInfo && (
    <span data-clock role="timer" aria-label={awClockLabel(elapsed)} data-testid="aw-clock" style={{ display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "32px", boxSizing: "border-box", padding: "2px 10px", borderRadius: "16px", background: "rgba(9,9,9,.5)", border: "1px solid rgba(255,255,255,.12)", fontFamily: AW_NUM, fontSize: "15px", fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "#D0D0D0" }}>
      <Clock aria-hidden="true" size={14} color={NR.textSecondary} />
      {fmtClock(elapsed)}
    </span>
  );
  const restChip = kbOpen && restActive && (
    <span data-testid="aw-rest-chip" style={{ display: "inline-flex", alignItems: "center", gap: "5px", minHeight: "32px", boxSizing: "border-box", padding: "2px 10px", borderRadius: "16px", background: "rgba(9,9,9,.6)", border: "1px solid rgba(94,194,255,.35)", fontFamily: AW_NUM, fontSize: "15px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: NR.textDisplay }}>
      <TimerIcon aria-hidden="true" size={14} color="#5EC2FF" />
      {awMmSs(restRemaining)}
      <span style={AW_SR}>{restRunning ? "przerwa trwa" : "przerwa wstrzymana"}</span>
    </span>
  );
  // back-filled / edited workout: its date (and duration) fields take the place of the clock
  const dateControls = editingSession ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: NR.textSecondary, fontSize: "14px" }}>
      <Pencil aria-hidden="true" size={13} color={NR.warm} />
      <DateField value={editDate || ""} onChange={setEditDate} max={toLocalDateStr(new Date())} testId="edit-date" wrapperClassName="flex-shrink-0" inputClassName="w-[6.6rem] bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-neutral-200 text-xs" />
    </span>
  ) : backfillInfo ? (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", color: NR.textSecondary, fontSize: "14px" }}>
      <CalendarPlus aria-hidden="true" size={14} color={NR.warm} />
      <DateField value={backfillDate || ""} onChange={setBackfillDate} max={toLocalDateStr(new Date())} testId="backfill-date" wrapperClassName="flex-shrink-0" inputClassName="w-[6.6rem] bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-neutral-200 text-xs" />
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <input type="number" min={0} value={manualDuration} onChange={(e) => setManualDuration(Number(e.target.value))} aria-label="Czas trwania treningu w minutach" className="w-12 bg-neutral-900 border border-neutral-800 rounded-lg px-1.5 py-1 text-neutral-200 text-xs text-center" />
        <span>min</span>
      </span>
    </span>
  ) : null;
  const menuButton = (photo) => (
    <button type="button" data-menu onClick={openMenu} aria-label="Menu treningu: dodaj, zamień, zakończ lub przerwij trening" data-testid="aw-menu" style={{ ...AW_ICON_BTN, background: photo ? "rgba(9,9,9,.55)" : "transparent", border: photo ? "1px solid rgba(255,255,255,.14)" : 0, borderRadius: "22px" }}>
      <MoreVertical aria-hidden="true" size={22} color={NR.textPrimary} />
    </button>
  );

  const header = compactHeader ? (
    <header ref={awHeaderRef} data-header data-mode="compact" style={{ flex: "none", position: "relative", padding: "max(env(safe-area-inset-top, 0px), 12px) 4px 10px 12px", background: "radial-gradient(180px 90px at 0 0, rgba(255,133,27,.10), rgba(255,133,27,0) 70%), #0B0B0C", borderBottom: "1px solid #1E1E20", display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
          {clockChip}
          {dateControls}
          {restChip}
        </div>
        <div style={{ flex: "1 1 auto", minWidth: "48px" }}>
          <AwProgress count={blocks.length} idx={blockIdx} />
        </div>
        {menuButton(false)}
      </div>
      <h1 data-exname style={{ margin: 0, paddingRight: "8px", fontFamily: NR.font, fontSize: "23px", lineHeight: "27px", fontWeight: 500, color: NR.textDisplay, overflowWrap: "anywhere" }}>{currentEx.name}</h1>
    </header>
  ) : (
    <header ref={awHeaderRef} data-header data-mode="photo" style={{ flex: "none", position: "relative", overflow: "hidden", padding: "max(env(safe-area-inset-top, 0px), 12px) 12px 14px", background: NR.bg }}>
      <img src={WELCOME_BG_IMAGE} alt="" data-photo="temporary" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "62% 40%" }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 70% at 78% 30%, rgba(255,133,27,.22), rgba(255,133,27,0) 70%)", mixBlendMode: "screen" }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(9,9,9,.55) 0%, rgba(9,9,9,.25) 30%, rgba(9,9,9,.80) 70%, #090909 100%)" }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(9,9,9,.85) 0%, rgba(9,9,9,.35) 55%, rgba(9,9,9,0) 80%)" }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginRight: "-4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
            {clockChip}
            {dateControls}
            {restChip}
          </div>
          {menuButton(true)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "14px" }}>
          <span style={{ fontFamily: NR.font, fontSize: "15px", lineHeight: "18px", fontWeight: 500, letterSpacing: ".04em", textTransform: "uppercase", color: "#D0D0D0" }}>
            {planLine && <span style={nrHeadText}>{planLine}</span>}
            {planLine ? " · " : ""}Ćwiczenie {blockIdx + 1} z {blocks.length}
          </span>
          {isSuperset && <AwSupersetBar items={currentBlock.items} subIdx={subIdx} onPick={setSubIdx} />}
          <h1 data-exname style={{ margin: 0, fontFamily: NR.font, fontSize: "30px", lineHeight: "34px", fontWeight: 500, color: NR.textDisplay, maxWidth: "330px", overflowWrap: "anywhere" }}>{currentEx.name}</h1>
        </div>
        <AwProgress count={blocks.length} idx={blockIdx} />
      </div>
    </header>
  );

  const inputStyle = (key, dim) => ({
    width: "100%",
    height: "56px",
    boxSizing: "border-box",
    padding: "0 8px",
    borderRadius: "10px",
    border: focusKey === key ? `2px solid ${NR.warm}` : "1px solid #2E2E30",
    boxShadow: focusKey === key ? "0 0 0 3px rgba(255,133,27,.18)" : "none",
    background: "#121213",
    color: dim ? "#BDBDBD" : NR.textDisplay,
    fontFamily: AW_NUM,
    fontSize: "24px",
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    textAlign: "center",
    outline: "none",
    WebkitAppearance: "none",
    appearance: "none",
  });
  const fieldProps = (s, key) => ({
    onFocus: () => beginEdit(s.id, `${s.id}:${key}`),
    onBlur: () => setFocusKey((k) => (k === `${s.id}:${key}` ? null : k)),
    "data-field": key,
  });

  const renderCurrentSet = (s, i) => {
    const isDrop = s.setType === "dropset";
    const label = setLabels[i];
    const detail = !isDrop ? currentEx.setsDetail.find((d) => d.id === (s.detailId ?? s.id)) : null;
    const targetText = detail && (detail.target || formatRir(detail.rir))
      ? [detail.target ? `Cel: ${awRange(detail.target)}${kind === "time" ? " s" : ""}` : null, formatRir(detail.rir) ? `RIR ${formatRir(detail.rir)}` : null].filter(Boolean).join(" · ")
      : null;
    const prior = awPriorFor(currentEx.sets, i, priorSets);
    const noteOpen = openNoteId === s.id;
    const prefilled = Boolean(s.fromSuggestion) && s.weight !== "" && s.weight != null;
    const patch = (p) => {
      beginEdit(s.id);
      patchSet(s.id, p);
    };
    const weightField = (labelText, placeholder) => (
      <AwField label={labelText} srLabel={`${labelText.replace(" kg", "")}, ${label}${prefilled ? " (wstępnie wpisany z ostatniego treningu)" : ""}`} flex="1.15 1 0" minWidth="3.3em">
        <input type="text" inputMode="decimal" value={s.weight} placeholder={placeholder} {...fieldProps(s, "kg")} onChange={(e) => patch({ weight: e.target.value, fromSuggestion: false })} style={inputStyle(`${s.id}:kg`, prefilled)} />
        {prefilled && (
          <span aria-hidden="true" data-testid="aw-weight-last" style={{ position: "absolute", right: "6px", top: "4px", fontFamily: NR.font, fontSize: "12px", lineHeight: "13px", fontWeight: 500, color: NR.textSecondary, background: "#1E1E20", borderRadius: "4px", padding: "1px 4px" }}>
            ostatnio
          </span>
        )}
      </AwField>
    );
    return (
      <li key={s.id} data-set="current" data-testid="aw-set-current" style={{ listStyle: "none", position: "relative", borderRadius: "16px", overflow: "hidden", border: "1px solid transparent", background: `linear-gradient(${isDrop ? "#140D08, #140D08" : "#0B0B0C, #0B0B0C"}) padding-box, linear-gradient(160deg, #FF9A3D 0%, rgba(255,133,27,.85) 20%, rgba(255,106,0,.45) 55%, rgba(255,106,0,.25) 100%) border-box`, boxShadow: "0 12px 28px -8px rgba(0,0,0,.85)" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "15px", overflow: "hidden", pointerEvents: "none" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(150px 110px at 0 0, rgba(255,154,61,.30) 0%, rgba(255,106,0,.10) 45%, rgba(255,106,0,0) 100%)" }} />
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "10px", padding: "8px 6px 14px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontFamily: NR.font, fontSize: "23px", lineHeight: "26px", fontWeight: 500, color: isDrop ? "#FF9A3D" : NR.textDisplay }}>{label}</span>
              {targetText && <span style={{ fontFamily: NR.font, fontSize: "16px", lineHeight: "19px", color: NR.textSecondary }}>{targetText}</span>}
            </span>
            <button type="button" aria-label="Komentarz do serii" aria-expanded={noteOpen} onClick={() => setOpenNoteId(noteOpen ? null : s.id)} style={AW_ICON_BTN}>
              <MessageSquare aria-hidden="true" size={20} color={noteOpen || s.note ? NR.warm : NR.textSecondary} />
            </button>
            {isDrop && (
              <button type="button" aria-label={`Usuń ${label.toLowerCase()}`} onClick={() => removeDropset(s.id)} data-testid="aw-remove-dropset" style={AW_ICON_BTN}>
                <X aria-hidden="true" size={18} color={NR.textSecondary} />
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingRight: "8px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {(kind === "weight" || kind === "sets") && weightField("Ciężar kg", "—")}
              {kind === "bodyweightPlus" && weightField("MW + kg", "+ kg")}
              {kind === "time" ? (
                <AwField label="Czas s" srLabel={`Czas w sekundach, ${label}`} flex="1.4 1 0" minWidth="3.3em">
                  <span style={{ display: "flex", gap: "6px" }}>
                    <input type="number" inputMode="numeric" min={0} value={s.duration} placeholder="—" {...fieldProps(s, "dur")} onChange={(e) => patch({ duration: e.target.value })} style={inputStyle(`${s.id}:dur`, false)} />
                    <button type="button" aria-label="Stoper serii" aria-expanded={timerRowId === s.id} onClick={() => openTimerForRow(s.id, s.duration)} style={{ ...AW_ICON_BTN, width: "56px", height: "56px", borderRadius: "10px", border: `1px solid ${timerRowId === s.id ? "rgba(94,194,255,.45)" : "#2E2E30"}`, background: timerRowId === s.id ? "rgba(94,194,255,.12)" : "#121213" }}>
                      <TimerIcon aria-hidden="true" size={20} color={timerRowId === s.id ? "#5EC2FF" : NR.textSecondary} />
                    </button>
                  </span>
                </AwField>
              ) : kind === "sets" ? (
                <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span aria-hidden="true" style={AW_LABEL}>Seria</span>
                  <button type="button" aria-pressed={Boolean(s.done)} onClick={() => patch({ done: !s.done })} style={{ height: "56px", borderRadius: "10px", border: `1px solid ${s.done ? "rgba(66,201,138,.5)" : "#2E2E30"}`, background: s.done ? "rgba(66,201,138,.12)" : "#121213", color: s.done ? NR.success : NR.textSecondary, fontFamily: NR.font, fontSize: "18px", fontWeight: 500, cursor: "pointer" }}>
                    {s.done ? "Wykonano ✓" : "Zaznacz"}
                  </button>
                </div>
              ) : (
                <AwField label="Powtórzenia" srLabel={`Powtórzenia, ${label}`} flex="1 1 0" minWidth="2.9em">
                  <input type="number" inputMode="numeric" min={0} value={s.reps} placeholder="—" {...fieldProps(s, "reps")} onChange={(e) => patch({ reps: e.target.value })} style={inputStyle(`${s.id}:reps`, false)} />
                </AwField>
              )}
              <AwField label="RIR" srLabel={`RIR, ${label}`} flex="0.95 1 0" minWidth="3.4em" fontSize="20px">
                <select value={s.rir} {...fieldProps(s, "rir")} onChange={(e) => patch({ rir: e.target.value })} style={{ ...inputStyle(`${s.id}:rir`, false), padding: "0 22px 0 8px", fontSize: "20px", color: s.rir ? NR.textDisplay : "#7A7A7A" }}>
                  <option value="">–</option>
                  {RIR_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {formatRir(r)}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true" style={{ position: "absolute", right: "6px", top: "50%", marginTop: "-8px", display: "flex", pointerEvents: "none" }}>
                  <ChevronDown size={16} color={NR.textSecondary} />
                </span>
              </AwField>
            </div>
            {noteOpen && (
              <label style={{ display: "block" }}>
                <span style={AW_SR}>Komentarz do serii</span>
                <textarea rows={2} value={s.note} {...fieldProps(s, "note")} onChange={(e) => patch({ note: e.target.value })} placeholder="Komentarz do tej serii (np. „ból nadgarstka”, „ciężar za duży”)…" style={{ width: "100%", boxSizing: "border-box", minHeight: "64px", resize: "none", padding: "10px 12px", borderRadius: "10px", border: `${focusKey === `${s.id}:note` ? 2 : 1}px solid ${focusKey === `${s.id}:note` ? NR.warm : "#2E2E30"}`, background: "#121213", color: NR.textPrimary, fontFamily: NR.font, fontSize: "17px", lineHeight: "21px", outline: "none" }} />
              </label>
            )}
            {timerRowId === s.id && (
              <div data-testid="aw-stopwatch" style={{ borderRadius: "12px", border: "1px solid rgba(94,194,255,.30)", background: "#0E1114", padding: "10px" }}>
                <div role="timer" style={{ textAlign: "center", fontFamily: AW_NUM, fontSize: "40px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: NR.textDisplay }}>{fmtClock(timerSec)}</div>
                <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                  <button type="button" onClick={() => setTimerRunning((r) => !r)} style={{ flex: 1, minHeight: "44px", borderRadius: "10px", border: 0, background: "#5EC2FF", color: NR.bg, fontFamily: NR.font, fontSize: "17px", fontWeight: 600, cursor: "pointer" }}>
                    {timerRunning ? "Pauza" : "Start"}
                  </button>
                  <button type="button" onClick={() => setTimerSec(0)} style={{ minHeight: "44px", padding: "0 14px", borderRadius: "10px", border: 0, background: "#1A1A1B", color: NR.textPrimary, fontFamily: NR.font, fontSize: "17px", cursor: "pointer" }}>
                    Reset
                  </button>
                  <button type="button" onClick={saveTimerToRow} style={{ minHeight: "44px", padding: "0 14px", borderRadius: "10px", border: 0, background: NR.ctaFill, color: NR.bg, fontFamily: NR.font, fontSize: "17px", fontWeight: 600, cursor: "pointer" }}>
                    Zapisz
                  </button>
                </div>
              </div>
            )}
            {prior && (
              <p style={{ margin: 0, fontFamily: NR.font, fontSize: "16px", lineHeight: "20px", color: NR.textSecondary }}>
                Poprzednio: <span style={{ fontFamily: AW_NUM, fontWeight: 500, color: NR.textPrimary, fontVariantNumeric: "tabular-nums" }}>{awResultText(prior, kind)}</span>
              </p>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div ref={awRootRef} data-testid="active-workout" data-screen="active-workout" style={{ position: "fixed", inset: 0, overflow: "hidden", background: NR.bg, color: NR.textPrimary, fontFamily: NR.font, display: "flex", flexDirection: "column" }}>
      <FontStyles />
      {safetyBanner}
      {header}

      <main className="no-scrollbar" data-main style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "4px 12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {compactHeader && isSuperset && <AwSupersetBar items={currentBlock.items} subIdx={subIdx} onPick={setSubIdx} />}
        {editingSession && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nazwa treningu (opcjonalnie)" aria-label="Nazwa treningu" style={{ flex: 1, minWidth: 0, minHeight: "44px", boxSizing: "border-box", padding: "0 12px", borderRadius: "10px", border: "1px solid #2E2E30", background: "#121213", color: NR.textPrimary, fontFamily: NR.font, fontSize: "17px", outline: "none" }} />
            <button type="button" onClick={() => removeExerciseBlock(blockIdx)} title="Usuń to ćwiczenie z treningu" aria-label="Usuń to ćwiczenie z treningu" style={AW_ICON_BTN}>
              <Trash2 aria-hidden="true" size={18} color={NR.textSecondary} />
            </button>
          </div>
        )}

        {priorSets.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* "Zalecenie na dziś" is the engine's reading of the history → PRO only (expanded by
                default, no status label). Free keeps the production lock card. */}
            {currentEx.priorMessage && !isPro && (
              <div style={{ position: "relative", flexShrink: 0 }}>
                <button type="button" onClick={() => onOpenUnlock && onOpenUnlock()} data-testid="pro-recommendation-lock" style={{ width: "100%", minHeight: "56px", boxSizing: "border-box", padding: "8px 10px 8px 14px", borderRadius: "16px", border: "1px solid rgba(255,133,27,.30)", background: NR.cardSurface, boxShadow: NR.cardShadow, display: "flex", alignItems: "center", gap: "10px", textAlign: "left", cursor: "pointer" }}>
                  <Lock aria-hidden="true" size={18} color={NR.warm} style={{ flexShrink: 0 }} />
                  <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={nrHeadText}>Zalecenia treningowe — PRO</span>
                    <span style={{ fontFamily: NR.font, fontSize: "15px", lineHeight: "18px", color: NR.textSecondary }}>Zobacz, co wynika z Twojej historii</span>
                  </span>
                  <span style={{ flexShrink: 0, padding: "6px 10px", borderRadius: "14px", background: NR.warm, color: NR.bg, fontFamily: NR.font, fontSize: "14px", fontWeight: 600, whiteSpace: "nowrap" }}>Poznaj PRO</span>
                </button>
              </div>
            )}
            {currentEx.priorMessage && isPro && (
              <div style={{ position: "relative", flexShrink: 0 }}>
                <section data-testid="aw-recommendation" style={{ position: "relative", borderRadius: "16px", background: NR.cardSurface, boxShadow: NR.cardShadow }}>
                  <AwCardToggle open={showRecommendation} onToggle={() => setShowRecommendation((v) => !v)} icon={Sparkles} warm title="Zalecenie na dziś" />
                  {showRecommendation && <p style={{ margin: 0, padding: "0 14px 14px 42px", fontFamily: NR.font, fontSize: "16px", lineHeight: "21px", color: "#D9D9D9" }}>{currentEx.priorMessage}</p>}
                </section>
                {showRecommendation && <NrFadeBorder alpha={0.5} />}
              </div>
            )}
            <section data-testid="aw-prior" style={{ flexShrink: 0, borderRadius: "16px", border: "1px solid #222224", background: "linear-gradient(180deg, #121213, #0D0D0E)" }}>
              <AwCardToggle open={showPriorDetail} onToggle={() => setShowPriorDetail((v) => !v)} icon={HistoryIcon} title="Zobacz poprzednie wykonanie treningu" />
              {showPriorDetail && (
                <div style={{ padding: "0 12px 12px 14px" }}>
                  <p style={{ margin: "0 0 8px", fontFamily: NR.font, fontSize: "14px", letterSpacing: ".04em", textTransform: "uppercase", color: NR.textMuted }}>
                    {priorDate ? `${fmtDate(priorDate)} · ` : ""}wyniki wg serii
                  </p>
                  <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {awSetLabels(priorSets).map((lbl, i) => (
                      <li key={i} style={{ display: "flex", gap: "10px", alignItems: "baseline", padding: "6px 10px", borderRadius: "8px", background: NR.card }}>
                        <span style={{ width: "52px", flexShrink: 0, fontFamily: NR.font, fontSize: "15px", color: priorSets[i].setType === "dropset" ? "#FF9A3D" : NR.textMuted }}>{lbl}</span>
                        <span style={{ fontFamily: AW_NUM, fontSize: "16px", fontWeight: 500, fontVariantNumeric: "tabular-nums", color: NR.textPrimary }}>{awResultText(priorSets[i], kind)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          </div>
        )}

        {kind === "bodyweightPlus" && (
          <p style={{ margin: 0, display: "flex", alignItems: "center", gap: "6px", fontFamily: NR.font, fontSize: "15px", lineHeight: "18px", color: "#FF9A3D" }}>
            <Layers aria-hidden="true" size={13} /> Ćwiczenie na masie własnej — wpisz dodatkowy ciężar doczepiony do ciała
          </p>
        )}
        {currentEx.loadSnapshot && kind !== "bodyweightPlus" && atlasLoadHint(currentEx.loadSnapshot) && (
          <p data-testid="atlas-load-hint" style={{ margin: 0, display: "flex", alignItems: "center", gap: "6px", fontFamily: NR.font, fontSize: "15px", lineHeight: "18px", color: NR.textSecondary }}>
            <Layers aria-hidden="true" size={13} /> {atlasLoadHint(currentEx.loadSnapshot)}
          </p>
        )}

        {/* Series — exactly the plan's series; only a dropset can add a row (appended at the end) */}
        {kind !== "cardio" && (
          <>
            <ol aria-label="Serie" style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {currentEx.sets.map((s, i) =>
                s.id === currentSetId ? (
                  renderCurrentSet(s, i)
                ) : isSetPerformed(s, kind) ? (
                  <AwSetDone key={s.id} label={setLabels[i]} set={s} kind={kind} onEdit={() => setEditSetId(s.id)} />
                ) : (
                  <AwSetPending key={s.id} label={setLabels[i]} kind={kind} onEdit={() => setEditSetId(s.id)} />
                )
              )}
            </ol>
            {kind !== "time" && kind !== "sets" && (
              <button type="button" onClick={addDropset} data-testid="aw-add-dropset" style={{ width: "100%", minHeight: "48px", flexShrink: 0, borderRadius: "12px", border: "1px dashed rgba(255,133,27,.45)", background: "transparent", color: "#FF9A3D", fontFamily: NR.font, fontSize: "17px", fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer" }}>
                <Layers aria-hidden="true" size={17} color="#FF9A3D" /> + Dropset
              </button>
            )}
          </>
        )}

        {kind === "cardio" && <CardioEntryPanel key={currentEx.planItemId} set={currentEx.sets[0]} deviceType={currentEx.deviceType || "Inne"} onPatch={(patch) => patchSet(currentEx.sets[0].id, patch)} />}
      </main>

      {/* Rest — docked above the footer; manual Start / Pause / Reset / Close; one shared value per
          superset; keeps running while sets are edited. Hidden (chip by the clock) while typing. */}
      {kind !== "cardio" && showDock && (
        <div ref={awDockRef} data-rest style={{ flex: "none", padding: "0 12px 8px" }}>
          {!restActive ? (
            <button type="button" onClick={startRest} data-testid="aw-rest-start" style={{ width: "100%", minHeight: "48px", boxSizing: "border-box", padding: "6px 12px", borderRadius: "14px", border: "1px solid rgba(94,194,255,.30)", background: "#0E1114", color: "#5EC2FF", fontFamily: NR.font, fontSize: "18px", lineHeight: "21px", fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer" }}>
              <TimerIcon aria-hidden="true" size={18} color="#5EC2FF" />
              <span>
                Start przerwy ({currentEx.restSeconds || 90} s){isSuperset ? " — cała superseria" : ""}
              </span>
            </button>
          ) : (
            <section role="region" aria-label="Przerwa" data-testid="aw-rest" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0 10px", minHeight: "64px", boxSizing: "border-box", padding: "8px 6px 8px 10px", borderRadius: "16px", background: "linear-gradient(180deg, rgba(22,28,33,.96), rgba(12,15,18,.96))", border: "1px solid rgba(94,194,255,.30)", boxShadow: "0 10px 24px -8px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.05)" }}>
              <AwRestRing remaining={restRemaining} target={restTarget} />
              <span style={{ display: "flex", flexDirection: "column", minWidth: "max-content", flex: "1 1 auto" }}>
                <span style={{ fontFamily: NR.font, fontSize: "14px", lineHeight: "16px", letterSpacing: ".04em", textTransform: "uppercase", color: "#5EC2FF" }}>Przerwa</span>
                <span role="timer" data-testid="aw-rest-time" style={{ fontFamily: AW_NUM, fontSize: "25px", lineHeight: "28px", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: NR.textDisplay }}>{awMmSs(restRemaining)}</span>
              </span>
              <button type="button" aria-label={restRunning ? "Pauza przerwy" : "Start przerwy"} onClick={toggleRest} style={AW_ICON_BTN}>
                {restRunning ? <Pause aria-hidden="true" size={18} color={NR.textPrimary} /> : <Play aria-hidden="true" size={18} color={NR.textPrimary} />}
              </button>
              <button type="button" aria-label="Resetuj przerwę" onClick={resetRest} style={AW_ICON_BTN}>
                <RotateCcw aria-hidden="true" size={18} color={NR.textSecondary} />
              </button>
              <button type="button" aria-label="Zamknij przerwę" onClick={closeRest} style={AW_ICON_BTN}>
                <X aria-hidden="true" size={18} color={NR.textSecondary} />
              </button>
            </section>
          )}
        </div>
      )}

      {showDock && (
        <footer ref={awFooterRef} data-footer style={{ flex: "none", display: "flex", flexWrap: "wrap", gap: "10px", padding: "10px 12px max(env(safe-area-inset-bottom, 0px), 12px)", background: NR.bg, borderTop: "1px solid #1C1C1D" }}>
          <button type="button" data-act="prev" onClick={goPrev} disabled={!canGoPrev} style={{ flex: "1 1 0", minWidth: "max-content", padding: "0 12px", minHeight: "52px", borderRadius: "10px", border: `1px solid ${NR.hairline}`, background: "#121213", color: NR.textPrimary, fontFamily: NR.font, fontSize: "19px", fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", cursor: canGoPrev ? "pointer" : "default", opacity: canGoPrev ? 1 : 0.35 }}>
            <ChevronLeft aria-hidden="true" size={20} color={NR.textPrimary} />
            Poprzednie
          </button>
          <button
            type="button"
            data-act={isLastExercise ? "finish" : "next"}
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
            style={{ flex: "1.35 1 0", minWidth: "max-content", padding: "0 14px", minHeight: "52px", border: 0, borderRadius: "10px", background: NR.ctaFill, boxShadow: NR.ctaShadow, color: NR.bg, fontFamily: NR.font, fontWeight: 600, fontSize: "20px", lineHeight: "22px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer" }}
          >
            {isLastExercise ? (
              <>
                <Check aria-hidden="true" size={20} strokeWidth={2.5} color={NR.bg} /> Zakończ
              </>
            ) : (
              <>
                Następne <ChevronRight aria-hidden="true" size={20} strokeWidth={2.5} color={NR.bg} />
              </>
            )}
          </button>
        </footer>
      )}

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
        <NrSheet menu onClose={() => setMenuOpen(false)} ariaLabel="Menu treningu" testId="aw-menu-sheet">
          <AwMenuItem
            icon={Plus}
            title="Dodaj kolejne ćwiczenie do treningu"
            onClick={() => {
              setMenuOpen(false);
              setAddPickerOpen(true); // reuses the history entry already pushed when the menu opened — no second push here
            }}
          />
          {blocks.length > 0 && (
            <AwMenuItem
              icon={Repeat}
              title="Zamień ćwiczenie"
              onClick={() => {
                setMenuOpen(false);
                // reuses the menu's history entry, like "Dodaj kolejne ćwiczenie"
                const total = blocks.reduce((n, b) => n + b.items.length, 0);
                setReplaceFlow(total === 1 ? { step: "pick", bi: 0, ii: 0 } : { step: "target" });
              }}
            />
          )}
          {currentEx.videoUrl && <AwMenuItem icon={PlayCircle} color="#5EC2FF" title="Zobacz film instruktażowy" href={currentEx.videoUrl} onClick={() => setMenuOpen(false)} />}
          <div aria-hidden="true" style={{ height: "1px", background: "#232325", margin: "4px 12px" }} />
          <AwMenuItem
            icon={Check}
            color={NR.warm}
            title={editingSession ? "Zapisz trening" : "Zakończ trening"}
            sub={editingSession ? "Zapisany wcześniej trening zostanie zaktualizowany." : "Bieżące wyniki zostaną zapisane i trening zostanie zakończony."}
            onClick={() => {
              setMenuOpen(false);
              setConfirmFinish("finish");
            }}
          />
          <AwMenuItem
            icon={X}
            color={NR.dangerText}
            title={editingSession ? "Odrzuć zmiany" : "Przerwij trening"}
            sub={editingSession ? "Wprowadzone zmiany nie zostaną zapisane." : "Postęp zostanie zapisany — wrócisz do treningu z ekranu Start."}
            onClick={() => {
              setMenuOpen(false);
              setConfirmFinish("cancel");
            }}
          />
        </NrSheet>
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

