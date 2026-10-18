// PE-A (A3) — properties of the load engine on deterministic random data, and a regression guard
// against today's computeSessionVolume: the new volume may differ from the old one ONLY where an
// approved decision says so (D2 implements / sides, D5 dropsets and warmups, D8 / P1 no kg).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { exerciseTotals, normalizeLoad, sessionTotals, LOAD_MODELS } from "../../src/engine/load.js";
import { computeSessionVolume } from "../../src/engine/legacy-progression.js";

const N = 3000;
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickFrom = (r, arr) => arr[Math.floor(r() * arr.length)];
const kgString = (r) => {
  const v = Math.round(r() * 2000) / 10; // 0 … 200 kg, one decimal
  return pickFrom(r, [String(v), String(v).replace(".", ","), v]);
};
// well-formed sets as the app saves them (plus empty planned sets)
function cleanSet(r, { types = ["normal"] } = {}) {
  const empty = r() < 0.1;
  return {
    weight: empty ? "" : kgString(r),
    reps: empty ? "" : String(1 + Math.floor(r() * 20)),
    rir: pickFrom(r, ["0", "0-1", "1-2", "2", "", null]),
    setType: pickFrom(r, types),
  };
}
// anything at all
const JUNK = ["", null, undefined, "-5", -3, "abc", NaN, Infinity, "12kg", {}, [], "1e3", " 7 ", "3,5", 0, "0", 1e9];
function messySet(r) {
  return {
    weight: r() < 0.5 ? kgString(r) : pickFrom(r, JUNK),
    loadKg: r() < 0.2 ? pickFrom(r, JUNK) : undefined,
    assistKg: r() < 0.2 ? pickFrom(r, JUNK) : undefined,
    reps: r() < 0.6 ? String(Math.floor(r() * 25)) : pickFrom(r, JUNK),
    duration: r() < 0.3 ? String(Math.floor(r() * 120)) : pickFrom(r, JUNK),
    rir: pickFrom(r, ["0", "0-1", "", null, 3, "x"]),
    setType: pickFrom(r, ["normal", "working", "dropset", "warmup", undefined, "weird"]),
    status: pickFrom(r, [undefined, undefined, "done", "skipped"]),
    done: r() < 0.5,
  };
}
const LATS = ["bilateral", "unilateral", "alternating"];
const CONF = ["verified", "high", "low", "unknown"];
function randomModel(r) {
  return { loadModel: pickFrom(r, Object.keys(LOAD_MODELS)), laterality: pickFrom(r, LATS), confidence: pickFrom(r, CONF), implements: pickFrom(r, [undefined, 1, 2, 3, 0, -1]) };
}
const shuffle = (r, arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const COUNTED = ["workingSets", "progressSets", "dropsetSets", "reps", "repsAllSides", "seconds", "volumeKg", "topExternalKg", "minAssistKg", "rirMissingSets"];
const counted = (t) => Object.fromEntries(COUNTED.map((k) => [k, t[k]]));

describe("properties on random data", () => {
  test(`volume is always finite and ≥ 0, or null only for an unknown model (${N} cases)`, () => {
    const r = rng(1);
    for (let i = 0; i < N; i++) {
      const m = randomModel(r);
      const sets = Array.from({ length: Math.floor(r() * 8) }, () => messySet(r));
      const t = exerciseTotals(sets, m);
      if (t.volumeKg === null) assert.equal(t.volumeStatus, "unavailable");
      else assert.ok(Number.isFinite(t.volumeKg) && t.volumeKg >= 0, JSON.stringify({ m, sets }));
      for (const k of ["workingSets", "reps", "repsAllSides", "seconds"]) assert.ok(Number.isFinite(t[k]) && t[k] >= 0, k);
      assert.ok(t.progressSets <= t.workingSets && t.dropsetSets <= t.workingSets);
      assert.equal(t.progressSets + t.dropsetSets, t.workingSets);
    }
  });
  test(`warmups, skipped and unperformed sets never change any sum (${N} cases)`, () => {
    const r = rng(2);
    for (let i = 0; i < N; i++) {
      const m = randomModel(r);
      const sets = Array.from({ length: 1 + Math.floor(r() * 6) }, () => cleanSet(r, { types: ["normal", "dropset"] }));
      const noise = [
        { ...cleanSet(r), setType: "warmup" },
        { ...cleanSet(r), status: "skipped" },
        { weight: "", reps: "0", duration: "", setType: "dropset" },
        { weight: "", reps: "", setType: "normal" },
      ];
      // kg typed without reps is an unperformed set — except for sets-only exercises, where the
      // field marks a done set (today's isSetPerformed)
      if (m.loadModel !== "sets_only") noise.push({ weight: kgString(r), reps: "", setType: "normal" });
      const a = exerciseTotals(sets, m);
      const b = exerciseTotals(shuffle(r, [...sets, ...noise]), m);
      assert.deepEqual(counted(b), counted(a));
    }
  });
  test(`the order of sets never changes the totals (${N} cases)`, () => {
    const r = rng(3);
    for (let i = 0; i < N; i++) {
      const m = randomModel(r);
      const sets = Array.from({ length: Math.floor(r() * 8) }, () => messySet(r));
      assert.deepEqual(exerciseTotals(shuffle(r, sets), m), exerciseTotals(sets, m));
    }
  });
  test(`per side = 2 × the same set counted bilaterally; alternating = bilateral volume (${N} cases)`, () => {
    const r = rng(4);
    for (let i = 0; i < N; i++) {
      const loadModel = pickFrom(r, ["barbell_total", "dumbbell_pair", "dumbbell_single", "kettlebell_pair", "cable", "machine_stack", "bodyweight_plus"]);
      const s = cleanSet(r);
      const bi = normalizeLoad(s, { loadModel, confidence: "high" });
      const uni = normalizeLoad(s, { loadModel, confidence: "high", laterality: "unilateral" });
      const alt = normalizeLoad(s, { loadModel, confidence: "high", laterality: "alternating" });
      assert.ok(Math.abs(uni.volumeKg - 2 * bi.volumeKg) < 1e-9);
      assert.ok(Math.abs(alt.volumeKg - bi.volumeKg) < 1e-9);
      assert.equal(uni.reps, bi.reps); // one set, reps as typed — never doubled into two sets
    }
  });
  // AT3.2c (AT3-D19): cardio is kept out of these sums and reported in its own block.
  test(`sessionTotals is exactly the sum of exerciseTotals; cardio apart (${N} cases)`, () => {
    const r = rng(5);
    for (let i = 0; i < N; i++) {
      const models = Array.from({ length: 1 + Math.floor(r() * 5) }, () => randomModel(r));
      const session = { exercises: models.map((m, k) => ({ exerciseId: String(k), sets: Array.from({ length: Math.floor(r() * 5) }, () => messySet(r)) })) };
      const s = sessionTotals(session, (ex) => models[Number(ex.exerciseId)]);
      const strength = s.exercises.filter((e) => e.model.unit !== "cardio");
      const cardio = s.exercises.filter((e) => e.model.unit === "cardio");
      for (const k of ["workingSets", "reps", "repsAllSides", "seconds"]) assert.equal(s[k], strength.reduce((a, e) => a + e.totals[k], 0));
      assert.equal(s.cardio.durationSec, cardio.reduce((a, e) => a + e.totals.durationSec, 0));
      assert.equal(s.cardio.sets, cardio.reduce((a, e) => a + e.totals.workingSets, 0));
      const sum = s.exercises.reduce((a, e) => a + (e.totals.volumeKg ?? 0), 0);
      assert.ok(Math.abs(s.volumeKg - sum) <= 1e-3 + 1e-12 * Math.abs(sum), `${s.volumeKg} vs ${sum}`);
    }
  });
  test(`today's fields and v2 fields with the same numbers give the same totals (${N} cases)`, () => {
    const r = rng(6);
    for (let i = 0; i < N; i++) {
      const m = randomModel(r);
      const today = Array.from({ length: 1 + Math.floor(r() * 5) }, () => cleanSet(r, { types: ["normal", "dropset"] }));
      const assist = m.loadModel === "assisted";
      const v2 = today.map((s) => ({ [assist ? "assistKg" : "loadKg"]: s.weight, reps: s.reps === "" ? null : Number(s.reps), rir: s.rir, setType: s.setType === "normal" ? "working" : s.setType, status: s.reps === "" ? undefined : "done" }));
      assert.deepEqual(counted(exerciseTotals(v2, m)), counted(exerciseTotals(today, m)));
    }
  });
});

describe("regression guard against today's computeSessionVolume", () => {
  const close = (a, b) => Math.abs(a - b) < 1e-6;
  test(`barbell, machine, cable without dropsets: new volume = today's volume (${N} cases)`, () => {
    const r = rng(7);
    for (let i = 0; i < N; i++) {
      const loadModel = pickFrom(r, ["barbell_total", "machine_stack", "plate_loaded", "cable", "bodyweight_plus"]);
      const sets = Array.from({ length: Math.floor(r() * 7) }, () => cleanSet(r));
      const legacyKind = loadModel === "bodyweight_plus" ? "bodyweightPlus" : "weight";
      assert.ok(close(exerciseTotals(sets, { loadModel, confidence: "high" }).volumeKg, computeSessionVolume(sets, legacyKind)), JSON.stringify(sets));
    }
  });
  test(`bodyweight and time: today's "volume" (reps / seconds) = the new main-unit sum (${N} cases)`, () => {
    const r = rng(8);
    for (let i = 0; i < N; i++) {
      const sets = Array.from({ length: Math.floor(r() * 7) }, () => ({ ...cleanSet(r), duration: String(Math.floor(r() * 90)) }));
      assert.equal(exerciseTotals(sets, { loadModel: "bodyweight", confidence: "high" }).reps, computeSessionVolume(sets, "bodyweight"));
      assert.equal(exerciseTotals(sets, { loadModel: "time", confidence: "high" }).seconds, computeSessionVolume(sets, "time", true));
    }
  });
  test(`differences only where decided: D5 dropsets added, D2 two dumbbells ×2, sides ×2 (${N} cases)`, () => {
    const r = rng(9);
    for (let i = 0; i < N; i++) {
      const sets = Array.from({ length: Math.floor(r() * 7) }, () => cleanSet(r, { types: ["normal", "normal", "dropset"] }));
      const drops = sets.filter((s) => s.setType === "dropset");
      const legacy = computeSessionVolume(sets, "weight"); // dropsets excluded today
      const dropPart = computeSessionVolume(drops.map((s) => ({ ...s, setType: "normal" })), "weight");
      assert.ok(close(exerciseTotals(sets, { loadModel: "barbell_total", confidence: "high" }).volumeKg, legacy + dropPart));
      assert.ok(close(exerciseTotals(sets, { loadModel: "dumbbell_pair", confidence: "high" }).volumeKg, 2 * (legacy + dropPart)));
      assert.ok(close(exerciseTotals(sets, { loadModel: "dumbbell_single", laterality: "unilateral", confidence: "high" }).volumeKg, 2 * (legacy + dropPart)));
      for (const lm of ["bodyweight", "assisted", "band"]) assert.equal(exerciseTotals(sets, { loadModel: lm, confidence: "high" }).volumeKg, 0);
    }
  });
});
