// RIR parsing shared by the legacy engine (legacy-progression.js re-exports it) and NEXTREP 1.0.
// Moved verbatim from legacy-progression.js in N1 so that load.js no longer depends on the legacy engine;
// semantics unchanged (tests/unit/engine-rir.test.mjs). Pure function: no React, storage or Supabase.
// Parses an RIR value (new-style range string like "0-1"/"2", or legacy numeric RIR from
// older saved data) into {lo, hi} bounds used for comparisons in the progression engine.
export function parseRirBounds(rir) {
  if (rir === null || rir === undefined || rir === "") return null;
  if (typeof rir === "number") return { lo: rir, hi: rir };
  const s = String(rir).trim();
  if (s === "2") return { lo: 2, hi: 3 }; // "2" = "2 or more" reserve
  const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };
  const n = Number(s);
  if (!Number.isNaN(n)) return { lo: n, hi: n };
  return null;
}
