// DES-01 / D1.2 + D1.4 — the engine of own (private) exercises on the repository atlas: creation and validation
// in the private mode (1), UUID and familyId (2), archive and restore (6), delete only when unused (7), and the
// protection of comparability (8). The atlas rules themselves are unchanged (scope test at the end).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import atlas from "../../src/atlas/atlas.json" with { type: "json" };
import * as P from "../../src/engine/private-exercise.js";
import * as ENGINE from "../../src/engine/index.js";
import { validateAtlas } from "../../src/engine/atlas-validate.js";
import { CALC_FIELDS, INTERPRETATION_FIELDS, CARD_CONTENT_FIELDS } from "../../src/engine/atlas-schema.js";
import { isUuid } from "../../src/nr1/domain/entity.js";
import { validateExerciseRef } from "../../src/nr1/contracts/exercise-ref.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ctx = P.privateExerciseContext(atlas);
const NOW = "2026-10-26T10:00:00.000Z";
const LATER = "2026-10-27T08:30:00.000Z";
let seq = 0;
const fixedId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const BENCH = atlas.exercises.find((e) => e.exerciseId === "bench_press_barbell_flat");
const CURL = atlas.exercises.find((e) => e.exerciseId === "curl_dumbbell_pair_standing");
const HOME_BENCH = { namePl: "  Wyciskanie w garażu  ", equipment: ["barbell", "bench"], primaryMuscles: ["pectoralis_major"], secondaryMuscles: ["triceps_brachii"], measurementType: "weight_reps", loadModel: "barbell_total", variantAttributes: ["angle.flat"], loadIncrementKg: 2.5 };
const make = (input = HOME_BENCH, opts = {}) => P.createPrivateExercise(input, { ctx, now: NOW, newId: fixedId, ...opts });
const codes = (r) => r.errors.map((e) => e.code);

describe("1. creating and validating private exercises", () => {
  test("a valid record: private scope, active, entryRev 1, dates, trimmed name, defaults; the atlas validator in private mode", () => {
    const r = make();
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    const x = r.record;
    assert.equal(x.scope, "private");
    assert.equal(x.status, "active");
    assert.equal(x.entryRev, 1);
    assert.equal(x.namePl, "Wyciskanie w garażu");
    assert.equal(x.createdAt, NOW);
    assert.equal(x.updatedAt, NOW);
    assert.equal(x.archivedAt, null);
    assert.equal(x.laterality, "bilateral");
    assert.equal(x.repsCounting, "total");
    assert.equal(x.implements, null);
    assert.equal(P.validatePrivateExercise(x, ctx).ok, true);
  });
  test("the input never changes; only form fields are taken (no id, scope, status or dates from the input)", () => {
    const input = { ...HOME_BENCH, exerciseId: "bench_press_barbell_flat", scope: "system", status: "archived", entryRev: 9, createdAt: "1999-01-01T00:00:00.000Z" };
    const before = JSON.stringify(input);
    const r = make(input);
    assert.equal(r.ok, true);
    assert.equal(JSON.stringify(input), before);
    assert.ok(isUuid(r.record.exerciseId));
    assert.equal(r.record.scope, "private");
    assert.equal(r.record.status, "active");
    assert.equal(r.record.entryRev, 1);
    assert.equal(r.record.createdAt, NOW);
  });
  test("the atlas rules apply: required name, dictionary values, primary muscle, measurement ↔ model, equipment ↔ model, weight in the name", () => {
    assert.deepEqual(codes(make({ ...HOME_BENCH, namePl: "   " })), ["REQUIRED_FIELD_MISSING"]);
    assert.ok(codes(make({ ...HOME_BENCH, equipment: ["barbell", "rakieta"] })).includes("DICT_VALUE_UNKNOWN"));
    assert.ok(codes(make({ ...HOME_BENCH, primaryMuscles: [] })).includes("PRIMARY_MUSCLE_REQUIRED"));
    assert.ok(codes(make({ ...HOME_BENCH, measurementType: "time" })).includes("MEASUREMENT_MODEL_MISMATCH"));
    assert.ok(codes(make({ ...HOME_BENCH, equipment: ["bench"] })).includes("LOAD_MODEL_EQUIPMENT_MISMATCH"));
    assert.ok(codes(make({ ...HOME_BENCH, namePl: "Wyciskanie 100 kg" })).includes("NAME_CONTAINS_WORKING_WEIGHT"));
    assert.ok(codes(make({ ...HOME_BENCH, primaryMuscles: ["pectoralis_major"], secondaryMuscles: ["pectoralis_major"] })).includes("MUSCLE_PRIMARY_AND_SECONDARY"));
  });
  test("private-mode differences: no approvedIn needed, card content optional (invalid card = warning), cardio without muscles", () => {
    const r = make({ namePl: "Rower w lesie", measurementType: "cardio", loadModel: "cardio" });
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    const card = make({ ...HOME_BENCH, instructionsPl: [] });
    assert.equal(card.ok, true, "an invalid card is a warning in a private record (T5)");
    assert.ok(card.warnings.some((w) => w.code === "CARD_CONTENT_EMPTY"));
    assert.equal(make({ ...HOME_BENCH, instructionsPl: ["Stopy na ziemi.", "Łopatki ściągnięte."] }).ok, true);
  });
  test("„Nie wiem / inaczej” (external_unknown, Q5) only with weight and reps", () => {
    const ok = make({ namePl: "Hantle z siłowni", equipment: ["dumbbell"], primaryMuscles: ["biceps_brachii"], measurementType: "weight_reps", loadModel: "external_unknown" });
    assert.equal(ok.ok, true, JSON.stringify(ok.errors));
    assert.equal(ok.record.implements, null);
    assert.ok(codes(make({ namePl: "Deska", primaryMuscles: ["rectus_abdominis"], measurementType: "time", loadModel: "external_unknown" })).includes("PRIVATE_UNKNOWN_MODEL_MEASUREMENT"));
  });
  test("per-implement models get their implements; a wrong count is rejected (V6)", () => {
    const pair = make({ namePl: "Uginanie w domu", equipment: ["dumbbell"], primaryMuscles: ["biceps_brachii"], measurementType: "weight_reps", loadModel: "dumbbell_pair" });
    assert.equal(pair.ok, true);
    assert.equal(pair.record.implements, 2);
    assert.ok(codes(make({ namePl: "Uginanie", equipment: ["dumbbell"], primaryMuscles: ["biceps_brachii"], measurementType: "weight_reps", loadModel: "dumbbell_pair", implements: 1 })).includes("IMPLEMENTS_MODEL_MISMATCH"));
  });
  test("closed record: unknown fields, atlas release fields, equivalence fields, bad dates and entryRev are errors", () => {
    const x = make().record;
    assert.ok(codes(P.validatePrivateExercise({ ...x, foo: 1 }, ctx)).includes("UNKNOWN_FIELD"));
    assert.ok(codes(P.validatePrivateExercise({ ...x, approvedIn: "B01" }, ctx)).includes("PRIVATE_FIELD_FORBIDDEN"));
    assert.ok(codes(P.validatePrivateExercise({ ...x, sameAs: "bench_press_barbell_flat" }, ctx)).includes("EQUIVALENCE_FIELD_FORBIDDEN"));
    assert.ok(codes(P.validatePrivateExercise({ ...x, createdAt: "wczoraj" }, ctx)).includes("PRIVATE_DATE_INVALID"));
    assert.ok(codes(P.validatePrivateExercise({ ...x, entryRev: 0 }, ctx)).includes("PRIVATE_ENTRY_REV_INVALID"));
    assert.ok(codes(P.validatePrivateExercise({ ...x, scope: "system" }, ctx)).includes("PRIVATE_SCOPE_REQUIRED"));
    assert.ok(codes(P.validatePrivateExercise({ ...x, archivedAt: NOW }, ctx)).includes("PRIVATE_DATE_INVALID"), "active with an archive date");
    assert.deepEqual(codes(P.validatePrivateExercise(null, ctx)), ["PRIVATE_RECORD_INVALID"]);
  });
  test("editorial vs comparability fields: disjoint, the comparability set = CALC ∪ INTERPRETATION", () => {
    assert.deepEqual([...P.PRIVATE_COMPARABILITY_FIELDS].sort(), [...new Set([...CALC_FIELDS, ...INTERPRETATION_FIELDS])].sort());
    for (const f of P.PRIVATE_EDITORIAL_FIELDS) assert.ok(!P.PRIVATE_COMPARABILITY_FIELDS.includes(f), f);
    for (const f of ["namePl", "aliasesPl", "tipsPl", ...CARD_CONTENT_FIELDS]) assert.ok(P.PRIVATE_EDITORIAL_FIELDS.includes(f), f);
  });
});

describe("2. UUID and familyId", () => {
  test("the id is a lower-case v4 UUID from the platform (also with getRandomValues only); unique; valid as nr1 privateExerciseId", () => {
    const ids = new Set(Array.from({ length: 200 }, () => P.newPrivateExerciseId()));
    assert.equal(ids.size, 200);
    for (const id of ids) assert.ok(isUuid(id) && P.isPrivateExerciseId(id), id);
    const only = P.newPrivateExerciseId({ getRandomValues: (a) => globalThis.crypto.getRandomValues(a) });
    assert.ok(isUuid(only), only);
    assert.match(only, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.throws(() => P.newPrivateExerciseId({}), /NO_UUID_SOURCE/);
    const r = P.createPrivateExercise(HOME_BENCH, { ctx, now: NOW });
    assert.deepEqual(validateExerciseRef({ catalogExerciseId: null, privateExerciseId: r.record.exerciseId }), []);
  });
  test("an atlas-format id or a malformed UUID is never a private id", () => {
    const x = make().record;
    assert.ok(codes(P.validatePrivateExercise({ ...x, exerciseId: "bench_press_barbell_flat" }, ctx)).includes("PRIVATE_ID_INVALID"));
    assert.ok(codes(P.validatePrivateExercise({ ...x, exerciseId: "D8C9E43F-1762-4B03-90BC-039E0C1DCF37" }, ctx)).includes("PRIVATE_ID_INVALID"));
    assert.ok(!codes(P.validatePrivateExercise(x, ctx)).includes("EXERCISE_ID_FORMAT"), "the atlas id rule is replaced, not added");
  });
  test("made from scratch: no familyId (not required); a given family must exist in the atlas", () => {
    const r = make();
    assert.equal("familyId" in r.record, false);
    assert.equal(r.ok, true);
    assert.ok(codes(make({ ...HOME_BENCH, familyId: "nie_ma_takiej" })).includes("FAMILY_UNKNOWN"));
    assert.equal(make({ ...HOME_BENCH, familyId: "bench_press" }).record.familyId, "bench_press");
  });
  test("a variant of an atlas exercise inherits its familyId and points at it (basedOnExerciseId); its id is new", () => {
    const r = make({ namePl: "Uginanie z pauzą", equipment: ["dumbbell"], primaryMuscles: ["biceps_brachii"], measurementType: "weight_reps", loadModel: "dumbbell_pair" }, { basedOn: CURL });
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.record.familyId, CURL.familyId);
    assert.equal(r.record.basedOnExerciseId, CURL.exerciseId);
    assert.notEqual(r.record.exerciseId, CURL.exerciseId);
    const own = make({ ...HOME_BENCH, familyId: undefined }, { basedOn: BENCH });
    assert.equal(own.record.familyId, "bench_press");
  });
});

describe("6. archive and restore", () => {
  test("archive: status archived + reason + date, the id and fields stay; restore: active again; double operations refused", () => {
    const x = make().record;
    const a = P.archivePrivateExercise(x, { now: LATER });
    assert.equal(a.ok, true);
    assert.equal(a.record.status, "archived");
    assert.equal(a.record.archivedAt, LATER);
    assert.equal(a.record.archivedReason, P.PRIVATE_ARCHIVED_REASON);
    assert.equal(a.record.exerciseId, x.exerciseId);
    assert.equal(a.record.entryRev, x.entryRev);
    assert.equal(P.validatePrivateExercise(a.record, ctx).ok, true);
    assert.equal(x.status, "active", "input unchanged");
    assert.equal(P.archivePrivateExercise(a.record).code, "ALREADY_ARCHIVED");
    const r = P.restorePrivateExercise(a.record, { now: LATER });
    assert.equal(r.ok, true);
    assert.equal(r.record.status, "active");
    assert.equal(r.record.archivedAt, null);
    assert.equal(r.record.archivedReason, null);
    assert.equal(P.validatePrivateExercise(r.record, ctx).ok, true);
    assert.equal(P.restorePrivateExercise(x).code, "NOT_ARCHIVED");
  });
});

describe("7. usage count; delete only when unused", () => {
  const x = make().record;
  const plans = [
    { id: "p1", exercises: [{ id: "i1", exerciseId: x.exerciseId, privateExerciseId: x.exerciseId }, { id: "i2", exerciseId: "bench_press_barbell_flat" }] },
    { id: "p2", exercises: [{ id: "i3", exerciseId: "bench_press_barbell_flat", catalogExerciseId: "bench_press_barbell_flat" }] },
  ];
  const history = [
    { id: "s1", exercises: [{ exerciseId: "x", loadSnapshot: { source: "private", privateExerciseId: x.exerciseId } }] },
    { id: "s2", exercises: [{ exerciseId: x.exerciseId }, { exerciseId: x.exerciseId }] },
  ];
  test("plans and workouts are counted with every reference form; nothing is changed", () => {
    const before = JSON.stringify({ plans, history });
    assert.deepEqual(P.countExerciseUsage(x.exerciseId, { plans, history }), { plans: 1, planItems: 1, sessions: 2, sessionEntries: 3, total: 3, inUse: true });
    assert.deepEqual(P.countExerciseUsage("bench_press_barbell_flat", { plans, history }), { plans: 2, planItems: 2, sessions: 0, sessionEntries: 0, total: 2, inUse: true });
    assert.equal(JSON.stringify({ plans, history }), before);
    assert.deepEqual(P.countExerciseUsage(x.exerciseId), { plans: 0, planItems: 0, sessions: 0, sessionEntries: 0, total: 0, inUse: false });
    assert.deepEqual(P.countExerciseUsage(x.exerciseId, { plans: [null, { exercises: "x" }], history: [{}] }).total, 0, "broken entries are skipped");
  });
  test("delete is allowed only at 0 uses; list operations touch one record", () => {
    assert.equal(P.canDeletePrivateExercise({ total: 0 }), true);
    assert.equal(P.canDeletePrivateExercise(P.countExerciseUsage(x.exerciseId, { plans, history })), false);
    assert.equal(P.canDeletePrivateExercise(null), false);
    const y = make().record;
    const list = P.upsertPrivateExercise(P.upsertPrivateExercise([], x), y);
    assert.deepEqual(list.map((r) => r.exerciseId), [x.exerciseId, y.exerciseId]);
    const renamed = { ...x, namePl: "Inna" };
    assert.equal(P.upsertPrivateExercise(list, renamed)[0].namePl, "Inna");
    assert.deepEqual(P.removePrivateExerciseFromList(list, x.exerciseId).map((r) => r.exerciseId), [y.exerciseId]);
    assert.equal(list.length, 2, "input unchanged");
  });
});

describe("8. comparability of results (K5, decision 7)", () => {
  const x = make().record;
  const noHistory = { plans: 1, planItems: 1, sessions: 0, sessionEntries: 0, total: 1, inUse: true };
  const withHistory = { plans: 0, planItems: 0, sessions: 1, sessionEntries: 1, total: 1, inUse: true };
  test("classification: editorial / comparability / immutable / unknown", () => {
    const c = P.classifyPrivateChange(x, { namePl: "Nowa", tipsPl: "Wskazówka", loadModel: "barbell_total", equipment: ["dumbbell"], exerciseId: "x", foo: 1 });
    assert.deepEqual(c, { editorial: ["namePl", "tipsPl"], comparability: ["equipment"], immutable: ["exerciseId"], unknown: ["foo"] });
  });
  test("editorial edits never need a new exercise: same id, same entryRev, new updatedAt — also with history", () => {
    const u = P.updatePrivateExercise(x, { namePl: " Wyciskanie w piwnicy ", instructionsPl: ["Stopy na ziemi."] }, { ctx, usage: withHistory, now: LATER });
    assert.equal(u.ok, true, JSON.stringify(u));
    assert.equal(u.record.exerciseId, x.exerciseId);
    assert.equal(u.record.entryRev, 1);
    assert.equal(u.record.namePl, "Wyciskanie w piwnicy");
    assert.equal(u.record.updatedAt, LATER);
    assert.equal(u.record.createdAt, NOW);
  });
  test("with history: every comparability field is refused (nothing changes); only „Zapisz jako nowe ćwiczenie”", () => {
    for (const patch of [{ equipment: ["dumbbell"], loadModel: "dumbbell_pair" }, { loadModel: "external_unknown" }, { primaryMuscles: ["triceps_brachii"] }, { variantAttributes: ["angle.incline"] }, { loadIncrementKg: 5 }, { laterality: "unilateral" }]) {
      const u = P.updatePrivateExercise(x, patch, { ctx, usage: withHistory, now: LATER });
      assert.equal(u.ok, false, JSON.stringify(patch));
      assert.equal(u.code, "COMPARABILITY_CHANGE_REQUIRES_NEW_EXERCISE");
      assert.equal(u.record, null);
    }
    const unknownUsage = P.updatePrivateExercise(x, { loadIncrementKg: 5 }, { ctx, now: LATER });
    assert.equal(unknownUsage.code, "COMPARABILITY_CHANGE_REQUIRES_NEW_EXERCISE", "no usage given → treated as with history");
  });
  test("without history (plans only): the change is applied and entryRev goes up", () => {
    const u = P.updatePrivateExercise(x, { loadIncrementKg: 5 }, { ctx, usage: noHistory, now: LATER });
    assert.equal(u.ok, true, JSON.stringify(u));
    assert.equal(u.record.entryRev, 2);
    assert.equal(u.record.exerciseId, x.exerciseId);
    const bad = P.updatePrivateExercise(x, { loadModel: "dumbbell_pair" }, { ctx, usage: noHistory, now: LATER });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "INVALID", "the edited record is validated");
  });
  test("identity and lifecycle fields cannot be edited; no change → NO_CHANGE", () => {
    for (const f of ["exerciseId", "scope", "status", "entryRev", "createdAt", "archivedAt", "familyId"]) {
      const u = P.updatePrivateExercise(x, { [f]: f === "entryRev" ? 7 : "x" }, { ctx, usage: noHistory });
      assert.equal(u.code, "IMMUTABLE_FIELD", f);
    }
    assert.equal(P.updatePrivateExercise(x, { foo: 1 }, { ctx, usage: noHistory }).code, "UNKNOWN_FIELD");
    assert.equal(P.updatePrivateExercise(x, { namePl: "Wyciskanie w garażu" }, { ctx, usage: withHistory }).code, "NO_CHANGE");
  });
  test("„Zapisz jako nowe ćwiczenie”: a new record (new UUID, entryRev 1) with the change; the old one is untouched", () => {
    const d = P.deriveFromPrivateExercise(x, { namePl: "Wyciskanie hantlami w garażu", equipment: ["dumbbell", "bench"], loadModel: "dumbbell_pair" }, { ctx, now: LATER, newId: fixedId });
    assert.equal(d.ok, true, JSON.stringify(d.errors));
    assert.notEqual(d.record.exerciseId, x.exerciseId);
    assert.equal(d.record.entryRev, 1);
    assert.equal(d.record.implements, 2);
    assert.equal(d.record.basedOnExerciseId, x.exerciseId);
    assert.equal(d.record.createdAt, LATER);
    assert.equal(x.loadModel, "barbell_total");
    assert.equal(P.deriveFromPrivateExercise(x, { status: "archived" }, { ctx }).code, "IMMUTABLE_FIELD");
  });
});

describe("D1 scope", () => {
  test("the atlas rules are unchanged: atlas.json, the schema and the validator equal c254116; the repository atlas still validates", () => {
    for (const f of ["src/atlas/atlas.json", "src/atlas/navigation.json", "src/engine/atlas-schema.js", "src/engine/atlas-validate.js", "src/engine/atlas-index.js", "src/engine/load-snapshot.js"]) {
      const before = execFileSync("git", ["show", `c254116:${f}`], { cwd: ROOT, encoding: "utf8" });
      assert.equal(readFileSync(resolve(ROOT, f), "utf8"), before, f);
    }
    assert.equal(validateAtlas(atlas).issues.filter((i) => i.level === "error").length, 0);
  });
  test("pure module: no storage, network or atlas import; reaches the app only as the named engine exports", () => {
    for (const f of ["src/engine/private-exercise.js", "src/engine/user-catalog.js"]) {
      const src = readFileSync(resolve(ROOT, f), "utf8");
      assert.doesNotMatch(src, /localStorage|indexedDB|fetch\(|XMLHttpRequest|readFile|atlas\.json|supabase/i, f);
    }
    for (const n of ["createPrivateExercise", "validatePrivateExercise", "countExerciseUsage", "buildUserCatalog", "userExerciseDataProblems"]) assert.equal(typeof ENGINE[n], "function", n);
    // the atlas validator reaches the app only through the private-exercise module (checks of own records)
    const users = execFileSync("git", ["grep", "--untracked", "-l", "atlas-validate", "--", "src/engine", "src/app"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    assert.deepEqual(users, ["src/engine/private-exercise.js"]);
  });
  test("no cloud: the four keys are local only — no Supabase / sync module refers to them", () => {
    const out = execFileSync("git", ["grep", "--untracked", "-l", "-E", "userExercises|user_exercises|exerciseNames|exercise_names|exerciseMedia|exercise_media|STORAGE_KEYS\\.favourites", "--", "src/app", "src/nr1", "db", "docs/sql"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean).sort();
    // DES-01 / D2: the browse adapter reads the raw names / favourites only as cache keys (never writes them)
    assert.deepEqual(out, ["src/app/05-storage-keys-draft-pro.jsx", "src/app/05b-user-exercise-data.jsx", "src/app/09-backups.jsx", "src/app/17c-atlas-browse.jsx"]);
  });
});
