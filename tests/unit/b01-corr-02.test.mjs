// B01-CORR-02 (19.10.2026) — approved final edits K01 (range of motion in the weighted and band-assisted
// pull-ups) and K02 (one merged spotting point in the barbell bench press). Regression on the real
// repository atlas.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { batch01Of } from "../fixtures/atlas/batch01.mjs";
import { validateAtlas } from "../../src/engine/atlas-validate.js";

// Batch 01 as published (release 1) — since B02-S5 a subset of the repository atlas (fixtures/atlas/batch01.mjs)
const REPO_ATLAS = JSON.parse(readFileSync(new URL("../../src/atlas/atlas.json", import.meta.url), "utf8"));
const ATLAS = batch01Of(REPO_ATLAS);
const byId = (id) => ATLAS.exercises.find((e) => e.exerciseId === id);
const all = (id) => [...byId(id).instructionsPl, ...byId(id).commonMistakesPl, ...byId(id).safetyPl];
const CHANGED = ["bench_press_barbell_flat", "pullup_pronated_weighted", "pullup_pronated_band_assisted"];

describe("B01-CORR-02 — release and scope", () => {
  test("release ≥ 4 with 0 errors; the three corrected cards have changedIn ≥ 4, the other 12 below 4", () => {
    assert.ok(ATLAS.atlasVersion >= 4);
    assert.equal(validateAtlas(ATLAS).summary.errors, 0);
    for (const e of ATLAS.exercises) assert.ok(CHANGED.includes(e.exerciseId) ? e.changedIn >= 4 : e.changedIn < 4, e.exerciseId);
    const lunge = byId("lunge_dumbbell_pair_stationary");
    assert.deepEqual([lunge.namePl, lunge.changedIn], ["Wykroki w miejscu z hantlami", 2]);
  });
});

describe("B01-CORR-02 — K01: tolerated range in the weighted and band-assisted pull-ups", () => {
  test("exact new points; no „do pełnego zwisu” in either card", () => {
    assert.ok(byId("pullup_pronated_weighted").instructionsPl.includes("Opuść się pod kontrolą do wyprostu ramion w zakresie tolerowanym przez barki, nie pozwalając obciążeniu się rozbujać."));
    assert.ok(byId("pullup_pronated_band_assisted").instructionsPl.includes("Opuść się pod kontrolą do wyprostu ramion w zakresie tolerowanym przez barki; kontroluj tempo ruchu i nie wykorzystuj sprężystego odbicia gumy."));
    assert.ok(byId("pullup_pronated_band_assisted").commonMistakesPl.includes("Wyraźne skracanie zakresu ruchu bez uzasadnienia technicznego."));
    for (const id of ["pullup_pronated_weighted", "pullup_pronated_band_assisted"]) assert.doesNotMatch(all(id).join("\n"), /pełnego zwisu|Niepełny zakres ruchu na dole/, id);
  });
  test("the load and band warnings are kept", () => {
    const w = byId("pullup_pronated_weighted");
    assert.match(w.instructionsPl[0], /tylko dodatkowy ciężar.*bez masy ciała/);
    assert.ok(w.commonMistakesPl.includes("Wpisywanie masy ciała razem z dodanym obciążeniem."));
    assert.ok(w.safetyPl.includes("Sprawdź zapięcie pasa i łańcucha przed każdą serią."));
    const b = byId("pullup_pronated_band_assisted");
    assert.ok(b.commonMistakesPl.includes("Traktowanie koloru gumy jako dokładnej wartości asysty w kg."));
    assert.ok(b.commonMistakesPl.includes("Wykorzystywanie sprężystości gumy do odbijania się z dolnej pozycji."));
    assert.ok(b.safetyPl.includes("Przed serią sprawdź gumę pod kątem nacięć i pęknięć."));
    assert.equal(b.safetyPl.length, 3);
  });
});

describe("B01-CORR-02 — K02: one merged spotting point in the barbell bench press", () => {
  test("safetyPl = exactly the merged point and the unchanged full-grip point", () => {
    assert.deepEqual(byId("bench_press_barbell_flat").safetyPl, [
      "Przy ciężkich seriach korzystaj z asekurującej osoby albo odpowiednio ustawionych zabezpieczeń. Stosuj zaciski zgodnie z zasadami bezpieczeństwa stanowiska; nie traktuj zsuwania talerzy jako planowanej metody awaryjnej.",
      "Trzymaj gryf pełnym chwytem, kciukiem obejmującym gryf.",
    ]);
    assert.doesNotMatch(all("bench_press_barbell_flat").join("\n"), /Nie zakładaj zacisków|można wtedy zsunąć/);
  });
});
