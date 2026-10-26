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
  // I2 (24.10.2026): S1 profile (clean data space, cloud off), no built-in exercises, „Wkrótce” templates
  I2: ["BUILT_IN_EXERCISES", "NR_CLEAN_DATA_SPACE", "NR_CLOUD_SYNC_ENABLED", "NR_LOCAL_KEY_PREFIX", "ReadyTemplateSoonBadge"],
  // I3 (24.10.2026): the atlas in the pickers of plans and workouts (src/app/17b-atlas-catalog.jsx)
  I3: [
    "ATLAS_RECORD_BY_ID", "AtlasExercisePickerModal", "NR_ATLAS_ONLY_EXERCISES", "atlasExerciseView", "atlasImportProblems",
    "atlasLoadHint", "atlasLoadModelChoice", "atlasLoadSnapshot", "atlasPlanItemFields", "atlasRecord", "atlasRefFields",
    "atlasWorkoutKind", "exerciseKindFor", "exerciseNameFor", "isAtlasExerciseId", "pickedExerciseFields",
  ],
  // I4 (25.10.2026): approved UI masters (canvas v81) — B2 navigation, Dashboard, Training Entry Flow,
  // Active Workout, Completion & Summary, Atlas Compact Tabs v3
  I4: [
    "NAV_B2_ITEMS", "NR", "NrFadeBorder", "NrHeaderPhoto", "NrHeroCard", "NrPillCta", "NrScreen", "NrSectionHead", "NrSheet",
    "NrSheetButton", "fmtThousands", "nrHeadText",
    "DASH_HOW_STEPS_NO_PLAN", "DASH_HOW_STEPS_WITH_PLAN", "DashCardLink", "DashCardTop", "DashExploreTile", "DashGreeting",
    "DashLastWorkoutCard", "DashProgressCard", "DashStat", "dashLastSession",
    "TEF_FOCUS", "TefAlert", "TefBullets", "TefChoice", "TefConfirmSheet", "TefDraftCard", "TefHeader", "TefInfo", "TefStatus",
    "deleteActiveWorkoutDraft", "readActiveWorkoutDraftState", "tefCardLink", "tefWideButton",
    "AW_LABEL", "AW_ICON_BTN", "AW_NUM", "AW_SR", "AwCardToggle", "AwField", "AwMenuItem", "AwProgress", "AwRestRing", "AwSetDone", "AwSetPending", "AwSupersetBar",
    "awClockLabel", "awKg", "awMmSs", "awPendingText", "awPriorFor", "awRange", "awResultText", "awSetLabels", "awSetResult",
    "WCS_AMBER", "WCS_BODY", "WCS_METRICS", "WCS_SUB", "WCS_SYNC_LINES", "WCS_TITLE", "WcsButton", "WcsFinishSheet", "WcsMetricSheet", "WcsMetricTile", "WcsSaveFailed",
    "WcsSheet", "WcsSyncStatus", "WorkoutSummary", "wcsUnfilled",
    "EXV_DIMENSION_LABELS", "EXV_HEAD", "EXV_ITEM_TEXT", "EXV_NUM", "EXV_TABS", "EXV_TOP", "ExvChart", "ExvDisclosure", "ExvExerciseTab", "ExvHistoryTab", "ExvSectionHead",
    "ExvVariantsTab", "ExvYearTable", "exvCardio", "exvCell", "exvClearRestore", "exvDayMonth", "exvExecutions", "exvKg", "exvMemory", "exvMetric", "exvMmSs", "exvPoints",
    "ATLAS_PLURALS", "ATLAS_ROW_CHIP_DIMENSIONS", "ATLAS_SHEET_DIMENSIONS", "atlasBrowseFreeze", "atlasBrowseMemo", "atlasBrowseModel", "atlasBrowseRetry", "atlasScopeKey",
    "createAtlasBrowse", "plPlural", "shortLoadModelLabel",
    "ATLAS_MESSAGES", "ATLAS_SORT_LABELS", "ATLAS_SR", "ATLAS_UI", "AtlasActiveFilterChip", "AtlasCategoryTile", "AtlasExerciseRow", "AtlasFilterChip",
    "AtlasFiltersButton", "AtlasMessage", "AtlasNum", "AtlasResultsBar", "AtlasSearchField", "AtlasSubregionTile", "atlasRowProps",
    // I5.3: screens E01–E03, the module state (D06) and the browse screen
    "ATLAS_BROWSE_HOME", "ATLAS_GRID", "ATLAS_H1", "ATLAS_NOTE", "ATLAS_PAD_BOTTOM", "ATLAS_SCREEN_STYLE", "AtlasAllRow", "AtlasBackBar", "AtlasBrowseScreen",
    "AtlasCategoryView", "AtlasHomeView", "AtlasListView", "atlasBrowseMemory", "atlasBrowsePush", "atlasBrowseReset", "atlasHasSubregionScreen", "atlasScrollTo", "atlasSectionHead",
    // I5.4: E04 sheet, E05 search, E07 states
    "ATLAS_ALIAS_NOTE", "ATLAS_SHEET_EQUIPMENT_VISIBLE", "AtlasActiveFilters", "AtlasFilterSheet", "AtlasResults", "AtlasSearchRow", "atlasActiveFilters", "atlasEffectiveSort",
    "atlasFiltersZeroText", "atlasFocusedSearch", "atlasKeyboardOpen", "atlasPruneSelection", "atlasScopePhrase", "atlasSelectionCount",
    // I5.5: the app's one soft-keyboard detector (moved out of the Active Workout) for the Compact B2
    "NR_KEYBOARD_GAP", "nrIsTextField", "nrSoftKeyboardOpen", "nrViewportBase", "useSoftKeyboard",
  ],
  // V5 / DEVICE BUGFIX (26.10.2026): resumed workout clock (BUG-V5-01), E01 tiles growing with a large
  // system font (BUG-V5-02; B2 keeps its icon-only mode, V5 / KOREKTA B2), shorter search hints (BUG-V5-03)
  V5_DEVICE: ["ATLAS_SEARCH_HINTS", "awElapsedClock", "awResumeStart"],
  // DES-01 / D1 (26.10.2026): the local data layer of own exercises, favourites, private names and material
  // metadata (src/app/05b-user-exercise-data.jsx) and the checked JSON import (09-backups.jsx)
  DES01_D1: [
    "USER_STORE_SHAPE", "_userExerciseCtx", "addUserExercise", "applyImportedAppData", "archiveUserExercise", "deleteUserExercise",
    "editUserExercise", "findStoredUserExercise", "getUserExerciseCatalog", "loadCustomExerciseNames", "loadExerciseMediaData",
    "loadFavouriteExercises", "loadUserExercises", "readUserStore", "readUserStoreOf", "removeCustomExerciseNameFor",
    "restoreUserExercise", "saveUserExerciseAsNew", "setCustomExerciseNameFor", "setUserExerciseStatus", "storedUserExercisesForWrite",
    "toggleFavouriteExercise", "userExerciseCtx", "userExerciseDataImportProblems", "userExerciseUsage", "writeUserExerciseDataFrom",
    "writeUserStore",
  ],
};
// Baseline names an approved stage removed on purpose (and only these).
const REMOVED_BY_STAGE = {
  // I2: the old built-in exercise list (68) and its metadata (now test data: tests/fixtures/legacy/)
  I2: ["DEFAULT_EXERCISES", "EXERCISE_ATLAS_META"],
};

test("F1: every baseline top-level name is still exported (except approved removals); only names of approved stages are added", async () => {
  const baseline = JSON.parse(readFileSync(new URL("../harness/f1-exports.json", import.meta.url), "utf8"));
  assert.equal(baseline.names.length, baseline.count);
  const A = await loadApp();
  const names = Object.keys(A).filter((n) => n !== "__testState").sort();
  const removed = Object.values(REMOVED_BY_STAGE).flat().sort();
  assert.deepEqual(baseline.names.filter((n) => !names.includes(n)).sort(), removed, "no baseline name lost except the approved removals");
  const added = Object.values(ADDED_BY_STAGE).flat().sort();
  assert.deepEqual(names.filter((n) => !baseline.names.includes(n)), added, "added names = approved stages exactly");
});
