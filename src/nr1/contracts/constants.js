// NEXTREP 1.0 (N1) — closed value sets of the contracts (product rules and Progress Engine 2.0).

// RIR categories (product rule): 0 / 0–1 / 1–2 / 2 ("2" = 2 or more, top category). A missing RIR is
// null and is never assumed (D4). Stored exactly as these strings; parsed by src/engine/rir.js.
export const RIR_CATEGORIES = ["0", "0-1", "1-2", "2"];
// Default target RIR of a new working set in a plan: 0–1 (D1, NEXTREP 1.0 default target).
export const DEFAULT_RIR_TARGET = "0-1";

// Workout set types (D5): warm-ups count nowhere; drop sets count in sets and volume, not in
// progression or records.
export const WORKOUT_SET_TYPES = ["working", "warmup", "dropset"];
export const WORKOUT_SET_STATUSES = ["done", "skipped"];
// Planned set types.
export const PLAN_SET_TYPES = ["working", "warmup"];
// Explicit plan status (D3): statistics show exercises of active plans, others are archived.
export const PLAN_STATUSES = ["active", "archived"];

// Plausibility limits of typed values (input sanity, not training advice).
export const LIMITS = {
  kgMax: 1000,
  repsMax: 1000,
  durationMaxSec: 24 * 3600,
  kgDecimals: 3,
};
