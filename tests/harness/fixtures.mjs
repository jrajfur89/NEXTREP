// Small data builders shared by the suites. Shapes mirror what index.html stores
// (session = { id, date, planId?, exercises: [{ exerciseId, type, setsDetail?, sets: [...] }] }).
export const W = (weight, reps, rir = "", extra = {}) => ({ weight: String(weight), reps: String(reps), rir, ...extra });
export const BW = (reps, rir = "") => ({ weight: "", reps: String(reps), rir });
export const T = (duration, rir = "") => ({ duration: String(duration), rir });
export const DROP = (weight, reps) => ({ weight: String(weight), reps: String(reps), setType: "dropset" });
export const plan = (...targets) => targets.map((target, i) => ({ id: `s${i}`, target, rir: "" }));

let seq = 0;
export function session(date, exercises, extra = {}) {
  seq += 1;
  return { id: extra.id || `sess-${seq}`, date: new Date(date).toISOString(), exercises, ...extra };
}
export const ex = (exerciseId, type, sets, setsDetail = undefined) => ({ id: `we-${exerciseId}-${Math.random().toString(36).slice(2, 7)}`, exerciseId, name: exerciseId, type, sets, setsDetail });

// History for computeExerciseAnalysis: most recent first.
export const hist = (...perfs) => perfs.map(([sets, date]) => ({ sets, date: date ? new Date(date).toISOString() : null }));

// Silences the production "[sync diag]" / "[push diag]" console.log noise while fn runs.
export async function quiet(fn) {
  const orig = console.log;
  console.log = (...a) => {
    if (typeof a[0] === "string" && /\[(sync|push|pull) diag\]/.test(a[0])) return;
    orig(...a);
  };
  try {
    return await fn();
  } finally {
    console.log = orig;
  }
}
