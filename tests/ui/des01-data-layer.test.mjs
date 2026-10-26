// DES-01 / D1 — the app's local data layer (src/app/05b-user-exercise-data.jsx) and backups (09-backups.jsx) on the
// S1 build exactly as it ships: storage keys per account namespace (3. isolation), own exercises through the
// app (1, 6, 7, 8 with real plans / history in storage), favourites and private names, export / import / restore
// (9) and older copies (10). No UI exists for these yet (D2+); nothing here renders.
import { describe, test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { useS1Profile, resetStorage, scopedKey } from "../harness/load-app.mjs";
import { loadApp } from "../harness/ui.mjs";
import { UA, UB } from "../harness/account-fixtures.mjs";

useS1Profile();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let A;
before(async () => {
  A = await loadApp();
});
beforeEach(() => {
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  A.activateDataNamespace(null); // guest
});
const NOW = "2026-10-26T10:00:00.000Z";
const LATER = "2026-10-27T08:30:00.000Z";
const HOME_BENCH = { namePl: "Wyciskanie w garażu", equipment: ["barbell", "bench"], primaryMuscles: ["pectoralis_major"], measurementType: "weight_reps", loadModel: "barbell_total", variantAttributes: ["angle.flat"], loadIncrementKg: 2.5 };
const CURL = { namePl: "Uginanie w domu", equipment: ["dumbbell"], primaryMuscles: ["biceps_brachii"], measurementType: "weight_reps", loadModel: "dumbbell_pair" };
const raw = (name, ns = "guest") => localStorage.getItem(scopedKey(name, ns));
const json = (name, ns) => JSON.parse(raw(name, ns));
const dump = () => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));
const add = (input = HOME_BENCH, opts = {}) => {
  const r = A.addUserExercise(input, { now: NOW, ...opts });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.record;
};
const planWith = (id) => [{ id: "plan-1", name: "Push", exercises: [{ id: "pi-1", exerciseId: id, privateExerciseId: id, setsDetail: [{ id: "d1", target: "8-10", rir: "1-2" }] }] }];
const sessionWith = (id) => [{ id: "s1", date: "2026-10-20T10:00:00.000Z", exercises: [{ id: "e1", exerciseId: id, loadSnapshot: { source: "private", privateExerciseId: id }, sets: [{ weight: "60", reps: "8" }] }] }];

describe("D1.1 storage keys", () => {
  test("four new scoped keys of STORAGE_KEYS, in the S1 clean space, never in the cloud whitelist", () => {
    assert.equal(A.STORAGE_KEYS.userExercises, "nextrep1_guest_user_exercises_v1");
    assert.equal(A.STORAGE_KEYS.favourites, "nextrep1_guest_favourites_v1");
    assert.equal(A.STORAGE_KEYS.exerciseNames, "nextrep1_guest_exercise_names_v1");
    assert.equal(A.STORAGE_KEYS.exerciseMedia, "nextrep1_guest_exercise_media_v1");
    const cloud = A.CLOUD_SYNC_FIELDS.map(([, k]) => k());
    for (const k of ["userExercises", "favourites", "exerciseNames", "exerciseMedia"]) assert.ok(!cloud.includes(A.STORAGE_KEYS[k]), k);
    assert.equal(A.NR_CLOUD_SYNC_ENABLED, false);
  });
  test("every write is checked (saveKeyStrict) and reads are lenient: nothing stored → empty, never a write", () => {
    assert.deepEqual(A.loadUserExercises(), []);
    assert.deepEqual(A.loadFavouriteExercises(), []);
    assert.deepEqual(A.loadCustomExerciseNames(), {});
    assert.deepEqual(A.loadExerciseMediaData(), {});
    assert.deepEqual(dump(), {}, "reading writes nothing");
    const x = add();
    assert.deepEqual(json("user_exercises"), [x]);
  });
  test("an unreadable stored value is never overwritten by an operation (STORE_UNREADABLE), and reads stay empty", () => {
    localStorage.setItem(A.STORAGE_KEYS.userExercises, "{zepsute");
    localStorage.setItem(A.STORAGE_KEYS.favourites, JSON.stringify({ nie: "lista" }));
    assert.deepEqual(A.loadUserExercises(), []);
    assert.equal(A.addUserExercise(HOME_BENCH).code, "STORE_UNREADABLE");
    assert.equal(A.toggleFavouriteExercise("bench_press_barbell_flat").code, "STORE_UNREADABLE");
    assert.equal(raw("user_exercises"), "{zepsute");
    assert.equal(raw("favourites"), JSON.stringify({ nie: "lista" }));
  });
});

describe("3. isolation between accounts", () => {
  test("guest, account A and account B each have their own own-exercises, favourites and names", () => {
    const g = add({ ...HOME_BENCH, namePl: "Gościnne" });
    A.toggleFavouriteExercise("bench_press_barbell_flat", { now: NOW });
    A.activateDataNamespace(UA);
    assert.deepEqual(A.loadUserExercises(), [], "A starts empty");
    assert.deepEqual(A.loadFavouriteExercises(), []);
    const a = add({ ...HOME_BENCH, namePl: "Konto A" });
    assert.equal(A.setCustomExerciseNameFor("bench_press_barbell_flat", "Klata A", { now: NOW }).ok, true);
    A.activateDataNamespace(UB);
    assert.deepEqual(A.loadUserExercises(), []);
    assert.deepEqual(A.loadCustomExerciseNames(), {});
    assert.equal(A.getUserExerciseCatalog().resolve(a.exerciseId), null, "B cannot resolve A's exercise");
    assert.equal(A.toggleFavouriteExercise(a.exerciseId).code, "REF_UNKNOWN_EXERCISE", "B cannot favourite A's exercise");
    A.activateDataNamespace(UA);
    assert.deepEqual(A.loadUserExercises().map((r) => r.namePl), ["Konto A"]);
    assert.equal(A.getUserExerciseCatalog().displayName("bench_press_barbell_flat"), "Klata A");
    A.activateDataNamespace(null);
    assert.deepEqual(A.loadUserExercises().map((r) => r.exerciseId), [g.exerciseId]);
    assert.deepEqual(A.loadFavouriteExercises().map((f) => f.exerciseId), ["bench_press_barbell_flat"]);
    assert.equal(A.getUserExerciseCatalog().displayName("bench_press_barbell_flat"), A.getUserExerciseCatalog().resolve("bench_press_barbell_flat").atlasName);
    assert.ok(raw("user_exercises", `user_${UA}`) && raw("user_exercises", "guest"), "separate keys per namespace");
    assert.equal(raw("user_exercises", `user_${UB}`), null, "B wrote nothing");
  });
  test("backups belong to their namespace: A's snapshot holds A's own exercises only", () => {
    add({ ...HOME_BENCH, namePl: "Gościnne" });
    A.activateDataNamespace(UA);
    const a = add({ ...HOME_BENCH, namePl: "Konto A" });
    const snap = A.createBackupSnapshot("manual", { force: true });
    assert.equal(snap.namespace, `user_${UA}`);
    assert.deepEqual(snap.data.userExercises.map((r) => r.exerciseId), [a.exerciseId]);
  });
});

describe("own exercises through the app (1, 2, 6, 7, 8)", () => {
  test("create: valid record stored; invalid input stores nothing", () => {
    const x = add();
    assert.equal(x.scope, "private");
    assert.ok(A.getUserExerciseCatalog().resolve(x.exerciseId));
    const before = dump();
    const bad = A.addUserExercise({ ...HOME_BENCH, primaryMuscles: [] });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "INVALID");
    assert.ok(bad.errors.some((e) => e.code === "PRIMARY_MUSCLE_REQUIRED"));
    assert.deepEqual(dump(), before);
  });
  test("a variant of an atlas exercise inherits its family; an unknown base is refused", () => {
    const v = add(CURL, { basedOnId: "curl_dumbbell_pair_standing" });
    assert.equal(v.familyId, "biceps_curl");
    assert.equal(v.basedOnExerciseId, "curl_dumbbell_pair_standing");
    assert.equal(A.addUserExercise(CURL, { basedOnId: "nie_ma" }).code, "BASE_NOT_FOUND");
    assert.equal("familyId" in add(), false, "from scratch: no family");
  });
  test("archive / restore: plans, history and favourites keep pointing at it; out of search, resolvable", () => {
    const x = add();
    localStorage.setItem(A.STORAGE_KEYS.plans, JSON.stringify(planWith(x.exerciseId)));
    localStorage.setItem(A.STORAGE_KEYS.history, JSON.stringify(sessionWith(x.exerciseId)));
    A.toggleFavouriteExercise(x.exerciseId, { now: NOW });
    const plans = raw("plans");
    const history = raw("history");
    const r = A.archiveUserExercise(x.exerciseId, { now: LATER });
    assert.equal(r.ok, true);
    assert.equal(json("user_exercises")[0].status, "archived");
    assert.equal(raw("plans"), plans);
    assert.equal(raw("history"), history);
    assert.deepEqual(A.loadFavouriteExercises().map((f) => f.exerciseId), [x.exerciseId], "stays in favourites (decision 8)");
    const c = A.getUserExerciseCatalog();
    assert.equal(c.resolve(x.exerciseId).archived, true);
    assert.equal(c.search("garaz").length, 0);
    assert.equal(A.archiveUserExercise(x.exerciseId).code, "ALREADY_ARCHIVED");
    assert.equal(A.restoreUserExercise(x.exerciseId, { now: LATER }).ok, true);
    assert.equal(A.getUserExerciseCatalog().search("garaz").length, 1);
    assert.equal(A.restoreUserExercise("00000000-0000-4000-8000-000000000999").code, "NOT_FOUND");
  });
  test("delete: refused while used in a plan or a workout (nothing removed); allowed at 0 uses, with its favourite and materials", () => {
    const x = add();
    localStorage.setItem(A.STORAGE_KEYS.plans, JSON.stringify(planWith(x.exerciseId)));
    const before = dump();
    const r = A.deleteUserExercise(x.exerciseId);
    assert.equal(r.ok, false);
    assert.equal(r.code, "EXERCISE_IN_USE");
    assert.deepEqual(r.usage, { plans: 1, planItems: 1, sessions: 0, sessionEntries: 0, total: 1, inUse: true });
    assert.deepEqual(dump(), before);
    localStorage.setItem(A.STORAGE_KEYS.plans, "[]");
    localStorage.setItem(A.STORAGE_KEYS.history, JSON.stringify(sessionWith(x.exerciseId)));
    assert.equal(A.deleteUserExercise(x.exerciseId).code, "EXERCISE_IN_USE", "history counts too");
    localStorage.setItem(A.STORAGE_KEYS.history, "[]");
    A.toggleFavouriteExercise(x.exerciseId, { now: NOW });
    localStorage.setItem(A.STORAGE_KEYS.exerciseMedia, JSON.stringify({ [x.exerciseId]: [{ id: "m1", kind: "youtube", url: "https://youtu.be/a", title: null, isMain: true, addedAt: NOW }], bench_press_barbell_flat: [] }));
    const keep = add({ ...HOME_BENCH, namePl: "Zostaje" });
    const d = A.deleteUserExercise(x.exerciseId);
    assert.equal(d.ok, true, JSON.stringify(d));
    assert.deepEqual(A.loadUserExercises().map((e) => e.exerciseId), [keep.exerciseId]);
    assert.deepEqual(A.loadFavouriteExercises(), []);
    assert.deepEqual(Object.keys(json("exercise_media")), ["bench_press_barbell_flat"]);
  });
  test("edit with history: comparability change refused (stored record unchanged); editorial change saved; „nowe ćwiczenie” adds a record", () => {
    const x = add();
    localStorage.setItem(A.STORAGE_KEYS.history, JSON.stringify(sessionWith(x.exerciseId)));
    const stored = raw("user_exercises");
    const r = A.editUserExercise(x.exerciseId, { loadIncrementKg: 5 });
    assert.equal(r.code, "COMPARABILITY_CHANGE_REQUIRES_NEW_EXERCISE");
    assert.equal(raw("user_exercises"), stored);
    const e = A.editUserExercise(x.exerciseId, { namePl: "Wyciskanie w piwnicy" }, { now: LATER });
    assert.equal(e.ok, true);
    assert.equal(json("user_exercises")[0].namePl, "Wyciskanie w piwnicy");
    assert.equal(json("user_exercises")[0].entryRev, 1);
    const n = A.saveUserExerciseAsNew(x.exerciseId, { loadIncrementKg: 5 }, { now: LATER });
    assert.equal(n.ok, true);
    assert.deepEqual(json("user_exercises").map((r) => r.exerciseId), [x.exerciseId, n.record.exerciseId]);
    assert.equal(json("user_exercises")[0].loadIncrementKg, 2.5, "the old one keeps its parameters");
    assert.equal(A.editUserExercise(x.exerciseId, { status: "archived" }).code, "IMMUTABLE_FIELD");
    assert.equal(A.userExerciseUsage(x.exerciseId).sessions, 1);
  });
  test("edit without history (plan only): the change is saved, entryRev goes up", () => {
    const x = add();
    localStorage.setItem(A.STORAGE_KEYS.plans, JSON.stringify(planWith(x.exerciseId)));
    const r = A.editUserExercise(x.exerciseId, { loadIncrementKg: 5 }, { now: LATER });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(json("user_exercises")[0].entryRev, 2);
  });
});

describe("favourites and private names through the app", () => {
  test("favourites: catalog exercises only; toggle on and off", () => {
    const x = add();
    assert.equal(A.toggleFavouriteExercise("bench_press_barbell_flat", { now: NOW }).favourite, true);
    assert.equal(A.toggleFavouriteExercise(x.exerciseId, { now: NOW }).favourite, true);
    assert.equal(A.toggleFavouriteExercise("nie_ma_takiego").code, "REF_UNKNOWN_EXERCISE");
    assert.deepEqual(json("favourites").map((f) => f.exerciseId), ["bench_press_barbell_flat", x.exerciseId]);
    assert.equal(A.toggleFavouriteExercise("bench_press_barbell_flat").favourite, false);
    assert.deepEqual(json("favourites").map((f) => f.exerciseId), [x.exerciseId]);
  });
  test("private name: no new exercise, no change of plans or history; searchable; removable", () => {
    localStorage.setItem(A.STORAGE_KEYS.history, JSON.stringify([{ id: "s1", exercises: [{ exerciseId: "bench_press_barbell_flat", catalogExerciseId: "bench_press_barbell_flat", name: "Wyciskanie sztangi leżąc" }] }]));
    const history = raw("history");
    const before = A.getUserExerciseCatalog().list().length;
    assert.equal(A.setCustomExerciseNameFor("bench_press_barbell_flat", "Klata płasko", { now: NOW }).ok, true);
    const c = A.getUserExerciseCatalog();
    assert.equal(c.list().length, before, "no new catalog entry");
    assert.equal(c.search("klata plasko")[0].exerciseId, "bench_press_barbell_flat");
    assert.equal(raw("history"), history);
    assert.equal(A.loadUserExercises().length, 0, "not a copy as an own exercise");
    assert.equal(A.setCustomExerciseNameFor(add().exerciseId, "X").code, "NAME_ID_NOT_ATLAS");
    assert.equal(A.removeCustomExerciseNameFor("bench_press_barbell_flat").ok, true);
    assert.deepEqual(json("exercise_names"), {});
  });
});

describe("9. export and import", () => {
  function fill() {
    const x = add();
    const v = add(CURL, { basedOnId: "curl_dumbbell_pair_standing" });
    A.archiveUserExercise(v.exerciseId, { now: LATER });
    A.toggleFavouriteExercise(x.exerciseId, { now: NOW });
    A.toggleFavouriteExercise(v.exerciseId, { now: NOW });
    A.setCustomExerciseNameFor("bench_press_barbell_flat", "Klata płasko", { now: NOW });
    localStorage.setItem(A.STORAGE_KEYS.exerciseMedia, JSON.stringify({ [x.exerciseId]: [{ id: "m1", kind: "youtube", url: "https://youtu.be/abc", title: "Technika", isMain: true, addedAt: NOW }, { id: "m2", kind: "file", fileRef: "content://media/1", title: null, isMain: false, addedAt: NOW }] }));
    return { x, v };
  }
  test("the export bundle carries the four fields (material metadata only — no file content)", () => {
    const { x, v } = fill();
    const data = A.readAllAppData();
    assert.deepEqual(data.userExercises.map((r) => r.exerciseId), [x.exerciseId, v.exerciseId]);
    assert.deepEqual(data.favourites.map((f) => f.exerciseId), [x.exerciseId, v.exerciseId]);
    assert.deepEqual(Object.keys(data.exerciseNames), ["bench_press_barbell_flat"]);
    assert.deepEqual(data.exerciseMedia[x.exerciseId].map((m) => Object.keys(m).sort()), [["addedAt", "id", "isMain", "kind", "title", "url"], ["addedAt", "fileRef", "id", "isMain", "kind", "title"]]);
    const src = readFileSync(resolve(ROOT, "src/app/09-backups.jsx"), "utf8") + readFileSync(resolve(ROOT, "src/app/05b-user-exercise-data.jsx"), "utf8");
    assert.doesNotMatch(src, /FileReader|readAsDataURL|Blob\(|indexedDB/, "no file content is read into a backup");
  });
  test("round trip: export in A → import in B gives the same records, UUIDs and links; a backup before the import", () => {
    A.activateDataNamespace(UA);
    const { x, v } = fill();
    const bundle = JSON.parse(JSON.stringify({ app: "NextRep", formatVersion: 1, data: A.readAllAppData() }));
    A.activateDataNamespace(UB);
    const backupsBefore = A.loadBackupList().length;
    const r = A.applyImportedAppData(bundle.data);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.code, "IMPORTED");
    assert.equal(A.loadBackupList().length, backupsBefore + 1, "before-import snapshot");
    assert.equal(A.loadBackupList().at(-1).reason, "before-import");
    assert.deepEqual(A.loadUserExercises(), bundle.data.userExercises);
    const c = A.getUserExerciseCatalog();
    assert.equal(c.resolve(v.exerciseId).archived, true);
    assert.equal(c.resolve(v.exerciseId).exercise.familyId, "biceps_curl");
    assert.equal(c.displayName("bench_press_barbell_flat"), "Klata płasko");
    assert.deepEqual(A.loadFavouriteExercises(), bundle.data.favourites);
    assert.deepEqual(A.loadExerciseMediaData()[x.exerciseId], bundle.data.exerciseMedia[x.exerciseId]);
    assert.deepEqual(A.readAllAppData().userExercises, bundle.data.userExercises, "export after import = the same");
  });
  test("an invalid copy writes nothing at all — not even the valid fields, no backup", () => {
    add({ ...HOME_BENCH, namePl: "Moje obecne" });
    const before = dump();
    const bad = [
      { plans: [], userExercises: [{ exerciseId: "moje", scope: "private", namePl: "X" }] },
      { favourites: [{ exerciseId: "a b", addedAt: NOW }] },
      { exerciseNames: { "00000000-0000-4000-8000-000000000001": { name: "X", updatedAt: NOW } } },
      { exerciseMedia: { bench_press_barbell_flat: [{ id: "m", kind: "youtube", url: "http://youtube.com/x", isMain: false, addedAt: NOW }] } },
    ];
    for (const d of bad) {
      const r = A.applyImportedAppData(d);
      assert.equal(r.ok, false, JSON.stringify(d));
      assert.equal(r.code, "USER_EXERCISES_INVALID");
      assert.ok(r.problems.length > 0);
      assert.deepEqual(dump(), before, JSON.stringify(d));
    }
    assert.equal(A.applyImportedAppData({ foo: 1 }).code, "UNRECOGNIZED");
    assert.equal(A.applyImportedAppData({ exercises: [{ id: "old", name: "Stare" }] }).code, "ATLAS_INCOMPATIBLE", "the S1 atlas gate still applies first");
    assert.deepEqual(dump(), before);
  });
  test("restore of a local snapshot brings the four fields back; an invalid snapshot restores nothing", () => {
    const { x } = fill();
    const snap = A.createBackupSnapshot("manual", { force: true });
    A.deleteUserExercise(add({ ...HOME_BENCH, namePl: "Później" }).exerciseId);
    A.archiveUserExercise(x.exerciseId, { now: LATER });
    A.removeCustomExerciseNameFor("bench_press_barbell_flat");
    assert.equal(A.restoreFromSnapshot(snap), true);
    assert.deepEqual(A.readAllAppData().userExercises, snap.data.userExercises);
    assert.deepEqual(A.readAllAppData().exerciseNames, snap.data.exerciseNames);
    const before = dump();
    const broken = { ...snap, data: { ...snap.data, plans: [], userExercises: [{ ...snap.data.userExercises[0], exerciseId: "zly" }] } };
    assert.equal(A.restoreFromSnapshot(broken), false);
    assert.deepEqual(dump(), before);
  });
});

describe("10. older copies and data", () => {
  test("a copy from before D1 (no new fields) imports as before; the current own exercises, favourites and names stay", () => {
    const x = add();
    A.toggleFavouriteExercise(x.exerciseId, { now: NOW });
    A.setCustomExerciseNameFor("bench_press_barbell_flat", "Klata", { now: NOW });
    const keep = { u: raw("user_exercises"), f: raw("favourites"), n: raw("exercise_names") };
    const old = { exercises: [], plans: [{ id: "p", name: "Stary plan", exercises: [{ id: "i", exerciseId: "bench_press_barbell_flat", catalogExerciseId: "bench_press_barbell_flat", setsDetail: [{ id: "d", target: "8", rir: "" }] }] }], history: [], measurements: [], customFields: [], userName: "Ola", proStatus: null, proHints: null };
    const r = A.applyImportedAppData(old);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(json("plans")[0].name, "Stary plan");
    assert.deepEqual({ u: raw("user_exercises"), f: raw("favourites"), n: raw("exercise_names") }, keep);
  });
  test("a snapshot from before D1 (no new fields) restores as before and keeps the current D1 data", () => {
    const x = add();
    const snap = { backupId: "b", createdAt: NOW, formatVersion: 1, reason: "manual", namespace: "guest", data: { exercises: [], plans: [], history: [], measurements: [], customFields: [], userName: "Ola", proStatus: null, proHints: null } };
    assert.equal(A.restoreFromSnapshot(snap), true);
    assert.deepEqual(A.loadUserExercises().map((r) => r.exerciseId), [x.exerciseId]);
  });
  test("the old list „Moje ćwiczenia” (old model, key exercises) is untouched by D1 and never mixed with own exercises", () => {
    localStorage.setItem(A.STORAGE_KEYS.exercises, JSON.stringify([{ id: "old-1", name: "Stare ćwiczenie", type: "weight" }]));
    const old = raw("exercises");
    add();
    assert.equal(raw("exercises"), old);
    assert.equal(A.getUserExerciseCatalog().search("stare cwiczenie").length, 0);
  });
  test("a copy with a favourite / material of an exercise missing from it: imported without that dangling link", () => {
    const x = add();
    const r = A.applyImportedAppData({ userExercises: [], favourites: [{ exerciseId: x.exerciseId, addedAt: NOW }, { exerciseId: "bench_press_barbell_flat", addedAt: NOW }] });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.dangling, [{ field: "favourites", exerciseId: x.exerciseId }]);
    assert.deepEqual(json("favourites").map((f) => f.exerciseId), ["bench_press_barbell_flat"]);
    assert.deepEqual(json("user_exercises"), []);
  });
});
