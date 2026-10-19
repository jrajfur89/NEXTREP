// NEXTREP 1.0 — B02/S3 (B02-D21): the load model chosen for a PLAN ITEM.
//
// A plan item may store `loadModel` — the person's choice of how the exercise is loaded on their
// machine (e.g. a weight stack `machine_stack` or a plate-loaded machine `plate_loaded`). It does not
// change `exerciseId` or `entryRev`. The allowed models come ONLY from the existing engine rule
// (load-model-options.js: loadModelOptions / validateLoadModelChoice) — there is no second validator.
//
//   atlas exercise with a choice (more than one allowed model): the choice is REQUIRED when the item
//     is added or its model is edited; the item stores the chosen model.
//   atlas exercise with one model: nothing to choose; the item stores null and the atlas model is used.
//   private exercise: always its own model; the item stores null (a different model is refused).
//
// `null` in a stored item means "not chosen": fine for a single-model exercise, but for an exercise
// with a choice it is a state that must be resolved — workout-from-plan.js refuses to start the
// workout with LOAD_MODEL_MISSING (never a silent default such as machine_stack).
import { loadModelOptions, validateLoadModelChoice } from "../../engine/load-model-options.js";

const err = (code, extra = {}) => ({ code, field: "loadModel", ...extra });

// Does `exercise` describe the exercise of `ref`? (atlas: exerciseId; private: privateExerciseId / exerciseId)
export function exerciseMatchesRef(ref, exercise) {
  if (!ref || !exercise) return false;
  if (ref.catalogExerciseId != null) return exercise.exerciseId === ref.catalogExerciseId && exercise.scope !== "private";
  if (ref.privateExerciseId != null) return (exercise.privateExerciseId ?? exercise.exerciseId) === ref.privateExerciseId;
  return false;
}

// What to store in a plan item for this choice.
//   { ref, loadModel (the person's choice or null), exercise (atlas or private record of ref, or null),
//     atlas (atlas / equipment dictionary, for atlas exercises) }
// → { ok, loadModel (value to store), choice, options, errors: [{ code, field, allowed? }] }
// Without `exercise` nothing can be checked: a null choice is stored as "not resolved yet" and any
// non-null choice is refused (LOAD_MODEL_CONTEXT_MISSING).
export function resolvePlanItemLoadModel({ ref, loadModel = null, exercise = null, atlas = null }) {
  const chosen = loadModel === undefined || loadModel === "" ? null : loadModel;
  if (!exercise) {
    return chosen == null
      ? { ok: true, loadModel: null, choice: null, options: [], errors: [] }
      : { ok: false, loadModel: null, choice: null, options: [], errors: [err("LOAD_MODEL_CONTEXT_MISSING")] };
  }
  if (!exerciseMatchesRef(ref, exercise)) return { ok: false, loadModel: null, choice: null, options: [], errors: [err("EXERCISE_CONTEXT_MISMATCH")] };
  if (ref.privateExerciseId != null) {
    const own = exercise.loadModel || "external_unknown";
    if (chosen != null && chosen !== own) return { ok: false, loadModel: null, choice: false, options: [own], errors: [err("LOAD_MODEL_NOT_ALLOWED", { allowed: [own] })] };
    return { ok: true, loadModel: null, choice: false, options: [own], errors: [] };
  }
  const o = loadModelOptions(exercise, atlas);
  const options = [...o.options];
  if (!o.choice) {
    if (chosen != null && chosen !== o.defaultModel) return { ok: false, loadModel: null, choice: false, options, errors: [err("LOAD_MODEL_NOT_ALLOWED", { allowed: options })] };
    return { ok: true, loadModel: null, choice: false, options, errors: [] };
  }
  if (chosen == null) return { ok: false, loadModel: null, choice: true, options, errors: [err("LOAD_MODEL_MISSING", { allowed: options })] };
  const v = validateLoadModelChoice(exercise, atlas, chosen);
  if (!v.ok) return { ok: false, loadModel: null, choice: true, options, errors: v.errors.map((e) => err(e.code, { allowed: e.allowed })) };
  return { ok: true, loadModel: v.loadModel, choice: true, options, errors: [] };
}

// Labels of the choice (shown when the exercise is added to a plan; UI in S6). The text says what the
// typed kg means for each model (B02-D21): stack — the value on the stack; plates — the sum of the
// plates added, without the machine's own base mass.
export const LOAD_MODEL_CHOICE_LABELS = Object.freeze({
  question: "Na jakiej maszynie będziesz wykonywać ćwiczenie?",
  machine_stack: Object.freeze({ label: "Maszyna ze stosem obciążenia", entryHint: "Wpisuj wartość wskazaną na stosie." }),
  plate_loaded: Object.freeze({ label: "Maszyna ładowana talerzami", entryHint: "Wpisuj sumę dołożonych talerzy, bez masy podstawy maszyny." }),
});
