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
