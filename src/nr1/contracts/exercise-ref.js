// NEXTREP 1.0 (N1) — reference to an exercise: EXACTLY ONE of catalogExerciseId (atlas F2, stable id)
// or privateExerciseId (UUID of the user's own exercise). The same rule as the snapshot contract
// (ws_exactly_one_exercise). No equivalence between exercises: the reference is the exact id.
import { isUuid } from "../domain/entity.js";
import { EXERCISE_ID_PATTERN } from "../../engine/atlas-schema.js";

export function exerciseRefOf(record) {
  return { catalogExerciseId: record.catalogExerciseId ?? null, privateExerciseId: record.privateExerciseId ?? null };
}

export function validateExerciseRef(ref, where = {}) {
  const errors = [];
  const c = ref ? ref.catalogExerciseId ?? null : null;
  const p = ref ? ref.privateExerciseId ?? null : null;
  if ((c === null) === (p === null)) errors.push({ code: "EXERCISE_REF_EXACTLY_ONE", field: "catalogExerciseId", ...where });
  if (c !== null && (typeof c !== "string" || !EXERCISE_ID_PATTERN.test(c))) errors.push({ code: "CATALOG_ID_INVALID", field: "catalogExerciseId", ...where });
  if (p !== null && !isUuid(p)) errors.push({ code: "PRIVATE_ID_INVALID", field: "privateExerciseId", ...where });
  return errors;
}

// The snapshot must describe the referenced exercise.
export function validateRefMatchesSnapshot(ref, snapshot, where = {}) {
  if (!snapshot) return [];
  const ok = (ref.catalogExerciseId ?? null) === (snapshot.catalogExerciseId ?? null) && (ref.privateExerciseId ?? null) === (snapshot.privateExerciseId ?? null);
  return ok ? [] : [{ code: "SNAPSHOT_REF_MISMATCH", field: "loadSnapshot", ...where }];
}
