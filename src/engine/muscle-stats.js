// AT3.2b — work of muscles, sub-regions and categories in a workout (AT3-D17), from snapshot v2
// (AT3-D18) and the hierarchy (AT3-D16). Replaces muscle-work.js (10 stats groups, F2 v2 point 1).
//
// Rules:
// 1. Every PRIMARY muscle of an exercise gets the full work of each set.
// 2. Every node — muscle, sub-region, category — counts a set at most once, even when the set reaches
//    the node through several muscles or arrives twice (duplicate set id, PE-24). A category is never
//    the sum of its sub-regions.
// 3. The workout total is sessionTotals() of the whole workout, never a sum of nodes.
// 4. SECONDARY work is a separate metric on every level, kept also where the same node has primary
//    work from the same set; primary and secondary are never added together.
// 5. Numbers of a set come from load.js unchanged (normalisation, laterality, reps, D5 set roles,
//    volume statuses); a node combines exercises the way sessionTotals does ("partial" when an
//    exercise's volume is unavailable, kg of the others kept).
// 6. Entries without a valid snapshot add to no node (F2-4: counted as a fault with a warning).
//    Cardio entries add to no muscle node (O-30, P3); their time and distance are in
//    workout.cardio (sessionTotals, AT3.2c) and cardio-stats.js.
// Names in the UI (AT3-D17): „Objętość ćwiczeń angażujących partię” (primary) and „… jako mięśnie
// pomocnicze” (secondary) — not a physiological measure of muscle work.
import { exerciseTotals, sessionTotals } from "./load.js";
import { validateLoadSnapshot, modelFromSnapshot, resolveWorkoutExerciseModel } from "./load-snapshot.js";

const LEVELS = ["categories", "subregions", "muscles"];
const roundKg = (x) => Math.round(x * 1000) / 1000;

function emptyWork() {
  return { sets: 0, reps: 0, repsAllSides: 0, seconds: 0, volumeKg: 0, volumeStatus: "none", _statuses: new Set(), _seen: new Set() };
}
function finish(work) {
  const s = work._statuses;
  const volumeStatus = s.has("unavailable") ? "partial" : s.has("estimated") ? "estimated" : s.has("exact") ? "exact" : "none";
  return { sets: work.sets, reps: work.reps, repsAllSides: work.repsAllSides, seconds: work.seconds, volumeKg: work.volumeKg, volumeStatus };
}

const setKey = (set, entryIndex, setIndex) => {
  const id = set && (set.id ?? set.setId);
  return typeof id === "string" || typeof id === "number" ? `id:${id}` : `pos:${entryIndex}:${setIndex}`;
};

// workout: { exercises: [{ catalogExerciseId | privateExerciseId | exerciseId, loadSnapshot, sets }] }
// hierarchy: buildHierarchyIndex(...) of a valid hierarchy.
// options.atlasById / privateById: only for the workout total of entries without a snapshot (F2-4).
export function aggregateMuscleWork(workout, hierarchy, { atlasById = new Map(), privateById = new Map() } = {}) {
  if (!hierarchy || typeof hierarchy.nodesForMuscles !== "function") throw new TypeError("aggregateMuscleWork: hierarchy index required");
  const entries = workout && Array.isArray(workout.exercises) ? workout.exercises : [];
  const acc = { primary: {}, secondary: {} };
  for (const kind of ["primary", "secondary"]) for (const level of LEVELS) acc[kind][level] = new Map();
  const faults = { missingSnapshot: 0, warnings: [], duplicateSetIds: [], unmappedMuscles: [] };
  const cardio = { entries: 0 };
  const idsSeen = new Set();

  entries.forEach((entry, ei) => {
    const sets = entry && Array.isArray(entry.sets) ? entry.sets : [];
    sets.forEach((set) => {
      const id = set && (set.id ?? set.setId);
      if (id == null) return;
      if (idsSeen.has(id) && !faults.duplicateSetIds.includes(id)) faults.duplicateSetIds.push(id);
      idsSeen.add(id);
    });

    const s = entry && entry.loadSnapshot;
    if (!s || validateLoadSnapshot(s).length) {
      faults.missingSnapshot++;
      faults.warnings.push({ entry: ei, exerciseId: entry ? entry.catalogExerciseId || entry.privateExerciseId || entry.exerciseId || null : null, message: "Ćwiczenie bez poprawnego snapshotu nie jest liczone w partiach." });
      return;
    }
    if (hierarchy.isConditioning(s)) { cardio.entries++; return; }

    const model = modelFromSnapshot(s);
    const keyed = sets.map((set, si) => ({ set, key: setKey(set, ei, si) }));
    for (const [kind, muscles] of [["primary", s.primaryMuscles], ["secondary", s.secondaryMuscles]]) {
      const nodes = hierarchy.nodesForMuscles(muscles);
      for (const m of nodes.unmapped) if (!faults.unmappedMuscles.includes(m)) faults.unmappedMuscles.push(m);
      for (const level of LEVELS) {
        for (const code of nodes[level]) {
          const map = acc[kind][level];
          const work = map.get(code) || (map.set(code, emptyWork()), map.get(code));
          const fresh = [];
          for (const { set, key } of keyed) if (!work._seen.has(key)) { work._seen.add(key); fresh.push(set); }
          const t = exerciseTotals(fresh, model);
          if (t.workingSets === 0) continue;
          work.sets += t.workingSets;
          work.reps += t.reps;
          work.repsAllSides += t.repsAllSides;
          work.seconds += t.seconds;
          if (t.volumeStatus !== "none") work._statuses.add(t.volumeStatus);
          if (t.volumeKg != null) work.volumeKg = roundKg(work.volumeKg + t.volumeKg);
        }
      }
    }
  });

  const out = { hierarchyVersion: hierarchy.hierarchyVersion, primary: {}, secondary: {} };
  for (const kind of ["primary", "secondary"]) for (const level of LEVELS) {
    out[kind][level] = Object.fromEntries([...acc[kind][level]].filter(([, w]) => w.sets > 0).map(([code, w]) => [code, finish(w)]));
  }
  // the workout total, independent of every node (rule 3)
  out.workout = sessionTotals(workout, (e) => resolveWorkoutExerciseModel(e, { atlasById, privateById }).model);
  delete out.workout.exercises;
  out.cardio = cardio;
  out.faults = faults;
  return out;
}
