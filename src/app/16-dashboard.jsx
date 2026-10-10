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
//   volume     — kg, exactly the formula finish() stores as session.volume, over performed sets
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
  let volume = 0;
  items.forEach((it) => {
    const sets = Array.isArray(it.sets) ? it.sets : [];
    const planned = sets.filter((st) => st && st.setType !== "dropset");
    if (planned.length > 0 && planned.every((st) => isSetPerformed(st, it.type))) done++;
    sets
      .filter((st) => st && isSetPerformed(st, it.type))
      .forEach((st) => {
        volume += (toNumber(st.weight) || 0) * (st.reps !== "" && st.reps != null ? Number(st.reps) : 1);
      });
  });
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

function Dashboard({ history, exercises, onNavigate, onGoStart, onOpenSession, onOpenReport, userName, onSaveName, isPro, onOpenUnlock, proHint, onHintShown, activeDraft = null, onResumeDraft, onDiscardDraft, nextPlan = null, onStartPlan }) {
  const [draftMenu, setDraftMenu] = useState(null); // null | "menu" | "confirmDiscard"
  // An unfinished workout's card is informational: only its "Wróć do treningu" button opens the
  // workout (the other card states stay one big tap target, as before).
  const CardTag = activeDraft ? "div" : "button"
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [progressInfoOpen, setProgressInfoOpen] = useState(false);
  // Picked once when the dashboard mounts (i.e. when the person arrives at it) and held stable
  // for as long as they're on it — Dashboard fully unmounts on navigation, so the next visit
  // mounts fresh and rerolls both; a re-render while still here never changes them.
  const [welcomeIdx] = useState(() => Math.floor(Math.random() * DASHBOARD_WELCOME_PHRASES.length));
  const [cardPhraseIdx] = useState(() => Math.floor(Math.random() * DASHBOARD_CARD_PHRASES.length));
  const cardPhrase = DASHBOARD_CARD_PHRASES[cardPhraseIdx];
  const summary = useMemo(() => computeDashboardSummary(history), [history]);

  useEffect(() => {
    if (!isPro && proHint) onHintShown(proHint.key);
  }, [proHint?.key]);

  return (
    <div className="min-h-screen bg-app-depth font-body flex flex-col">
      <FontStyles />
      {/* 1. Poziome logo NEXTREP — bez poświaty, bez zmiany istniejącego komponentu/ikony. */}
      <div className="px-5 pt-5 flex-shrink-0 flex items-center justify-between">
        <NextRepLogo height={30} />
        <button
          onClick={onOpenUnlock}
          className={`px-2.5 py-1 rounded-full text-xs font-bold ${isPro ? "bg-gradient-to-br from-orange-500 via-orange-500 to-orange-400 text-neutral-950 shadow-brand-glow" : "bg-neutral-900 border border-neutral-800 text-neutral-500"}`}
        >
          PRO
        </button>
      </div>

      {/* 2. Powitanie użytkownika + 3. losowe hasło powitalne (stabilne przez całą sesję na
          dashboardzie — patrz komentarz przy welcomeIdx powyżej). Kliknięcie nadal otwiera
          NameModal — funkcja ustawiania imienia zostaje, tylko bez osobnej „nudge” wersji. */}
      <div className="px-5 pt-4 flex-shrink-0">
        <button onClick={() => setNameModalOpen(true)} className="flex items-center gap-1.5 text-left active:opacity-70">
          <p className="font-display text-3xl text-neutral-50 tracking-wide leading-none break-words">
            {userName ? `Cześć, ${userName}!` : "Cześć!"}
          </p>
          <Pencil size={13} className="text-neutral-600 flex-shrink-0" />
        </button>
        <p className="text-neutral-400 text-sm font-medium mt-1.5">{DASHBOARD_WELCOME_PHRASES[welcomeIdx]}</p>
      </div>

      <div className="px-5 mt-5 pb-24 flex-1 flex flex-col">
        {/* 4/5/8. Duża karta treningowa ze zdjęciem — zastępuje starą kartę „Ostatni trening”
            jako główny element dashboardu. Reużywa istniejący, już offline'owy asset zdjęciowy
            (WELCOME_BG_IMAGE, ten sam co na ekranie powitalnym) — brak nowych/zewnętrznych URL-i. */}
        <div className="relative flex-shrink-0">
        <CardTag
          onClick={activeDraft ? undefined : nextPlan ? () => onStartPlan(nextPlan) : onGoStart}
          data-testid={activeDraft ? "dashboard-active-workout" : nextPlan ? "dashboard-next-plan" : "dashboard-start-card"}
          className="relative w-full rounded-2xl overflow-hidden flex-shrink-0 text-left"
          style={{ aspectRatio: "4 / 5" }}
        >
          <img src={WELCOME_BG_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover grayscale" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />
          <div className="absolute inset-0 bg-orange-500/10" />
          {activeDraft ? (
            <div className="relative h-full flex flex-col justify-end p-5">
              <p className="text-orange-400 text-xs font-bold tracking-wide uppercase mb-1.5">Kontynuuj trening</p>
              <p className="font-display text-2xl leading-[1.15] tracking-wide break-words text-neutral-50">{activeDraft.name}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="bg-black/45 border border-white/10 rounded-xl py-2 px-1 flex flex-col items-center justify-center min-w-0">
                  <span className="font-display text-xl text-neutral-50 tracking-wide leading-none tabular-nums text-center break-words">{activeDraft.doneExercises} / {activeDraft.totalExercises}</span>
                  <span className="text-neutral-400 text-[11px] font-semibold mt-1 text-center">Ćwiczenia</span>
                </div>
                <div className="bg-black/45 border border-white/10 rounded-xl py-2 px-1 flex flex-col items-center justify-center min-w-0">
                  <span className="font-display text-xl text-neutral-50 tracking-wide leading-none tabular-nums text-center break-words">{activeDraft.elapsedSec != null ? fmtClock(activeDraft.elapsedSec) : "—"}</span>
                  <span className="text-neutral-400 text-[11px] font-semibold mt-1 text-center">Czas</span>
                </div>
                <div className="bg-black/45 border border-white/10 rounded-xl py-2 px-1 flex flex-col items-center justify-center min-w-0">
                  <span className="font-display text-xl text-neutral-50 tracking-wide leading-none tabular-nums text-center break-words">{fmtVolume(activeDraft.volume, "weight")}</span>
                  <span className="text-neutral-400 text-[11px] font-semibold mt-1 text-center">Objętość</span>
                </div>
              </div>
              <button type="button" onClick={onResumeDraft} data-testid="dashboard-resume" className="mt-4 w-full bg-gradient-to-br from-[#FF5A00] via-orange-500 to-orange-400 active:brightness-90 text-neutral-950 font-bold text-base py-3 rounded-2xl flex items-center justify-center gap-2">
                <PlayCircle size={19} strokeWidth={2.5} /> WRÓĆ DO TRENINGU
              </button>
            </div>
          ) : nextPlan ? (
            <div className="relative h-full flex flex-col justify-end p-5">
              <p className="text-orange-400 text-xs font-bold tracking-wide uppercase mb-1.5">Następny trening</p>
              <p className="font-display text-2xl leading-[1.15] tracking-wide break-words text-neutral-50">{nextPlan.name}</p>
              <p className="text-neutral-300 text-sm font-medium mt-1">
                {nextPlan.exercises.length} {plWord(nextPlan.exercises.length, "ćwiczenie", "ćwiczenia", "ćwiczeń")}
              </p>
              <div className="mt-4 bg-gradient-to-br from-[#FF5A00] via-orange-500 to-orange-400 active:brightness-90 text-neutral-950 font-bold text-base py-3 rounded-2xl flex items-center justify-center gap-2">
                <Flame size={19} strokeWidth={2.5} /> ROZPOCZNIJ TRENING
              </div>
            </div>
          ) : (
          <div className="relative h-full flex flex-col justify-end p-5">
            <p className="font-display text-2xl leading-[1.15] tracking-wide break-words text-left">
              <span className="text-neutral-50">{cardPhrase.w} </span>
              <span className="text-orange-500">{cardPhrase.o}</span>
            </p>
            <div className="mt-4 bg-gradient-to-br from-[#FF5A00] via-orange-500 to-orange-400 active:brightness-90 text-neutral-950 font-bold text-base py-2.5 rounded-2xl flex items-center justify-center gap-2 shadow-brand-glow">
              <Flame size={19} strokeWidth={2.5} /> ROZPOCZNIJ TRENING
            </div>
          </div>
          )}
        </CardTag>
        {activeDraft && (
          <button
            onClick={() => setDraftMenu("menu")}
            data-testid="dashboard-draft-options"
            className="absolute top-3 right-3 px-3 py-2 min-h-[40px] rounded-full bg-black/55 border border-white/15 text-neutral-100 text-xs font-semibold flex items-center gap-1.5"
          >
            <MoreHorizontal size={15} /> Opcje
          </button>
        )}
        </div>
        {activeDraft && draftMenu && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center px-4 pb-6" onClick={() => setDraftMenu(null)}>
            <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-5" onClick={(e) => e.stopPropagation()} data-testid="dashboard-draft-menu">
              {draftMenu === "menu" ? (
                <>
                  <p className="font-display text-xl text-neutral-50 tracking-wide mb-1 break-words">{activeDraft.name}</p>
                  <p className="text-neutral-500 text-xs mb-4">Niedokończony trening</p>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => { setDraftMenu(null); onResumeDraft(); }} className="w-full py-3 rounded-xl bg-orange-500 text-neutral-950 font-bold">
                      Wróć do treningu
                    </button>
                    <button onClick={() => setDraftMenu("confirmDiscard")} className="w-full py-3 rounded-xl bg-neutral-800 text-red-400 font-semibold">
                      Przerwij bez zapisywania
                    </button>
                    <button onClick={() => setDraftMenu(null)} className="w-full py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold">
                      Anuluj
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-display text-xl text-neutral-50 tracking-wide mb-2">PRZERWAĆ BEZ ZAPISYWANIA?</p>
                  <p className="text-neutral-400 text-sm mb-5">Niedokończony trening i jego postęp zostaną usunięte. Tej operacji nie można cofnąć.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setDraftMenu("menu")} className="flex-1 py-3 rounded-xl bg-neutral-800 text-neutral-300 font-semibold">
                      Wróć
                    </button>
                    <button onClick={() => { setDraftMenu(null); onDiscardDraft(); }} className="flex-1 py-3 rounded-xl bg-red-500 text-neutral-950 font-bold">
                      Usuń trening
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 6/9-13. Podsumowanie — Treningów (ukończone w ostatnich 30 dniach do ostatniego treningu) /
            Ćwiczeń (wystąpienia w tym okresie) / Progres (% analizowanych wystąpień ze statusem "green" z istniejącego
            silnika progresji — patrz computeDashboardSummary powyżej). */}
        <div className="mt-6">
          <p className="text-neutral-500 text-xs font-bold tracking-wide uppercase mb-2">Podsumowanie · Ostatnie 30 dni</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl py-3.5 flex flex-col items-center justify-center min-w-0">
              <span className="font-display text-2xl text-neutral-50 tracking-wide leading-none">{summary.workoutsCount}</span>
              <span className="text-neutral-500 text-[10px] uppercase font-semibold mt-1 text-center">Treningów</span>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl py-3.5 flex flex-col items-center justify-center min-w-0">
              <span className="font-display text-2xl text-neutral-50 tracking-wide leading-none">{summary.exercisesCount}</span>
              <span className="text-neutral-500 text-[10px] uppercase font-semibold mt-1 text-center">Ćwiczeń</span>
            </div>
            <button
              onClick={() => setProgressInfoOpen(true)}
              className="bg-neutral-900 border border-neutral-800 rounded-xl py-3.5 flex flex-col items-center justify-center min-w-0 active:bg-neutral-800"
            >
              <span className={`font-display text-2xl tracking-wide leading-none ${summary.progressPct != null ? "text-green-400" : "text-neutral-50"}`}>
                {summary.progressPct != null ? `${summary.progressPct}%` : "—"}
              </span>
              <span className="text-neutral-500 text-[10px] uppercase font-semibold mt-1 text-center">Progres</span>
            </button>
          </div>
        </div>
      </div>

      <BottomNav screen="dashboard" onNavigate={onNavigate} />

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

      {progressInfoOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-6" onClick={() => setProgressInfoOpen(false)}>
          <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-2xl text-neutral-50 tracking-wide mb-3">CZYM JEST PROGRES?</p>
            <p className="text-neutral-300 text-sm leading-relaxed mb-3">
              To procent przeanalizowanych wystąpień ćwiczeń z ostatnich 30 dni (licząc do ostatniego treningu), które silnik progresji uznał za realną poprawę — więcej powtórzeń, lepszy zapas (RIR) lub większa objętość niż przy poprzednim wykonaniu tego samego ćwiczenia na tym samym ciężarze.
            </p>
            <p className="text-neutral-400 text-xs leading-relaxed mb-5">
              Liczą się tylko ćwiczenia, dla których jest wcześniejsze wykonanie do porównania — pierwszy raz danego ćwiczenia nigdy nie liczy się automatycznie jako progres. Za mało danych w tym miesiącu? Zobaczysz „—" zamiast mylącego 0% lub 100%.
            </p>
            <button onClick={() => setProgressInfoOpen(false)} className="w-full py-3 rounded-xl bg-orange-500 text-neutral-950 font-bold">
              Rozumiem
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

