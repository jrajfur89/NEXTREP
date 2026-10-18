// AT3.2a — resolver, search and facets of the atlas (src/engine/atlas-index.js).
// Real data: the published Batch 01 (src/atlas/atlas.json). Scale: a synthetic atlas of 390 exercises
// built here from the Batch 01 templates (26 copies with a letter suffix, one copy archived), checked
// with the F2 validator. The synthetic atlas lives only in memory; nothing is written.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAtlasIndex, ATLAS_FACET_DIMENSIONS } from "../../src/engine/atlas-index.js";
import { validateAtlas } from "../../src/engine/atlas-validate.js";
import { ATLAS_RELEASE } from "../../src/engine/atlas-release.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BATCH01 = JSON.parse(readFileSync(resolve(ROOT, "src/atlas/atlas.json"), "utf8"));
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const ARCHIVED_LETTER = "z";

function syntheticAtlas() {
  const a = structuredClone(BATCH01);
  a.families = [];
  a.exercises = [];
  a.issuedIds = [];
  for (const s of LETTERS) {
    const S = s.toUpperCase();
    for (const f of BATCH01.families) a.families.push({ ...f, familyId: `${f.familyId}_${s}`, namePl: `${f.namePl} ${S}` });
    for (const e of BATCH01.exercises) {
      const x = structuredClone(e);
      x.exerciseId = `${e.exerciseId}_${s}`;
      x.familyId = `${e.familyId}_${s}`;
      x.namePl = `${e.namePl} ${S}`;
      x.aliasesPl = e.aliasesPl.map((al) => `${al} ${S}`);
      if (s === ARCHIVED_LETTER) {
        x.status = "archived";
        x.archivedReason = "Synthetic archive (scale test)";
        x.successorHint = `${e.exerciseId}_y`;
      }
      a.exercises.push(x);
      a.issuedIds.push(x.exerciseId);
    }
  }
  return a;
}

const ids = (list) => list.map((e) => e.exerciseId);
const facet = (f, dim) => Object.fromEntries(f[dim].map((v) => [v.code, v.count]));

describe("AT3.2a — Batch 01: resolver", () => {
  const ix = buildAtlasIndex(BATCH01);

  test("every Batch 01 exercise resolves by id to its atlas entry", () => {
    assert.equal(ix.size.all, 15);
    for (const e of BATCH01.exercises) assert.deepEqual(ix.resolve(e.exerciseId), e);
  });

  test("unknown, empty and non-string ids → null", () => {
    for (const id of ["nope", "", " squat_barbell_back", "SQUAT_BARBELL_BACK", null, undefined, 42, {}, ["squat_barbell_back"]]) {
      assert.equal(ix.resolve(id), null, String(id));
    }
  });

  test("the released atlas module and the JSON file give the same index", () => {
    const fromRelease = buildAtlasIndex(ATLAS_RELEASE);
    assert.deepEqual(ids(fromRelease.search("")), ids(ix.search("")));
    assert.equal(fromRelease.atlasVersion, BATCH01.atlasVersion);
  });

  test("results are frozen copies; the atlas passed in is not changed", () => {
    const input = structuredClone(BATCH01);
    const before = JSON.stringify(input);
    const i2 = buildAtlasIndex(input);
    const ex = i2.resolve("plank_forearm");
    assert.ok(Object.isFrozen(ex) && Object.isFrozen(ex.primaryMuscles));
    assert.throws(() => { ex.namePl = "x"; }, TypeError);
    input.exercises[0].namePl = "zmienione";
    assert.equal(i2.resolve("squat_barbell_back").namePl, "Przysiad ze sztangą na plecach");
    input.exercises[0].namePl = BATCH01.exercises[0].namePl;
    assert.equal(JSON.stringify(input), before);
    assert.ok(Object.isFrozen(i2));
  });

  test("an empty or missing atlas gives an empty index without errors", () => {
    for (const a of [undefined, null, {}, { exercises: null }]) {
      const e = buildAtlasIndex(a);
      assert.equal(e.size.all, 0);
      assert.equal(e.resolve("squat_barbell_back"), null);
      assert.deepEqual(e.search("przysiad"), []);
      for (const d of ATLAS_FACET_DIMENSIONS) assert.deepEqual(e.facets()[d], []);
    }
  });
});

describe("AT3.2a — Batch 01: search", () => {
  const ix = buildAtlasIndex(BATCH01);

  test("„przysiad” finds both squats (name start first, then Polish name order)", () => {
    assert.deepEqual(ids(ix.search("przysiad")), ["squat_barbell_back", "squat_barbell_front"]);
  });

  test("without Polish letters and case: „wioslowanie”, „WIOSŁOWANIE”, „Wiosłowanie” give the same rows", () => {
    const want = ["row_barbell_bent_over_pronated", "row_dumbbell_single_bench_supported"];
    for (const q of ["wioslowanie", "WIOSŁOWANIE", "Wiosłowanie", "  wiosłowanie  "]) assert.deepEqual(ids(ix.search(q)).sort(), want, q);
  });

  test("aliases: „OHP”, „ohp”, „back squat”, „pull-up”", () => {
    assert.deepEqual(ids(ix.search("OHP")), ["overhead_press_barbell_standing"]);
    assert.deepEqual(ids(ix.search("ohp")), ["overhead_press_barbell_standing"]);
    assert.deepEqual(ids(ix.search("back squat")), ["squat_barbell_back"]);
    // „Pull-up” is the exact alias of the bodyweight pull-up; the other two contain it as a fragment
    const pu = ids(ix.search("pull-up"));
    assert.equal(pu[0], "pullup_pronated_bodyweight");
    assert.deepEqual(pu.slice(1).sort(), ["pullup_pronated_band_assisted", "pullup_pronated_weighted"]);
  });

  test("every word must occur in the name or in one alias; words in any order", () => {
    assert.deepEqual(ids(ix.search("hantli lawce")), ["bench_press_dumbbell_pair_flat"]);
    assert.deepEqual(ids(ix.search("ławce hantli")), ["bench_press_dumbbell_pair_flat"]);
    assert.deepEqual(ids(ix.search("podciaganie gumy")), ["pullup_pronated_band_assisted"]);
    assert.deepEqual(ix.search("przysiad hantle"), []); // words from different exercises
    assert.deepEqual(ix.search("xyz"), []);
  });

  test("ranking: exact name before name prefix before alias before fragment", () => {
    // „Martwy ciąg klasyczny” is an exact alias of the deadlift and a name prefix of nothing else
    assert.deepEqual(ids(ix.search("martwy ciag klasyczny")), ["deadlift_barbell_conventional"]);
    // exact name wins over other name matches
    const r = ids(ix.search("Podciąganie na drążku nachwytem"));
    assert.equal(r[0], "pullup_pronated_bodyweight");
    assert.deepEqual(r.slice(1).sort(), ["pullup_pronated_band_assisted", "pullup_pronated_weighted"]);
  });

  test("empty query = all active exercises in Polish name order", () => {
    const all = ix.search("");
    assert.equal(all.length, 15);
    const names = all.map((e) => e.namePl);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "pl")));
    assert.deepEqual(ids(ix.search("   ")), ids(all));
    assert.deepEqual(ids(ix.search(null)), ids(all));
  });

  test("searching is deterministic", () => {
    assert.deepEqual(ids(ix.search("sztanga")), ids(ix.search("sztanga")));
    assert.deepEqual(ids(buildAtlasIndex(BATCH01).search("hantl")), ids(ix.search("hantl")));
  });
});

describe("AT3.2a — Batch 01: facets and filters", () => {
  const ix = buildAtlasIndex(BATCH01);

  test("facet dimensions of the spec (§4.1) and only values present in the release", () => {
    const f = ix.facets();
    assert.deepEqual(Object.keys(f), [...ATLAS_FACET_DIMENSIONS]);
    assert.deepEqual(facet(f, "angle"), { "angle.flat": 2 });
    assert.deepEqual(facet(f, "grip"), { "grip.pronated": 4 });
    assert.deepEqual(facet(f, "position"), { "position.back_rack": 1, "position.bench_supported": 1, "position.front_rack": 1, "position.standing": 2 });
    assert.deepEqual(facet(f, "laterality"), { bilateral: 13, unilateral: 2 });
    assert.deepEqual(facet(f, "measurementType"), { bodyweight_reps: 4, time: 1, weight_reps: 10 });
    assert.deepEqual(facet(f, "loadModel"), { assisted: 1, barbell_total: 6, bodyweight: 2, bodyweight_plus: 1, dumbbell_pair: 3, dumbbell_single: 1, time: 1 });
    assert.deepEqual(facet(f, "equipment"), { barbell: 6, bench: 3, dumbbell: 4, mat: 1, pullup_bar: 4, rack: 2, resistance_band_assist: 1, weight_belt: 1, weight_plates: 1 });
    assert.equal(f.family.length, 10);
    assert.equal(facet(f, "family").pullup, 3);
  });

  test("counts match the data, label from the dictionaries, nothing selected", () => {
    const f = ix.facets();
    for (const dim of ATLAS_FACET_DIMENSIONS) for (const v of f[dim]) {
      assert.equal(v.selected, false);
      assert.equal(v.count, ix.filter({ [dim]: [v.code] }).length, `${dim}:${v.code}`);
    }
    const eq = Object.fromEntries(f.equipment.map((v) => [v.code, v.label]));
    assert.equal(eq.barbell, "Sztanga");
    assert.equal(Object.fromEntries(f.grip.map((v) => [v.code, v.label]))["grip.pronated"], "Nachwyt");
    assert.equal(Object.fromEntries(f.family.map((v) => [v.code, v.label])).leg_raise, "Unoszenie nóg i kolan");
    assert.equal(f.loadModel[0].label, null); // technical codes are named by the UI
  });

  test("AND between dimensions, OR within a dimension", () => {
    assert.deepEqual(ids(ix.filter({ equipment: ["dumbbell"], angle: ["angle.flat"] })), ["bench_press_dumbbell_pair_flat"]);
    assert.deepEqual(ids(ix.filter({ family: ["squat", "lunge"] })).sort(), ["lunge_dumbbell_pair_stationary", "squat_barbell_back", "squat_barbell_front"]);
    assert.deepEqual(ids(ix.filter({ laterality: ["unilateral"], equipment: ["bench"] })), ["row_dumbbell_single_bench_supported"]);
    assert.deepEqual(ix.filter({ angle: ["angle.flat"], family: ["squat"] }), []);
    assert.equal(ix.filter({}).length, 15);
    assert.equal(ix.filter({ equipment: [] }).length, 15); // empty selection = no filter
  });

  test("query and filters together", () => {
    assert.deepEqual(ids(ix.filter({ equipment: ["barbell"] }, { query: "wioslowanie" })), ["row_barbell_bent_over_pronated"]);
    assert.deepEqual(ids(ix.filter({ grip: ["grip.pronated"] }, { query: "podciaganie" })).length, 3);
  });

  test("a dimension's counts ignore its own selection; selected values are marked", () => {
    const f = ix.facets({ family: ["squat"] });
    assert.deepEqual(facet(f, "family"), facet(ix.facets(), "family")); // own selection ignored
    assert.ok(f.family.find((v) => v.code === "squat").selected);
    assert.deepEqual(facet(f, "equipment"), { barbell: 2, rack: 2 }); // other dimensions narrowed
    assert.deepEqual(facet(f, "angle"), {});
  });

  test("a selected value with no results stays listed with count 0", () => {
    const f = ix.facets({ angle: ["angle.flat"], family: ["squat"] });
    assert.deepEqual(f.angle, [{ code: "angle.flat", label: "Ławka pozioma", count: 0, selected: true }]);
  });

  test("facets follow the query", () => {
    assert.deepEqual(facet(ix.facets({}, { query: "przysiad" }), "position"), { "position.back_rack": 1, "position.front_rack": 1 });
  });

  test("an unknown dimension is a programming error; an unknown value matches nothing", () => {
    assert.throws(() => ix.filter({ muscle: ["quadriceps"] }), /Nieznany wymiar filtra: muscle/);
    assert.throws(() => ix.facets({ category: ["legs"] }), /category/);
    assert.deepEqual(ix.filter({ equipment: ["kettlebell"] }), []);
  });
});

describe("AT3.2a — synthetic atlas of 390 exercises", () => {
  const atlas = syntheticAtlas();
  const ix = buildAtlasIndex(atlas);

  test("the synthetic atlas is a valid atlas (F2 validator: 0 errors), 390 exercises, 15 archived", () => {
    const r = validateAtlas(atlas);
    assert.deepEqual(r.issues.filter((i) => i.level === "error"), []);
    assert.equal(ix.size.all, 390);
    assert.equal(ix.size.active, 375);
  });

  test("resolver: every id, active and archived; unknown → null", () => {
    for (const e of atlas.exercises) assert.equal(ix.resolve(e.exerciseId).exerciseId, e.exerciseId);
    const arch = ix.resolve(`plank_forearm_${ARCHIVED_LETTER}`);
    assert.equal(arch.status, "archived");
    assert.equal(arch.successorHint, "plank_forearm_y");
    assert.equal(ix.resolve("plank_forearm"), null); // Batch 01 id is not in this atlas
  });

  test("search: archived excluded by default, included on request", () => {
    assert.equal(ix.search("przysiad").length, 25 * 2);
    assert.equal(ix.search("przysiad", { includeArchived: true }).length, 26 * 2);
    assert.deepEqual(ids(ix.search("ohp z")), []);
    assert.deepEqual(ids(ix.search("ohp z", { includeArchived: true })), [`overhead_press_barbell_standing_${ARCHIVED_LETTER}`]);
    assert.deepEqual(ids(ix.search("wioslowanie sztanga nachwytem K")), ["row_barbell_bent_over_pronated_k"]);
  });

  test("facets: archived exercises are not counted and archived-only values do not appear", () => {
    const f = ix.facets();
    assert.equal(facet(f, "angle")["angle.flat"], 2 * 25);
    assert.equal(facet(f, "laterality").unilateral, 2 * 25);
    assert.equal(f.family.length, 10 * 25);
    assert.ok(!f.family.some((v) => v.code.endsWith(`_${ARCHIVED_LETTER}`)));
    for (const dim of ATLAS_FACET_DIMENSIONS) for (const v of f[dim]) assert.equal(v.count, ix.filter({ [dim]: [v.code] }).length);
  });

  test("filters at scale: OR within, AND between", () => {
    assert.equal(ix.filter({ equipment: ["dumbbell", "barbell"] }).length, 25 * 10);
    assert.equal(ix.filter({ equipment: ["dumbbell"], laterality: ["unilateral"] }).length, 25 * 2);
    assert.equal(ix.filter({ family: ["row_a", "row_b"], grip: ["grip.pronated"] }).length, 2);
  });

  test("performance: index ≤ 500 ms, 200 searches ≤ 500 ms, 100 facet runs ≤ 1000 ms", () => {
    let t = performance.now();
    const i2 = buildAtlasIndex(atlas);
    assert.ok(performance.now() - t < 500, "build");
    t = performance.now();
    for (let k = 0; k < 200; k++) i2.search(["przysiad", "wioslowanie", "ohp", "hantli lawce"][k % 4]);
    assert.ok(performance.now() - t < 500, "search");
    t = performance.now();
    for (let k = 0; k < 100; k++) i2.facets({ equipment: ["dumbbell"] }, { query: k % 2 ? "" : "wyciskanie" });
    assert.ok(performance.now() - t < 1000, "facets");
  });
});

describe("AT3.2a — scope", () => {
  test("atlas-index.js is pure: no file, storage or atlas.json import; not exported to the app yet", () => {
    const src = readFileSync(resolve(ROOT, "src/engine/atlas-index.js"), "utf8");
    const imports = [...src.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    assert.deepEqual(imports, ["./atlas-schema.js"]);
    assert.doesNotMatch(src, /localStorage|indexedDB|fetch\(|readFile|atlas\.json/);
    assert.doesNotMatch(readFileSync(resolve(ROOT, "src/engine/index.js"), "utf8"), /atlas-index/);
  });
});
