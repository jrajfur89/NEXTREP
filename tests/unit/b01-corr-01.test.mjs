// B01-CORR-01 (19.10.2026) — approved corrections U01–U12 and U14–U16 of the Batch 01 cards; U13
// rejected (the lunge keeps its name). Regression on the real repository atlas: the removed advice must
// not come back, the corrected cards stay consistent, and nothing outside the card text changed.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateAtlas } from "../../src/engine/atlas-validate.js";

const ATLAS = JSON.parse(readFileSync(new URL("../../src/atlas/atlas.json", import.meta.url), "utf8"));
const byId = (id) => ATLAS.exercises.find((e) => e.exerciseId === id);
const text = (id) => [...byId(id).instructionsPl, ...byId(id).commonMistakesPl, ...byId(id).safetyPl].join("\n");
const CORRECTED = [
  "squat_barbell_back", "squat_barbell_front", "deadlift_barbell_conventional", "bench_press_barbell_flat", "bench_press_dumbbell_pair_flat",
  "overhead_press_barbell_standing", "row_barbell_bent_over_pronated", "row_dumbbell_single_bench_supported", "pullup_pronated_bodyweight",
  "pullup_pronated_weighted", "pullup_pronated_band_assisted", "curl_dumbbell_pair_standing", "plank_forearm", "hanging_knee_raise",
];

describe("B01-CORR-01 — release and scope", () => {
  test("release ≥ 3, 0 validator errors; the 14 corrected cards have changedIn ≥ 3 (later corrections may raise it), the lunge keeps changedIn 2", () => {
    assert.ok(ATLAS.atlasVersion >= 3);
    assert.equal(validateAtlas(ATLAS).summary.errors, 0);
    for (const e of ATLAS.exercises) assert.ok(CORRECTED.includes(e.exerciseId) ? e.changedIn >= 3 : e.changedIn === 2, e.exerciseId);
    for (const e of ATLAS.exercises) assert.deepEqual([e.entryRev, e.introducedIn, e.approvedIn], [1, 1, "NEXTREP-F2.3-BATCH01-2026-10-12"], e.exerciseId);
  });
});

describe("B01-CORR-01 — regressions", () => {
  test("U01: the bench press card never advises training without collars to slide the plates off", () => {
    const t = text("bench_press_barbell_flat");
    assert.doesNotMatch(t, /Nie zakładaj zacisków|można wtedy zsunąć/);
    // U01 text merged into one point by B01-CORR-02 (K02); the intent stays
    assert.match(byId("bench_press_barbell_flat").safetyPl.join(" "), /nie traktuj zsuwania talerzy jako planowanej metody awaryjnej/);
  });
  test("U02: the front squat card has no unconditional instruction to dump the bar", () => {
    assert.doesNotMatch(text("squat_barbell_front"), /odrzuć sztangę|zrzuć sztangę/);
    assert.match(byId("squat_barbell_front").safetyPl.join(" "), /Przed serią upewnij się, jak bezpiecznie zakończyć nieudane powtórzenie\./);
    assert.match(byId("squat_barbell_front").instructionsPl.join(" "), /bez uciskania szyi/); // U05
  });
  test("U10: the pull-up card asks for a tolerated range, and no mistake contradicts it", () => {
    const t = text("pullup_pronated_bodyweight");
    assert.doesNotMatch(t, /pełnego zwisu|pełny zwis/);
    assert.match(byId("pullup_pronated_bodyweight").instructionsPl.join(" "), /w zakresie tolerowanym przez barki/);
  });
  test("U15: the plank card never requires a literal straight line (instructions, mistakes, safety)", () => {
    const t = text("plank_forearm");
    assert.doesNotMatch(t, /lini[aię] prost|prost[aąej]+ lini/i);
    assert.match(byId("plank_forearm").instructionsPl.join(" "), /bez nadmiernego wygięcia lędźwi/);
    assert.match(byId("plank_forearm").safetyPl.join(" "), /stabilnego ustawienia głowy, tułowia i miednicy/);
  });
  test("U13 rejected: the lunge keeps its name, aliases and identity", () => {
    const l = byId("lunge_dumbbell_pair_stationary");
    assert.deepEqual([l.namePl, l.aliasesPl, l.familyId, l.loadModel, l.laterality, l.repsCounting], ["Wykroki w miejscu z hantlami", ["Stationary dumbbell lunges", "Wykroki z hantlami w miejscu"], "lunge", "dumbbell_pair", "unilateral", "per_side"]);
  });
  test("U09, U11, U16: dumbbell row allows feet on the floor; weighted pull-up states added load first; knee raise height is adjustable", () => {
    assert.match(byId("row_dumbbell_single_bench_supported").instructionsPl[0], /obie stopy na podłodze/);
    assert.doesNotMatch(byId("row_dumbbell_single_bench_supported").safetyPl.join(" "), /oprzyj na niej kolano i dłoń\./);
    const w = byId("pullup_pronated_weighted").instructionsPl;
    assert.match(w[0], /tylko dodatkowy ciężar.*bez masy ciała/);
    assert.equal(w.filter((p) => /bez masy ciała/.test(p)).length, 1, "stated once in the instructions");
    assert.match(byId("hanging_knee_raise").instructionsPl.join(" "), /dostosowaną do swoich możliwości/);
    assert.doesNotMatch(text("hanging_knee_raise"), /tylko do poziomu bioder/);
  });
});
