// The published Batch 01 inside the repository atlas: the exercises introduced in release 1, with the
// families they use and their issued ids (B02-S5: the atlas holds more batches from release 5 on).
// Dictionaries are the full current ones — every Batch 01 code is still there (S2 never removes).
// Tests that describe Batch 01 exactly use this subset; tests of the whole release use the full atlas.
export const BATCH01_RELEASE = 1;
export function batch01Of(atlas) {
  const exercises = atlas.exercises.filter((e) => e.introducedIn === BATCH01_RELEASE);
  const families = new Set(exercises.map((e) => e.familyId));
  const ids = new Set(exercises.map((e) => e.exerciseId));
  return {
    ...structuredClone(atlas),
    exercises: structuredClone(exercises),
    families: structuredClone(atlas.families.filter((f) => families.has(f.familyId))),
    issuedIds: atlas.issuedIds.filter((id) => ids.has(id)),
  };
}
