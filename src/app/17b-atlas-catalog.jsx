/* ---------------------------------------------------------------------- */
/* AT2 — „Atlas ćwiczeń”: the NEXTREP 1.0 atlas as a READ-ONLY catalog       */
/*                                                                           */
/* Source: the approved atlas release bundled with the app (ATLAS_RELEASE,  */
/* engine module atlas-release.js). This file is the only reader in the app.*/
/* Nothing here writes to storage, enters the user's exercise list, plans,  */
/* workouts, history, statistics or the sync queue; the old built-in        */
/* exercises are untouched (using atlas exercises in plans is a later stage).*/
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
