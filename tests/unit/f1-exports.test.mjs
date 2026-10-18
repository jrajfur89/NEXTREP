// F1 guard: the modularization must keep every top-level name of the app (539 at a2b9ca0).
// A name that disappears or is renamed during F1 means code was lost or changed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadApp } from "../harness/load-app.mjs";

// Since K01-1 the app grows stage by stage; each approved stage lists the names it adds. No baseline
// name may disappear, and no unlisted name may appear.
const ADDED_BY_STAGE = {
  // AT2 (13.10.2026): read-only „Atlas ćwiczeń” (src/app/17b-atlas-catalog.jsx)
  AT2: [
    "ATLAS_CATALOG", "ATLAS_LATERALITY_LABELS", "ATLAS_LOAD_MODEL_LABELS", "ATLAS_MEASUREMENT_LABELS",
    "ATLAS_REPS_COUNTING_LABELS", "ATLAS_STATS_GROUP_LABELS", "AtlasCatalogEntry", "AtlasCatalogView",
    "AtlasChips", "AtlasExerciseDetail", "AtlasSection", "buildAtlasCatalog", "deepFreezeAtlasCatalog",
  ],
  // SEC-HF-01 (18.10.2026): workout data safety (src/app/05-storage-keys-draft-pro.jsx)
  SEC_HF_01: ["activeDraftHasContent", "activeDraftOwnedBy", "clearOwnActiveWorkoutDraft", "saveKeyStrict"],
};

test("F1: every baseline top-level name is still exported; only names of approved stages are added", async () => {
  const baseline = JSON.parse(readFileSync(new URL("../harness/f1-exports.json", import.meta.url), "utf8"));
  assert.equal(baseline.names.length, baseline.count);
  const A = await loadApp();
  const names = Object.keys(A).filter((n) => n !== "__testState").sort();
  assert.deepEqual(baseline.names.filter((n) => !names.includes(n)), [], "no baseline name lost");
  const added = Object.values(ADDED_BY_STAGE).flat().sort();
  assert.deepEqual(names.filter((n) => !baseline.names.includes(n)), added, "added names = approved stages exactly");
});
