// B02-S5 (decision A, 22.10.2026; import authorised 24.10.2026) — the 40 chest exercises of Batch 02 in
// the repository atlas, release 5. Real atlas, real validator. Batch 01 stays exactly as published.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateAtlas } from "../../src/engine/atlas-validate.js";
import { CARD_CONTENT_FIELDS, CARD_CONTENT_LIMITS } from "../../src/engine/atlas-schema.js";
import { loadModelOptions } from "../../src/engine/load-model-options.js";
import { batch01Of } from "../fixtures/atlas/batch01.mjs";

const ATLAS = JSON.parse(readFileSync(new URL("../../src/atlas/atlas.json", import.meta.url), "utf8"));
const B02 = ATLAS.exercises.filter((e) => e.approvedIn === "NEXTREP-B02-S5-A-2026-10-22");
const byId = (id) => ATLAS.exercises.find((e) => e.exerciseId === id);

describe("B02-S5 — release 5 with Batch 01 and the 40 Batch 02 chest exercises", () => {
  test("55 exercises, 0 validator errors; warnings are only the known kinds", () => {
    assert.ok(ATLAS.atlasVersion >= 5);
    assert.equal(ATLAS.exercises.length, 55);
    const r = validateAtlas(ATLAS);
    assert.deepEqual(r.issues.filter((i) => i.level === "error"), []);
    assert.deepEqual([...new Set(r.issues.filter((i) => i.level === "warning").map((i) => i.code))].sort(), ["FAMILY_SINGLE_EXERCISE", "LOAD_INCREMENT_MISSING"]);
  });
  test("40 B02 records: unique ids, issued, introduced in release 5, entryRev 1, loadIncrementKg null, three valid card lists", () => {
    assert.equal(B02.length, 40);
    assert.equal(new Set(B02.map((e) => e.exerciseId)).size, 40);
    for (const e of B02) {
      assert.ok(ATLAS.issuedIds.includes(e.exerciseId), e.exerciseId);
      assert.deepEqual([e.scope, e.status, e.entryRev, e.introducedIn, e.changedIn, e.loadIncrementKg], ["system", "active", 1, 5, 5, null], e.exerciseId);
      for (const f of CARD_CONTENT_FIELDS) assert.ok(Array.isArray(e[f]) && e[f].length >= 1 && e[f].length <= CARD_CONTENT_LIMITS.maxItems && e[f].every((p) => p.length <= CARD_CONTENT_LIMITS.maxItemLength), `${e.exerciseId}.${f}`);
      assert.ok(typeof e.tipsPl === "string" && e.tipsPl.length > 0, e.exerciseId);
      assert.ok(!("descriptionPl" in e), "descriptionPl stays in the sidecar");
    }
  });
  test("Batch 01 is unchanged: 15 records of release 1, their families and ids", () => {
    const b01 = batch01Of(ATLAS);
    assert.equal(b01.exercises.length, 15);
    assert.ok(b01.exercises.every((e) => e.approvedIn === "NEXTREP-F2.3-BATCH01-2026-10-12" && e.changedIn <= 4));
    assert.deepEqual(ATLAS.issuedIds.slice(0, 15), b01.issuedIds);
  });
  test("approved specifics: renamed band press keeps its old name as alias; machine presses offer stack or plates; Smith uses smith_plates_only", () => {
    const band = byId("chest_press_band_standing");
    assert.equal(band.namePl, "Wyciskanie gumy przed klatkę piersiową w pozycji stojącej");
    assert.deepEqual(band.aliasesPl, ["Wyciskanie gumy stojąc przed klatką"]);
    for (const id of ["chest_press_machine_flat", "chest_press_machine_incline", "chest_press_machine_unilateral"]) assert.deepEqual([...loadModelOptions(byId(id), ATLAS).options], ["machine_stack", "plate_loaded"], id);
    for (const id of ["bench_press_smith_flat", "bench_press_smith_incline", "bench_press_smith_decline"]) assert.equal(byId(id).loadModel, "smith_plates_only", id);
    assert.deepEqual(byId("chest_press_machine_unilateral").repsCounting, "per_side");
  });
});
