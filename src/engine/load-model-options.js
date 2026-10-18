// B02-D21 — configurable load model of machines (decisions D-1 = A, D-2; 18.10.2026).
//
// One catalog exercise (e.g. a machine press) can be done on a machine with a weight stack or on a
// plate-loaded machine. The choice is a CONFIGURATION OF THE EXECUTION, not a new exercise variant —
// a controlled exception to K3 / V3 / I6, limited to the models listed here and only where the atlas
// data explicitly allows both:
//   - the exercise's own `loadModel` (its default) is one of MACHINE_LOAD_MODEL_CHOICE, and
//   - its ONE load-bearing equipment (role "load", V5) lists both models in `loadModels`.
// Nothing is inferred from names, and the closed atlas schema is not extended (D-1 = A). Every other
// exercise has exactly one model: its own. Both models read the typed kg as the total external load
// (load.js), so the choice never changes the tonnage formula — it changes comparability only.
//
// comparabilityKey: the technical basis for comparing kg across executions (PE-B, PE-E later; D13):
// exercise + load model + atlas entry revision. Different keys are never compared as progress or
// regress. Equal keys are NOT a guarantee that two physical machines are equivalent.
//
// Pure: no imports, no storage.

export const MACHINE_LOAD_MODEL_CHOICE = Object.freeze(["machine_stack", "plate_loaded"]);

const list = (x) => (Array.isArray(x) ? x : []);
const freezeResult = (r) => Object.freeze({ ...r, options: Object.freeze([...r.options]) });

// The equipment dictionary may be passed as an atlas, as { dictionaries: { equipment } } or as an array.
function equipmentDictionary(source) {
  if (Array.isArray(source)) return source;
  if (source && source.dictionaries && Array.isArray(source.dictionaries.equipment)) return source.dictionaries.equipment;
  return [];
}

// → { defaultModel, options, choice, reason }
//   reason: null (a real choice), "single_model" (not a machine choice), or why the choice is not
//   offered although the exercise is a machine one: "no_load_equipment", "multiple_load_equipment",
//   "equipment_unknown", "equipment_inconsistent" (the equipment does not list the default model),
//   "equipment_single_model".
export function loadModelOptions(exercise, atlasOrEquipment) {
  const defaultModel = exercise && typeof exercise.loadModel === "string" ? exercise.loadModel : null;
  const only = (reason) => freezeResult({ defaultModel, options: defaultModel ? [defaultModel] : [], choice: false, reason });
  if (!defaultModel || !MACHINE_LOAD_MODEL_CHOICE.includes(defaultModel)) return only("single_model");
  const dict = new Map(equipmentDictionary(atlasOrEquipment).map((e) => [e.code, e]));
  const codes = list(exercise.equipment);
  if (codes.some((c) => !dict.has(c))) return only("equipment_unknown");
  const loads = codes.map((c) => dict.get(c)).filter((e) => e && e.role === "load" && e.status !== "archived");
  if (loads.length === 0) return only("no_load_equipment");
  if (loads.length > 1) return only("multiple_load_equipment");
  const allowed = list(loads[0].loadModels);
  if (!allowed.includes(defaultModel)) return only("equipment_inconsistent");
  const options = MACHINE_LOAD_MODEL_CHOICE.filter((m) => allowed.includes(m));
  if (options.length < 2) return only("equipment_single_model");
  // the default first, then the other one
  return freezeResult({ defaultModel, options: [defaultModel, ...options.filter((m) => m !== defaultModel)], choice: true, reason: null });
}

// The model of one execution: no explicit choice → the default; a choice outside the options →
// LOAD_MODEL_NOT_ALLOWED. → { ok, loadModel, errors: [{ code, field, allowed }] }
export function validateLoadModelChoice(exercise, atlasOrEquipment, chosen) {
  const o = loadModelOptions(exercise, atlasOrEquipment);
  if (chosen === undefined || chosen === null || chosen === "") {
    return o.defaultModel ? { ok: true, loadModel: o.defaultModel, errors: [] } : { ok: false, loadModel: null, errors: [{ code: "LOAD_MODEL_MISSING", field: "loadModel", allowed: [] }] };
  }
  if (o.options.includes(chosen)) return { ok: true, loadModel: chosen, errors: [] };
  return { ok: false, loadModel: null, errors: [{ code: "LOAD_MODEL_NOT_ALLOWED", field: "loadModel", allowed: [...o.options] }] };
}

// exercise + load model + entry revision. Accepts a snapshot (catalogExerciseId / privateExerciseId)
// or a plain { exerciseId, loadModel, entryRev }. null when a part is missing — nothing is comparable.
export function comparabilityKey(x) {
  if (!x || typeof x !== "object") return null;
  const id = x.exerciseId ?? x.catalogExerciseId ?? x.privateExerciseId ?? null;
  const model = x.loadModel ?? null;
  const rev = Number.isInteger(x.entryRev) ? x.entryRev : null;
  if (id == null || !model || rev == null) return null;
  return `${id}|${model}|${rev}`;
}
