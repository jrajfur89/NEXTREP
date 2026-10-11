// F2.1 — atlas validator (design "F2 v2", approved 11.10.2026). Every rule is tested both ways on
// SYNTHETIC data (tests/fixtures/atlas/synthetic.mjs): the valid base atlas passes, and a single
// mutation produces exactly the expected code at the expected level.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateAtlas, deriveGroups } from "../../src/engine/atlas-validate.js";
import { emptyAtlas, normalizeName } from "../../src/engine/atlas-schema.js";
import { baseAtlas, ex, clone } from "../fixtures/atlas/synthetic.mjs";

const find = (a, id) => a.exercises.find((x) => x.exerciseId === id);
const addEx = (a, e) => { a.exercises.push(e); a.issuedIds.push(e.exerciseId); return a; };
const codes = (r, level) => r.issues.filter((i) => !level || i.level === level).map((i) => i.code);
function expectIssue(mutate, code, level = "error", { previous = null } = {}) {
  const a = baseAtlas();
  mutate(a);
  const r = validateAtlas(a, { previous });
  const hit = r.issues.find((i) => i.code === code);
  assert.ok(hit, `expected ${code}, got ${JSON.stringify(codes(r))}`);
  assert.equal(hit.level, level, `${code} level`);
  assert.ok(hit.message && hit.rule, "issue has a rule and a message");
  if (level === "error") assert.equal(r.ok, false);
  return r;
}

describe("valid atlases pass", () => {
  test("the synthetic base atlas: 0 errors, 0 warnings", () => {
    const r = validateAtlas(baseAtlas());
    assert.deepEqual([r.ok, r.summary.errors, r.summary.warnings, r.summary.exercises], [true, 0, 0, 10]);
  });
  test("the empty atlas (release 0, the state of the repository) is valid", () => {
    assert.equal(validateAtlas(emptyAtlas()).ok, true);
  });
  test("validation never changes the atlas", () => {
    const a = baseAtlas();
    const before = clone(a);
    validateAtlas(a, { previous: baseAtlas() });
    assert.deepEqual(a, before);
  });
});

describe("muscles (K4: M1–M6)", () => {
  test("M1 PRIMARY_MUSCLE_REQUIRED", () => expectIssue((a) => { find(a, "test_press_bar").primaryMuscles = []; }, "PRIMARY_MUSCLE_REQUIRED"));
  test("M2 MUSCLE_UNKNOWN and an archived muscle", () => {
    expectIssue((a) => { find(a, "test_press_bar").secondaryMuscles = ["test.m.nope"]; }, "MUSCLE_UNKNOWN");
    expectIssue((a) => { a.dictionaries.muscles[0].status = "archived"; }, "DICT_VALUE_ARCHIVED");
  });
  test("M3 MUSCLE_DUPLICATE and MUSCLE_PRIMARY_AND_SECONDARY", () => {
    expectIssue((a) => { find(a, "test_press_bar").primaryMuscles = ["test.m.chest_a", "test.m.chest_a"]; }, "MUSCLE_DUPLICATE");
    expectIssue((a) => { find(a, "test_press_bar").secondaryMuscles = ["test.m.chest_a"]; }, "MUSCLE_PRIMARY_AND_SECONDARY");
  });
  test("M4 MUSCLE_GROUP_INVALID: every muscle needs one of the 10 groups", () => {
    expectIssue((a) => { a.dictionaries.muscles[0].statsGroup = "legs"; }, "MUSCLE_GROUP_INVALID");
    expectIssue((a) => { delete a.dictionaries.muscles[0].statsGroup; }, "MUSCLE_GROUP_INVALID");
  });
  test("several primary muscles from DIFFERENT groups are allowed (the single-group rule is removed)", () => {
    const a = baseAtlas();
    find(a, "test_press_bar").primaryMuscles = ["test.m.chest_a", "test.m.shoulder_a"];
    const r = validateAtlas(a);
    assert.equal(r.ok, true);
    assert.deepEqual(r.derived.test_press_bar.primaryGroups, ["chest", "shoulders"]);
  });
  test("M5 MANY_PRIMARY_MUSCLES is a warning only", () => {
    const r = expectIssue((a) => { find(a, "test_press_bar").primaryMuscles = ["test.m.chest_a", "test.m.shoulder_a", "test.m.triceps_a"]; find(a, "test_press_bar").secondaryMuscles = []; }, "MANY_PRIMARY_MUSCLES", "warning");
    assert.equal(r.ok, true);
  });
  test("M6: a group is never both primary and secondary within one exercise", () => {
    const groups = deriveGroups({ primaryMuscles: ["test.m.chest_b", "test.m.shoulder_a"], secondaryMuscles: ["test.m.chest_a", "test.m.triceps_a"] }, baseAtlas().dictionaries.muscles);
    assert.deepEqual(groups, { primaryGroups: ["chest", "shoulders"], secondaryGroups: ["triceps"] });
    const r = validateAtlas(baseAtlas());
    assert.deepEqual(codes(r, "info"), ["SECONDARY_IN_PRIMARY_GROUP"]);
  });
});

describe("variants and families (K3: V1–V9)", () => {
  test("V1 FAMILY_UNKNOWN / FAMILY_ARCHIVED", () => {
    expectIssue((a) => { find(a, "test_press_bar").familyId = "test_family_nope"; }, "FAMILY_UNKNOWN");
    expectIssue((a) => { a.families[3].status = "archived"; }, "FAMILY_ARCHIVED");
  });
  test("V2 VARIANT_DUPLICATE: same family, equipment and attributes", () => expectIssue((a) => addEx(a, ex("test_press_bar_copy", { namePl: "Testowe ćwiczenie kopia" })), "VARIANT_DUPLICATE"));
  test("V2: the same equipment with a different attribute is a different variant", () => {
    const a = addEx(baseAtlas(), ex("test_press_bar_wide", { variantAttributes: ["test.grip.wide"] }));
    assert.equal(validateAtlas(a).ok, true);
  });
  test("V3 VARIANT_INTERPRETATION_NOT_VISIBLE: different load interpretation hidden behind the same attributes", () =>
    expectIssue((a) => addEx(a, ex("test_press_db_x", { equipment: ["test.db", "test.bench"], variantAttributes: ["test.impl.two"], loadModel: "dumbbell_single", implements: 1, loadIncrementKg: 2 })), "VARIANT_INTERPRETATION_NOT_VISIBLE"));
  test("V4 LATERALITY_ATTRIBUTE_MISSING / MISMATCH / MULTIPLE", () => {
    expectIssue((a) => { Object.assign(find(a, "test_row_cable"), { laterality: "unilateral", repsCounting: "per_side" }); }, "LATERALITY_ATTRIBUTE_MISSING");
    expectIssue((a) => { Object.assign(find(a, "test_row_db_one"), { laterality: "alternating", repsCounting: "total" }); }, "LATERALITY_ATTRIBUTE_MISMATCH");
    expectIssue((a) => { find(a, "test_row_db_one").repsCounting = "total"; }, "LATERALITY_ATTRIBUTE_MISMATCH");
    expectIssue((a) => { find(a, "test_row_db_one").variantAttributes.push("test.side.alt"); }, "LATERALITY_ATTRIBUTE_MULTIPLE");
  });
  test("V5 MULTIPLE_LOAD_SOURCES_UNSUPPORTED (bar + chains) — blocks the import", () => {
    const r = expectIssue((a) => { find(a, "test_press_bar").equipment = ["test.bar", "test.chain", "test.bench"]; }, "MULTIPLE_LOAD_SOURCES_UNSUPPORTED");
    assert.equal(r.issues.find((i) => i.code === "MULTIPLE_LOAD_SOURCES_UNSUPPORTED").rule, "V5");
  });
  test("V5 support equipment (bench, bar) never counts as a load source", () => {
    const a = baseAtlas();
    find(a, "test_pull_belt").equipment = ["test.pullbar", "test.belt", "test.bench"];
    assert.equal(validateAtlas(a).ok, true);
  });
  test("V5 LOAD_MODEL_EQUIPMENT_MISMATCH and ASSISTED_WITHOUT_ASSIST_EQUIPMENT", () => {
    expectIssue((a) => { Object.assign(find(a, "test_press_bar"), { loadModel: "dumbbell_pair", implements: 2 }); }, "LOAD_MODEL_EQUIPMENT_MISMATCH");
    expectIssue((a) => { find(a, "test_pull_bw").loadModel = "bodyweight_plus"; find(a, "test_pull_bw").loadIncrementKg = 1; }, "LOAD_MODEL_EQUIPMENT_MISMATCH"); // no added-load equipment
    expectIssue((a) => { find(a, "test_pull_belt").loadModel = "bodyweight"; find(a, "test_pull_belt").loadIncrementKg = null; }, "LOAD_MODEL_EQUIPMENT_MISMATCH"); // belt present but ignored
    expectIssue((a) => { find(a, "test_pull_assist").equipment = ["test.pullbar"]; }, "ASSISTED_WITHOUT_ASSIST_EQUIPMENT");
  });
  test("V5: a time exercise may hold a load without interpreting it", () => {
    const a = baseAtlas();
    find(a, "test_core_plank").equipment = ["test.belt"];
    assert.equal(validateAtlas(a).ok, true);
  });
  test("V6 IMPLEMENTS_REQUIRED / MODEL_MISMATCH / NOT_APPLICABLE / ATTRIBUTE_MISMATCH", () => {
    expectIssue((a) => { find(a, "test_press_db").implements = null; }, "IMPLEMENTS_REQUIRED");
    expectIssue((a) => { find(a, "test_press_db").implements = 1; }, "IMPLEMENTS_MODEL_MISMATCH");
    expectIssue((a) => { find(a, "test_press_bar").implements = 1; }, "IMPLEMENTS_NOT_APPLICABLE");
    expectIssue((a) => { Object.assign(find(a, "test_press_db"), { variantAttributes: ["test.impl.one"] }); }, "IMPLEMENTS_ATTRIBUTE_MISMATCH");
  });
  test("V7 NAME_CONTAINS_WORKING_WEIGHT / NAME_CONTAINS_REPS block; method numbers and angles do not", () => {
    expectIssue((a) => { find(a, "test_press_bar").namePl = "Testowe wyciskanie 60 kg"; }, "NAME_CONTAINS_WORKING_WEIGHT");
    expectIssue((a) => { find(a, "test_press_bar").aliasesPl = ["Testowe 12,5kg"]; }, "NAME_CONTAINS_WORKING_WEIGHT");
    expectIssue((a) => { find(a, "test_press_bar").namePl = "Testowe wyciskanie 10 powtórzeń"; }, "NAME_CONTAINS_REPS");
    expectIssue((a) => { find(a, "test_press_bar").namePl = "Testowe wyciskanie 8 reps"; }, "NAME_CONTAINS_REPS");
    const r = expectIssue((a) => { find(a, "test_press_bar").namePl = "Testowa metoda 5x5"; }, "NAME_SETS_REPS_PATTERN", "warning");
    assert.equal(r.ok, true);
    for (const name of ["Testowe wyciskanie na skosie 30°", "Testowe 21s", "Testowa metoda 5/3/1", "Testowe ćwiczenie 2 w 1"]) {
      const a = baseAtlas();
      find(a, "test_press_bar").namePl = name;
      assert.equal(validateAtlas(a).ok, true, name);
    }
  });
  test("V8 EQUIVALENCE_FIELD_FORBIDDEN and SUCCESSOR_HINT_ONLY_ARCHIVED; families never imply substitutes", () => {
    expectIssue((a) => { find(a, "test_press_bar").equivalentTo = "test_press_db"; }, "EQUIVALENCE_FIELD_FORBIDDEN");
    expectIssue((a) => { find(a, "test_press_bar").replacedBy = "test_press_db"; }, "EQUIVALENCE_FIELD_FORBIDDEN");
    expectIssue((a) => { find(a, "test_press_bar").successorHint = "test_press_db"; }, "SUCCESSOR_HINT_ONLY_ARCHIVED");
  });
  test("V9 FAMILY_SINGLE_EXERCISE / NAME_SUGGESTS_SIDE are warnings", () => {
    expectIssue((a) => { a.families.push({ familyId: "test_family_solo", namePl: "Testowa rodzina pojedyncza", status: "active" }); addEx(a, ex("test_solo", { familyId: "test_family_solo" })); }, "FAMILY_SINGLE_EXERCISE", "warning");
    expectIssue((a) => { find(a, "test_row_cable").namePl = "Testowe wiosłowanie jednorącz"; }, "NAME_SUGGESTS_SIDE", "warning");
  });
});

describe("identifiers, names, archive (I1–I6)", () => {
  test("I1 EXERCISE_ID_FORMAT / DUPLICATE / NOT_ISSUED / REMOVED", () => {
    expectIssue((a) => { find(a, "test_press_bar").exerciseId = "Test-Press"; a.issuedIds[0] = "Test-Press"; }, "EXERCISE_ID_FORMAT");
    expectIssue((a) => { a.exercises.push(ex("test_press_bar", { namePl: "Testowe inne" })); }, "EXERCISE_ID_DUPLICATE");
    expectIssue((a) => { a.exercises.push(ex("test_new", { variantAttributes: ["test.grip.wide"] })); }, "EXERCISE_ID_NOT_ISSUED");
    expectIssue((a) => { a.exercises = a.exercises.filter((x) => x.exerciseId !== "test_core_band"); }, "EXERCISE_ID_REMOVED");
  });
  test("I1: an id of the previous release cannot disappear even from issuedIds", () => {
    const prev = baseAtlas();
    expectIssue((a) => { a.atlasVersion = 2; a.exercises.pop(); a.issuedIds.pop(); }, "EXERCISE_ID_REMOVED", "error", { previous: prev });
  });
  test("I2 NAME_DUPLICATE after normalization (case, Polish letters, spaces)", () => {
    expectIssue((a) => { find(a, "test_press_db").namePl = "  TESTOWE   cwiczenie test_press_bar "; }, "NAME_DUPLICATE");
    assert.equal(normalizeName("Wiosłowanie  ŁAWKA"), normalizeName("wioslowanie lawka"));
  });
  test("I3 ALIAS_CONFLICT / ALIAS_DUPLICATE", () => {
    expectIssue((a) => { find(a, "test_press_db").aliasesPl = ["Testowe ćwiczenie test_press_bar"]; }, "ALIAS_CONFLICT");
    expectIssue((a) => { find(a, "test_press_db").aliasesPl = ["Alias testowy"]; find(a, "test_press_bar").aliasesPl = ["alias TESTOWY"]; }, "ALIAS_CONFLICT");
    expectIssue((a) => { find(a, "test_press_db").aliasesPl = ["Alias testowy", "alias testowy"]; }, "ALIAS_DUPLICATE");
  });
  test("I4 archive: reason required, successor must be another active exercise; archiving keeps the record", () => {
    expectIssue((a) => { find(a, "test_press_bar").status = "archived"; }, "ARCHIVED_REASON_REQUIRED");
    expectIssue((a) => { Object.assign(find(a, "test_press_bar"), { status: "archived", archivedReason: "Testowy powód", successorHint: "test_press_bar" }); }, "SUCCESSOR_INVALID");
    expectIssue((a) => { Object.assign(find(a, "test_press_bar"), { status: "archived", archivedReason: "Testowy powód", successorHint: "test_nope" }); }, "SUCCESSOR_INVALID");
    const a = baseAtlas();
    Object.assign(find(a, "test_press_bar"), { status: "archived", archivedReason: "Testowy powód", successorHint: "test_press_db" });
    assert.equal(validateAtlas(a).ok, true);
  });
  test("I5 ENTRY_REV_NOT_BUMPED / ENTRY_REV_DECREASED against the previous release", () => {
    const prev = baseAtlas();
    expectIssue((a) => { a.atlasVersion = 2; find(a, "test_press_bar").primaryMuscles = ["test.m.chest_b"]; }, "ENTRY_REV_NOT_BUMPED", "error", { previous: prev });
    expectIssue((a) => { a.atlasVersion = 2; find(a, "test_press_bar").entryRev = 0; }, "ENTRY_REV_DECREASED", "error", { previous: prev });
    const a = baseAtlas();
    a.atlasVersion = 2;
    Object.assign(find(a, "test_press_bar"), { primaryMuscles: ["test.m.chest_b"], entryRev: 2 });
    find(a, "test_press_bar").tipsPl = "Testowa wskazówka"; // non-calculation field
    assert.equal(validateAtlas(a, { previous: prev }).ok, true);
  });
  test("I6 LOAD_INTERPRETATION_CHANGED: needs a new variant…", () => {
    const prev = baseAtlas();
    expectIssue((a) => { a.atlasVersion = 2; Object.assign(find(a, "test_row_cable"), { variantAttributes: ["test.side.one"], laterality: "unilateral", repsCounting: "per_side", entryRev: 2 }); }, "LOAD_INTERPRETATION_CHANGED", "error", { previous: prev });
  });
  test("I6 …unless it is an approved error correction with entryRev raised (CORRECTION_APPLIED)", () => {
    const prev = baseAtlas();
    const r = expectIssue((a) => {
      a.atlasVersion = 2;
      Object.assign(find(a, "test_row_cable"), { variantAttributes: ["test.side.one"], laterality: "unilateral", repsCounting: "per_side", entryRev: 2, correction: { approvedIn: "test-decision-1", note: "Testowa poprawka błędu" } });
    }, "CORRECTION_APPLIED", "info", { previous: prev });
    assert.equal(r.ok, true);
    expectIssue((a) => { a.atlasVersion = 2; Object.assign(find(a, "test_row_cable"), { variantAttributes: ["test.side.one"], laterality: "unilateral", repsCounting: "per_side", correction: { approvedIn: "test-decision-1", note: "x" } }); }, "ENTRY_REV_NOT_BUMPED", "error", { previous: prev });
    expectIssue((a) => { find(a, "test_press_bar").correction = { note: "bez zatwierdzenia" }; }, "CORRECTION_INVALID");
  });
  test("a changed atlas needs a new release number", () => {
    const prev = baseAtlas();
    expectIssue((a) => { find(a, "test_press_bar").tipsPl = "Testowa wskazówka"; }, "ATLAS_VERSION_NOT_BUMPED", "error", { previous: prev });
  });
});

describe("technical fields (K2: T1–T4) and dictionaries (S1–S2)", () => {
  test("T1 REQUIRED_FIELD_MISSING for every required field of a system exercise", () => {
    for (const f of ["namePl", "familyId", "measurementType", "loadModel", "laterality", "repsCounting", "approvedIn"]) {
      expectIssue((a) => { find(a, "test_press_bar")[f] = null; }, "REQUIRED_FIELD_MISSING");
    }
  });
  test("T2 BILATERAL_PER_SIDE, LOAD_MODEL_UNKNOWN; T3 MEASUREMENT_MODEL_MISMATCH / UNKNOWN", () => {
    expectIssue((a) => { find(a, "test_press_bar").repsCounting = "per_side"; }, "BILATERAL_PER_SIDE");
    expectIssue((a) => { find(a, "test_press_bar").loadModel = "external_unknown"; }, "LOAD_MODEL_UNKNOWN");
    expectIssue((a) => { find(a, "test_press_bar").measurementType = "band_reps"; }, "MEASUREMENT_MODEL_MISMATCH");
    expectIssue((a) => { find(a, "test_press_bar").measurementType = "weight"; }, "MEASUREMENT_UNKNOWN");
  });
  test("T4 LOAD_INCREMENT_MISSING is a warning; an increment on a non-kg model is an error", () => {
    const r = expectIssue((a) => { find(a, "test_press_bar").loadIncrementKg = null; }, "LOAD_INCREMENT_MISSING", "warning");
    assert.equal(r.ok, true);
    expectIssue((a) => { find(a, "test_core_band").loadIncrementKg = 1; }, "LOAD_INCREMENT_INVALID");
    expectIssue((a) => { find(a, "test_press_bar").loadIncrementKg = -2.5; }, "LOAD_INCREMENT_INVALID");
  });
  test("S1 closed schema: UNKNOWN_FIELD, SCOPE_INVALID (atlas = system only), STATUS_INVALID, dictionary codes and labels", () => {
    expectIssue((a) => { find(a, "test_press_bar").category = "Klatka"; }, "UNKNOWN_FIELD");
    expectIssue((a) => { find(a, "test_press_bar").scope = "private"; }, "SCOPE_INVALID");
    expectIssue((a) => { find(a, "test_press_bar").status = "deleted"; }, "STATUS_INVALID");
    expectIssue((a) => { a.dictionaries.equipment.push({ code: "test.bar", labelPl: "[TEST] inny", role: "support", loadModels: [], status: "active" }); }, "DICT_CODE_DUPLICATE");
    expectIssue((a) => { a.dictionaries.equipment.push({ code: "test.bar2", labelPl: "[test]  sztanga TESTOWA", role: "support", loadModels: [], status: "active" }); }, "DICT_LABEL_DUPLICATE");
    expectIssue((a) => { a.dictionaries.equipment.push({ code: "Test Bar", labelPl: "[TEST] x", role: "support", loadModels: [], status: "active" }); }, "DICT_CODE_FORMAT");
    expectIssue((a) => { a.dictionaries.equipment[0].role = "weight"; }, "EQUIPMENT_ROLE_INVALID");
    expectIssue((a) => { a.dictionaries.equipment[7].loadModels = ["band"]; }, "EQUIPMENT_LOAD_MODELS_INVALID");
    expectIssue((a) => { a.dictionaries.variantAttributes[3].laterality = null; }, "VARIANT_ATTRIBUTE_INVALID");
    expectIssue((a) => { find(a, "test_press_bar").equipment.push("test.nope"); }, "DICT_VALUE_UNKNOWN");
    expectIssue((a) => { find(a, "test_press_bar").equipment.push("test.old"); }, "DICT_VALUE_ARCHIVED");
  });
  test("S2 DICT_VALUE_REMOVED: dictionary values are archived, never removed", () => {
    const prev = baseAtlas();
    expectIssue((a) => { a.atlasVersion = 2; a.dictionaries.equipment = a.dictionaries.equipment.filter((e) => e.code !== "test.old"); }, "DICT_VALUE_REMOVED", "error", { previous: prev });
  });
});

describe("report shape", () => {
  test("every issue: level, rule, code, record, field, Polish message; summary counts match", () => {
    const a = baseAtlas();
    find(a, "test_press_bar").primaryMuscles = [];
    find(a, "test_press_bar").loadIncrementKg = null;
    const r = validateAtlas(a);
    for (const i of r.issues) {
      assert.ok(["error", "warning", "info"].includes(i.level));
      assert.match(i.rule, /^[MVITS]\d$/);
      assert.match(i.code, /^[A-Z_]+$/);
      assert.ok(typeof i.message === "string" && i.message.length > 10);
    }
    assert.equal(r.summary.errors, r.issues.filter((i) => i.level === "error").length);
    assert.equal(r.summary.warnings, r.issues.filter((i) => i.level === "warning").length);
  });
  test("malformed input never throws", () => {
    for (const bad of [null, undefined, {}, { exercises: [null, 5, "x"] }, { dictionaries: { muscles: [null] }, families: [null], exercises: [{}] }]) {
      assert.doesNotThrow(() => validateAtlas(bad));
    }
  });
});
