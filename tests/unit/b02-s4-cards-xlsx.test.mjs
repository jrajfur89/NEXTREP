// B02 / S4 — the 15 Batch 01 cards (AT3-D12 A) in the repository atlas, the card lists required for
// system records, and the XLSX batch tool keeping the three lists (template v2; v1 files read
// explicitly). Real atlas, real validator, real XLSX files written and read with ExcelJS.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { batch01Of } from "../fixtures/atlas/batch01.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import {
  createTemplate, fillBatch, readBatch, mergeBatch, checkBatch, EXERCISE_COLUMNS, EXERCISE_COLUMNS_V1, CARD_COLUMNS,
  TEMPLATE_VERSION, LEGACY_TEMPLATE_VERSIONS,
} from "../../tools/atlas-xlsx.mjs";
import { validateAtlas, validateExercise } from "../../src/engine/atlas-validate.js";
import { CARD_CONTENT_FIELDS, CARD_CONTENT_LIMITS, CALC_FIELDS } from "../../src/engine/atlas-schema.js";

// Batch 01 as published (release 1) — since B02-S5 a subset of the repository atlas (fixtures/atlas/batch01.mjs)
const REPO_ATLAS = JSON.parse(readFileSync(new URL("../../src/atlas/atlas.json", import.meta.url), "utf8"));
const ATLAS = batch01Of(REPO_ATLAS);
const clone = (x) => structuredClone(x);
const B01 = [
  "squat_barbell_back", "squat_barbell_front", "deadlift_barbell_conventional", "bench_press_barbell_flat", "bench_press_dumbbell_pair_flat",
  "overhead_press_barbell_standing", "row_barbell_bent_over_pronated", "row_dumbbell_single_bench_supported", "pullup_pronated_bodyweight",
  "pullup_pronated_weighted", "pullup_pronated_band_assisted", "lunge_dumbbell_pair_stationary", "curl_dumbbell_pair_standing", "plank_forearm", "hanging_knee_raise",
];
const asBatch = (exercises) => ({ exercises: exercises.map(({ entryRev, introducedIn, changedIn, ...e }) => e) });
const cards = (e) => Object.fromEntries(CARD_CONTENT_FIELDS.map((f) => [f, e[f]]));

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), "nextrep-s4-")); });
after(() => rmSync(dir, { recursive: true, force: true }));
async function writeBatch(name, content, mutate = null) {
  const wb = await createTemplate(ExcelJS);
  fillBatch(wb, content);
  if (mutate) mutate(wb);
  const p = join(dir, name);
  await wb.xlsx.writeFile(p);
  return p;
}
// a genuine version-1 workbook: same layout without the 30 card columns, version 1 in the header
const toV1 = (wb) => {
  wb.getWorksheet("Instrukcja").getCell("B2").value = LEGACY_TEMPLATE_VERSIONS[0];
  wb.getWorksheet("Ćwiczenia").spliceColumns(EXERCISE_COLUMNS_V1.length + 1, CARD_COLUMNS.length);
};

describe("S4 — the 15 Batch 01 cards in the repository atlas", () => {
  test("release ≥ 2 (S4; B01-CORR-01: 3): exactly the 15 Batch 01 exercises, each with the three valid lists; 0 validator errors", () => {
    assert.ok(ATLAS.atlasVersion >= 2);
    assert.deepEqual(ATLAS.exercises.map((e) => e.exerciseId), B01);
    const r = validateAtlas(ATLAS);
    assert.deepEqual(r.issues.filter((i) => i.level === "error"), []);
    assert.deepEqual([r.summary.errors, r.summary.warnings], [0, 17]);
    for (const e of ATLAS.exercises) for (const f of CARD_CONTENT_FIELDS) {
      const v = e[f];
      assert.ok(Array.isArray(v) && v.length >= 1 && v.length <= CARD_CONTENT_LIMITS.maxItems, `${e.exerciseId}.${f} size`);
      assert.ok(v.every((p) => typeof p === "string" && p === p.trim() && p.length > 0 && p.length <= CARD_CONTENT_LIMITS.maxItemLength), `${e.exerciseId}.${f} points`);
      assert.equal(new Set(v).size, v.length, `${e.exerciseId}.${f} unique`);
      assert.ok(!v.some((p) => /\[TEST\]|TODO|TBD|lorem/i.test(p)), `${e.exerciseId}.${f} no placeholder`);
    }
  });
  test("no card is copied between exercises: every instruction list and every full card is different", () => {
    const key = (e) => JSON.stringify(cards(e));
    assert.equal(new Set(ATLAS.exercises.map(key)).size, 15);
    for (const f of CARD_CONTENT_FIELDS) assert.equal(new Set(ATLAS.exercises.map((e) => JSON.stringify(e[f]))).size, 15, f);
  });
  test("heavy barbell lifts mention protection (spotter / safeties) in safetyPl", () => {
    for (const id of ["squat_barbell_back", "squat_barbell_front", "bench_press_barbell_flat"]) {
      assert.match(ATLAS.exercises.find((e) => e.exerciseId === id).safetyPl.join(" "), /asekur|zabezpiecze/i, id);
    }
  });
  test("the card changes kept ids, models, muscles, tips, entryRev, introducedIn and approvedIn; changedIn = a card release (≥ 2)", () => {
    for (const e of ATLAS.exercises) {
      assert.deepEqual([e.entryRev, e.introducedIn, e.approvedIn], [1, 1, "NEXTREP-F2.3-BATCH01-2026-10-12"], e.exerciseId);
      assert.ok(Number.isInteger(e.changedIn) && e.changedIn >= 2 && e.changedIn <= ATLAS.atlasVersion, e.exerciseId);
      assert.ok(typeof e.tipsPl === "string" && e.tipsPl.length > 0);
    }
    assert.deepEqual(ATLAS.issuedIds, B01);
  });
});

describe("S4 — required for system records, optional for private records", () => {
  test("a system record without any one field is rejected; bad points are rejected", () => {
    for (const f of CARD_CONTENT_FIELDS) {
      const a = clone(ATLAS);
      delete a.exercises[3][f];
      const r = validateAtlas(a);
      assert.equal(r.ok, false);
      const hit = r.issues.find((i) => i.code === "CARD_CONTENT_REQUIRED");
      assert.deepEqual([hit.level, hit.rule, hit.field, hit.exerciseId], ["error", "T5", f, "bench_press_barbell_flat"]);
      assert.match(hit.message, /wymaga pełnej karty/);
    }
    for (const [bad, code] of [[[], "CARD_CONTENT_EMPTY"], [["  "], "CARD_ITEM_EMPTY"], [["x".repeat(301)], "CARD_ITEM_TOO_LONG"], [["a", " a "], "CARD_ITEM_DUPLICATE"], [[1], "CARD_ITEM_TYPE"], ["tekst", "CARD_CONTENT_TYPE"]]) {
      const a = clone(ATLAS);
      a.exercises[0].safetyPl = bad;
      const hit = validateAtlas(a).issues.find((i) => i.code === code);
      assert.ok(hit && hit.level === "error", code);
    }
  });
  test("a private record without the fields is accepted; faulty private text → warnings, record unchanged", () => {
    const byCode = (list) => new Map(list.map((v) => [v.code, v]));
    const ctx = { dict: { equipment: byCode(ATLAS.dictionaries.equipment), muscles: byCode(ATLAS.dictionaries.muscles), variantAttributes: byCode(ATLAS.dictionaries.variantAttributes) }, families: new Map(ATLAS.families.map((f) => [f.familyId, f])), mode: "private" };
    const run = (rec) => { const out = []; validateExercise(rec, ctx, (level, rule, code) => out.push({ level, rule, code })); return out.filter((i) => i.rule === "T5"); };
    const bare = clone(ATLAS.exercises[0]);
    Object.assign(bare, { scope: "private", exerciseId: "moje_cwiczenie" });
    for (const f of CARD_CONTENT_FIELDS) delete bare[f];
    assert.deepEqual(run(bare), []);
    const faulty = { ...clone(bare), instructionsPl: "tekst", safetyPl: ["a", "a"] };
    const before = clone(faulty);
    assert.deepEqual(run(faulty).map((i) => [i.level, i.code]), [["warning", "CARD_CONTENT_TYPE"], ["warning", "CARD_ITEM_DUPLICATE"]]);
    assert.deepEqual(faulty, before);
  });
});

describe("S4 — XLSX template v2 keeps the three card lists", () => {
  test("template v2: 10 columns per field after the v1 columns, keys field_1..field_10, no drop-down", async () => {
    assert.equal(TEMPLATE_VERSION, "nextrep-atlas-batch-2");
    assert.deepEqual(EXERCISE_COLUMNS.slice(0, EXERCISE_COLUMNS_V1.length), EXERCISE_COLUMNS_V1);
    assert.deepEqual(CARD_COLUMNS.map((c) => c.key), CARD_CONTENT_FIELDS.flatMap((f) => Array.from({ length: 10 }, (_, i) => `${f}_${i + 1}`)));
    const wb = await createTemplate(ExcelJS);
    const ws = wb.getWorksheet("Ćwiczenia");
    assert.equal(ws.getCell(2, EXERCISE_COLUMNS_V1.length + 1).value, "instructionsPl_1");
    assert.equal(ws.getCell(1, EXERCISE_COLUMNS_V1.length + 1).value, "Instrukcja — punkt 1 *");
    assert.match(String(wb.getWorksheet("Instrukcja").getCell("B8").value), /jedna komórka = jeden punkt/);
  });
  test("round trip atlas → XLSX → atlas for the 15 Batch 01 records: exact lists, nothing else changes", async () => {
    const p = await writeBatch("b01.xlsx", asBatch(ATLAS.exercises));
    const { batch, problems } = await readBatch(ExcelJS, p);
    assert.deepEqual(problems, []);
    assert.equal(batch.cardColumns, true);
    batch.exercises.forEach((e, i) => assert.deepEqual(cards(e), cards(ATLAS.exercises[i]), e.exerciseId));
    const { atlas, changes } = mergeBatch(ATLAS, batch);
    assert.deepEqual([changes.added.length, changes.changed.length, changes.unchanged.length], [0, 0, 15]);
    assert.deepEqual(atlas, ATLAS, "the atlas is byte-for-byte the same object after the round trip");
  });
  test("a multi-point sample with Polish letters, punctuation, separators, quotes and line breaks is kept exactly", async () => {
    const tricky = [
      "Zażółć gęślą jaźń; ŹRÓDŁO — „cudzysłów”, 'apostrof' i \"cudzysłów\".",
      "Punkt z nową linią:\nlinia druga\nlinia trzecia",
      "Separatory: ; , | / \\ \t tabulator, 1/2, 50%, 7,5 kg, (nawiasy) [kwadratowe] {klamry}.",
      "Emoji i symbole: ✓ → ± °",
      "a".repeat(300),
    ];
    const ten = Array.from({ length: 10 }, (_, i) => `Punkt ${i + 1}: ćwicz pod kontrolą; tempo 3-1-1.`);
    const e = { ...clone(ATLAS.exercises[0]), instructionsPl: tricky, commonMistakesPl: ten, safetyPl: ["Jedno; zdanie.\nDrugie zdanie w tej samej komórce."] };
    const p = await writeBatch("tricky.xlsx", asBatch([e]));
    const { batch } = await readBatch(ExcelJS, p);
    assert.deepEqual(cards(batch.exercises[0]), cards(e));
    const r = checkBatch(ATLAS, batch);
    assert.equal(r.ok, true, JSON.stringify(r.issues.filter((i) => i.level === "error")));
    assert.deepEqual(cards(r.atlas.exercises[0]), cards(e));
  });
  test("a v2 row with no point in a field leaves the field out → CARD_CONTENT_REQUIRED (never an empty list)", async () => {
    const e = clone(ATLAS.exercises[0]);
    delete e.commonMistakesPl;
    const { batch } = await readBatch(ExcelJS, await writeBatch("missing.xlsx", asBatch([e])));
    assert.ok(!("commonMistakesPl" in batch.exercises[0]));
    const r = checkBatch(ATLAS, batch);
    assert.equal(r.ok, false);
    assert.ok(r.issues.some((i) => i.code === "CARD_CONTENT_REQUIRED" && i.field === "commonMistakesPl"));
  });
  test("editing only the card text in a batch: new release, entryRev unchanged, valid against the previous release", async () => {
    const edited = clone(ATLAS.exercises);
    edited[0].instructionsPl = [...edited[0].instructionsPl.slice(0, -1), "Odłóż sztangę na oba haki stojaka jednocześnie."];
    const { batch } = await readBatch(ExcelJS, await writeBatch("edit.xlsx", asBatch(edited)));
    const r = checkBatch(ATLAS, batch);
    assert.equal(r.ok, true, JSON.stringify(r.issues.filter((i) => i.level === "error")));
    assert.deepEqual(r.changes.changed, ["squat_barbell_back"]);
    const after = r.atlas.exercises[0];
    assert.deepEqual([after.entryRev, after.changedIn, r.atlas.atlasVersion], [1, ATLAS.atlasVersion + 1, ATLAS.atlasVersion + 1]);
    for (const f of CARD_CONTENT_FIELDS) assert.ok(!CALC_FIELDS.includes(f));
    assert.ok(!r.issues.some((i) => ["ENTRY_REV_NOT_BUMPED", "LOAD_INTERPRETATION_CHANGED"].includes(i.code)));
  });
});

describe("S4 — older v1 batch files are read explicitly", () => {
  test("a v1 file (no card columns) is read without template errors and with a notice", async () => {
    const { batch, problems } = await readBatch(ExcelJS, await writeBatch("v1.xlsx", asBatch(ATLAS.exercises), toV1));
    assert.deepEqual(problems, []);
    assert.deepEqual([batch.templateVersion, batch.cardColumns], ["nextrep-atlas-batch-1", false]);
    assert.ok(batch.exercises.every((e) => CARD_CONTENT_FIELDS.every((f) => !(f in e))), "no card fields read from v1");
    const r = checkBatch(ATLAS, batch);
    assert.ok(r.issues.some((i) => i.code === "BATCH_TEMPLATE_V1_NO_CARDS" && i.level === "info"));
  });
  test("existing exercises keep their atlas cards (never deleted, never invented); unchanged release", async () => {
    const { batch } = await readBatch(ExcelJS, await writeBatch("v1-keep.xlsx", asBatch(ATLAS.exercises), toV1));
    const r = checkBatch(ATLAS, batch);
    assert.equal(r.ok, true, JSON.stringify(r.issues.filter((i) => i.level === "error")));
    assert.deepEqual(r.changes.cardContentKept, B01);
    assert.deepEqual([r.changes.changed.length, r.changes.unchanged.length, r.atlas.atlasVersion], [0, 15, ATLAS.atlasVersion]);
    assert.deepEqual(r.atlas, ATLAS);
  });
  test("a NEW system exercise from a v1 file has no card → rejected with CARD_CONTENT_REQUIRED", async () => {
    const nu = { ...clone(ATLAS.exercises[3]), exerciseId: "bench_press_barbell_paused", namePl: "Wyciskanie sztangi leżąc z pauzą (próba v1)", variantAttributes: [...ATLAS.exercises[3].variantAttributes] };
    const { batch } = await readBatch(ExcelJS, await writeBatch("v1-new.xlsx", asBatch([nu]), toV1));
    const r = checkBatch(ATLAS, batch);
    assert.equal(r.ok, false);
    assert.deepEqual(r.issues.filter((i) => i.code === "CARD_CONTENT_REQUIRED").map((i) => i.field).sort(), [...CARD_CONTENT_FIELDS].sort());
    assert.ok(!("instructionsPl" in r.atlas.exercises.find((e) => e.exerciseId === "bench_press_barbell_paused")));
  });
  test("a foreign template version is still a batch error", async () => {
    const { problems } = await readBatch(ExcelJS, await writeBatch("v9.xlsx", asBatch([]), (wb) => { wb.getWorksheet("Instrukcja").getCell("B2").value = "nextrep-atlas-batch-9"; }));
    assert.ok(problems.some((p) => p.code === "BATCH_TEMPLATE_VERSION"));
  });
});
