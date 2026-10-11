// SYNTHETIC test data for the atlas tools (F2.1–F2.2). Nothing here is real atlas content:
// every code starts with "test", every label and name is marked "[TEST]" / "Testowe". The real
// dictionaries and exercises come from the approved "Standaryzacja ćwiczeń NextRep" batches.

export const dictionaries = () => ({
  equipment: [
    { code: "test.bar", labelPl: "[TEST] Sztanga testowa", role: "load", loadModels: ["barbell_total"], status: "active" },
    { code: "test.db", labelPl: "[TEST] Hantle testowe", role: "load", loadModels: ["dumbbell_pair", "dumbbell_single"], status: "active" },
    { code: "test.kb", labelPl: "[TEST] Kettlebell testowy", role: "load", loadModels: ["kettlebell_pair", "kettlebell_single"], status: "active" },
    { code: "test.stack", labelPl: "[TEST] Maszyna testowa ze stosem", role: "load", loadModels: ["machine_stack"], status: "active" },
    { code: "test.cable", labelPl: "[TEST] Wyciąg testowy", role: "load", loadModels: ["cable"], status: "active" },
    { code: "test.belt", labelPl: "[TEST] Pas z obciążeniem testowy", role: "load", loadModels: ["bodyweight_plus"], status: "active" },
    { code: "test.band", labelPl: "[TEST] Guma oporowa testowa", role: "load", loadModels: ["band"], status: "active" },
    { code: "test.assist", labelPl: "[TEST] Guma asystująca testowa", role: "assist", loadModels: ["assisted"], status: "active" },
    { code: "test.bench", labelPl: "[TEST] Ławka testowa", role: "support", loadModels: [], status: "active" },
    { code: "test.pullbar", labelPl: "[TEST] Drążek testowy", role: "support", loadModels: [], status: "active" },
    { code: "test.chain", labelPl: "[TEST] Łańcuchy testowe", role: "load", loadModels: ["barbell_total"], status: "active" },
    { code: "test.old", labelPl: "[TEST] Sprzęt zarchiwizowany", role: "support", loadModels: [], status: "archived" },
  ],
  muscles: [
    { code: "test.m.chest_a", labelPl: "[TEST] Mięsień klatki A", statsGroup: "chest", status: "active" },
    { code: "test.m.chest_b", labelPl: "[TEST] Mięsień klatki B", statsGroup: "chest", status: "active" },
    { code: "test.m.back_a", labelPl: "[TEST] Mięsień pleców A", statsGroup: "back", status: "active" },
    { code: "test.m.shoulder_a", labelPl: "[TEST] Mięsień barku A", statsGroup: "shoulders", status: "active" },
    { code: "test.m.triceps_a", labelPl: "[TEST] Mięsień tricepsa A", statsGroup: "triceps", status: "active" },
    { code: "test.m.biceps_a", labelPl: "[TEST] Mięsień bicepsa A", statsGroup: "biceps", status: "active" },
    { code: "test.m.quad_a", labelPl: "[TEST] Mięsień czworogłowy A", statsGroup: "quads", status: "active" },
    { code: "test.m.glute_a", labelPl: "[TEST] Mięsień pośladkowy A", statsGroup: "hamstrings_glutes", status: "active" },
    { code: "test.m.abs_a", labelPl: "[TEST] Mięsień brzucha A", statsGroup: "abs", status: "active" },
    { code: "test.m.calf_a", labelPl: "[TEST] Mięsień łydki A", statsGroup: "calves", status: "active" },
  ],
  variantAttributes: [
    { code: "test.grip.wide", labelPl: "[TEST] Chwyt szeroki", dimension: "grip", status: "active" },
    { code: "test.grip.narrow", labelPl: "[TEST] Chwyt wąski", dimension: "grip", status: "active" },
    { code: "test.angle.incline", labelPl: "[TEST] Skos dodatni", dimension: "angle", status: "active" },
    { code: "test.side.one", labelPl: "[TEST] Jednostronnie", dimension: "laterality", laterality: "unilateral", repsCounting: "per_side", status: "active" },
    { code: "test.side.alt", labelPl: "[TEST] Naprzemiennie", dimension: "laterality", laterality: "alternating", repsCounting: "total", status: "active" },
    { code: "test.impl.one", labelPl: "[TEST] Jeden przyrząd", dimension: "implements", implements: 1, status: "active" },
    { code: "test.impl.two", labelPl: "[TEST] Dwa przyrządy", dimension: "implements", implements: 2, status: "active" },
  ],
});

// A valid exercise; override fields per test.
export const ex = (exerciseId, over = {}) => ({
  exerciseId,
  scope: "system",
  familyId: "test_family_press",
  namePl: `Testowe ćwiczenie ${exerciseId}`,
  aliasesPl: [],
  variantAttributes: [],
  equipment: ["test.bar", "test.bench"],
  primaryMuscles: ["test.m.chest_a"],
  secondaryMuscles: ["test.m.triceps_a"],
  measurementType: "weight_reps",
  loadModel: "barbell_total",
  implements: null,
  laterality: "bilateral",
  repsCounting: "total",
  loadIncrementKg: 2.5,
  tipsPl: null,
  videoUrl: null,
  status: "active",
  archivedReason: null,
  successorHint: null,
  entryRev: 1,
  introducedIn: 1,
  changedIn: 1,
  approvedIn: "test-batch-0",
  correction: null,
  ...over,
});

export const families = () => [
  { familyId: "test_family_press", namePl: "Testowa rodzina wyciskań", status: "active" },
  { familyId: "test_family_row", namePl: "Testowa rodzina wiosłowań", status: "active" },
  { familyId: "test_family_pull", namePl: "Testowa rodzina podciągań", status: "active" },
  { familyId: "test_family_core", namePl: "Testowa rodzina brzucha", status: "active" },
];

// A valid base atlas (release 1) with one exercise per main model and laterality.
export function baseAtlas() {
  const exercises = [
    ex("test_press_bar"),
    ex("test_press_db", { equipment: ["test.db", "test.bench"], variantAttributes: ["test.impl.two"], loadModel: "dumbbell_pair", implements: 2, loadIncrementKg: 2 }),
    ex("test_press_db_incline", { equipment: ["test.db", "test.bench"], variantAttributes: ["test.impl.two", "test.angle.incline"], loadModel: "dumbbell_pair", implements: 2, loadIncrementKg: 2, primaryMuscles: ["test.m.chest_b", "test.m.shoulder_a"], secondaryMuscles: ["test.m.triceps_a", "test.m.chest_a"] }),
    ex("test_row_db_one", { familyId: "test_family_row", equipment: ["test.db"], variantAttributes: ["test.impl.one", "test.side.one"], loadModel: "dumbbell_single", implements: 1, laterality: "unilateral", repsCounting: "per_side", loadIncrementKg: 2, primaryMuscles: ["test.m.back_a"], secondaryMuscles: ["test.m.biceps_a"] }),
    ex("test_row_cable", { familyId: "test_family_row", equipment: ["test.cable"], loadModel: "cable", loadIncrementKg: 5, primaryMuscles: ["test.m.back_a"], secondaryMuscles: ["test.m.biceps_a"] }),
    ex("test_pull_bw", { familyId: "test_family_pull", equipment: ["test.pullbar"], measurementType: "bodyweight_reps", loadModel: "bodyweight", loadIncrementKg: null, primaryMuscles: ["test.m.back_a"], secondaryMuscles: ["test.m.biceps_a"] }),
    ex("test_pull_belt", { familyId: "test_family_pull", equipment: ["test.pullbar", "test.belt"], measurementType: "bodyweight_reps", loadModel: "bodyweight_plus", loadIncrementKg: 1.25, primaryMuscles: ["test.m.back_a"], secondaryMuscles: ["test.m.biceps_a"] }),
    ex("test_pull_assist", { familyId: "test_family_pull", equipment: ["test.pullbar", "test.assist"], measurementType: "bodyweight_reps", loadModel: "assisted", loadIncrementKg: null, primaryMuscles: ["test.m.back_a"], secondaryMuscles: ["test.m.biceps_a"] }),
    ex("test_core_plank", { familyId: "test_family_core", equipment: [], measurementType: "time", loadModel: "time", loadIncrementKg: null, primaryMuscles: ["test.m.abs_a"], secondaryMuscles: [] }),
    ex("test_core_band", { familyId: "test_family_core", equipment: ["test.band"], measurementType: "band_reps", loadModel: "band", loadIncrementKg: null, primaryMuscles: ["test.m.abs_a"], secondaryMuscles: [] }),
  ];
  return { formatVersion: 1, atlasVersion: 1, dictionaries: dictionaries(), families: families(), exercises, issuedIds: exercises.map((e) => e.exerciseId) };
}

export const clone = (x) => JSON.parse(JSON.stringify(x));
