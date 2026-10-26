// Public interface of the NEXTREP engine. Screens import from here only (F1.5).
export * from "./legacy-progression.js";
// PE-A (A4.5): the one access point for volume shown on screens.
export * from "./volume.js";
// AT2: the approved atlas release (read-only), shown by the catalog „Atlas ćwiczeń”.
export * from "./atlas-release.js";
// I3: the atlas in plans and workouts of the app (S1) — the nr1 contracts and the snapshot builder,
// re-exported so the app uses the SAME modules (no second implementation).
export { validateLoadSnapshot } from "./load-snapshot.js";
export { planItemSnapshot } from "../nr1/domain/workout-from-plan.js";
export { resolvePlanItemLoadModel, LOAD_MODEL_CHOICE_LABELS } from "../nr1/contracts/plan-load-model.js";
export { validateRefMatchesSnapshot } from "../nr1/contracts/exercise-ref.js";
// I5 (ATLAS-UX-01): the existing atlas search / facets and hierarchy engines for the module „Ćwiczenia”
// (used as they are — no second implementation).
export { buildAtlasIndex, ATLAS_FACET_DIMENSIONS } from "./atlas-index.js";
export { buildHierarchyIndex, validateHierarchy } from "./hierarchy.js";
// DES-01 / D1 (26.10.2026, approved): the user's own exercises and the user catalog (pure modules; the app
// keeps the data locally per account namespace). Exactly these named exports.
export {
  PRIVATE_EXERCISE_SCOPE, PRIVATE_EDITORIAL_FIELDS, PRIVATE_COMPARABILITY_FIELDS, PRIVATE_ARCHIVED_REASON,
  isPrivateExerciseId, newPrivateExerciseId, privateExerciseContext, validatePrivateExercise, createPrivateExercise,
  classifyPrivateChange, updatePrivateExercise, deriveFromPrivateExercise, archivePrivateExercise, restorePrivateExercise,
  refersToExercise, countExerciseUsage, canDeletePrivateExercise, upsertPrivateExercise, removePrivateExerciseFromList,
  privateExerciseListProblems,
} from "./private-exercise.js";
export {
  buildUserCatalog, displayAtlasRecord, normalizeExerciseNames, setCustomExerciseName, removeCustomExerciseName, normalizeFavourites,
  isFavourite, toggleFavourite, isYoutubeUrl, normalizeExerciseMedia, userExerciseDataProblems, USER_EXERCISE_DATA_FIELDS,
} from "./user-catalog.js";
