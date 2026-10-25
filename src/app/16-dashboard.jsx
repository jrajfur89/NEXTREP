function NameModal({ currentName, onSave, onClose }) {
  const [value, setValue] = useState(currentName || "");
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onClose}>
      <div className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-4" />
        <h2 className="font-display text-2xl text-neutral-50 tracking-wide mb-1">{currentName ? "ZMIEŃ IMIĘ" : "JAK MAM SIĘ DO CIEBIE ZWRACAĆ?"}</h2>
        <p className="text-neutral-500 text-xs mb-4">Będę używać go w powitaniach i podsumowaniach treningów.</p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="np. Kuba"
          autoFocus
          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-neutral-100 outline-none focus:border-orange-500"
        />
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold">
            {currentName ? "Anuluj" : "Pomiń"}
          </button>
          <button
            onClick={() => onSave(value.trim())}
            disabled={!value.trim()}
            className="flex-1 py-3 rounded-xl bg-orange-500 disabled:opacity-40 text-neutral-950 font-bold"
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}

// Rotating greeting line shown under the dashboard's "Cześć" — one per dashboard visit, held
// stable for the whole time the person is on the dashboard (picked via useState's lazy
// initializer in Dashboard, never re-rolled on re-render).
const DASHBOARD_WELCOME_PHRASES = [
  "Gotowy na kolejny trening?",
  "Czas zrobić kolejny krok.",
  "Gotowy, żeby trenować?",
  "Twój kolejny trening czeka.",
  "Zaczynamy kolejny trening?",
  "Czas na kolejną serię.",
  "Wracamy do pracy?",
  "Gotowy na kolejny rep?",
  "Czas kontynuować progres.",
  "Kolejny trening. Kolejny krok.",
  "Wracasz po więcej?",
  "Twój następny trening zaczyna się teraz.",
  "Czas sprawdzić, co dziś zrobisz.",
  "Gotowy poprawić swój wynik?",
  "Kolejny trening. Jedziemy.",
  "Czas zrobić swoje.",
  "Gotowy na następny poziom?",
  "Twój progres czeka na kolejny trening.",
  "Zobaczmy, co dziś wypracujesz.",
  "Zaczynamy? Twój kolejny rep czeka.",
];

// Motivational phrases shown over the dashboard's photo card. Pre-split into a white first part
// (w) and an orange-highlighted second part (o) — the split point is chosen once, here, rather
// than at render time, so it's always a sensible break and the two parts always reconstruct the
// exact phrase from the spec.
const DASHBOARD_CARD_PHRASES = [
  { w: "Każdy trening buduje", o: "kolejny." },
  { w: "Twój następny rep", o: "zaczyna się tutaj." },
  { w: "Mały krok.", o: "Duży progres." },
  { w: "Dziś budujesz", o: "swoją formę." },
  { w: "Każda seria", o: "ma znaczenie." },
  { w: "Progres zaczyna się od", o: "kolejnego powtórzenia." },
  { w: "Wczorajszy wynik.", o: "Dzisiejszy cel." },
  { w: "Trenuj dziś.", o: "Poprawiaj jutro." },
  { w: "Twój wynik.", o: "Twój kolejny krok." },
  { w: "Każdy trening", o: "zostawia ślad." },
  { w: "Nie zaczynasz od zera.", o: "Zaczynasz od ostatniego treningu." },
  { w: "To, co zrobisz dziś,", o: "buduje kolejny wynik." },
  { w: "Kolejna seria.", o: "Kolejny krok." },
  { w: "Twoja historia tworzy", o: "Twój progres." },
  { w: "Analizuj. Trenuj.", o: "Poprawiaj." },
  { w: "Wiesz, gdzie byłeś.", o: "Wiesz, co dalej." },
  { w: "Poprzedni trening.", o: "Następny cel." },
  { w: "Progres to kolejny", o: "dobrze wykonany rep." },
  { w: "Każdy trening przybliża Cię", o: "do celu." },
  { w: "Twój progres ma", o: "swoją historię." },
];

// Dashboard's three-number summary. Deliberately does NOT introduce any new analysis: "Progres"
// is the status from the one progression engine (analyzeSessionExercise → computeExerciseAnalysis,
// current logic, chronological history). Only occurrences the engine could actually compare count;
// a first-ever occurrence (baseline) is never counted as "progress".
// Rolling month (Dashboard): 30 calendar days ending on the day of the LAST COMPLETED workout
// (local days, both ends inclusive): start = D − 29 days 00:00, end = D 23:59:59.999. Anchored on
// the last workout — never on "today" — so a pause or the 1st of a month doesn't empty the summary.
// History only ever holds completed workouts (finish()); an active/interrupted workout lives in the
// draft key, so it can't move the range.
function getLastCompletedWorkoutDate(history) {
  let last = null;
  (Array.isArray(history) ? history : []).forEach((s) => {
    const t = s && s.date ? Date.parse(s.date) : NaN;
    if (!Number.isNaN(t) && (last === null || t > last)) last = t;
  });
  return last === null ? null : new Date(last);
}
function getRollingMonthRange(lastCompletedWorkoutDate) {
  if (!lastCompletedWorkoutDate) return null;
  const d = new Date(lastCompletedWorkoutDate);
  if (Number.isNaN(d.getTime())) return null;
  return {
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate() - 29, 0, 0, 0, 0),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
  };
}

// Next workout for the Dashboard — restored from the original NEXTREP getNextPlan (removed in the
// Dashboard redesign). "Moje plany" are cycled in their STORED order, i.e. the order the person sets
// with the ↑/↓ arrows in the Plany tab: find the most recent session that used one of these plans
// and return the plan after it; after the last one, back to the first. Only own plans count (a ready
// plan used without saving it isn't in `plans`). One deliberate difference to the original: with no
// session from these plans yet it returns null (the original returned plans[0]) — the Dashboard then
// keeps its usual "ROZPOCZNIJ TRENING" card instead of guessing. A next plan with no exercises → null.
function getNextPlan(plans, history) {
  if (!Array.isArray(plans) || !plans.length) return null;
  const relevant = (Array.isArray(history) ? [...history] : [])
    .filter((h) => h && h.planId && plans.some((p) => p.id === h.planId))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!relevant.length) return null;
  const idx = plans.findIndex((p) => p.id === relevant[0].planId);
  if (idx === -1) return null;
  const next = plans[(idx + 1) % plans.length];
  return next && Array.isArray(next.exercises) && next.exercises.length > 0 ? next : null;
}

// Dashboard card for an UNFINISHED workout: a read-only summary of the existing active-workout
// draft (the same object the resume path uses). No timer, no new storage:
//   elapsedSec — the workout clock at the moment it was left (draft.savedAt − draft.startTime;
//                the live clock is Date.now() − startTime and the draft is saved on every change,
//                on interrupt and when the page is hidden/closed),
//   done/total — exercises whose planned (non-dropset) sets are all performed / all exercises,
//   volume     — from the volume access point (src/engine/volume.js, draftVolume); until PE-A5
//                kg, exactly the formula finish() stores as session.volume, over performed sets
//                only (isSetPerformed), so the number matches the finished workout's report.
// An empty or broken draft → null (not treated as an active workout).
function summarizeActiveWorkoutDraft(draft) {
  if (!draft || !Array.isArray(draft.blocks)) return null;
  const items = draft.blocks.flatMap((b) => (b && Array.isArray(b.items) ? b.items : []));
  if (items.length === 0) return null;
  const start = Number(draft.startTime);
  const saved = Date.parse(draft.savedAt);
  const elapsedSec = Number.isFinite(start) && Number.isFinite(saved) && saved >= start ? Math.floor((saved - start) / 1000) : null;
  let done = 0;
  items.forEach((it) => {
    const sets = Array.isArray(it.sets) ? it.sets : [];
    const planned = sets.filter((st) => st && st.setType !== "dropset");
    if (planned.length > 0 && planned.every((st) => isSetPerformed(st, it.type))) done++;
  });
  const volume = draftVolume(items, isSetPerformed);
  return { name: (draft.plan && draft.plan.name) || "Trening bez planu", elapsedSec, doneExercises: done, totalExercises: items.length, volume };
}

function computeDashboardSummary(history) {
  const range = getRollingMonthRange(getLastCompletedWorkoutDate(history));
  const monthSessions = range
    ? history.filter((s) => {
        const t = Date.parse(s.date);
        return !Number.isNaN(t) && t >= range.start.getTime() && t <= range.end.getTime();
      })
    : [];

  let exerciseOccurrences = 0;
  let analyzed = 0;
  let positive = 0;

  monthSessions.forEach((session) => {
    (session.exercises || []).forEach((ex) => {
      if (!ex.sets || !ex.sets.length) return;
      exerciseOccurrences++;
      if (ex.type === "cardio") return;
      const a = analyzeSessionExercise(history, session, ex);
      if (!a || a.baseline) return; // no comparable earlier performance → not analyzed
      const status = a.status;
      analyzed++;
      if (status === "green") positive++;
    });
  });

  return {
    workoutsCount: monthSessions.length,
    exercisesCount: exerciseOccurrences,
    progressPct: analyzed > 0 ? Math.round((positive / analyzed) * 100) : null,
  };
}

// I4.2 — Dashboard after the approved masters (canvas v81):
//   Returning User (DASH-RU, 11.10) — history, no unfinished workout;
//   New User (DASH-NU, 13.10) — no finished workout: A without a plan, B with a plan;
//   Interrupted Workout (DASH-IW, 13.10) — an unfinished workout (draft with exercises) has priority.
// Values: only the existing app logic. Progress values not approved by the masters (volume change,
// regularity) are shown as an explicitly marked temporary state ("Wkrótce"), never as numbers.
// Photos are temporary (the app's own image). B2 navigation is the bottom bar.
function dashLastSession(history) {
  let last = null;
  (Array.isArray(history) ? history : []).forEach((s) => {
    const t = s && s.date ? Date.parse(s.date) : NaN;
    if (!Number.isNaN(t) && (!last || t > Date.parse(last.date))) last = s;
  });
  return last;
}
function DashGreeting({ title, subtitle, onEditName }) {
  return (
    <section style={{ position: "relative", minHeight: "84px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "6px", margin: "14px 0 8px 9px", maxWidth: "184px" }}>
      <h1 style={{ margin: 0, fontWeight: 600, fontSize: "32px", lineHeight: "36px", color: NR.textDisplay }}>
        <button type="button" onClick={onEditName} aria-label={`${title} Zmień imię`} data-testid="dashboard-greeting" style={{ all: "inherit", cursor: "pointer" }}>
          {title}
        </button>
      </h1>
      <p style={{ margin: 0, fontSize: "16px", lineHeight: "20px", fontWeight: 400, color: NR.textPrimary }}>{subtitle}</p>
    </section>
  );
}
function DashCardLink({ children, onClick, ariaLabel, testId, minHeight, alpha }) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        data-testid={testId}
        className="focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF851B]"
        style={{ position: "relative", width: "100%", textAlign: "left", minHeight, boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px", padding: "14px 14px 15px", borderRadius: "16px", background: NR.cardSurface, boxShadow: NR.cardShadow, color: "inherit", border: 0, fontFamily: NR.font, cursor: "pointer" }}
      >
        {children}
      </button>
      <NrFadeBorder alpha={alpha} />
    </div>
  );
}
function DashCardTop({ icon, title, right }) {
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", minHeight: "20px", width: "100%" }}>
      <NrSectionHead icon={icon}>{title}</NrSectionHead>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "15px", fontWeight: 400, color: NR.textSecondary, whiteSpace: "nowrap", flexShrink: 0 }}>
        {right}
        <ChevronRight aria-hidden="true" size={16} strokeWidth={2} color={NR.warm} />
      </span>
    </span>
  );
}
function DashLastWorkoutCard({ session, onOpen }) {
  const name = session.planName || "Trening bez planu";
  const count = Array.isArray(session.exercises) ? session.exercises.length : 0;
  const minutes = Number.isFinite(Number(session.durationSec)) && Number(session.durationSec) > 0 ? Math.round(Number(session.durationSec) / 60) : null;
  const vol = Number(sessionVolume(session)) || 0;
  const date = fmtDate(session.date);
  return (
    <DashCardLink onClick={onOpen} ariaLabel={`Ostatni trening: ${name}, ${date}. Otwórz szczegóły i raport`} testId="dashboard-last-workout" minHeight="140px" alpha={0.6}>
      <DashCardTop icon={HistoryIcon} title="Ostatni trening" right={date} />
      <span style={{ display: "flex", gap: "16px", alignItems: "center", width: "100%" }}>
        <img src={WELCOME_BG_IMAGE} alt="" data-photo="temporary" style={{ width: "93px", height: "80px", flexShrink: 0, borderRadius: "10px", border: `1px solid ${NR.hairline}`, objectFit: "cover", objectPosition: "50% 40%" }} />
        <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontWeight: 500, fontSize: "23px", lineHeight: "26px", color: NR.textDisplay, overflowWrap: "anywhere" }}>{name}</span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: "16px", lineHeight: "20px", fontWeight: 400, color: NR.textSecondary }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Dumbbell aria-hidden="true" size={17} strokeWidth={2} color={NR.warm} style={{ flexShrink: 0 }} />
              {count} {plWord(count, "ćwiczenie", "ćwiczenia", "ćwiczeń")}
            </span>
            {minutes != null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Clock aria-hidden="true" size={17} strokeWidth={2} color={NR.warm} style={{ flexShrink: 0 }} />
                {minutes} min
              </span>
            )}
          </span>
          {vol > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "16px", lineHeight: "20px", fontWeight: 400, color: NR.textSecondary }}>
              <Layers aria-hidden="true" size={17} strokeWidth={2} color={NR.textSecondary} style={{ flexShrink: 0 }} />
              Objętość: {fmtThousands(vol)} kg
            </span>
          )}
        </span>
      </span>
    </DashCardLink>
  );
}
// "Twój ogólny progres": the number of workouts comes from the existing 30-day rule (window ending at
// the last finished workout); volume change and regularity have no approved calculation yet → marked
// temporary state "Wkrótce" (master: values and calculations NOT approved).
function DashProgressCard({ summary, onOpen }) {
  const col = (first) => ({ flex: "1 1 0", minWidth: "max-content", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "6px", padding: first ? "0 10px 0 0" : "0 10px", borderLeft: first ? 0 : `1px solid ${NR.hairline}` });
  const label = { fontSize: "15px", lineHeight: "18px", fontWeight: 400, color: NR.textSecondary };
  const value = { fontWeight: 500, fontSize: "25px", lineHeight: "28px", color: NR.textDisplay, whiteSpace: "nowrap" };
  const soon = { fontWeight: 500, fontSize: "18px", lineHeight: "28px", color: NR.textMuted, whiteSpace: "nowrap" };
  return (
    <DashCardLink onClick={onOpen} ariaLabel="Twój ogólny progres, ostatnie 30 dni. Otwórz statystyki" testId="dashboard-progress" minHeight="110px" alpha={0.5}>
      <DashCardTop icon={TrendingUp} title="Twój ogólny progres" right="Ostatnie 30 dni" />
      <span style={{ display: "flex", flexWrap: "wrap", rowGap: "10px", width: "100%" }}>
        <span style={col(true)}>
          <span style={label}>Treningi</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <Calendar aria-hidden="true" size={20} strokeWidth={2} color={NR.warm} style={{ flexShrink: 0 }} />
            <span style={value}>{summary.workoutsCount}</span>
          </span>
        </span>
        <span style={col(false)} data-state="temporary">
          <span style={label}>Objętość</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <Layers aria-hidden="true" size={20} strokeWidth={2} color={NR.textMuted} style={{ flexShrink: 0 }} />
            <span style={soon}>Wkrótce</span>
          </span>
        </span>
        <span style={col(false)} data-state="temporary">
          <span style={label}>Regularność</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <CalendarCheck aria-hidden="true" size={20} strokeWidth={2} color={NR.textMuted} style={{ flexShrink: 0 }} />
            <span style={soon}>Wkrótce</span>
          </span>
        </span>
      </span>
    </DashCardLink>
  );
}
function DashStat({ label, value }) {
  return (
    <div style={{ flex: "1 1 0", minWidth: "max-content", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "2px", padding: "8px 10px", borderRadius: "10px", background: "rgba(9,9,9,.66)", border: "1px solid rgba(255,255,255,.10)" }}>
      <span style={{ fontSize: "15px", lineHeight: "18px", fontWeight: 400, color: NR.textSecondary }}>{label}</span>
      <span style={{ fontSize: "23px", lineHeight: "26px", fontWeight: 500, color: NR.textDisplay, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}
function DashExploreTile({ icon: Icon, title, subtitle, onClick, ariaLabel, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
      className="focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF851B]"
      style={{ position: "relative", minHeight: "84px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "6px", padding: "12px 12px 12px 14px", borderRadius: "16px", background: NR.cardSurface, boxShadow: NR.cardShadow, border: "1px solid rgba(255,255,255,.07)", color: "inherit", textAlign: "left", fontFamily: NR.font, cursor: "pointer" }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", width: "100%" }}>
        <Icon aria-hidden="true" size={20} strokeWidth={2} color={NR.warm} />
        <ChevronRight aria-hidden="true" size={16} strokeWidth={2} color={NR.warm} />
      </span>
      <span style={{ fontSize: "18px", lineHeight: "22px", fontWeight: 500, color: NR.textDisplay }}>{title}</span>
      <span style={{ fontSize: "15px", lineHeight: "19px", fontWeight: 400, color: NR.textSecondary }}>{subtitle}</span>
    </button>
  );
}
const DASH_HOW_STEPS_NO_PLAN = [
  ["Wybierz plan", "Własny plan, np. A, B, C, albo trening bez planu."],
  ["Zapisuj serie", "Ciężar i powtórzenia wpisujesz w trakcie treningu."],
  ["Śledź progres", "Po treningu zobaczysz porównanie z poprzednią sesją."],
];
const DASH_HOW_STEPS_WITH_PLAN = [
  ["Rozpocznij plan", "Twój plan jest gotowy — zacznij od pierwszego treningu."],
  DASH_HOW_STEPS_NO_PLAN[1],
  DASH_HOW_STEPS_NO_PLAN[2],
];

function Dashboard({ history, exercises, onNavigate, onGoStart, onOpenSession, onOpenReport, userName, onSaveName, isPro, onOpenUnlock, proHint, onHintShown, activeDraft = null, onResumeDraft, onDiscardDraft, nextPlan = null, onStartPlan, plans = [] }) {
  const [draftMenu, setDraftMenu] = useState(null); // null | "menu" | "confirmDiscard"
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const summary = useMemo(() => computeDashboardSummary(history), [history]);
  const last = useMemo(() => dashLastSession(history), [history]);
  const firstPlan = (Array.isArray(plans) ? plans : []).find((p) => p && Array.isArray(p.exercises) && p.exercises.length > 0) || null;
  const state = activeDraft ? "interrupted" : last ? "returning" : "new";
  const nameOr = (hello) => (userName ? `${hello}, ${userName}!` : `${hello}!`);

  useEffect(() => {
    if (!isPro && proHint) onHintShown(proHint.key);
  }, [proHint?.key]);

  const lastCards = last && (
    <>
      <DashLastWorkoutCard session={last} onOpen={() => onOpenSession(last)} />
      <DashProgressCard summary={summary} onOpen={() => onNavigate("stats")} />
    </>
  );

  return (
    <>
      <NrScreen testId="dashboard" screen={state === "new" ? (firstPlan ? "new-user-withplan" : "new-user-noplan") : state}>
        <NrHeaderPhoto />
        <header style={{ position: "relative", display: "flex", alignItems: "center", height: "48px", marginLeft: "-1px" }}>
          <span style={{ marginInline: "3px" }}>
            <NextRepLogo height={60} />
          </span>
        </header>

        {state === "interrupted" && (
          <>
            <DashGreeting title={nameOr("Cześć")} subtitle="Dokończ trening, który już zacząłeś." onEditName={() => setNameModalOpen(true)} />
            <div style={{ position: "relative", flexShrink: 0 }}>
              <NrHeroCard labelledBy="dash-draft-h" testId="dashboard-active-workout" photoPos="50% 22%" bottomShade="linear-gradient(0deg, rgba(11,11,12,.92) 0%, rgba(11,11,12,.55) 38%, rgba(11,11,12,0) 62%)">
                <div style={{ position: "relative", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "12px", padding: "6px 8px 14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", minHeight: "44px" }}>
                    <NrSectionHead icon={PauseCircle}>Niedokończony trening</NrSectionHead>
                    <button
                      type="button"
                      aria-label="Opcje niedokończonego treningu"
                      data-testid="dashboard-draft-options"
                      onClick={() => setDraftMenu("menu")}
                      className="focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF851B]"
                      style={{ flexShrink: 0, minHeight: "44px", minWidth: "44px", padding: 0, border: 0, background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-end" }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", minHeight: "32px", boxSizing: "border-box", padding: "0 12px", borderRadius: "16px", background: "rgba(9,9,9,.62)", border: "1px solid rgba(255,255,255,.16)", color: NR.textPrimary, fontFamily: NR.font, fontSize: "15px", fontWeight: 500, whiteSpace: "nowrap" }}>
                        <MoreHorizontal aria-hidden="true" size={16} strokeWidth={2} />
                        Opcje
                      </span>
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "-8px", paddingRight: "8px" }}>
                    <h2 id="dash-draft-h" style={{ margin: 0, fontWeight: 500, fontSize: "29px", lineHeight: "34px", color: NR.textDisplay, overflowWrap: "anywhere" }}>{activeDraft.name}</h2>
                    <p style={{ margin: 0, fontSize: "16px", lineHeight: "20px", fontWeight: 400, color: NR.textPrimary, maxWidth: "200px" }}>Trening nie został zakończony.</p>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "34px", paddingRight: "8px" }}>
                    <DashStat label="Ćwiczenia" value={`${activeDraft.doneExercises} / ${activeDraft.totalExercises}`} />
                    <DashStat label="Czas" value={activeDraft.elapsedSec != null ? fmtClock(activeDraft.elapsedSec) : "—"} />
                    <DashStat label="Objętość" value={`${fmtThousands(activeDraft.volume)} kg`} />
                  </div>
                  <NrPillCta onClick={onResumeDraft} testId="dashboard-resume">Wznów trening</NrPillCta>
                </div>
              </NrHeroCard>
            </div>
            <p style={{ position: "relative", margin: "-2px 4px 4px", display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "15px", lineHeight: "19px", fontWeight: 400, color: NR.textSecondary }}>
              <Info aria-hidden="true" size={17} strokeWidth={2} color={NR.textSecondary} style={{ flexShrink: 0 }} />
              <span>Trening trafi do historii dopiero po jego zakończeniu.</span>
            </p>
            {lastCards}
          </>
        )}

        {state === "returning" && (
          <>
            <DashGreeting title={nameOr("Cześć")} subtitle="Twój następny rep zaczyna się od ostatniego." onEditName={() => setNameModalOpen(true)} />
            {lastCards}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <NrHeroCard labelledBy="dash-next-h" testId={nextPlan ? "dashboard-next-plan" : "dashboard-start-card"}>
                <div style={{ position: "relative", minHeight: "192px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "14px 16px 10px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", minHeight: "22px" }}>
                      <NrSectionHead icon={Target}>Następny trening</NrSectionHead>
                    </span>
                    <h2 id="dash-next-h" style={{ margin: "2px 0", fontWeight: 500, fontSize: "29px", lineHeight: "34px", color: NR.textDisplay, maxWidth: "220px", overflowWrap: "anywhere" }}>
                      {nextPlan ? nextPlan.name : "Wybierz trening"}
                    </h2>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "16px", lineHeight: "20px", fontWeight: 400, color: NR.textPrimary }}>
                      {nextPlan ? (
                        <>
                          <Dumbbell aria-hidden="true" size={17} strokeWidth={2} color={NR.warm} style={{ flexShrink: 0 }} />
                          {nextPlan.exercises.length} {plWord(nextPlan.exercises.length, "ćwiczenie", "ćwiczenia", "ćwiczeń")}
                        </>
                      ) : (
                        <span style={{ maxWidth: "200px" }}>Własny plan albo trening bez planu.</span>
                      )}
                    </span>
                  </div>
                  <NrPillCta onClick={nextPlan ? () => onStartPlan(nextPlan) : onGoStart} testId="dashboard-start">Rozpocznij trening</NrPillCta>
                </div>
              </NrHeroCard>
            </div>
          </>
        )}

        {state === "new" && (
          <>
            <DashGreeting title={nameOr("Witaj")} subtitle="Twój pierwszy rep zaczyna się dziś." onEditName={() => setNameModalOpen(true)} />
            <div style={{ position: "relative", flexShrink: 0 }}>
              <NrHeroCard labelledBy="dash-first-h" testId={firstPlan ? "dashboard-next-plan" : "dashboard-start-card"} photoPos="62% 45%">
                <div style={{ position: "relative", boxSizing: "border-box", minHeight: "220px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "10px", padding: "14px 16px 10px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <NrSectionHead icon={Flag}>{firstPlan ? "Pierwszy trening z planu" : "Pierwszy krok"}</NrSectionHead>
                    <h2 id="dash-first-h" style={{ margin: "2px 0 0", fontWeight: 500, fontSize: "29px", lineHeight: "32px", color: NR.textDisplay, maxWidth: "176px", overflowWrap: "anywhere" }}>
                      {firstPlan ? firstPlan.name : "Twój pierwszy trening"}
                    </h2>
                    {firstPlan ? (
                      <p style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "16px", lineHeight: "20px", color: NR.textPrimary }}>
                        <Dumbbell aria-hidden="true" size={17} strokeWidth={2} color={NR.warm} style={{ flexShrink: 0 }} />
                        {firstPlan.exercises.length} {plWord(firstPlan.exercises.length, "ćwiczenie", "ćwiczenia", "ćwiczeń")}
                      </p>
                    ) : (
                      <p style={{ margin: 0, fontSize: "16px", lineHeight: "20px", fontWeight: 400, color: NR.textPrimary, maxWidth: "196px" }}>Stwórz własny plan albo zacznij trening bez planu.</p>
                    )}
                  </div>
                  <NrPillCta onClick={firstPlan ? () => onStartPlan(firstPlan) : onGoStart} testId="dashboard-start">Rozpocznij trening</NrPillCta>
                </div>
              </NrHeroCard>
            </div>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <section aria-labelledby="dash-how-h" style={{ position: "relative", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "12px", padding: "14px 14px 16px", borderRadius: "16px", background: NR.cardSurface, boxShadow: NR.cardShadow }}>
                <h2 style={{ margin: 0, display: "flex" }}>
                  <NrSectionHead icon={ListOrdered} id="dash-how-h">Jak to działa</NrSectionHead>
                </h2>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {(firstPlan ? DASH_HOW_STEPS_WITH_PLAN : DASH_HOW_STEPS_NO_PLAN).map(([t, d], i) => (
                    <li key={t} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                      <span aria-hidden="true" style={{ flexShrink: 0, width: "26px", height: "26px", boxSizing: "border-box", borderRadius: "13px", border: "1px solid rgba(255,133,27,.6)", color: NR.warm, fontSize: "15px", lineHeight: "24px", fontWeight: 500, textAlign: "center" }}>{i + 1}</span>
                      <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                        <span style={{ fontSize: "18px", lineHeight: "22px", fontWeight: 500, color: NR.textDisplay }}>{t}</span>
                        <span style={{ fontSize: "15px", lineHeight: "19px", fontWeight: 400, color: NR.textSecondary }}>{d}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
              <NrFadeBorder alpha={0.5} />
            </div>
            <section aria-labelledby="dash-explore-h" style={{ position: "relative", display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
              <h2 id="dash-explore-h" style={{ margin: "0 0 0 2px", fontSize: "16px", lineHeight: "20px", fontWeight: 400, color: NR.textSecondary }}>Wolisz najpierw się rozejrzeć?</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                <DashExploreTile icon={ClipboardList} title="Gotowe plany" subtitle="FBW, Split, 5×5 i inne · wkrótce" ariaLabel="Gotowe plany treningowe, wkrótce. Otwórz Plany" testId="dashboard-tile-plans" onClick={() => onNavigate("plans")} />
                <DashExploreTile icon={Dumbbell} title="Ćwiczenia" subtitle="Przeglądaj bazę ćwiczeń" ariaLabel="Ćwiczenia. Przeglądaj bazę ćwiczeń" testId="dashboard-tile-exercises" onClick={() => onNavigate("exercises")} />
              </div>
            </section>
          </>
        )}
      </NrScreen>

      <BottomNav screen="dashboard" onNavigate={onNavigate} />

      {activeDraft && draftMenu === "menu" && (
        <NrSheet onClose={() => setDraftMenu(null)} labelledBy="dash-sheet-h" testId="dashboard-draft-menu">
          <p id="dash-sheet-h" style={{ margin: 0, fontSize: "25px", lineHeight: "28px", fontWeight: 500, color: NR.textDisplay, overflowWrap: "anywhere" }}>{activeDraft.name}</p>
          <p style={{ margin: "2px 0 16px", fontSize: "15px", lineHeight: "18px", color: NR.textSecondary }}>Niedokończony trening</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <NrSheetButton variant="primary" onClick={() => { setDraftMenu(null); onResumeDraft(); }}>Wznów trening</NrSheetButton>
            <NrSheetButton variant="dangerText" onClick={() => setDraftMenu("confirmDiscard")}>Przerwij bez zapisywania</NrSheetButton>
            <NrSheetButton onClick={() => setDraftMenu(null)}>Anuluj</NrSheetButton>
          </div>
        </NrSheet>
      )}
      {activeDraft && draftMenu === "confirmDiscard" && (
        <NrSheet onClose={() => setDraftMenu("menu")} labelledBy="dash-confirm-h" testId="dashboard-draft-menu">
          <p id="dash-confirm-h" style={{ margin: "0 0 8px", fontSize: "25px", lineHeight: "28px", fontWeight: 600, color: NR.textDisplay }}>Przerwać bez zapisywania?</p>
          <p style={{ margin: "0 0 18px", fontSize: "16px", lineHeight: "20px", color: NR.textSecondary }}>Niedokończony trening i jego postęp zostaną usunięte. Tej operacji nie można cofnąć.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <NrSheetButton onClick={() => setDraftMenu("menu")}>Wróć</NrSheetButton>
            <NrSheetButton variant="dangerFill" onClick={() => { setDraftMenu(null); onDiscardDraft(); }}>Usuń trening</NrSheetButton>
          </div>
        </NrSheet>
      )}

      {nameModalOpen && (
        <NameModal
          currentName={userName}
          onSave={(name) => {
            onSaveName(name);
            setNameModalOpen(false);
          }}
          onClose={() => setNameModalOpen(false)}
        />
      )}
    </>
  );
}
