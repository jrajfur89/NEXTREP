/* ---------------------------------------------------------------------- */
/* AT2 — „Atlas ćwiczeń”: the NEXTREP 1.0 atlas as a READ-ONLY catalog       */
/*                                                                           */
/* Source: the approved atlas release bundled with the app (ATLAS_RELEASE,  */
/* engine module atlas-release.js). This file is the only reader in the app.*/
/* The catalog screen writes nothing. Since I3 the same adapter serves the  */
/* pickers of plans and workouts (below): atlas exercises enter plans and   */
/* workouts by id + load snapshot, never the user's own exercise list.      */
/* ---------------------------------------------------------------------- */

const ATLAS_LOAD_MODEL_LABELS = {
  barbell_total: "Sztanga — wpisujesz ciężar całkowity",
  dumbbell_pair: "Dwa hantle — wpisujesz ciężar jednego hantla",
  dumbbell_single: "Jeden hantel — wpisujesz jego ciężar",
  kettlebell_pair: "Dwa kettle — wpisujesz ciężar jednego",
  kettlebell_single: "Jeden kettle — wpisujesz jego ciężar",
  machine_stack: "Maszyna — ciężar ze stosu",
  plate_loaded: "Maszyna na talerze — ciężar całkowity",
  cable: "Wyciąg — ciężar ze stosu",
  smith_plates_only: "Maszyna Smitha — wpisujesz tylko masę talerzy",
  bodyweight: "Masa ciała",
  bodyweight_plus: "Masa ciała + dodatkowy ciężar — wpisujesz tylko dodane kg",
  assisted: "Z asystą — wpisujesz ciężar asysty",
  band: "Opór gumy",
  time: "Na czas",
  cardio: "Cardio",
  sets_only: "Tylko serie",
};
const ATLAS_MEASUREMENT_LABELS = {
  weight_reps: "Ciężar i powtórzenia",
  bodyweight_reps: "Masa ciała i powtórzenia",
  band_reps: "Guma i powtórzenia",
  time: "Czas",
  cardio: "Cardio",
  sets_only: "Tylko serie",
};
const ATLAS_LATERALITY_LABELS = { bilateral: "Obustronnie", unilateral: "Jednostronnie", alternating: "Naprzemiennie" };
const ATLAS_REPS_COUNTING_LABELS = { total: "Powtórzenia łącznie", per_side: "Powtórzenia na stronę" };
const ATLAS_STATS_GROUP_LABELS = {
  chest: "Klatka",
  back: "Plecy",
  shoulders: "Barki",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Przedramiona",
  abs: "Brzuch",
  quads: "Uda — przód",
  hamstrings_glutes: "Uda — tył i pośladki",
  calves: "Łydki",
};

function deepFreezeAtlasCatalog(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreezeAtlasCatalog(v);
  }
  return value;
}

// Pure: an atlas release → the read-only catalog shown by the screen (active exercises only,
// sorted by Polish name). Unknown codes fall back to the code itself instead of failing.
function buildAtlasCatalog(atlas) {
  const a = atlas || {};
  const d = a.dictionaries || {};
  const byCode = (list) => new Map((Array.isArray(list) ? list : []).map((x) => [x.code, x]));
  const equipment = byCode(d.equipment);
  const muscles = byCode(d.muscles);
  const families = new Map((Array.isArray(a.families) ? a.families : []).map((f) => [f.familyId, f]));
  const option = (code, labels) => ({ code: code ?? null, label: (code != null && labels[code]) || (code != null ? String(code) : "—") });
  const muscle = (code) => {
    const m = muscles.get(code);
    const group = m ? m.statsGroup : null;
    return { code, label: (m && m.labelPl) || code, group, groupLabel: (group && ATLAS_STATS_GROUP_LABELS[group]) || group || "" };
  };
  const exercises = (Array.isArray(a.exercises) ? a.exercises : [])
    .filter((e) => e && e.status === "active")
    .map((e) => {
      const primaryMuscles = (e.primaryMuscles || []).map(muscle);
      const groups = [];
      for (const m of primaryMuscles) if (m.group && !groups.includes(m.group)) groups.push(m.group);
      return {
        exerciseId: e.exerciseId,
        name: e.namePl,
        aliases: [...(e.aliasesPl || [])],
        familyName: (families.get(e.familyId) || {}).namePl || "",
        equipment: (e.equipment || []).map((code) => ({ code, label: (equipment.get(code) || {}).labelPl || code })),
        primaryMuscles,
        secondaryMuscles: (e.secondaryMuscles || []).map(muscle),
        statsGroups: groups.map((g) => ({ code: g, label: ATLAS_STATS_GROUP_LABELS[g] || g })),
        measurementType: option(e.measurementType, ATLAS_MEASUREMENT_LABELS),
        loadModel: option(e.loadModel, ATLAS_LOAD_MODEL_LABELS),
        laterality: option(e.laterality, ATLAS_LATERALITY_LABELS),
        repsCounting: option(e.repsCounting, ATLAS_REPS_COUNTING_LABELS),
        implements: e.implements ?? null,
        tips: e.tipsPl || "",
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name, "pl"));
  return deepFreezeAtlasCatalog({ atlasVersion: a.atlasVersion ?? null, exercises });
}

const ATLAS_CATALOG = buildAtlasCatalog(ATLAS_RELEASE);

function AtlasChips({ items, testId }) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {items.map((it) => (
        <span key={it.code} className="text-xs px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-800/60 text-neutral-200 font-medium">
          {it.label}
        </span>
      ))}
    </div>
  );
}

function AtlasSection({ title, children }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3">
      <p className="text-neutral-500 text-[11px] font-bold uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

function AtlasExerciseDetail({ exercise, onBack, onNavigate }) {
  return (
    <div className="min-h-screen bg-app-depth font-body pb-28" data-testid="atlas-detail">
      <FontStyles />
      <TopBar title="ATLAS ĆWICZEŃ" onBack={onBack} />
      <div className="px-5 pt-4 space-y-3">
        <div>
          <h2 className="text-neutral-50 text-xl font-bold break-words" data-testid="atlas-detail-name">{exercise.name}</h2>
          {exercise.familyName && <p className="text-neutral-500 text-sm mt-0.5">{exercise.familyName}</p>}
        </div>
        {exercise.aliases.length > 0 && (
          <AtlasSection title="Inne nazwy">
            <p className="text-neutral-200 text-sm" data-testid="atlas-detail-aliases">{exercise.aliases.join(" · ")}</p>
          </AtlasSection>
        )}
        <AtlasSection title="Sprzęt">
          <AtlasChips items={exercise.equipment} testId="atlas-detail-equipment" />
        </AtlasSection>
        <AtlasSection title="Mięśnie">
          <p className="text-neutral-400 text-xs mb-1.5">Główne</p>
          <AtlasChips items={exercise.primaryMuscles} testId="atlas-detail-primary" />
          {exercise.secondaryMuscles.length > 0 && (
            <>
              <p className="text-neutral-400 text-xs mt-3 mb-1.5">Pomocnicze</p>
              <AtlasChips items={exercise.secondaryMuscles} testId="atlas-detail-secondary" />
            </>
          )}
        </AtlasSection>
        <AtlasSection title="Model obciążenia">
          <div className="space-y-1 text-sm" data-testid="atlas-detail-model">
            <p className="text-neutral-100 font-semibold">{exercise.loadModel.label}</p>
            <p className="text-neutral-400">
              {exercise.measurementType.label} · {exercise.laterality.label} · {exercise.repsCounting.label}
            </p>
          </div>
        </AtlasSection>
        {exercise.tips && (
          <AtlasSection title="Wskazówki">
            <p className="text-neutral-200 text-sm leading-relaxed" data-testid="atlas-detail-tips">{exercise.tips}</p>
          </AtlasSection>
        )}
      </div>
      <BottomNav screen="exercises" onNavigate={onNavigate} />
    </div>
  );
}

// The catalog screen, opened from „Ćwiczenia”. Back (on screen or hardware) steps detail → list →
// „Ćwiczenia” through exercisesOverlayRef, like the category view of that screen.
function AtlasCatalogView({ onClose, onNavigate }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = selectedId ? ATLAS_CATALOG.exercises.find((e) => e.exerciseId === selectedId) || null : null;

  useEffect(() => {
    exercisesOverlayRef.current = selected ? () => setSelectedId(null) : onClose;
    return () => {
      exercisesOverlayRef.current = null;
    };
  }, [selected, onClose]);

  const open = (id) => {
    try {
      window.history.pushState({ trainapp: true }, "", "");
    } catch {}
    setSelectedId(id);
    try {
      window.scrollTo(0, 0); // the details start at the top, wherever the list was scrolled
    } catch {}
  };
  // like „Wszystkie partie”: the browser Back pops the entry pushed on open, and the app's popstate
  // handler calls exercisesOverlayRef (one step)
  const stepBack = () => window.history.back();

  if (selected) return <AtlasExerciseDetail exercise={selected} onBack={stepBack} onNavigate={onNavigate} />;

  return (
    <div className="min-h-screen bg-app-depth font-body pb-28" data-testid="atlas-catalog">
      <FontStyles />
      <TopBar title="ATLAS ĆWICZEŃ" onBack={stepBack} />
      <div className="px-5 pt-3">
        <p className="text-neutral-400 text-xs" data-testid="atlas-catalog-info">
          Katalog NEXTREP 1.0 · wydanie {ATLAS_CATALOG.atlasVersion} · {ATLAS_CATALOG.exercises.length} ćwiczeń · tylko do odczytu
        </p>
        <div className="space-y-2 mt-3">
          {ATLAS_CATALOG.exercises.length === 0 && (
            <EmptyState icon={Dumbbell} title="Atlas jest pusty" subtitle="Ćwiczenia pojawią się po zatwierdzeniu pierwszej partii." />
          )}
          {ATLAS_CATALOG.exercises.map((ex) => (
            <button
              key={ex.exerciseId}
              data-testid="atlas-item"
              onClick={() => open(ex.exerciseId)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3 text-left active:border-orange-500/50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-neutral-100 font-semibold break-words">{ex.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <AtlasChips items={ex.statsGroups} />
                </div>
              </div>
              <ChevronRight size={18} className="text-neutral-500 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
      <BottomNav screen="exercises" onNavigate={onNavigate} />
    </div>
  );
}

// Entry tile on the „Ćwiczenia” screen (browsing view only).
function AtlasCatalogEntry({ onOpen }) {
  return (
    <button
      data-testid="atlas-entry"
      onClick={onOpen}
      className="w-full mt-4 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3 text-left active:border-orange-500/50"
    >
      <div className="flex-1 min-w-0">
        <p className="text-neutral-100 font-semibold">Atlas ćwiczeń</p>
        <p className="text-neutral-500 text-xs mt-0.5">NEXTREP 1.0 · {ATLAS_CATALOG.exercises.length} ćwiczeń · podgląd</p>
      </div>
      <ChevronRight size={18} className="text-neutral-500 flex-shrink-0" />
    </button>
  );
}

/* ---------------------------------------------------------------------- */
/* I3 — the atlas as the ONLY source of exercises in plans and workouts    */
/*                                                                           */
/* (S1, NR_ATLAS_ONLY_EXERCISES). A catalog exercise is NEVER copied into   */
/* the person's own exercise list: plan items and workout exercises carry   */
/* its id (`catalogExerciseId`, also in `exerciseId` for the existing       */
/* screens) and every workout exercise its load snapshot v3, built by the   */
/* nr1 domain (planItemSnapshot → engine buildLoadSnapshot) when it enters  */
/* the workout and frozen there. The set format is unchanged; the meaning   */
/* of the typed kg comes from loadSnapshot.loadModel.                       */
/* ---------------------------------------------------------------------- */
const ATLAS_RECORD_BY_ID = new Map(
  ((ATLAS_RELEASE && ATLAS_RELEASE.exercises) || []).filter((e) => e && e.status === "active").map((e) => [e.exerciseId, e])
);
function atlasRecord(id) {
  return id != null ? ATLAS_RECORD_BY_ID.get(id) || null : null;
}
function isAtlasExerciseId(id) {
  return id != null && ATLAS_RECORD_BY_ID.has(id);
}
// Input kind of the existing workout screen, from the atlas measurement type / load model (what is
// typed in a set — never muscles). Assisted exercises record repetitions only until the typed set
// format of a later stage (the set format stays unchanged in I3).
function atlasWorkoutKind(rec) {
  if (!rec) return "weight";
  if (rec.measurementType === "cardio" || rec.loadModel === "cardio") return "cardio";
  if (rec.measurementType === "time" || rec.loadModel === "time") return "time";
  if (rec.measurementType === "sets_only" || rec.loadModel === "sets_only") return "sets";
  if (rec.loadModel === "bodyweight_plus") return "bodyweightPlus";
  if (rec.measurementType === "bodyweight_reps" || rec.measurementType === "band_reps") return "bodyweight";
  return "weight";
}
// The exercise behind an id for the existing screens: the person's own exercise, or a read-only view of
// the atlas exercise (name and input kind only — never stored, never given a category).
function atlasExerciseView(id) {
  const rec = atlasRecord(id);
  if (!rec) return null;
  return { id: rec.exerciseId, catalogExerciseId: rec.exerciseId, name: rec.namePl, loadModel: rec.loadModel, kind: atlasWorkoutKind(rec), videoUrl: "" };
}
function exerciseKindFor(id, exercises) {
  const own = (exercises || []).find((e) => e.id === id);
  if (own) return getExerciseKind(own);
  const view = atlasExerciseView(id);
  return view ? view.kind : getExerciseKind(undefined);
}
function exerciseNameFor(id, exercises) {
  const own = (exercises || []).find((e) => e.id === id);
  if (own) return own.name;
  const view = atlasExerciseView(id);
  return view ? view.name : null;
}
// B02-D21 through the nr1 contract: which load models the person may choose for this atlas exercise.
function atlasLoadModelChoice(id) {
  const rec = atlasRecord(id);
  if (!rec) return { choice: false, options: [] };
  const r = resolvePlanItemLoadModel({ ref: { catalogExerciseId: id, privateExerciseId: null }, loadModel: null, exercise: rec, atlas: ATLAS_RELEASE });
  return { choice: Boolean(r.choice), options: [...r.options] };
}
// Fields of a plan item / synthetic item for an atlas exercise; the model is checked by the nr1 contract.
function atlasPlanItemFields(id, loadModel = null) {
  const rec = atlasRecord(id);
  if (!rec) throw new Error(`I3: ${id} is not an active atlas exercise`);
  const r = resolvePlanItemLoadModel({ ref: { catalogExerciseId: id, privateExerciseId: null }, loadModel, exercise: rec, atlas: ATLAS_RELEASE });
  if (!r.ok) throw new Error(`I3: ${id} — ${r.errors.map((e) => e.code).join(", ")}`);
  return { exerciseId: id, catalogExerciseId: id, loadModel: r.loadModel };
}
// Load snapshot v3 of an atlas exercise entering a workout (nr1 planItemSnapshot → buildLoadSnapshot).
function atlasLoadSnapshot(id, loadModel = null, now = new Date().toISOString()) {
  const r = planItemSnapshot(
    { id: `atlas-${id}`, deletedAt: null, catalogExerciseId: id, privateExerciseId: null, loadModel },
    { atlasById: ATLAS_RECORD_BY_ID, atlas: ATLAS_RELEASE, atlasVersion: ATLAS_RELEASE ? ATLAS_RELEASE.atlasVersion : null, now }
  );
  if (!r.ok) throw new Error(`I3: snapshot of ${id} — ${r.error.code}`);
  return r.snapshot;
}
// The atlas reference of a workout exercise, carried unchanged into the draft, the saved session and
// an edit of it (the snapshot is never rebuilt).
function atlasRefFields(item) {
  return item && item.catalogExerciseId ? { catalogExerciseId: item.catalogExerciseId, loadSnapshot: item.loadSnapshot || null } : {};
}
// What the person is told while typing a set of an atlas exercise.
function atlasLoadHint(snapshot) {
  if (!snapshot) return null;
  const m = snapshot.loadModel;
  if (m === "assisted") return "Z asystą — zapisujesz powtórzenia (kg asysty w kolejnym etapie)";
  if (LOAD_MODEL_CHOICE_LABELS[m]) return `${LOAD_MODEL_CHOICE_LABELS[m].label} — ${LOAD_MODEL_CHOICE_LABELS[m].entryHint}`;
  return ATLAS_LOAD_MODEL_LABELS[m] || null;
}

// I3: a JSON copy is imported in S1 only when it fits the atlas-only model — no exercises of the old
// form, every plan item and every saved exercise refers to an active atlas exercise, and every saved
// exercise carries a valid load snapshot of that exercise. Returns the problems (empty = compatible).
function atlasImportProblems(data) {
  const problems = [];
  if (!data || typeof data !== "object") return ["brak danych"];
  if (Array.isArray(data.exercises) && data.exercises.length > 0) problems.push("ćwiczenia spoza atlasu");
  for (const p of Array.isArray(data.plans) ? data.plans : []) {
    for (const it of (p && Array.isArray(p.exercises) ? p.exercises : [])) {
      if (!it || !isAtlasExerciseId(it.catalogExerciseId) || it.exerciseId !== it.catalogExerciseId) {
        problems.push("plan z ćwiczeniem spoza atlasu");
        break;
      }
    }
  }
  for (const s of Array.isArray(data.history) ? data.history : []) {
    for (const ex of (s && Array.isArray(s.exercises) ? s.exercises : [])) {
      const ok =
        ex && isAtlasExerciseId(ex.catalogExerciseId) && ex.exerciseId === ex.catalogExerciseId && ex.loadSnapshot &&
        validateLoadSnapshot(ex.loadSnapshot).length === 0 && validateRefMatchesSnapshot({ catalogExerciseId: ex.catalogExerciseId, privateExerciseId: null }, ex.loadSnapshot).length === 0;
      if (!ok) {
        problems.push("trening bez ćwiczenia z atlasu lub bez snapshotu");
        break;
      }
    }
  }
  return [...new Set(problems)];
}

// The exercise picker of plans and workouts in S1: the atlas only (search by name and alias, filter by
// the atlas stats group). An exercise with a machine choice (B02-D21) asks for the model first.
function AtlasExercisePickerModal({ onPick, onClose, title = "WYBIERZ ĆWICZENIE", excludeExerciseId = null }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(null);
  const [choiceFor, setChoiceFor] = useState(null);
  const all = ATLAS_CATALOG.exercises.filter((e) => e.exerciseId !== excludeExerciseId);
  const groups = Object.keys(ATLAS_STATS_GROUP_LABELS).filter((g) => all.some((e) => e.statsGroups.some((s) => s.code === g)));
  const q = query.trim().toLowerCase();
  const list = all.filter(
    (e) => (!group || e.statsGroups.some((s) => s.code === group)) && (!q || e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)))
  );
  const pick = (id) => {
    const c = atlasLoadModelChoice(id);
    if (c.choice) setChoiceFor({ id, options: c.options });
    else onPick(id, null);
  };
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={onClose} data-testid="atlas-picker">
      <div className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5 flex flex-col" style={{ maxHeight: "80vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-4 flex-shrink-0" />
        <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
          <h2 className="font-display text-2xl text-neutral-50 tracking-wide">{title}</h2>
          <button onClick={onClose} aria-label="Zamknij" className="p-1.5 -mr-1.5 text-neutral-400 active:text-orange-500">
            <X size={22} />
          </button>
        </div>
        <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 mb-3 flex-shrink-0">
          <Search size={16} className="text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj w atlasie..."
            className="bg-transparent outline-none text-neutral-200 text-sm flex-1 placeholder-neutral-600"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3 flex-shrink-0">
          {[null, ...groups].map((g) => (
            <button
              key={g || "all"}
              data-testid="atlas-picker-group"
              onClick={() => setGroup(g)}
              className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${group === g ? "bg-orange-500 border-orange-500 text-neutral-950" : "border-neutral-700 bg-neutral-800/60 text-neutral-200"}`}
            >
              {g ? ATLAS_STATS_GROUP_LABELS[g] : "Wszystkie"}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto no-scrollbar pb-4 space-y-2">
          {list.length === 0 && <p className="text-neutral-500 text-sm text-center py-6">Brak ćwiczeń w atlasie dla tego wyszukiwania.</p>}
          {list.map((ex) => (
            <button
              key={ex.exerciseId}
              data-testid="atlas-picker-item"
              onClick={() => pick(ex.exerciseId)}
              className="w-full text-left bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 active:border-orange-500"
            >
              <span className="block text-neutral-100 font-medium">{ex.name}</span>
              <span className="block text-neutral-500 text-xs mt-0.5">{ex.loadModel.label}</span>
            </button>
          ))}
        </div>
      </div>
      {choiceFor && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={(e) => { e.stopPropagation(); setChoiceFor(null); }}>
          <div className="w-full bg-neutral-900 rounded-t-3xl border-t border-neutral-800 p-5" onClick={(e) => e.stopPropagation()} data-testid="atlas-model-choice">
            <p className="font-display text-xl text-neutral-50 tracking-wide mb-3">{LOAD_MODEL_CHOICE_LABELS.question}</p>
            <div className="space-y-2">
              {choiceFor.options.map((m) => (
                <button
                  key={m}
                  onClick={() => onPick(choiceFor.id, m)}
                  className="w-full text-left bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 active:border-orange-500"
                >
                  <span className="block text-neutral-100 font-medium">{(LOAD_MODEL_CHOICE_LABELS[m] || {}).label || m}</span>
                  <span className="block text-neutral-500 text-xs mt-0.5">{(LOAD_MODEL_CHOICE_LABELS[m] || {}).entryHint || ""}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Fields of an item picked in a plan or a workout: an atlas exercise (not one of the person's own) by
// its id and checked model; otherwise the person's own exercise as before.
function pickedExerciseFields(id, loadModel, exercises) {
  const own = (exercises || []).some((e) => e.id === id);
  return !own && isAtlasExerciseId(id) ? atlasPlanItemFields(id, loadModel) : { exerciseId: id };
}
