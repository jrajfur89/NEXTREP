// B02 / S1 — full exercise card (AT3-D12 A): instructionsPl, commonMistakesPl, safetyPl.
// Every case goes through the REAL validator (validateAtlas on the real Batch 01 atlas, or
// validateExercise with the real dictionaries for private records) — no mocks of the rules.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateAtlas, validateExercise } from "../../src/engine/atlas-validate.js";
import {
  EXERCISE_FIELDS, CALC_FIELDS, INTERPRETATION_FIELDS, CARD_CONTENT_FIELDS, CARD_CONTENT_LIMITS,
  cardContentProblems, readCardContent,
} from "../../src/engine/atlas-schema.js";

const ATLAS = JSON.parse(readFileSync(new URL("../../src/atlas/atlas.json", import.meta.url), "utf8"));
const clone = (x) => structuredClone(x);
const FIRST = ATLAS.exercises[0].exerciseId;
const CARD = {
  instructionsPl: ["Ustaw stopy na szerokość bioder.", "Opuść gryf pod kontrolą."],
  commonMistakesPl: ["Odrywanie pośladków od ławki."],
  safetyPl: ["Przy ciężkich seriach używaj asekuracji."],
};

// the real atlas with one card-field value on the first exercise (no other change)
function withField(field, value, id = FIRST) {
  const a = clone(ATLAS);
  a.exercises.find((x) => x.exerciseId === id)[field] = value;
  return a;
}
const t5 = (r) => r.issues.filter((i) => i.rule === "T5");
const t5codes = (r) => t5(r).map((i) => i.code);

// private record = a Batch 01 exercise with private scope, checked with the real dictionaries
function privateCtx(atlas = ATLAS) {
  const byCode = (list) => new Map(list.map((v) => [v.code, v]));
  return {
    dict: { equipment: byCode(atlas.dictionaries.equipment), muscles: byCode(atlas.dictionaries.muscles), variantAttributes: byCode(atlas.dictionaries.variantAttributes) },
    families: new Map(atlas.families.map((f) => [f.familyId, f])),
    mode: "private",
  };
}
function checkPrivate(rec) {
  const issues = [];
  validateExercise(rec, privateCtx(), (level, rule, code, where, field, message) => issues.push({ level, rule, code, field, message }));
  return issues;
}
const privateBase = () => {
  const r = clone(ATLAS.exercises[0]);
  r.scope = "private";
  r.exerciseId = "my_press_private";
  delete r.approvedIn;
  return r;
};

describe("B02/S1 schema: closed schema accepts the three card fields", () => {
  test("the three fields are in EXERCISE_FIELDS, the old fields are kept", () => {
    for (const f of CARD_CONTENT_FIELDS) assert.ok(EXERCISE_FIELDS.includes(f), f);
    assert.ok(EXERCISE_FIELDS.includes("tipsPl"), "tipsPl stays");
    assert.deepEqual(CARD_CONTENT_FIELDS, ["instructionsPl", "commonMistakesPl", "safetyPl"]);
    assert.deepEqual({ ...CARD_CONTENT_LIMITS }, { minItems: 1, maxItems: 10, maxItemLength: 300 });
  });
  test("card fields are editorial: never in CALC_FIELDS or INTERPRETATION_FIELDS", () => {
    for (const f of CARD_CONTENT_FIELDS) {
      assert.ok(!CALC_FIELDS.includes(f), `${f} not in CALC_FIELDS`);
      assert.ok(!INTERPRETATION_FIELDS.includes(f), `${f} not in INTERPRETATION_FIELDS`);
    }
  });
  test("a still-unknown field is still rejected (schema stays closed)", () => {
    const r = validateAtlas(withField("instructionPl", ["x"]));
    assert.ok(r.issues.some((i) => i.code === "UNKNOWN_FIELD" && i.field === "instructionPl"));
    assert.equal(r.ok, false);
  });
});

describe("B02/S1 Batch 01 compatibility (since S4: Batch 01 has its cards)", () => {
  test("the real Batch 01 atlas validates with 0 errors and no T5 issues; every record has the three fields (S4)", () => {
    const r = validateAtlas(ATLAS);
    assert.equal(r.ok, true);
    assert.equal(r.summary.errors, 0);
    assert.deepEqual(t5(r), []);
    assert.ok(ATLAS.exercises.every((x) => CARD_CONTENT_FIELDS.every((f) => Array.isArray(x[f]) && x[f].length > 0)), "B01 cards present (S4)");
  });
  test("a system record with all three valid fields passes (no new errors, warnings unchanged)", () => {
    const a = clone(ATLAS);
    Object.assign(a.exercises[0], clone(CARD));
    const r = validateAtlas(a);
    const base = validateAtlas(ATLAS);
    assert.equal(r.ok, true);
    assert.deepEqual(t5(r), []);
    assert.equal(r.summary.warnings, base.summary.warnings);
  });
  test("since S4 a system record without one of the fields is rejected (CARD_CONTENT_REQUIRED)", () => {
    for (const f of CARD_CONTENT_FIELDS) {
      const a = clone(ATLAS);
      delete a.exercises[0][f];
      const hit = t5(validateAtlas(a)).filter((i) => i.code === "CARD_CONTENT_REQUIRED");
      assert.deepEqual(hit.map((i) => [i.level, i.field, i.exerciseId]), [["error", f, FIRST]], f);
    }
  });
  test("validation never changes the record", () => {
    const a = withField("instructionsPl", ["  ze spacjami  ", "drugi"]);
    const before = clone(a);
    validateAtlas(a);
    assert.deepEqual(a, before);
  });
});

describe("B02/S1 system records: invalid content is an error (T5)", () => {
  const cases = [
    ["not a list (string)", "Jeden tekst", "CARD_CONTENT_TYPE"],
    ["null", null, "CARD_CONTENT_TYPE"],
    ["an object", { a: 1 }, "CARD_CONTENT_TYPE"],
    ["empty list [] (absent field is the only allowed empty)", [], "CARD_CONTENT_EMPTY"],
    ["a non-string point", ["ok", 7], "CARD_ITEM_TYPE"],
    ["an empty point", ["ok", ""], "CARD_ITEM_EMPTY"],
    ["a whitespace-only point", ["ok", "   \t "], "CARD_ITEM_EMPTY"],
    ["duplicate after trimming", ["Trzymaj łopatki.", "  Trzymaj łopatki.  "], "CARD_ITEM_DUPLICATE"],
    ["11 points", Array.from({ length: 11 }, (_, i) => `Punkt ${i + 1}`), "CARD_CONTENT_TOO_MANY"],
    ["a 301-character point", ["a".repeat(301)], "CARD_ITEM_TOO_LONG"],
  ];
  for (const f of CARD_CONTENT_FIELDS) {
    for (const [label, value, code] of cases) {
      test(`${f}: ${label} → ${code}`, () => {
        const r = validateAtlas(withField(f, value));
        const hit = t5(r).find((i) => i.code === code);
        assert.ok(hit, `expected ${code}, got ${JSON.stringify(t5codes(r))}`);
        assert.equal(hit.level, "error");
        assert.equal(hit.field, f);
        assert.equal(hit.exerciseId, FIRST);
        assert.ok(hit.message.length > 0);
        assert.equal(r.ok, false);
      });
    }
  }
  test("limits are inclusive: exactly 10 points and exactly 300 characters (trimmed) pass", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `Punkt ${i + 1}`);
    assert.equal(validateAtlas(withField("instructionsPl", ten)).ok, true);
    assert.equal(validateAtlas(withField("instructionsPl", ["b".repeat(300)])).ok, true);
    assert.equal(validateAtlas(withField("instructionsPl", ["  " + "b".repeat(300) + "  "])).ok, true, "length is counted after trimming");
    assert.equal(validateAtlas(withField("instructionsPl", ["Jeden punkt"])).ok, true, "1 point is the minimum");
  });
  test("each problem names the point (Polish message with its number)", () => {
    const r = validateAtlas(withField("commonMistakesPl", ["ok", "", "ok"]));
    assert.deepEqual(t5codes(r).sort(), ["CARD_ITEM_DUPLICATE", "CARD_ITEM_EMPTY"]);
    assert.match(t5(r).find((i) => i.code === "CARD_ITEM_EMPTY").message, /Punkt 2/);
    assert.match(t5(r).find((i) => i.code === "CARD_ITEM_DUPLICATE").message, /Punkt 3/);
  });
});

describe("B02/S1 entryRev: editing the card text does not need entryRev and does not reinterpret history", () => {
  const release = (a, v) => { a.atlasVersion = v; return a; };
  test("adding the card to an existing exercise without raising entryRev: valid against the previous release", () => {
    const prev = clone(ATLAS);
    const next = release(clone(ATLAS), ATLAS.atlasVersion + 1);
    Object.assign(next.exercises[0], clone(CARD));
    const r = validateAtlas(next, { previous: prev });
    assert.equal(r.ok, true, JSON.stringify(r.issues.filter((i) => i.level === "error")));
    assert.ok(!r.issues.some((i) => ["ENTRY_REV_NOT_BUMPED", "LOAD_INTERPRETATION_CHANGED"].includes(i.code)));
    assert.equal(next.exercises[0].entryRev, prev.exercises[0].entryRev);
  });
  test("editing and removing points later, still without raising entryRev: valid", () => {
    const prev = release(clone(ATLAS), ATLAS.atlasVersion + 1);
    Object.assign(prev.exercises[0], clone(CARD));
    const next = release(clone(prev), prev.atlasVersion + 1);
    next.exercises[0].instructionsPl = ["Poprawiony punkt instrukcji."];
    next.exercises[0].safetyPl = ["Nowa wskazówka bezpieczeństwa.", "Druga wskazówka."];
    const r = validateAtlas(next, { previous: prev });
    assert.equal(r.ok, true, JSON.stringify(r.issues.filter((i) => i.level === "error")));
  });
  test("control: a calculation field changed without entryRev is still rejected (I5 active)", () => {
    const prev = clone(ATLAS);
    const next = release(clone(ATLAS), ATLAS.atlasVersion + 1);
    next.exercises[0].loadIncrementKg = 1.25;
    Object.assign(next.exercises[0], clone(CARD));
    const r = validateAtlas(next, { previous: prev });
    assert.ok(r.issues.some((i) => i.code === "ENTRY_REV_NOT_BUMPED"));
  });
});

describe("B02/S1 private records: optional fields, lenient handling", () => {
  test("an older private record without the card fields has no T5 issue", () => {
    const issues = checkPrivate(privateBase());
    assert.deepEqual(issues.filter((i) => i.rule === "T5"), []);
    assert.ok(!issues.some((i) => i.code === "UNKNOWN_FIELD"));
  });
  test("a private record with valid card fields has no T5 issue", () => {
    const rec = Object.assign(privateBase(), clone(CARD));
    assert.deepEqual(checkPrivate(rec).filter((i) => i.rule === "T5"), []);
  });
  test("invalid card content in a private record is a WARNING, never an error", () => {
    const rec = Object.assign(privateBase(), { instructionsPl: "tekst", commonMistakesPl: [], safetyPl: ["x", "x", 5, "c".repeat(301)] });
    const t = checkPrivate(rec).filter((i) => i.rule === "T5");
    assert.deepEqual(t.map((i) => i.code).sort(), ["CARD_CONTENT_EMPTY", "CARD_CONTENT_TYPE", "CARD_ITEM_DUPLICATE", "CARD_ITEM_TOO_LONG", "CARD_ITEM_TYPE"]);
    assert.ok(t.every((i) => i.level === "warning"));
  });
  test("the check does not change the private record (id, entryRev, loadModel untouched)", () => {
    const rec = Object.assign(privateBase(), { instructionsPl: "tekst", safetyPl: [" a ", "a"] });
    const before = clone(rec);
    checkPrivate(rec);
    assert.deepEqual(rec, before);
  });
});

describe("B02/S1 helpers", () => {
  test("cardContentProblems: absent field → no problems; valid list → no problems", () => {
    assert.deepEqual(cardContentProblems(undefined), []);
    assert.deepEqual(cardContentProblems(["a", "b"]), []);
  });
  test("readCardContent: lenient copy of the valid points, never mutates, never throws", () => {
    const rec = { instructionsPl: ["  A  ", "A", "", 3, "B", "c".repeat(301)], commonMistakesPl: "tekst", safetyPl: null };
    const before = clone(rec);
    const c = readCardContent(rec);
    assert.deepEqual(c, { instructionsPl: ["A", "B"], commonMistakesPl: [], safetyPl: [] });
    assert.deepEqual(rec, before);
    assert.ok(Object.isFrozen(c) && Object.isFrozen(c.instructionsPl));
    assert.deepEqual(readCardContent(undefined), { instructionsPl: [], commonMistakesPl: [], safetyPl: [] });
    assert.deepEqual(readCardContent(ATLAS.exercises[0]), { instructionsPl: ATLAS.exercises[0].instructionsPl, commonMistakesPl: ATLAS.exercises[0].commonMistakesPl, safetyPl: ATLAS.exercises[0].safetyPl });
    assert.equal(readCardContent({ instructionsPl: Array.from({ length: 12 }, (_, i) => `p${i}`) }).instructionsPl.length, 10);
  });
});
