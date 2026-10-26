// DES-01 / D1.3 + D1.5 — the user catalog on the repository atlas: private names of atlas exercises (4), search
// and id resolution (5), favourites and material metadata, and the check of the user-exercise part of a copy
// (9 import validation, 10 older copies) — engine level; the app level is tests/ui/des01-data-layer.test.mjs.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import atlas from "../../src/atlas/atlas.json" with { type: "json" };
import * as P from "../../src/engine/private-exercise.js";
import * as U from "../../src/engine/user-catalog.js";

const ctx = P.privateExerciseContext(atlas);
const NOW = "2026-10-26T10:00:00.000Z";
let seq = 0;
const fixedId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const own = (input, opts) => P.createPrivateExercise(input, { ctx, now: NOW, newId: fixedId, ...opts }).record;
const GARAGE = own({ namePl: "Wyciskanie w garażu", aliasesPl: ["Garażowa klata"], equipment: ["barbell", "bench"], primaryMuscles: ["pectoralis_major"], measurementType: "weight_reps", loadModel: "barbell_total" });
const OLD = P.archivePrivateExercise(own({ namePl: "Stare uginanie", equipment: ["dumbbell"], primaryMuscles: ["biceps_brachii"], measurementType: "weight_reps", loadModel: "dumbbell_pair" }), { now: NOW }).record;
const NAMES = { bench_press_barbell_flat: { name: "Klata płasko", updatedAt: NOW } };
const catalog = (extra = {}) => U.buildUserCatalog({ atlas, privateExercises: [GARAGE, OLD], exerciseNames: NAMES, ...extra });
const ids = (entries) => entries.map((e) => e.exerciseId);

describe("4. private names of atlas exercises", () => {
  test("the name is shown instead of the atlas name; the exerciseId, the atlas record and the atlas name stay", () => {
    const c = catalog();
    const r = c.resolve("bench_press_barbell_flat");
    assert.equal(r.source, "atlas");
    assert.equal(r.displayName, "Klata płasko");
    assert.equal(r.customName, "Klata płasko");
    assert.equal(r.atlasName, atlas.exercises.find((e) => e.exerciseId === "bench_press_barbell_flat").namePl);
    assert.equal(r.exercise.exerciseId, "bench_press_barbell_flat");
    assert.ok(!r.exercise.aliasesPl.includes("Klata płasko"), "the resolved atlas record is the original one");
    assert.equal(c.list().length, atlas.exercises.filter((e) => e.status === "active").length + 1, "no new exercise: atlas + 1 active own");
  });
  test("set / remove: only atlas ids, trimmed, max length, not equal to the atlas name; nothing else changes", () => {
    const idx = catalog().atlasIndex;
    const s = U.setCustomExerciseName({}, "squat_barbell_back", "  Mój przysiad  ", { atlasIndex: idx, now: NOW });
    assert.equal(s.ok, true, s.code);
    assert.deepEqual(s.names, { squat_barbell_back: { name: "Mój przysiad", updatedAt: NOW } });
    assert.equal(U.setCustomExerciseName({}, GARAGE.exerciseId, "X", { atlasIndex: idx }).code, "NAME_ID_NOT_ATLAS", "own exercises have their own name");
    assert.equal(U.setCustomExerciseName({}, "nie_ma", "X", { atlasIndex: idx }).code, "NAME_ID_NOT_ATLAS");
    assert.equal(U.setCustomExerciseName({}, "bench_press_barbell_flat", "   ", { atlasIndex: idx }).code, "NAME_EMPTY");
    assert.equal(U.setCustomExerciseName({}, "bench_press_barbell_flat", "x".repeat(81), { atlasIndex: idx }).code, "NAME_TOO_LONG");
    const atlasName = atlas.exercises.find((e) => e.exerciseId === "bench_press_barbell_flat").namePl;
    assert.equal(U.setCustomExerciseName({}, "bench_press_barbell_flat", atlasName.toUpperCase(), { atlasIndex: idx }).code, "NAME_SAME_AS_ATLAS");
    const r = U.removeCustomExerciseName(NAMES, "bench_press_barbell_flat");
    assert.deepEqual(r.names, {});
    assert.equal(r.code, "NAME_REMOVED");
    assert.equal(U.removeCustomExerciseName({}, "bench_press_barbell_flat").code, "NAME_NOT_SET");
    assert.deepEqual(Object.keys(NAMES), ["bench_press_barbell_flat"], "input unchanged");
  });
  test("lenient read: invalid entries are reported and left out", () => {
    const { names, problems } = U.normalizeExerciseNames({ bench_press_barbell_flat: { name: " A ", updatedAt: NOW }, [GARAGE.exerciseId]: { name: "B", updatedAt: NOW }, squat_barbell_back: { name: "", updatedAt: NOW }, deadlift_barbell_conventional: { name: "C" } }, { atlasIds: new Set(atlas.exercises.map((e) => e.exerciseId)) });
    assert.deepEqual(names, { bench_press_barbell_flat: { name: "A", updatedAt: NOW } });
    assert.deepEqual(problems.map((p) => p.code).sort(), ["NAME_DATE_INVALID", "NAME_EMPTY", "NAME_ID_NOT_ATLAS"]);
    assert.deepEqual(U.normalizeExerciseNames(null), { names: {}, problems: [] });
    assert.deepEqual(U.normalizeExerciseNames([]).problems.map((p) => p.code), ["NAMES_INVALID"]);
  });
});

describe("5. search and id resolution", () => {
  test("search finds atlas exercises by the private name (as an extra alias), own ones by name and alias", () => {
    const c = catalog();
    assert.deepEqual(ids(c.search("klata plasko")), ["bench_press_barbell_flat"]);
    assert.equal(c.search("klata plasko")[0].displayName, "Klata płasko");
    assert.ok(ids(c.search("wyciskanie")).includes("bench_press_barbell_flat"), "the atlas name keeps working");
    assert.deepEqual(ids(c.search("garaz")), [GARAGE.exerciseId], "Polish letters and case do not matter");
    assert.deepEqual(ids(c.search("garażowa klata")), [GARAGE.exerciseId]);
    assert.equal(c.search("garaz")[0].source, "private");
  });
  test("archived own exercises: resolvable (history, plans), out of search unless asked; sources filter", () => {
    const c = catalog();
    const r = c.resolve(OLD.exerciseId);
    assert.equal(r.archived, true);
    assert.equal(r.source, "private");
    assert.equal(r.displayName, "Stare uginanie");
    assert.deepEqual(ids(c.search("stare uginanie")), []);
    assert.deepEqual(ids(c.search("stare uginanie", { includeArchived: true })), [OLD.exerciseId]);
    assert.deepEqual(c.list({ sources: ["private"] }).map((e) => e.exerciseId), [GARAGE.exerciseId]);
    assert.deepEqual(c.list({ sources: ["private"], includeArchived: true }).map((e) => e.exerciseId).sort(), [GARAGE.exerciseId, OLD.exerciseId].sort());
    assert.ok(c.list({ sources: ["atlas"] }).every((e) => e.source === "atlas"));
  });
  test("resolve: unknown → null; isPrivate / sourceOf / displayName; invalid or shadowing private records are ignored", () => {
    const c = catalog({ privateExercises: [GARAGE, OLD, { ...GARAGE }, { ...GARAGE, exerciseId: "bench_press_barbell_flat" }, { exerciseId: "x" }, null] });
    assert.equal(c.resolve("nie_ma"), null);
    assert.equal(c.resolve(undefined), null);
    assert.equal(c.isPrivate(GARAGE.exerciseId), true);
    assert.equal(c.isPrivate("bench_press_barbell_flat"), false);
    assert.equal(c.sourceOf("bench_press_barbell_flat"), "atlas");
    assert.equal(c.displayName(GARAGE.exerciseId), "Wyciskanie w garażu");
    assert.equal(c.resolve("bench_press_barbell_flat").source, "atlas", "an own record can never take an atlas id");
    assert.equal(c.list({ sources: ["private"] }).length, 1, "duplicate id counted once");
  });
  test("the atlas and the inputs are never changed", () => {
    const before = JSON.stringify(atlas);
    const garage = JSON.stringify(GARAGE);
    catalog().search("klata");
    assert.equal(JSON.stringify(atlas), before);
    assert.equal(JSON.stringify(GARAGE), garage);
  });
});

describe("favourites and material metadata", () => {
  test("favourites: atlas ids and UUIDs, toggle, no duplicates, lenient read", () => {
    let f = U.toggleFavourite([], "bench_press_barbell_flat", { now: NOW });
    assert.equal(f.favourite, true);
    f = U.toggleFavourite(f.favourites, GARAGE.exerciseId, { now: NOW });
    assert.deepEqual(f.favourites, [{ exerciseId: "bench_press_barbell_flat", addedAt: NOW }, { exerciseId: GARAGE.exerciseId, addedAt: NOW }]);
    assert.equal(U.isFavourite(f.favourites, GARAGE.exerciseId), true);
    const off = U.toggleFavourite(f.favourites, "bench_press_barbell_flat");
    assert.equal(off.favourite, false);
    assert.deepEqual(off.favourites.map((x) => x.exerciseId), [GARAGE.exerciseId]);
    assert.equal(U.toggleFavourite([], "Zła wartość!").code, "FAVOURITE_ID_INVALID");
    const n = U.normalizeFavourites([{ exerciseId: "bench_press_barbell_flat", addedAt: NOW }, { exerciseId: "bench_press_barbell_flat", addedAt: NOW }, { exerciseId: "x y", addedAt: NOW }, { exerciseId: "squat_barbell_back" }]);
    assert.equal(n.favourites.length, 1);
    assert.deepEqual(n.problems.map((p) => p.code), ["FAVOURITE_DUPLICATE", "FAVOURITE_ID_INVALID", "FAVOURITE_DATE_INVALID"]);
  });
  test("materials: https YouTube links and file references only, one main, no files in the data", () => {
    assert.equal(U.isYoutubeUrl("https://www.youtube.com/watch?v=abc"), true);
    assert.equal(U.isYoutubeUrl("https://youtu.be/abc"), true);
    assert.equal(U.isYoutubeUrl("https://m.youtube.com/watch?v=abc"), true);
    for (const bad of ["http://youtube.com/watch?v=a", "https://youtube.com.evil.pl/x", "https://vimeo.com/1", "javascript:alert(1)", "https://user:pw@youtube.com/x", "nie link"]) assert.equal(U.isYoutubeUrl(bad), false, bad);
    const raw = {
      bench_press_barbell_flat: [
        { id: "m1", kind: "youtube", url: "https://youtu.be/abc", title: "Technika", isMain: true, addedAt: NOW },
        { id: "m2", kind: "file", fileRef: "nagranie-1.mp4", title: null, isMain: true, addedAt: NOW },
        { id: "m3", kind: "youtube", url: "https://vimeo.com/1", isMain: false, addedAt: NOW },
        { id: "m4", kind: "file", data: "AAAA", isMain: false, addedAt: NOW },
      ],
      "zły id": [],
    };
    const { media, problems } = U.normalizeExerciseMedia(raw);
    assert.deepEqual(media.bench_press_barbell_flat.map((m) => [m.id, m.isMain]), [["m1", true], ["m2", false]]);
    assert.deepEqual(problems.map((p) => p.code).sort(), ["MEDIA_EXERCISE_INVALID", "MEDIA_FILE_REF_INVALID", "MEDIA_MAIN_DUPLICATE", "MEDIA_URL_INVALID"]);
    assert.equal("data" in media.bench_press_barbell_flat[1], false);
  });
});

describe("9 / 10. the user-exercise part of a copy (engine check)", () => {
  const good = () => ({
    userExercises: [GARAGE, OLD],
    favourites: [{ exerciseId: GARAGE.exerciseId, addedAt: NOW }, { exerciseId: "bench_press_barbell_flat", addedAt: NOW }],
    exerciseNames: NAMES,
    exerciseMedia: { [GARAGE.exerciseId]: [{ id: "m1", kind: "youtube", url: "https://youtu.be/abc", title: "T", isMain: true, addedAt: NOW }] },
  });
  test("a valid copy: ok, links by id kept as they are (UUIDs not re-created)", () => {
    const r = U.userExerciseDataProblems(good(), { atlas, ctx });
    assert.equal(r.ok, true, JSON.stringify(r.problems));
    assert.deepEqual(r.present, ["userExercises", "favourites", "exerciseNames", "exerciseMedia"]);
    assert.deepEqual(r.write.userExercises.map((x) => x.exerciseId), [GARAGE.exerciseId, OLD.exerciseId]);
    assert.deepEqual(r.write.favourites.map((x) => x.exerciseId), [GARAGE.exerciseId, "bench_press_barbell_flat"]);
    assert.deepEqual(Object.keys(r.write.exerciseMedia), [GARAGE.exerciseId]);
    assert.deepEqual(r.dangling, []);
  });
  test("an older copy (no user-exercise fields, or null): ok, nothing to write", () => {
    for (const d of [{ plans: [], history: [] }, { userExercises: null, favourites: null }, {}, null]) {
      const r = U.userExerciseDataProblems(d, { atlas, ctx });
      assert.equal(r.ok, true);
      assert.deepEqual(r.present, []);
      assert.deepEqual(r.write, {});
    }
  });
  test("blocking problems: invalid record, non-UUID id, duplicate id, wrong shapes, name of a non-atlas id → nothing to write", () => {
    const cases = [
      [{ userExercises: [{ ...GARAGE, loadModel: "rakieta" }] }, "LOAD_MODEL_UNKNOWN"],
      [{ userExercises: [{ ...GARAGE, exerciseId: "moje_cwiczenie" }] }, "PRIVATE_ID_INVALID"],
      [{ userExercises: [GARAGE, GARAGE] }, "PRIVATE_ID_DUPLICATE"],
      [{ userExercises: {} }, "PRIVATE_LIST_INVALID"],
      [{ favourites: "x" }, "FAVOURITES_INVALID"],
      [{ exerciseNames: { [GARAGE.exerciseId]: { name: "A", updatedAt: NOW } } }, "NAME_ID_NOT_ATLAS"],
      [{ exerciseMedia: { bench_press_barbell_flat: [{ id: "m", kind: "youtube", url: "https://evil.pl", isMain: false, addedAt: NOW }] } }, "MEDIA_URL_INVALID"],
    ];
    for (const [d, code] of cases) {
      const r = U.userExerciseDataProblems(d, { atlas, ctx });
      assert.equal(r.ok, false, code);
      assert.ok(r.problems.some((p) => p.code === code), `${code}: ${JSON.stringify(r.problems)}`);
      assert.deepEqual(r.write, {});
    }
  });
  test("dangling references (an exercise that will not exist) are reported, not blocking, and left out", () => {
    const d = { ...good(), userExercises: [OLD] };
    const r = U.userExerciseDataProblems(d, { atlas, ctx });
    assert.equal(r.ok, true);
    assert.deepEqual(r.dangling, [{ field: "favourites", exerciseId: GARAGE.exerciseId }, { field: "exerciseMedia", exerciseId: GARAGE.exerciseId }]);
    assert.deepEqual(r.write.favourites.map((x) => x.exerciseId), ["bench_press_barbell_flat"]);
    // a copy without the own-exercise list refers to the current one
    const cur = U.userExerciseDataProblems({ favourites: good().favourites }, { atlas, ctx, currentPrivateIds: [GARAGE.exerciseId] });
    assert.deepEqual(cur.dangling, []);
    assert.equal(cur.write.favourites.length, 2);
  });
});
