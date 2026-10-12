// Shared helpers of the N1 tests: deterministic ids and clocks, snapshots from the SYNTHETIC atlas,
// deep freeze (proves that operations never mutate their input), seeded random numbers.
import { buildLoadSnapshot } from "../../src/engine/load-snapshot.js";
import { baseAtlas } from "../fixtures/atlas/synthetic.mjs";

export function ids(prefix = 4) {
  let n = 0;
  return () => `00000000-0000-${prefix}000-8000-${String(++n).padStart(12, "0")}`;
}

export function clock(start = "2026-10-12T10:00:00.000Z") {
  let t = Date.parse(start);
  return () => new Date((t += 1000)).toISOString();
}

export const ATLAS = baseAtlas();
export function snap(exerciseId, now = "2026-10-12T09:00:00.000Z") {
  const exercise = ATLAS.exercises.find((e) => e.exerciseId === exerciseId);
  if (!exercise) throw new Error(`no synthetic exercise ${exerciseId}`);
  return buildLoadSnapshot({ exercise, atlasVersion: 1, muscles: ATLAS.dictionaries.muscles, now });
}

export function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

export function rng(seed = 7) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
